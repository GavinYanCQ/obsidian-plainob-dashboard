'use strict';
// Synthetic fixtures only: this script never reads an installed vault.
const fs=require('node:fs'),path=require('node:path');
const C=require('./workbench/config'),R=require('./workbench/resources');
const base=path.resolve(__dirname,'..'),out=path.join(base,'outputs','PlainOB-Demo');
const runtime=path.join(base,'outputs','PlainOB-1.4.1-public');
const date='2026-11-12',completed='2026-11-11T18:30:00+08:00';
function write(root,name,text){const dest=path.join(root,...name.split('/'));fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest))throw Error('Keep existing demo: '+dest);fs.writeFileSync(dest,text,'utf8');}
function note(root,name,fm,body){write(root,name,'---\n'+Object.entries({type:'note',created:date,category:'',task:false,task_status:'',project:'',completed_at:'',board_column:'',tags:[],cover:'',summary:'',...fm}).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n\n'+body+'\n');}
function cover(title,sub,color){return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" rx="18" fill="${color}"/><rect x="30" y="30" width="540" height="840" fill="none" stroke="#ffffff" opacity=".3"/><text x="65" y="110" fill="#fff" font-family="sans-serif" font-size="16" letter-spacing="4">PLAINOB / DEMO LIBRARY</text><text x="65" y="265" fill="#fff" font-family="sans-serif" font-size="52" font-weight="bold">${title}</text><text x="65" y="320" fill="#fff" font-family="sans-serif" font-size="23">${sub}</text><path d="M145 530h310M145 565h250M145 600h190" stroke="#fff" stroke-width="5" opacity=".6"/><circle cx="300" cy="520" r="165" fill="none" stroke="#fff" opacity=".15"/><text x="65" y="805" fill="#fff" font-family="sans-serif" font-size="17">FIND. READ. DO.</text></svg>`;}
for(const language of ['zh','en']){
  const en=language==='en',root=path.join(out,en?'PlainOB-Demo-English':'PlainOB-Demo-Chinese');
  if(fs.existsSync(root))throw Error('Demo exists; choose a new output folder rather than overwrite.');
  const roots=C.presetRoots('en'),settings=C.load({language,directoryPreset:'en',displayName:'',roots,files:R.freshFiles(roots,language)});
  settings.setup={version:1,mode:'new',completed:true};
  const resources=R.documents(settings,language,{categories:true,templates:true,ai:false});
  for(const dir of [...Object.values(roots),...resources.directories])fs.mkdirSync(path.join(root,...dir.split('/')),{recursive:true});
  for(const doc of resources.documents)write(root,doc.path,doc.text);
  write(root,'.obsidian/community-plugins.json',JSON.stringify(['plainob'],null,2)+'\n');
  write(root,'.obsidian/plugins/plainob/data.json',JSON.stringify(settings,null,2)+'\n');
  for(const file of ['main.js','manifest.json','styles.css'])write(root,'.obsidian/plugins/plainob/'+file,fs.readFileSync(path.join(runtime,file),'utf8'));
  const project=en?'Start a reading club':'组织一次读书交流',folder=roots.projects+'/'+project;
  const overview=folder+'/'+(en?'Reading club Overview':'读书交流总览')+'.md';
  const steps=en?['Step 1 Choose a book','Step 2 Collect discussion questions','Step 3 Arrange the first session','Step 4 Gather feedback']:['Step 1 选择共读书目','Step 2 整理讨论问题','Step 3 安排首次交流','Step 4 收集交流反馈'];
  note(root,overview,{task:true,task_status:'active',board_column:'active',workbench_project:true,category:folder},en?'# Start a reading club\n\nA fictional project for demonstrating independent steps.\n\n'+steps.map(t=>'- [['+folder+'/'+t+']]').join('\n'):'# 组织一次读书交流\n\n这是用于演示独立步骤的虚构项目。\n\n'+steps.map(t=>'- [['+folder+'/'+t+']]').join('\n'));
  steps.forEach((title,i)=>note(root,folder+'/'+title+'.md',{task:true,task_status:['done','active','backlog','backlog'][i],board_column:['done','active','backlog','backlog'][i],board_visible:i<3,board_order:1024*(i+1),completed_at:i===0?completed:'',category:folder,project:'[['+overview.slice(0,-3)+']]'},'# '+title+'\n\n'+(en?'A small next step in the reading-club project.':'读书交流项目中的一个小步骤。')));
  const standalone=[
    [roots.inbox,en?'Compare three headphones':'比较三款耳机','backlog',en?'Compare comfort, battery life and price before choosing.':'从佩戴舒适度、续航和价格三个方面比较，再决定。'],
    [roots.areas+'/Learning & Development',en?'Practice a short English introduction':'练习一段英文自我介绍','active',en?'Record a one-minute introduction and listen once.':'录制一分钟的自我介绍，再听一遍。'],
    [roots.areas+'/Health & Fitness',en?'Take a walk after lunch':'午饭后散步','backlog',en?'A short walk around the neighborhood.':'在附近走一小圈。'],
    [roots.areas+'/Personal Life',en?'Book a library visit':'预约图书馆活动','done',en?'The visit has been booked.':'已经完成活动预约。']
  ];
  standalone.forEach(([dir,title,state,body],i)=>note(root,dir+'/'+title+'.md',{task:true,task_status:state,board_column:state,board_visible:true,board_order:1024*(i+1),completed_at:state==='done'?completed:''},'# '+title+'\n\n'+body));
  const topic=roots.resources+'/Obsidian & Productivity';
  const books=en?[['A review that fits one page','Review','A small weekly habit','# A review that fits one page\n\nA weekly review helps me choose the next small action.\n\n## Three questions\n\nWhat moved forward? What can wait? What is the next small step?'],['Find a note when you need it','Find','Notes within reach','# Find a note when you need it\n\nWrite a useful title, keep a few clear sentences and search when you need them.'],['A task can start small','Do','One useful next step','# A task can start small\n\nChoose one action that fits the time available. Project steps can be scheduled separately.']]:[['把复盘写在一页纸上','Review','A small weekly habit','# 把复盘写在一页纸上\n\n每周复盘不必很长，选出下一步真正想做的小事就够了。\n\n## 三个问题\n\n这周推进了什么？什么可以等等？下一步是什么？'],['需要时找到那篇笔记','Find','Notes within reach','# 需要时找到那篇笔记\n\n取一个有用的标题，写下清楚的几句话，需要时再搜索。'],['从一件小事开始','Do','One useful next step','# 从一件小事开始\n\n选择一个适合当下时间的行动。项目步骤可以分开安排。']];
  books.forEach(([title,label,sub,body],i)=>{const img='99_Attachments/Covers/demo-'+i+'.svg';write(root,img,cover(label,sub,['#214d48','#353651','#805f3b'][i]));note(root,topic+'/'+title+'.md',{category:topic,cover:'[['+img+']]',summary:en?'A fictional note for this demo.':'演示库中的虚构笔记。'},body);});
  note(root,roots.inbox+'/Ideas/'+(en?'An idea for a shared reading list':'共享书单的一个想法')+'.md',{},en?'# An idea for a shared reading list\n\nLet each reader add one book and a sentence about why.':'# 共享书单的一个想法\n\n每个人添加一本书，再写一句推荐理由。');
  note(root,roots.archive+'/'+(en?'A finished weekend plan':'已结束的周末计划')+'.md',{task:true,task_status:'done',board_column:'done',board_visible:true,completed_at:completed},en?'# A finished weekend plan\n\nA fictional completed activity kept for later reference.':'# 已结束的周末计划\n\n一次虚构的已完成活动，留作日后参考。');
}
console.log(JSON.stringify({directory:out,languages:['zh','en'],syntheticOnly:true,personalVaultRead:false}));
