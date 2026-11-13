'use strict';
const { Plugin, ItemView, TFile, TFolder, Notice, Modal, Menu, SuggestModal, Setting, PluginSettingTab, getLanguage, normalizePath, parseYaml, stringifyYaml } = require('obsidian');
const Model = require('./model');
const Config = require('./config');
const I18n = require('./i18n');
const Routing = require('./routing');
const Search = require('./search');
const Hover = require('./hover');
const SetupUI = require('./setup-ui');
const VIEW = 'plainob-view';
const LEGACY_VIEW = 'gavin-workbench-view';
const MIME = 'application/x-plainob-task';
const TITLES = { backlog: ['Backlog', '待办'], active: ['Active', '执行中'], done: ['Done', '已完成'] };
const SNAP_KEYS = ['task', 'task_status', 'board_column', 'board_visible', 'completed_at', 'project', 'category'];
function snapshot(fm) { return Object.fromEntries(SNAP_KEYS.map(k => [k, fm?.[k] ?? ''])); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function add(parent, tag, cls, text) { return parent.createEl(tag, { cls, ...(text === undefined ? {} : { text }) }); }
function button(parent, text, action, cls = '') {
  const el = add(parent, 'button', 'gwb-button ' + cls, text); el.type = 'button';
  el.addEventListener('click', e => { e.stopPropagation(); Promise.resolve().then(() => action(e)).catch(err => { console.error('[PlainOB]', err); const owner=parent.closest?.('[data-gwb-owner]')?._gwbPlugin;new Notice(owner?owner.t(err.message||'操作未完成，请检查笔记属性。'):(err.message||'操作未完成，请检查笔记属性。')); }); });
  return el;
}

module.exports = class PlainOB extends Plugin {
  t(text, params) { return I18n.translate(text, this.language, params); }
  get language() { return Config.resolveLanguage(this.settings.language, getLanguage()); }
  get roots() { return this.settings.roots; }
  statusLabel(value){const normalized=this.model.status(value);const lane=this.model.LANES.find(k=>this.model.STATUS[k]===normalized)||'backlog';return this.t({backlog:'待办',active:'执行中',done:'已完成'}[lane]);}
  inRoot(file,role) { return Config.within(typeof file==='string'?file:file.path,this.roots[role]); }
  templatePath(name) { return this.settings.files[name.startsWith('灵感')?'ideaTemplate':name.startsWith('资料')?'referenceTemplate':'noteTemplate']; }
  routingBlocked() { return Boolean(this.app.plugins?.getPlugin?.('gavin-category-router')||this.app.plugins?.plugins?.['gavin-category-router']); }
  validateSettingsChange(next) {
    Config.validate(next);
    if(this.queues.size||this.sorting||this.routing?.moving.size)throw Error(this.t('请等待当前笔记操作完成后再保存设置'));
    const pathChanged=Object.keys(this.roots).some(k=>next.roots[k]!==this.roots[k]);
    if(pathChanged&&this.app.vault.getMarkdownFiles().some(f=>{const fm=this.fm(f);return fm.task_archive_origin||fm.project_archive_origin;}))throw Error(this.t('存在归档恢复记录，请先恢复相关任务；目录迁移向导将另行提供'));
  }
  async updateSettings(next,{fromSetup=false}={}) {
    if(this.setupApplying&&!fromSetup)throw Error(this.t('另一个安装向导正在执行'));
    this.validateSettingsChange(next);
    await this.saveData(next);
    for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();
    for(const timer of this.newTimers.values())clearTimeout(timer);this.newTimers.clear();
    this.settings=next;this.model=Model.create(next);
    this.routing.reset();this.known.clear();
    for(const file of this.app.vault.getMarkdownFiles())if(this.eligible(file))this.known.set(file,snapshot(this.fm(file)));
    this.refresh();
  }
  async onload() {
    const data=await this.loadData();
    const legacy=!data&&Boolean(this.app.vault.getAbstractFileByPath('06_System/Configuration/归档分类清单.md'));
    this.settings=Config.load(data,legacy);this.model=Model.create(this.settings);
    if(legacy){const cover=this.roots.attachments+'/Covers/default-note.svg';if(this.app.vault.getAbstractFileByPath(cover))this.settings.files.defaultCover=cover;await this.saveData(this.settings);}
    if(!data&&!legacy)await this.saveData(this.settings);
    this._unloaded=false;
    if(!data&&!legacy)this.app.workspace.onLayoutReady(()=>{this.setupWelcomeTimer=setTimeout(()=>{if(!this._unloaded)new SetupUI.Wizard(this).open();},800);});
    this.addSettingTab(new WorkbenchSettingsTab(this.app,this));
    this.addCommand({id:'setup-wizard',name:this.t('打开安装向导'),callback:()=>new SetupUI.Wizard(this).open()});
    this.addCommand({id:'export-profile',name:this.t('导出迁移配置'),callback:()=>new SetupUI.ProfileModal(this).open()});

    this.known = new Map(); this.queues = new Map(); this.timers = new Map(); this.newTimers = new Map(); this.views = new Set(); this.popovers = new Set(); this.ready = false;
    this.registerView(VIEW, leaf => new WorkbenchView(leaf, this));
    this.registerView(LEGACY_VIEW, leaf => new WorkbenchView(leaf,this,LEGACY_VIEW));
    this.addRibbonIcon('layout-dashboard', this.t("打开 PlainOB"), () => this.open());
    this.addCommand({ id: 'open-workbench', name: this.t("打开首页工作台"), callback: () => this.open('home') });
    this.addCommand({ id: 'open-task-board', name: this.t("打开完整任务看板"), callback: () => this.open('tasks') });
    this.addCommand({ id: 'plan-project-steps', name: this.t("安排项目步骤"), callback: async () => { const leaf = await this.open('tasks'); leaf.view.showPlanning = true; leaf.view.render(); } });
    this.addCommand({id:'new-idea',name:this.t('记录灵感'),callback:()=>new NewNoteModal(this,{idea:true}).open()});
    this.addCommand({ id: 'new-task', name: this.t("新建任务笔记"), callback: () => new NewNoteModal(this, { task: true }).open() });
    this.addCommand({ id: 'new-project', name: this.t("新建项目"), callback: () => new NewNoteModal(this, { makeProject: true, task: true }).open() });
    for(const [kind,template,name]of [['note','知识笔记模板','应用知识笔记模板'],['reference','资料笔记模板','应用资料笔记模板'],['idea','灵感记录模板','应用灵感记录模板']]){
      this.addCommand({id:'apply-'+kind+'-template',name:this.t(name),checkCallback:checking=>{const file=this.app.workspace.getActiveFile();if(!this.eligible(file))return false;if(!checking)this.applyTemplate(file,template).catch(e=>new Notice(this.t(e.message)));return true;}});
    }
    this.addCommand({ id: 'archive-project', name: this.t("归档当前已完成项目"), checkCallback: checking => {
      const file = this.app.workspace.getActiveFile(); if (!this.projectFolder(file)) return false;
      if (!checking) this.confirmArchive(file); return true;
    } });
    this.addCommand({ id: 'archive-completed-inbox', name: this.t("重试归档当前已完成独立事项"), checkCallback: checking => {
      const file = this.app.workspace.getActiveFile(); if (!this.eligible(file) || !file.path.startsWith(this.roots.inbox + '/')) return false;
      if (!checking) this.archiveStandalone(file).catch(e => new Notice(this.t(e.message))); return true;
    } });
    this.addCommand({ id: 'restore-reopened-task', name: this.t("重试恢复当前重新打开的独立事项"), checkCallback: checking => {
      const file = this.app.workspace.getActiveFile(); if (!this.eligible(file) || !this.model.archiveReturnPath(file.path, this.fm(file))) return false;
      if (!checking) this.restoreStandalone(file).catch(e => new Notice(this.t(e.message))); return true;
    } });
    this.addCommand({ id: 'restore-reopened-project', name: this.t("重试恢复当前项目到原目录"), checkCallback: checking => {
      const file=this.app.workspace.getActiveFile();if(!this.eligible(file))return false;
      const project=this.parent(file)||(this.isProject(file)?file:null);
      if(!project||!this.model.projectReturnFolder(project.path,this.fm(project)))return false;
      if(!checking)this.restoreProject(file).catch(e=>new Notice(this.t(e.message)));return true;
    } });
    this.registerEvent(this.app.metadataCache.on('changed', file => {
      if (!this.ready || this.setupApplying || !this.eligible(file)) return;
      this.schedule(file); this.refresh();
    }));
    this.registerEvent(this.app.vault.on('create', file => {
      if (!this.ready || this.setupApplying || !this.eligible(file)) return;
      // Only genuinely new Inbox notes get defaults. Existing notes elsewhere are untouched.
      if (file.path.startsWith(this.roots.inbox + '/')) {
        const timer = setTimeout(() => { this.newTimers.delete(file); this.initialize(file).catch(e => new Notice(this.t("新笔记属性未初始化：") + e.message)); }, 350);
        this.newTimers.set(file, timer);
      }
      this.refresh();
    }));
    this.registerEvent(this.app.vault.on('rename', () => this.refresh()));
    this.registerEvent(this.app.vault.on('delete', file => {
      const oldParent=this.eligible(file)?this.parent(file):null;
      this.known.delete(file); clearTimeout(this.timers.get(file)); this.timers.delete(file); this.refresh();
      clearTimeout(this.newTimers.get(file)); this.newTimers.delete(file);
      if(oldParent)this.syncProjectStatus(oldParent).catch(e=>new Notice(this.t(e.message)));
    }));
    this.routing=new Routing.Controller(this);this.routing.start();
    this.app.workspace.onLayoutReady(() => {
      this.startTimer = setTimeout(() => {
        for (const file of this.app.vault.getMarkdownFiles()) if (this.eligible(file)) this.known.set(file, snapshot(this.fm(file)));
        this.ready = true; this.refresh();
        // Reconcile existing live project summaries, without moving any folders or altering steps.
        for(const project of this.projects())this.syncProjectStatus(project).catch(e=>new Notice(this.t("项目进度更新未完成：")+e.message));
      }, 1000);
    });
  }
  eligible(file) { return file instanceof TFile && this.model.eligiblePath(file.path); }
  fm(file) { return this.app.metadataCache.getFileCache(file)?.frontmatter || {}; }
  parent(file) {
    const target = this.model.linkTarget(this.fm(file).project);
    return target ? this.app.metadataCache.getFirstLinkpathDest(target, file.path) : null;
  }
  children(file) {
    return this.app.vault.getMarkdownFiles().filter(f => this.eligible(f) && f !== file && this.parent(f) === file)
      .sort((a,b) => a.basename.localeCompare(b.basename, this.language==='zh'?'zh-CN':'en', { numeric: true }));
  }
  isProject(file) { return this.children(file).length > 0 || Boolean(this.projectFolder(file, true)); }
  projectFolder(file, includeArchived = false) {
    if (!this.eligible(file) || (!file.path.startsWith(this.roots.projects + '/') && !(includeArchived && file.path.startsWith(this.roots.archive + '/'))) || this.fm(file).project) return null;
    // An archive command must target a project summary, never the Projects root.
    const root=this.inRoot(file,'projects')?this.roots.projects:this.roots.archive;
    const parts=file.path.slice(root.length+1).split('/');
    return parts.length===2&&(/(?:总览| Overview)$/.test(file.basename)||this.fm(file).workbench_project===true||this.children(file).length)?file.parent:null;
  }
  records(showProjects = false) {
    return this.app.vault.getMarkdownFiles().filter(f => this.eligible(f) && this.model.visibleOnBoard(this.fm(f), this.isProject(f), showProjects))
      .map(file => ({ file, fm: this.fm(file) }));
  }
  projects() {
    return this.app.vault.getMarkdownFiles().filter(f => this.eligible(f) && this.isProject(f) && f.path.startsWith(this.roots.projects + '/'))
      .sort((a,b) => a.path.localeCompare(b.path, this.language==='zh'?'zh-CN':'en', {numeric:true}));
  }
  async hideFromBoard(file) {
    await this.run(file, () => this.app.fileManager.processFrontMatter(file, fm => { fm.board_visible = false; this.known.set(file, snapshot(fm)); }));
    this.refresh();
  }
  async syncProjectStatus(project) {
    if(!this.eligible(project))return;
    return this.run(project,async()=>{
      const steps=this.children(project);
      if(!steps.length)return;
      const states=await Promise.all(steps.map(f=>this.readFrontmatter(f)));
      const patch=this.model.projectProgress(await this.readFrontmatter(project),states);
      if(!Object.keys(patch).length)return;
      await this.app.fileManager.processFrontMatter(project,latest=>{
        Object.assign(latest,this.model.projectProgress(latest,states));this.known.set(project,snapshot(latest));
      });
      this.refresh();
    });
  }
  async syncRelatedProjects(file, previousProject) {
    const parents=new Set();
    const parent=this.parent(file);if(parent)parents.add(parent);
    if(this.isProject(file))parents.add(file);
    const oldTarget=this.model.linkTarget(previousProject);
    if(oldTarget){const old=this.app.metadataCache.getFirstLinkpathDest(oldTarget,file.path);if(old&&old!==file)parents.add(old);}
    await Promise.all([...parents].map(project=>this.syncProjectStatus(project)));
  }
  async archiveRelatedProjects(file) {
    const related=new Set(),parent=this.parent(file);
    if(parent)related.add(parent);if(this.isProject(file))related.add(file);
    for(const project of related)await this.archiveProject(project);
  }
  placeCard(file,column,{beforePath='',afterPath='',showProjects=false}={}) {
    const previous=this.sortQueue||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      const source=await this.readFrontmatter(file);
      const sameColumn=this.model.lane(source)===column&&this.model.visibleOnBoard(source,this.isProject(file),true);
      const before=this.app.vault.getAbstractFileByPath(beforePath),after=this.app.vault.getAbstractFileByPath(afterPath);
      const records=await Promise.all(this.records(showProjects).map(async r=>({file:r.file,fm:await this.readFrontmatter(r.file)})));
      const current=this.model.sortRecords(records.filter(r=>this.model.lane(r.fm)===column),column).map(r=>r.file);
      const ordered=this.model.insertInOrder(current,file,before,after);
      if(sameColumn&&ordered.length===current.length&&ordered.every((f,i)=>f===current[i]))return true;
      // A reorder is deliberately separate from a task action, including reopened cards still in Done.
      if(!sameColumn&&!await this.act(file,{kind:'move',column}))return false;
      this.sorting=true;
      try {
        for(let i=0;i<ordered.length;i++) {
          const f=ordered[i],rank=(i+1)*1024,latest=await this.readFrontmatter(f);
          if(latest.task!==true||this.model.lane(latest)!==column)continue;
          if(latest.board_order===rank&&(column!=='done'||latest.board_manual_order===true))continue;
          await this.run(f,()=>this.app.fileManager.processFrontMatter(f,fm=>{
            if(fm.task===true&&this.model.lane(fm)===column){fm.board_order=rank;if(column==='done')fm.board_manual_order=true;}
          }));
        }
      } finally {this.sorting=false;this.refresh();}
      return true;
    });
    this.sortQueue=next;return next;
  }
  run(file, job) {
    if(this.setupApplying)return Promise.reject(Error(this.t('另一个安装向导正在执行')));
    const prior = this.queues.get(file) || Promise.resolve();
    const next = prior.catch(() => {}).then(() => { if (!this.eligible(file) || this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error(this.t("笔记已移动或不存在")); return job(); });
    this.queues.set(file, next);
    next.finally(() => { if (this.queues.get(file) === next) this.queues.delete(file); }).catch(() => {});
    return next;
  }
  async initialize(file) {
    return this.run(file, async () => {
      await this.app.fileManager.processFrontMatter(file, fm => {
        for (const [key, value] of Object.entries(this.model.defaults(file.basename))) if (!Object.hasOwn(fm, key)) fm[key] = value;
        Object.assign(fm, this.model.reconcile(fm)); this.known.set(file, snapshot(fm));
      });
      this.refresh();
    });
  }
  schedule(file) {
    clearTimeout(this.timers.get(file));
    this.timers.set(file, setTimeout(() => {
      this.timers.delete(file); this.reconcileFile(file).catch(e => { console.error(this.t("[PlainOB] 属性更新"), e); new Notice(this.t("任务属性更新未完成：") + e.message); });
    }, 280));
  }
  async reconcileFile(file) {
    const observed = this.fm(file), previous = this.known.get(file), current = snapshot(observed);
    if (equal(previous, current)) return;
    if (!previous) { this.known.set(file, current); await this.syncRelatedProjects(file); return; }
    const completedNow = observed.task === true && this.model.done(observed) && !this.model.done(previous);
    const next = this.model.reconcile(observed, previous);
    if (!equal(snapshot(next), current)) {
      await this.run(file, () => this.app.fileManager.processFrontMatter(file, latest => {
        // Work on the latest frontmatter, never replace a newer edit with cached data.
        Object.assign(latest, this.model.reconcile(latest, previous)); this.known.set(file, snapshot(latest));
      }));
    } else this.known.set(file, current);
    if (completedNow) await this.archiveStandalone(file);
    else await this.restoreStandalone(file);
    await this.restoreProject(file);
    await this.syncRelatedProjects(file,previous.project);
    await this.archiveRelatedProjects(file);
    this.refresh();
  }
  async act(file, action) {
    if ((action.kind === 'complete' && action.checked) || (action.kind === 'move' && action.column === 'done')) {
      const children = this.children(file), states = await Promise.all(children.map(f => this.readFrontmatter(f)));
      const remaining = states.filter(fm => !this.model.done(fm));
      if (remaining.length) { new Notice(this.t("项目还有 {0} 个步骤未完成，请先完成步骤。", {0:remaining.length})); return false; }
    }
    await this.run(file, () => this.app.fileManager.processFrontMatter(file, fm => {
      Object.assign(fm, this.model.transition(fm, action));
      if (action.kind === 'complete' && !this.model.blank(fm.project)) fm.board_visible = true;
      this.known.set(file, snapshot(fm));
    }));
    // metadataCache is asynchronous; read fresh YAML for this decision below.
    await this.archiveStandalone(file);
    await this.restoreStandalone(file);
    await this.restoreProject(file);
    await this.syncRelatedProjects(file);
    await this.archiveRelatedProjects(file);
    this.refresh(); return true;
  }
  async archiveProject(file, manual = false) {
    const folder = this.projectFolder(file);
    if (!(folder instanceof TFolder)) return false;
    return this.run(file, async () => {
      const fm = await this.readFrontmatter(file);
      if (fm.task !== true || !this.model.done(fm)) return false;
      const children = this.children(file);
      const states=await Promise.all(children.map(f=>this.readFrontmatter(f)));
      if (states.some(data => !this.model.done(data))) {
        new Notice(this.t("项目仍有未完成步骤，未归档")); return false;
      }
      if(!this.model.projectArchiveReady(fm,states,manual))return false;
      const target = this.roots.archive + '/' + folder.name;
      if (!(this.app.vault.getAbstractFileByPath(this.roots.archive) instanceof TFolder)) throw new Error(this.t("归档目录不存在，项目保留在原目录"));
      if (this.app.vault.getAbstractFileByPath(target)) { new Notice(this.t("Archive 中已有同名项目，已停止移动；原目录均保留。")); return false; }
      if (this.projectFolder(file) !== folder) return false;
      await this.app.fileManager.processFrontMatter(file,latest=>{
        latest.project_archive_origin=folder.path;latest.project_archive_path=target;
        latest.board_column='done';
        this.known.set(file,snapshot(latest));
      });
      const latest=await this.readFrontmatter(file);
      if(!this.model.projectArchiveReady(latest,await Promise.all(children.map(f=>this.readFrontmatter(f))),manual))return false;
      await this.app.fileManager.renameFile(folder, target);
      this.refresh(); new Notice(this.t("已完成项目已整体移入归档")); return true;
    });
  }
  async restoreProject(trigger) {
    if(!this.eligible(trigger)||!trigger.path.startsWith(this.roots.archive + '/'))return false;
    const triggerFm=await this.readFrontmatter(trigger);
    if(triggerFm.task!==true||this.model.done(triggerFm))return false;
    const project=this.parent(trigger)||(this.isProject(trigger)?trigger:null);
    if(!project)return false;
    return this.run(project,async()=>{
      const current=await this.readFrontmatter(trigger);
      if(current.task!==true||this.model.done(current))return false;
      const parentFm=await this.readFrontmatter(project),target=this.model.projectReturnFolder(project.path,parentFm);
      const folder=this.projectFolder(project,true);
      if(!target||!(folder instanceof TFolder))return false;
      if(!(this.app.vault.getAbstractFileByPath(this.roots.projects) instanceof TFolder))throw new Error(this.t("项目目录不存在，项目暂留在归档"));
      if(this.app.vault.getAbstractFileByPath(target)){new Notice(this.t("原项目位置已有同名文件夹，已停止恢复；两个项目均保留。"));return false;}
      // Reopening a step invalidates the completed parent, but leaves all sibling states intact.
      const source=folder.path;
      await this.app.fileManager.processFrontMatter(project,latest=>{
        if(this.model.done(latest)){
          const column=this.model.status(current.task_status)===this.model.STATUS.active?'active':'backlog';
          latest.task_status=this.model.STATUS[column];latest.completed_at='';latest.board_column=column;
        }
        this.known.set(project,snapshot(latest));
      });
      if(this.model.projectReturnFolder(project.path,await this.readFrontmatter(project))!==target)return false;
      await this.app.fileManager.renameFile(folder,target);
      await this.app.fileManager.processFrontMatter(project,latest=>{
        if(latest.project_archive_origin===target&&latest.project_archive_path===source){delete latest.project_archive_origin;delete latest.project_archive_path;}
        this.known.set(project,snapshot(latest));
      });
      this.refresh();new Notice(this.t("项目已重新打开，整个文件夹已恢复到原目录"));return true;
    });
  }
  async readFrontmatter(file) {
    const text = await this.app.vault.read(file);
    const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    return match ? parseYaml(match[1]) || {} : {};
  }
  async archiveStandalone(file) {
    if (!this.eligible(file) || !file.path.startsWith(this.roots.inbox + '/')) return false;
    return this.run(file, async () => {
      const fm = await this.readFrontmatter(file), source = file.path;
      if (!this.model.autoArchive(source, fm, this.isProject(file))) return false;
      const folder = this.app.vault.getAbstractFileByPath(this.roots.archive);
      if (!(folder instanceof TFolder)) throw new Error(this.t("归档目录不存在，笔记仍保留在 Inbox"));
      const target = normalizePath(this.roots.archive + '/' + file.name);
      if (this.app.vault.getAbstractFileByPath(target)) { new Notice(this.t("Archive 中已有同名笔记，已停止移动；原文件均保留。")); return false; }
      // Recheck immediately before moving; never auto-rename or overwrite a conflict.
      if (file.path !== source || !this.model.autoArchive(file.path, await this.readFrontmatter(file), this.isProject(file))) return false;
      // Persist provenance in the note itself so reopening works after reload or sync.
      await this.app.fileManager.processFrontMatter(file, latest => {
        latest.task_archive_origin = source; latest.task_archive_path = target;
        this.known.set(file, snapshot(latest));
      });
      if (!this.model.autoArchive(file.path, await this.readFrontmatter(file), this.isProject(file))) return false;
      await this.app.fileManager.renameFile(file, target);
      new Notice(this.t("已完成的独立事项已移入归档")); return true;
    });
  }
  async restoreStandalone(file) {
    if (!this.eligible(file) || !file.path.startsWith(this.roots.archive + '/')) return false;
    return this.run(file, async () => {
      const source = file.path, fm = await this.readFrontmatter(file);
      const target = this.model.archiveReturnPath(source, fm);
      if (!target) return false;
      const folder = this.app.vault.getAbstractFileByPath(target.slice(0, target.lastIndexOf('/')));
      if (!(folder instanceof TFolder)) { new Notice(this.t("原目录不存在，任务保留在 Archive；恢复目录后可重试。")); return false; }
      if (this.app.vault.getAbstractFileByPath(target)) { new Notice(this.t("原目录中已有同名笔记，已停止恢复；两篇笔记均保留。")); return false; }
      if (file.path !== source || this.model.archiveReturnPath(file.path, await this.readFrontmatter(file)) !== target) return false;
      await this.app.fileManager.renameFile(file, target);
      await this.app.fileManager.processFrontMatter(file, latest => {
        if (latest.task_archive_origin === target && latest.task_archive_path === source) {
          delete latest.task_archive_origin; delete latest.task_archive_path;
        }
        this.known.set(file, snapshot(latest));
      });
      new Notice(this.t("任务已重新打开，并恢复到原目录")); return true;
    });
  }
  async open(mode = 'home', focus = '', folder = '') {
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0]||this.app.workspace.getLeavesOfType(LEGACY_VIEW)[0];
    if (!leaf) leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW, state: { mode, focus, folder }, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  openFile(file) { return this.app.workspace.getLeaf('tab').openFile(file); }
  refresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if(this.sorting)return;
      for (const popover of this.popovers) popover.render();
      for (const view of this.views) { if (!view.popover) view.render(true); else view.needsRefresh = true; }
    }, 180);
  }
  async applyTemplate(file, name) {
    const template = this.app.vault.getAbstractFileByPath(this.templatePath(name));
    if (!(template instanceof TFile)) throw new Error(this.t("找不到模板"));
    const raw = (await this.app.vault.read(template)).replaceAll('{{date:YYYY-MM-DD}}', this.model.stamp().slice(0,10)).replaceAll('{{title}}', file.basename);
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/); if (!match) throw new Error(this.t("模板属性格式无效"));
    const fields = parseYaml(match[1]), body = raw.slice(match[0].length).trim();
    await this.run(file, async () => {
      await this.app.fileManager.processFrontMatter(file, fm => {
        for (const [key, value] of Object.entries(fields)) if (!Object.hasOwn(fm, key)) fm[key] = value;
        fm.type = name.startsWith('资料') ? 'reference' : 'note'; this.known.set(file, snapshot(fm));
      });
      await this.app.vault.process(file, text => {
        const front = text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/); if (!front) throw new Error(this.t("笔记属性格式无效"));
        const existing = text.slice(front[0].length).trim();
        if (!existing || existing === '# ' + file.basename) return front[0].trimEnd() + '\n\n' + body + '\n';
        // Preserve existing text and append only missing section headings. Safe to apply twice.
        const headings = body.split('\n').filter(line => /^## /.test(line) && !existing.split(/\r?\n/).includes(line));
        return headings.length ? text.trimEnd() + '\n\n' + headings.join('\n\n\n') + '\n' : text;
      });
    });
    new Notice(this.t("已应用") + this.t(name) + this.t("，保留原分类、任务状态和已有正文")); this.refresh();
  }
  confirmArchive(file) {
    const folder = this.projectFolder(file);
    if (!(folder instanceof TFolder)) return new Notice(this.t("请打开项目总览笔记后归档"));
    if (!this.model.done(this.fm(file))) return new Notice(this.t("请先将项目整体标记为已完成"));
    if (this.children(file).some(f => !this.model.done(this.fm(f)))) return new Notice(this.t("项目仍有未完成步骤"));
    const all = this.app.vault.getFiles().filter(f => f.path.startsWith(folder.path + '/'));
    new ConfirmModal(this, this.t("归档整个项目"), this.t("将 {0} 及其中 {1} 个文件整体移动到 {2}/{3}。只保留一份，内部链接由 Obsidian 更新。", {0:folder.path,1:all.length,2:this.roots.archive,3:folder.name}), async () => {
      await this.archiveProject(file, true);
    }).open();
  }
  onunload() {
    this._unloaded=true;this.setupCancelled=true;clearTimeout(this.setupWelcomeTimer);
    this.routing?.stop();
    this.ready = false; clearTimeout(this.startTimer); clearTimeout(this.refreshTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const timer of this.newTimers.values()) clearTimeout(timer);
    for (const popover of [...this.popovers]) popover.close();
  }
};

