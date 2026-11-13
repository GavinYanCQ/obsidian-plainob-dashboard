'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('./config'),R=require('./resources');

test('fresh public resources have no personal greeting, project or device path in every language/scheme combination',()=>{
  for(const language of ['en','zh'])for(const directoryPreset of ['en','zh']){
    const roots=C.presetRoots(directoryPreset),settings=C.load({language,directoryPreset,roots,files:R.freshFiles(roots,language)});
    assert.equal(settings.displayName,'');assert.equal(settings.statusFormat,'stable');
    const result=R.documents(settings,language,{categories:true,templates:true,ai:true});
    const text=JSON.stringify(result)+R.claude(settings,language);
    assert(!/\b[A-Z]:[\\/]|\/Users\/|\/home\//i.test(text));
    assert(!/Gavin|Claudian.*apiKey|password|secret/i.test(text));
    assert(!result.directories.some(p=>p.startsWith(roots.projects+'/')));
    assert.equal(result.documents.filter(d=>d.kind==='template').length,3);
    for(const doc of result.documents)assert(C.safePath(doc.path));
    assert(!result.documents.some(d=>/Home\.md|Task Board\.md/.test(d.path)));
  }
});

test('runtime has no OS-specific or external module dependency beyond Obsidian',()=>{
  const code=fs.readFileSync(path.join(__dirname,'dist/main.js'),'utf8');
  const requires=[...code.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)].map(x=>x[1]);
  assert(requires.length>0);assert(requires.every(x=>x==='obsidian'));
  assert(!/\b(?:process\.platform|process\.env|child_process|fetch\s*\(|requestUrl\s*\(|XMLHttpRequest|WebSocket)\b/.test(code));
  assert(!/\b[A-Z]:[\\/]|\/Users\/|\/home\//i.test(code));
  assert(!/Gavin 工作台|Gavin Workbench/.test(code));
});

test('release manifest and public documentation agree on identity and platform scope',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
  assert.equal(m.id,'plainob');assert.equal(m.name,'PlainOB');assert.equal(m.author,'GavinCQ');assert.equal(m.isDesktopOnly,true);
  const versions=JSON.parse(fs.readFileSync(path.join(__dirname,'versions.json'),'utf8'));
  assert.equal(versions[m.version],m.minAppVersion);
  for(const file of ['README.md','README.zh-CN.md']){
    const text=fs.readFileSync(path.join(__dirname,'../public-release',file),'utf8');
    assert(text.includes(m.version));assert(text.includes(m.minAppVersion));assert(text.includes('Windows'));assert(text.includes('macOS'));
  }
});
