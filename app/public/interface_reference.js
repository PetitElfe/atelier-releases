/* Onglet 2 de l'audit — vue annuelle et confort visuel.
   Préférences de présentation locales; ne modifie ni rendez-vous ni données SQLite. */
(()=>{'use strict';
 const root=document.documentElement;
 const scales=[80,85,90,95,100,105,110,115,120];
 const themes={goblin:'Goblin sombre',sage:'Sauge',mauve:'Mauve',bleu:'Bleu nuit',miel:'Miel'};
 const safeGet=(k,d)=>{try{return localStorage.getItem(k)||d}catch(_){return d}};
 const safeSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
 const apply=()=>{
   const size=Number(safeGet('atelier-ui-scale','100'));
   const theme=safeGet('atelier-ui-theme','goblin');
   // Ne jamais agrandir le document entier : l'Accueil conserve des coordonnées
   // de widgets libres et un zoom de la racine change sa largeur utilisable.
   // Les vues à mise en page fluide peuvent être agrandies indépendamment.
   const actual=scales.includes(size)?size:100;
   root.style.zoom=actual<=100?actual+'%':'100%';
   document.querySelectorAll('main .view').forEach(view=>{
     view.style.zoom=actual>100 && view.id!=='homeView'?actual+'%':'';
   });
   root.dataset.atelierTheme=Object.hasOwn(themes,theme)?theme:'goblin';
 };
 apply();
 const settings=document.querySelector('#settingsView .settings-grid');
 if(settings){
   const section=document.createElement('section');section.className='settings-card atelier-appearance-settings';
   section.innerHTML='<div class="settings-card-title"><span class="settings-card-icon">Aa</span><div><h3>Affichage et couleurs</h3><p>Comme sur Discord : réduis toute l’interface ou agrandis-la. Les réglages restent sur cet ordinateur.</p></div></div><label class="settings-field"><span>Taille globale de l’interface</span><select id="atelierUiScale"></select></label><label class="settings-field"><span>Thème de couleurs</span><select id="atelierUiTheme"></select></label><p class="muted">Le mode 100 % conserve les dimensions habituelles. Au-dessus de 100 %, l’Accueil garde sa géométrie pour éviter les chevauchements ; les autres rubriques peuvent être agrandies.</p>';
   const size=section.querySelector('#atelierUiScale'),theme=section.querySelector('#atelierUiTheme');
   for(const value of scales){const opt=document.createElement('option');opt.value=value;opt.textContent=value+' %';size.append(opt)}
   for(const [key,label] of Object.entries(themes)){const opt=document.createElement('option');opt.value=key;opt.textContent=label;theme.append(opt)}
   size.value=safeGet('atelier-ui-scale','100');theme.value=safeGet('atelier-ui-theme','goblin');
   size.addEventListener('change',()=>{safeSet('atelier-ui-scale',size.value);apply()});
   theme.addEventListener('change',()=>{safeSet('atelier-ui-theme',theme.value);apply()});
   settings.append(section);
 }
 const calendar=document.querySelector('.calendar-modes');
 const monthPanel=document.querySelector('#monthPanel');
 if(!calendar||!monthPanel)return;
 const button=document.createElement('button');button.type='button';button.dataset.calendarMode='year';button.textContent='Année';button.title='Vue annuelle avec rendez-vous';calendar.append(button);
 const panel=document.createElement('div');panel.id='yearPanel';panel.className='calendar-panel atelier-year-panel';
 panel.innerHTML='<div class="atelier-year-header"><button id="atelierYearPrev" type="button" aria-label="Année précédente">‹</button><h2 id="atelierYearLabel"></h2><button id="atelierYearNext" type="button" aria-label="Année suivante">›</button><button id="atelierYearToday" type="button">Cette année</button></div><div id="atelierYearGrid" class="atelier-year-grid"></div>';
 monthPanel.parentNode.insertBefore(panel,monthPanel.nextSibling);
 let chosenYear=new Date().getFullYear();
 const fmt=new Intl.DateTimeFormat('fr-FR',{month:'long'});
 const setYear=(y)=>{chosenYear=Math.min(2100,Math.max(1900,y));paint()};
 const paint=()=>{
   panel.querySelector('#atelierYearLabel').textContent=chosenYear;
   const wrap=panel.querySelector('#atelierYearGrid');wrap.replaceChildren();
   const events=Array.isArray(state.events)?state.events:[];
   for(let m=0;m<12;m++){
     const card=document.createElement('section');card.className='atelier-year-month';
     const title=document.createElement('button');title.className='atelier-year-month-title';title.type='button';
     title.textContent=fmt.format(new Date(chosenYear,m,1));
     title.addEventListener('click',()=>{state.cursor=new Date(chosenYear,m,1);setCalendarMode('month');refresh()});
     card.append(title);
     const days=document.createElement('div');days.className='atelier-year-days';
     for(let d=1;d<=new Date(chosenYear,m+1,0).getDate();d++){
       const day=document.createElement('button');day.type='button';day.className='atelier-year-day';
       const ymdValue=chosenYear+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
       const match=events.filter(e=>e.event_date===ymdValue);
       if(match.length)day.classList.add('has-event');
       day.textContent=d;day.title=ymdValue+(match.length?' · '+match.map(e=>e.title).join(', '):'');
       day.addEventListener('click',()=>{state.cursor=new Date(chosenYear,m,d);setCalendarMode('month');refresh()});
       days.append(day);
     }
     card.append(days);
     const list=document.createElement('div');list.className='atelier-year-events';
     const monthEvents=events.filter(e=>String(e.event_date||'').startsWith(chosenYear+'-'+String(m+1).padStart(2,'0')+'-')).slice(0,8);
     for(const e of monthEvents){const row=document.createElement('div');row.textContent=(e.event_date||'').slice(-2)+' · '+(e.title||'Rendez-vous');row.title=e.title||'';list.append(row)}
     card.append(list);wrap.append(card);
   }
 };
 button.addEventListener('click',()=>{setCalendarMode('year');paint()});
 panel.querySelector('#atelierYearPrev').onclick=()=>setYear(chosenYear-1);
 panel.querySelector('#atelierYearNext').onclick=()=>setYear(chosenYear+1);
 panel.querySelector('#atelierYearToday').onclick=()=>setYear(new Date().getFullYear());
 
 paint();
})();

