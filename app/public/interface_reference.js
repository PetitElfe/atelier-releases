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
 tasks.innerHTML='<div class="tracker-board-head"><h3>To-do list</h3><button type="button" id="trackerTaskAdd">＋ Nouvelle tâche</button></div><div id="trackerTaskItems" class="atelier-tracker-task-items"></div>';
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
     name.tabIndex=0;name.setAttribute('role','button');name.title='Ouvrir '+task.title;
     name.onclick=e=>{e.preventDefault();openTaskModal(task)};
     name.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTaskModal(task)}};
     row.oncontextmenu=e=>{
       e.preventDefault();
       const items=[
         ['Modifier',()=>openTaskModal(task)],
         ['Supprimer',async()=>{
           const ok=await askUiConfirm('Supprimer la tâche','Supprimer « '+task.title+' » ?','Supprimer',true);
           if(!ok)return;
           const result=await runUiAction('Suppression impossible',()=>api('/api/tasks/'+task.id,{method:'DELETE'}));
           if(result.ok){await refresh();paint()}
         }]
       ];
       atelierOpenRowMenu(e,items);
     };
     row.append(check,name);target.append(row);
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
/* Canvas indépendant pour la To-do et tous les tableaux Trackers :
   positions X/Y libres, pas de réordonnancement forcé, aucune perte des données. */