class WorkbenchView extends ItemView {
  get model(){return this.plugin.model;}
  get roots(){return this.plugin.roots;}
  t(text,params){return this.plugin.t(text,params);}
  statusLabel(value){return this.plugin.statusLabel(value);}

  constructor(leaf, plugin, viewType=VIEW) { super(leaf); this.viewType=viewType;this.plugin = plugin; this.state = { mode: 'home' }; this.query = ''; this.month = ''; this.showProjects = false; this.showPlanning = false; }
  getViewType() { return this.viewType; }
  getDisplayText() { return this.state.mode === 'tasks' ? this.t("任务看板") : this.state.mode === 'folder' ? (this.state.folder.split('/').pop() || this.t("知识目录")) : this.t("PlainOB"); }
  getIcon() { return 'layout-dashboard'; }
  getState() { return this.state; }
  async setState(state, result) { this.state = { mode: 'home', ...state }; this.render(); this.contentEl.scrollTop = 0; await super.setState(state, result); }
  async onOpen() { this.plugin.views.add(this); this.contentEl.addClass('gwb-view'); this.render(); }
  async onClose() { this.cancelHover?.(); this.popover?.close(); this.plugin.views.delete(this); }
  navigate(mode, folder = '', focus = '') { this.popover?.close(); this.state = { ...this.state, mode, folder, focus }; this.query = ''; this.month = ''; this.render(); this.contentEl.scrollTop = 0; this.app.workspace.requestSaveLayout(); }
  render(preserve = false) {
    if (!this.contentEl) return;
    this.cancelHover?.();
    const scrollTop = this.contentEl.scrollTop;
    const scrolls = {};
    if (preserve) for (const el of this.contentEl.querySelectorAll('[data-column-scroll]')) scrolls[el.dataset.columnScroll] = el.scrollTop;
    this.contentEl.empty();
    const root = add(this.contentEl, 'div', 'gwb-shell');root.dataset.gwbOwner='true';root._gwbPlugin=this.plugin;
    if (this.state.mode === 'home') this.home(root);
    else {
      const nav = add(root, 'div', 'gwb-nav'); button(nav, this.t("← 工作台"), () => this.navigate('home'), 'gwb-text-button');
      if (this.state.mode === 'tasks') this.tasks(root); else this.directory(root);
    }
    if (preserve) { this.contentEl.scrollTop = scrollTop; for (const el of this.contentEl.querySelectorAll('[data-column-scroll]')) el.scrollTop = scrolls[el.dataset.columnScroll] || 0; }
  }
  home(root) {
    const head = add(root, 'header', 'gwb-hero');
    add(head, 'div', 'gwb-eyebrow', this.app.vault.getName());
    const hour = new Date().getHours(); add(head, 'h1', '', this.plugin.t(hour<12?this.t("早上好"):hour<18?this.t("下午好"):this.t("晚上好"))+(this.plugin.settings.displayName?(this.plugin.language==='zh'?'，':', ')+this.plugin.settings.displayName:''));
    add(head, 'p', 'gwb-muted', 'Simple Notes & Tasks');
    const search = button(root, this.t("⌕  搜索笔记标题、正文与关键词…"), () => new SearchNotesModal(this.plugin).open(), 'gwb-global-search');
    search.setAttribute('aria-label', this.t("搜索整个知识库"));
    add(root, 'h2', 'gwb-section-title', this.t('Knowledge Directory'));
    const grid = add(root, 'div', 'gwb-directory-grid');
    for (const [folder, name, desc, icon, color] of [
      [this.roots.projects,'Projects',this.t("项目与目标"),'↗','amber'], [this.roots.areas,'Areas',this.t("长期关注领域"),'◇','green'],
      [this.roots.resources,'Resources',this.t("知识与参考资料"),'▥','blue'], [this.roots.archive,'Archive',this.t("历史归档"),'▱','purple']]) {
      const tile = button(grid, '', () => this.navigate('folder', folder), 'gwb-directory-tile');
      add(tile, 'span', 'gwb-dir-icon gwb-' + color, icon); add(tile, 'strong', '', this.t(name)); add(tile, 'span', 'gwb-muted', desc); add(tile, 'span', 'gwb-entry', this.t("进入目录 →"));
    }
    const heading = add(root, 'div', 'gwb-section-heading'); add(heading, 'h2', 'gwb-section-title', this.t('Task Management'));
    button(heading, this.t("新建任务"), () => new NewNoteModal(this.plugin, { task: true }).open(), 'gwb-text-button');
    this.planner(root);
    this.board(root, true);
    const footer = add(root, 'div', 'gwb-bottom-grid');
    const capture = add(footer, 'section', 'gwb-panel'); add(capture, 'h3', '', this.t('Quick Capture')); add(capture, 'p', 'gwb-muted', this.t("快速记录灵感和想法"));
    button(capture,this.t("💡 记录灵感"),()=>new NewNoteModal(this.plugin,{idea:true}).open());
    button(capture, this.t("＋ 记录笔记"), () => new NewNoteModal(this.plugin).open()); button(capture, this.t("＋ 新建项目"), () => new NewNoteModal(this.plugin, { makeProject: true, task: true }).open(), 'gwb-text-button');
    const recent = add(footer, 'section', 'gwb-panel'); add(recent, 'h3', '', this.t('Recent Notes'));
    const files = this.app.vault.getMarkdownFiles().filter(f => this.plugin.eligible(f)).sort((a,b) => b.stat.mtime - a.stat.mtime).slice(0,3);
    if (!files.length) add(recent, 'p', 'gwb-muted', this.t("从第一篇笔记开始。"));
    for (const file of files) button(recent, file.basename, () => this.plugin.openFile(file), 'gwb-recent-link');
    button(root, this.t("查看字段与任务使用说明 →"), () => this.app.workspace.openLinkText(this.plugin.settings.files.guide, '', true), 'gwb-guide gwb-text-button');
  }
  tasks(root) {
    const heading = add(root, 'div', 'gwb-section-heading'); add(heading, 'h1', '', this.t('Task Management'));
    button(heading, this.t("＋ 新建任务"), () => new NewNoteModal(this.plugin, { task: true }).open(), 'mod-cta');
    const toolbar = add(root, 'div', 'gwb-toolbar');
    const input = add(toolbar, 'input', 'gwb-task-search'); input.placeholder = this.t("筛选任务或项目…"); input.value = this.query; input.type = 'search'; input.setAttribute('aria-label',this.t("筛选任务"));
    let debounce; input.addEventListener('input', () => { this.query = input.value; clearTimeout(debounce); debounce = setTimeout(() => this.renderBoardOnly(root), 180); });
    const label = add(toolbar, 'label', 'gwb-filter-check'); const cb = add(label, 'input'); cb.type = 'checkbox'; cb.checked = this.showProjects; label.appendText(this.t("显示项目总览")); cb.addEventListener('change', () => { this.showProjects = cb.checked; this.renderBoardOnly(root); });
    const month = add(toolbar, 'select'); month.setAttribute('aria-label',this.t("筛选 Done 完成月份"));
    add(month, 'option', '', this.t("Done · 全部月份")).value = '';
    const months = [...new Set(this.plugin.records(true).map(r => String(r.fm.completed_at || '').slice(0,7)).filter(x => /^\d{4}-\d{2}$/.test(x)))].sort().reverse();
    for (const m of months) add(month, 'option', '', m).value = m;
    month.value = this.month; month.addEventListener('change', () => { this.month = month.value; this.renderBoardOnly(root); });
    add(root, 'p', 'gwb-help', this.t("勾选确认完成，再拖入 Done。每个步骤独立安排；悬停步骤查看所属项目。"));
    this.planner(root);
    this.board(root, false);
  }
  bindDrag(row, file) {
    row.draggable = true;
    row.addEventListener('dragstart', e => {
      if (e.target.closest('input,button,select')) { e.preventDefault(); return; }
      this.dragging = true;
      this.draggedFile = file;
      this.cancelHover?.();
      if(this.popover&&!this.popover.el.contains(row))this.popover.close();
      e.dataTransfer.setData(MIME, file.path); e.dataTransfer.effectAllowed = 'move'; row.addClass('is-dragging');
    });
    row.addEventListener('dragend', () => { this.dragging = false; this.draggedFile=null; row.removeClass('is-dragging'); for (const el of this.contentEl.querySelectorAll('.gwb-drag-over,.gwb-drop-before,.gwb-drop-after')) el.classList.remove('gwb-drag-over','gwb-drop-before','gwb-drop-after'); this.popover?.close(); if(this.needsRefresh){this.needsRefresh=false;this.render(true);} });
  }
  bindHover(card,link,show) {
    const preview=Hover.preview({show,canShow:()=>card.isConnected&&!this.dragging});
    const arm=()=>{this.cancelHover?.();this.cancelHover=preview.cancel;preview.arm();};
    card.addEventListener('mouseenter',arm);link.addEventListener('focus',arm);
    for(const name of ['mouseleave','pointerdown','dragstart'])card.addEventListener(name,preview.cancel);
    link.addEventListener('blur',preview.cancel);
  }
  planner(root) {
    const wrap = add(root, 'section', 'gwb-planner');
    const bar = add(wrap, 'div', 'gwb-section-heading');
    button(bar, (this.showPlanning ? '▾ ' : '▸ ') + this.t("项目与待安排步骤"), () => { this.showPlanning = !this.showPlanning; this.render(true); }, 'gwb-text-button');
    button(bar, this.t("＋ 新建项目"), () => new NewNoteModal(this.plugin, {makeProject:true,task:true}).open(), 'gwb-text-button');
    if (!this.showPlanning) return;
    const list = add(wrap, 'div', 'gwb-planner-list');
    const projects = this.plugin.projects();
    if (!projects.length) add(list, 'p', 'gwb-muted', this.t("新建项目后，在这里选择当前要推进的步骤。"));
    for (const project of projects) {
      const children = this.plugin.children(project), block = add(list, 'details', 'gwb-planner-project');
      block.dataset.project=project.path;block.open=(this.state.expandedProjects||[]).includes(project.path);
      const head = add(block, 'summary', 'gwb-project-summary');head.setAttribute('aria-label',this.t("展开或收起项目：")+project.basename);
      add(head,'span','gwb-project-chevron','▸').setAttribute('aria-hidden','true');
      add(head,'span','gwb-project-label',project.basename + ` · ${children.filter(f=>this.model.done(this.plugin.fm(f))).length}/${children.length}`);
      add(head,'span','gwb-project-status',this.statusLabel(this.plugin.fm(project).task_status));
      const manage=button(head, this.t("管理项目"), () => this.showProject(project, head), 'gwb-text-button');
      manage.addEventListener('click',e=>e.preventDefault());
      block.addEventListener('toggle',()=>{
        const expanded=new Set(this.state.expandedProjects||[]);
        if(block.open)expanded.add(project.path);else expanded.delete(project.path);
        this.state.expandedProjects=[...expanded];this.app.workspace.requestSaveLayout();
      });
      if (!children.length) add(block, 'p', 'gwb-muted', this.t("暂无步骤，点击“管理项目”添加。"));
      for (const file of children) {
        const fm = this.plugin.fm(file), visible = this.model.visibleOnBoard(fm,false), row = add(block, 'div', 'gwb-planning-row');
        row.dataset.path = file.path; this.bindDrag(row,file);
        const info = add(row, 'div', 'gwb-card-content'); add(info, 'span', 'gwb-task-title', file.basename);
        add(info, 'span', 'gwb-muted', visible ? this.statusLabel(fm.task_status) + this.t(" · 已在看板") : this.t("未安排到当前看板"));
        if (!visible) button(row, this.t("加入待办"), () => this.plugin.act(file,{kind:'move',column:'backlog'}), 'gwb-text-button');
        else button(row, this.t("移出看板"), () => this.plugin.hideFromBoard(file), 'gwb-text-button');
      }
    }
    add(wrap, 'p', 'gwb-help', this.t("拖动步骤到下方待办或执行中，或点击“加入待办”。未安排的步骤仍保留在项目中。"));
  }
  renderBoardOnly(root) { root.querySelector('.gwb-board')?.remove(); this.board(root, false); }
  board(root, compact) {
    const board = add(root, 'div', 'gwb-board' + (compact ? ' gwb-compact' : ' gwb-full'));
    const records = this.plugin.records(!compact && this.showProjects);
    for (const column of this.model.LANES) {
      const section = add(board, 'section', 'gwb-column gwb-' + column + (this.state.focus === column ? ' gwb-highlight' : ''));
      section.dataset.column = column;
      const all = this.model.sortRecords(records.filter(r => this.model.lane(r.fm) === column),column).filter(r=>!this.query||(r.file.basename+' '+r.fm.summary+' '+this.model.linkTarget(r.fm.project)).toLowerCase().includes(this.query.toLowerCase()));
      let items = all.filter(r => column !== 'done' || !this.month || String(r.fm.completed_at || '').startsWith(this.month));
      const head = add(section, 'div', 'gwb-column-heading');
      const title = add(head, 'div'); add(title, 'h3', '', this.t(TITLES[column][0])); if(this.plugin.language==='zh')add(title, 'span', 'gwb-muted', TITLES[column][0]);
      add(head, 'span', 'gwb-count', String(all.length).padStart(2,'0'));
      const list = add(section, 'div', 'gwb-column-list'); list.dataset.columnScroll = column;
      const shown = compact ? items.slice(0,5) : items;
      if (!shown.length) add(list, 'div', 'gwb-empty', column === 'done' ? this.t("完成记录会保存在这里") : column === 'active' ? this.t("给重要的事留出空间") : this.t("添加任务，开始下一步"));
      for (const record of shown) this.card(list, record, column, compact);
      const clearIndicator=()=>{for(const el of list.querySelectorAll('.gwb-drop-before,.gwb-drop-after'))el.classList.remove('gwb-drop-before','gwb-drop-after');};
      list.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(MIME)) {
        e.preventDefault();e.dataTransfer.dropEffect='move';section.addClass('gwb-drag-over');clearIndicator();
        const rows=[...list.querySelectorAll('.gwb-task-card')].filter(el=>el.dataset.path!==this.draggedFile?.path);
        const before=rows.find(el=>e.clientY<el.getBoundingClientRect().top+el.getBoundingClientRect().height/2);
        if(before)before.addClass('gwb-drop-before');else rows.at(-1)?.addClass('gwb-drop-after');
        const rect=list.getBoundingClientRect();if(e.clientY<rect.top+50)list.scrollTop-=18;if(e.clientY>rect.bottom-50)list.scrollTop+=18;
      } });
      list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) {section.removeClass('gwb-drag-over');clearIndicator();} });
      list.addEventListener('drop', async e => {
        if (!e.dataTransfer.types.includes(MIME)) return; e.preventDefault(); section.removeClass('gwb-drag-over');clearIndicator();
        const file = this.app.vault.getAbstractFileByPath(e.dataTransfer.getData(MIME)); if (!this.plugin.eligible(file)) return;
        const rows = [...list.querySelectorAll('.gwb-task-card')].filter(el => el.dataset.path !== file.path);
        const before = rows.find(el => e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height/2);
        try {
          await this.plugin.placeCard(file,column,{beforePath:before?.dataset.path,afterPath:before?'':rows.at(-1)?.dataset.path,showProjects:!compact&&this.showProjects});
        } catch(err) { new Notice(this.t(err.message)); }
      });
      if (compact) button(section, this.t("查看全部 · 共 {0} 项 →", {0:all.length}), () => this.navigate('tasks', '', column), 'gwb-view-all gwb-text-button');
      else if (column !== 'done') button(section, this.t("＋ 添加任务"), () => new NewNoteModal(this.plugin, { task: true, column }).open(), 'gwb-add-task gwb-text-button');
    }
  }
  card(parent, record, column) {
    const { file, fm } = record, plugin = this.plugin;
    const children = plugin.children(file), complete = this.model.done(fm), isProject = plugin.isProject(file);
    const card = add(parent, 'div', 'gwb-task-card' + (complete ? ' is-complete' : '') + (isProject ? ' is-project' : ''));
    card.dataset.path = file.path; this.bindDrag(card,file);
    const checkbox = add(card, 'input', 'gwb-complete-checkbox'); checkbox.type = 'checkbox'; checkbox.checked = complete; checkbox.setAttribute('aria-label', (complete ? this.t("取消完成：") : this.t("完成：")) + file.basename);
    checkbox.addEventListener('change', async () => { checkbox.disabled = true; try { await plugin.act(file, { kind: 'complete', checked: checkbox.checked }); } catch(e) { new Notice(this.t(e.message)); } finally { checkbox.disabled = false; checkbox.checked = this.model.done(await plugin.readFrontmatter(file)); } });
    const content = add(card, 'div', 'gwb-card-content');
    const link = add(content, 'a', 'gwb-task-title internal-link', file.basename); link.href = '#'; link.setAttribute('aria-label',this.t("打开笔记：") + file.basename);
    link.addEventListener('click', e => { e.preventDefault(); this.popover?.close(); plugin.openFile(file); });
    if (isProject) {
      const completed = children.filter(f => this.model.done(plugin.fm(f))).length;
      add(content, 'span', 'gwb-project-progress', this.t("{0}/{1} 步骤", {0:completed,1:children.length}));
      this.bindHover(card,link,()=>this.showProject(file,card));
      button(content, this.t("查看步骤"), () => this.showProject(file, card), 'gwb-steps-button gwb-text-button');
    } else if (fm.project) {
      const project = plugin.parent(file);
      const chip = button(content, '↗ ' + (project?.basename || this.model.linkTarget(fm.project).split('/').pop()), () => {
        if (project) this.showProject(project,card,file); else new Notice(this.t("所属项目链接暂时无法解析，请检查 project 属性"));
      }, 'gwb-card-project gwb-text-button');
      if(project)this.bindHover(card,link,()=>this.showProject(project,card,file));
    }
    if (fm.completed_at && complete) add(content, 'time', 'gwb-completed-time', '✓ ' + this.model.displayTime(fm.completed_at));
    if (complete && column !== 'done') add(content, 'span', 'gwb-pending-placement', this.t("已完成 · 可拖至 Done"));
    if (!complete && column === 'done') add(content, 'span', 'gwb-pending-placement', this.t("已重新打开 · 可拖回待办或执行中"));
    const menu = button(card, '⋯', e => {
      const popup = new Menu();
      for (const lane of this.model.LANES) popup.addItem(item => item.setTitle(this.t("移至") + this.t(TITLES[lane][1])).onClick(() => plugin.act(file, { kind: 'move', column: lane }).catch(e => new Notice(this.t(e.message)))));
      popup.addItem(item => item.setTitle(this.t("关联到项目…")).onClick(() => new ProjectPicker(plugin, file).open()));
      if (!this.model.blank(fm.project)) popup.addItem(item => item.setTitle(this.t("移出当前看板（保留任务与项目关联）")).onClick(() => plugin.hideFromBoard(file)));
      if (plugin.projectFolder(file)) popup.addItem(item => item.setTitle(this.t("归档整个项目…")).onClick(() => plugin.confirmArchive(file)));
      popup.showAtMouseEvent(e);
    }, 'gwb-card-menu'); menu.setAttribute('aria-label', this.t("任务操作：") + file.basename);
  }
  showProject(file, anchor, focusFile = null) { if (this.popover?.file === file && this.popover?.focusFile === focusFile) return; this.popover?.close(); this.popover = new ProjectPopover(this, file, anchor, focusFile); }
  directory(root) {
    const path = this.state.folder, folder = this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) { add(root,'p','gwb-empty',this.t("目录不存在")); return; }
    const crumb = add(root,'div','gwb-breadcrumb');
    const parts = path.split('/');
    parts.forEach((part,i) => { if(i) add(crumb,'span','',' / '); button(crumb,part,()=>this.navigate('folder',parts.slice(0,i+1).join('/')),'gwb-text-button'); });
    add(root,'h1','',parts.at(-1));
    const folders = folder.children.filter(f => f instanceof TFolder && !f.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name));
    if (folders.length) {
      const grid=add(root,'div','gwb-folder-grid');
      for(const sub of folders) { const b=button(grid,'',()=>this.navigate('folder',sub.path),'gwb-folder-tile'); add(b,'strong','','▱ '+sub.name); const count=this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(sub.path+'/')).length; add(b,'span','gwb-muted',this.t("{0} 篇笔记 →", {0:count})); }
    }
    const files=folder.children.filter(f=>f instanceof TFile && f.extension==='md').sort((a,b)=>a.basename.localeCompare(b.basename,this.plugin.language==='zh'?'zh-CN':'en',{numeric:true}));
    const shelf=add(root,'div','gwb-book-grid');
    if(!files.length&&!folders.length) add(root,'p','gwb-empty',this.t("这里还没有笔记。"));
    for(const file of files) {
      const fm=this.plugin.fm(file), card=button(shelf,'',()=>this.plugin.openFile(file),'gwb-book-card');
      let cover=this.model.linkTarget(fm.cover);
      if(!cover) cover=this.plugin.settings.files.defaultCover;
      const image=this.app.metadataCache.getFirstLinkpathDest(cover,file.path);
      if(image instanceof TFile) { const img=add(card,'img','gwb-book-cover'); img.src=this.app.vault.getResourcePath(image); img.alt=file.basename+this.t(" 封面"); img.loading='lazy'; }
      else add(card,'div','gwb-book-placeholder',file.basename);
      add(card,'strong','gwb-book-title',file.basename); if(fm.summary) add(card,'span','gwb-book-summary',String(fm.summary));
    }
  }
}

