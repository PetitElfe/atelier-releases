const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
const assert=require('node:assert/strict');
const dir=fs.mkdtempSync(join(tmpdir(),'atelier-shopping-ux-')),base='http://127.0.0.1:19001';
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:dir,ATELIER_PORT:'19001',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d}
(async()=>{let browser;try{
 for(let n=0;n<150;n++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Hold the initial empty snapshot until a new list is already acknowledged.
 let release,held;const gate=new Promise(r=>release=r);let once=true;const initialSnapshot=await api('/api/groceries');
 await page.route('**/api/groceries',async route=>{try{if(once&&route.request().method()==='GET'){once=false;held=true;await gate;await route.fulfill({json:initialSnapshot})}else await route.continue()}catch{try{await route.abort()}catch{}}});
 await page.goto(base);await page.waitForFunction(()=>window.AtelierStudio?.ready&&window.atelierGroceries&&homeCanvasReady);
 while(!held)await new Promise(r=>setTimeout(r,25));
 await page.evaluate(()=>{setSideNavCollapsed(true);localStorage.setItem(homeModuleVisibilityKey('shopping'),'1');syncHomeModuleVisibility();const i=globalLayoutItems.find(x=>x.id==='shopping');saveGlobalLayout(i,{x:30,y:300,width:500,scale:1});applyGlobalLayout(i,readGlobalLayout(i))});
 await page.getByRole('button',{name:'Ajouter plusieurs aliments',exact:true}).click();
 await page.getByRole('textbox',{name:'Aliments à ajouter',exact:true}).fill('Pommes\nLait\nPâtes');
 await page.getByRole('button',{name:'Ajouter à la liste',exact:true}).click();
 await page.waitForFunction(()=>atelierGroceries.state.cart.length===3&&!atelierGroceries.state.jobs.length);
 release();await page.evaluate(()=>atelierGroceries.pull());await new Promise(r=>setTimeout(r,150));
 assert.equal(await page.evaluate(()=>atelierGroceries.state.cart.length),3,'Late empty reply cannot erase acknowledged additions');
 assert.equal((await api('/api/groceries')).cart.length,3);
 await page.reload();await page.waitForFunction(()=>atelierGroceries?.state.cart.length===3);
 // Single and multiline drafts persist before their explicit submission.
 await page.getByRole('textbox',{name:'Nouvel aliment',exact:true}).fill('Brouillon aliment');
 await page.getByRole('button',{name:'Ajouter plusieurs aliments',exact:true}).click();
 await page.getByRole('textbox',{name:'Aliments à ajouter',exact:true}).fill('Riz\nTomates');
 await page.getByRole('button',{name:'Annuler',exact:true}).click();await page.reload();await page.waitForFunction(()=>window.atelierGroceries);
 assert.equal(await page.getByRole('textbox',{name:'Nouvel aliment',exact:true}).inputValue(),'Brouillon aliment');
 await page.getByRole('button',{name:'Ajouter plusieurs aliments',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Aliments à ajouter',exact:true}).inputValue(),'Riz\nTomates');
 await page.getByRole('button',{name:'Annuler',exact:true}).click();
 // A deliberately archived item can be recovered, without a payment or inventory transfer.
 const old=(await api('/api/groceries')).cart[0];await api('/api/shopping/'+old.id,'PUT',{archived:true});await page.evaluate(()=>atelierGroceries.pull());
 await page.evaluate(()=>showView('settings'));await page.locator('#workspaceShoppingRecovery summary').click();
 await page.getByRole('checkbox',{name:'Récupérer · Pommes',exact:true}).check();
 await page.getByRole('button',{name:'Remettre la sélection dans Courses',exact:true}).click();
 await page.waitForFunction(()=>!atelierGroceries.state.jobs.length&&atelierGroceries.state.cart.some(x=>x.name==='Pommes'));
 assert.equal((await api('/api/groceries')).cart.length,3);assert.equal((await api('/api/groceries')).foods.length,0);
 const month=new Date().toLocaleDateString('sv-SE').slice(0,7);assert.equal((await api('/api/budget?month='+month)).entries.length,0);
 // The drawer is now a small top-bar bell; only the numbered badge is pastel red.
 await api('/api/reminders','POST',{title:'Rappel test',remind_at:new Date().toLocaleDateString('sv-SE')+'T23:59',entity_type:'standalone'});
 await page.evaluate(()=>refresh({preserveLibrary:true}));
 const bell=page.locator('#workspaceReminderToggle');assert.equal(await bell.evaluate(el=>el.parentElement.classList.contains('top-actions')),true);
 assert.equal(await bell.locator('svg').count(),1);assert.equal(await bell.evaluate(el=>getComputedStyle(el).position),'relative');
 assert.equal(await bell.locator('.workspace-reminder-count').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 166, 166)');
 await bell.click();await page.locator('#workspaceReminderDrawer').waitFor({state:'visible'});await page.keyboard.press('Escape');
 // Stub only the remote updater: one star click must POST once, then request native restart.
 let starts=0,restarts=0;const revision='a'.repeat(40);
 await page.route('**/api/update/**',async r=>{const path=new URL(r.request().url()).pathname;let body={};if(path.endsWith('/check'))body={available:true,revision,installed_version:'0.18.0',installed_build:'12345678',latest_build:'87654321'};if(path.endsWith('/start')){starts++;body={ok:true}}if(path.endsWith('/status'))body={phase:starts?'success':'idle'};if(path.endsWith('/restart-window')){restarts++;body={scheduled:true}}await r.fulfill({json:body})});
 await page.evaluate(()=>{window.atelierSafety=null;atelierUpdateLastCheck=0;return atelierCheckForUpdates()});
 const star=page.locator('#atelierUpdateStar');assert.equal(await star.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
 assert.equal(await star.locator('svg').evaluate(el=>getComputedStyle(el).fill),'rgb(231, 196, 77)');
 await star.click();await page.waitForURL('**/?atelier_reloaded=*');assert.equal(starts,1);assert.ok(restarts>=1);
 assert.deepEqual(errors,[]);fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/shopping-topbar.png'});
 console.log('PASS: stale snapshot protected, bulk and drafts durable, recovery without payment, bell badge, one-click update star and native restart request');
}finally{await browser?.close();server.kill();await new Promise(r=>setTimeout(r,350));fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
