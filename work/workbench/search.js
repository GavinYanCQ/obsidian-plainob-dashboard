'use strict';
function matches(text, query) {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return [...text.matchAll(pattern)].map(m => ({ start: m.index, end: m.index + m[0].length }));
}
function position(text, offset) {
  const prefix = text.slice(0, offset), newline = prefix.lastIndexOf('\n');
  return { line: (prefix.match(/\n/g) || []).length, ch: offset - newline - 1 };
}
function excerpt(text, hit) {
  const lineStart = text.lastIndexOf('\n', hit.start-1)+1;
  let lineEnd = text.indexOf('\n', hit.end); if (lineEnd < 0) lineEnd = text.length;
  let start=lineStart, end=lineEnd;
  // Sentence punctuation, while leaving URLs and decimal points intact.
  const boundaries=/[。！？!?；;]|\.(?=\s|$)/g;
  for(const mark of text.slice(lineStart,lineEnd).matchAll(boundaries)) {
    const boundary=lineStart+mark.index+mark[0].length;
    if(boundary<=hit.start)start=boundary;
    else if(boundary>=hit.end){end=boundary;break;}
  }
  while(start<hit.start&&/\s/.test(text[start]))start++;
  while(end>hit.end&&/\s/.test(text[end-1]))end--;
  const sentenceStart=start,sentenceEnd=end;
  if(end-start>220){start=Math.max(start,hit.start-75);end=Math.min(end,Math.max(hit.end+75,start+200));}
  return {text:(start>sentenceStart?'…':'')+text.slice(start,end)+(end<sentenceEnd?'…':''),start,end,sentenceStart,sentenceEnd};
}
function searchText(text, query, limit=8) {
  const results=[],seen=new Set();
  for(const match of matches(text,query)) {
    const context=excerpt(text,match),key=context.sentenceStart+':'+context.sentenceEnd;
    if(seen.has(key))continue;seen.add(key);
    results.push({ ...match, context:context.text, sentence:text.slice(context.sentenceStart,context.sentenceEnd), line:position(text,match.start).line });
    if(results.length>=limit)break;
  }
  return results;
}
function relocate(text, hit, query) {
  if(matches(text.slice(hit.start,hit.end),query).length&&text.slice(hit.start,hit.end).length===hit.end-hit.start
    &&text.slice(hit.start,hit.end).toLocaleLowerCase()===query.toLocaleLowerCase()) {
    const context=excerpt(text,hit);
    if(context.text===hit.context)return hit;
  }
  const candidates=matches(text,query);
  const exact=candidates.filter(m=>{const e=excerpt(text,m);return e.text===hit.context||text.slice(e.sentenceStart,e.sentenceEnd)===hit.sentence;});
  // If edits made the former sentence ambiguous, open normally instead of selecting a wrong occurrence.
  return exact.length===1?exact[0]:null;
}
module.exports={matches,position,excerpt,searchText,relocate};
