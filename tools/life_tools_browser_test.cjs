const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18812,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-life-tools-'));
const server=spawn('python',[resolve(__dirname,'..','app','app.py')],{
  env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:String(port)},stdio:'ignore'
});
async function ready(){for(let i=0;i<120;i++){try{if((await fetch(base+'/api/version')).ok)return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Server startup timeout')}
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(j));return j;
}
(async()=>{
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1665,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#journalPageNumber').waitFor();
  assert.equal(await page.locator('#journalPageNumber').innerText(),'1–2');
  await page.locator('#journalNextPage').click();
  assert.equal(await page.locator('#journalPageNumber').innerText(),'3–4');
  assert.ok(await page.locator('#journalBook').evaluate(el=>el.classList.contains('journal-page-2')));
  await page.locator('#journalBackToToday').click();
  const today=new Date(),date=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const task=await api('/api/tasks','POST',{title:'Journal tâche interactive',due_date:date,due_time:'14:45'});
  await page.evaluate(()=>refresh());
  const check=page.locator('#homeTodayTasks .journal-task-check').first();
  await check.waitFor();await check.check();
  await page.waitForFunction(async id=>(await (await fetch('/api/tasks')).json()).some(x=>x.id===id&&x.completed),task.id);
  const event=await api('/api/events','POST',{title:'RDV du journal',event_date:date,start_time:'16:30',category:'important'});
  await page.evaluate(()=>refresh());
  assert.ok((await page.locator('#homeDeadlineLines').innerText()).includes('16h30'));
  await page.evaluate(()=>showView('trackers'));
  await page.locator('#trackerCreateForm [name=title]').fill('Lecture');
  await page.locator('#trackerCreateForm [name=unit]').fill('pages');
  await page.locator('#trackerCreateForm button[type=submit]').click();
  await page.locator('#trackerList .life-card').first().waitFor();
  const tracker=(await api('/api/trackers'))[0];
  await page.locator('#trackerList [name=value]').first().fill('42');
  await page.locator('#trackerList button[type=submit]').first().click();
  await page.waitForFunction(async id=>(await (await fetch('/api/trackers')).json()).some(x=>x.id===id&&x.entries.some(e=>e.value===42)),tracker.id);
  await page.evaluate(()=>showView('admin'));
  await page.locator('#adminCreateForm [name=title]').fill('Dossier CAF');
  await page.locator('#adminCreateForm button[type=submit]').click();
  await page.locator('#adminList .life-card').first().waitFor();
  await page.locator('#adminList select.life-status').first().selectOption('waiting');
  await page.waitForFunction(async()=>(await (await fetch('/api/admin')).json()).some(x=>x.title==='Dossier CAF'&&x.status==='waiting'));
  await page.evaluate(()=>showView('home'));
  await page.locator('#journalNextPage').click();
  assert.match(await page.locator('#journalTrackerSummary').innerText(),/Lecture/);
  assert.match(await page.locator('#journalAdminSummary').innerText(),/Dossier CAF/);
  await page.evaluate(()=>lifeOpenCapture());
  await page.locator('#quickCaptureText').fill('#Car');
  assert.ok(await page.locator('#quickCaptureSuggestions button').count()>0);
  await page.locator('#quickCaptureSuggestions button').first().click();
  await page.locator('#quickCaptureText').fill('#Carnet Première idée\nDeuxième ligne');
  await page.locator('#quickCaptureSend').click();
  await page.waitForFunction(async()=>(await (await fetch('/api/captures')).json()).some(x=>x.body.includes('Deuxième ligne')));
  await page.evaluate(()=>showView('captures'));
  assert.ok(await page.locator('.life-capture.life-unread').count()>0);
  await page.locator('.life-capture-body').first().click();
  await page.waitForFunction(async()=>(await (await fetch('/api/captures')).json()).every(x=>x.seen===1));
  await page.evaluate(()=>lifeOpenCapture());
  await page.locator('#quickCaptureText').fill('#Tâches Nouvelle tâche via capture');
  await page.locator('#quickCaptureSend').click();
  assert.ok((await api('/api/tasks')).some(x=>x.title==='Nouvelle tâche via capture'));
  // Both Windows editions must accept only their own localhost origin.
  // This disposable test server uses a third port and must not start a real updater.
  for(const [path,header,body] of [
    ['/api/update/start','X-Atelier-Update',{revision:'0'.repeat(40)}],
    ['/api/desktop-postits/new','X-Atelier-Desktop',{}]
  ]){
    const wrong=await fetch(base+path,{method:'POST',
      headers:{Origin:'http://127.0.0.1:8876',[header]:'1','Content-Type':'application/json'},
      body:JSON.stringify(body)});
    assert.equal(wrong.status,403,path+' must reject a foreign localhost origin');
    const own=await fetch(base+path,{method:'POST',
      headers:{Origin:base,[header]:'1','Content-Type':'application/json'},
      body:JSON.stringify(body)});
    assert.equal(own.status,409,path+' should pass the origin check and then fail its TEST-only guard');
  }
  await page.evaluate(()=>showView('settings'));
  assert.ok((await page.locator('#settingsRunningEdition').innerText()).includes('Installation locale (port 18812)'));
  await page.locator('#settingsReminderSound').check();
  assert.equal(await page.evaluate(()=>localStorage.getItem('atelierReminderSound')),'1');
  await page.locator('#settingsTestReminderSound').click();
  await page.locator('#settingsQuickCaptureShortcut').focus();
  await page.keyboard.press('Control+Alt+KeyJ');
  await page.waitForFunction(()=>document.querySelector('#settingsQuickCaptureShortcut').value==='Ctrl+Alt+J');
  assert.equal((await api('/api/quick-capture/hotkey')).shortcut,'Ctrl+Alt+J');
  await page.keyboard.press('Control+Alt+KeyJ');
  assert.equal(await page.locator('#quickCaptureOverlay').evaluate(el=>!el.classList.contains('hidden')),true);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>showView('home'));
  await page.locator('#globalLayoutEdit').click();
  const corner=page.locator('#openCalendarCard .layout-corner-nw');
  assert.ok(await corner.count(),'Top-left resize handle exists');
  assert.equal(await corner.evaluate(el=>getComputedStyle(el).cursor),'nwse-resize');
  await page.locator('#globalLayoutEdit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok((await api('/api/trackers'))[0].entries.some(x=>x.value===42));
  assert.equal((await api('/api/admin'))[0].status,'waiting');
  assert.ok((await api('/api/captures')).some(x=>x.body.includes('Deuxième ligne')));
  assert.equal(await page.evaluate(()=>localStorage.getItem('atelierReminderSound')),'1');
  assert.deepEqual(errors,[]);
  console.log('PASS: journal pages and checkboxes, timed deadlines, trackers, admin, routed multiline capture, unread highlight, sound and shortcut settings, same-origin native action guards, edition label, directional grips and persistence');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
