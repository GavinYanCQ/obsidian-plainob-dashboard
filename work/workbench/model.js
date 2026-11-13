'use strict';

const Config = require('./config');
function create(options = {}) {
const roots = options.roots || Config.ROOTS;
const STATUS = options.statusFormat === 'stable' ? {backlog:'backlog',active:'active',done:'done'} : { backlog: '待办', active: '执行中', done: '已完成' };
const LANES = Object.keys(STATUS);
function status(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const lane = ({'待办':'backlog','执行中':'active','已完成':'done',backlog:'backlog',todo:'backlog','to do':'backlog',active:'active','in progress':'active',done:'done',completed:'done'})[key];
  return lane ? STATUS[lane] : '';
}
function lane(fm) { return LANES.includes(fm.board_column) ? fm.board_column : LANES.find(k => STATUS[k] === status(fm.task_status)) || 'backlog'; }
function done(fm) { return status(fm.task_status) === STATUS.done; }
function blank(value) { return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0); }
function stamp(date = new Date()) {
  const offset = -date.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-';
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.abs(offset)/60)}:${pad(Math.abs(offset)%60)}`;
}
function defaults(title = '', now = new Date()) {
  return { type: 'note', created: stamp(now).slice(0,10), category: '', task: false, task_status: '', project: '', completed_at: '', board_column: '', tags: [], cover: '', summary: '' };
}
function eligiblePath(path) { return Config.eligible(path, roots); }
function transition(fm, action, now = stamp()) {
  const next = { ...fm };
  if (action.kind === 'complete') {
    next.task = true;
    next.board_column = lane(fm);
    next.task_status = action.checked ? STATUS.done : STATUS.backlog;
    next.completed_at = action.checked ? (done(fm) && !blank(fm.completed_at) ? fm.completed_at : now) : '';
  } else if (action.kind === 'move') {
    if (!LANES.includes(action.column)) throw new Error('未知看板列');
    if (action.column === 'done' && !done(fm)) throw new Error('请先勾选完成，再移至 Done');
    next.task = true;
    next.board_visible = true;
    next.board_column = action.column;
    if(action.column!==lane(fm))delete next.board_manual_order;
    // Reordering inside a column must not undo a deliberately checked card.
    if (action.column !== lane(fm) || action.order === undefined) {
      next.task_status = STATUS[action.column];
      next.completed_at = action.column === 'done' ? (done(fm) && !blank(fm.completed_at) ? fm.completed_at : now) : '';
    }
    if (Number.isFinite(action.order)) next.board_order = action.order;
  } else throw new Error('未知任务操作');
  return next;
}
function reconcile(fm, previous, now = stamp()) {
  const next = { ...fm };
  // task is membership/history. Unchecking it must never destroy task history.
  if (fm.task !== true) return next;
  const current = status(fm.task_status), old = status(previous?.task_status);
  if (!current) next.task_status = STATUS.backlog;
  else next.task_status = fm.task_status;
  if (!LANES.includes(next.board_column)) next.board_column = lane(next);
  if (current === STATUS.done) {
    if (blank(next.completed_at)) next.completed_at = now;
  } else {
    if (old === STATUS.done) next.completed_at = '';
    // Directly choosing an unfinished status also chooses the corresponding lane.
    if (previous && current !== old && current) next.board_column = current === STATUS.active ? 'active' : 'backlog';
  }
  if (previous && current !== old && (current === STATUS.active || current === STATUS.done) && !blank(fm.project)) next.board_visible = true;
  return next;
}
function visibleOnBoard(fm, isProject, showProjects = false) {
  if (fm.task !== true) return false;
  if (isProject) return showProjects;
  if (typeof fm.board_visible === 'boolean') return fm.board_visible;
  // Old steps already in progress/completed stay visible; pending steps require selection.
  return blank(fm.project) || status(fm.task_status) === STATUS.active || done(fm);
}
function projectProgress(fm, steps) {
  if(fm.task!==true||!steps.length)return {};
  // Completion remains an explicit project decision; completed steps never finish the parent automatically.
  if(done(fm)&&steps.every(done))return {};
  const target=steps.every(step=>!status(step.task_status)||status(step.task_status)===STATUS.backlog)?'backlog':'active';
  const patch={};
  if(status(fm.task_status)!==STATUS[target])patch.task_status=STATUS[target];
  if(fm.board_column!==target)patch.board_column=target;
  if(!blank(fm.completed_at))patch.completed_at='';
  return patch;
}
function projectArchiveReady(fm,steps,manual=false) {
  return fm.task===true&&done(fm)&&steps.every(done)
    &&(manual||lane(fm)==='done'||(steps.length>0&&steps.every(step=>lane(step)==='done')));
}
function sortRecords(records,column) {
  const manualDone=column==='done'&&records.some(r=>r.fm.board_manual_order===true&&Number.isFinite(r.fm.board_order));
  const marked=r=>r.fm.board_manual_order===true&&Number.isFinite(r.fm.board_order);
  const byTime=(a,b)=>Number(done(a.fm))-Number(done(b.fm))||(Date.parse(b.fm.completed_at)||0)-(Date.parse(a.fm.completed_at)||0);
  return [...records].sort((a,b)=>{
    let difference;
    if(column==='done') {
      if(!manualDone)difference=byTime(a,b);
      else if(marked(a)!==marked(b))difference=Number(marked(a))-Number(marked(b));
      else difference=marked(a)?a.fm.board_order-b.fm.board_order:byTime(a,b);
    } else difference=(Number(a.fm.board_order)||0)-(Number(b.fm.board_order)||0)||(a.file.stat?.ctime||0)-(b.file.stat?.ctime||0);
    return difference||a.file.basename.localeCompare(b.file.basename,'zh-CN',{numeric:true})||a.file.path.localeCompare(b.file.path);
  });
}
function insertInOrder(files,file,before=null,after=null) {
  const rest=files.filter(f=>f!==file);
  let index=before&&rest.includes(before)?rest.indexOf(before):after&&rest.includes(after)?rest.indexOf(after)+1:0;
  rest.splice(index,0,file);return rest;
}
function autoArchive(path, fm, isProject) {
  return Config.within(path,roots.inbox) && eligiblePath(path) && fm.task === true && done(fm)
    && blank(fm.category) && blank(fm.project) && !isProject;
}
function archiveReturnPath(path, fm) {
  const origin = fm.task_archive_origin, archived = fm.task_archive_path;
  if (fm.task !== true || done(fm) || typeof origin !== 'string' || typeof archived !== 'string') return '';
  // Only our exact automatic move is reversible. Never guess where manual archives came from.
  if (!Config.within(origin,roots.inbox) || !eligiblePath(origin) || /[\\:]/.test(origin)
    || origin.split('/').some(part => !part || part === '.' || part === '..')) return '';
  if (archived !== roots.archive + '/' + origin.split('/').pop() || path !== archived) return '';
  return origin;
}
function projectReturnFolder(path, fm) {
  const origin=fm.project_archive_origin, archived=fm.project_archive_path;
  if(typeof origin!=='string'||typeof archived!=='string')return '';
  if(!Config.safePath(origin)||!Config.within(origin,roots.projects))return '';
  const name=origin.slice(roots.projects.length+1);
  if(!name||name.includes('/'))return '';
  return archived===roots.archive+'/'+name&&Config.within(path,archived)?origin:'';
}
function linkTarget(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0].trim();
}
function displayTime(value) {
  if (!value) return '';
  if (value instanceof Date) value = stamp(value);
  return String(value).replace('T', ' ').slice(0,16);
}
return { STATUS, LANES, status, lane, done, blank, stamp, defaults, eligiblePath, transition, reconcile, visibleOnBoard, projectProgress, projectArchiveReady, sortRecords, insertInOrder, autoArchive, archiveReturnPath, projectReturnFolder, linkTarget, displayTime };
}
module.exports = { ...create(), create };
