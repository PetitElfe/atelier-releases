const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../mobile/prototype/index.html'),'utf8');
function between(from,to){
 const a=html.indexOf(from),b=html.indexOf(to,a+from.length);
 assert.ok(a!==-1&&b>a, 'source anchors missing: '+from);
 return html.slice(a,b);
}

test('page router still delegates to mental and ordinary views',()=>{
 assert.ok(!html.includes('existingRenderGoblin()'), 'Undefined renderer cannot be called');
 const block=between('const renderWithMental=render;','function goHome(){');
 const calls=[];
 const state={page:'mental'};
 const elements=new Map();
 const context={
  state, render(){calls.push('previous:'+state.page)},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',replaceChildren(){}});return elements.get(id)}},
  grimoireView(){calls.push('recipes')},
  jdrView(){calls.push('notes')},
  renderOrganizedSettings(){calls.push('settings-sections')},
  updateNav(){calls.push('nav')}
 };
 vm.createContext(context);vm.runInContext(block,context);
 for(const page of ['mental','journal','tools','settings','connected']){
  calls.length=0;state.page=page;context.render();
  assert.ok(calls.includes('previous:'+page),'Delegation failed on '+page);
  if(page==='settings')assert.ok(calls.includes('settings-sections'));
 }
 state.page='jdr';calls.length=0;context.render();
 assert.ok(calls.includes('notes'));
 assert.equal(elements.get('title').textContent,'Mes notes');
 state.page='grimoire';calls.length=0;context.render();
 assert.ok(calls.includes('recipes'));
});

test('star swipe opens guided breathing on pointerup, without a second render',()=>{
 const block=between("const goblinStar=document.querySelector('.star-tab');","// Preserve the complete page-render chain");
 const listeners=new Map(),calls=[],attributes={};
 const button={
  style:{},setPointerCapture(id){calls.push(['capture',id])},
  setAttribute(k,v){attributes[k]=v},
  addEventListener(name,fn){const v=listeners.get(name)||[];v.push(fn);listeners.set(name,v)}
 };
 const context={document:{querySelector(selector){assert.equal(selector,'.star-tab');return button}},
  mentalGo(...args){calls.push(['breathing',...args])},
  setTimeout(fn){return 1}
 };
 vm.createContext(context);vm.runInContext(block,context);
 const dispatch=(event,e)=>{for(const handler of listeners.get(event)||[])handler({pointerId:1,isPrimary:true,clientY:200,type:event,stopImmediatePropagation(){},preventDefault(){},...e})};
 dispatch('pointerdown',{clientY:250});
 dispatch('pointermove',{clientY:200});
 assert.equal(button.style.transform,'translateY(-50px)');
 dispatch('pointerup',{clientY:185});
 assert.ok(calls.some(x=>x[0]==='breathing'&&x[1]==='anxiety'&&x[2]===true),'swipe did not show breathing');
 assert.equal(button.style.transform,'translateY(0)');
 assert.match(attributes['aria-label'],/Glisser vers le haut/);
});

test('small swipe springs home and does not open breathing',()=>{
 const block=between("const goblinStar=document.querySelector('.star-tab');","// Preserve the complete page-render chain");
 const listeners=new Map(),calls=[];
 const button={style:{},setPointerCapture(){},setAttribute(){},addEventListener(k,fn){const v=listeners.get(k)||[];v.push(fn);listeners.set(k,v)}};
 const context={document:{querySelector(){return button}},mentalGo(...args){calls.push(args)}};
 vm.createContext(context);vm.runInContext(block,context);
 function fire(type,y){for(const h of listeners.get(type)||[])h({type,pointerId:1,isPrimary:true,clientY:y,stopImmediatePropagation(){},preventDefault(){}})}
 fire('pointerdown',300);fire('pointermove',280);fire('pointerup',278);
 assert.equal(calls.length,0);assert.equal(button.style.transform,'translateY(0)');
});

test('hashtag categories include title, body and category field without duplication',()=>{
 const block=between('function noteTags(text){','function storeJdr(){');
 const ctx={};vm.createContext(ctx);vm.runInContext(block,ctx);
 assert.deepEqual(Array.from(ctx.noteTags('#santé #Projets #santé #idées')),['#santé','#projets','#idées']);
 assert.match(html,/tags:noteTags\(tags\.value\+' '\+title\.value\+' '\+content\.value\)/);
 assert.match(html,/const hashtags=noteTags\(\(note\.tags\|\|\[\]\)\.join\(' '\)\+' '\+note\.title\+' '\+note\.content\)/);
 assert.ok(html.includes("const jdrKey='goblin-mobile-jdr-notes-v1'"),'Legacy notes storage must not be renamed');
 assert.ok(!html.includes('Notes JDR'),'JDR must not be presented as required subject');
});

test('long touch highlight hidden only on mobile navigation buttons',()=>{
 assert.ok(html.includes('-webkit-tap-highlight-color:transparent'));
 assert.ok(html.includes('touch-action:manipulation'));
});

test('mobile application inline script compiles',()=>{
 const js=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(js);
 new Function(js[1]);
});
