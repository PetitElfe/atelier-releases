const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'atelier-display-')),port=process.env.DISPLAY_PORT||'18973',base='http://127.0.0.1:'+port;
const proc=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:port},stdio:'ignore'});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/runtime-version')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true});
 for(const dpr of [1,1.5,2]){
 const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:dpr}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.AtelierDisplay&&window.AtelierStudio?.ready);
 for(const [width,height,factor] of [[1280,720,1],[1366,768,1],[1920,1080,1.1],[2560,1440,1.25],[3840,2160,1.25]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(180);
 assert.equal(await page.evaluate(()=>Number(getComputedStyle(document.documentElement).getPropertyValue('--atelier-text-factor'))),factor);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).zoom),'1');
 }
 await page.evaluate(()=>showView('settings'));await page.getByRole('button',{name:'Affichage et couleurs',exact:true}).click();
 await page.locator('#atelierUiScale').selectOption('160');await page.locator('#atelierUiFont').selectOption('system');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).fontSize),'25.6px');
 assert.match(await page.evaluate(()=>getComputedStyle(document.body).fontFamily),/system-ui/);
 for(const theme of ['sage','mauve','bleu','miel','goblin']){
 await page.locator('#atelierUiTheme').selectOption(theme);
 const colors=await page.evaluate(()=>{const menu=document.createElement('div');menu.className='studio-menu';menu.innerHTML='<button>Modifier</button>';document.body.append(menu);const s=getComputedStyle(menu),expected=getComputedStyle(document.querySelector('.settings-card'));const out=[s.backgroundColor,expected.backgroundColor,getComputedStyle(menu.firstChild).fontSize];menu.remove();return out});
 assert.equal(colors[0],colors[1]);assert.ok(parseFloat(colors[2])>=14);
 }
 await page.locator('#atelierUiTheme').selectOption('mauve');await page.reload();await page.waitForSelector('#atelierUiScale',{state:'attached'});assert.equal(await page.locator('#atelierUiScale').inputValue(),'160');
 const journal=await context.newPage();await journal.goto(base+'/mental-health.html');await journal.waitForFunction(()=>window.AtelierDisplay);
 assert.equal(await journal.evaluate(()=>document.documentElement.dataset.atelierTheme),'mauve');
 await page.evaluate(()=>{localStorage.setItem('atelier-ui-theme','bleu');AtelierDisplay.apply()});await journal.waitForFunction(()=>document.documentElement.dataset.atelierTheme==='bleu');
 assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: automatic/manual typography, 5 resolutions × 3 Windows DPI scales, font persistence, theme menus, embedded journal propagation');
}finally{if(browser)await browser.close();proc.kill();await new Promise(r=>proc.once('exit',r));fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
