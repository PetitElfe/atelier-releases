/* ALPHA 0.18 — tests ciblés de création et de lisibilité du Calendrier.
   Base SQLite temporaire : aucune donnée Windows/TEST ni stable n'est ouverte. */
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const {mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve} = require('node:path');
const assert = require('node:assert/strict');

const port=18771,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-calendar-priority-'));
const child=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},
  stdio:'ignore'
});
async function ready(){
  for(let i=0;i<120;i++){
    try{if((await fetch(base+'/api/runtime-version')).ok)return}catch(_){}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  throw new Error('Le serveur du test Calendrier ne répond pas');
}
async function api(path,method='GET',body){
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  if(!res.ok)throw new Error(path+' -> HTTP '+res.status+': '+await res.text());
  return res.json();
}
(async()=>{
  let browser;
  try{
    await ready();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.evaluate(async()=>{
      state.cursor=parseYMD('2026-10-20');
      await refresh();
      showView('calendar');
      setCalendarMode('month');
      renderMonth();
    });

    // Création ordinaire depuis le mois, sans URL ni rappel ni heures.
    await page.locator('#monthGrid .day-add').first().click();
    await page.locator('#eventForm input[name="title"]').fill('Création mensuelle sans rappel E2E');
    await page.locator('#eventForm input[name="event_date"]').fill('2026-10-20');
    await page.locator('#saveEvent').click();
    await page.locator('#eventForm').waitFor({state:'detached',timeout:15000});
    const month=await api('/api/events?start=2026-10-20&end=2026-10-20');
    assert.ok(month.some(e=>e.title==='Création mensuelle sans rappel E2E'),
      'La création mensuelle sans rappel doit être sauvegardée');

    // Création depuis la semaine, avec début/fin, toujours sans rappel.
    await page.evaluate(()=>{state.cursor=parseYMD('2026-10-20');setCalendarMode('week');renderWeek()});
    await page.locator('#addEventWeek').click();
    await page.locator('#eventForm input[name="title"]').fill('Création hebdomadaire sans rappel E2E');
    await page.locator('#eventForm input[name="event_date"]').fill('2026-10-20');
    await page.locator('#eventForm input[name="start_time"]').fill('15:00');
    await page.locator('#eventForm input[name="end_time"]').fill('15:30');
    await page.locator('#saveEvent').click();
    await page.locator('#eventForm').waitFor({state:'detached',timeout:15000});
    const saved=await api('/api/events?start=2026-10-20&end=2026-10-20');
    const weekCreated=saved.find(e=>e.title==='Création hebdomadaire sans rappel E2E');
    assert.ok(weekCreated&&weekCreated.start_time==='15:00'&&weekCreated.end_time==='15:30',
      'La création hebdomadaire doit enregistrer le titre, la date et les heures');

    // Reproduire toutes les catégories automatiques et deux couleurs personnalisées.
    const fixtures=[
      ['Général automatique','general','auto','17:00'],
      ['Médical automatique','medical','auto','18:00'],
      ['Important automatique','important','auto','19:00'],
      ['Mauve personnalisé','general','mauve','20:00'],
      ['Bleu foncé personnalisé','general','deep-blue','21:00']
    ];
    const created=[];
    for(const [title,category,color,start_time] of fixtures){
      created.push(await api('/api/events','POST',{
        title,event_date:'2026-10-20',start_time,end_time:start_time.slice(0,2)+':45',
        category,color,show_in_month:true
      }));
    }
    await page.evaluate(async()=>{await refresh();state.cursor=parseYMD('2026-10-20');setCalendarMode('week');renderWeek()});
    await page.waitForFunction(()=>document.querySelectorAll('#weekGrid .week-timed-event').length>=5);
    const rendered=await page.evaluate(ids=>{
      const channel=n=>{const value=n/255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4};
      const lum=color=>{
        const rgb=(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
        return .2126*channel(rgb[0])+.7152*channel(rgb[1])+.0722*channel(rgb[2]);
      };
      return ids.map(id=>{
        const card=document.querySelector('#weekGrid .week-timed-event[data-event-id="'+id+'"]');
        if(!card)return {id,missing:true};
        const background=getComputedStyle(card).backgroundColor;
        const foreground=getComputedStyle(card.querySelector('.week-card-title')).color;
        const a=lum(background),b=lum(foreground);
        return {id,background,foreground,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      });
    },created.map(e=>e.id));
    for(let i=0;i<rendered.length;i++){
      assert.ok(rendered[i].contrast>=4.5,
        'Contraste insuffisant dans le semainier pour '+fixtures[i][0]+': '+JSON.stringify(rendered[i]));
    }

    // Les deux créations via l'interface doivent survivre au rechargement.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.evaluate(async()=>{state.cursor=parseYMD('2026-10-20');await refresh();showView('calendar');setCalendarMode('week');renderWeek()});
    const persisted=await api('/api/events?start=2026-10-20&end=2026-10-20');
    assert.ok(persisted.some(e=>e.title==='Création mensuelle sans rappel E2E'));
    assert.ok(persisted.some(e=>e.title==='Création hebdomadaire sans rappel E2E'));
    assert.ok(await page.locator('#weekGrid .week-timed-event[data-event-id="'+weekCreated.id+'"]').count());
    assert.deepEqual(errors,[],'Le Calendrier ne doit déclencher aucune erreur JavaScript');
    console.log('PASS: créations mensuelle et hebdomadaire, persistance et contrastes >= 4.5:1');
  }finally{
    if(browser)await browser.close();
    child.kill();
    rmSync(data,{recursive:true,force:true});
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
