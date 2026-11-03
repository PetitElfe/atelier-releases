const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const data=mkdtempSync(join(tmpdir(),'atelier-recipes-')),base='http://127.0.0.1:18948';
const server=spawn('python',[resolve('app/app.py')],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18948'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();assert.ok(r.ok,path+' '+JSON.stringify(j));return j}
async function until(fn){for(let n=0;n<80;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw Error('Persistence check timed out')}
(async()=>{let browser;try{
 await until(async()=>{try{return(await fetch(base+'/api/runtime-version')).ok}catch{return false}});
 const book=await api('/api/recipe-books','POST',{name:'Desserts'});
 const dish=await api('/api/recipes','POST',{title:'Crème au chocolat',book_id:book.id,base_servings:2,notes:'Toute douce',recipe:'Faire fondre le chocolat.\nLaisser refroidir.',ingredients_json:JSON.stringify([{name:'Chocolat noir',quantity:'100',unit:'g'}]),source_url:'javascript:alert(1)'});
 for(let n=0;n<17;n++)await api('/api/recipes','POST',{title:['Sablés au citron','Soupe de potimarron','Tarte aux pommes','Cookies aux noisettes','Crêpes maison','Gratin de légumes'][n%6]+' '+(n+1),book_id:book.id,base_servings:4,recipe:'Préparer puis cuire.'});
 const archived=await api('/api/recipes','POST',{title:'Ancienne recette',book_id:book.id,recipe:'Texte original conservé.'});await api('/api/recipes/'+archived.id,'PUT',{archived:true});
 assert.ok(!(await api('/api/recipes')).some(x=>x.id===archived.id));assert.equal((await api('/api/recipes?archived=1'))[0].id,archived.id);
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>state.recipes.length===18);
 for(const view of ['home','calendar','tasks','library','trackers','admin','captures','budget','kitchen','settings','cuisine']){
  await page.evaluate(v=>showView(v),view);assert.equal(await page.locator('#sideNavToggle,.side-nav-arrow').count(),0,'No legacy arrow in '+view);assert.ok(await page.locator('#sideNavHeaderToggle').isVisible());
 }
 await page.evaluate(()=>setSideNavCollapsed(true));await page.locator('#sideNavHeaderToggle').click();assert.equal(await page.locator('#sideNavHeaderToggle').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#sideNav').evaluate(el=>el.inert),false);await page.locator('#sideNavHeaderToggle').click();assert.equal(await page.locator('#sideNav').evaluate(el=>el.inert),true);
 const volume=()=>page.locator('[data-recipe-id="'+dish.id+'"]');
 await volume().waitFor();assert.equal(await volume().locator('.recipe-spine-name').innerText(),'Crème au chocolat');assert.equal(await volume().locator('.recipe-spine-name').evaluate(el=>getComputedStyle(el).writingMode),'vertical-rl');
 assert.equal(await page.locator('.recipe-volume').count(),18);const geometry=await page.locator('.recipe-volume').evaluateAll(a=>a.map(x=>x.getBoundingClientRect().top));assert.ok(new Set(geometry.map(Math.round)).size>1,'Books wrap onto multiple shelves');
 mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/recipe-shelves.png',fullPage:true});
 await page.locator('#recipeSearch').fill('chocolat noir');assert.equal(await page.locator('.recipe-volume').count(),1,'Ingredient search');await page.locator('#recipeSearch').fill('creme');assert.equal(await page.locator('.recipe-volume').count(),1,'Accent-insensitive search');
 await volume().locator('.recipe-library-title').click();await page.locator('#recipePageTitle').waitFor();assert.equal(await page.locator('#recipeSourceLink').getAttribute('href'),null,'Legacy executable source URL removed');
 await page.locator('#recipeServingsPlus').click();await page.locator('#recipeServingsPlus').click();assert.equal(await page.locator('#recipeServingsValue').innerText(),'4');
 await page.getByRole('button',{name:'Ajouter Chocolat noir aux courses',exact:true}).click();await until(async()=>(await api('/api/shopping')).some(x=>x.name==='Chocolat noir'&&x.quantity==='200 g'));assert.ok(await page.getByRole('button',{name:'Ajouter Chocolat noir aux courses',exact:true}).isDisabled());assert.equal((await api('/api/shopping')).filter(x=>x.name==='Chocolat noir').length,1);
 await page.locator('#backFromRecipe').click();assert.equal(await page.locator('#cuisineView').isVisible(),true);await volume().locator('summary').click();await volume().locator('.edit').click();await page.locator('#mealForm [name=title]').fill('Crème maison');await page.locator('#recipeSourceUrl').fill('https://example.com/creme');await page.locator('#mealForm button[type=submit],#mealForm .form-actions .primary').click();await until(async()=>(await api('/api/recipes')).some(x=>x.id===dish.id&&x.title==='Crème maison'));
 await page.locator('#recipeClearSearch').click();await page.locator('#recipeShelfSort').selectOption('shelf');
 await volume().locator('summary').click();await volume().locator('.archive').click();await page.locator('#atelierDialogConfirm').click();await until(async()=>(await api('/api/recipes?archived=1')).some(x=>x.id===dish.id));await page.waitForFunction(id=>!document.querySelector('[data-recipe-id="'+id+'"]'),dish.id);
 await page.locator('#recipeShowArchived').click();await volume().waitFor();assert.equal(await page.locator('.recipe-volume').count(),2);await volume().locator('.recipe-library-title').click();assert.ok(await page.locator('#editRecipePage').isDisabled());await page.locator('#backFromRecipe').click();await volume().locator('summary').click();await volume().locator('.restore').click();await until(async()=>(await api('/api/recipes')).some(x=>x.id===dish.id));await page.waitForFunction(id=>!document.querySelector('[data-recipe-id="'+id+'"]'),dish.id);await page.locator('#recipeShowArchived').click();await volume().waitFor();
 await volume().locator('summary').click();await volume().locator('.idea').click();await until(async()=>(await api('/api/meal-ideas')).some(x=>x.id===dish.id));
 await page.reload();await page.waitForFunction(()=>state.recipes.length===18);await page.evaluate(()=>showView('cuisine'));assert.equal(await page.locator('#recipeShelfSort').inputValue(),'shelf');await volume().locator('.recipe-library-title').click();assert.equal(await page.locator('#recipePageTitle').innerText(),'Crème maison');assert.equal(await page.locator('#recipeSourceLink').getAttribute('href'),'https://example.com/creme');assert.equal(await page.locator('#recipeInstructions .recipe-step').count(),2);assert.ok(await page.locator('#editRecipePage').isEnabled());
 await page.locator('#backFromRecipe').click();await page.setViewportSize({width:1280,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'artifacts/recipe-shelves-1280.png'});assert.deepEqual(errors,[]);
 console.log('PASS: drawer everywhere, book spines, ingredient search, portions/shopping, edit preservation, reversible archives, meal ideas, reload and 1280px');
 }catch(e){if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){mkdirSync('artifacts',{recursive:true});await p.screenshot({path:'artifacts/recipe-failure.png',fullPage:true});console.log('UI',await p.locator('body').innerText().then(x=>x.slice(-2500)))}}throw e}finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.once('exit',r));rmSync(data,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