class ProjectPopover {
  get model(){return this.plugin.model;}
  get roots(){return this.plugin.roots;}
  t(text,params){return this.plugin.t(text,params);}
  statusLabel(value){return this.plugin.statusLabel(value);}

  constructor(view, file, anchor, focusFile = null) {
    this.view=view; this.plugin=view.plugin; this.file=file; this.anchor=anchor; this.focusFile=focusFile; this.plugin.popovers.add(this);
    this.el=add(anchor.ownerDocument.body,'div','gwb-project-popover');this.el.dataset.gwbOwner='true';this.el._gwbPlugin=this.plugin; this.el.setAttribute('role','dialog'); this.el.setAttribute('aria-label',file.basename+this.t("的步骤"));
    const rect=anchor.getBoundingClientRect(), win=anchor.ownerDocument.defaultView;
    this.el.style.left=Math.max(12,Math.min(rect.left,win.innerWidth-450))+'px';
    this.el.style.top=Math.max(12,Math.min(rect.bottom+6,win.innerHeight-390))+'px';
    this.leave=()=>{ clearTimeout(this.closeTimer); this.closeTimer=setTimeout(()=>{if(!this.el.matches(':hover')&&!anchor.matches(':hover')&&!this.el.contains(this.el.ownerDocument.activeElement))this.close();},450); };
    this.enter=()=>clearTimeout(this.closeTimer); this.el.addEventListener('mouseenter',this.enter); this.el.addEventListener('mouseleave',this.leave); anchor.addEventListener('mouseleave',this.leave);
    this.outside=e=>{if(!this.el.contains(e.target)&&!anchor.contains(e.target))this.close();};
    this.key=e=>{if(e.key==='Escape')this.close();};
    anchor.ownerDocument.addEventListener('pointerdown',this.outside); anchor.ownerDocument.addEventListener('keydown',this.key); this.render();
  }
  render() {
    const scroll=this.el.querySelector('.gwb-step-list')?.scrollTop||0; this.el.empty();
    const children=this.plugin.children(this.file), completed=children.filter(f=>this.model.done(this.plugin.fm(f))).length;
    const head=add(this.el,'div','gwb-section-heading'); add(head,'strong','',this.file.basename); button(head,'×',()=>this.close(),'gwb-text-button');
    if(this.focusFile) add(this.el,'p','gwb-current-step',this.t("当前步骤：")+this.focusFile.basename+this.t(" · 所属项目如上"));
    add(this.el,'p','gwb-muted',this.t("{0}/{1} 步骤完成{2}", {0:completed,1:children.length,2:children.length&&completed===children.length?this.t(" · 可检查并完成整个项目"):''}));
    const projectFm=this.plugin.fm(this.file), overall=add(this.el,'label','gwb-filter-check');
    const overallCheck=add(overall,'input','gwb-complete-checkbox');overallCheck.type='checkbox';overallCheck.checked=this.model.done(projectFm);overallCheck.setAttribute('aria-label',this.t("完成整个项目：")+this.file.basename);overall.appendText(this.t("整个项目已完成"));
    overallCheck.addEventListener('change',async()=>{overallCheck.disabled=true;try{await this.plugin.act(this.file,{kind:'complete',checked:overallCheck.checked});}catch(e){new Notice(this.t(e.message));}finally{this.render();}});
    const list=add(this.el,'div','gwb-step-list');
    for(const file of children) {
      const fm=this.plugin.fm(file), visible=this.model.visibleOnBoard(fm,false), row=add(list,'div','gwb-step-row'+(file===this.focusFile?' is-current-step':''));
      row.dataset.path=file.path;this.view.bindDrag(row,file);
      const checkbox=add(row,'input','gwb-complete-checkbox'); checkbox.type='checkbox'; checkbox.checked=this.model.done(fm); checkbox.setAttribute('aria-label',(checkbox.checked?this.t("取消完成："):this.t("完成："))+file.basename);
      checkbox.addEventListener('change',async()=>{checkbox.disabled=true;try{await this.plugin.act(file,{kind:'complete',checked:checkbox.checked});}catch(e){new Notice(this.t(e.message));}finally{this.render();}});
      const details=add(row,'div'), link=add(details,'a','gwb-step-link internal-link',file.basename);link.href='#';
      link.addEventListener('click',e=>{e.preventDefault();this.plugin.openFile(file);});
      add(details,'span','gwb-step-state',this.statusLabel(fm.task_status)+(visible?this.t(" · 已在看板"):this.t(" · 未安排")));
      if(fm.completed_at&&this.model.done(fm))add(details,'time','gwb-completed-time','✓ '+this.model.displayTime(fm.completed_at));
      const actions=add(row,'div','gwb-step-actions');
      for(const column of ['backlog','active'])button(actions,this.t(TITLES[column][1]),()=>this.plugin.act(file,{kind:'move',column}),'gwb-text-button');
      if(this.model.done(fm))button(actions,'Done',()=>this.plugin.act(file,{kind:'move',column:'done'}),'gwb-text-button');
    }
    list.scrollTop=scroll;
    const foot=add(this.el,'div','gwb-popover-footer'); button(foot,this.t("打开项目"),()=>{this.plugin.openFile(this.file);this.close();});
    if(this.file.path.startsWith(this.roots.projects + '/')) {
      button(foot,this.t("＋ 新增步骤"),()=>{new NewNoteModal(this.plugin,{task:true,project:this.file}).open();this.close();});
      const finish=button(foot,this.t("移至 Done 并归档"),()=>this.plugin.act(this.file,{kind:'move',column:'done'}),'mod-cta');
      finish.disabled=!this.model.done(projectFm)||completed!==children.length;
      finish.title=this.t("先完成全部步骤，再勾选整个项目已完成");
    }
  }
  close() {
    clearTimeout(this.closeTimer); this.anchor.removeEventListener('mouseleave',this.leave); this.anchor.ownerDocument.removeEventListener('pointerdown',this.outside); this.anchor.ownerDocument.removeEventListener('keydown',this.key); this.el.remove(); this.plugin.popovers.delete(this);
    if(this.view.popover===this)this.view.popover=null;
    if(this.view.needsRefresh&&!this.view.dragging){this.view.needsRefresh=false;this.view.render(true);}
  }
}

