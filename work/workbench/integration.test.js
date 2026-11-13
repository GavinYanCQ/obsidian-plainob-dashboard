const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const C=require('./config');
class El {
  constructor(tag='div',options={}){this.tag=tag;this.text=options.text||'';this.cls=options.cls||'';this.children=[];this.events={};this.dataset={};this.style={};this.scrollTop=0;this.attrs={};this.isConnected=true;}
  createEl(tag,opts={}){const x=new El(tag,opts);x.parent=this;this.children.push(x);return x;}
  setText(text){this.text=text;this.children=[];} appendText(text){this.text+=text;} addClass(c){this.cls+=' '+c;}removeClass(){}empty(){this.children=[];this.text='';}setAttribute(k,v){this.attrs[k]=v;}addEventListener(n,f){this.events[n]=f;}removeEventListener(){}focus(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}contains(x){return this===x||this.children.some(c=>c.contains(x));}
  all(){return [this,...this.children.flatMap(c=>c.all())];}
  querySelectorAll(q){return this.all().slice(1).filter(x=>q.startsWith('.')?x.cls.split(' ').includes(q.slice(1)):q==='[data-column-scroll]'?Boolean(x.dataset.columnScroll):false);}querySelector(q){return this.querySelectorAll(q)[0]||null;}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}
}
class File{constructor(p,fm={},body='User body'){this.path=p;this.fm=fm;this.body=body;this.stat={ctime:1,mtime:1};}get name(){return this.path.split('/').pop();}get basename(){return this.name.slice(0,-3);}get extension(){return 'md';}}
class Folder{constructor(p){this.path=p;this.children=[];}get name(){return this.path.split('/').pop();}}
class Setting{constructor(el){this.el=el;this.record=el.createEl('div');}setName(s){this.record.appendText(s);return this;}setDesc(s){this.record.appendText(s);return this;}setHeading(){return this;}addText(f){const x={setValue(v){this.value=v;return this;},onChange(fn){this.change=fn;return this;}};f(x);return this;}addToggle(f){return this.addText(f);}addDropdown(f){const x={addOption(){return this;},setValue(){return this;},onChange(){return this;}};f(x);return this;}addButton(f){const x={setButtonText(v){return this;},setCta(){return this;},setDisabled(){return this;},onClick(fn){this.click=fn;return this;}};f(x);this.el.lastButton=x;return this;}}
function environment({settings,locale='en',legacyRouter=false,legacy=false}={}){
  const entries=new Map(),handlers={},commands=[],notices=[],writes=[],callbacks=[],modals=[];
  const addFolder=p=>{if(entries.has(p))return entries.get(p);const f=new Folder(p);entries.set(p,f);const parent=p.includes('/')?addFolder(p.slice(0,p.lastIndexOf('/'))):null;if(parent)parent.children.push(f);return f;};
  const addFile=(p,fm={},body)=>{const f=new File(p,fm,body);f.parent=addFolder(p.slice(0,p.lastIndexOf('/')));f.parent.children.push(f);entries.set(p,f);return f;};
  const on=(n,f)=>{(handlers[n]??=[]).push(f);return ()=>{};};
  const app={plugins:{getPlugin:id=>id==='gavin-category-router'&&legacyRouter?{}:null},workspace:{onLayoutReady:f=>callbacks.push(f),getActiveFile:()=>null,requestSaveLayout(){},getLeavesOfType:()=>[],getLeaf:()=>({openFile:async()=>{}}),openLinkText:async()=>{}},metadataCache:{on,getFileCache:f=>({frontmatter:f.fm}),getFirstLinkpathDest:link=>entries.get(link.replace(/^\[\[|\]\]$/g,'').replace(/\.md$/,'')+'.md')||[...entries.values()].find(f=>f instanceof File&&f.basename===link)},vault:{on,getName:()=>"User's Vault",getAbstractFileByPath:p=>entries.get(p),getMarkdownFiles:()=>[...entries.values()].filter(f=>f instanceof File),getFiles:()=>[...entries.values()].filter(f=>f instanceof File),read:async f=>'---\n'+JSON.stringify(f.fm)+'\n---\n'+f.body,cachedRead:async f=>'---\n'+JSON.stringify(f.fm)+'\n---\n'+f.body,getResourcePath:f=>'resource:'+f.path,createFolder:async p=>addFolder(p)}};
  app.vault.configDir='.obsidian';
  app.vault.getAllLoadedFiles=()=>[...entries.values()];
  const originalRead=app.vault.read;
  app.vault.read=async file=>file.raw!==undefined?file.raw:originalRead(file);
  app.vault.create=async(p,text)=>{assert(!entries.has(p));const file=addFile(p);file.raw=text;return file;};
  app.vault.process=async(file,fn)=>{file.raw=fn(await app.vault.read(file));};
  app.vault.adapter={
    stat:async p=>entries.has(p)?{type:entries.get(p) instanceof Folder?'folder':'file'}:null,
    exists:async p=>entries.has(p),read:async p=>{const file=entries.get(p);assert(file instanceof File,p);return app.vault.read(file);},
    write:async(p,text)=>{let file=entries.get(p);if(!file)file=addFile(p);assert(file instanceof File);file.raw=text;},
    mkdir:async p=>addFolder(p),list:async p=>({files:[...entries.values()].filter(x=>x instanceof File&&x.path.startsWith(p+'/')&&!x.path.slice(p.length+1).includes('/')).map(x=>x.path),folders:[...entries.values()].filter(x=>x instanceof Folder&&x.path.startsWith(p+'/')&&!x.path.slice(p.length+1).includes('/')).map(x=>x.path)})
  };
  app.fileManager={processFrontMatter:async(f,fn)=>{fn(f.fm);writes.push(f.path);},renameFile:async(f,target)=>{
    assert(!entries.has(target),'Must not overwrite');const old=f.path;
    if(f instanceof Folder){for(const [key,obj] of [...entries])if(key===old||key.startsWith(old+'/')){entries.delete(key);obj.path=target+key.slice(old.length);entries.set(obj.path,obj);}}
    else{entries.delete(old);f.parent.children=f.parent.children.filter(x=>x!==f);f.path=target;f.parent=addFolder(target.slice(0,target.lastIndexOf('/')));f.parent.children.push(f);entries.set(target,f);}
    for(const file of app.vault.getMarkdownFiles())if(typeof file.fm.project==='string')file.fm.project=file.fm.project.replace(old+'/',target+'/');
    for(const fn of handlers.rename||[])fn(f,old);
  }};
  class Plugin{constructor(){this.app=app;}loadData(){return Promise.resolve(settings);}saveData(s){this.saved=JSON.parse(JSON.stringify(s));return Promise.resolve();}addSettingTab(t){this.tab=t;}addRibbonIcon(){}addCommand(c){commands.push(c);}registerView(id,fn){(this.viewFactories??={})[id]=fn;this.viewFactory=fn;}registerEvent(){}register(){}}
  class Modal{constructor(a){this.app=a;this.contentEl=new El();this.titleEl=new El();this.modalEl=new El();modals.push(this);}open(){this.onOpen?.();}close(){}setPlaceholder(x){this.placeholder=x;}setInstructions(x){this.instructions=x;}}
  const obsidian={Plugin,ItemView:class{constructor(){this.app=app;this.contentEl=new El();}},TFile:File,TFolder:Folder,Notice:class{constructor(text){notices.push(text);}},Modal,SuggestModal:Modal,Menu:class{},Setting,PluginSettingTab:class{constructor(a,p){this.app=a;this.plugin=p;this.containerEl=new El();}},getLanguage:()=>locale,normalizePath:x=>x,parseYaml:JSON.parse,stringifyYaml:value=>JSON.stringify(value)+'\n'};
  const context={module:{exports:{}},exports:{},require:n=>{assert.equal(n,'obsidian');return obsidian;},console,setTimeout,clearTimeout,Date,window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'dist/main.js'),'utf8')+'\nmodule.exports._test={WorkbenchView,ProjectPopover,NewNoteModal,ProjectPicker,SearchNotesModal,ConfirmModal,WorkbenchSettingsTab,SetupUI};',context);
  if(legacy)addFile('06_System/Configuration/归档分类清单.md',{},'03_Resources/AI & Technology');
  const PluginClass=context.module.exports,p=new PluginClass();
  return {p,classes:PluginClass._test,entries,addFolder,addFile,handlers,commands,notices,writes,callbacks,modals};
}
async function boot(options){const e=environment(options);await e.p.onload();e.p.refresh=()=>{};e.p.ready=true;e.p.routing.ready=true;return e;}

