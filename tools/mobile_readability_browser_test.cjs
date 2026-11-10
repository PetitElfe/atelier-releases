/* Real SQLite PC + WebView bridge boundary; no user's profile is read. */
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),{tmpdir}=require('node:os'),{join,resolve}=require('node:path'),assert=require('node:assert/strict');
const data=fs.mkdtempSync(join(tmpdir(),'goblin-studio-mobile-')),base='http://127.0.0.1:18965',app=resolve(process.env.ATELIER_PC_APP||'pc/app/app.py');
const server=spawn('python',[app],{env:{...process.env,ATELIER_DATA_DIR:data,ATELIER_NO_BROWSER:'1',ATELIER_PORT:'18965'},stdio:'ignore'});
let connection=true,loseReply=false;
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),j=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(j));return j}
const command=(action,payload)=>api('/api/studio/actions','POST',{operation_id:crypto.randomUUID(),action,payload});
const save=(id,kind,data,revision=0)=>command('save',{id,kind,data,revision});
function contrast(a,b){const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722},x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
async function until(fn){for(let n=0;n<150;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw Error('Persistence check timed out')}
(async()=>{let browser,page;try{
 await until(async()=>{try{return(await fetch(base+'/api/runtime-version')).ok}catch{return false}});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date()),board=await api('/api/tracker-boards','POST',{title:'Habitudes téléphone',color:'sage',period_unit:'months',period_count:1}),row=await api('/api/tracker-boards/'+board.id+'/rows','POST',{title:'Séance de marche',mode:'number',target_count:5});
 await api('/api/tasks','POST',{title:'Une tâche datée',due_date:today});await api('/api/tasks','POST',{title:'Une tâche sans échéance'});
 await api('/api/events','POST',{title:'Rendez-vous du jour',event_date:today,start_time:'15:00',end_time:'15:30',category:'general'});
 await api('/api/events','POST',{title:'Rendez-vous simultané',event_date:today,start_time:'15:10',end_time:'16:00',category:'health'});
 await api('/api/events','POST',{title:'Repère de journée',event_date:today,category:'personal'});
 const recipe=await api('/api/recipes','POST',{title:'Recette à garder',recipe:'Faire mijoter doucement',ingredients_json:JSON.stringify([{name:'Carotte',quantity:2,unit:'pièces'}])});const quarterly=await api('/api/tracker-boards','POST',{title:'Ménage trimestriel téléphone',color:'sage',period_unit:'years',period_count:1,mark_unit:'quarter'});await api('/api/tracker-boards/'+quarterly.id+'/rows','POST',{title:'Entretien trimestriel',mode:'check'});
 await save('album-phone','album',{title:'Album personnel',category:'Souvenirs',color:'#92ab86'});
 await save('page-phone','album-page',{album_id:'album-phone',title:'Page de départ',order:0,items:[],strokes:[]});
 await save('exercise-phone','exercise',{title:'Marche douce',notes:'Faire à son rythme',reps:'Deux passages',seconds:35,tracker_row_id:row.id});
 await save('card-phone','card',{title:'Besoin de calme',front:'J’ai besoin de calme',back:'Merci de parler doucement',question:'Comment te sens-tu ?',image_opacity:50});
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:393,height:850},timezoneId:'Europe/Paris'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.exposeFunction('nativeRequest',async(id,method,path,body)=>{let status=0,raw='{"error":"Hors connexion"}';if(connection){try{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:method==='GET'?undefined:body});status=r.status;raw=await r.text();if(loseReply&&path==='/api/studio/actions'){loseReply=false;status=0;raw='{"error":"Réponse perdue"}'}}catch{}}await page.evaluate(({id,status,raw})=>window.__atelierSyncResponse(id,status,raw),{id,status,raw})});
 await page.addInitScript(()=>{
  if(!localStorage.getItem('studio-test-seeded')){localStorage.setItem('atelier-private-pc-url-v1','https://test-goblin.ts.net');localStorage.setItem('goblin-mobile-jdr-notes-v1',JSON.stringify([{id:'old-note',title:'Ancienne note',content:'Ancien texte privé',tags:['#ancien']} ]));localStorage.setItem('studio-test-seeded','1')}
  window._backups=[];window._nativeTimers=[];window._widget=null;
  window.AtelierAutoBackup={snapshot:(raw,reason)=>{window._backups.push({raw,reason});return true},status:()=>'{"original":true,"count":2}',latestSnapshot:()=>'',originalSnapshot:()=>''};
  window.AtelierTailnet={request:(id,base,method,path,body)=>window.nativeRequest(id,method,path,body).catch(()=>{})};
  window.AtelierWidget={sync:raw=>{window._widget=JSON.parse(raw);return true},clear:()=>{window._widget=null}};
  window.AtelierTimers={status:()=>'{"exact":true,"notifications":true,"audio":true}',sync:raw=>{window._nativeTimers=JSON.parse(raw);return '{"exact":true,"notifications":true,"audio":true}'},acknowledge:()=>true};
 });
 await page.route('https://goblin.test/**',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync('mobile/prototype/index.html','utf8')}));await page.goto('https://goblin.test/');await page.waitForFunction(()=>window.AtelierStudio?.ready&&AtelierStudio.objects.some(o=>o.id==='album-phone')&&window._widget);


 fs.mkdirSync('artifacts/readability',{recursive:true});
 async function open(target,section){await page.evaluate(({target,section})=>{state.page=target;if(section)tab=section;render();scrollTo(0,0)},{target,section});}
 for(const theme of ['dark','classic'])for(const size of [{width:320,height:720},{width:393,height:850},{width:430,height:932},{width:740,height:390}]){
  await page.setViewportSize(size);await page.evaluate(theme=>applyTheme(theme),theme);
  for(const [name,target,section]of [['agenda','calendar'],['todo','tasks'],['notes','jdr'],['courses','shopping'],['tools','tools'],['settings','settings'],['albums','albums'],['journal','journal']]){
   await open(target,section);
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);
   const metrics=await page.evaluate(()=>({width:innerWidth,body:document.documentElement.scrollWidth,title:getComputedStyle(document.getElementById('title')).fontSize,fields:[...document.querySelectorAll('#content input:not([type=checkbox]):not([type=radio]):not([type=file]),#content textarea,#content select')].filter(n=>n.getClientRects().length).map(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return {font:parseFloat(s.fontSize),background:s.backgroundColor,left:b.left,right:b.right,height:b.height}})}));
   assert.ok(metrics.body<=metrics.width+1,name+' fits '+theme+' '+size.width);
   if(name==='agenda'){const c=await page.locator('.studio-tabs .selected').evaluate(n=>({ink:getComputedStyle(n).color,paper:getComputedStyle(document.querySelector('.paper')).backgroundColor}));assert.ok(contrast(c.ink,c.paper)>=4.5,'Selected calendar view is readable in '+theme);}
   for(const field of metrics.fields){assert.ok(field.font>=16,'Readable input font');assert.ok(field.left>=0&&field.right<=metrics.width+1,'Fields fit their form');assert.ok(field.height>=44,'Touch-sized fields');assert.notEqual(field.background,'rgb(255, 255, 255)','No unstyled white search field')}
   if(size.width===393&&theme==='dark')await page.screenshot({path:'artifacts/readability/'+name+'.png'});
  }
 }
 for(const width of [320,393,740]){await page.setViewportSize({width,height:850});await open('calendar');for(const mode of ['Semaine','Mois','Année']){await page.getByRole('tab',{name:mode,exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Calendar '+mode+' fits '+width);if(width===320&&mode==='Année')await page.screenshot({path:'artifacts/readability/calendar-year-small.png'});}await page.getByRole('tab',{name:'Jour',exact:true}).click();}
 await page.setViewportSize({width:393,height:850});await page.evaluate(()=>applyTheme('dark'));
 await open('jdr');assert.ok((await page.locator('#content').innerText()).includes('Ancien texte privé'),'A legacy note body different from its title is still displayed');
 const oldNote=page.locator('.studio-note-card').filter({hasText:'Ancienne note'});
 await oldNote.locator('summary').click();await oldNote.getByRole('button',{name:'Modifier',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Modifier ma note',exact:true});await dialog.waitFor();
 const textarea=dialog.locator('textarea');await textarea.fill('Brouillon mobile à conserver');
 assert.equal(await page.evaluate(()=>window.__atelierHandleAndroidBack()),'handled');assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>state.page),'jdr');
 await oldNote.getByRole('button',{name:'Modifier',exact:true}).click();assert.equal(await page.getByRole('dialog').locator('textarea').inputValue(),'Brouillon mobile à conserver');
 await page.screenshot({path:'artifacts/readability/note-dialog.png'});await page.evaluate(()=>window.__atelierHandleAndroidBack());
 await oldNote.getByRole('button',{name:'Envoyer vers le PC…',exact:true}).click();const form=page.locator('#studioFormHost');
 assert.equal(await form.locator('[name=shape]').isVisible(),false);await form.locator('[name=destination]').selectOption('postit');assert.equal(await form.locator('[name=shape]').isVisible(),true);assert.equal(await form.locator('[name=shape] option').count(),3);await page.evaluate(()=>window.__atelierHandleAndroidBack());
 // Creating a note uses the same single input and survives the native Back path.
 await page.getByRole('textbox',{name:'Ma note avec hashtags'}).fill('Une nouvelle note #maison\nDeuxième ligne conservée');await page.getByRole('button',{name:'Enregistrer la note',exact:true}).click();
 await page.getByRole('searchbox',{name:'Chercher dans mes notes'}).fill('#maison');assert.equal(await page.locator('.studio-note-card').count(),1);assert.ok((await page.locator('.studio-note-card').innerText()).includes('Deuxième ligne conservée'));
 await open('tasks');await page.getByRole('tab',{name:'Habitudes téléphone',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.studio-mobile-tracker small').length===7);
 await open('settings');for(const name of ['Connexion au PC','Sauvegardes et données','Apparence','Accueil et navigation','Mises à jour'])assert.equal(await page.locator('.settings-group>summary').filter({hasText:name}).count(),1);
 assert.equal(await page.locator('.settings-group[open]').count(),1);assert.ok(await page.getByText('Version installée',{exact:false}).count());
 const widgetGroup=page.locator('.settings-group').filter({has:page.locator('summary',{hasText:'Albums, trackers et widget'})});await widgetGroup.locator('summary').click();await page.waitForFunction(()=>localStorage.getItem('goblin-settings-open-v2')==='Albums, trackers et widget');await page.evaluate(()=>render());assert.equal(await page.locator('.settings-group[open]>summary').innerText(),'Albums, trackers et widget');await page.getByRole('button',{name:'Configurer mon PC',exact:true}).click();assert.equal(await page.evaluate(()=>state.page),'settings');assert.ok(await page.locator('.settings-group[open]>summary').filter({hasText:'Connexion au PC'}).count());
 // The recipe can remain visible while navigating, without covering bottom tabs.
 await page.evaluate(()=>{openedRecipeId=String(pc.recipes[0].id);state.page='grimoire';render()});await page.getByRole('button',{name:'Garder la recette à côté',exact:true}).click();
 await open('jdr');const pin=page.locator('#studioMobileRecipePin');await pin.waitFor();const bounds=await pin.boundingBox(),tabs=await page.locator('#mobileTabs').boundingBox();assert.ok(bounds.y+bounds.height<tabs.y,'Pinned recipe clears bottom navigation');
 // Floating recipe and calendar + must remain independently reachable.
 await open('calendar');for(const size of [{width:320,height:720},{width:393,height:850},{width:740,height:390}]){await page.setViewportSize(size);await page.waitForFunction(()=>parseFloat(getComputedStyle(document.body).getPropertyValue('--studio-pin-height'))>0);await page.waitForTimeout(100);const p=await pin.boundingBox(),f=await page.locator('.studio-calendar-fab').boundingBox();assert.ok(f.y>=0&&f.y+f.height<=size.height,'Calendar + stays in the viewport');assert.ok(f.x+f.width<=p.x||p.x+p.width<=f.x||f.y+f.height<=p.y||p.y+p.height<=f.y,'Recipe does not hide calendar +');}await page.setViewportSize({width:393,height:850});await open('jdr');
 await pin.getByRole('button',{name:'Réduire',exact:true}).click();assert.equal(await pin.locator('.studio-recipe-pin-body').isVisible(),false);await pin.getByRole('button',{name:'Déplier',exact:true}).click();assert.equal(await pin.locator('.studio-recipe-pin-body').isVisible(),true);await pin.getByRole('button',{name:'Fermer la recette',exact:true}).click();
 // The supplied grounding sheet is a real card deck; answers stay in the private journal.
 await open('tools');await page.getByRole('button',{name:'Revenir au présent',exact:true}).click();assert.equal(await page.evaluate(()=>AtelierGrounding.cards.length),36);
 const deck=page.locator('.grounding-viewer');await deck.locator('summary').click();await deck.locator('textarea').fill('Ancrage privé conservé');await deck.getByRole('button',{name:'Garder cette réponse',exact:true}).click();
 await page.getByRole('button',{name:'Synchroniser mon carnet avec le PC',exact:true}).click();await until(async()=>(await api('/api/mobile/mental')).data.answers.some(a=>a.text==='Ancrage privé conservé'));
 const privatePage=await browser.newPage({viewport:{width:1000,height:850}});await privatePage.goto(base+'/mental-health.html#grounding');await privatePage.locator('.grounding-viewer').waitFor();await privatePage.locator('.grounding-response summary').click();assert.equal(await privatePage.locator('.grounding-response textarea').inputValue(),'Ancrage privé conservé');
 await privatePage.locator('.grounding-response textarea').fill('Réponse modifiée sur PC');await privatePage.getByRole('button',{name:'Garder cette réponse',exact:true}).click();await until(async()=>(await api('/api/mobile/mental')).data.answers.some(a=>a.text==='Réponse modifiée sur PC'));
 assert.ok(!JSON.stringify(await api('/api/studio/snapshot')).includes('Ancrage privé conservé'),'No private answer enters the shared studio snapshot');
 await privatePage.screenshot({path:'artifacts/readability/grounding-pc.png'});await privatePage.close();
 await deck.getByRole('button',{name:'Suivante',exact:true}).click();await deck.getByRole('button',{name:'Précédente',exact:true}).click();await deck.locator('summary').click();await deck.locator('textarea').fill('Brouillon ancrage');await deck.getByRole('button',{name:'Suivante',exact:true}).click();await deck.getByRole('button',{name:'Précédente',exact:true}).click();await deck.locator('summary').click();assert.equal(await deck.locator('textarea').inputValue(),'Brouillon ancrage');
 await deck.getByRole('combobox').selectOption('senses');assert.ok((await deck.locator('h3').innerText()).includes('Cinq choses'));
 for(const size of [{width:320,height:720},{width:740,height:390}]){await page.setViewportSize(size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
 await page.setViewportSize({width:393,height:850});await page.screenshot({path:'artifacts/readability/grounding-phone.png'});
 // Calendar layout is a real hourly grid, with overlaps and slot creation.
 await open('calendar');await page.getByRole('tab',{name:'Semaine',exact:true}).click();
 assert.equal(await page.locator('.studio-calendar-day-column').count(),7);assert.equal(await page.locator('.studio-calendar-slot').count(),168);const overlaps=await page.locator('.studio-calendar-event.timed').evaluateAll(nodes=>nodes.map(n=>({title:n.getAttribute('aria-label'),left:n.style.left,width:n.style.width})));assert.equal(overlaps.length,2);assert.notEqual(overlaps[0].left,overlaps[1].left,'Concurrent appointments occupy separate columns');assert.ok(overlaps.every(n=>n.width.includes('50%')));assert.equal(await page.locator('.studio-calendar-allday').count(),1);
 await page.screenshot({path:'artifacts/readability/calendar-week.png'});
 await page.getByRole('button',{name:'Aujourd’hui',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Semaine',exact:true}).getAttribute('aria-selected'),'true','Today keeps the chosen view');
 await page.getByRole('tab',{name:'Mois',exact:true}).click();assert.ok(await page.locator('.studio-calendar-chip').count());await page.screenshot({path:'artifacts/readability/calendar-month.png'});
 await page.getByRole('tab',{name:'Jour',exact:true}).click();const slot=page.locator('.studio-calendar-slot').nth(9);await slot.click();assert.equal(await page.locator('#studioFormHost [name=start_time]').inputValue(),'09:00');await page.evaluate(()=>window.__atelierHandleAndroidBack());
 // Focus breathing keeps all settings and both visual modes without putting them on the session screen.
 await page.evaluate(()=>{state.page='mental';mentalBreath=true;render();scrollTo(0,0)});
 const longPhrase=('Je peux prendre mon temps et lire cette phrase en entier. ').repeat(5).slice(0,245);
 await page.getByRole('button',{name:'Réglages de respiration',exact:true}).click();await page.getByRole('button',{name:'Ajouter une phrase',exact:true}).click();await page.getByRole('dialog').getByRole('textbox',{name:'Phrase',exact:true}).fill(longPhrase);await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await page.evaluate(()=>{window._oldRandom=Math.random;Math.random=()=>.999999});await page.getByRole('button',{name:'Commencer',exact:true}).click();await page.evaluate(()=>{Math.random=window._oldRandom});assert.equal(await page.locator('.studio-breath-phrase').innerText(),longPhrase);
 for(const size of [{width:393,height:850},{width:320,height:720},{width:740,height:390}]){
  await page.setViewportSize(size);assert.ok(await page.locator('.studio-breath-phrase').isVisible(),'Reassurance stays available in landscape');assert.notEqual(await page.locator('.studio-breath-phrase').evaluate(n=>getComputedStyle(n).overflow),'hidden');assert.equal(await page.locator('#mobileTabs').isVisible(),false);assert.equal(await page.locator('body>header').isVisible(),false);
  assert.equal(await page.locator('#content select').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'Breathing has no page scroll');
  if(size.width===740)await page.screenshot({path:'artifacts/readability/breathing-landscape-long-text.png'});
  for(const button of await page.locator('#content button').all()){const b=await button.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=size.width+1&&b.y>=0&&b.y+b.height<=size.height+1,'Every session control is reachable')}
 }
 await page.getByRole('button',{name:'Arrêter',exact:true}).click();
 for(const theme of ['classic','dark']){await page.evaluate(theme=>applyTheme(theme),theme);const c=await page.locator('.studio-breath-controls .primary').evaluate(n=>({ink:getComputedStyle(n).color,bg:getComputedStyle(n).backgroundColor}));assert.ok(contrast(c.ink,c.bg)>=3,'Breathing primary icon contrast in '+theme)}
 await page.setViewportSize({width:393,height:850});await page.getByRole('button',{name:'Commencer',exact:true}).click();await page.waitForTimeout(1200);assert.ok(await page.locator('.studio-breath-timeline progress').evaluate(n=>n.value)>1000);
 await page.screenshot({path:'artifacts/readability/breathing-focus.png'});await page.getByRole('button',{name:'Mettre en pause',exact:true}).click();const paused=await page.locator('.studio-breath-timeline progress').evaluate(n=>n.value);await page.waitForTimeout(250);assert.equal(await page.locator('.studio-breath-timeline progress').evaluate(n=>n.value),paused);await page.getByRole('button',{name:'Reprendre',exact:true}).click();assert.match(await page.locator('.studio-breath-word').innerText(),/Inspire|Expire/);await page.waitForTimeout(250);assert.ok(await page.locator('.studio-breath-timeline progress').evaluate(n=>n.value)>paused);await page.getByRole('button',{name:'Mettre en pause',exact:true}).click();
 await page.getByRole('button',{name:'Réglages de respiration',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'Forme de la respiration'}).inputValue(),'bar');await page.getByRole('combobox',{name:'Forme de la respiration'}).selectOption('circle');assert.equal(await page.locator('.mental-breath-stage').count(),1);assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'Retour aux outils',exact:true}).click();assert.equal(await page.locator('#mobileTabs').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: focused breathing and pause/resume in portrait/landscape, theme contrast, hourly calendar/overlaps/slot creation, all calendar views at 320/393/740px; 8 screens × 4 viewports × 2 themes; readable fields, fit, real tab taps, structured settings, legacy notes, search, draft/native Back, Post-it destination floating recipe navigation and 36 supplied grounding cards with private phone/PC synchronization');
}finally{if(browser)await browser.close();server.kill();fs.rmSync(data,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
