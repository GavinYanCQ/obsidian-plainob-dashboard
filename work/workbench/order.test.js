const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('./model');
const record=(name,fm)=>({file:{basename:name,path:'02_Areas/'+name+'.md',stat:{ctime:0}},fm});
test('Done defaults to completion time until the user specifies manual order',()=>{
  const a=record('A',{board_order:1,completed_at:'2026-11-09T09:00:00+08:00'}),b=record('B',{board_order:9,completed_at:'2026-11-09T10:00:00+08:00'});
  assert.deepEqual(M.sortRecords([a,b],'done'),[b,a]);
  a.fm.task_status=b.fm.task_status='已完成';
  const reopened=record('重新打开',{task_status:'待办',completed_at:''});
  assert.deepEqual(M.sortRecords([a,reopened,b],'done'),[reopened,b,a]);
  a.fm.board_manual_order=b.fm.board_manual_order=true;
  assert.deepEqual(M.sortRecords([b,a],'done'),[a,b]);
  const fresh=record('C',{completed_at:'2026-11-09T11:00:00+08:00'});
  assert.deepEqual(M.sortRecords([a,b,fresh],'done'),[fresh,a,b]);
});
test('Backlog and Active use persisted numeric positions with deterministic ties',()=>{
  const a=record('A',{board_order:2048}),b=record('B',{board_order:1024});
  for(const lane of ['backlog','active'])assert.deepEqual(M.sortRecords([a,b],lane),[b,a]);
  assert.deepEqual(M.sortRecords([b,record('A',{board_order:1024})],'active').map(r=>r.file.basename),['A','B']);
});
test('filtered and compact boards insert around visible anchors without changing hidden relative order',()=>{
  const files=['A','B','C','D','E','F'];
  assert.deepEqual(M.insertInOrder(files,'B','E'),['A','C','D','B','E','F']);
  assert.deepEqual(M.insertInOrder(files,'A',null,'E'),['B','C','D','E','A','F']);
  assert.deepEqual(M.insertInOrder(files,'X','C'),['A','B','X','C','D','E','F']);
  assert.deepEqual(files,['A','B','C','D','E','F']);
});
test('moving away from a manually ordered Done column does not impose that mode on another column',()=>{
  const fm={task:true,task_status:'已完成',board_column:'done',board_order:1024,board_manual_order:true,completed_at:'2026-11-09T09:00:00+08:00'};
  const next=M.transition(fm,{kind:'move',column:'active'});
  assert.equal(next.task_status,'执行中');assert.equal(next.completed_at,'');assert.equal(next.board_manual_order,undefined);
  assert.equal(fm.board_manual_order,true);
});