test('public wizard installs all UI/folder combinations without optional plugins or personal starter content',async()=>{
  const S=require('./setup');
  for(const locale of ['en','zh'])for(const preset of ['en','zh']){
    const e=await boot({locale});
    try{
      const wizard=new e.classes.SetupUI.Wizard(e.p);
      wizard.selectDirectoryPreset(preset);
      assert.equal(wizard.draft.displayName,'');
      assert.equal(wizard.options.metadata,false);assert.equal(wizard.options.ai,false);
      wizard.plan=await S.build(wizard.io,wizard.draft,wizard.options);
      assert.equal(e.entries.size,0);
      assert(!wizard.plan.operations.some(op=>op.action==='blocked'));
      await wizard.execute();
      const roots=C.presetRoots(preset);
      for(const root of Object.values(roots))assert(e.entries.has(root));
      assert(![...e.entries.keys()].some(p=>p.startsWith(roots.projects+'/')));
      assert(!e.entries.has('CLAUDE.md'));
      assert(!e.entries.has('.obsidian/plugins/metadata-menu/data.json'));
      assert(e.p.settings.setup.completed);assert.equal(e.p.settings.displayName,'');
      assert.equal(e.p.settings.statusFormat,'stable');
      assert(e.p.settings.files.noteTemplate.endsWith(locale==='en'?'Knowledge Note Template.md':'知识笔记模板.md'));
    }finally{e.p.onunload();}
  }
});
test('legacy load does not rewrite existing notes; third-party routing pauses built-in movement',async()=>{
  const e=await boot({legacy:true,legacyRouter:true});try{assert.equal(e.p.settings.displayName,'');assert.equal(e.p.settings.statusFormat,'legacy-zh');assert(e.p.routingBlocked());assert.equal(e.writes.length,0);const f=e.addFile('00_Inbox/old.md',{category:'03_Resources/AI & Technology'});e.addFolder('03_Resources/AI & Technology');assert.equal(await e.p.routing.route(f,true),false);assert.equal(f.path,'00_Inbox/old.md');assert.equal(e.writes.length,0);}finally{e.p.onunload();}
});
test('English home, project popover, dialogs and settings preserve Chinese user titles',async()=>{
  const e=await boot({locale:'en'});try{
    for(const root of Object.values(C.ROOTS))e.addFolder(root);
    const project=e.addFile('01_Projects/用户项目/用户项目总览.md',{task:true,task_status:'待办',workbench_project:true});
    const step=e.addFile('01_Projects/用户项目/用户标题.md',{task:true,task_status:'执行中',project:'[[01_Projects/用户项目/用户项目总览]]',board_visible:true});
    const v=new e.classes.WorkbenchView({},e.p);v.showPlanning=true;v.state.expandedProjects=[project.path];v.render();const text=v.contentEl.textContent;
    assert(text.includes('Good '));assert(text.includes('用户标题'));assert(text.includes('Projects'));assert(text.includes('Active'));assert(!text.includes('项目与目标'));assert.equal(e.p.settings.displayName,'');assert(!/[\u4e00-\u9fff]/.test(text.replaceAll('用户标题','').replaceAll('用户项目总览','')));
    for(const Ctor of [e.classes.NewNoteModal,e.classes.ProjectPicker,e.classes.SearchNotesModal]){const m=new Ctor(e.p,step);if(m.onOpen)m.onOpen();}
    const pop=Object.create(e.classes.ProjectPopover.prototype);Object.assign(pop,{plugin:e.p,file:project,focusFile:step,el:new El(),view:v,close(){}});pop.render();assert(pop.el.textContent.includes('用户标题'));assert(pop.el.textContent.includes('Open project'));assert(!pop.el.textContent.includes('待办'));
    e.p.tab.display();assert(e.p.tab.containerEl.textContent.includes('Interface language'));
    assert.equal(step.fm.task_status,'执行中');assert.equal(e.writes.length,0);
  }finally{e.p.onunload();}
});
test('custom nested roots complete and restore standalone tasks through the full plugin',async()=>{
  const settings=C.load();settings.roots.inbox='Notes/Inbox';settings.roots.archive='History';
  const e=await boot({settings});try{e.addFolder('Notes/Inbox/Ideas');e.addFolder('History');const f=e.addFile('Notes/Inbox/Ideas/Phone.md',{task:true,task_status:'active',board_column:'active',category:''});await e.p.act(f,{kind:'complete',checked:true});assert.equal(f.path,'History/Phone.md');assert.equal(f.fm.task_archive_origin,'Notes/Inbox/Ideas/Phone.md');await e.p.act(f,{kind:'complete',checked:false});assert.equal(f.path,'Notes/Inbox/Ideas/Phone.md');assert.equal(f.fm.task_archive_origin,undefined);assert.equal(f.body,'User body');}finally{e.p.onunload();}
});
test('custom nested project roots archive the whole folder and recover from reopening one step',async()=>{
  const settings=C.load();settings.roots.projects='Work/Projects';settings.roots.archive='History';const e=await boot({settings});try{
    e.addFolder('History');const parent=e.addFile('Work/Projects/A/A Overview.md',{task:true,task_status:'done',board_column:'active',workbench_project:true,completed_at:'2026-01-01'});
    const step=e.addFile('Work/Projects/A/Step 1.md',{task:true,task_status:'已完成',board_column:'done',project:'[[Work/Projects/A/A Overview]]',completed_at:'2026-01-01'});
    assert.equal(await e.p.archiveProject(parent),true);assert.equal(parent.path,'History/A/A Overview.md');assert.equal(step.path,'History/A/Step 1.md');await e.p.act(step,{kind:'complete',checked:false});assert.equal(step.path,'Work/Projects/A/Step 1.md');assert.equal(parent.path,'Work/Projects/A/A Overview.md');assert.equal(parent.fm.task_status,'backlog');assert.equal(parent.fm.project_archive_origin,undefined);
  }finally{e.p.onunload();}
});
test('integrated routing validates whitelist, rejects conflicts, uses fresh category and respects manual moves',async()=>{
  const e=await boot();try{
    e.addFolder('03_Resources/AI');e.addFolder('02_Areas/Work');const list=e.addFile('06_System/Configuration/归档分类清单.md',{},'03_Resources/AI\r\n02_Areas/Work');
    const f=e.addFile('00_Inbox/Test.md',{category:'03_Resources/AI'});assert.equal(await e.p.routing.route(f),true);assert.equal(f.path,'03_Resources/AI/Test.md');assert.equal(f.body,'User body');assert.equal(e.writes.length,0);
    const conflict=e.addFile('00_Inbox/Test.md',{category:'03_Resources/AI'});assert.equal(await e.p.routing.route(conflict),false);assert.equal(conflict.path,'00_Inbox/Test.md');
    const bad=e.addFile('00_Inbox/Bad.md',{category:'03_Resources/../AI'});assert.equal(await e.p.routing.route(bad),false);
    bad.fm.category='03_Resources/Missing';assert.equal(await e.p.routing.route(bad),false);
    const read=e.p.app.vault.read;e.p.app.vault.read=async file=>{if(file===list){bad.fm.category='02_Areas/Work';}return read(file);};bad.fm.category='03_Resources/AI';assert.equal(await e.p.routing.route(bad),false);assert.equal(bad.path,'00_Inbox/Bad.md');e.p.app.vault.read=read;assert.equal(await e.p.routing.route(bad),true);assert.equal(bad.path,'02_Areas/Work/Bad.md');
    bad.fm.category='03_Resources/AI';assert.equal(await e.p.routing.route(bad),false);assert.equal(bad.path,'02_Areas/Work/Bad.md');
  }finally{e.p.onunload();}
});
test('language changes write settings only and recovery records block unsafe root changes',async()=>{
  const e=await boot({legacy:true});try{const f=e.addFile('04_Archive/A.md',{task:true,task_status:'已完成',task_archive_origin:'00_Inbox/A.md',task_archive_path:'04_Archive/A.md'});const old=JSON.stringify(f.fm);await e.p.updateSettings({...e.p.settings,language:'en',displayName:'Someone else'});assert.equal(e.p.language,'en');assert.equal(JSON.stringify(f.fm),old);assert.equal(e.writes.length,0);await assert.rejects(e.p.updateSettings({...e.p.settings,roots:{...e.p.roots,inbox:'OtherInbox'}}));assert.equal(e.p.roots.inbox,'00_Inbox');assert.equal(e.p.saved.displayName,'Someone else');}finally{e.p.onunload();}
});
test('fresh library startup establishes baseline without moving notes already classified',async()=>{
  const e=environment();e.addFile('06_System/Configuration/归档分类清单.md',{},'03_Resources/AI');e.addFolder('03_Resources/AI');const f=e.addFile('00_Inbox/Existing.md',{category:'03_Resources/AI'});await e.p.onload();try{e.p.routing.reset();e.p.routing.ready=true;for(const callback of e.handlers.changed||[])callback(f);assert.equal(e.p.routing.timers.size,0);assert.equal(f.path,'00_Inbox/Existing.md');assert.equal(e.writes.length,0);}finally{e.p.onunload();}
});

