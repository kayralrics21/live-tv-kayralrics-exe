"use strict";
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'web','vendor');
fs.mkdirSync(output,{recursive:true});
const files=[
  ['hls.js/dist/hls.min.js','hls.min.js'],
  ['dashjs/dist/modern/umd/dash.all.min.js','dash.all.min.js']
];
for(const [source,destination] of files){
  // Use explicit on-disk paths to avoid package exports-map limitations.
  const fullPath=path.join(root,'node_modules',...source.split('/'));
  if (!fs.existsSync(fullPath)) throw new Error('Missing npm dependency file: '+source+'; run npm install.');
  const target=path.join(output,destination);
  fs.copyFileSync(fullPath,target);
  const bytes=fs.statSync(target).size;
  if(bytes<20000)throw new Error('Unexpectedly small playback library: '+destination);
  console.log('Bundled '+destination+' ('+(bytes/1024).toFixed(1)+' KiB)');
}
