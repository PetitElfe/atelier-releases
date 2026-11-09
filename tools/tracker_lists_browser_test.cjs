const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const folder=fs.mkdtempSync(join(tmpdir(),'atelier-tracker-lists-')),base='http://127.0.0.1:18970';
const proc=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:folder,ATELIER_PORT:'18970',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),value=await response.json();if(!response.ok)throw Error(path+' '+response.status+' '+JSON.stringify(value));return value}
const action=(action,payload)=>api('/api/studio/actions','POST',{operation_id:crypto.randomUUID(),action,payload});
(async()=>{let browser;try{
 for(let i=0;i<120;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const board=await api('/api/tracker-boards','POST',{title:'Habitudes',color:'gold',period_unit:'months',period_count:1}),rows=[];
 const names=['Levé avant 9 h','Manger matin','Dents matin','Sport','Boire de l’eau','Douche','Skincare','Journaling','Ranger 30 min'];
 const colors=['#7876ad','#c7ae35','#6d9f8a','#688d48','#537bb6','#91c5c9','#a06fac','#82609c','#6b9c91'];
 for(let i=0;i<names.length;i++){
  const row=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:names[i],mode:i===4?'number':'check',target_count:i===4?10:null});rows.push(row);
  await action('save',{id:'tracker-row-'+row.id,kind:'tracker-row',revision:0,data:{row_id:row.id,title:names[i],color:colors[i]}});
 }
 const today=new Date().toLocaleDateString('sv-SE');
 await action('tracker-mark',{row_id:rows[1].id,day:today,base:null,value:true});
 for(let i=0;i<6;i++)await api('/api/tasks','POST',{title:'Petite tâche '+(i+1),due_date:today});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1862,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const key='atelierHomeCanvasV2_homeDailyTrackersWidget';
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({x:30,y:230,width:640,height:250,scale:1}));
  localStorage.setItem('atelierTodoTopRightApplied_20261030','1');
 });
 await page.goto(base);
 await page.waitForFunction(()=>AtelierStudio.ready&&homeCanvasReady&&document.querySelectorAll('#homeDailyTrackersList .tracker-day-cell').length===9);
 // Inspect the normal Home layout without resetting the user's card bounds.
 fs.mkdirSync('artifacts',{recursive:true});
 await page.locator('#homeDailyTrackersWidget').screenshot({path:'artifacts/tracker-lists-home.png'});
 for(const zoom of [1,1.35]){
  await page.evaluate(z=>document.body.style.zoom=String(z),zoom);
  const metrics=await page.locator('#homeDailyTrackersWidget').evaluate(el=>({
   habit:[...el.querySelectorAll('.home-daily-tracker-row')].filter(row=>row.querySelector('[data-tracker-mode=check]')).map(row=>{const button=row.querySelector('.tracker-day-cell'),c=button.getBoundingClientRect();return {row:row.getBoundingClientRect().height,width:c.width,height:c.height,font:getComputedStyle(row.querySelector('.home-daily-tracker-name')).fontSize,checked:button.getAttribute('aria-pressed')==='true',background:getComputedStyle(button).backgroundImage}}),
   tasks:[...el.querySelectorAll('.home-todo-row')].map(row=>{const input=row.querySelector('input'),c=input.getBoundingClientRect();return {row:row.getBoundingClientRect().height,width:c.width,height:c.height,font:getComputedStyle(row.querySelector('button')).fontSize,background:getComputedStyle(input).backgroundColor}}),
   list:el.querySelector('#homeDailyTrackersList').clientHeight,scroll:el.querySelector('#homeDailyTrackersList').scrollHeight
  }));
  assert.ok(metrics.tasks.length>0,'Neighboring To-do is populated');
  for(const habit of metrics.habit){assert.ok(Math.abs(habit.width/zoom-15)<1&&Math.abs(habit.height/zoom-15)<1,'Home controls match small native checkboxes');assert.ok(Math.abs(habit.row/zoom-metrics.tasks[0].row/zoom)<=2,'Habit rows match neighboring list density');assert.equal(habit.font,metrics.tasks[0].font);if(!habit.checked)assert.ok(habit.background.includes(metrics.tasks[0].background),'Unchecked habits match the adjacent pastel checkboxes')}
  assert.ok(metrics.scroll>metrics.list,'The existing Home card keeps its internal scroll');
  await page.evaluate(()=>showView('trackers'));await page.getByRole('tab',{name:'To-do list',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.studio-todo-list>label').length===15);
  const list=await page.locator('.studio-todo-list').evaluate(el=>[...el.querySelectorAll('label')].map(row=>{const title=row.querySelector('.studio-todo-title'),s=getComputedStyle(title),control=row.querySelector('input,.tracker-day-cell'),c=control.getBoundingClientRect();return {height:row.getBoundingClientRect().height,control:c.height,titleHeight:title.getBoundingClientRect().height,border:s.borderWidth,padding:s.padding,background:s.backgroundColor,radius:s.borderRadius}}));
  for(const row of list){assert.ok(row.height/zoom<=32,'Daily list rows are compact');assert.ok(row.control/zoom<=19);assert.equal(row.border,'0px');assert.equal(row.padding,'0px');assert.equal(row.background,'rgba(0, 0, 0, 0)');assert.equal(row.radius,'0px')}
  await page.evaluate(()=>showView('home'));
 }
 await page.evaluate(()=>{document.body.style.zoom='1';showView('trackers')});
 const todo=page.locator('.studio-todo-list');await page.screenshot({path:'artifacts/tracker-lists-todo.png'});
 const first=todo.locator('label').filter({hasText:names[0]});
 await first.locator('.studio-todo-title').click();await page.locator('#studioFormHost').waitFor();
 assert.ok(!(await api('/api/tracker-boards/daily')).items.find(r=>r.row_id===rows[0].id).done,'Opening the title does not toggle the checkbox');
 await page.locator('#studioFormHost').getByRole('button',{name:'Fermer',exact:true}).click();
 await first.locator('.tracker-day-cell').click();
 await page.waitForFunction(id=>document.querySelector('.studio-todo-list label:has(.tracker-day-cell[aria-pressed=true]) .studio-todo-title')&&lifeTodayChecks.find(r=>r.row_id===id)?.done,rows[0].id);
 await page.evaluate(()=>showView('home'));
 const homeFirst=page.locator('#homeDailyTrackersList label').filter({hasText:names[0]});
 await page.waitForFunction(title=>[...document.querySelectorAll('#homeDailyTrackersList label')].find(r=>r.textContent.includes(title))?.querySelector('button')?.getAttribute('aria-pressed')==='true',names[0]);
 await homeFirst.locator('button').click();
 await page.waitForFunction(id=>lifeTodayChecks.find(r=>r.row_id===id)?.done===false,rows[0].id);
 await page.evaluate(()=>showView('trackers'));
 const water=todo.locator('label').filter({hasText:names[4]});await water.locator('.tracker-day-cell').click();
 await page.waitForFunction(id=>Number(lifeTodayChecks.find(r=>r.row_id===id)?.value)===1,rows[4].id);
 await page.evaluate(()=>showView('home'));await page.locator('#homeDailyTrackersList label').filter({hasText:names[4]}).locator('button').click();
 await page.waitForFunction(id=>Number(lifeTodayChecks.find(r=>r.row_id===id)?.value)===2,rows[4].id);
 await page.evaluate(()=>showView('trackers'));
 await todo.locator('label').filter({hasText:'Petite tâche 1'}).locator('input').check();
 await page.waitForFunction(async()=>Boolean((await(await fetch('/api/tasks')).json()).find(t=>t.title==='Petite tâche 1')?.completed));
 await page.reload();await page.waitForFunction(()=>AtelierStudio.ready&&lifeTodayChecks.length===9);await page.evaluate(()=>showView('trackers'));
 assert.equal(await todo.locator('label').filter({hasText:names[4]}).locator('.tracker-day-cell').textContent(),'2 / 10');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('atelierHomeCanvasV2_homeDailyTrackersWidget'))),{x:30,y:230,width:640,height:250,scale:1},'Existing custom Home placement is preserved');
 assert.equal((await api('/api/tracker-boards/daily')).items.find(r=>r.row_id===rows[1].id).done,true);
 assert.deepEqual(errors,[]);
 console.log('PASS: Home habits match adjacent To-do at 100/135%, plain compact daily list, title editing, task checkboxes, colored checks/counters, cross-view sync, reload and saved Home placement');
 }finally{await browser?.close();try{await api('/api/shutdown','POST',{})}catch{}proc.kill();fs.rmSync(folder,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