test('same-column sorting in the configured plugin changes only positions and preserves completion dates',async()=>{
  const e=await boot();try{const a=e.addFile('02_Areas/A.md',{task:true,task_status:'已完成',board_column:'done',completed_at:'2026-01-01'}),b=e.addFile('02_Areas/B.md',{task:true,task_status:'done',board_column:'done',completed_at:'2026-02-01'});await e.p.placeCard(a,'done',{beforePath:b.path});assert.equal(a.fm.task_status,'已完成');assert.equal(a.fm.completed_at,'2026-01-01');assert.equal(b.fm.completed_at,'2026-02-01');assert(a.fm.board_order<b.fm.board_order);assert.equal(a.path,'02_Areas/A.md');}finally{e.p.onunload();}
});
test('settings save failures retain the previous live configuration',async()=>{
  const e=await boot();try{e.p.saveData=async()=>{throw Error('disk full');};await assert.rejects(e.p.updateSettings({...e.p.settings,language:'zh'}),/disk full/);assert.equal(e.p.settings.language,'auto');assert.equal(e.p.language,'en');}finally{e.p.onunload();}
});

test('unloading the routing controller during an asynchronous read cancels the pending move',async()=>{
  const e=await boot();try{e.addFolder('03_Resources/AI');const list=e.addFile('06_System/Configuration/归档分类清单.md',{},'03_Resources/AI');const f=e.addFile('00_Inbox/Pending.md',{category:'03_Resources/AI'});const read=e.p.app.vault.read;e.p.app.vault.read=async file=>{if(file===list)e.p.routing.stop();return read(file);};assert.equal(await e.p.routing.route(f),false);assert.equal(f.path,'00_Inbox/Pending.md');}finally{e.p.onunload();}
});

