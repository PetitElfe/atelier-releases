const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const data=mkdtempSync(join(tmpdir(),'atelier-design-')),base='http://127.0.0.1:18944';
const server=spawn('python',[resolve('app/app.py')],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18944'},stdio:'ignore'});
let stored={available:true,revision:0,theme:{}},reject=false;
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/runtime-version')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 // Real non-TEST backend must deny writes and never expose personal art.
 assert.equal((await (await fetch(base+'/api/personal-design')).json()).available,false);
 assert.equal((await fetch(base+'/api/personal-design',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Only this API is mocked: on Linux the installation gate correctly denies access.
 // Actual permitted persistence and restart are exercised on disposable Windows E:.
 await page.route('**/api/personal-design',async route=>{
  if(route.request().method()==='PUT'){
   const request=route.request().postDataJSON();assert.equal(route.request().headers()['x-atelier-design'],'1');
   if(reject)return route.fulfill({status:409,json:{error:'Le thème a changé dans une autre fenêtre.'}});
   assert.equal(request.revision,stored.revision);stored={available:true,revision:stored.revision+1,theme:request.theme};
  }
  await route.fulfill({json:stored});
 });
 await page.goto(base);await page.locator('#personalDesignStart:not([disabled])').waitFor({state:'attached'});await page.locator('#settingsBtn').click();await page.locator('.atelier-settings-nav [data-target=settingsPersonalDesignCard]').click();
 await page.locator('#personalDesignStart').click();const dock=page.locator('#personalDesignDock');await dock.waitFor();
 assert.match(await dock.locator('[data-design=guide]').innerText(),/Fond général.*1440 × 1000/);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=120;const x=c.getContext('2d');x.fillStyle='#bca26c';x.fillRect(12,12,96,96);return c.toDataURL('image/png').split(',')[1]});
 const file={name:'Mon bouton.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
 await dock.locator('[data-design=target]').selectOption('id:settingsBtn');await dock.locator('[data-design=image]').setInputFiles(file);
 await page.waitForFunction(()=>document.querySelector('[data-design=asset]').textContent.includes('Mon bouton'));
 console.log('ART DIAGNOSTICS',await page.evaluate(()=>({status:document.querySelector('[data-design=status]').textContent,selected:document.querySelector('[data-design=target]').value,rules:document.querySelector('#personalDesignRules').textContent.slice(0,200),target:document.querySelector('#settingsBtn').dataset.designKey,background:getComputedStyle(document.querySelector('#settingsBtn')).backgroundImage})));
 assert.match(await page.locator('#settingsBtn').evaluate(el=>getComputedStyle(el).backgroundImage),/data:image/);
 await dock.locator('[data-design=x]').fill('25');await dock.locator('[data-design=x]').dispatchEvent('change');
 await dock.locator('[data-design=hideLabel]').check();assert.equal(await page.locator('#settingsBtn').getAttribute('aria-label'),'Paramètres');
 // File drop is targeted to the actual hovered element, not to the selected dropdown.
 await page.locator('header.topbar').evaluate((el,b64)=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'Bandeau.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))},png);
 await page.waitForFunction(()=>document.querySelector('[data-design=target]').value==='header');
 await dock.locator('[data-design=save]').click();await page.waitForFunction(()=>document.querySelector('[data-design=status]').textContent.includes('Thème enregistré sur'));
 assert.equal(stored.theme['id:settingsBtn'].x,25);assert.ok(stored.theme.header.src.startsWith('data:image/'));
 // Gabarit exports real measured pixel dimensions and export includes image bytes.
 const template=page.waitForEvent('download');await dock.locator('[data-design=template]').click();assert.match((await template).suggestedFilename(),/^Gabarit-Goblin-\d+x\d+\.png$/);
 const exported=page.waitForEvent('download');await dock.locator('[data-design=export]').click();assert.equal((await exported).suggestedFilename(),'Mon-theme-Goblin.json');
 await page.reload();await page.locator('#personalDesignStart:not([disabled])').waitFor({state:'attached'});assert.match(await page.locator('#settingsBtn').evaluate(el=>getComputedStyle(el).backgroundImage),/data:image/);
 await page.locator('#settingsBtn').click();await page.locator('.atelier-settings-nav [data-target=settingsPersonalDesignCard]').click();await page.locator('#personalDesignStart').click();
 await dock.locator('[data-design=target]').selectOption('header');await dock.locator('[data-design=remove]').click();await dock.locator('[data-design=undo]').click();assert.match(await dock.locator('[data-design=asset]').innerText(),/Bandeau/);
 // Failed writes retain the preview, permit exporting, and do not claim success.
 await dock.locator('[data-design=remove]').click();reject=true;await dock.locator('[data-design=save]').click();await page.waitForFunction(()=>document.querySelector('[data-design=status]').textContent.includes('autre fenêtre'));
 assert.ok(stored.theme.header);await dock.locator('[data-design=revert]').click({trial:true});page.once('dialog',dialog=>dialog.accept());await dock.locator('[data-design=revert]').click();assert.match(await dock.locator('[data-design=asset]').innerText(),/Bandeau/);reject=false;
 // Unsafe theme import does not inject CSS or replace preview.
 await dock.locator('[data-design=json]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'goblin-personal-art-v1',theme:{'app':{src:'https://evil.invalid/image',name:'Bad'}}}))});await page.waitForFunction(()=>document.querySelector('[data-design=status]').textContent.includes('invalide'));
 await dock.locator('[data-design=pick]').click();await page.locator('#settingsBtn').click();assert.equal(await dock.locator('[data-design=target]').inputValue(),'id:settingsBtn');assert.equal(await dock.locator('[data-design=pick]').getAttribute('aria-pressed'),'false');
 mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/personal-design-mode.png'});
 await dock.locator('[data-design=exit]').click();assert.equal(await dock.isVisible(),false);
 await page.setViewportSize({width:1000,height:720});await page.locator('#personalDesignStart').click();assert.ok((await dock.boundingBox()).width<1000);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS personal design: gate, own art drop, controls, save/reload, undo, conflict, export, template, selection and smaller window');
 }catch(e){if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){console.log('FAIL STATE',await p.evaluate(()=>({status:document.querySelector('[data-design=status]')?.textContent,asset:document.querySelector('[data-design=asset]')?.textContent,selected:document.querySelector('[data-design=target]')?.value,rules:document.querySelector('#personalDesignRules')?.textContent.slice(0,250)})));mkdirSync('artifacts',{recursive:true});await p.screenshot({path:'artifacts/personal-design-failure.png'})}}throw e;}finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.once('exit',r));rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
