'use strict';
const ROOTS = { inbox:'00_Inbox', projects:'01_Projects', areas:'02_Areas', resources:'03_Resources', archive:'04_Archive', templates:'05_Templates', system:'06_System', attachments:'99_Attachments' };
const CHINESE_ROOTS={inbox:'00_收件箱',projects:'01_项目',areas:'02_领域',resources:'03_资源',archive:'04_归档',templates:'05_模板',system:'06_系统',attachments:'99_附件'};
function presetRoots(preset){if(!['en','zh'].includes(preset))throw Error('Invalid directory preset');return {...(preset==='zh'?CHINESE_ROOTS:ROOTS)};}
const ROLES = Object.keys(ROOTS);
const DEFAULTS = { schemaVersion:1, language:'auto', displayName:'', statusFormat:'stable', routingEnabled:true,
  roots:ROOTS, files:{ categoryNote:'06_System/Configuration/归档分类清单.md', noteTemplate:'05_Templates/知识笔记模板.md', referenceTemplate:'05_Templates/资料笔记模板.md', guide:'06_System/Configuration/任务管理使用说明.md', defaultCover:'' } };
function within(path, root) { return typeof path==='string' && path.startsWith(root+'/'); }
function safePath(value) {
  if(typeof value!=='string'||!value||value!==value.trim()||value.startsWith('/')||value.includes('\\')||/[<>:"|?*\x00-\x1f]/.test(value))return false;
  return value.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!p.startsWith('.')&&!/[. ]$/.test(p)&&!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p));
}
function validate(settings) {
  if(settings.directoryPreset!==undefined&&!['en','zh','custom'].includes(settings.directoryPreset))throw Error('Invalid directory preset');
  if(!['auto','zh','en'].includes(settings.language))throw Error('Invalid language');
  if(!['stable','legacy-zh'].includes(settings.statusFormat))throw Error('Invalid task status format');
  for(const role of ROLES)if(!safePath(settings.roots[role]))throw Error('Invalid folder: '+role);
  const paths=ROLES.map(k=>settings.roots[k].normalize('NFC').toLowerCase());
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)if(paths[i]===paths[j]||within(paths[i],paths[j])||within(paths[j],paths[i]))throw Error('Folders must be separate: '+ROLES[i]+' / '+ROLES[j]);
  for(const [key,path] of Object.entries(settings.files))if((path||key!=='defaultCover')&&!safePath(path))throw Error('Invalid file path: '+key);
  const parentOf={categoryNote:'system',guide:'system',noteTemplate:'templates',referenceTemplate:'templates',ideaTemplate:'templates',defaultCover:'attachments',statusNote:'system',typeNote:'system',aiRules:'system'};
  for(const [key,role] of Object.entries(parentOf))if(settings.files[key]&&!within(settings.files[key],settings.roots[role]))throw Error('File must be inside '+role+': '+key);
  const filePaths=Object.values(settings.files).filter(Boolean).map(x=>x.normalize('NFC').toLowerCase());
  if(new Set(filePaths).size!==filePaths.length)throw Error('File paths must be different');
  if(typeof settings.displayName!=='string'||settings.displayName.length>80)throw Error('Invalid display name');
  return settings;
}
function load(data,legacy=false) {
  if(data?.schemaVersion>DEFAULTS.schemaVersion)throw Error('Settings were created by a newer plugin. Update the plugin before opening them.');
  const settings={...DEFAULTS,...(data||{}),roots:{...ROOTS,...data?.roots},files:{...DEFAULTS.files,...data?.files}};
  settings.schemaVersion=1;
  if(!settings.files.ideaTemplate)settings.files.ideaTemplate=settings.roots.templates+'/灵感记录模板.md';
  if(!data&&legacy){settings.displayName='';settings.language='zh';settings.statusFormat='legacy-zh';}
  return validate(settings);
}
function resolveLanguage(value,locale='en'){return value==='auto'?(/^zh(?:-|_|$)/i.test(locale)?'zh':'en'):value;}
function eligible(path,roots){return typeof path==='string'&&safePath(path)&&/\.md$/i.test(path)&&['inbox','projects','areas','resources','archive'].some(k=>within(path,roots[k]));}
module.exports={ROOTS,CHINESE_ROOTS,presetRoots,ROLES,DEFAULTS,within,safePath,validate,load,resolveLanguage,eligible};