test('the real bundled wizard builds, previews and applies a fresh library through the Obsidian adapter boundary',async()=>{
  const e=await boot({locale:'en'});try{
    const wizard=new e.classes.SetupUI.Wizard(e.p);wizard.onOpen();assert(wizard.contentEl.textContent.includes('Setup mode'));assert(wizard.draft.files.noteTemplate.endsWith('Knowledge Note Template.md'));wizard.step=1;wizard.render();assert(wizard.contentEl.textContent.includes('Task status storage'));wizard.step=2;wizard.render();assert(wizard.contentEl.textContent.includes('Metadata Menu'));
    const S=require('./setup');wizard.plan=await S.build(wizard.io,wizard.draft,wizard.options);wizard.step=3;wizard.render();assert(wizard.contentEl.textContent.includes('Confirm and apply'));assert.equal(e.entries.size,0);
    await wizard.execute();assert.equal(wizard.step,4);assert(e.entries.has('05_Templates/Knowledge Note Template.md'));assert(e.p.settings.setup.completed);assert(wizard.contentEl.textContent.includes('Setup completed'));assert.equal(e.p.setupApplying,false);
    const exported=new e.classes.SetupUI.ProfileModal(e.p);exported.onOpen();const box=exported.contentEl.children.find(x=>x.tag==='textarea');assert(box.readOnly);assert(JSON.parse(box.value).format==='plainob-profile');
  }finally{e.p.onunload();}
});
test('setup pauses task automation and rejects concurrent task edits while applying',async()=>{
  const e=await boot();try{const f=e.addFile('00_Inbox/A.md',{task:true});e.p.setupApplying=true;await assert.rejects(e.p.act(f,{kind:'complete',checked:true}));assert.equal(f.fm.task_status,undefined);assert.equal(e.p.routing.active,false);for(const callback of e.handlers.changed||[])callback(f);assert.equal(e.p.timers.size,0);e.p.setupApplying=false;}finally{e.p.onunload();}
});

