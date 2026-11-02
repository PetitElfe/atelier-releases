const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../mobile/prototype/index.html'),'utf8');
const start=html.indexOf('/* Capture existing 0.1.5 WebView localStorage');
const end=html.indexOf("const KEY='goblin-mobile-prototype-v1';",start);
assert.ok(start>0&&end>start,'Startup protection must precede old state initialization.');
const js=html.slice(start,end);
function setup(initial,options={}){
 const data=new Map(Object.entries(initial));
 const calls=[],alerts=[];
 let confirmed=options.confirmed??true;
 const storage={
  get length(){return data.size},
  key(i){return [...data.keys()][i]??null},
  getItem(k){return data.has(k)?data.get(k):null},
  setItem(k,v){data.set(k,String(v))}
 };
 const bridge={
  snapshot(raw,reason){calls.push({raw:JSON.parse(raw),reason});return options.failSnapshot!==true},
  latestSnapshot(){return options.restore||''},
  originalSnapshot(){return options.original||''}
 };
 const context={window:options.noBridge?{}:{AtelierAutoBackup:bridge},localStorage:storage,
   location:{reload(){calls.push({reason:'reload'})}},alert(s){alerts.push(s)},confirm(){return confirmed},Date};
 vm.runInNewContext(js,context);
 return {data,calls,alerts,ctx:context};
}
test('first launch backs up legacy notes and mental journal before state initialization',()=>{
 const saved=setup({'goblin-mobile-prototype-v1':'{"notes":["anciennes notes"]}',
  'goblin-mobile-mental-v1':'{"journal":["secret"]}', 'jdr':'un texte'});
 assert.equal(saved.calls.length,1);
 assert.equal(saved.calls[0].reason,'startup');
 assert.equal(saved.calls[0].raw.format,'goblin-localstorage-v1');
 assert.deepEqual(Object.fromEntries(Object.entries(saved.calls[0].raw.entries)),Object.fromEntries(saved.data));
 assert.equal(saved.ctx.goblinFirstBackupOkay,undefined); // lexical const stays encapsulated
});
test('no native bridge does not change old data',()=>{
 const saved=setup({journal:'texte ancien'}, {noBridge:true});
 assert.equal(saved.calls.length,0);
 assert.equal(saved.data.get('journal'),'texte ancien');
});
test('restore requires an automatic pre-restore safety snapshot',()=>{
 const saved=setup({journal:'récent'},{
  restore:JSON.stringify({format:'goblin-localstorage-v1',entries:{journal:'ancien'}}),
  failSnapshot:true});
 saved.ctx.goblinRestoreBackup(saved.ctx.window.AtelierAutoBackup.latestSnapshot());
 assert.equal(saved.data.get('journal'),'récent');
 assert.match(saved.alerts.at(-1),/sauvegarder les données actuelles/);
});
test('restore brings the old content back without clearing unrelated keys',()=>{
 const saved=setup({journal:'nouveau',unrelated:'préservé'});
 saved.ctx.goblinRestoreBackup(JSON.stringify({format:'goblin-localstorage-v1',entries:{journal:'ancien'}}));
 assert.equal(saved.data.get('journal'),'ancien');
 assert.equal(saved.data.get('unrelated'),'préservé');
 assert.deepEqual(saved.calls.map(c=>c.reason),['startup','pre-restore','reload']);
});
test('invalid and incompatible backup formats cannot replace localStorage',()=>{
 const saved=setup({journal:'courant'});
 saved.ctx.goblinRestoreBackup('{"format":"untrusted","entries":{"journal":"effacer"}}');
 saved.ctx.goblinRestoreBackup('{"format":"goblin-localstorage-v1","entries":{"journal":123}}');
 assert.equal(saved.data.get('journal'),'courant');
 assert.equal(saved.calls.length,1);
});
test('button refuses future update when pre-update snapshot fails',()=>{
 assert.match(html,/goblinSnapshot\('pre-update'\)/);
 assert.match(html,/installation annulée pour protéger tes données/);
 assert.ok(html.indexOf("const goblinFirstBackupOkay=goblinSnapshot('startup')")<html.indexOf("const KEY='goblin-mobile-prototype-v1'"));
});
test('full app inline JavaScript has valid syntax',()=>{
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match);
 new Function(match[1]);
});