/* Réorganisation demandée dans l'onglet de documentation : tâches comme module
   des Trackers, accès aux rappels via Paramètres. Les données restent intactes. */
(function(){
 const tracker=document.getElementById('trackersView');
 const settings=document.querySelector('#settingsView .settings-grid');
 if(!tracker||!settings)return;
 const tasks=document.createElement('section');
 tasks.className='atelier-tracker-tasks';
 tasks.innerHTML='<div class="tracker-board-head"><h3>Tâches</h3><button type="button" id="trackerTaskAdd">＋ Nouvelle tâche</button></div><div id="trackerTaskItems" class="atelier-tracker-task-items"></div>';
 const boardList=document.getElementById('trackerBoardList');
 if(boardList)boardList.before(tasks);
 tasks.querySelector('#trackerTaskAdd').onclick=()=>document.getElementById('addTask')?.click();
 const reminders=document.createElement('section');reminders.className='settings-card';
 reminders.innerHTML='<div class="settings-card-title"><span class="settings-card-icon">◷</span><div><h3>Liste des rappels</h3><p>Les rappels restent actifs sans rubrique principale.</p></div></div><div id="atelierSettingsReminders"></div><button type="button" id="atelierReminderManage">Gérer les rappels</button>';
 settings.append(reminders);
 reminders.querySelector('#atelierReminderManage').onclick=()=>showView('reminders');
 function paint(){
   const target=tasks.querySelector('#trackerTaskItems');target.replaceChildren();
   const items=Array.isArray(state.tasks)?state.tasks:[];
   if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='Aucune tâche pour le moment.';target.append(p)}
   for(const task of items){
     const row=document.createElement('label');row.className='atelier-tracker-task-line';
     const check=document.createElement('input');check.type='checkbox';check.checked=!!task.completed;
     check.setAttribute('aria-label','Terminer '+task.title);
     check.onchange=async()=>{try{await api('/api/tasks/'+task.id,{method:'PUT',body:JSON.stringify({completed:check.checked})});await refresh();paint()}catch(error){check.checked=!check.checked;showUiError(error,'Tâches')}};
     const name=document.createElement('span');name.textContent=task.title;name.className=task.completed?'atelier-task-done':'';
     const edit=document.createElement('button');edit.type='button';edit.textContent='✎';edit.title='Modifier '+task.title;
     edit.onclick=e=>{e.preventDefault();openTaskModal(task)};
     row.append(check,name,edit);target.append(row);
   }
   const list=reminders.querySelector('#atelierSettingsReminders');list.replaceChildren();
   const pending=(Array.isArray(state.reminders)?state.reminders:[]).filter(r=>r.status!=='done');
   if(!pending.length){const p=document.createElement('p');p.className='muted';p.textContent='Aucun rappel en attente.';list.append(p)}
   for(const item of pending.slice(0,30)){const div=document.createElement('p');div.textContent=(item.title||'Rappel')+(item.remind_at?' · '+new Date(item.remind_at).toLocaleString('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}):'');list.append(div)}
 }
 const original=showView;
 showView=function(view){original(view);if(view==='trackers'||view==='settings')paint()};
 if(state.view==='trackers'||state.view==='settings')paint();
})();

/* Paramètres en deux panneaux permanents, sans fenêtre modale.
   Navigation à gauche, contenu à droite. */
(function(){
 const shell=document.querySelector('#settingsView .settings-shell');
 const grid=shell?.querySelector('.settings-grid');
 if(!shell||!grid)return;
 const wrap=document.createElement('div');wrap.className='atelier-settings-split';
 const nav=document.createElement('nav');nav.className='atelier-settings-nav';
 nav.setAttribute('aria-label','Rubriques des paramètres');
 const body=document.createElement('div');body.className='atelier-settings-content';
 grid.parentNode.insertBefore(wrap,grid);wrap.append(nav,body);body.append(grid);
 const cards=[...grid.querySelectorAll(':scope > .settings-card')];
 const labels={settingsUpdatesCard:'Mises à jour'};
 const prefsKey='atelier-settings-section';
 const choose=card=>{
   if(!card)return;
   for(const c of cards)c.hidden=(c!==card);
   for(const btn of nav.querySelectorAll('button')){const yes=btn.dataset.target===card.id;btn.classList.toggle('active',yes);btn.setAttribute('aria-current',yes?'page':'false')}
   try{localStorage.setItem(prefsKey,card.id)}catch(_){}
 };
 cards.forEach((card,index)=>{
   if(!card.id)card.id='atelierSettingsSection'+index;
   const title=labels[card.id]||card.querySelector('h3')?.textContent?.trim()||'Réglages';
   const btn=document.createElement('button');btn.type='button';btn.textContent=title;btn.dataset.target=card.id;
   btn.onclick=()=>choose(card);nav.append(btn);
 });
 let selected=null;try{selected=localStorage.getItem(prefsKey)}catch(_){}
 choose(cards.find(c=>c.id===selected)||cards[0]);
})();
/* Module Tâches : taille indépendante, déplacement par la poignée, sans
   toucher au stockage des tâches ou à la position de l'Accueil. */
(function(){
 const card=document.querySelector('#trackersView .atelier-tracker-tasks');if(!card)return;
 const key='atelierTrackerTasksLayout_20261030';
 const head=card.querySelector('.tracker-board-head');
 if(!head)return;
 const handle=document.createElement('button');handle.type='button';handle.className='atelier-tracker-move';handle.textContent='✥ Déplacer';handle.title='Déplacer le module Tâches';
 head.prepend(handle);
 const resize=document.createElement('button');resize.type='button';resize.className='atelier-tracker-resize';resize.title='Modifier la largeur du module';resize.textContent='↔ Taille';head.append(resize);
 let config={x:0,width:560};
 try{config={...config,...JSON.parse(localStorage.getItem(key)||'{}')}}catch(_){}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(config))}catch(_){}};
 const paint=()=>{const parent=card.parentElement;const max=Math.max(300,parent?.clientWidth||900);card.style.width=Math.min(max,Math.max(320,Number(config.width)||560))+'px';card.style.maxWidth='100%';card.style.marginLeft=Math.max(0,Math.min(Number(config.x)||0,Math.max(0,max-card.offsetWidth)))+'px'};
 const drag=(button,kind)=>{button.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;
   e.preventDefault();button.setPointerCapture(e.pointerId);
   const start=e.clientX, initial=kind==='move'?Number(config.x)||0:Number(config.width)||560;
   const move=ev=>{const delta=ev.clientX-start;if(kind==='move')config.x=Math.max(0,initial+delta);else config.width=Math.max(320,initial+delta);paint()};
   const end=()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',end);save()};
   button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);
 })};
 drag(handle,'move');drag(resize,'size');paint();window.addEventListener('resize',paint);
})();


