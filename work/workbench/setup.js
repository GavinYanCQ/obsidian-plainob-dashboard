'use strict';
const Config=require('./config'),Resources=require('./resources');
const clone=x=>JSON.parse(JSON.stringify(x));
function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
const FILE_KEYS=['categoryNote','noteTemplate','referenceTemplate','ideaTemplate','guide','defaultCover','statusNote','typeNote','aiRules'];
function profile(settings){const files={};for(const key of FILE_KEYS)if(settings.files[key]!==undefined)files[key]=settings.files[key];return {format:'plainob-profile',version:1,settings:{...(settings.directoryPreset?{directoryPreset:settings.directoryPreset}:{}),language:settings.language,displayName:settings.displayName,statusFormat:settings.statusFormat,routingEnabled:settings.routingEnabled,roots:clone(settings.roots),files}};}
function importProfile(text){
  if(typeof text!=='string'||text.length>65536)throw Error('向导无法识别这份迁移配置');
  const data=JSON.parse(text);if(!['plainob-profile','gavin-workbench-profile'].includes(data.format)||data.version!==1)throw Error('向导无法识别这份迁移配置');
  const input=data.settings||{},files={};for(const key of FILE_KEYS)if(input.files?.[key]!==undefined)files[key]=input.files[key];
  const roots={};for(const key of Config.ROLES)roots[key]=input.roots?.[key];
  return Config.load({...(input.directoryPreset?{directoryPreset:input.directoryPreset}:{}),language:input.language,displayName:input.displayName,statusFormat:input.statusFormat,routingEnabled:input.routingEnabled===true,roots,files});
}
function preset(name,note,id,label){return {name,type:'Select',tagName:'select',icon:'right-triangle',tooltip:'Accepts a single value from a list',colorClass:'select',options:{sourceType:'ValuesListNotePath',valuesListNotePath:note,valuesList:{},valuesFromDVQuery:''},id,path:'',command:{id,label,icon:'list-filter'}};}
function metadataMerge(before,files,choices={},language='zh'){
  const data=before?JSON.parse(before):{},fields=data.presetFields??[];
  if(!Array.isArray(fields))throw Error('Metadata Menu 的字段格式无法识别');
  const en=language==='en',defs=[preset('category',files.categoryNote,'gwb-category-v2',en?'Choose category':'选择归档分类'),preset('task_status',files.statusNote,'gwb-status-v2',en?'Choose task status':'选择任务状态'),preset('type',files.typeNote,'gwb-type-v2',en?'Choose note type':'选择笔记类型')];
  const next=clone(data),result=clone(fields),details=[];
  for(const field of defs){
    const indices=fields.map((f,i)=>(f.name===field.name&&!f.path)?i:-1).filter(i=>i>=0);
    if(indices.length===1){const current=fields[indices[0]];if(current.type==='Select'&&current.options?.sourceType==='ValuesListNotePath'&&current.options?.valuesListNotePath===field.options.valuesListNotePath){details.push({name:field.name,action:'keep',note:field.options.valuesListNotePath});continue;}}
    if(indices.length){
      if(choices[field.name]!=='replace'||indices.length!==1){details.push({name:field.name,action:'conflict',note:field.options.valuesListNotePath});continue;}
      const old=fields[indices[0]];result[indices[0]]={...old,...field,id:old.id,command:old.command};details.push({name:field.name,action:'replace',note:field.options.valuesListNotePath});
    }else{
      const ids=new Set(result.map(f=>f.id));let id=field.id,index=2;while(ids.has(id))id=field.id+'-'+index++;
      result.push({...field,id,command:{...field.command,id}});details.push({name:field.name,action:'add',note:field.options.valuesListNotePath});
    }
  }
  next.presetFields=result;
  return {text:stable(next)===stable(data)?before:JSON.stringify(next,null,2)+'\n',details,changed:stable(next)!==stable(data)};
}
function parents(path){const parts=path.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/'));}
function privatePath(io){return io.configDir+'/plugins/plainob';}
function allowedTargets(plan,io){
  const f=Resources.paths(plan.settings,plan.language);
  return new Set([...Object.values(f).filter(Boolean),'CLAUDE.md',io.configDir+'/plugins/metadata-menu/data.json']);
}
function checkPlan(plan,io){
  if(plan.version!==1||!['new','adopt','existing'].includes(plan.mode)||!Array.isArray(plan.operations))throw Error('无效的向导记录');
  Config.validate(plan.settings);const allowed=allowedTargets(plan,io),seen=new Set();
  if(plan.operations.filter(o=>o.kind==='settings').length!==1||plan.operations.at(-1)?.kind!=='settings')throw Error('无效的向导记录');
  for(const op of plan.operations){
    if(!['directory','create','keep','write','settings'].includes(op.kind)||!['keep','create','blocked','append','configure'].includes(op.action))throw Error('无效的向导记录');
    if(op.kind==='keep'&&op.action!=='keep'||op.kind==='create'&&!['create','blocked'].includes(op.action)||op.kind==='write'&&!['append','configure','blocked'].includes(op.action))throw Error('无效的向导记录');
    if(op.kind==='settings'){if(op.path!=='@settings'||op.action!=='configure'||op.after!==stable(plan.settings))throw Error('无效的向导记录');continue;}
    if(op.kind==='directory'){if(!Config.safePath(op.path)||!Object.values(plan.settings.roots).some(root=>op.path===root||Config.within(op.path,root)||Config.within(root,op.path)))throw Error('无效的向导目录');}
    else if(!allowed.has(op.path)||typeof op.after!=='string'&&['create','write'].includes(op.kind))throw Error('无效的向导目标');
    if(seen.has(op.path))throw Error('向导中的文件路径重复');seen.add(op.path);
  }
}
async function build(io,input,options={}){
  const settings=Config.load(clone(input)),language=Config.resolveLanguage(settings.language,io.locale),mode=options.mode||'existing';
  const folder=settings.files.categoryNote.slice(0,settings.files.categoryNote.lastIndexOf('/')+1);
  const names={statusNote:['任务状态清单.md','Task Statuses.md'],typeNote:['笔记类型清单.md','Note Types.md'],aiRules:['AI笔记整理规则.md','AI Note Rules.md']};
  for(const [key,candidates]of Object.entries(names))if(!settings.files[key])for(const name of candidates)if((await io.inspect(folder+name)).kind==='file'){settings.files[key]=folder+name;break;}
  const resources=Resources.documents(settings,language,options);settings.files={...settings.files,...resources.files};
  settings.setup={version:1,mode,completed:true};
  Config.validate(settings);await io.validateSettings(settings);
  const inventory=await io.inventory(),fold=s=>s.normalize('NFC').toLowerCase(),index=new Map(inventory.map(x=>[fold(x.path),x]));
  const operations=[],warnings=[],dirs=new Set(Object.values(settings.roots));
  const documents=resources.documents;
  if(!options.categories){const categoryDoc=documents.find(x=>x.path===settings.files.categoryNote);if(categoryDoc)categoryDoc.text=inventory.filter(x=>x.kind==='directory'&&['projects','areas','resources'].some(k=>Config.within(x.path,settings.roots[k]))&&Config.safePath(x.path)).map(x=>x.path).sort().join('\n');}
  for(const p of resources.directories)dirs.add(p);
  for(const doc of documents)for(const parent of parents(doc.path))dirs.add(parent);
  for(const dir of [...dirs])for(const parent of parents(dir))dirs.add(parent);
  for(const path of [...dirs].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b))){
    const current=await io.inspect(path),alias=index.get(fold(path));
    operations.push({kind:'directory',path,before:current.kind,action:alias&&alias.path!==path?'blocked':current.kind==='file'?'blocked':current.kind==='directory'?'keep':'create',reason:alias&&alias.path!==path?'大小写或 Unicode 等价路径已存在':''});
  }
  for(const doc of documents){
    const current=await io.inspect(doc.path),alias=index.get(fold(doc.path));
    operations.push({kind:current.kind==='missing'?'create':'keep',path:doc.path,before:current.text??null,after:doc.text,role:doc.kind,action:alias&&alias.path!==doc.path||current.kind==='directory'?'blocked':current.kind==='missing'?'create':'keep',reason:alias&&alias.path!==doc.path?'大小写或 Unicode 等价路径已存在':''});
  }
  if(options.ai){
    const current=await io.inspect('CLAUDE.md'),block=Resources.claude(settings,language),configured=current.kind==='file'&&(current.text.includes('<!-- plainob:note-rules:start -->')||current.text.includes('<!-- gavin-workbench:note-rules:start -->')||current.text.includes(settings.files.aiRules));
    operations.push({kind:current.kind==='missing'?'create':configured?'keep':'write',path:'CLAUDE.md',before:current.text??null,after:current.kind==='file'?current.text+(current.text.endsWith('\n')?'':'\n')+block:block.trimStart(),role:'ai-entry',action:current.kind==='directory'?'blocked':configured?'keep':current.kind==='missing'?'create':'append'});
    if(configured)warnings.push('已有 AI 整理入口，保留原内容');
  }
  let metadataDetails=[];
  if(options.metadata){
    const root=io.configDir+'/plugins/metadata-menu',manifest=await io.inspect(root+'/manifest.json');
    if(manifest.kind!=='file')warnings.push('未安装 Metadata Menu，本次跳过下拉配置');
    else{
      let version='';try{version=JSON.parse(manifest.text).version;}catch{}
      if(version!=='0.8.12')warnings.push('当前 Metadata Menu 版本尚未验证，本次跳过下拉配置');
      else{
        const path=root+'/data.json',current=await io.inspect(path);
        if(current.kind==='directory')throw Error('Metadata Menu 配置位置被文件夹占用');
        const merged=metadataMerge(current.text??null,settings.files,options.metadataChoices,language);metadataDetails=merged.details;
        for(const detail of merged.details)if(detail.action==='conflict')warnings.push('保留已有同名字段：'+detail.name);
        if(merged.changed&&io.metadataLoaded())warnings.push('请先关闭 Metadata Menu，再重新预览以写入下拉配置');
        operations.push({kind:merged.changed?'write':'keep',path,before:current.text??null,after:merged.text,role:'metadata',action:merged.changed&&io.metadataLoaded()?'blocked':merged.changed?'configure':'keep'});
        const data=current.text?JSON.parse(current.text):{};if(data.globalFileClass||data.fileClassQueries?.length)warnings.push('FileClass 可能覆盖全局字段，请在对应笔记中检查下拉选项');
      }
    }
  }
  operations.push({kind:'settings',path:'@settings',before:stable(io.currentSettings()),after:stable(settings),action:'configure'});
  const plan={version:1,mode,language,settings,operations,warnings,metadataDetails,options:clone(options)};
  checkPlan(plan,io);return plan;
}
async function preflight(io,plan,completed=new Set()){
  checkPlan(plan,io);if(plan.operations.some(o=>o.action==='blocked'))throw Error('请先处理预览中的阻止项');
  await io.validateSettings(plan.settings);
  for(let i=0;i<plan.operations.length;i++){
    const op=plan.operations[i];if(op.action==='keep')continue;
    if(op.kind==='settings'){const now=stable(io.currentSettings());if(completed.has(i)&&now!==op.after||now!==op.before&&now!==op.after)throw Error('预览后工作台设置发生变化，请重新预览');continue;}
    const now=await io.inspect(op.path);
    if(op.kind==='directory'){if(completed.has(i)&&now.kind!=='directory'||!['missing','directory'].includes(now.kind))throw Error('目录被其他内容占用：'+op.path);continue;}
    if(op.role==='metadata'&&io.metadataLoaded()&&op.kind==='write')throw Error('请先关闭 Metadata Menu，再重新预览以写入下拉配置');
    if(completed.has(i)){if(now.kind==='file'&&now.text===op.after)continue;throw Error('预览后文件发生变化，已停止：'+op.path);}
    if(now.kind==='file'&&now.text===op.after)continue;
    if(op.before===null?now.kind!=='missing':now.kind!=='file'||now.text!==op.before)throw Error('预览后文件发生变化，已停止：'+op.path);
  }
}
async function execute(io,plan,resume=null){
  const completed=new Set(resume?.completed||[]);await preflight(io,plan,completed);
  const id=resume?.id||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),root=privatePath(io)+'/setup-backups/'+id;
  if(!/^[a-z0-9]+-[a-z0-9]+$/.test(id))throw Error('无效的向导记录');
  const journal=resume||{version:1,id,status:'running',plan,completed:[],backups:[],createdAt:new Date().toISOString()};
  journal.status='running';await io.privateMkdir(root);
  const save=()=>io.privateWrite(root+'/journal.json',JSON.stringify(journal,null,2)+'\n');
  await save();
  try{
    for(let i=0;i<plan.operations.length;i++){
      const op=plan.operations[i];if(completed.has(i)||op.action==='keep')continue;
      if(io.cancelled())throw Error('向导已暂停，可稍后继续');
      if(op.kind==='directory')await io.mkdir(op.path);
      else if(op.kind==='settings'){
        const now=stable(io.currentSettings());if(now!==op.after){if(now!==op.before)throw Error('工作台设置发生变化，请重新预览');await io.privateWrite(root+'/workbench-settings-before.json',JSON.stringify(JSON.parse(op.before),null,2)+'\n');await io.setSettings(plan.settings);}
      }else{
        const now=await io.inspect(op.path);
        if(!(now.kind==='file'&&now.text===op.after)){
          if(op.before===null?now.kind!=='missing':now.kind!=='file'||now.text!==op.before)throw Error('文件发生变化，已停止：'+op.path);
          if(op.role==='metadata'&&io.metadataLoaded())throw Error('请先关闭 Metadata Menu，再重新预览以写入下拉配置');
          if(op.before!==null){const backupPath=root+'/file-'+i+'.txt';await io.privateWrite(backupPath,op.before);journal.backups.push({path:op.path,backupPath});await save();}
          await io.write(op.path,op.after,op.before);
        }
      }
      completed.add(i);journal.completed=[...completed];await save();
    }
    journal.status='complete';journal.finishedAt=new Date().toISOString();await save();return {id,root,journal};
  }catch(error){journal.status='interrupted';journal.error=error.message;try{await save();}catch{}throw error;}
}
async function resume(io,id){
  if(!/^[a-z0-9]+-[a-z0-9]+$/.test(id))throw Error('无效的向导记录');
  const state=await io.inspect(privatePath(io)+'/setup-backups/'+id+'/journal.json');if(state.kind!=='file')throw Error('找不到向导记录');
  const journal=JSON.parse(state.text);if(journal.version!==1||journal.id!==id||!['running','interrupted'].includes(journal.status))throw Error('无效的向导记录');
  if(!Array.isArray(journal.completed)||journal.completed.some(i=>!Number.isInteger(i)||i<0||i>=journal.plan.operations.length))throw Error('无效的向导记录');
  return execute(io,journal.plan,journal);
}
module.exports={stable,profile,importProfile,metadataMerge,build,preflight,execute,resume,checkPlan,privatePath};