(function(){
 const root=document.getElementById('trackersView'),boards=document.getElementById('trackerBoardList');
 const tasks=root?.querySelector('.atelier-tracker-tasks'),pencil=document.getElementById('globalLayoutEdit');
 if(!root||!boards||!tasks||!pencil)return;
 const storage='atelierTrackerCanvas_2_';
 const idOf=el=>el===tasks?'todo':el.dataset.atelierBoardId;
 const read=id=>{try{return JSON.parse(localStorage.getItem(storage+id)||'null')}catch(_){return null}};
 const save=(id,d)=>{try{localStorage.setItem(storage+id,JSON.stringify(d))}catch(_){}};
 const all=()=>[tasks,...boards.querySelectorAll('.tracker-board[data-atelier-board-id]')];
 const editable=()=>root.classList.contains('layout-editing');
 boards.classList.add('atelier-tracker-canvas');
 let measuring=false;
 function initialize(el,y){
   const id=idOf(el);if(!id)return;
   let d=read(id);
   if(!d){
     let old={};try{old=JSON.parse(localStorage.getItem('atelierTrackerLayoutUnified_'+id)||'{}')}catch(_){}
     d={x:Math.max(0,Number(old.x)||0),y, width:Math.max(320,Number(old.width)||(id==='todo'?560:650)),height:Math.max(0,Number(old.height)||0)};
     save(id,d);
   }
 }
 function render(){
   if(measuring)return;
   measuring=true;
   try{
     if(tasks.parentElement!==boards)boards.prepend(tasks);
     const cards=all(),available=Math.max(320,boards.clientWidth||root.clientWidth||900);
     let next=0,maxBottom=0;
     for(const card of cards){const id=idOf(card),saved=id&&read(id);if(saved)next=Math.max(next,(Number(saved.y)||0)+(Number(saved.height)||card.scrollHeight||180)+16)}
     for(const el of cards){
       const id=idOf(el);if(!id)continue;
       if(!read(id)){
         // Mesurer dans le flux avant de choisir une position initiale.
         el.style.position='relative';el.style.width=Math.min(available,id==='todo'?560:650)+'px';
         const natural=Math.max(130,el.scrollHeight||el.offsetHeight||170);
         initialize(el,next);next+=natural+16;
       }
       const d=read(id);
       const width=Math.min(available,Math.max(320,Number(d.width)||560));
       const x=Math.max(0,Math.min(available-width,Number(d.x)||0));
       const y=Math.max(0,Number(d.y)||0);
       el.style.position='absolute';el.style.left=x+'px';el.style.top=y+'px';
       el.style.margin='0';el.style.width=width+'px';el.style.maxWidth='100%';
       el.style.height=d.height?Math.max(120,d.height)+'px':'auto';
       el.style.boxSizing='border-box';
       el.classList.toggle('atelier-module-editing',editable());
       maxBottom=Math.max(maxBottom,y+Math.max(el.offsetHeight,el.scrollHeight)+20);
       if(!el.dataset.atelierCanvasBound)bind(el);
     }
     boards.style.minHeight=Math.max(380,maxBottom)+'px';
   }finally{measuring=false}
 }
 function bind(el){
   const id=idOf(el),head=el.querySelector('.tracker-board-head');
   if(!id||!head)return;
   el.dataset.atelierCanvasBound='1';
   head.classList.add('atelier-module-drag-surface');
   el.classList.add('atelier-layout-capable');
   el.querySelector('.atelier-layout-grip')?.remove();
   let corner=el.querySelector('.atelier-layout-corner');
   if(!corner){corner=document.createElement('span');corner.className='atelier-layout-corner';corner.title='Redimensionner';el.append(corner)}
   const wire=(handle,mode)=>{
     handle.addEventListener('pointerdown',ev=>{
       if(!editable()||ev.button!==0||(mode==='move'&&ev.target.closest('button,input,select,a,textarea')))return;
       ev.preventDefault();ev.stopPropagation();
       const startX=ev.clientX,startY=ev.clientY,initial={...read(id)};
       handle.setPointerCapture(ev.pointerId);
       const move=e=>{
         const scale=Math.max(.5,Number.parseFloat(getComputedStyle(document.documentElement).zoom)||1);
         const dx=(e.clientX-startX)/scale,dy=(e.clientY-startY)/scale,d={...initial};
         if(mode==='move'){d.x=Math.max(0,initial.x+dx);d.y=Math.max(0,initial.y+dy)}
         else{d.width=Math.max(320,initial.width+dx);d.height=Math.max(120,(initial.height||el.offsetHeight)+dy)}
         save(id,d);render();
       };
       const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end)};
       handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
     });
   };
   wire(head,'move');wire(corner,'resize');
 }
 let scheduled=false;
 const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render()})};
 // Le moteur de Trackers régénère les cartes ; restaurer leurs positions après chaque rendu.
 const observer=new MutationObserver(schedule);observer.observe(boards,{childList:true});
 pencil.addEventListener('click',()=>setTimeout(render,0));
 const prior=showView;showView=function(view){prior(view);setTimeout(render,0)};
 window.addEventListener('resize',schedule);
 schedule();
})();
/* Menu de ligne partagé : clic droit sur To-do list et sur les trackers.
   Aucun crayon permanent dans les lignes. */
function atelierOpenRowMenu(event,items){
 document.querySelector('.atelier-row-context-menu')?.remove();
 const menu=document.createElement('div');menu.className='atelier-row-context-menu';menu.setAttribute('role','menu');
 const close=()=>{menu.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true)};
 const outside=e=>{if(!menu.contains(e.target))close()};
 const escape=e=>{if(e.key==='Escape')close()};
 for(const [label,action] of items){
  const btn=document.createElement('button');btn.type='button';btn.setAttribute('role','menuitem');
  btn.textContent=label;btn.onclick=()=>{close();action()};menu.append(btn);
 }
 menu.style.position='fixed';menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-180))+'px';
 menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-110))+'px';
 document.body.append(menu);
 setTimeout(()=>{document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true)},0);
}
/* Réorganisation globale demandée sur le Drive :
   les anciens écrans existent toujours pour conserver les données et liens,
   mais leurs raccourcis sont retirés du tiroir principal. */
(function(){
 const hidden=new Set(['tasks','reminders','organisation','captures']);
 document.querySelectorAll('#sideNav .side-nav-links button[data-view]').forEach(button=>{
   if(hidden.has(button.dataset.view))button.hidden=true;
 });
})();
