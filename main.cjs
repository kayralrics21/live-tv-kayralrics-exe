"use strict";
const {app, BrowserWindow, Menu, dialog, protocol, net, shell, screen} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');

// A standard scheme gives the application its own localStorage/IndexedDB origin.
// The renderer does not get any Node.js API access.
protocol.registerSchemesAsPrivileged([{
  scheme: 'livetv',
  privileges: {standard: true, supportFetchAPI: true, stream: true}
}]);
app.setAppUserModelId('com.kayralrics.livetv.windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const APP_ORIGIN = 'livetv://app';
let mainWindow;
const assetsDirectory = path.join(__dirname, 'web');
const acceptedAssets = new Set(['index.html', 'vendor/hls.min.js', 'vendor/dash.all.min.js']);

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch (_) { return null; }
}

function registerAssets() {
  protocol.handle('livetv', request => {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.host !== 'app') return new Response('Not found', {status: 404});
      const fileName = decodeURIComponent(requestUrl.pathname).replace(/^\//, '') || 'index.html';
      if (!acceptedAssets.has(fileName)) return new Response('Not found', {status: 404});
      return net.fetch(pathToFileURL(path.join(assetsDirectory, fileName)).toString());
    } catch (_) {
      return new Response('Invalid request', {status: 400});
    }
  });
}

function savedBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf-8'));
    if (![raw.x, raw.y, raw.width, raw.height].every(Number.isFinite)) return undefined;
    if (raw.width < 860 || raw.width > 5000 || raw.height < 620 || raw.height > 3000) return undefined;
    const insideDisplay = screen.getAllDisplays().some(display => {
      const a = display.workArea;
      return raw.x + raw.width > a.x + 100 && raw.x < a.x + a.width - 100 &&
        raw.y + raw.height > a.y + 100 && raw.y < a.y + a.height - 100;
    });
    return insideDisplay ? raw : undefined;
  } catch (_) { return undefined; }
}
function persistBounds(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  try {
    fs.mkdirSync(app.getPath('userData'), {recursive:true});
    fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(bounds));
  } catch (e) { console.warn('Unable to save window bounds:', e.message); }
}

function clickUi(id) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const allowed = new Set(['importBtn','restoreBtn','backupBtn','exportFavBtn','refreshBtn']);
  if (!allowed.has(id)) return;
  mainWindow.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)})?.click()`, true)
    .catch(err => console.warn('Menu action failed:', err.message));
}
function createMenu() {
  const template = [
    {label: 'File', submenu: [
      {label:'Import M3U playlist...', accelerator:'CmdOrCtrl+O', click:()=>clickUi('importBtn')},
      {label:'Restore JSON backup...', accelerator:'CmdOrCtrl+Shift+O', click:()=>clickUi('restoreBtn')},
      {label:'Export JSON backup...', accelerator:'CmdOrCtrl+Shift+S', click:()=>clickUi('backupBtn')},
      {label:'Export favorites as M3U', click:()=>clickUi('exportFavBtn')},
      {type:'separator'},
      {role:'quit', label:'Exit'}
    ]},
    {label:'View', submenu: [
      {label:'Refresh channel catalog', accelerator:'F5', click:()=>clickUi('refreshBtn')},
      {role:'reload', label:'Reload window', accelerator:'CmdOrCtrl+R'},
      {role:'togglefullscreen', label:'Fullscreen', accelerator:'F11'},
      {type:'separator'}, {role:'resetZoom'}, {role:'zoomIn'}, {role:'zoomOut'}
    ]},
    {label:'Help', submenu:[
      {label:'About Live TV', click: () => {
        if (mainWindow) dialog.showMessageBox(mainWindow, {
          type:'info', title:'Live TV', message:'Live TV — Windows Edition',
          detail:'kayralrics.com\n\nFree public streaming catalogs. Some channels may require licenses, subscriptions, or regional access.'
        });
      }}
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const bounds = savedBounds();
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 870,
    minWidth: 900,
    minHeight: 650,
    ...(bounds || {}),
    show:false,
    backgroundColor:'#09090b',
    title:'Live TV | kayralrics.com',
    icon: path.join(__dirname, 'assets', 'live-tv.png'),
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      webSecurity:true,
      webviewTag:false,
      spellcheck:false,
      backgroundThrottling:false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // If a page tries to leave the local app, block it. Only explicit http(s) links
  // may open in the OS browser. A remote site must never inherit app privileges.
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    const external = safeExternalUrl(url);
    if (external) shell.openExternal(external).catch(console.warn);
    return {action:'deny'};
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_ORIGIN + '/')) return;
    event.preventDefault();
    const external = safeExternalUrl(url);
    if (external) shell.openExternal(external).catch(console.warn);
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!url.startsWith(APP_ORIGIN + '/')) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['fullscreen','picture-in-picture'].includes(permission));
  });
  mainWindow.on('close', () => persistBounds(mainWindow));
  mainWindow.on('closed', () => {mainWindow = null;});
  mainWindow.loadURL(APP_ORIGIN+'/index.html').catch(err => {
    dialog.showErrorBox('Live TV failed to launch', err.message);
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {registerAssets(); createMenu(); createWindow();});
  app.on('activate', () => {if (BrowserWindow.getAllWindows().length === 0) createWindow();});
  app.on('window-all-closed', () => app.quit());
}
