/* ALPHA 0.18 refonte — données temporaires et navigateur isolé. */
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os');
const {join,resolve}=require('node:path'),assert=require('node:assert/strict');
const port=18773,base='http://127.0.0.1:'+port,data=mkdtempSync(join(tmpdir(),'atelier-big-refonte-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
 env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:String(port),ATELIER_NO_BROWSER:'1'},stdio:'ignore'
});
const api=async(p,method='GET',body)=>{
 const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)});
 const s=await r.text();if(!r.ok)throw Error(p+' : '+r.status+' '+s);return s?JSON.parse(s):{};
};
(async()=>{
 let browser;
 try{
  for(let i=0;i<120;i++){try{if((await fetch(base+'/api/runtime-version')).ok)break}catch(_){}await new Promise(r=>setTimeout(r,150))}
  const board=await api('/api/tracker-boards','POST',{title:'Tableau de copie E2E',color:'sage',period_unit:'months',period_count:1});
  const a=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Lire',mode:'number',target_count:10});
  const b=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Marcher',mode:'check'});
  const day=new Date().toISOString().slice(0,10);
  await api('/api/tracker-board-rows/'+a.id+'/mark','PUT',{day,value:4});
  const copy=await api('/api/tracker-board-rows/'+a.id+'/duplicate','POST',{});
  let response=await api('/api/tracker-boards?month='+day.slice(0,7));
  let found=response.find(x=>Number(x.id)===board.id);
  assert.ok(found,'Le tableau source doit être retrouvé');
  const original=found.rows.find(x=>x.id===a.id),duplicated=found.rows.find(x=>x.id===copy.id);
  assert.equal(duplicated.title,'Lire (copie)');
  assert.equal(duplicated.mode,'number');
  assert.equal(duplicated.target_count,10);
  assert.equal(duplicated.marks[day],undefined,'Une copie ne doit jamais copier les progressions historiques');
  assert.equal(original.marks[day],'4','La ligne originale doit garder toutes les anciennes marques');
  await api('/api/tracker-board-rows/'+copy.id+'/move','PUT',{before_id:a.id});
  response=await api('/api/tracker-boards?month='+day.slice(0,7));
  found=response.find(x=>x.id===board.id);
  assert.deepEqual(found.rows.map(x=>x.id),[copy.id,a.id,b.id],'Le glisser doit persister le nouvel ordre');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{showView('calendar');setCalendarMode('week');renderWeek()});
  await page.locator('#weekGrid .week-day-number').first().waitFor();
  assert.equal(await page.locator('#weekGrid .week-day-number').count(),7);
  assert.ok((await page.locator('#weekGrid').evaluate(x=>getComputedStyle(x).minWidth))!=='0px');
  await page.evaluate(()=>showView('admin'));
  assert.ok(await page.locator('#adminSearch').isVisible());
  await page.evaluate(()=>showView('trackers'));
  await page.waitForFunction(()=>document.querySelector('[data-tracker-row-id]'));
  assert.ok(await page.locator('.tracker-row-duplicate').count()>=2);
  assert.ok(await page.locator('.tracker-row-grip[draggable=true]').count()>=2);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('trackers'));
  await page.waitForFunction(()=>document.querySelector('[data-tracker-row-id]'));
  assert.deepEqual(errors,[]);
  console.log('PASS: duplication sans coches, ordre persistant, semainier, admin et poignées');
 }finally{if(browser)await browser.close();server.kill();rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