test('idea capture uses Inbox/Ideas and stays a non-task without changing category',async()=>{
  const e=await boot({locale:'en'});try{e.addFolder(e.p.roots.inbox);e.addFile(e.p.settings.files.ideaTemplate);let applied='';e.p.applyTemplate=async(file,name)=>{applied=name;};const dialog=new e.classes.NewNoteModal(e.p,{idea:true,task:true});dialog.onOpen();assert.equal(dialog.titleEl.textContent,'Capture idea');const input=dialog.contentEl.all().find(x=>x.tag==='input');input.value='A tiny idea';input.events.input();input.events.keydown({key:'Enter'});await new Promise(setImmediate);const file=e.entries.get('00_Inbox/Ideas/A tiny idea.md');assert(file);const fm=await e.p.readFrontmatter(file);assert.equal(fm.task,false);assert.equal(fm.category,'');assert.equal(fm.type,'note');assert.equal(fm.task_status,'');assert.equal(applied,'灵感记录模板');assert(e.commands.some(c=>c.id==='new-idea'));assert(e.commands.some(c=>c.id==='apply-idea-template'));}finally{e.p.onunload();}
});
test('missing idea template and a file occupying Ideas stop capture without creating a note',async()=>{
  for(const collision of [false,true]){const e=await boot({locale:'en'});try{e.addFolder('00_Inbox');if(collision){e.addFile(e.p.settings.files.ideaTemplate);e.addFile('00_Inbox/Ideas');}const before=e.p.app.vault.getMarkdownFiles().length;const dialog=new e.classes.NewNoteModal(e.p,{idea:true});dialog.onOpen();const input=dialog.contentEl.all().find(x=>x.tag==='input');input.value='Keep me safe';input.events.input();input.events.keydown({key:'Enter'});await new Promise(setImmediate);assert.equal(e.p.app.vault.getMarkdownFiles().length,before);assert(!e.entries.has('00_Inbox/Ideas/Keep me safe.md'));assert(dialog.contentEl.textContent.includes(collision?'occupies':'not found'));}finally{e.p.onunload();}}
});
test('applying the idea template preserves task history and user writing and is repeatable',async()=>{
  const e=await boot();try{const R=require('./resources'),body=R.ideaTemplate(false).split('---\n').slice(2).join('---\n');const template=e.addFile(e.p.settings.files.ideaTemplate,{},body);template.raw='---\n'+JSON.stringify({type:'note',task:false,category:'',created:'2026-11-10'})+'\n---\n'+body;const original={task:true,task_status:'已完成',completed_at:'2026-11-09',category:'03_Resources/AI & Technology',project:'[[My project]]',created:'2020-01-01'};const file=e.addFile('00_Inbox/Existing.md',{...original},'# Existing\n\nMy original thought');await e.p.applyTemplate(file,'灵感记录模板');await e.p.applyTemplate(file,'灵感记录模板');for(const [key,value]of Object.entries(original))assert.equal(file.fm[key],value);const text=await e.p.app.vault.read(file);assert(text.includes('My original thought'));assert.equal((text.match(/## 💡 我想到什么/g)||[]).length,1);}finally{e.p.onunload();}
});

test('wizard language switching does not alter folders; presets apply only before creating a new system',async()=>{
  const e=await boot({locale:'en'});try{const wizard=new e.classes.SetupUI.Wizard(e.p);wizard.selectDirectoryPreset('zh');const snapshot=JSON.stringify({roots:wizard.draft.roots,files:wizard.draft.files});wizard.changeInterfaceLanguage('zh');wizard.changeInterfaceLanguage('en');assert.equal(JSON.stringify({roots:wizard.draft.roots,files:wizard.draft.files}),snapshot);wizard.step=1;wizard.render();assert(wizard.contentEl.textContent.includes('Folder scheme'));wizard.selectDirectoryPreset('custom');assert.equal(wizard.draft.roots.inbox,'00_收件箱');wizard.options.mode='existing';assert.throws(()=>wizard.selectDirectoryPreset('en'));assert.equal(e.writes.length,0);}finally{e.p.onunload();}
});
test('Chinese roots support idea capture and category routing with no English root duplicates',async()=>{
  const R=require('./resources'),roots=C.presetRoots('zh'),settings=C.load({roots,files:R.freshFiles(roots,'zh'),directoryPreset:'zh',language:'en'}),e=await boot({settings});try{
    e.addFolder(roots.inbox);e.addFolder(roots.resources+'/财务与管理');e.addFile(settings.files.ideaTemplate);e.addFile(settings.files.categoryNote,{},roots.resources+'/财务与管理');e.p.applyTemplate=async()=>{};const dialog=new e.classes.NewNoteModal(e.p,{idea:true});dialog.onOpen();const input=dialog.contentEl.all().find(x=>x.tag==='input');input.value='Budget idea';input.events.input();input.events.keydown({key:'Enter'});await new Promise(setImmediate);const file=e.entries.get('00_收件箱/Ideas/Budget idea.md');assert(file);file.raw=undefined;file.fm={task:false,category:'03_资源/财务与管理'};assert.equal(await e.p.routing.route(file),true);assert.equal(file.path,'03_资源/财务与管理/Budget idea.md');assert(!e.entries.has('00_Inbox'));
  }finally{e.p.onunload();}
});

test('PlainOB retains old workspace views while displaying the new brand and keeping the chosen greeting name',async()=>{
  const settings=C.load();settings.displayName='Example User';const e=await boot({settings});try{const old=e.p.viewFactories['gavin-workbench-view']({}),current=e.p.viewFactories['plainob-view']({});assert.equal(old.getViewType(),'gavin-workbench-view');assert.equal(current.getViewType(),'plainob-view');assert.equal(old.getDisplayText(),'PlainOB');current.render();assert(current.contentEl.textContent.includes('Simple Notes & Tasks'));assert(current.contentEl.textContent.includes('Example User'));assert.equal(e.p.settings.displayName,'Example User');}finally{e.p.onunload();}
});