class NewNoteModal extends Modal {
  get model(){return this.plugin.model;}
  get roots(){return this.plugin.roots;}
  t(text,params){return this.plugin.t(text,params);}
  statusLabel(value){return this.plugin.statusLabel(value);}

  constructor(plugin, options={}) { super(plugin.app); this.plugin=plugin; this.options=options; }
  onOpen() {
    this.contentEl.dataset.gwbOwner='true';this.contentEl._gwbPlugin=this.plugin;
    const o=this.options; this.titleEl.setText(o.idea?this.t('记录灵感'):o.makeProject?this.t("新建项目"):o.project?this.t("新增项目步骤"):o.task?this.t("新建任务笔记"):this.t("快速记录"));
    let title='', reference=false; const input=add(this.contentEl,'input','gwb-name-input'); input.placeholder=o.idea?this.t('灵感标题'):o.makeProject?this.t("项目名称"):o.project?this.t("例如：Step 1 需求梳理"):this.t("笔记名称"); input.setAttribute('aria-label',o.idea?this.t('灵感标题'):o.makeProject?this.t("项目名称"):this.t("笔记名称")); input.addEventListener('input',()=>title=input.value.trim());
    if(!o.makeProject&&!o.project&&!o.idea)new Setting(this.contentEl).setName(this.t("资料笔记")).setDesc(this.t("适合文章、视频、书籍、播客；观点与方法保存在同一篇笔记。")).addToggle(t=>t.onChange(v=>reference=v));
    const error=add(this.contentEl,'p','gwb-error');
    const create=async()=>{
      if(!title||/[<>:"/\\|?*\x00-\x1f]/.test(title)||/[. ]$/.test(title)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(title)){error.setText(this.t("请输入有效名称，不使用路径或特殊字符。"));return;}
      submit.disabled=true;
      try{
        const fm=this.model.defaults(title); let folder=this.roots.inbox, basename=title;
        if(o.idea){
          if(!(this.app.vault.getAbstractFileByPath(this.plugin.templatePath('灵感记录模板')) instanceof TFile))throw Error(this.t('找不到灵感模板，请运行安装向导补齐'));
          if(!(this.app.vault.getAbstractFileByPath(this.roots.inbox) instanceof TFolder))throw Error(this.t('收集箱目录不存在，请先运行安装向导'));
          folder=this.roots.inbox+'/Ideas';const existing=this.app.vault.getAbstractFileByPath(folder);
          if(existing&&!(existing instanceof TFolder))throw Error(this.t('灵感目录被同名文件占用'));
          if(!existing)await this.app.vault.createFolder(folder);
        }
        if(o.makeProject){folder=normalizePath(this.roots.projects + '/'+title);basename=title+this.t('总览');fm.category=folder;fm.workbench_project=true;}
        if(o.project){folder=o.project.parent.path;fm.project=this.app.fileManager.generateMarkdownLink(o.project,folder+'/'+basename+'.md'); if(!fm.project.startsWith('[['))fm.project='[['+o.project.path.replace(/\.md$/,'')+']]';fm.category=this.plugin.fm(o.project).category||folder;}
        fm.type=reference?'reference':'note';
        if(o.task&&!o.idea)Object.assign(fm,this.model.transition({...fm,task:true},{kind:'move',column:o.column||'backlog'}));
        if(o.project)fm.board_visible=false;
        if(o.makeProject){if(this.app.vault.getAbstractFileByPath(folder))throw new Error(this.t("同名项目目录已存在，请换一个名称"));await this.app.vault.createFolder(folder);}
        const path=normalizePath(folder+'/'+basename+'.md');if(this.app.vault.getAbstractFileByPath(path))throw new Error(this.t("已有同名笔记，请换一个名称"));
        const body=o.makeProject?`# ${title}\n\n## ${this.t('目标与完成标准')}\n\n\n## ${this.t('项目记录')}\n\n\n## ${this.t('相关资料')}\n`:`# ${title}\n`;
        const file=await this.app.vault.create(path,'---\n'+stringifyYaml(fm)+'---\n\n'+body);
        this.plugin.known.set(file,snapshot(fm));this.close();await this.plugin.openFile(file);
        if(!o.makeProject&&!o.project)await this.plugin.applyTemplate(file,o.idea?'灵感记录模板':reference?'资料笔记模板':'知识笔记模板');
        if(o.column==='done'&&!o.makeProject&&!o.project)await this.plugin.archiveStandalone(file);
        this.plugin.refresh();
      }catch(e){error.setText(this.t(e.message));submit.disabled=false;}
    };
    const footer=add(this.contentEl,'div','gwb-modal-footer');button(footer,this.t("取消"),()=>this.close());const submit=button(footer,this.t("创建"),create,'mod-cta');
    input.addEventListener('keydown',e=>{if(e.key==='Enter')create();});setTimeout(()=>input.focus(),50);
  }
}
class ProjectPicker extends SuggestModal {
  get model(){return this.plugin.model;}
  get roots(){return this.plugin.roots;}
  t(text,params){return this.plugin.t(text,params);}
  statusLabel(value){return this.plugin.statusLabel(value);}

  constructor(plugin,file){super(plugin.app);this.plugin=plugin;this.file=file;this.setPlaceholder(this.t("选择项目总览笔记，或清除关联"));}
  getSuggestions(query){return [null,...this.app.vault.getMarkdownFiles().filter(f=>this.plugin.eligible(f)&&f!==this.file&&f.path.startsWith(this.roots.projects + '/')&&this.model.blank(this.plugin.fm(f).project))].filter(f=>!f||f.path.toLowerCase().includes(query.toLowerCase()));}
  renderSuggestion(file,el){el.setText(file?file.path:this.t("清除项目关联（作为独立事项）"));}
  async onChooseSuggestion(file){const old=this.plugin.parent(this.file);await this.plugin.run(this.file,()=>this.app.fileManager.processFrontMatter(this.file,fm=>{fm.project=file?'[['+file.path.replace(/\.md$/,'')+']]':'';this.plugin.known.set(this.file,snapshot(fm));}));for(const parent of new Set([old,file].filter(Boolean)))await this.plugin.syncProjectStatus(parent);this.plugin.refresh();}
}
class SearchNotesModal extends SuggestModal {
  get model(){return this.plugin.model;}
  get roots(){return this.plugin.roots;}
  t(text,params){return this.plugin.t(text,params);}
  statusLabel(value){return this.plugin.statusLabel(value);}

  constructor(plugin){super(plugin.app);this.plugin=plugin;this.searchId=0;this.setPlaceholder(this.t("搜索关键词，查看命中句子并跳转…"));this.modalEl.addClass('gwb-search-modal');this.setInstructions([{command:'↑ ↓',purpose:this.t("选择命中句子")},{command:'↵',purpose:this.t("跳转到原文")},{command:'Esc',purpose:this.t("关闭")},{command:this.t("结果"),purpose:this.t("每篇最多 8 句，共 80 处")}]);}
  async getSuggestions(query){
    const id=++this.searchId,needle=query.trim(),files=this.app.vault.getMarkdownFiles().filter(f=>this.plugin.eligible(f));this.latestResults=[];
    if(!needle)return this.latestResults=files.sort((a,b)=>b.stat.mtime-a.stat.mtime).slice(0,20).map(file=>({file,query:'',kind:'recent'}));
    files.sort((a,b)=>Number(Search.matches(b.basename,needle).length>0)-Number(Search.matches(a.basename,needle).length>0)||b.stat.mtime-a.stat.mtime);
    const hits=[];
    for(const file of files){
      if(id!==this.searchId)return this.latestResults;if(hits.length>=80)break;
      try{
        const text=await this.app.vault.cachedRead(file);if(id!==this.searchId)return this.latestResults;
        const passages=Search.searchText(text,needle,Math.min(8,80-hits.length));
        for(const passage of passages)hits.push({file,query:needle,kind:'passage',...passage});
        if(!passages.length&&Search.matches(file.basename,needle).length)hits.push({file,query:needle,kind:'title'});
      }catch{}
    }
    this.latestResults=hits;return hits;
  }
  highlight(el,text,query){
    let cursor=0;for(const match of Search.matches(text,query)){el.appendText(text.slice(cursor,match.start));add(el,'mark','gwb-search-highlight',text.slice(match.start,match.end));cursor=match.end;}el.appendText(text.slice(cursor));
  }
  renderSuggestion(hit,el){
    el.addClass('gwb-search-result');
    this.highlight(add(el,'div','gwb-search-result-title'),hit.file.basename,hit.query);
    if(hit.kind==='passage')this.highlight(add(el,'div','gwb-search-context'),hit.context,hit.query);
    else if(hit.kind==='title')add(el,'div','gwb-search-context gwb-muted',this.t("标题命中 · 点击打开笔记"));
    add(el,'small','gwb-search-location',hit.file.parent.path+(hit.kind==='passage'?this.t(" · 第 {0} 行", {0:hit.line+1}):''));
  }
  async onChooseSuggestion(hit){
    try{
      if(this.app.vault.getAbstractFileByPath(hit.file.path)!==hit.file){new Notice(this.t("这篇笔记已不存在，请重新搜索"));return;}
      if(hit.kind!=='passage'){await this.plugin.openFile(hit.file);return;}
      const text=await this.app.vault.read(hit.file),match=Search.relocate(text,hit,hit.query);
      if(!match){await this.plugin.openFile(hit.file);new Notice(this.t("原文已发生变化，请重新搜索以定位最新位置"));return;}
      const from=Search.position(text,match.start),to=Search.position(text,match.end);
      const leaf=this.app.workspace.getLeaf('tab');
      const frontmatter=text.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
      // Live Preview table widgets can reformat Markdown merely on focus.
      // Use plain source for table/property hits so navigation stays read-only.
      const tableLine=/^\s*\|/.test(text.split(/\r?\n/)[from.line]||'');
      await leaf.openFile(hit.file,{active:true,state:{mode:'source',source:tableLine||Boolean(frontmatter&&match.start<frontmatter[0].length)},eState:{line:from.line,startLoc:from,endLoc:to}});
      const editor=leaf.view?.editor;
      if(editor){editor.setSelection(from,to);editor.scrollIntoView({from,to},true);editor.focus();}
    }catch(error){console.error(this.t("[PlainOB] 搜索定位"),error);new Notice(this.t("搜索定位未完成，请重新搜索"));}
  }
}
class ConfirmModal extends Modal {
  get model(){return this.plugin.model;}
  get roots(){return this.plugin.roots;}
  t(text,params){return this.plugin.t(text,params);}
  statusLabel(value){return this.plugin.statusLabel(value);}

  constructor(plugin,title,message,action){super(plugin.app);this.plugin=plugin;this.title=title;this.message=message;this.action=action;}
  onOpen(){this.contentEl.dataset.gwbOwner='true';this.contentEl._gwbPlugin=this.plugin;this.titleEl.setText(this.title);add(this.contentEl,'p','',this.message);const error=add(this.contentEl,'p','gwb-error');const footer=add(this.contentEl,'div','gwb-modal-footer');button(footer,this.t("取消"),()=>this.close());const submit=button(footer,this.t("移动归档"),async()=>{submit.disabled=true;try{await this.action();this.close();}catch(e){error.setText(this.t(e.message));submit.disabled=false;}},'mod-cta');}
}

class WorkbenchSettingsTab extends PluginSettingTab {
  t(text,params){return this.plugin.t(text,params);}
  display(){
    const p=this.plugin,t=(key)=>p.t(key),el=this.containerEl;el.empty();
    const draft=JSON.parse(JSON.stringify(p.settings));
    new Setting(el).setName(t('工作台设置')).setHeading();
    new Setting(el).setName(t('安装与迁移')).setDesc(t('预览目录、模板和可选插件配置，再确认执行')).addButton(b=>b.setButtonText(t('打开安装向导')).onClick(()=>new SetupUI.Wizard(p).open())).addButton(b=>b.setButtonText(t('导出迁移配置')).onClick(()=>new SetupUI.ProfileModal(p).open()));
    new Setting(el).setName(t('界面语言')).setDesc(t('切换语言不会重命名笔记或目录；命令名称在下次加载后更新')).addDropdown(d=>d.addOption('auto',t('跟随 Obsidian')).addOption('zh','简体中文').addOption('en','English').setValue(draft.language).onChange(v=>draft.language=v));
    new Setting(el).setName(t('首页称呼')).addText(x=>x.setValue(draft.displayName).onChange(v=>draft.displayName=v));
    new Setting(el).setName(t('内置分类移动')).setDesc(t('仅在 Inbox 分类发生变化时移动，旧分类插件运行时自动暂停')).addToggle(x=>x.setValue(draft.routingEnabled).onChange(v=>draft.routingEnabled=v));
    if(p.routingBlocked())el.createEl('p',{text:t('已检测到旧分类插件，本插件不会重复移动笔记')});
    el.createEl('p',{text:t('目录设置只改变工作台读取的位置，不移动已有笔记。完整初始化与迁移向导将在下一阶段提供。')});
    const roles={inbox:this.t("收集箱"),projects:this.t("项目"),areas:this.t("领域"),resources:this.t("资源"),archive:this.t("归档"),templates:this.t("模板"),system:this.t("系统"),attachments:this.t("附件")};
    for(const [role,label]of Object.entries(roles))new Setting(el).setName(t(label)).addText(x=>x.setValue(draft.roots[role]).onChange(v=>draft.roots[role]=v));
    const files={categoryNote:this.t("分类清单路径"),noteTemplate:this.t("知识模板路径"),referenceTemplate:this.t("资料模板路径"),ideaTemplate:this.t('灵感模板路径'),guide:this.t("使用说明路径"),defaultCover:this.t("默认封面路径（可留空）")};
    for(const [key,label]of Object.entries(files))new Setting(el).setName(t(label)).addText(x=>x.setValue(draft.files[key]).onChange(v=>draft.files[key]=v));
    el.createEl('p',{text:t('现有中文任务状态会继续兼容，切换界面语言不批量改写笔记属性。')});
    const error=el.createEl('p',{cls:'gwb-error'});
    new Setting(el).addButton(b=>b.setButtonText(t('保存设置')).setCta().onClick(async()=>{
      b.setDisabled(true);
      try{await p.updateSettings(draft);new Notice(t('设置已保存'));this.display();}
      catch(e){error.setText(t(e.message));b.setDisabled(false);}
    }));
  }
}
