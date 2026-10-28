/* Playwright regression: opt-in habit subtasks, target 10, weekly Tuesday,
   central Settings archives; completely isolated temporary data directory. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18835,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-tracker-ritual-'));
const proc=spawn('python',[resolve(__dirname,'..','app','app.py')],{
 env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok)return}catch{}await pause(140)}throw Error('Server not ready')}
async function api(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)});
 const content=await response.json();
 if(!response.ok)throw Error(response.status+' '+path+' '+JSON.stringify(content));
 return content;
}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
(async()=>{
 let browser;
 try{
  await ready();
  const now=new Date(),day=iso(now),todayWeekday=(now.getDay()+6)%7;
  const habit=await api('/api/tracker-boards','POST',{title:'Habitudes',color:'sage',period_unit:'months',period_count:1});
  const number=await api('/api/tracker-boards/'+habit.id+'/rows','POST',
    {title:'Boire dix verres',mode:'number',target_count:10});
  const morning=await api('/api/tracker-boards/'+habit.id+'/rows','POST',
    {title:'Se lever à 9 h',mode:'check'});
  const task=await api('/api/tasks','POST',{title:'Routine du matin'});
  await api('/api/tracker-board-rows/'+morning.id+'/setup','PUT',{
    title:'Se lever à 9 h',weekday:null,target_count:null,
    linked_type:'task',linked_id:task.id,
    steps:[{title:'Ouvrir les volets'},{title:'Boire un verre d’eau'}]
  });
  const week=await api('/api/tracker-boards','POST',{title:'Corvées',color:'blue',period_unit:'weeks',period_count:1});
  const tuesday=await api('/api/tracker-boards/'+week.id+'/rows','POST',{
    title:'Sortir les poubelles',mode:'check',weekday:1
  });
  const dated=new Date(now);dated.setDate(now.getDate()+(1-todayWeekday));
  const tuesdayDay=iso(dated);
  const monday=new Date(dated);monday.setDate(dated.getDate()-1);
  const fail=await fetch(base+'/api/tracker-board-rows/'+tuesday.id+'/mark',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({day:iso(monday),value:true})
  });
  assert.equal(fail.status,409,'Monday must be gray and protected server-side');
  await api('/api/tracker-board-rows/'+tuesday.id+'/mark','PUT',{day:tuesdayDay,value:true});
  assert.equal((await api('/api/tracker-boards/daily?day='+tuesdayDay)).items
    .find(x=>x.row_id===tuesday.id).done,true);
  if(todayWeekday!==1)assert.ok(!(await api('/api/tracker-boards/daily?day='+day)).items
    .some(x=>x.row_id===tuesday.id),'Tuesday-only row must not clutter other days');
  const cfg=(await api('/api/tracker-boards')).find(x=>x.id===habit.id).rows.find(x=>x.id===morning.id);
  assert.equal(cfg.steps.length,2);
  assert.equal(cfg.linked_type,'task');
  assert.equal(cfg.linked_id,task.id);

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('trackers'));
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===2);
  const card=page.locator('.tracker-board').filter({has:page.locator('h3:text-is("Habitudes")')});
  assert.match(await card.locator('.tracker-board-range').innerText(),new RegExp(String(now.getFullYear())));
  assert.equal(await card.locator('p').filter({hasText:'Une case représente'}).count(),0,
    'Redundant explanatory line was removed');
  const row=card.locator('.tracker-grid-line').filter({hasText:'Se lever à 9 h'});
  await row.locator('.tracker-row-title').click();
  await page.locator('#trackerRitualModal').waitFor({state:'visible'});
  assert.equal(await page.locator('.tracker-ritual-step').count(),2);
  await page.locator('.tracker-ritual-step input').nth(0).check();
  await page.waitForFunction(async({id,day})=>{
    const r=(await (await fetch('/api/tracker-boards?month='+day.slice(0,7))).json())
      .flatMap(x=>x.rows).find(x=>x.id===id);
    return !r?.marks?.[day];
  },{id:morning.id,day});
  await page.locator('.tracker-ritual-step input').nth(1).check();
  await page.waitForFunction(async({id,day})=>
    (await (await fetch('/api/tracker-boards')).json()).flatMap(x=>x.rows)
      .find(x=>x.id===id)?.marks?.[day]==='1',{id:morning.id,day});
  // Le serveur confirme l'écriture avant la fin du handler async côté UI :
  // attendre le rendu évite de confondre latence et régression.
  await page.waitForFunction(()=>
    document.querySelector('.tracker-ritual-progress')?.textContent.includes('Validé'),
    null,{timeout:12000});
  assert.match(await page.locator('.tracker-ritual-progress').innerText(),/Validé/);
  await page.locator('.tracker-ritual-actions').getByRole('button',{name:'Fermer'}).click();
  const numberRow=card.locator('.tracker-grid-line').filter({hasText:'Boire dix verres'});
  const cell=numberRow.locator('.tracker-day-cell')
    .filter({hasText:/./}).first();
  // Find today's exact cell by the accessible date, even after layout re-renders.
  const numToday=numberRow.locator('.tracker-cell-wrap.tracker-today .tracker-day-cell');
  for(let value=1;value<=10;value++){
    await numToday.click();
    await page.waitForFunction(async({id,day,value})=>{
      const x=(await (await fetch('/api/tracker-boards')).json()).flatMap(b=>b.rows)
        .find(r=>r.id===id);
      return Number(x?.marks?.[day])===value;
    },{id:number.id,day,value});
  }
  await page.waitForFunction(async({id,day})=>
    (await (await fetch('/api/tracker-boards/daily?day='+day)).json()).items
      .find(x=>x.row_id===id)?.done===true,{id:number.id,day},{timeout:12000});
  assert.equal((await api('/api/tracker-boards/daily?day='+day)).items
    .find(x=>x.row_id===number.id).done,true);
  await page.evaluate(()=>showView('home'));
  await page.waitForFunction(()=>document.querySelectorAll('#homeDailyTrackersList label').length>=2);
  assert.ok((await page.locator('#homeDailyTrackersList').innerText()).includes('10/10'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('trackers'));
  await page.waitForFunction(()=>document.querySelectorAll('.tracker-board').length===2);
  assert.equal((await api('/api/tracker-boards')).find(x=>x.id===habit.id).rows
    .find(x=>x.id===morning.id).marks[day],'1');
  assert.equal(await page.locator('#sideNav [data-view="preparations"]').count(),0);
  assert.equal(await page.locator('#journalTrackerSummary').count(),0);
  const denied=await fetch(base+'/api/tracker-board-rows/'+morning.id+'/mark',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({day,value:true})
  });
  assert.equal(denied.status,409,'A ritual cannot bypass its pending steps');
  console.log('PASS: two-step ritual, 1..10 click counter, weekly Tuesday, linked task, F5, no forgotten Journal/Preparatifs UI');
 }finally{await browser?.close();proc.kill();rmSync(data,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
