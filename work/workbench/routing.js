'use strict';
const {TFile,TFolder,Notice}=require('obsidian');
const Config=require('./config');
class Controller {
  constructor(plugin){this.plugin=plugin;this.timers=new Map();this.last=new Map();this.moving=new Set();this.failures=new Map();this.ready=false;}
  get active(){return !this.plugin._unloaded&&this.plugin.ready&&!this.plugin.setupApplying&&this.plugin.settings.routingEnabled&&!this.plugin.routingBlocked();}
  inInbox(file){return file instanceof TFile&&file.extension==='md'&&this.plugin.inRoot(file,'inbox');}
  token(file){const value=this.plugin.fm(file).category;return value==null?'':typeof value==='string'?value.trim():JSON.stringify(value);}
  reset(){for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();this.last.clear();this.failures.clear();for(const file of this.plugin.app.vault.getMarkdownFiles())if(this.inInbox(file))this.last.set(file,this.token(file));}
  start(){
    const p=this.plugin;
    p.addCommand({id:'route-current-note',name:p.t('归档当前 Inbox 笔记'),checkCallback:checking=>{const file=p.app.workspace.getActiveFile();if(!this.inInbox(file))return false;if(!checking)this.route(file,true).catch(e=>this.notify(file,e.message));return true;}});
    p.addCommand({id:'open-category-list',name:p.t('打开归档分类清单'),callback:()=>p.app.workspace.openLinkText(p.settings.files.categoryNote,'',false)});
    p.app.workspace.onLayoutReady(()=>{if(p._unloaded)return;this.startTimer=setTimeout(()=>{if(p._unloaded)return;this.reset();this.ready=true;},1000);});
    p.registerEvent(p.app.vault.on('create',file=>{if(this.ready&&this.inInbox(file))this.last.set(file,'');}));
    p.registerEvent(p.app.metadataCache.on('changed',file=>{
      if(!this.ready||!this.inInbox(file))return;
      const value=this.token(file),previous=this.last.get(file);this.last.set(file,value);
      if(value!==previous&&value)this.queue(file);
    }));
    p.registerEvent(p.app.vault.on('rename',file=>{this.cancel(file);this.last.delete(file);this.failures.delete(file);if(this.inInbox(file))this.last.set(file,this.token(file));}));
    p.registerEvent(p.app.vault.on('delete',file=>{this.cancel(file);this.last.delete(file);this.failures.delete(file);}));
  }
  safeDestination(value){
    if(typeof value!=='string')return '';
    const path=value.trim(),roots=this.plugin.roots;
    return Config.safePath(path)&&['projects','areas','resources'].some(k=>path===roots[k]||Config.within(path,roots[k]))?path:'';
  }
  cancel(file){clearTimeout(this.timers.get(file));this.timers.delete(file);}
  queue(file){if(!this.active)return;this.cancel(file);this.timers.set(file,setTimeout(()=>{this.timers.delete(file);this.route(file).catch(e=>this.notify(file,e.message));},450));}
  notify(file,text,manual=false){if(manual||this.failures.get(file)!==text){new Notice(this.plugin.t(text));this.failures.set(file,text);}}
  async route(file,manual=false){
    if(!this.ready||!this.inInbox(file))return false;
    if(!this.active){if(manual)this.notify(file,'内置分类移动已暂停：请检查开关及旧分类插件',true);return false;}
    if(this.moving.has(file))return false;
    this.moving.add(file);
    try{return await this.plugin.run(file,async()=>{
      const p=this.plugin,source=file.path,fm=await p.readFrontmatter(file),value=fm.category;
      if(value==null||value==='')return false;
      const category=this.safeDestination(value);
      if(!category){this.notify(file,'请选择有效的分类目录，笔记保留在 Inbox',manual);return false;}
      const list=p.app.vault.getAbstractFileByPath(p.settings.files.categoryNote);
      if(!(list instanceof TFile)){this.notify(file,'找不到分类清单，笔记保留在 Inbox',manual);return false;}
      const text=await p.app.vault.read(list);
      const allowed=new Set(text.split(/\r?\n/).map(v=>this.safeDestination(v)).filter(Boolean));
      if(!allowed.has(category)){this.notify(file,'目标不在分类清单中，笔记保留在 Inbox',manual);return false;}
      if(!(p.app.vault.getAbstractFileByPath(category) instanceof TFolder)){this.notify(file,'分类目录不存在，请先创建目录',manual);return false;}
      const target=category+'/'+file.name;
      if(p.app.vault.getAbstractFileByPath(target)){this.notify(file,'目标已有同名笔记，已停止移动',manual);return false;}
      const latest=await p.readFrontmatter(file);
      if(!this.ready||!p.ready||!this.active||!this.inInbox(file)||file.path!==source||p.app.vault.getAbstractFileByPath(source)!==file)return false;
      if(typeof latest.category!=='string'||latest.category.trim()!==category){this.queue(file);return false;}
      // No await between the final target check and Obsidian's link-aware rename.
      if(p.app.vault.getAbstractFileByPath(target))return false;
      await p.app.fileManager.renameFile(file,target);this.failures.delete(file);this.last.delete(file);p.refresh();return true;
    });}finally{this.moving.delete(file);}
  }
  stop(){this.ready=false;clearTimeout(this.startTimer);for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();}
}
module.exports={Controller};
