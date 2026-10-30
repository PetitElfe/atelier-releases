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
   root.style.zoom=(scales.includes(size)?size:100)+'%';
   root.dataset.atelierTheme=Object.hasOwn(themes,theme)?theme:'goblin';
 };
 apply();
 const settings=document.querySelector('#settingsView .settings-grid');
 if(settings){
   const section=document.createElement('section');section.className='settings-card atelier-appearance-settings';
   section.innerHTML='<div class="settings-card-title"><span class="settings-card-icon">Aa</span><div><h3>Affichage et couleurs</h3><p>Comme sur Discord : réduis toute l’interface ou agrandis-la. Les réglages restent sur cet ordinateur.</p></div></div><label class="settings-field"><span>Taille globale de l’interface</span><select id="atelierUiScale"></select></label><label class="settings-field"><span>Thème de couleurs</span><select id="atelierUiTheme"></select></label><p class="muted">Le mode 100 % conserve les dimensions habituelles. Le zoom n’efface pas les positions enregistrées.</p>';
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
   const events=Array.isArray(state?.events)?globalThis.state.events:[];
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