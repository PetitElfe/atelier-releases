/* Accueil : migration ciblée d'une To-do list existante vers le rectangle annoté. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const assert=require('node:assert/strict');
const port=18927,base='http://127.0.0.1:'+port;
const temp=mkdtempSync(join(tmpdir(),'atelier-todo-size-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:temp,ATELIER_PORT:String(port),ATELIER_NO_BROWSER:'1'},
  stdio:'ignore'
});
(async()=>{
 let browser;
 try{
  let ready=false;
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'/api/version')).ok){ready=true;break}}catch(_){}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  assert.ok(ready,'Le serveur TEST temporaire démarre');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1650,height:940}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady,null,{timeout:15000});
  const original={x:12,y:195,width:575,height:372,scale:1};
  await page.evaluate(prev=>{
    const shapes={
      homeBudgetWidget:{x:10,y:12,width:398,height:80},
      upcoming:{x:425,y:12,width:360,height:212},
      journal:{x:425,y:280,width:740,height:490},
      calendar:{x:1230,y:310,width:365,height:317},
      homeDailyTrackersWidget:prev
    };
    for(const [key,value] of Object.entries(shapes))
      localStorage.setItem('atelierHomeCanvasV2_'+key,JSON.stringify({...value,scale:1}));
    localStorage.removeItem('atelierTodoTopRightApplied_20261030');
    localStorage.removeItem('atelierTodoTopRightPrevious_20261030');
  },original);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady&&localStorage.getItem('atelierTodoTopRightApplied_20261030')==='1',null,{timeout:15000});
  const result=await page.evaluate(()=>{
    const canvas=document.querySelector('#homeCanvas'),
      todo=document.querySelector('#homeDailyTrackersWidget'),
      book=document.querySelector('#journalBook'),
      a=todo.getBoundingClientRect(),b=book.getBoundingClientRect();
    return {
      width:a.width,height:a.height,
      left:parseFloat(todo.style.left),top:parseFloat(todo.style.top),
      canvasWidth:canvas.clientWidth,
      overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,
      old:localStorage.getItem('atelierTodoTopRightPrevious_20261030'),
      current:JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeDailyTrackersWidget')),
      tracks:['#homeTodoPreview','#homeDailyTrackersList'].map(id=>{
        const el=document.querySelector(id),cs=getComputedStyle(el);
        return {id,scrollbar:cs.scrollbarWidth,overflowY:cs.overflowY};
      })
    };
  });
  assert.equal(result.width,640,'Largeur correspondant au rectangle annoté');
  assert.ok(result.height>=210&&result.height<=251,'Hauteur compacte 210–250px : '+result.height);
  assert.equal(result.overlap,false,'Le module ne couvre plus le carnet');
  assert.ok(Math.abs(result.top-10)<=1,'Placement dans l’espace libre en haut');
  assert.ok(Math.abs(result.canvasWidth-result.left-640-67)<=3,'Ancrage à droite, sans changer les autres modules');
  assert.deepEqual(JSON.parse(result.old),original,'Ancien emplacement de la To-do list sauvegardé exactement');
  assert.ok(result.tracks.every(t=>t.scrollbar==='none'&&t.overflowY==='auto'),
    'Les deux listes gardent le défilement sans barre visible');
  await page.evaluate(()=>{
    for(const selector of ['#homeTodoPreview','#homeDailyTrackersList']){
      const el=document.querySelector(selector),dummy=document.createElement('div');
      dummy.style.height='500px';dummy.style.flexShrink='0';
      dummy.textContent='Élément de test temporaire';
      el.append(dummy);
      el.scrollTop=80;
      if(el.scrollTop<25)throw Error('Défilement impossible dans '+selector);
    }
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady,null,{timeout:15000});
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeDailyTrackersWidget')));
  assert.deepEqual(after,result.current,'Emplacement et hauteur conservés après F5');
  // Une modification manuelle doit primer sur la migration déjà effectuée.
  await page.evaluate(()=>{
    const key='atelierHomeCanvasV2_homeDailyTrackersWidget';
    const value=JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key,JSON.stringify({...value,x:value.x-18,y:20,height:222}));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady,null,{timeout:15000});
  const manual=await page.evaluate(()=>{
    const el=document.querySelector('#homeDailyTrackersWidget');
    return {height:el.getBoundingClientRect().height,top:parseFloat(el.style.top),
      flag:localStorage.getItem('atelierTodoTopRightApplied_20261030')};
  });
  assert.ok(Math.abs(manual.height-222)<2&&manual.top===20&&manual.flag==='1',
    'Le prochain F5 respecte la taille et la place choisies manuellement');
  assert.deepEqual(errors,[],'Aucune erreur JavaScript');
  console.log('PASS: To-do list ~640x250 en haut à droite, sans chevaucher le livre, défilement et F5 conservés');
 }finally{if(browser)await browser.close();server.kill();rmSync(temp,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exitCode=1});
