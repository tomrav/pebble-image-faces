const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {create} = require('../../src/shared/image-face/image-transfer.js');
function phone(file) {
  let now=0, next=0;
  const timers=new Map(), sent=[], requests=[], handlers={};
  const s={BUILTINS:['review-builtin'],console:{log(){}},require(){return {create}},localStorage:{getItem(){return null},setItem(){}},
    Pebble:{addEventListener(n,f){handlers[n]=f},sendAppMessage(m){sent.push(m)},openURL(){}},
    setTimeout(fn,ms){timers.set(++next,{fn,at:now+ms});return next},clearTimeout(id){timers.delete(id)},
    setInterval(){},clearInterval(){},navigator:{},XMLHttpRequest:function(){requests.push(this);this.open=()=>{};this.send=()=>{}}};
  vm.createContext(s);vm.runInContext(fs.readFileSync(file,'utf8'),s);
  return {s,sent,requests,handlers,run(code){vm.runInContext(code,s)},tick(){
    const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
    if(!entry)return false;timers.delete(entry[0]);now=entry[1].at;entry[1].fn();return true;
  }};
}
for (const file of ['src/faces/photo-face/src/pkjs/index.js','src/shared/franchise-face/pkjs.tmpl.js']) {
  test(file+': an unacknowledged prefetch stops after two attempts',()=>{
    const p=phone(file);p.run("pfQueue=['r:review'];imgCache.review=[1,2,3];pfRun();");
    for(let i=0;i<20&&p.tick();i++);
    assert.equal(p.sent.filter(m=>m.IMG_TOTAL).length,2);
    assert.equal(p.s.pfInflight,null);assert.equal(p.s.pfQueue.length,0);assert.equal(p.tick(),false);
  });
  test(file+': a local advance cancels a late HTTP display response',()=>{
    const p=phone(file);p.run(file.includes('photo-face')?"cfg.galleries=[{enabled:true,end:'next',items:['r:a','r:b']}];cfg.cursor={g:0,i:0};":"cfg.sel=['r:a','r:b'];cfg.cursor=0;");
    p.run('onRequestIdx(0);onCursorIdx(1);');
    p.requests[0].status=200;p.requests[0].responseText='AQID';p.requests[0].onload();
    assert.equal(p.sent.some(m=>m.IMG_TOTAL),false);assert.equal(p.s.displayBusy,false);
  });
  test(file+': image HTTP timeout releases foreground ownership',()=>{
    const p=phone(file);p.run("transferRef('r:missing',true)");
    assert.equal(p.requests[0].timeout,12000);p.requests[0].ontimeout();assert.equal(p.s.displayBusy,false);
  });
}
test('transport chunks have stable identity and retry the same offset',()=>{
  const sent=[];const send=create({send(m,ok,fail){sent.push({m,ok,fail})},log(){},status(){},idle(){},stale(){return false}});
  send(Array(5000).fill(1),1,null,9,null);
  sent[0].ok();const first=sent[1];first.fail('lost ack');
  assert.equal(sent[2].m.IMG_OFFSET,0);assert.equal(sent[2].m.IMG_SEQ,first.m.IMG_SEQ);
  sent[2].ok();assert.equal(sent[3].m.IMG_OFFSET,4096);
  send([2],2,null,10,null);assert.notEqual(sent.at(-1).m.IMG_SEQ,first.m.IMG_SEQ);
});
function page(target) {
 const notice={textContent:'',setAttribute(){}};
 const s={window:{},location:{search:target?'?return_to='+encodeURIComponent(target):''},document:{getElementById(){return notice},createElement(){return notice},body:{appendChild(){}}}};
 vm.createContext(s);vm.runInContext(fs.readFileSync('docs/shared/pebble-image.js','utf8'),s);return {s,api:s.window.PebbleImage,notice};
}
test('settings reject executable and external callbacks without leaking config',()=>{
 for(const target of ['javascript:void(0);//','data:text/html,test','https://example.com/collect?','http://localhost.evil:8000/close?','http://localhost:80/other?']) {
  const p=page(target);assert.equal(p.api.closeConfig({uploads:{private:'photo'}}),false);assert.equal(p.s.document.location,undefined);assert.match(p.notice.textContent,/callback/);
 }
 for(const target of ['', 'pebblejs://close#','http://localhost:12345/close?','http://127.0.0.1:8000/close?']) {
  const p=page(target);assert.equal(p.api.closeConfig({}),true);assert.ok(p.s.document.location);
 }
});
test('64 enabled images save; 65 are refused visibly in both gallery models',()=>{
 for(const cfg of [{sel:Array(65).fill('r:a')},{galleries:[{enabled:true,items:Array(65).fill('r:a')}]}]) {
  const p=page();assert.equal(p.api.closeConfig(cfg),false);assert.match(p.notice.textContent,/64/);assert.equal(p.s.document.location,undefined);
  (cfg.sel||cfg.galleries[0].items).pop();assert.equal(p.api.closeConfig(cfg),true);
 }
 const p=page();assert.equal(p.api.closeConfig({galleries:[{enabled:false,items:Array(100).fill('r:a')}]}),true);
});
// Settings-page protocol v2 (photo-face): upload bytes cross once, page -> phone.
// Objects born inside the vm have their own Object prototype, so compare by value.
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
function photoFaceWith(cfg) {
  const p=phone('src/faces/photo-face/src/pkjs/index.js');
  p.run('cfg='+JSON.stringify(cfg)+';');
  const urls=[];p.s.Pebble.openURL=(u)=>urls.push(u);
  const save=(resp)=>p.handlers.webviewclosed({response:encodeURIComponent(JSON.stringify(resp))});
  return {p,urls,save};
}
const base={galleries:[{id:'g',name:'G',enabled:true,end:'loop',items:['u:a']}],uploads:{a:'iVBORa'},thumbs:{a:'/9j/a'},cursor:{g:0,i:0}};
test('photo-face: settings page gets thumbnails, never upload bytes; a legacy upload ships its PNG once',()=>{
  const {p,urls}=photoFaceWith({...base,uploads:{a:'iVBORa',old:'iVBORold'},galleries:[{id:'g',name:'G',enabled:true,end:'loop',items:['u:a','u:old']}]});
  p.handlers.showConfiguration();
  const sent=JSON.parse(decodeURIComponent(urls[0].split('#')[1]));
  assert.equal(sent.v,2);assert.equal(sent.uploads,undefined);assert.equal(sent.bag,undefined);
  same(sent.thumbs,{a:'/9j/a',old:'iVBORold'});
});
test('photo-face: a v2 save merges only the new photos and prunes what no gallery references',()=>{
  const {p,save}=photoFaceWith(base);
  save({v:2,galleries:[{id:'g',name:'G',enabled:true,end:'loop',items:['u:a','u:b','u:ghost']}],uploads:{b:'iVBORb'},thumbs:{b:'/9j/b',a:'/9j/a2'},cursor:{g:0,i:0}});
  same(p.s.cfg.uploads,{a:'iVBORa',b:'iVBORb'});
  same(p.s.cfg.thumbs,{a:'/9j/a2',b:'/9j/b'});
  same(p.s.cfg.galleries[0].items,['u:a','u:b'],'a ref with no bytes behind it is dropped');
  save({v:2,galleries:[{id:'g',name:'G',enabled:true,end:'loop',items:['u:b']}],uploads:{},thumbs:{},cursor:{g:0,i:0}});
  same(p.s.cfg.uploads,{b:'iVBORb'});same(p.s.cfg.thumbs,{b:'/9j/b'});
});
test('photo-face: a pre-v2 page still replaces the uploads wholesale',()=>{
  const {p,save}=photoFaceWith(base);
  save({galleries:[{id:'g',name:'G',enabled:true,end:'loop',items:['u:c']}],uploads:{c:'iVBORc'},cursor:{g:0,i:0}});
  same(p.s.cfg.uploads,{c:'iVBORc'});same(p.s.cfg.thumbs,{});
});
