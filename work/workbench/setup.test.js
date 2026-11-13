const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('./setup'),C=require('./config'),R=require('./resources'),I=require('./i18n'),fs=require('node:fs'),path=require('node:path');
function memory(initial={},settings=C.load()){
  const files=new Map(Object.entries(initial).map(([p,text])=>[p,{kind:'file',text}])),writes=[],dirs=new Set();
  for(const p of files.keys())for(const d of p.split('/').slice(0,-1).map((_,i)=>p.split('/').slice(0,i+1).join('/')))dirs.add(d);
  let config=JSON.parse(JSON.stringify(settings));
  const io={configDir:'.obsidian',locale:'en',loaded:false,paused:false,files,dirs,writes,currentSettings:()=>config,validateSettings:async()=>{},metadataLoaded:()=>io.loaded,cancelled:()=>io.paused,
    inspect:async p=>files.has(p)?{...files.get(p)}:dirs.has(p)?{kind:'directory'}:{kind:'missing'},
    inventory:async()=>[...files.keys()].map(p=>({path:p,kind:'file'})).concat([...dirs].map(p=>({path:p,kind:'directory'}))),
    mkdir:async p=>{if(files.has(p))throw Error('occupied');dirs.add(p);writes.push(['directory',p]);},
    write:async(p,text,before)=>{assert.equal(files.get(p)?.text??null,before);files.set(p,{kind:'file',text});writes.push(['file',p]);},
    privateMkdir:async p=>{dirs.add(p);},privateWrite:async(p,text)=>{files.set(p,{kind:'file',text});},
    setSettings:async next=>{config=JSON.parse(JSON.stringify(next));writes.push(['settings']);}
  };
  return io;
}
function fresh(){const c=C.load();c.files=R.freshFiles(c.roots,'en');return c;}
test('preview is read-only and a new library creates a complete portable structure',async()=>{
  const io=memory(),settings=fresh(),plan=await S.build(io,settings,{mode:'new',categories:true,ai:true});assert.equal(io.files.size,0);assert.equal(io.writes.length,0);assert(!plan.operations.some(x=>x.action==='blocked'));
  const result=await S.execute(io,plan);assert.equal(result.journal.status,'complete');for(const dir of Object.values(settings.roots))assert(io.dirs.has(dir));assert(io.files.has(settings.files.noteTemplate));assert(io.files.has('CLAUDE.md'));assert(![...io.dirs].some(x=>x.includes('讲师')));assert.equal(io.files.get(settings.files.statusNote).text,'backlog\nactive\ndone');assert(!io.files.get(settings.files.statusNote).text.includes('\r'));assert(io.files.get(settings.files.aiRules).text.includes('autoplay=0'));assert(io.currentSettings().setup.completed);
});
test('repeating setup keeps existing notes, hand-edited templates and AI rules',async()=>{
  const io=memory({'03_Resources/Personal.md':'private original note'}),settings=fresh();await S.execute(io,await S.build(io,settings,{mode:'new',categories:true,ai:true}));io.files.get(settings.files.noteTemplate).text+='\nMy edits';const content=io.files.get(settings.files.noteTemplate).text;
  const plan=await S.build(io,io.currentSettings(),{mode:'existing',ai:true});assert.equal(plan.operations.find(x=>x.path===settings.files.noteTemplate).action,'keep');await S.execute(io,plan);assert.equal(io.files.get(settings.files.noteTemplate).text,content);assert.equal(io.files.get('03_Resources/Personal.md').text,'private original note');assert.equal((io.files.get('CLAUDE.md').text.match(/plainob:note-rules:start/g)||[]).length,1);
});
test('adoption preserves old notes and creates a category list from mapped existing folders',async()=>{
  const io=memory({'Library/Topic/Old.md':'old note'}),settings=fresh();settings.roots.resources='Library';const plan=await S.build(io,settings,{mode:'adopt',categories:false});await S.execute(io,plan);assert.equal(io.files.get('Library/Topic/Old.md').text,'old note');assert.equal(io.files.get(settings.files.categoryNote).text,'Library/Topic');assert(!io.dirs.has('Library/AI & Technology'));
});
test('file/folder, case-only and Unicode-equivalent conflicts block setup before writing',async()=>{
  for(const initial of [{'00_Inbox':'occupied'},{'00_inbox/a.md':'x'},{'03_Resources/Cafe\u0301/n.md':'x'}]){
    const io=memory(initial),settings=fresh();if(Object.keys(initial)[0].includes('Cafe'))settings.roots.areas='03_Resources/Café';
    if(Object.keys(initial)[0].includes('Cafe')){settings.roots.resources='Library';}
    const plan=await S.build(io,settings,{mode:'new'});assert(plan.operations.some(x=>x.action==='blocked'));await assert.rejects(S.execute(io,plan));assert.equal(io.writes.length,0);
  }
});
test('preflight detects source changes after preview before creating anything',async()=>{
  const io=memory({'CLAUDE.md':'User rules'}),plan=await S.build(io,fresh(),{mode:'new',ai:true});io.files.get('CLAUDE.md').text='Concurrent edit';await assert.rejects(S.execute(io,plan),/变化/);assert.equal(io.writes.length,0);assert.equal(io.files.get('CLAUDE.md').text,'Concurrent edit');
});
test('AI rules append preserves the old file and writes an exact backup',async()=>{
  const original='Original rules\n\nKeep my style.\n',io=memory({'CLAUDE.md':original}),plan=await S.build(io,fresh(),{mode:'new',ai:true}),result=await S.execute(io,plan);assert(io.files.get('CLAUDE.md').text.startsWith(original));const record=result.journal.backups.find(x=>x.path==='CLAUDE.md');assert(record);assert.equal(io.files.get(record.backupPath).text,original);
});
test('Metadata Menu adds only missing fields and defaults to preserving conflicts',()=>{
  const existing={presetFields:[{name:'category',type:'Input',id:'custom-category',path:''},{name:'custom',type:'Input',id:'mine'}],unrelated:{keep:42},fileClassQueries:[{name:'mine'}]};
  const f=R.paths(fresh(),'en'),merge=S.metadataMerge(JSON.stringify(existing),f);const after=JSON.parse(merge.text);assert.equal(after.presetFields.length,4);assert.equal(after.presetFields[0].type,'Input');assert.deepEqual(after.unrelated,existing.unrelated);assert.deepEqual(after.fileClassQueries,existing.fileClassQueries);assert(merge.details.some(d=>d.action==='conflict'));
  const replace=JSON.parse(S.metadataMerge(JSON.stringify(existing),f,{category:'replace'}).text);assert.equal(replace.presetFields[0].id,'custom-category');assert.equal(replace.presetFields[0].options.valuesListNotePath,f.categoryNote);assert.equal(replace.presetFields[1].id,'mine');
});
test('Metadata Menu integration skips absent/unknown versions, blocks writes while loaded, and keeps matching active settings',async()=>{
  let io=memory(),plan=await S.build(io,fresh(),{metadata:true});assert(plan.warnings.some(x=>x.includes('未安装')));
  io=memory({'.obsidian/plugins/metadata-menu/manifest.json':'{"version":"9"}'});plan=await S.build(io,fresh(),{metadata:true});assert(plan.warnings.some(x=>x.includes('尚未验证')));
  io=memory({'.obsidian/plugins/metadata-menu/manifest.json':'{"version":"0.8.12"}'});io.loaded=true;plan=await S.build(io,fresh(),{metadata:true});assert(plan.operations.some(x=>x.action==='blocked'));await assert.rejects(S.execute(io,plan));assert.equal(io.writes.length,0);
  const config=S.metadataMerge(null,R.paths(fresh(),'en')).text;io=memory({'.obsidian/plugins/metadata-menu/manifest.json':'{"version":"0.8.12"}','.obsidian/plugins/metadata-menu/data.json':config});io.loaded=true;plan=await S.build(io,fresh(),{metadata:true});assert(!plan.operations.some(x=>x.action==='blocked'));assert.equal(plan.operations.find(x=>x.role==='metadata').action,'keep');
});
test('Metadata Menu write backs up unrelated configuration and requires the plugin to remain disabled',async()=>{
  const original='{"presetFields":[],"unrelated":"keep"}',io=memory({'.obsidian/plugins/metadata-menu/manifest.json':'{"version":"0.8.12"}','.obsidian/plugins/metadata-menu/data.json':original});const plan=await S.build(io,fresh(),{metadata:true});io.loaded=true;await assert.rejects(S.execute(io,plan));io.loaded=false;const result=await S.execute(io,plan),record=result.journal.backups.find(x=>x.path.endsWith('metadata-menu/data.json'));assert.equal(io.files.get(record.backupPath).text,original);assert.equal(JSON.parse(io.files.get(record.path).text).unrelated,'keep');
});
test('interrupted setup resumes from its journal without duplicating files',async()=>{
  const io=memory(),plan=await S.build(io,fresh(),{mode:'new',categories:true});const write=io.write;let fail=true;io.write=async(...args)=>{if(fail){fail=false;throw Error('Simulated disk failure');}return write(...args);};await assert.rejects(S.execute(io,plan),/failure/);const entry=[...io.files].find(([p])=>p.endsWith('/journal.json')),journal=JSON.parse(entry[1].text);assert.equal(journal.status,'interrupted');const result=await S.resume(io,journal.id);assert.equal(result.journal.status,'complete');assert(io.files.has(plan.settings.files.noteTemplate));
});
test('resume detects concurrent changes and validates journal ids and target paths',async()=>{
  const io=memory(),plan=await S.build(io,fresh(),{mode:'new'});const write=io.write;let count=0;io.write=async(...args)=>{if(++count===2)throw Error('Stop');return write(...args);};await assert.rejects(S.execute(io,plan));const [journalPath,state]=[...io.files].find(([p])=>p.endsWith('/journal.json')),j=JSON.parse(state.text);const first=plan.operations.find(x=>x.kind==='create');io.files.get(first.path).text='User edited after interruption';await assert.rejects(S.resume(io,j.id),/变化/);await assert.rejects(S.resume(io,'../bad'));j.plan.operations[0].path='../outside';io.files.get(journalPath).text=JSON.stringify(j);await assert.rejects(S.resume(io,j.id),/无效/);
});
test('export/import is a portable allowlist without secrets, sync data or plugin setup history',()=>{
  const settings=fresh();settings.apiKey='secret';settings.syncServer='private';settings.setup={backups:'private'};const text=JSON.stringify(S.profile(settings));assert(!text.includes('secret'));assert(!text.includes('private'));const loaded=S.importProfile(text);assert.equal(loaded.roots.inbox,settings.roots.inbox);assert.equal(loaded.statusFormat,settings.statusFormat);assert.throws(()=>S.importProfile('{"format":"other"}'));const hostile=S.profile(settings);hostile.settings.roots.inbox='../outside';assert.throws(()=>S.importProfile(JSON.stringify(hostile)));
});
test('existing Chinese option lists are reused after switching the UI to English',async()=>{
  const io=memory({'06_System/Configuration/任务状态清单.md':'待办\n执行中\n已完成','06_System/Configuration/笔记类型清单.md':'note\nreference'}),settings=C.load(null,true);settings.language='en';const plan=await S.build(io,settings,{mode:'existing'});assert.equal(plan.settings.files.statusNote,'06_System/Configuration/任务状态清单.md');assert.equal(plan.settings.statusFormat,'legacy-zh');assert(!plan.operations.some(x=>x.path.endsWith('Task Statuses.md')));
});
test('all setup interface keys have English translations',()=>{const keys=JSON.parse(fs.readFileSync(path.join(__dirname,'../setup-translation-keys.json'),'utf8'));assert.deepEqual(keys.filter(k=>!Object.hasOwn(I.EN,k)),[]);});

