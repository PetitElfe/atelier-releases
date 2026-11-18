const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(join(tmpdir(),'atelier-recovery-notice-')),base='http://127.0.0.1:19002';
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:dir,ATELIER_PORT:'19002',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path){const r=await fetch(base+path);assert.ok(r.ok);return r.json()}
(async()=>{let browser;try{
 for(let i=0;i<150;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const info=await api('/api/groceries'),folder=join(dir,'backups','complete');fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(join(folder,'snapshot-browser-fixture.json'),JSON.stringify({format:'atelier-complete-backup-v1',installation_id:info.installation_id,edition_port:19002,tables:{shopping_items:{columns:['name','price','purchase_count'],rows:[['Courgettes',2.5,2],['Lait',null,1]]}}}));
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let available=false,checks=0,starts=0;
 await page.route('**/api/update/**',async route=>{const p=new URL(route.request().url()).pathname;if(p.endsWith('/check')){checks++;await route.fulfill({json:{available,revision:'a'.repeat(40),installed_version:'0.18.0',installed_build:'12345678'}})}else{if(p.endsWith('/start'))starts++;await route.fulfill({json:{phase:'idle'}})}});
 await page.clock.install();await page.goto(base);await page.waitForFunction(()=>window.AtelierStudio?.ready&&window.atelierGroceries&&homeCanvasReady);
 await page.clock.fastForward(1500);await page.waitForFunction(()=>atelierUpdateLastCheck>0&&!atelierUpdateCheckActive);
 assert.ok(checks>=1,'Launch check needs no click');available=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>document.getElementById('atelierUpdateStar').classList.contains('has-update'));
 const before=checks;await page.clock.fastForward(61000);await page.waitForFunction(()=>!atelierUpdateCheckActive);
 assert.ok(checks>before,'Periodic visible check happens within one minute');assert.equal(starts,0,'Detection never installs automatically');
 await page.evaluate(()=>{localStorage.setItem(homeModuleVisibilityKey('shopping'),'1');syncHomeModuleVisibility();const i=globalLayoutItems.find(x=>x.id==='shopping');saveGlobalLayout(i,{x:30,y:300,width:500,scale:1});applyGlobalLayout(i,readGlobalLayout(i))});
 await page.locator('.workspace-shopping-title').click({button:'right'});await page.getByRole('menuitem',{name:'Retrouver une liste',exact:true}).click();
 await page.getByRole('button',{name:'Rechercher dans les sauvegardes du PC',exact:true}).click();
 const group=page.locator('.grocery-recovery-list details').filter({hasText:'snapshot-browser-fixture.json'});await group.waitFor();if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
 await page.getByRole('checkbox',{name:'Récupérer · Courgettes',exact:true}).check();
 await page.getByRole('button',{name:'Remettre la sélection dans Courses',exact:true}).click();
 await page.waitForFunction(()=>!atelierGroceries.state.jobs.length&&atelierGroceries.state.cart.length===1);
 assert.equal((await api('/api/groceries')).cart[0].name,'Courgettes');
 assert.equal((await api('/api/groceries')).cart[0].purchase_count,2);
 const month=new Date().toLocaleDateString('sv-SE').slice(0,7);assert.equal((await api('/api/budget?month='+month)).entries.length,0);
 await page.evaluate(()=>{showView('home');atelierGroceries.openInventory()});
 await page.locator('.workspace-shopping-title').focus();await page.keyboard.press('Shift+F10');await page.getByRole('menuitem',{name:'Liste de courses',exact:true}).click();
 await page.getByRole('textbox',{name:'Aliment · Courgettes',exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: automatic launch/focus/minute checks without clicks or auto-install, backup search and selective recovery without budget change, inventory return');
}finally{await browser?.close();server.kill();await new Promise(r=>setTimeout(r,350));fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
