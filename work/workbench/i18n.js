'use strict';
const EN=require('./translations.json');
const ZH={'Knowledge Directory':'知识目录','Task Management':'任务管理','Quick Capture':'快速记录','Recent Notes':'最近笔记','Projects':'项目','Areas':'领域','Resources':'资源','Archive':'归档','Backlog':'待办','Active':'执行中','Done':'已完成','Your personal knowledge space · 记录、连接与行动':'你的知识空间 · 记录、连接与行动'};
function translate(key,language='zh',params={}){
  let text=language==='en'?(EN[key]??key):(ZH[key]??key);
  if(language==='en'&&!Object.hasOwn(EN,key)&&typeof key==='string'){const prefix=Object.keys(EN).find(k=>k.endsWith('：')&&key.startsWith(k));if(prefix)text=EN[prefix]+key.slice(prefix.length);}
  return String(text).replace(/\{(\d+|\w+)\}/g,(match,name)=>Object.hasOwn(params||{},name)?String(params[name]):match);
}
module.exports={translate,EN,ZH};
