/* E2E: contexte calendrier → règles, compteurs, réglages indépendants, édition et suppression. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18808,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-cycle-compact-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'
});
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok)return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Startup timeout')}
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(j));return j;
}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function add(d,days){const x=new Date(d);x.setDate(x.getDate()+days);return x}
(async()=>{
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1400,height:900}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#settingsBtn').waitFor();
  await page.evaluate(()=>showView('calendar'));
  await page.locator('#monthGrid .day-cell.today').waitFor();
  assert.equal(await page.locator('#calendarCycleHint').count(),0);
  assert.equal(await page.locator('.cycle-module').count(),0);
  await page.locator('#monthGrid .day-cell.today').click({button:'right'});
  assert.deepEqual(await page.locator('#atelierContextMenu button').allTextContents(),['Nouveau rendez-vous','Règles']);
  await page.locator('#atelierContextMenu button').filter({hasText:'Règles'}).click();
  await page.locator('#cycleQuickEditor').waitFor({state:'visible'});
  const today=ymd(new Date());
  assert.equal(await page.locator('#cycleQuickForm [name=start_date]').inputValue(),today);
  await page.locator('#cycleQuickForm button[type=submit]').click();
  await page.locator('#cycleQuickEditor').waitFor({state:'detached'});
  let periods=await api('/api/cycle-periods');assert.equal(periods.length,1);
  await page.locator('#calendarCycleSummary').waitFor({state:'visible'});
  assert.match(await page.locator('#calendarCycleSummary').innerText(),/estimation indisponible/);
  // Deux débuts espacés de 28 jours permettent le calcul du prochain cycle.
  const prev=ymd(add(new Date(),-28));
  await api('/api/cycle-periods','POST',{start_date:prev,end_date:null});
  await page.evaluate(()=>refreshOrganisation());
  assert.match(await page.locator('#calendarCycleSummary').innerText(),/J−28/);
  assert.match(await page.locator('#calendarCycleSummary').innerText(),/Mode Goblin grognon dans J−14/);
  assert.equal(await page.locator('#monthGrid .day-cell.today.cycle-recorded').count(),1);
  await page.locator('#settingsBtn').click();
  await page.locator('#settingsCycleShowInfo').waitFor({state:'visible'});
  assert.equal(await page.locator('#settingsCycleShowInfo').isChecked(),true);
  assert.equal(await page.locator('#settingsCycleShowMarks').isChecked(),true);
  await page.locator('#settingsCycleShowMarks').uncheck();
  await page.locator('#settingsCycleShowInfo').uncheck();
  await page.evaluate(()=>showView('calendar'));
  assert.equal(await page.locator('#monthGrid .day-cell.today.cycle-recorded').count(),0);
  assert.equal(await page.locator('#calendarCycleSummary').isHidden(),true);
  // Réglages indépendants dans une seconde installation / profil WebView.
  const context2=await browser.newContext({viewport:{width:1200,height:800}});
  const page2=await context2.newPage();
  await page2.goto(base,{waitUntil:'domcontentloaded'});
  await page2.evaluate(()=>showView('calendar'));
  await page2.locator('#calendarCycleSummary').waitFor({state:'visible'});
  assert.equal(await page2.locator('#monthGrid .day-cell.today.cycle-recorded').count(),1);
  await context2.close();
  // Le clic droit permet aussi de modifier et de supprimer une période existante.
  await page.locator('#monthGrid .day-cell.today').click({button:'right'});
  await page.locator('#atelierContextMenu button').filter({hasText:'Règles'}).click();
  const end=ymd(add(new Date(),3));
  await page.locator('#cycleQuickForm [name=end_date]').fill(end);
  await page.locator('#cycleQuickForm button[type=submit]').click();
  periods=await api('/api/cycle-periods');
  assert.equal(periods.find(p=>p.start_date===today).end_date,end);
  await page.locator('#monthGrid .day-cell.today').click({button:'right'});
  await page.locator('#atelierContextMenu button').filter({hasText:'Règles'}).click();
  await page.locator('.cycle-quick-delete').click();
  await page.locator('.cycle-quick-yes').click();
  periods=await api('/api/cycle-periods');
  assert.equal(periods.length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: compact cycle editor, J-28/J-14, independent settings, markers, edit/delete');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
