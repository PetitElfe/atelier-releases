/* Vérification navigateur : semainier plein écran, lisibilité, cycle adaptatif. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const port=18809,base='http://127.0.0.1:'+port;
const data=mkdtempSync(join(tmpdir(),'atelier-week-forecast-'));
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
  const context=await browser.newContext({viewport:{width:1665,height:900}});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>showView('calendar'));
  assert.equal(await page.locator('#calendarCycleHint').count(),0,'Old giant cycle banner removed');
  assert.equal(await page.locator('#miniMonth').count(),0,'Redundant miniature calendar removed');
  assert.equal(await page.locator('#weekPanel .mini-panel').count(),0,'Empty left sidebar removed');
  await page.evaluate(()=>setCalendarMode('week'));
  await page.locator('#weekGrid .week-head.week-current-day').waitFor();
  assert.equal(await page.locator('#weekGrid .week-head.week-current-day .week-today-label').innerText(),'AUJOURD’HUI');
  const dimensions=await page.evaluate(()=>{
    const view=document.querySelector('#calendarView').getBoundingClientRect();
    const scroll=document.querySelector('#weekPanel .week-scroll').getBoundingClientRect();
    const day=document.querySelector('#weekGrid .week-day-layer').getBoundingClientRect();
    const slots=[...document.querySelectorAll('#weekGrid .week-slot')];
    return {viewWidth:view.width,weekWidth:scroll.width,dayWidth:day.width,
      slotHeight:slots[0].getBoundingClientRect().height,
      todaySlots:slots.filter(s=>s.classList.contains('week-current-day')).length,
      horizontalScroll:document.querySelector('#weekPanel .week-scroll').scrollWidth>scroll.width+2,
      verticalScroll:(()=>{const el=document.querySelector('#weekPanel .week-scroll');return el.scrollHeight>el.clientHeight+10&&getComputedStyle(el).overflowY==='auto'})()};
  });
  assert.ok(dimensions.weekWidth>dimensions.viewWidth*.94,'Semainier should use available width '+JSON.stringify(dimensions));
  assert.ok(dimensions.dayWidth>=156,'Readable columns '+JSON.stringify(dimensions));
  assert.ok(dimensions.slotHeight>=62&&dimensions.slotHeight<=70,'Agenda-style one-hour rows '+JSON.stringify(dimensions));
  // Regression: every cell must align precisely with its hour and weekday.
  const geometry=await page.evaluate(()=>{
    const grid=document.querySelector('#weekGrid');
    const cell=(hour,col)=>[...grid.querySelectorAll('.week-slot')].find(el=>el.style.gridRow===String(hour+2)&&el.style.gridColumn===String(col+2));
    const left=[...grid.querySelectorAll('.time-label')].find(el=>el.style.gridRow==='6'&&el.style.gridColumn==='1');
    const right=[...grid.querySelectorAll('.week-time-right')].find(el=>el.style.gridRow==='6');
    const slot=cell(4,0),other=cell(4,6);
    const day=document.querySelector('.week-day-layer');
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
    return {left:rect(left),right:rect(right),slot:rect(slot),other:rect(other),day:rect(day),grid:rect(grid)};
  });
  assert.ok(Math.abs(geometry.left.y-geometry.right.y)<2&&Math.abs(geometry.left.y-geometry.slot.y)<2,
    'Left and right labels and hour cells must align: '+JSON.stringify(geometry));
  assert.ok(geometry.other.x>geometry.slot.x+geometry.slot.width*5,
    'The seven weekdays must occupy distinct columns: '+JSON.stringify(geometry));
  assert.ok(geometry.day.width<geometry.grid.width/5&&geometry.day.height>geometry.slot.height*23,
    'Event layer stays in exactly one day and spans 24 hours: '+JSON.stringify(geometry));
  assert.equal(dimensions.todaySlots,24,'All 24 hourly slots must be visible for today');
  assert.equal(await page.locator('#weekGrid .week-time-right').count(),24,'Right edge repeats every hourly label');
  assert.equal(await page.locator('#weekGrid .week-time-right').first().innerText(),'00:00');
  assert.equal(await page.locator('#weekGrid .week-time-right').last().innerText(),'23:00');
  assert.equal(dimensions.horizontalScroll,false,'2K width should fit without horizontal scroll');
  assert.equal(dimensions.verticalScroll,true,'Large hourly rows must remain vertically scrollable at 900px');
  // Reuse a temporary SQLite instance; test only real date entries.
  const today=new Date(),todayStr=ymd(today),starts=[-84,-56,-26].map(d=>ymd(add(today,d)));
  for(const start of starts)await api('/api/cycle-periods','POST',{start_date:start,end_date:null});
  await page.evaluate(()=>refreshOrganisation());
  const forecast=await page.evaluate(()=>cycleEstimate());
  assert.equal(forecast.average,29,'Recent cycles 28 then 30 days => weighted 29');
  assert.equal(forecast.approxDays,3);
  assert.equal(forecast.duration,5,'No recorded end => 5-day tentative display');
  const next=ymd(add(today,3));
  await page.evaluate(()=>setCalendarMode('month'));
  const forecastCell=page.locator('#monthGrid .day-cell.cycle-forecast-start');
  assert.ok(await forecastCell.count()>=1,'Future period shown in faint red');
  assert.match(await forecastCell.first().getAttribute('title'),/Règles possibles/);
  assert.equal(await page.locator('#monthGrid .day-cell.cycle-recorded').count()>0,true);
  // A forecast three days ahead can be in the NEXT calendar week (e.g. Sat -> Tue).
  // Display the week containing the predicted date; don't require it in today's week.
  await page.evaluate(async iso=>{
    state.cursor=parseYMD(iso);
    await refresh();
    setCalendarMode('week');
  },forecast.next);
  assert.ok(await page.locator('#weekGrid .week-head.cycle-forecast').count()>=1,'Future period visible in its actual weekly header');
  // Predicted start must be adjustable after a new observed interval is recorded.
  const newStart=ymd(add(today,-1));
  await api('/api/cycle-periods','POST',{start_date:newStart,end_date:null});
  await page.evaluate(()=>refreshOrganisation());
  const adjusted=await page.evaluate(()=>cycleEstimate());
  assert.notEqual(adjusted.next,forecast.next,'A new actual period updates forecast');
  assert.equal(adjusted.last,newStart);
  // Future dates are never saved as confirmed records.
  const periods=await api('/api/cycle-periods');
  assert.equal(periods.length,4);
  assert.ok(!periods.some(p=>p.start_date===next));
  // Visibility preference independent of stored period data.
  await page.locator('#settingsBtn').click();
  // The phone-style settings UI displays one card at a time.
  await page.locator('.atelier-settings-nav button[data-target="settingsCycleCard"]').click();
  await page.locator('#settingsCycleShowMarks').uncheck();
  await page.evaluate(()=>showView('calendar'));
  assert.equal(await page.locator('#weekGrid .week-head.cycle-forecast').count(),0);
  assert.equal(await page.locator('#weekGrid .week-head.cycle-recorded').count(),0);
  assert.equal((await api('/api/cycle-periods')).length,4);
  await page.locator('#settingsBtn').click();
  await page.locator('.atelier-settings-nav button[data-target="settingsCycleCard"]').click();
  await page.locator('#settingsCycleShowMarks').check();
  await page.evaluate(()=>showView('calendar'));
  // Restore the current week after intentionally navigating to the predicted week.
  await page.evaluate(async iso=>{
    state.cursor=parseYMD(iso);
    await refresh();
  },todayStr);
  // A long appointment with overlap must remain legible and open on hover.
  await api('/api/events','POST',{title:'Consultation médicale importante avec préparation et documents',
    event_date:todayStr,start_time:'10:00',end_time:'12:30',color:'mauve',category:'medical',show_in_month:true});
  await api('/api/events','POST',{title:'Deuxième rendez-vous simultané',
    event_date:todayStr,start_time:'10:30',end_time:'11:45',color:'deep-blue',category:'general',show_in_month:true});
  await page.evaluate(()=>refresh());
  await page.evaluate(()=>setCalendarMode('week'));
  const todayLayer=page.locator('#weekGrid .week-day-layer[data-date="'+todayStr+'"]');
  const cards=todayLayer.locator('.week-timed-event');
  await cards.first().waitFor();
  assert.equal(await cards.count(),2);
  const before=await cards.first().locator('.week-card-open').boundingBox();
  const titleStyle=await cards.first().locator('.week-card-title').evaluate(el=>({
    wordBreak:getComputedStyle(el).wordBreak,wrap:getComputedStyle(el).overflowWrap
  }));
  assert.equal(titleStyle.wordBreak,'normal','Do not cut words arbitrarily');
  await cards.first().hover();
  const after=await cards.first().locator('.week-card-open').boundingBox();
  assert.ok(after.width>=before.width,'Full title expands on hover');
  assert.match(await cards.first().locator('.week-card-open').getAttribute('title'),/Consultation médicale/);
  // Smaller viewport: horizontal scrolling is preferred to 7 unreadable slivers.
  await page.setViewportSize({width:900,height:700});
  const narrow=await page.evaluate(()=>{
    const s=document.querySelector('#weekPanel .week-scroll');
    return {scroll:s.scrollWidth,client:s.clientWidth};
  });
  assert.ok(narrow.scroll>narrow.client,'Narrow screens should scroll horizontally');
  assert.deepEqual(errors,[],'No browser JavaScript errors');
  console.log('PASS: week layout, today highlight, 2K and narrow screens, readable events, adaptive predicted cycle and independent visibility');
 }finally{
  if(browser)await browser.close();
  server.kill();rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:150});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
