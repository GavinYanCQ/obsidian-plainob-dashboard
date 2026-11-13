'use strict';
const {Modal,Setting,Notice,TFile,TFolder,getLanguage}=require('obsidian');
const I18n=require('./i18n');
const Config=require('./config'),Resources=require('./resources'),Setup=require('./setup');
const copy=x=>JSON.parse(JSON.stringify(x));
function loaded(plugin,id){return Boolean(plugin.app.plugins?.getPlugin?.(id)||plugin.app.plugins?.plugins?.[id]);}
function makeIO(plugin){
  const app=plugin.app,v=app.vault,a=v.adapter,configDir=v.configDir||'.obsidian';
  const inventory=async()=>{const all=v.getAllLoadedFiles?v.getAllLoadedFiles():[...v.getMarkdownFiles(),...Object.values(plugin.roots).map(p=>v.getAbstractFileByPath(p)).filter(Boolean)];return all.filter(f=>f.path).map(f=>({path:f.path,kind:f instanceof TFolder?'directory':'file'}));};
  const inspect=async path=>{const stat=await a.stat(path);if(!stat)return {kind:'missing'};return stat.type==='folder'?{kind:'directory'}:{kind:'file',text:await a.read(path)};};
  const aliasCheck=async path=>{const key=path.normalize('NFC').toLowerCase(),alias=(await inventory()).find(x=>x.path.normalize('NFC').toLowerCase()===key&&x.path!==path);if(alias)throw Error(plugin.t('大小写或 Unicode 等价路径已存在')+': '+alias.path);};
  const privateMkdir=async path=>{for(const part of [...path.split('/').map((_,i)=>path.split('/').slice(0,i+1).join('/'))]){const stat=await a.stat(part);if(!stat)await a.mkdir(part);else if(stat.type!=='folder')throw Error('Folder occupied: '+part);}};
  return {configDir,locale:getLanguage(),inventory,inspect,metadataLoaded:()=>loaded(plugin,'metadata-menu'),currentSettings:()=>copy(plugin.settings),validateSettings:next=>plugin.validateSettingsChange(next),setSettings:next=>plugin.updateSettings(next,{fromSetup:true}),cancelled:()=>plugin.setupCancelled===true||plugin._unloaded===true,
    async mkdir(path){await aliasCheck(path);const state=await inspect(path);if(state.kind==='missing')await v.createFolder(path);else if(state.kind!=='directory')throw Error('Folder occupied: '+path);},
    async write(path,text,before){
      await aliasCheck(path);const state=await inspect(path);
      if(before===null?state.kind!=='missing':state.kind!=='file'||state.text!==before)throw Error(plugin.t('文件发生变化，已停止：')+path);
      if(path.startsWith(configDir+'/')){if(path===configDir+'/plugins/metadata-menu/data.json'&&loaded(plugin,'metadata-menu'))throw Error(plugin.t('请先关闭 Metadata Menu，再重新预览以写入下拉配置'));await a.write(path,text);return;}
      if(before===null){await v.create(path,text);return;}
      const file=v.getAbstractFileByPath(path);if(!(file instanceof TFile))throw Error('File not loaded: '+path);
      await v.process(file,current=>{if(current!==before)throw Error(plugin.t('文件发生变化，已停止：')+path);return text;});
    },privateMkdir,privateWrite:(path,text)=>a.write(path,text),
    async history(){const root=Setup.privatePath({configDir})+'/setup-backups';if(!await a.exists(root))return [];const listing=await a.list(root),rows=[];for(const folder of listing.folders.slice(-30)){try{const file=folder+'/journal.json',j=JSON.parse(await a.read(file));if(j.version===1&&/^[a-z0-9]+-[a-z0-9]+$/.test(j.id))rows.push({id:j.id,status:j.status,createdAt:j.createdAt,plan:j.plan});}catch{}}return rows.sort((x,y)=>String(y.createdAt).localeCompare(String(x.createdAt)));}
  };
}
class ProfileModal extends Modal{
  constructor(plugin){super(plugin.app);this.plugin=plugin;}
  onOpen(){const t=x=>this.plugin.t(x);this.titleEl.setText(t('导出迁移配置'));this.contentEl.createEl('p',{text:t('只包含目录、语言、称呼和任务规则，不包含笔记、密钥或同步连接。请复制到另一台设备的安装向导。')});const box=this.contentEl.createEl('textarea',{cls:'gwb-profile-text'});box.value=JSON.stringify(Setup.profile(this.plugin.settings),null,2);box.readOnly=true;box.setAttribute('aria-label',t('迁移配置'));const select=this.contentEl.createEl('button',{text:t('选中全部')});select.addEventListener('click',()=>{box.focus();box.select();});}
}
class Wizard extends Modal{
  constructor(plugin){super(plugin.app);this.plugin=plugin;this.io=makeIO(plugin);this.step=0;this.draft=copy(plugin.settings);this.options={mode:plugin.settings.setup?.completed||plugin.settings.statusFormat==='legacy-zh'?'existing':'new',categories:false,templates:true,metadata:false,ai:false,metadataChoices:{}};this.busy=false;this.runId=null;
    if(this.options.mode==='new'){this.options.categories=true;this.selectDirectoryPreset(Config.resolveLanguage(this.draft.language,getLanguage()));}
  }
  selectDirectoryPreset(value){
    if(!['en','zh','custom'].includes(value))throw Error('Invalid directory preset');
    if(this.options.mode!=='new'&&value!=='custom')throw Error(this.t('接入已有库时保留目录名称，请在下方对应现有位置'));
    this.draft.directoryPreset=value;
    if(value!=='custom'){this.draft.roots=Config.presetRoots(value);this.draft.files=Resources.freshFiles(this.draft.roots,Config.resolveLanguage(this.draft.language,getLanguage()));}
  }
  changeInterfaceLanguage(value){this.draft.language=value;}

