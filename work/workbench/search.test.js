const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('./search');
test('Chinese sentences appear separately, repeated hits in one sentence are grouped',()=>{
 const text='第一句封面很好，封面清楚。第二句无关。第三句封面也不错！';const hits=S.searchText(text,'封面');
 assert.deepEqual(hits.map(h=>h.context),['第一句封面很好，封面清楚。','第三句封面也不错！']);
 for(const h of hits)assert.equal(text.slice(h.start,h.end),'封面');
});
test('CRLF, frontmatter, emoji, English case and literal punctuation keep precise line columns',()=>{
 const text='---\r\ncover: ""\r\n---\r\n😀 The Cover uses a.b [x].\r\n封面在这里。';
 const h=S.searchText(text,'cover')[1];assert.deepEqual(S.position(text,h.start),{line:3,ch:7});
 assert.equal(S.searchText(text,'a.b [x]')[0].context,'😀 The Cover uses a.b [x].');
 assert.equal(S.searchText(text,'封面')[0].line,4);
});
test('long lines retain centered context and all visible literal matches',()=>{
 const text='甲'.repeat(400)+'关键词'+'乙'.repeat(400);const h=S.searchText(text,'关键词')[0];
 assert.ok(h.context.startsWith('…')&&h.context.endsWith('…'));assert.ok(h.context.includes('关键词'));assert.ok(h.context.length<230);
});
test('changed notes relocate the same sentence, deleted or ambiguous passages are not misselected',()=>{
 const text='前文。目标句提到封面。后文。',hit=S.searchText(text,'封面')[0];
 assert.equal(S.relocate(text,hit,'封面').start,hit.start);
 const next='新增一整段。\n'+text;const moved=S.relocate(next,hit,'封面');assert.equal(next.slice(moved.start,moved.end),'封面');
 assert.equal(S.relocate('其他句子提到封面。',hit,'封面'),null);
 assert.equal(S.relocate('新增。'+text+text,hit,'封面'),null);
});
test('URLs remain intact and results are bounded',()=>{
 assert.equal(S.searchText('查看 https://example.com/path ，了解封面。','example.com')[0].context,'查看 https://example.com/path ，了解封面。');
 assert.equal(S.searchText('关键词。'.repeat(30),'关键词',8).length,8);
});
