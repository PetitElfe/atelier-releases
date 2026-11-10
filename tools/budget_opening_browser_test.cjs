/* Monthly cash checkpoint: rendered controls + real API, preserved history. */
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-opening-')),base='http://127.0.0.1:18979';
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_PORT:'18979',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function request(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:await r.json()}}
async function api(path,method='GET',body){const r=await request(path,method,body);if(r.status>=400)throw Error(JSON.stringify(r));return r.value}
(async()=>{let browser;try{
 for(let i=0;i<120;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 await api('/api/budget/settings','PUT',{opening_balance:1000,opening_date:'2026-10-01'});
 await api('/api/budget/entries','POST',{title:'Ancienne opération',kind:'expense',category:'Test',amount:20,date:'2026-10-02',planned:false});
 const past=await api('/api/budget?month=2026-10');
 await api('/api/budget/entries','POST',{title:'Opération conservée',kind:'expense',category:'Test',amount:30,date:'2026-11-01',planned:false});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.AtelierStudio?.ready);await page.evaluate(async()=>{showView('budget');await loadBudget('2026-11')});
 const root=page.locator('#studioBudget');await root.getByRole('button',{name:'Solde au 1er du mois',exact:true}).waitFor();
 assert.equal(await root.locator('input[type=month]').count(),1);assert.equal(await root.locator('h2').count(),0,'Do not repeat the month next to its picker');
 await root.getByRole('button',{name:'Solde au 1er du mois',exact:true}).click();
 let dialog=page.locator('#studioFormHost');await dialog.locator('[name=amount]').fill('500.50');await dialog.locator('[type=submit]').click();await dialog.waitFor({state:'detached'});
 let b=await api('/api/budget?month=2026-11');assert.equal(b.month_opening_balance_cents,50050);assert.equal(b.forecast_cents,47050);assert.equal(b.entries.length,1);
 const stale=await request('/api/budget/opening-balance','PUT',{month:'2026-11',amount:0,revision:0});assert.equal(stale.status,409);
 await page.reload();await page.waitForFunction(()=>window.AtelierStudio?.ready);await page.evaluate(async()=>{showView('budget');await loadBudget('2026-11')});
 await root.getByRole('button',{name:'Solde au 1er du mois',exact:true}).click();dialog=page.locator('#studioFormHost');assert.equal(await dialog.locator('[name=amount]').inputValue(),'500.5');
 await dialog.getByRole('button',{name:'Mettre à 0 €',exact:true}).click();await dialog.locator('[type=submit]').click();await dialog.waitFor({state:'detached'});
 b=await api('/api/budget?month=2026-11');assert.equal(b.forecast_cents,-3000);assert.equal(b.entries[0].title,'Opération conservée');
 assert.equal((await api('/api/budget?month=2026-10')).forecast_cents,past.forecast_cents);
 assert.equal((await api('/api/budget?month=2026-12')).month_opening_balance_cents,-3000);
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/budget-month-opening.png'});assert.deepEqual(errors,[]);
 console.log('PASS: one month label, monthly opening control, zero reset, reload, stale-write rejection, preserved transactions/previous month and forward carry');
}finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.once('close',r));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