  t(key,params){return I18n.translate(key,Config.resolveLanguage(this.draft.language,getLanguage()),params);}
  onOpen(){this.modalEl.addClass('gwb-setup-modal');this.render();}
  onClose(){if(this.busy)this.plugin.setupCancelled=true;}
  heading(){this.titleEl.setText(this.t('工作台安装向导'));this.contentEl.empty();this.contentEl.createEl('p',{cls:'gwb-muted',text:this.t('第 {0} 步，共 4 步',{0:Math.min(this.step+1,4)})});}
  button(label,fn,cta=false){const b=this.contentEl.createEl('button',{text:this.t(label),cls:cta?'mod-cta':''});b.disabled=this.busy;b.addEventListener('click',()=>{Promise.resolve().then(fn).catch(e=>this.showError(e));});return b;}
  showError(error){this.error=error.message;const text=this.contentEl.createEl('p',{cls:'gwb-error',text:this.t(error.message)});text.setAttribute('role','alert');}
  render(){
    this.heading();
    if(this.step===0)this.entry();else if(this.step===1)this.folders();else if(this.step===2)this.integrations();else if(this.step===3)this.preview();else this.finished();
  }
  entry(){
    new Setting(this.contentEl).setName(this.t('使用方式')).addDropdown(d=>d.addOption('new',this.t('新建一套系统')).addOption('adopt',this.t('接入已有笔记库')).addOption('existing',this.t('接入已有工作台')).setValue(this.options.mode).onChange(value=>{
      this.options.mode=value;this.options.categories=value==='new';
      if(value==='new'){const name=this.draft.displayName,language=this.draft.language;this.draft=Config.load();this.draft.displayName=name;this.draft.language=language;this.selectDirectoryPreset(Config.resolveLanguage(language,getLanguage()));}
      else this.draft=copy(this.plugin.settings);
      this.render();
    }));
    this.contentEl.createEl('p',{text:this.t('新建模式提供默认目录；接入模式只对应已有位置，不移动或批量改写旧笔记。')});
    new Setting(this.contentEl).setName(this.t('界面语言')).addDropdown(d=>d.addOption('auto',this.t('跟随 Obsidian')).addOption('zh','简体中文').addOption('en','English').setValue(this.draft.language).onChange(value=>{this.changeInterfaceLanguage(value);this.render();}));
    new Setting(this.contentEl).setName(this.t('首页称呼')).addText(x=>x.setValue(this.draft.displayName).onChange(v=>this.draft.displayName=v));
    this.contentEl.createEl('p',{text:this.t('在另一台 Windows 或 macOS 设备接入同一套工作台时，可导入迁移配置，保留相同目录与任务状态规则。')});
    const imported=this.contentEl.createEl('textarea',{cls:'gwb-profile-text',attr:{placeholder:this.t('在此粘贴迁移配置（可选）')}});imported.setAttribute('aria-label',this.t('迁移配置'));
    this.button('导入迁移配置',()=>{this.draft=Setup.importProfile(imported.value);this.options.mode='existing';this.options.categories=false;this.render();new Notice(this.t('已读取迁移配置，尚未写入任何文件'));});
    this.button('下一步',()=>{this.step=1;this.render();},true);
    this.io.history().then(rows=>{if(this.step!==0)return;const pending=rows.find(x=>['running','interrupted'].includes(x.status));if(pending){this.contentEl.createEl('p',{text:this.t('检测到未完成的安装，可检查后继续')});this.button('检查并继续上次安装',()=>{this.plan=pending.plan;this.runId=pending.id;this.step=3;this.render();});}}).catch(e=>this.showError(e));
  }
  folders(){
    if(this.options.mode==='new')new Setting(this.contentEl).setName(this.t('目录方案')).setDesc(this.t('目录名称与界面语言独立；切换预设会重置本页目录和模板路径，最终以预览为准')).addDropdown(d=>{this.presetControl=d;d.addOption('en',this.t('英文编号目录')).addOption('zh',this.t('中文编号目录')).addOption('custom',this.t('使用已有目录或自定义')).setValue(this.draft.directoryPreset||'custom').onChange(value=>{this.selectDirectoryPreset(value);this.render();});});
    else this.contentEl.createEl('p',{text:this.t('接入已有库时保留目录名称，请在下方对应现有位置')});
    this.contentEl.createEl('p',{text:this.t('界面语言只改变菜单和提示，不会重命名现有目录或笔记')});
    const roles={inbox:'收集箱',projects:'项目',areas:'领域',resources:'资源',archive:'归档',templates:'模板',system:'系统',attachments:'附件'};
    for(const [role,label]of Object.entries(roles))new Setting(this.contentEl).setName(this.t(label)).addText(x=>x.setValue(this.draft.roots[role]).onChange(value=>{
      const old=this.draft.roots[role];this.draft.roots[role]=value;this.draft.directoryPreset='custom';this.presetControl?.setValue('custom');
      for(const key of Object.keys(this.draft.files))if(Config.within(this.draft.files[key],old))this.draft.files[key]=value+this.draft.files[key].slice(old.length);
    }));
    new Setting(this.contentEl).setName(this.t('现有任务状态')).setDesc(this.t('迁移时与原设备一致；已有中文值会一直兼容')).addDropdown(d=>d.addOption('stable',this.t('稳定值 backlog / active / done')).addOption('legacy-zh',this.t('中文值 待办 / 执行中 / 已完成')).setValue(this.draft.statusFormat).onChange(value=>this.draft.statusFormat=value));
    new Setting(this.contentEl).setName(this.t('创建默认分类子目录')).setDesc(this.t('包含个人领域和资源分类，不创建任何个人项目')).addToggle(x=>x.setValue(this.options.categories).onChange(v=>this.options.categories=v));
    const details=this.contentEl.createEl('details');details.createEl('summary',{text:this.t('模板与清单的具体路径')});
    const labels={categoryNote:'分类清单路径',noteTemplate:'知识模板路径',referenceTemplate:'资料模板路径',ideaTemplate:'灵感模板路径',guide:'使用说明路径'};
    for(const [key,label]of Object.entries(labels))new Setting(details).setName(this.t(label)).addText(x=>x.setValue(this.draft.files[key]).onChange(v=>this.draft.files[key]=v));
    this.contentEl.createEl('p',{text:this.t('存在归档恢复记录时，先保持原目录对应关系；本向导不搬动旧笔记。')});
    this.button('上一步',()=>{this.step=0;this.render();});this.button('下一步',()=>{Config.validate(this.draft);this.step=2;this.render();},true);
  }
  integrations(){
    new Setting(this.contentEl).setName(this.t('补齐笔记模板')).setDesc(this.t('只创建缺少的模板，保留已存在的文件')).addToggle(x=>x.setValue(this.options.templates).onChange(v=>this.options.templates=v));
    new Setting(this.contentEl).setName(this.t('配置 Metadata Menu 下拉菜单')).setDesc(this.t('可选；只适配已验证的 0.8.12 版本，不下载安装插件')).addToggle(x=>x.setValue(this.options.metadata).onChange(v=>{this.options.metadata=v;this.render();}));
    if(this.options.metadata){
      this.contentEl.createEl('p',{text:this.t('同名字段默认保留。需要写入配置时，请先暂时关闭 Metadata Menu，完成后重新开启。')});
      for(const name of ['category','task_status','type'])new Setting(this.contentEl).setName(name).addDropdown(d=>d.addOption('keep',this.t('同名冲突时保留原规则')).addOption('replace',this.t('同名冲突时采用工作台规则（先备份）')).setValue(this.options.metadataChoices[name]||'keep').onChange(v=>this.options.metadataChoices[name]=v));
    }
    new Setting(this.contentEl).setName(this.t('提供 Claudian 整理规则')).setDesc(this.t('可选；已有规则保留，必要时仅向 CLAUDE.md 追加规则入口，不配置模型或账号')).addToggle(x=>x.setValue(this.options.ai).onChange(v=>this.options.ai=v));
    this.contentEl.createEl('p',{text:this.t('同步方式由你自行选择；工作台可独立使用，不配置同步服务。')});
    this.button('上一步',()=>{this.step=1;this.render();});this.button('生成配置预览',async()=>{this.plan=await Setup.build(this.io,this.draft,this.options);this.runId=null;this.step=3;this.render();},true);
  }
  preview(){
    const plan=this.plan;if(!plan){this.step=0;this.render();return;}
    this.contentEl.createEl('p',{text:this.t('以下是将要执行的内容，确认后才写入。已有笔记正文和任务属性不参与批量迁移。')});
    const list=this.contentEl.createEl('div',{cls:'gwb-setup-preview'}),labels={create:'创建',keep:'保留',blocked:'阻止',append:'追加',configure:'配置'};
    for(const op of plan.operations){const row=list.createEl('div',{cls:'gwb-setup-row'+(op.action==='blocked'?' gwb-error':'')});row.createEl('strong',{text:this.t(labels[op.action]||op.action)});row.createEl('span',{text:op.path==='@settings'?this.t('工作台设置'):op.path});if(op.reason)row.createEl('small',{text:this.t(op.reason)});}
    for(const warning of plan.warnings)this.contentEl.createEl('p',{cls:'gwb-setup-warning',text:this.t(warning)});
    if(plan.metadataDetails.length){const details=this.contentEl.createEl('details');details.createEl('summary',{text:this.t('查看下拉字段对应关系')});for(const field of plan.metadataDetails)details.createEl('p',{text:field.name+' → '+field.note+' · '+this.t({keep:'保留',add:'创建',replace:'配置',conflict:'同名冲突时保留原规则'}[field.action])});}
    const changes=plan.operations.filter(x=>['write'].includes(x.kind));
    for(const op of changes){const details=this.contentEl.createEl('details');details.createEl('summary',{text:this.t('查看变更内容')+': '+op.path});const before=details.createEl('pre');before.textContent=op.before||'';const after=details.createEl('pre');after.textContent=op.after;}
    this.contentEl.createEl('p',{text:this.t('修改配置前会在插件私有目录保存原文件和执行记录；中断后可以继续。')});
    this.button('上一步',()=>{this.runId=null;this.step=2;this.render();});
    const execute=this.button(this.runId?'继续安装':'确认并执行',()=>this.execute(),true);execute.disabled=plan.operations.some(x=>x.action==='blocked');
  }
  async execute(){
    if(this.plugin.setupApplying)throw Error(this.t('另一个安装向导正在执行'));
    this.busy=true;this.plugin.setupApplying=true;this.plugin.setupCancelled=false;
    this.contentEl.createEl('p',{text:this.t('正在配置，请稍候；关闭窗口会在当前操作结束后暂停。')});
    for(const button of this.contentEl.querySelectorAll('button'))button.disabled=true;
    try{this.result=this.runId?await Setup.resume(this.io,this.runId):await Setup.execute(this.io,this.plan);this.step=4;}
    catch(error){try{const rows=await this.io.history();const pending=rows.find(row=>['running','interrupted'].includes(row.status)&&Setup.stable(row.plan)===Setup.stable(this.plan));if(pending)this.runId=pending.id;}catch{}this.busy=false;this.render();this.showError(error);return;}
    finally{this.plugin.setupApplying=false;this.plugin.routing.reset();if(!this.plugin._unloaded)this.plugin.refresh();this.busy=false;}
    this.render();
  }
  finished(){
    this.contentEl.createEl('h3',{text:this.t('安装配置已完成')});
    this.contentEl.createEl('p',{text:this.t('保存编辑后正常重启 Obsidian；需要下拉菜单时重新开启 Metadata Menu。')});
    this.contentEl.createEl('p',{text:this.t('备份与执行记录')+': '+this.result.root});
    this.button('导出迁移配置',()=>new ProfileModal(this.plugin).open());this.button('打开首页工作台',()=>{this.close();this.plugin.open();},true);
  }
}
module.exports={Wizard,ProfileModal,makeIO};
