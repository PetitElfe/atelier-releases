/* ALPHA 0.18 — la liste « À venir » développée passe devant le carnet.
   Vérification sur serveur et base jetables, sans données utilisateur. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18772,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-home-overlay-'));
const child=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:String(port),ATELIER_NO_BROWSER:'1'},
  stdio:'ignore'
});
async function ready(){
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'/api/runtime-version')).ok)return}catch(_){}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  throw Error('Le serveur temporaire Accueil ne démarre pas');
}
async function api(path,method='GET',body){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw Error(path+': '+response.status+' '+await response.text());
  return response.json();
}
(async()=>{
  let browser;
  try{
    await ready();
    const next=new Date();next.setDate(next.getDate()+1);
    const future=[next.getFullYear(),String(next.getMonth()+1).padStart(2,'0'),String(next.getDate()).padStart(2,'0')].join('-');
    for(let i=1;i<=6;i++){
      await api('/api/events','POST',{title:'RDV Accueil '+i,event_date:future,
        start_time:String(9+i).padStart(2,'0')+':00',category:'general',show_in_month:true});
    }
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!document.getElementById('homeCanvas'),null,{timeout:15000});
    await page.evaluate(async()=>{await refresh();showView('home');renderHome()});
    await page.locator('#homeUpcoming .home-upcoming-toggle').waitFor();
    const toggleText=await page.locator('#homeUpcoming .home-upcoming-toggle').innerText();
    assert.match(toggleText,/Voir les 6 rendez-vous/);
    const oldStored=await page.evaluate(()=>localStorage.getItem('atelierHomeCanvasV2_upcoming'));

    // Reproduire deux modules qui se chevauchent sans persister ces coordonnées.
    await page.evaluate(()=>{
      const widget=document.querySelector('#homeUpcomingWidget');
      const book=document.querySelector('#journalBook');
      Object.assign(widget.style,{left:'100px',top:'120px',width:'370px',height:'170px',transform:'none'});
      Object.assign(book.style,{left:'260px',top:'132px',width:'700px',height:'480px',transform:'none'});
      document.querySelector('#homeUpcoming .home-upcoming-toggle').click();
    });
    assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),6,
      'Développer doit afficher les 6 rendez-vous, pas seulement 3');
    const overlap=await page.evaluate(()=>{
      const widget=document.querySelector('#homeUpcomingWidget');
      const book=document.querySelector('#journalBook');
      const row=document.querySelectorAll('#homeUpcoming .home-appt-main')[3];
      const r=row.getBoundingClientRect(),b=book.getBoundingClientRect();
      const x=Math.max(r.left+12,b.left+20),y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      return {expanded:widget.classList.contains('home-upcoming-expanded'),
        inBook:x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom,
        inRow:x>=r.left&&x<=r.right,
        widgetInFront:!!hit?.closest('#homeUpcomingWidget'),
        zIndex:getComputedStyle(widget).zIndex,overflow:getComputedStyle(widget).overflow};
    });
    assert.ok(overlap.expanded&&overlap.inBook&&overlap.inRow,
      'Le test doit construire un chevauchement réel : '+JSON.stringify(overlap));
    assert.ok(overlap.widgetInFront,
      'Les rendez-vous étendus doivent passer devant le Carnet : '+JSON.stringify(overlap));
    assert.equal(overlap.overflow,'visible','Une carte de hauteur réduite ne doit pas couper le déroulé');
    assert.equal(await page.evaluate(()=>localStorage.getItem('atelierHomeCanvasV2_upcoming')),oldStored,
      'Développer la liste ne doit pas réécrire les positions enregistrées');

    await page.evaluate(()=>document.querySelector('#homeUpcoming .home-upcoming-toggle').click());
    assert.equal(await page.locator('#homeUpcoming .home-appt-row').count(),3);
    assert.equal(await page.locator('#homeUpcomingWidget').evaluate(el=>el.classList.contains('home-upcoming-expanded')),false,
      'Réduire la liste doit restituer l’empilement normal');
    assert.deepEqual(errors,[],'Aucune erreur JavaScript sur l’Accueil');
    console.log('PASS: les 6 RDV passent devant le Carnet sans modifier les coordonnées sauvegardées');
  }finally{
    if(browser)await browser.close();
    child.kill();
    rmSync(data,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
