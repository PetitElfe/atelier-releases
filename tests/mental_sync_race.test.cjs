const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../mobile/prototype/index.html'),'utf8');
const code=html.slice(html.indexOf('function mentalFingerprint'),html.indexOf('function mentalView'));
const copy=x=>JSON.parse(JSON.stringify(x));
const blank=()=>({cards:[],answers:[],journal:[],phrases:[]});
const entry=(id,text='original',updatedAt='2026-11-02T00:00:00Z')=>({id,text,updatedAt});
function setup(kind='journal'){
 const data=blank();data[kind]=[entry('existing')];
 let release,reject,started;
 const waiting=new Promise(r=>started=r),post=new Promise((r,j)=>{release=r;reject=j});
 const storage=new Map();let payload;
 const ctx=vm.createContext({mentalBaseKey:'sync-base',mentalSyncBase:{},mentalSyncBusy:false,pcUrl:'https://test.ts.net',mentalData:copy(data),localStorage:{setItem(k,v){storage.set(k,v)}},mentalSave(){storage.set('data',JSON.stringify(ctx.mentalData))},callPc:async(method,url,body)=>{
  if(method==='GET'){const remote=blank();remote.journal=[entry('remote')];return {rev:0,data:remote}}
  payload=copy(body);started();return post;
 }});
 vm.runInContext(code,ctx);
 return {ctx,storage,waiting,release,reject,payload:()=>payload};
}
for(const kind of ['journal','answers','cards','phrases']){
 for(const operation of ['add','edit','delete'])test(`${kind}: preserve ${operation} during POST`,async()=>{
  const s=setup(kind),status={},button={};const sync=s.ctx.mentalSyncNow(status,button);await s.waiting;
  if(operation==='add')s.ctx.mentalData[kind].push(entry('late','added','2026-11-02T01:00:00Z'));
  if(operation==='edit')Object.assign(s.ctx.mentalData[kind][0],entry('existing','changed','2026-11-02T01:00:00Z'));
  if(operation==='delete')Object.assign(s.ctx.mentalData[kind][0],{deletedAt:'2026-11-02T01:00:00Z',updatedAt:'2026-11-02T01:00:00Z'});
  const local=copy(s.ctx.mentalData[kind]);s.release({ok:true,rev:1});await sync;
  for(const item of local)assert.deepEqual(copy(s.ctx.mentalData[kind].find(x=>x.id===item.id)),item);
  assert.ok(s.ctx.mentalData.journal.some(x=>x.id==='remote'));
  assert.equal(s.payload().data[kind].find(x=>x.id==='existing').text,'original');
  assert.equal(s.ctx.mentalSyncBase[kind].existing,'2026-11-02T00:00:00Z');
  assert.match(status.textContent,/synchronise à nouveau/);
  assert.equal(button.disabled,false);
  assert.deepEqual(JSON.parse(s.storage.get('data')),copy(s.ctx.mentalData));
  // A subsequent explicit sync sends the pending changes with no spurious history.
  const remote=s.payload().data;s.ctx.callPc=async(method,url,body)=>method==='GET'?{rev:1,data:remote}:{ok:true,rev:2};
  await s.ctx.mentalSyncNow(status,button);
  for(const item of local)assert.deepEqual(copy(s.ctx.mentalData[kind].find(x=>x.id===item.id)),item);
  assert.ok(!s.ctx.mentalData[kind].some(x=>x.id.startsWith('history-')));
 });
}
test('network failure keeps local edits and baseline',async()=>{
 const s=setup(),status={};const sync=s.ctx.mentalSyncNow(status,{});await s.waiting;
 s.ctx.mentalData.journal.push(entry('late'));s.reject(Error('offline'));await sync;
 assert.ok(s.ctx.mentalData.journal.some(x=>x.id==='late'));assert.deepEqual(copy(s.ctx.mentalSyncBase),{});
 assert.match(status.textContent,/données locales conservées/);
});
test('409 retries from fresh local data; duplicate click is ignored',async()=>{
 const s=setup();let reads=0,posts=0;const status={};
 s.ctx.callPc=async(method,url,body)=>{
  if(method==='GET'){reads++;return {rev:reads,data:blank()}}
  posts++;if(posts===1){s.ctx.mentalData.journal.push(entry('late'));throw Error('Carnet modifié ailleurs.')}
  assert.ok(body.data.journal.some(x=>x.id==='late'));return {ok:true,rev:3};
 };
 const running=s.ctx.mentalSyncNow(status,{});await s.ctx.mentalSyncNow({},{});await running;
 assert.equal(reads,2);assert.equal(posts,2);assert.ok(s.ctx.mentalData.journal.some(x=>x.id==='late'));
});
test('simultaneous edits on both devices keep a history copy',()=>{
 const s=setup();const merged=s.ctx.mentalMerge({journal:[entry('a','phone')]},{journal:[entry('a','PC','2026-11-02T01:00:00Z')]});
 assert.equal(merged.journal.length,2);assert.ok(merged.journal.some(x=>x.text==='phone'));assert.ok(merged.journal.some(x=>x.text==='PC'));
});
