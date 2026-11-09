const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const folder=fs.mkdtempSync(join(tmpdir(),'atelier-tracker-layout-')),base='http://127.0.0.1:18969';
const proc=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:folder,ATELIER_PORT:'18969',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),v=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(v));return v}
const action=(action,payload)=>api('/api/studio/actions','POST',{operation_id:crypto.randomUUID(),action,payload});
const fixtures=[['Semaine','weeks',1],['Deux semaines','weeks',2],['Trois jours','days',3],['Mois','months',1],['Deux mois','months',2],['Trimestre quotidien','months',3],['Mensuel annuel','years',1,'month'],['Trimestriel annuel','years',1,'quarter'],['Semestriel annuel','years',1,'semester'],['Annuel','years',1,'year'],['Ancien annuel','years',1],['Douze semaines','weeks',12],['Quatre-vingt-dix jours','days',90],['Vingt-quatre mois','months',24],['Cinq ans','years',5]];
(async()=>{let browser;try{
 for(let i=0;i<120;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const boards=[];
 for(const [title,period_unit,period_count,mark_unit] of fixtures){
  const board=await api('/api/tracker-boards','POST',{title,period_unit,period_count,mark_unit:mark_unit||'auto',color:'sage'});
  const every=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Chaque jour',mode:'check'});
  const fixed=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Linge · mardi',mode:'check',weekday:1});
  const ritual=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Poubelle · mardi et vendredi',mode:'check'});
  await api('/api/tracker-board-rows/'+ritual.id+'/setup','PUT',{title:'Poubelle · mardi et vendredi',weekday:null,target_count:null,linked_type:'',linked_id:null,steps:[{title:'Sortir la poubelle',weekday:1},{title:'Nettoyer les bacs',weekday:4}]});
  const number=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Un compteur avec une description assez longue pour vérifier la hauteur de la ligne sans agrandir le tableau',mode:'number',target_count:10});
  boards.push({...board,ids:{every:every.id,fixed:fixed.id,ritual:ritual.id,number:number.id}});
 }
 await action('save',{id:'layout-tab',kind:'tracker-tab',revision:0,data:{title:'Tous les formats',board_ids:boards.map(b=>b.id)}});
 // An older mark must survive a later choice of fixed weekday.
 let snapshot=await api('/api/studio/snapshot');
 const first=snapshot.boards.find(b=>b.id===boards[0].id),historical=first.period.columns[0].day;
 await api('/api/tracker-board-rows/'+boards[0].ids.fixed+'/setup','PUT',{title:'Linge · mardi',weekday:null,target_count:null,linked_type:'',linked_id:null,steps:[]});
 await action('tracker-mark',{row_id:boards[0].ids.fixed,day:historical,base:null,value:true});
 await api('/api/tracker-board-rows/'+boards[0].ids.fixed+'/setup','PUT',{title:'Linge · mardi',weekday:1,target_count:null,linked_type:'',linked_id:null,steps:[]});
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1862,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('studio-tracker-tab','layout-tab'));
 await page.goto(base);await page.waitForFunction(()=>AtelierStudio.ready&&lifeBoards.length===15);
 await page.evaluate(()=>showView('trackers'));
 await page.waitForFunction(()=>document.querySelectorAll('.studio-tracker-document').length===15);
 fs.mkdirSync('artifacts',{recursive:true});
 await page.locator('[data-tracker-board-id="'+boards[0].id+'"]').screenshot({path:'artifacts/tracker-layout-week.png'});
 await page.locator('[data-tracker-board-id="'+boards[3].id+'"]').screenshot({path:'artifacts/tracker-layout-month.png'});
 for(const [width,zoom] of [[1862,1],[1280,1],[840,1],[620,1],[1280,1.25]]){
  await page.setViewportSize({width,height:1050});await page.evaluate(z=>document.body.style.zoom=String(z),zoom);
  const measured=await page.evaluate(()=>[...document.querySelectorAll('.studio-tracker-document')].map(section=>{
   const board=lifeBoards.find(b=>b.id===Number(section.dataset.trackerBoardId)),head=[...section.querySelectorAll('.tracker-grid-day')];
   return {id:board.id,granularity:board.period.granularity,columns:board.period.columns,rows:[...section.querySelectorAll('[data-tracker-row-id]')].map(line=>{
    const row=board.rows.find(r=>r.id===Number(line.dataset.trackerRowId));
    return {id:row.id,weekday:row.weekday,steps:row.steps,height:line.getBoundingClientRect().height,
     cells:[...line.querySelectorAll('.tracker-day-cell')].map(cell=>{const box=cell.getBoundingClientRect(),i=board.period.columns.findIndex(c=>c.day===cell.dataset.trackerDay),h=head[i].getBoundingClientRect();return {day:cell.dataset.trackerDay,width:box.width,height:box.height,aligned:Math.abs((box.x+box.width/2)-(h.x+h.width/2))<1}}),
     bands:[...line.querySelectorAll('.tracker-day-inactive')].map(b=>{const s=getComputedStyle(b);return {span:Number(b.style.gridColumn.split(' ')[1]),border:s.borderWidth,background:s.backgroundImage,tab:b.hasAttribute('tabindex')}})};
    }),scroll:section.querySelector('.tracker-board-scroll').getBoundingClientRect().width,section:section.getBoundingClientRect().width};
  }));
  for(const board of measured){
   assert.ok(board.scroll<=board.section+1,`${width}: table stays inside its section`);
   for(const row of board.rows){
    assert.ok(row.height/zoom<=42,`${width}: row ${row.id} must remain compact`);
    const applicable=board.columns.filter(col=>{if(board.granularity!=='days')return true;const weekday=(new Date(col.day+'T12:00:00').getDay()+6)%7;return (row.weekday==null||row.weekday===weekday)&&(!row.steps.length||row.steps.some(s=>s.weekday==null||s.weekday===weekday))});
    assert.deepEqual(row.cells.map(c=>c.day),applicable.map(c=>c.day),'Only scheduled days have controls');
    assert.equal(row.cells.length+row.bands.reduce((n,b)=>n+b.span,0),board.columns.length,'Merged bands preserve date alignment');
    for(const cell of row.cells){assert.ok(Math.abs(cell.width/zoom-32)<1&&Math.abs(cell.height/zoom-32)<1,'Cells keep their size');assert.ok(cell.aligned,'Cell is centered below its day')}
    for(const band of row.bands){assert.equal(band.border,'0px');assert.equal(band.background,'none');assert.equal(band.tab,false)}
   }
  }
 }
 await page.evaluate(()=>document.body.style.zoom='1');await page.setViewportSize({width:1862,height:1050});
 const week=page.locator('[data-tracker-board-id="'+boards[0].id+'"]'),fixed=week.locator('[data-tracker-row-id="'+boards[0].ids.fixed+'"]');
 await fixed.locator('.tracker-day-cell').click();
 await page.waitForFunction(id=>lifeBoards.flatMap(b=>b.rows).find(r=>r.id===id)&&document.querySelector('[data-tracker-row-id="'+id+'"] .tracker-day-cell[aria-pressed=true]'),boards[0].ids.fixed);
 const ritual=week.locator('[data-tracker-row-id="'+boards[0].ids.ritual+'"]');
 await ritual.locator('.tracker-day-cell').first().click();await page.locator('#trackerRitualModal').waitFor();
 assert.equal(await page.locator('.tracker-ritual-step').count(),1);
 await page.locator('.tracker-ritual-step input').check();
 await page.waitForFunction(()=>document.querySelector('.tracker-ritual-progress')?.textContent.includes('Validé'));
 await page.locator('.tracker-ritual-actions').getByRole('button',{name:'Fermer',exact:true}).click();
 const counter=week.locator('[data-tracker-row-id="'+boards[0].ids.number+'"]');
 await counter.locator('.tracker-day-cell').first().click();
 await page.waitForFunction(id=>document.querySelector('[data-tracker-row-id="'+id+'"] .tracker-day-cell')?.textContent==='1',boards[0].ids.number);
 await page.reload();await page.waitForFunction(()=>AtelierStudio.ready);await page.evaluate(()=>showView('trackers'));
 await page.waitForFunction(()=>document.querySelectorAll('.studio-tracker-document').length===15);
 assert.equal(await fixed.locator('.tracker-day-cell').count(),1);
 snapshot=await api('/api/studio/snapshot');
 assert.equal(snapshot.boards.find(b=>b.id===boards[0].id).rows.find(r=>r.id===boards[0].ids.fixed).marks[historical],'1','Historical mark is preserved behind the inactive area');
 assert.deepEqual(errors,[]);
 console.log('PASS: 15 rhythms × 5 viewport/zoom settings; compact cells, scheduled-day bands, alignment, ritual/counter, reload and historical marks');
 }finally{await browser?.close();try{await api('/api/shutdown','POST',{})}catch{}proc.kill();fs.rmSync(folder,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
