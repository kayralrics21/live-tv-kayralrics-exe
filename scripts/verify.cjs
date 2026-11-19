"use strict";
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
function assert(c,m){if(!c) throw Error(m);}
for(const f of ['hls.min.js','dash.all.min.js']) {
  const file=path.join(root,'web/vendor',f);
  assert(fs.existsSync(file),'Missing bundled player: '+f+'. Run npm install.');
  assert(fs.statSync(file).size>20000,'Player bundle too small: '+f);
}
assert(!/cdn\.jsdelivr\.net\/npm\/(hls\.js|dashjs)/.test(html),'Remote JS reference unexpectedly remained');
assert(html.includes('kayralrics.com'),'Brand credit missing');
assert(html.includes("'./vendor/hls.min.js'")&&html.includes("'./vendor/dash.all.min.js'"),'Local player URLs missing');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert(match,'Main script missing');

const hash=crypto.createHash('sha256').update(match[1].replace(/\r\n?/g, '\n')).digest('base64');

assert(html.includes("'sha256-"+hash+"'"),'HTML CSP script hash does not match JS');
const host=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
assert(host.includes('nodeIntegration:false')&&host.includes('sandbox:true')&&host.includes('contextIsolation:true'),'Missing Electron security settings');
console.log('OK: app HTML, CSP, bundled players, branding, and Electron configuration');
