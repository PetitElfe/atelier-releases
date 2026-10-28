/* End-to-end: standalone preparation lists and five-visible-row daily checkboxes.
   All data lives in an ephemeral SQLite directory, never Léo's TEST installation. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18827,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-prep-daily-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok)return}catch{}await pause(130)}throw Error('Temporary server unavailable')}
async function api(path,method='GET',body){
 const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json();if(!res.ok)throw Error(method+' '+path+' '+res.status+': '+JSON.stringify(data));return data;
}
(async()=>{
 let browser;
 try{
  await ready();
  // Preserved event preparation tables must still exist and work separately.
  const list=await api('/api/standalone-preparations','POST',{title:'Préparer un voyage',due_date:'2026-11-02'});
  const first=await api('/api/standalone-preparations/'+list.id+'/items','POST',{title:'Vérifier les papiers'});
  await api('/api/standalone-preparation-items/'+first.id,'PUT',{done:true});
  let prep=(await api('/api/standalone-preparations'))[0];
  assert.equal(prep.title,'Préparer un voyage');assert.equal(prep.items[0].done,1);
  assert.ok((await api('/api/preparations/upcoming')).length===0,'Un projet ne crée pas de faux RDV');
  await api('/api/standalone-preparations/'+list.id,'PUT',{archived:true});
  assert.equal((await api('/api/standalone-preparations')).length,0);
  assert.equal((await api('/api/standalone-preparations?archived=1'))[0].items[0].done,1);
  await api('/api/standalone-preparations/'+list.id,'PUT',{archived:false});

  // Current day checkable cells in multiple independent grids; numeric
  // measures and annual/monthly-by-month grids don't pretend to be daily.
  const today=new Date(),day=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const monthly=await api('/api/tracker-boards','POST',{title:'Habitudes',color:'rose',period_unit:'months',period_count:1});
  const fortnight=await api('/api/tracker-boards','POST',{title:'Ménage',color:'sage',period_unit:'weeks',period_count:2});
  const yearly=await api('/api/tracker-boards','POST',{title:'Bilan annuel',color:'gold',period_unit:'years',period_count:1});
  for(let i=0;i<7;i++)await api('/api/tracker-boards/'+monthly.id+'/rows','POST',{title:'Rituel '+i,mode:'check'});
  await api('/api/tracker-boards/'+fortnight.id+'/rows','POST',{title:'Passer l’aspirateur',mode:'check'});
  await api('/api/tracker-boards/'+fortnight.id+'/rows','POST',{title:'Minutes de ménage',mode:'number'});
  await api('/api/tracker-boards/'+yearly.id+'/rows','POST',{title:'Bilan annuel',mode:'check'});
  const daily=await api('/api/tracker-boards/daily?day='+day);
  assert.equal(daily.items.length,8,'Seven habits plus cleaning; numeric/yearly are excluded');
  assert.ok(daily.items.some(x=>x.board_title==='Ménage'&&x.title==='Passer l’aspirateur'));
  assert.ok(!daily.items.some(x=>x.board_title==='Bilan annuel'));
  const row=daily.items.find(x=>x.board_title==='Ménage');
  await api('/api/tracker-board-rows/'+row.row_id+'/mark','PUT',{day,value:true});
  assert.equal((await api('/api/tracker-boards/daily?day='+day)).items.find(x=>x.row_id===row.row_id).done,true);

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady && document.querySelectorAll('#homeDailyTrackersList input[type="checkbox"]').length===8);
  const widget=page.locator('#homeDailyTrackersWidget');
  assert.ok(await widget.isVisible(),'The new daily tracker card is visible on Home by default');
  const metrics=await widget.evaluate(el=>{
    const box=el.querySelector('.home-daily-trackers-list');
    return{visible:box.clientHeight,scroll:box.scrollHeight,total:box.querySelectorAll('label').length};
  });
  assert.equal(metrics.total,8);assert.ok(metrics.scroll>metrics.visible+10,'More than five lines must scroll');
  assert.ok(metrics.visible<265,'Only about five lines are shown at once');
  const habit=page.locator('#homeDailyTrackersList label').filter({hasText:'Rituel 0'});
  await habit.locator('input').check();
  const habitId=daily.items.find(x=>x.title==='Rituel 0').row_id;
  await page.waitForFunction(async({id,day})=>
    (await (await fetch('/api/tracker-boards/daily?day='+day)).json()).items.find(x=>x.row_id===id).done,
    {id:habitId,day});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>homeCanvasReady&&document.querySelectorAll('#homeDailyTrackersList input').length===8);
  assert.equal(await page.locator('#homeDailyTrackersList label').filter({hasText:'Rituel 0'}).locator('input').isChecked(),true);
  await page.locator('#homeDailyTrackersList label').filter({hasText:'Rituel 0'}).locator('input').uncheck();
  await page.waitForFunction(async({id,day})=>
    !(await (await fetch('/api/tracker-boards/daily?day='+day)).json()).items.find(x=>x.row_id===id).done,
    {id:habitId,day});
  // The old "Préparatifs" pane must be absent. Its saved data remain
  // readable (Settings > Archives) and are never deleted on upgrade.
  assert.equal(await page.locator('#sideNav [data-view="preparations"]').count(),0);
  assert.equal(await page.locator('#preparationsView').count(),0);
  await page.evaluate(()=>showView('settings'));
  await page.waitForFunction(()=>document.querySelector('#settingsLegacyPreparations')?.textContent.includes('Préparer un voyage'));
  assert.match(await page.locator('#settingsLegacyPreparations').innerText(),/Vérifier les papiers/);
  assert.equal((await api('/api/standalone-preparations'))[0].items[0].done,1);
  assert.equal((await api('/api/tracker-boards/daily?day='+day)).items.length,8);
  assert.equal((await api('/api/preparations/upcoming')).length,0);
  if(errors.length)throw Error('Browser page errors: '+errors.join(' / '));
  console.log('PASS: retired Preparatifs UI without erasing saved lists; 8 daily tracker rows, 5 visible, scroll, check/uncheck, F5');
 }finally{
  await browser?.close();server.kill();rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