/* Edition des tableaux Trackers : disposition fluide, sauvegarde par ID.
   Un décalage ne fait jamais chevaucher le tableau suivant. */
(function(){
 const root=document.getElementById('trackersView');
 const boards=document.getElementById('trackerBoardList');
 if(!root||!boards)return;
 const head=root.querySelector('.panel-head')||root.querySelector('h2')?.parentElement;
 const edit=document.createElement('button');edit.type='button';edit.id='atelierTrackerEditLayout';edit.textContent='✎ Modifier les modules';edit.setAttribute('aria-pressed','false');
 if(head)head.append(edit);else root.prepend(edit);
 let editing=false;
 const storePrefix='atelierTrackerModulePlace_';
 const read=id=>{try{return JSON.parse(localStorage.getItem(storePrefix+id)||'{}')}catch(_){return {}}};
 const save=(id,v)=>{try{localStorage.setItem(storePrefix+id,JSON.stringify(v))}catch(_){}};
 const apply=(card,id)=>{
   const data=read(id);const available=Math.max(320,boards.clientWidth||960);
   const width=Math.min(available,Math.max(320,Number(data.width)||Math.min(650,available)));
   card.style.width=width+'px';card.style.maxWidth='100%';
   card.style.marginLeft=Math.min(Math.max(0,Number(data.x)||0),Math.max(0,available-width))+'px';
 };
 const attach=card=>{
   if(card.dataset.atelierDragWired==='1')return;
   const id=card.dataset.atelierBoardId;if(!id)return;
   const heading=card.querySelector('.tracker-board-head');if(!heading)return;
   card.dataset.atelierDragWired='1';card.classList.toggle('atelier-module-editing',editing);
   const mover=document.createElement('button'),sizer=document.createElement('button');
   mover.type='button';mover.className='atelier-tracker-layout-handle';mover.textContent='✥ Déplacer';
   sizer.type='button';sizer.className='atelier-tracker-layout-handle';sizer.textContent='↔ Largeur';
   heading.append(mover,sizer);
   for(const [btn,prop] of [[mover,'x'],[sizer,'width']]){
     btn.addEventListener('pointerdown',ev=>{
       if(!editing||ev.button!==0)return;
       ev.preventDefault();ev.stopPropagation();btn.setPointerCapture(ev.pointerId);
       const start=ev.clientX,initial=read(id);
       const base=Number(initial[prop])||(prop==='width'?card.getBoundingClientRect().width:0);
       const onMove=e=>{const next={...initial,[prop]:Math.max(0,Math.round(base+e.clientX-start))};save(id,next);apply(card,id)};
       const onEnd=()=>{btn.removeEventListener('pointermove',onMove);btn.removeEventListener('pointerup',onEnd);btn.removeEventListener('pointercancel',onEnd)};
       btn.addEventListener('pointermove',onMove);btn.addEventListener('pointerup',onEnd);btn.addEventListener('pointercancel',onEnd);
     });
   }
   apply(card,id);
 };
 const scan=()=>{
   for(const card of boards.querySelectorAll('.tracker-board[data-atelier-board-id]'))attach(card);
   for(const card of boards.querySelectorAll('.tracker-board[data-atelier-board-id]'))card.classList.toggle('atelier-module-editing',editing);
 };
 edit.onclick=()=>{editing=!editing;edit.setAttribute('aria-pressed',String(editing));edit.textContent=editing?'✓ Terminer':'✎ Modifier les modules';scan()};
 const observer=new MutationObserver(scan);observer.observe(boards,{childList:true});
 window.addEventListener('resize',()=>{for(const c of boards.querySelectorAll('.tracker-board[data-atelier-board-id]'))apply(c,c.dataset.atelierBoardId)});
 scan();
})();