test('idea template stays lightweight in both languages and its path survives migration',()=>{
  const zh=R.ideaTemplate(false),en=R.ideaTemplate(true);assert(zh.includes('task: false'));assert(zh.includes('category: ""'));assert.equal((zh.match(/^## /gm)||[]).length,4);assert.equal((zh.match(/<!--/g)||[]).length,4);assert(!zh.includes('type: idea'));assert(en.includes('What came to mind'));const settings=fresh();settings.files.ideaTemplate='05_Templates/Custom Idea.md';assert.equal(S.importProfile(JSON.stringify(S.profile(settings))).files.ideaTemplate,settings.files.ideaTemplate);assert(R.documents(settings,'en',{templates:true}).documents.some(x=>x.path===settings.files.ideaTemplate&&x.text.includes('What came to mind')));
});

test('Chinese directory scheme works with English UI and survives portable profile import',async()=>{
  const roots=C.presetRoots('zh'),settings=C.load({roots,files:R.freshFiles(roots,'en'),directoryPreset:'zh',language:'en'}),io=memory();const plan=await S.build(io,settings,{mode:'new',categories:true});await S.execute(io,plan);assert(io.dirs.has('00_收件箱/Ideas'));assert(io.dirs.has('01_项目'));assert(io.dirs.has('02_领域/个人生活'));assert(io.dirs.has('03_资源/财务与管理'));assert(!io.dirs.has('00_Inbox'));assert(io.files.get(settings.files.categoryNote).text.includes('03_资源/视频与播客'));const imported=S.importProfile(JSON.stringify(S.profile(io.currentSettings())));assert.equal(imported.directoryPreset,'zh');assert.equal(imported.language,'en');assert.equal(imported.roots.projects,'01_项目');
});
test('English directories can use Chinese UI without translating their paths',async()=>{
  const settings=fresh();settings.language='zh';settings.directoryPreset='en';const io=memory(),plan=await S.build(io,settings,{mode:'new',categories:true});await S.execute(io,plan);assert(io.dirs.has('00_Inbox'));assert(!io.dirs.has('00_收件箱'));assert(io.dirs.has('03_Resources/Finance & Management'));assert(io.files.get(settings.files.categoryNote).text.includes('03_Resources/Finance & Management'));
});

test('PlainOB imports legacy migration profiles and keeps old AI rule markers without appending duplicates',async()=>{
  const settings=fresh(),old=S.profile(settings);old.format='gavin-workbench-profile';assert.equal(S.importProfile(JSON.stringify(old)).roots.inbox,settings.roots.inbox);assert.equal(S.profile(settings).format,'plainob-profile');const io=memory({'CLAUDE.md':'User rules\n<!-- gavin-workbench:note-rules:start -->\nExisting rule\n<!-- gavin-workbench:note-rules:end -->'});const plan=await S.build(io,settings,{mode:'existing',ai:true});assert.equal(plan.operations.find(op=>op.path==='CLAUDE.md').action,'keep');assert.equal(S.privatePath(io),'.obsidian/plugins/plainob');
});
