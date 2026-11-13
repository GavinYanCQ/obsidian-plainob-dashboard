const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model');
const first='2026-11-08T22:15:00+08:00', second='2026-11-09T09:00:00+08:00';
test('task membership persists across completion, manual placement and reopening',()=>{
  let fm=M.reconcile({...M.defaults(),task:true},{task:false});
  assert.equal(fm.task_status,'待办'); assert.equal(fm.board_column,'backlog');
  fm=M.transition(fm,{kind:'move',column:'active'},first);
  fm=M.transition(fm,{kind:'complete',checked:true},first);
  assert.equal(fm.task,true); assert.equal(fm.task_status,'已完成');assert.equal(fm.board_column,'active');assert.equal(fm.completed_at,first);
  fm=M.transition(fm,{kind:'move',column:'active',order:500},second);
  assert.equal(fm.task_status,'已完成'); assert.equal(fm.completed_at,first);
  fm=M.transition(fm,{kind:'move',column:'done'},second);assert.equal(fm.completed_at,first);
  fm=M.transition(fm,{kind:'complete',checked:false},second);
  assert.equal(fm.task,true);assert.equal(fm.task_status,'待办');assert.equal(fm.board_column,'done');assert.equal(fm.completed_at,'');
  fm=M.transition(fm,{kind:'move',column:'active'},second);assert.equal(fm.task_status,'执行中');
  fm=M.transition(fm,{kind:'complete',checked:true},second);assert.equal(fm.completed_at,second);
});
test('unchecking task removes membership but preserves prior history',()=>{
  const old={task:true,task_status:'已完成',board_column:'done',completed_at:first};
  const next=M.reconcile({...old,task:false},old,second);
  assert.equal(next.task,false);assert.equal(next.completed_at,first);assert.equal(next.task_status,'已完成');
  const restored=M.reconcile({...next,task:true},next,second);assert.equal(restored.completed_at,first);
});
test('direct property edits update unfinished lane and completion timestamp',()=>{
  let old={task:true,task_status:'待办',board_column:'backlog'};
  let next=M.reconcile({...old,task_status:'执行中'},old,first);assert.equal(next.board_column,'active');
  old=next;next=M.reconcile({...old,task_status:'已完成'},old,first);assert.equal(next.completed_at,first);assert.equal(next.board_column,'active');
  old=next;next=M.reconcile({...old,task_status:'待办'},old,second);assert.equal(next.completed_at,'');assert.equal(next.board_column,'backlog');
});
test('auto archive is restricted to uncategorized, completed standalone Inbox notes',()=>{
  const fm={task:true,task_status:'已完成',category:'',project:''};
  assert.equal(M.autoArchive('00_Inbox/选手机.md',fm,false),true);
  for(const path of ['01_Projects/A/Step 1.md','02_Areas/Health & Fitness/练习.md','03_Resources/Finance & Management/预算.md','04_Archive/旧事项.md','06_System/Indexes/首页.md','05_Templates/模板.md','00_Inbox/.private/隐藏.md'])assert.equal(M.autoArchive(path,fm,false),false,path);
  for(const changed of [{task:false},{task_status:'执行中'},{category:'03_Resources/AI & Technology'},{project:'[[项目A]]'}])assert.equal(M.autoArchive('00_Inbox/test.md',{...fm,...changed},false),false);
  assert.equal(M.autoArchive('00_Inbox/项目A.md',fm,true),false);
});
test('project relations accept internal links, aliases and heading suffixes',()=>{
  assert.equal(M.linkTarget('[[01_Projects/A/A总览|项目A]]'),'01_Projects/A/A总览');
  assert.equal(M.linkTarget('[[A总览#目标]]'),'A总览');assert.equal(M.linkTarget(['A']),'');
});
test('only automatically archived reopened tasks return to their exact original Inbox path',()=>{
  const origin='00_Inbox/Ideas/选手机.md', path='04_Archive/选手机.md';
  const fm={task:true,task_status:'待办',task_archive_origin:origin,task_archive_path:path};
  assert.equal(M.archiveReturnPath(path,fm),origin);
  assert.equal(M.archiveReturnPath(path,{...fm,task_status:'执行中'}),origin);
  for (const patch of [{task:false},{task_status:'已完成'},{task_archive_origin:undefined},
    {task_archive_origin:'01_Projects/A/选手机.md'}, {task_archive_origin:'00_Inbox/../选手机.md'},
    {task_archive_origin:'00_Inbox//选手机.md'}, {task_archive_origin:'00_Inbox/C:/选手机.md'},
    {task_archive_origin:'00_Inbox/Ideas\\选手机.md'}, {task_archive_origin:'00_Inbox/.secret/选手机.md'},
    {task_archive_path:'04_Archive/另一个.md'}]) assert.equal(M.archiveReturnPath(path,{...fm,...patch}),'');
  assert.equal(M.archiveReturnPath('04_Archive/手动目录/选手机.md',fm),'');
  assert.equal(M.archiveReturnPath('04_Archive/已改名.md',fm),'');
  assert.equal(M.archiveReturnPath(origin,fm),'');
  assert.equal(M.archiveReturnPath(path,{task:true,task_status:'待办'}),'');
});
test('pending project steps require selection; task history and board selection are independent',()=>{
  const step={task:true,project:'[[项目A]]',task_status:'待办',board_column:'backlog'};
  assert.equal(M.visibleOnBoard(step,false),false);
  const selected=M.transition(step,{kind:'move',column:'backlog'},first);
  assert.equal(selected.board_visible,true);assert.equal(M.visibleOnBoard(selected,false),true);
  assert.equal(M.visibleOnBoard({...selected,board_visible:false},false),false);
  assert.equal(M.visibleOnBoard({...step,task_status:'执行中'},false),true);
  assert.equal(M.visibleOnBoard({...step,project:''},false),true);
  assert.equal(M.visibleOnBoard({...step,project:''},true),false);
  assert.equal(M.visibleOnBoard({...step,project:''},true,true),true);
});
test('moving to Done requires explicit completion; moving unfinished lanes updates only this task',()=>{
  const fm={task:true,task_status:'待办',board_column:'backlog',project:'[[项目A]]'};
  assert.throws(()=>M.transition(fm,{kind:'move',column:'done'},first),/先勾选/);
  const active=M.transition(fm,{kind:'move',column:'active'},first);
  assert.equal(active.task_status,'执行中');assert.equal(fm.task_status,'待办');
  const checked=M.transition(active,{kind:'complete',checked:true},first);
  assert.equal(checked.completed_at,first);assert.equal(checked.board_column,'active');
  assert.equal(M.transition(checked,{kind:'move',column:'done'},second).completed_at,first);
});
test('project restoration accepts only the recorded matching Projects folder',()=>{
  const path='04_Archive/项目A/项目A总览.md',fm={project_archive_origin:'01_Projects/项目A',project_archive_path:'04_Archive/项目A'};
  assert.equal(M.projectReturnFolder(path,fm),'01_Projects/项目A');
  for(const origin of ['01_Projects/../项目A','01_Projects/.private','01_Projects/C:','01_Projects/项目A/子目录','03_Resources/项目A','01_Projects/'])assert.equal(M.projectReturnFolder(path,{...fm,project_archive_origin:origin}),'');
  assert.equal(M.projectReturnFolder('04_Archive/项目B/总览.md',fm),'');
  assert.equal(M.projectReturnFolder(path,{}),'');
});
test('project summary follows aggregate step progress without completing automatically',()=>{
  const todo={task_status:'待办'},active={task_status:'执行中'},done={task_status:'已完成'};
  const parent={task:true,task_status:'待办',board_column:'backlog',completed_at:''};
  assert.deepEqual(M.projectProgress(parent,[todo,todo]),{});
  assert.deepEqual(M.projectProgress(parent,[todo,active]),{task_status:'执行中',board_column:'active'});
  assert.deepEqual(M.projectProgress(parent,[todo,done]),{task_status:'执行中',board_column:'active'});
  assert.deepEqual(M.projectProgress(parent,[done,done]),{task_status:'执行中',board_column:'active'});
  assert.deepEqual(M.projectProgress({...parent,task_status:'执行中',board_column:'active'},[todo,todo]),{task_status:'待办',board_column:'backlog'});
  const complete={...parent,task_status:'已完成',board_column:'done',completed_at:first};
  assert.deepEqual(M.projectProgress(complete,[done,done]),{});
  assert.deepEqual(M.projectProgress(complete,[done,active]),{task_status:'执行中',board_column:'active',completed_at:''});
  assert.deepEqual(M.projectProgress(parent,[]),{});
  assert.deepEqual(M.projectProgress({...parent,task:false},[active]),{});
});
test('confirmed projects archive when all step cards reach Done even if the summary card stays hidden in Active',()=>{
  const parent={task:true,task_status:'已完成',board_column:'active'},done={task:true,task_status:'已完成',board_column:'done'};
  assert.equal(M.projectArchiveReady(parent,[done,done]),true);
  assert.equal(M.projectArchiveReady({...parent,task_status:'执行中'},[done,done]),false);
  assert.equal(M.projectArchiveReady(parent,[done,{...done,task_status:'执行中'}]),false);
  assert.equal(M.projectArchiveReady(parent,[done,{...done,board_column:'active'}]),false);
  assert.equal(M.projectArchiveReady({...parent,board_column:'done'},[done,{...done,board_column:'active'}]),true);
  assert.equal(M.projectArchiveReady(parent,[]),false);
  assert.equal(M.projectArchiveReady({...parent,board_column:'done'},[]),true);
  assert.equal(M.projectArchiveReady(parent,[{...done,board_column:'active'}],true),true);
});
