/* Windows workspace rules: one heading, contextual actions, settings-only archives.
   Never reset the user's home positions, profile data, themes or zoom. */
function librarySetPointSize(value){
 const points=Number(value),editor=document.getElementById('libraryPageBody');
 if(!editor||!Number.isFinite(points)||points<6||points>96)return;
 editor.focus();restoreLibraryTextSelection();
 // Use the browser's editing transaction so replacing selected text stays undoable.
 document.execCommand('styleWithCSS',false,true);
 // Force a distinct temporary size only in the selection; leave earlier large text alone.
 document.execCommand('fontSize',false,'1');
 const previous=new Set(editor.querySelectorAll('[style]'));
 const oldSizes=new Map([...previous].map(n=>[n,n.style.fontSize]));const oldFonts=new Set(editor.querySelectorAll('font[size="7"]'));
 document.execCommand('fontSize',false,'7');
 for(const n of editor.querySelectorAll('[style]'))if(n.style.fontSize==='xxx-large'&&(!previous.has(n)||oldSizes.get(n)!=='xxx-large'))n.style.fontSize=points+'pt';
 for(const n of editor.querySelectorAll('font[size="7"]'))if(!oldFonts.has(n)){n.removeAttribute('size');n.style.fontSize=points+'pt'}
 rememberLibraryTextSelection();editor.dispatchEvent(new Event('input',{bubbles:true}));
}
function librarySetLineHeight(value){
 const editor=document.getElementById('libraryPageBody');if(!editor||!['1','1.15','1.5','2'].includes(value))return;
 editor.focus();restoreLibraryTextSelection();const selection=getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
 const blocks=[...editor.querySelectorAll('p,div,li,h1,h2,h3,blockquote')].filter(n=>range?.intersectsNode(n)&&!n.closest('figure'));
 if(blocks.length)blocks.forEach(n=>n.style.lineHeight=value);
 else{document.execCommand('formatBlock',false,'p');const p=getSelection()?.anchorNode?.parentElement?.closest('p');if(p&&editor.contains(p))p.style.lineHeight=value}
 editor.dispatchEvent(new Event('input',{bubbles:true}));
}
(()=>{'use strict';const S=window.AtelierStudio,N=S.node,B=(text,fn,cls)=>S.button(text,(...args)=>Promise.resolve().then(()=>fn(...args)).catch(S.error),cls),$=id=>document.getElementById(id);
 const settings=$('settingsView'),options=new Map();S.sectionOptions=(name,choices)=>options.set(name,choices);
 function settingsCard(id,title){let card=$(id);if(!card){card=N('section','settings-card');card.id=id;card.append(N('h3','',title));(settings.querySelector('.settings-grid')||settings).append(card)}return card}
 const archives=settingsCard('workspaceArchives','Archives');
 const courses=N('details');courses.id='workspaceShoppingRecovery';courses.append(N('summary','','Courses'));const coursesBody=N('div');courses.append(coursesBody);archives.append(courses);courses.ontoggle=()=>{if(courses.open)window.atelierGroceries?.recovery(coursesBody)};
 const trackerHeading=$('settingsTrackerArchivesCard')?.querySelector('h3');if(trackerHeading)trackerHeading.textContent='Historique des trackers';
 $('recipeShowArchived').hidden=true;
 const recipes=N('details');recipes.append(N('summary','','Recettes'));const recipeList=N('div');recipes.append(recipeList);archives.append(recipes);
 async function recipeArchives(){recipeList.replaceChildren();try{const rows=await api('/api/recipes?archived=1');for(const item of rows){const line=N('div','workspace-archive-row');line.append(N('span','',item.title),B('Restaurer',async()=>{await api('/api/recipes/'+item.id,{method:'PUT',body:JSON.stringify({archived:false})});await refresh();await recipeArchives()}));recipeList.append(line)}if(!rows.length)recipeList.append(N('p','muted','Aucune recette archivée.'))}catch(e){recipeList.textContent=e.message}}recipes.ontoggle=()=>{if(recipes.open)recipeArchives()};
 const objects=N('details');objects.append(N('summary','','Bocaux, achats et autres contenus'));const objectList=N('div');objects.append(objectList);archives.append(objects);
 function objectArchives(){objectList.replaceChildren();for(const object of S.objects.filter(o=>o.archived)){const row=N('div','workspace-archive-row');row.append(N('span','',object.data.title||'Élément archivé'),B('Restaurer',async()=>{try{await S.save({...object,archived:false});objectArchives();window.dispatchEvent(new Event('studio-updated'))}catch(e){S.error(e)}}));objectList.append(row)}if(!objectList.children.length)objectList.append(N('p','muted','Aucun contenu archivé.'))}objects.ontoggle=()=>{if(objects.open)objectArchives()};
 const budgetArchives=N('details');budgetArchives.append(N('summary','','Budget'));const archiveBody=N('div');budgetArchives.append(archiveBody);budgetArchives.ontoggle=async()=>{if(!budgetArchives.open)return;archiveBody.replaceChildren();try{await S.budgetArchives(archiveBody)}catch(e){archiveBody.textContent=e.message}};archives.append(budgetArchives);
 const notesArchive=N('details');notesArchive.append(N('summary','','Notes partagées'));const notesArchiveHost=N('div');notesArchive.append(notesArchiveHost);archives.append(notesArchive);const notesPanel=$('sharedNotesPanel');$('sharedNotesArchive').hidden=true;
 notesArchive.ontoggle=async()=>{if(notesArchive.open){notesArchiveHost.append(notesPanel);await AtelierSharedNotes.archives()}else{$('capturesView').append(notesPanel);AtelierSharedNotes.active()}};
 // Archives keep their original handlers and restoration paths; relocate the containers.
 const adminArchives=$('adminArchivesToggle');if(adminArchives){const line=N('div','workspace-archive-link');line.append(adminArchives);archives.append(line)}
 function moveArchives(){
  const admin=document.querySelector('.life-admin-archives-section');if(admin&&admin.parentElement!==archives){admin.hidden=false;archives.append(admin)}
 }
 const oldAdmin=typeof renderLifeAdmin==='function'?renderLifeAdmin:null;
 if(oldAdmin)renderLifeAdmin=function(...args){const result=oldAdmin(...args);moveArchives();return result};
 moveArchives();
 // Global title becomes the stable entry for section-specific settings, keyboard included.
 const title=$('pageTitle');title.tabIndex=0;title.setAttribute('aria-haspopup','menu');
 title.addEventListener('contextmenu',e=>{e.preventDefault();e.stopImmediatePropagation();const choices=options.get(state.view);S.menu(e,typeof choices==='function'?choices():choices||[['Modifier la disposition',()=>{if(!globalLayoutEditing){globalLayoutEditing=true;syncGlobalLayoutEditing()}}],['Paramètres',()=>showView('settings')]])},true);
 title.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=title.getBoundingClientRect();title.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left,clientY:r.bottom}))}});
 S.sectionOptions('calendar',()=>[['Vue mensuelle',()=>document.querySelector('[data-calendar-mode="month"]').click()],['Vue hebdomadaire',()=>document.querySelector('[data-calendar-mode="week"]').click()],['Aller à une date',()=>openCalendarDateJump(ymd(state.cursor))],['Décoration du jour sélectionné',()=>openCalendarDecoration(ymd(state.cursor))]]);
 S.sectionOptions('tasks',()=>[['Afficher les tâches à faire',()=>{$('taskFilter').value='active';renderTasks()}],['Afficher toutes les tâches',()=>{$('taskFilter').value='all';renderTasks()}]]);
 S.sectionOptions('budget',()=>S.budgetOptions?.()||[]);
 S.sectionOptions('cuisine',()=>[['Tri par titre',()=>{const select=$('recipeShelfSort');select.value='title';select.dispatchEvent(new Event('change'))}],['Dernières recettes modifiées',()=>{const select=$('recipeShelfSort');select.value='recent';select.dispatchEvent(new Event('change'))}],['Importer une recette',()=>$('importRecipe').click()]]);
 S.sectionOptions('kitchen',()=>[['Profil et préférences alimentaires',async()=>{await AtelierFood.load();AtelierFood.profile()}],['Choisir les aliments de l’assiette',()=>AtelierFood.choosePlate()],['Suivi des apports',()=>AtelierFood.showIntakes()]]);
 S.sectionOptions('trackers',()=>[['Nouveau tableau',()=>$('trackerBoardCreateToggle').click()],['Modifier la disposition',()=>{globalLayoutEditing=true;syncGlobalLayoutEditing()}]]);
 S.sectionOptions('admin',()=>[['Nouveau classeur',()=>document.querySelector('[aria-label="Nouveau classeur"]')?.click()],['Dossier des documents',()=>AtelierAdmin.documentSettings()]]);
 S.sectionOptions('library',()=>[['Écrire dans le carnet',()=>{if(librarySelectedNotebookId){libraryEditorMode='write';renderLibraryNotebookContent()}else showUiMessage('Bibliothèque','Ouvre un carnet pour écrire.')}],['Modifier la disposition',()=>{globalLayoutEditing=true;syncGlobalLayoutEditing()}]]);
 S.sectionOptions('reminders',()=>[['Son et volume',()=>{showView('settings');const target=$('atelierReminderVolume');for(let p=target;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;target?.scrollIntoView({block:'center'})}],['Ajouter un rappel',()=>$('addStandaloneReminder').click()]]);
 // One existing list in a narrow right drawer, without cloning actions or reminder IDs.
 const panel=$('remindersView'),drawer=N('aside','workspace-reminder-drawer');drawer.id='workspaceReminderDrawer';drawer.hidden=true;drawer.setAttribute('aria-label','Rappels');
 const close=B('×',()=>setDrawer(false));close.setAttribute('aria-label','Fermer les rappels');const head=panel.querySelector('h2');head.textContent='Rappels';panel.querySelector('.panel-head').prepend(close);panel.querySelector(':scope>p.muted')?.remove();drawer.append(panel);document.body.append(drawer);
 const trigger=B('',()=>setDrawer(drawer.hidden),'workspace-reminder-trigger');trigger.id='workspaceReminderToggle';trigger.setAttribute('aria-controls',drawer.id);trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<svg class="top-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="workspace-reminder-count">0</span>';$('settingsBtn').before(trigger);let returnFocus=null;
 function setDrawer(open){if(open)returnFocus=document.activeElement;drawer.hidden=!open;trigger.setAttribute('aria-expanded',String(open));panel.classList.toggle('active-view',open);if(open)close.focus();else if(drawer.contains(document.activeElement))returnFocus?.focus()}
 const previousReminders=renderReminders;renderReminders=function(...args){const r=previousReminders(...args);const count=state.reminders.filter(x=>x.status!=='done').length;trigger.querySelector('.workspace-reminder-count').textContent=count;trigger.querySelector('.workspace-reminder-count').hidden=count===0;trigger.setAttribute('aria-label',(drawer.hidden?'Ouvrir':'Fermer')+' les rappels · '+count);return r};renderReminders();
 function tidyTitle(view){const normalize=s=>s.trim().toLocaleLowerCase('fr');const value=normalize(title.textContent);for(const h of document.querySelectorAll('#'+view+'View > .panel-head h2,#'+view+'View > .view-head h2'))if(normalize(h.textContent)===value)h.hidden=true}tidyTitle(state.view);
 const originalShow=showView;showView=function(view,...args){if(view==='reminders'){setDrawer(true);return}setDrawer(false);if(view!=='settings'&&notesArchive.open){notesArchive.open=false;$('capturesView').append(notesPanel);AtelierSharedNotes.active()}const r=originalShow(view,...args);if(view==='kitchen')AtelierFood.mount?.();if(view==='home')window.atelierGroceries?.pull();requestAnimationFrame(()=>tidyTitle(view));return r};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.hidden&&$('modalBackdrop').classList.contains('hidden')){e.preventDefault();setDrawer(false)}});
 S.sectionOptions('home',()=>[['Choisir les modules',()=>$('openHomeModuleLibrary').click()],['Modifier la disposition',()=>{globalLayoutEditing=true;syncGlobalLayoutEditing()}]]);
 // Shopping is the SAME offline client, now an optional home module. Initial home is unchanged.
 const shopping=$('shoppingPanel');shopping.dataset.homeModule='shopping';shopping.setAttribute('aria-label','Liste de courses');
 const shoppingHeading=N('h3','','Courses');shoppingHeading.className='workspace-shopping-title';shopping.prepend(shoppingHeading);
 homeModuleOrder.push(['shopping','Courses']);const placement=globalLayoutItems.find(x=>x.el===shopping);if(placement){placement.view='home';placement.key='atelierHomeCanvasV2_shopping';if(!localStorage.getItem(placement.key)){const bottom=Math.max(720,...globalLayoutItems.filter(i=>i!==placement&&isHomeCanvasItem(i)&&!i.el.classList.contains('home-module-off')).map(i=>{const d=readGlobalLayout(i);return d.y+(d.height||i.el.getBoundingClientRect().height/(window.AtelierDisplay?.factor||1)||200)}));saveGlobalLayout(placement,{x:14,y:Math.ceil(bottom+24),width:440,height:null,scale:1})}}
 const oldSpecs=getGlobalLayoutSpecs;getGlobalLayoutSpecs=function(){return oldSpecs().map(item=>item.el===shopping?{...item,view:'home',key:'atelierHomeCanvasV2_shopping'}:item)};
 const oldSuggested=homeSuggestedLayout;homeSuggestedLayout=function(item){if(item.el===shopping)return {x:14,y:1300,width:440,height:null,scale:1};return oldSuggested(item)};
 (document.getElementById('homeCanvas')||$('homeView')).append(shopping);initGlobalLayoutEditor();if(placement)applyGlobalLayout(placement,readGlobalLayout(placement));syncHomeModuleVisibility();
 const dockShopping=()=>{const canvas=$('homeCanvas');if(!canvas)return false;if(shopping.parentElement!==canvas)canvas.append(shopping);if(placement)applyGlobalLayout(placement,readGlobalLayout(placement));requestHomeCanvasMeasure();return true};if(!dockShopping()){const docking=new MutationObserver(()=>{if(dockShopping())docking.disconnect()});docking.observe($('homeView'),{childList:true})}
 // No redundant title on the food page. Layout remains in flow and scales naturally.
 $('kitchenView').querySelector(':scope>.panel-head')?.remove();$('kitchenView').querySelector('.kitchen-grid')?.classList.add('workspace-food-grid');
 const originalRenderKitchen=renderKitchen;renderKitchen=function(...args){const r=originalRenderKitchen(...args);if(state.view==='kitchen')AtelierFood.mount?.();return r};AtelierFood.mount?.();
 // Existing quick tools duplicate the main text toolbar: keep table and sketch only.
 const updateEditors=()=>{for(const toolbar of document.querySelectorAll('[data-studio-library-tools]'))for(const b of toolbar.querySelectorAll('button'))if(['Liste à puces','Liste numérotée'].includes(b.textContent))b.hidden=true};
 new MutationObserver(updateEditors).observe($('libraryNotebookPanel'),{childList:true,subtree:true});updateEditors();
 // Deadline colour is computed from actual dates, not a permanent pink marker.
 function deadlineTone(){
  const tasks=window.AtelierAdmin?.data?.actions||state.tasks||[];const now=parseYMD(ymd(new Date()));
  for(const row of document.querySelectorAll('[data-action-task-id],.admin-case-summary,.task-row,.deadline-line,.journal-task,.home-todo-row')){
   let item;const id=row.dataset.actionTaskId||row.dataset.taskId;if(id)item=tasks.find(x=>String(x.id)===id)||state.tasks.find(x=>String(x.id)===id);
   if(!item&&row.matches('.admin-case-summary')){const card=row.closest('[data-admin-id]');const dossier=lifeAdmin.find(x=>String(x.id)===card?.dataset.adminId);item=tasks.find(x=>x.id===AtelierAdmin.data.plans[String(dossier?.id)])||dossier}
   if(!item&&row.dataset.deadlineDate)item={due_date:row.dataset.deadlineDate};
   if(!item?.due_date){row.style.removeProperty('--deadline-tone');row.style.removeProperty('--deadline-ink');delete row.dataset.deadlineLevel;row.classList.remove('workspace-deadline');continue}
   const days=Math.round((parseYMD(item.due_date)-now)/86400000);const active=!item.completed&&item.state!=='done'&&item.status!=='done'&&(!row.matches('.journal-task,.home-todo-row')||!!item.important);if(active)row.style.setProperty('--deadline-ink',days<=0?'#622832':days<=1?'#713039':days<=3?'#7c3c40':'#88574f');else{row.style.removeProperty('--deadline-ink');delete row.dataset.deadlineLevel}row.classList.toggle('workspace-deadline',active&&days<=7);if(active&&days<=7){row.style.setProperty('--deadline-tone',days<=0?'#9c3e4a':days<=3?'#ad5360':'#b8757e');row.dataset.deadlineLevel=days<=0?'overdue':days<=3?'soon':'week'}
  }
 }
 let deadlineFrame=false;new MutationObserver(()=>{if(deadlineFrame)return;deadlineFrame=true;requestAnimationFrame(()=>{deadlineFrame=false;deadlineTone()})}).observe(document.querySelector('main'),{childList:true,subtree:true});window.addEventListener('studio-updated',deadlineTone);deadlineTone();
 window.AtelierWorkspace={setDrawer,deadlineTone};
})();
