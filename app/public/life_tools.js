/* L'Atelier du Goblin — outils de vie ALPHA 0.18 : suivi, administratif,
   carnet de réception, capture rapide, pages du journal et son local.
   Les données sensibles restent dans la base SQLite de cette installation. */
const lifeDestinations=[
  {key:'carnet',tag:'#Carnet',label:'Carnet / boîte de réception'},
  {key:'taches',tag:'#Tâches',label:'Tâches'},
  {key:'rappels',tag:'#Rappels',label:'Rappels'},
  {key:'postit',tag:'#Post-it',label:'Post-it'},
  {key:'administratif',tag:'#Administratif',label:'Administratif'},
  {key:'tracker',tag:'#Tracker',label:'Tracker'}
];
let lifeTrackers=[],lifeAdmin=[],lifeCaptures=[],lifeJournalPage=0;
let lifeTodayChecks=[],lifeTodayDay=ymd(new Date());
let lifeBoards=[],lifeArchivedBoards=[],lifeBoardMonth=ymd(new Date()).slice(0,7),lifeBoardArchivesVisible=false;
let lifeBoardOffsets={},lifeBoardLoadVersion=0;
const lifeBoardPeriodPresets=[
  ['months',1,'1 mois'],['weeks',1,'1 semaine'],['weeks',2,'2 semaines'],
  ['months',2,'2 mois'],['months',3,'3 mois'],['months',6,'6 mois'],
  ['years',1,'1 an'],['years',2,'2 ans']
];
const lifeBoardPeriodLimits={days:90,weeks:12,months:24,years:5};
function lifeBoardPeriodChoice(preset,count,unit){
  let resultUnit,resultCount;
  if(preset==='custom'){resultUnit=String(unit);resultCount=Number(count)}
  else [resultUnit,resultCount]=String(preset).split(':').map((x,i)=>i===1?Number(x):x);
  if(!(resultUnit in lifeBoardPeriodLimits)||!Number.isInteger(resultCount)||
     resultCount<1||resultCount>lifeBoardPeriodLimits[resultUnit])
    throw new Error('Choisis 1 à 90 jours, 1 à 12 semaines, 1 à 24 mois ou 1 à 5 ans.');
  return {period_unit:resultUnit,period_count:resultCount};
}
function lifeBoardPreset(unit,count){
  return lifeBoardPeriodPresets.some(x=>x[0]===unit&&x[1]===count)?
    unit+':'+count:'custom';
}
function lifeBoardMonthOffset(){
  const [y,m]=lifeBoardMonth.split('-').map(Number),now=new Date();
  return (y-now.getFullYear())*12+m-1-now.getMonth();
}
function lifeBoardRequestedOffset(board){
  let n=lifeBoardOffsets[board.id]||0;
  if(board.period_unit==='months'&&Number(board.period_count)===1)
    n+=lifeBoardMonthOffset();
  return Math.max(-60,Math.min(60,n));
}
function lifeBoardRequestedOffsets(){
  const o={};lifeBoards.forEach(board=>o[board.id]=lifeBoardRequestedOffset(board));
  return o;
}
function lifeBoardLabel(board,day){
  if(board.period?.granularity==='months'){
    const [year,month]=day.split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  }
  return lifeDate(day);
}

let lifeCaptureChoice='carnet',lifeAudioContext=null;
function lifeApi(path,opts){return api(path,opts)}
function lifeDate(s){return s?parseYMD(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'Sans échéance'}
function lifeNumber(v){return Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2})}
function lifeSetText(id,text){const el=$(id);if(el)el.textContent=text}
async function loadLifeTools(){
  const version=++lifeBoardLoadVersion;
  const month='?month='+encodeURIComponent(lifeBoardMonth);
  const windows=month+'&periods=1&offsets='+encodeURIComponent(JSON.stringify(lifeBoardRequestedOffsets()));
  const settled=await Promise.allSettled([
    lifeApi('/api/trackers'),lifeApi('/api/admin'),lifeApi('/api/captures'),
    lifeApi('/api/tracker-boards'+windows),lifeApi('/api/tracker-boards'+windows+'&archived=1'),
    lifeApi('/api/tracker-boards/daily?day='+encodeURIComponent(ymd(new Date())))
  ]);
  if(version!==lifeBoardLoadVersion)return;
  if(settled[0].status==='fulfilled')lifeTrackers=settled[0].value;
  if(settled[1].status==='fulfilled')lifeAdmin=settled[1].value;
  if(settled[2].status==='fulfilled')lifeCaptures=settled[2].value;
  if(settled[3].status==='fulfilled')lifeBoards=settled[3].value;
  if(settled[4].status==='fulfilled')lifeArchivedBoards=settled[4].value;
  if(settled[5].status==='fulfilled'){
    lifeTodayChecks=settled[5].value.items||[];
    lifeTodayDay=settled[5].value.day;
  }
  const failures=settled.filter(x=>x.status==='rejected');
  if(failures.length)showUiError(failures[0].reason,'Chargement du suivi et de l’administratif');
  renderLifeTools();
}
function lifeNode(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function lifeButton(label,callback,cls=''){const b=lifeNode('button',cls,label);b.type='button';b.onclick=callback;return b}
async function lifeAction(label,fn){const result=await runUiAction(label,fn);if(result.ok)await loadLifeTools();return result.ok}
function renderLifeTools(){
  renderTrackerBoards();renderLifeTrackers();renderLifeAdmin();renderLifeCaptures();renderJournalLifePage();renderHomeDailyTrackers();
}
/* Accueil : CINQ lignes visibles, mais aucune limite de lignes à cocher.
   Les cases utilisent directement les mêmes tracker_board_marks que les grilles. */
function renderHomeDailyTrackers(){
  const root=$('#homeDailyTrackersList');if(!root)return;
  const oldScroll=root.scrollTop;
  root.replaceChildren();
  const day=ymd(new Date());
  const current=lifeTodayDay===day?lifeTodayChecks:[];
  const label=$('#homeDailyTrackersDate');
  if(label)label.textContent='Aujourd’hui · '+new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  if(!current.length){
    root.append(lifeNode('p','home-daily-empty',
      'Aucune case quotidienne pour l’instant. Ajoute des lignes « À cocher » dans Trackers.'));
  }
  for(const item of current){
    const row=lifeNode('label','home-daily-tracker-row');
    const check=item.mode==='number'?lifeNode('button','home-daily-counter',
      (item.value||0)+'/'+item.target_count):lifeNode('input');
    if(item.mode!=='number'){check.type='checkbox';check.checked=!!item.done;}
    else check.type='button';
    check.setAttribute('aria-label',item.title+' — '+item.board_title+' — aujourd’hui');
    const title=lifeNode('span','home-daily-tracker-name',item.title);
    const board=lifeNode('small','home-daily-tracker-board',item.board_title);
    const body=lifeNode('span','home-daily-tracker-text');body.append(title,board);
    row.append(check,body);
    if(item.steps?.length){
      body.title='Ouvrir les étapes de cette habitude';
      body.style.cursor='pointer';
      body.addEventListener('click',event=>{event.preventDefault();trackerOpenRitual(item,day)});
    }
    row.classList.toggle('home-daily-done',!!item.done);
    row.classList.add('home-daily-color-'+item.color);
    const edit=async()=>{
      if(item.steps?.length){check.checked=!!item.done;trackerOpenRitual(item,day);return}
      check.disabled=true;
      const wanted=item.mode==='number'?
        Math.min(Number(item.target_count),Number(item.value||0)+1):check.checked;
      if(item.mode==='number'&&item.done){
        check.disabled=false;trackerOpenCounter(item,day);return;
      }
      try{
        await lifeApi('/api/tracker-board-rows/'+item.row_id+'/mark',{
          method:'PUT',body:JSON.stringify({day,value:item.mode==='number'?wanted:wanted?true:null})
        });
        item.done=item.mode==='number'?wanted>=item.target_count:wanted;
        item.value=item.mode==='number'?wanted:null;
        row.classList.toggle('home-daily-done',item.done);
        await loadLifeTools();
      }catch(err){
        if(item.mode!=='number')check.checked=!wanted;
        row.classList.toggle('home-daily-done',!!item.done);
        showUiError(err,'Impossible d’enregistrer le suivi du jour');
      }finally{check.disabled=false}
    };
    check.addEventListener(item.mode==='number'?'click':'change',edit);
    root.append(row);
  }
  root.scrollTop=oldScroll;
}
$('#openDailyTrackers')?.addEventListener('click',()=>showView('trackers'));
/* Trackers visuels : tableaux indépendants, lignes x jours, un geste = une case.
   Le stockage n'est PAS le même que les anciens trackers numériques. */
function lifeTrackerDay(year,month,number){
  return String(year)+'-'+String(month).padStart(2,'0')+'-'+String(number).padStart(2,'0');
}
function lifeTrackerChangeMonth(offset){
  const [year,month]=lifeBoardMonth.split('-').map(Number);
  const d=new Date(year,month-1+offset,1);
  lifeBoardMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  loadLifeTools();
}
function lifeTrackerMarkButton(board,line,day){
  const cellLabel=lifeBoardLabel(board,day);
  const raw=line.marks?.[day];
  const active=raw!==undefined;
  const numeric=line.mode==='number';
  const target=numeric?Number(line.target_count||0):0;
  const progress=active?Number(raw):0;
  const closed=!!target&&progress>=target;
  const locked=line.weekday!=null&&board.period?.granularity==='days'&&parseYMD(day).getDay()!==((Number(line.weekday)+1)%7);
  const button=lifeButton(numeric?(target?(closed?'✓':String(progress||'·')):(active?String(raw):'·')):(active?'●':''),
    async()=>{
      if(locked)return;
      if(!numeric && line.steps?.length){trackerOpenRitual(line,day);return}
      if(numeric){
        if(!target){lifeEditTrackerNumber(button,board,line,day);return}
        if(closed){trackerOpenCounter(line,day);return}
        const nextValue=Math.min(target,progress+1);
        button.disabled=true;
        const saved=await runUiAction('Compter le suivi',()=>lifeApi(
          '/api/tracker-board-rows/'+line.id+'/mark',
          {method:'PUT',body:JSON.stringify({day,value:nextValue})}));
        if(saved.ok){
          line.marks[day]=String(nextValue);
          button.replaceWith(lifeTrackerMarkButton(board,line,day));
          await loadLifeTools();
        }else button.disabled=false;
        return;
      }
      const changed=active?null:true;
      button.disabled=true;
      const result=await runUiAction('Marquer une période',()=>
        lifeApi('/api/tracker-board-rows/'+line.id+'/mark',
          {method:'PUT',body:JSON.stringify({day,value:changed})}));
      if(result.ok){
        if(changed===null)delete line.marks[day];
        else line.marks[day]='1';
        const next=lifeTrackerMarkButton(board,line,day);
        button.replaceWith(next);
      }else button.disabled=false;
    },'tracker-day-cell'+(active?' tracker-day-done':'')+
       (numeric?' tracker-day-number':'')+
       (closed?' tracker-day-target-reached':''));
  button.type='button';
  button.setAttribute('aria-label',line.title+' · '+cellLabel+' : '+
    (numeric?(active?'Valeur '+raw:'Saisir une valeur'):(active?'marqué':'non marqué')));
  if(!numeric)button.setAttribute('aria-pressed',String(active));
  button.title=locked?'Prévu un autre jour':
    numeric?(target?'Ajouter 1 ('+progress+'/'+target+'). Après validation, ouvrir les réglages du compteur.':
      'Saisir une valeur pour '+cellLabel):
    line.steps?.length?'Ouvrir les étapes à cocher pour '+cellLabel:
      'Cocher ou décocher '+cellLabel;
  if(locked){button.disabled=true;button.classList.add('tracker-day-unavailable')}
  return button;
}
function lifeEditTrackerNumber(button,board,line,day){
  const input=lifeNode('input','tracker-number-editor');
  input.type='number';input.step='any';input.min='-1000000';input.max='1000000';
  input.value=line.marks?.[day]??'';
  input.setAttribute('aria-label','Valeur '+line.title+' · '+lifeBoardLabel(board,day));
  const original=input.value,holder=button.parentElement;
  holder.replaceChildren(input);input.focus();input.select();
  let finished=false;
  const restore=()=>holder.replaceChildren(lifeTrackerMarkButton(board,line,day));
  const close=async(save)=>{
    if(finished)return;finished=true;
    const value=input.value.trim();
    if(!save||value===original){restore();return}
    const numeric=value===''?null:Number(value);
    if(value!==''&&(!Number.isFinite(numeric)||Math.abs(numeric)>1000000)){
      showUiError(new Error('Entre un nombre valide (entre -1 000 000 et 1 000 000).'),'Tracker');
      restore();return;
    }
    input.disabled=true;
    const result=await runUiAction('Enregistrer une valeur',()=>
      lifeApi('/api/tracker-board-rows/'+line.id+'/mark',
        {method:'PUT',body:JSON.stringify({day,value:numeric})}));
    if(result.ok){
      if(numeric===null)delete line.marks[day];
      else line.marks[day]=String(numeric);
    }
    restore();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();close(false)}
    if(e.key==='Enter'){e.preventDefault();close(true)}
  });
  input.addEventListener('blur',()=>close(true));
}
function renderTrackerBoards(){
  const root=$('#trackerBoardList');if(!root)return;
  const [year,month]=lifeBoardMonth.split('-').map(Number);
  const label=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  lifeSetText('#trackerMonthLabel',label.charAt(0).toUpperCase()+label.slice(1));
  const archiveRoot=$('#trackerBoardArchiveList');archiveRoot?.replaceChildren();
  archiveRoot?.classList.toggle('hidden',!lifeBoardArchivesVisible);
  const archives=$('#trackerBoardArchivesToggle');
  if(archives){
    archives.setAttribute('aria-expanded',String(lifeBoardArchivesVisible));
    archives.textContent='Mes tableaux archivés ('+lifeArchivedBoards.length+')';
  }
  if(lifeBoardArchivesVisible&&archiveRoot){
    if(!lifeArchivedBoards.length)archiveRoot.append(lifeNode('p','life-muted','Aucun tableau archivé.'));
    lifeArchivedBoards.forEach(board=>{
      const item=lifeNode('div','tracker-archived-entry');
      item.append(lifeNode('strong','',board.title),lifeButton('Restaurer',()=>
        lifeAction('Restaurer le tableau',()=>lifeApi('/api/tracker-boards/'+board.id,
          {method:'PUT',body:JSON.stringify({archived:false})})),'tracker-restore'));
      archiveRoot.append(item);
    });
  }
  root.replaceChildren();
  if(!lifeBoards.length)root.append(lifeNode('p','tracker-empty',
    'Aucun tableau pour l’instant. Crée ton premier tableau, puis ajoute une ligne par habitude ou activité.'));
  const today=ymd(new Date());
  lifeBoards.forEach(board=>{
    const section=lifeNode('section','tracker-board tracker-board-'+board.color);
    const head=lifeNode('div','tracker-board-head');
    const h=lifeNode('h3','',board.title);
    const action=lifeButton('Archiver le tableau',async()=>{
      const ok=await askUiConfirm('Archiver ce tableau',
        'Le tableau « '+board.title+' » et ses cases seront conservés dans Mes tableaux archivés.',
        'Archiver');
      if(ok)await lifeAction('Archiver le tableau',()=>
        lifeApi('/api/tracker-boards/'+board.id,
          {method:'PUT',body:JSON.stringify({archived:true})}));
    },'tracker-archive-button');
    head.append(h,action);
    const periodBar=lifeNode('div','tracker-board-period');
    const cadence=lifeNode('span','tracker-board-cadence',
      board.period_unit==='months'&&Number(board.period_count)===1?'':board.period.cadence);
    const before=lifeButton('‹',()=>{lifeBoardOffsets[board.id]=(lifeBoardOffsets[board.id]||0)-1;loadLifeTools()},'tracker-period-back');
    before.setAttribute('aria-label','Période précédente pour '+board.title);
    const periodLabel=lifeNode('span','tracker-board-range',board.period.label);
    const after=lifeButton('›',()=>{lifeBoardOffsets[board.id]=(lifeBoardOffsets[board.id]||0)+1;loadLifeTools()},'tracker-period-next');
    after.setAttribute('aria-label','Période suivante pour '+board.title);
    const current=lifeButton('Aujourd’hui',()=>{
      lifeBoardOffsets[board.id]=-(board.period_unit==='months'&&Number(board.period_count)===1?lifeBoardMonthOffset():0);
      loadLifeTools();
    },'tracker-period-today');
    const change=lifeButton('Changer le rythme',()=>lifeBoardPeriodEditor(section,board),'tracker-period-change');
    const readablePeriod=board.period_unit==='weeks'?
      'Semaine'+(Number(board.period_count)>1?'s':'')+' · '+board.period.label:
      board.period_unit==='months'&&Number(board.period_count)===1?
        board.period.columns[0]?.title?.replace(/^./,letter=>letter.toUpperCase())||board.period.label:
        board.period.label;
    periodLabel.textContent=readablePeriod;
    periodLabel.title='Période de '+board.title;
    periodBar.append(cadence,before,periodLabel,after,current,change);
    // Les actions restent disponibles au clic droit sans supprimer les données.
    section.addEventListener('contextmenu',event=>{
      if(event.target.closest('input,select,textarea'))return;
      event.preventDefault();
      document.querySelector('.tracker-board-popup')?.remove();
      const popup=lifeNode('div','tracker-board-popup');
      popup.setAttribute('role','menu');
      popup.setAttribute('aria-label','Actions du tableau '+board.title);
      const outside=e=>{if(!popup.contains(e.target))dismiss()};
      const escape=e=>{if(e.key==='Escape')dismiss()};
      const dismiss=()=>{
        popup.remove();
        document.removeEventListener('pointerdown',outside,true);
        document.removeEventListener('keydown',escape,true);
      };
      const archive=lifeButton('Archiver le tableau',()=>{dismiss();action.click()},'');
      const rhythm=lifeButton('Changer le rythme',()=>{dismiss();change.click()},'');
      archive.setAttribute('role','menuitem');
      rhythm.setAttribute('role','menuitem');
      popup.append(archive,rhythm);
      document.body.append(popup);
      popup.style.left=Math.max(4,Math.min(event.clientX,innerWidth-popup.offsetWidth-8))+'px';
      popup.style.top=Math.max(4,Math.min(event.clientY,innerHeight-popup.offsetHeight-8))+'px';
      document.addEventListener('pointerdown',outside,true);
      document.addEventListener('keydown',escape,true);
      archive.focus();
    });
    const viewport=lifeNode('div','tracker-board-scroll');
    viewport.tabIndex=0;
    viewport.setAttribute('aria-label','Tableau '+board.title+' du '+board.period.label);
    const grid=lifeNode('div','tracker-board-grid');
    const columns=board.period.columns;
    grid.style.setProperty('--tracker-days',String(columns.length));
    const days=lifeNode('div','tracker-grid-line tracker-grid-dates');
    days.append(lifeNode('span','tracker-row-label','Mes suivis'));
    for(const item of columns){
      const cell=lifeNode('span','tracker-grid-day'+(item.day===today?' tracker-today':''),item.label+'\n'+item.secondary);
      cell.title=item.title;days.append(cell);
    }
    grid.append(days);
    board.rows.forEach(line=>{
      const row=lifeNode('div','tracker-grid-line');
      const name=lifeNode('span','tracker-row-label');
      const open=lifeButton(line.title,()=>{
        if(line.steps?.length)trackerOpenRitual(line,today);
        else trackerConfigureRow(line);
      },'tracker-row-title');
      open.title=line.steps?.length?'Ouvrir les étapes du jour':'Configurer cette ligne';
      const edit=lifeButton('✎',()=>trackerConfigureRow(line),'tracker-row-setup');
      edit.title='Objectif, étapes, jour fixe et lien de cette ligne';
      edit.setAttribute('aria-label','Configurer '+line.title);
      name.append(open,edit);
      if(line.linked_type&&line.linked_id){
        const linked=lifeButton('↗',()=>{
          const type=line.linked_type;
          if(type==='task'){
            const task=state.tasks.find(x=>Number(x.id)===Number(line.linked_id));
            if(task)openTaskModal(task);else showView('tasks');
          }else showView(type==='admin'?'admin':'library');
        },'tracker-row-linked');
        linked.title='Ouvrir le lien avec '+(line.linked_type==='task'?'la tâche':
          line.linked_type==='admin'?'la démarche':'l’objectif');
        linked.setAttribute('aria-label',linked.title+' · '+line.title);
        name.append(linked);
      }
      row.append(name);
      for(const item of columns){
        const holder=lifeNode('span','tracker-cell-wrap'+(item.day===today?' tracker-today':''));
        holder.append(lifeTrackerMarkButton(board,line,item.day));row.append(holder);
      }
      grid.append(row);
    });
    viewport.append(grid);
    if(!board.rows.length)viewport.append(lifeNode('p','life-muted',
      'Ajoute une ligne ci-dessous : lecture, marcher, prendre soin de moi…'));
    const form=lifeNode('form','tracker-add-row');
    const title=lifeNode('input','');title.name='title';title.required=true;
    title.maxLength=100;title.placeholder='Nouvelle ligne (ex. : Lecture)';
    title.setAttribute('aria-label','Nouvelle ligne dans '+board.title);
    const mode=lifeNode('select','');mode.name='mode';
    [['check','À cocher'],['number','Numéro']].forEach(([value,text])=>{
      const opt=lifeNode('option','',text);opt.value=value;mode.append(opt);
    });
    mode.setAttribute('aria-label','Type de suivi');
    const target=lifeNode('input','tracker-row-target');
    target.type='number';target.min='1';target.max='1000';target.step='1';
    target.placeholder='But (ex. 10)';target.setAttribute('aria-label','Nombre à atteindre');
    target.classList.add('hidden');
    const weekday=lifeNode('select','tracker-row-weekday');weekday.setAttribute('aria-label','Jour fixe facultatif');
    [['','Tous les jours'],['0','Lundi'],['1','Mardi'],['2','Mercredi'],['3','Jeudi'],
     ['4','Vendredi'],['5','Samedi'],['6','Dimanche']].forEach(([value,text])=>{
      const op=lifeNode('option','',text);op.value=value;weekday.append(op);
    });
    const updateTarget=()=>{target.classList.toggle('hidden',mode.value!=='number');target.required=false};
    mode.addEventListener('change',updateTarget);updateTarget();
    const submit=lifeNode('button','primary','+ Ajouter une ligne');submit.type='submit';
    form.append(title,mode,target,weekday,submit);
    form.onsubmit=async e=>{
      e.preventDefault();
      if(submit.disabled)return;
      submit.disabled=true;
      const requestedTitle=title.value,requestedMode=mode.value,
        requestedTarget=requestedMode==='number'&&target.value.trim()?Number(target.value):null,
        requestedDay=weekday.value===''?null:Number(weekday.value);
      try{
        const result=await runUiAction('Ajouter une ligne',()=>lifeApi(
          '/api/tracker-boards/'+board.id+'/rows',
          {method:'POST',body:JSON.stringify({title:requestedTitle,mode:requestedMode,
            target_count:requestedTarget,weekday:requestedDay})}));
        if(result.ok){
          title.value='';target.value='';
          await loadLifeTools();
        }
      }finally{submit.disabled=false}
    };
    section.append(head,periodBar,viewport,form);root.append(section);
  });
}
function lifeBoardPeriodEditor(section,board){
  let wrap=section.querySelector('.tracker-period-editor');
  if(wrap){wrap.remove();return}
  wrap=lifeNode('form','tracker-period-editor');
  const preset=lifeNode('select','');
  preset.setAttribute('aria-label','Nouvelle périodicité du tableau');
  for(const [unit,count,label] of lifeBoardPeriodPresets){
    const option=lifeNode('option','',label);option.value=unit+':'+count;preset.append(option);
  }
  const custom=lifeNode('option','','Personnalisée…');custom.value='custom';preset.append(custom);
  preset.value=lifeBoardPreset(board.period_unit,Number(board.period_count));
  const controls=lifeNode('div','tracker-custom-period');
  const count=lifeNode('input','');count.type='number';count.min=1;count.max=90;
  count.value=board.period_count;count.setAttribute('aria-label','Nombre de périodes');
  const unit=lifeNode('select','');unit.setAttribute('aria-label','Unité de la période');
  [['days','Jours'],['weeks','Semaines'],['months','Mois'],['years','Années']].forEach(([value,label])=>{
    const opt=lifeNode('option','',label);opt.value=value;unit.append(opt);
  });
  unit.value=board.period_unit;
  const showCustom=()=>controls.classList.toggle('hidden',preset.value!=='custom');
  preset.addEventListener('change',showCustom);showCustom();
  controls.append(count,unit);
  const submit=lifeNode('button','primary','Enregistrer le rythme');submit.type='submit';
  const cancel=lifeButton('Annuler',()=>wrap.remove());
  wrap.append(lifeNode('span','','Choisis la durée de ce tableau :'),preset,controls,submit,cancel);
  wrap.onsubmit=async event=>{
    event.preventDefault();
    let choice;
    try{choice=lifeBoardPeriodChoice(preset.value,count.value,unit.value)}
    catch(error){showUiError(error,'Rythme du tableau');return}
    if(choice.period_unit===board.period_unit&&choice.period_count===Number(board.period_count)){
      wrap.remove();return;
    }
    const ok=await askUiConfirm('Changer la période de « '+board.title+' »',
      'Les marques déjà enregistrées seront conservées, mais elles peuvent être '
      +'visibles dans l’ancien rythme. Tu pourras toujours revenir au rythme précédent.',
      'Changer le rythme');
    if(!ok)return;
    lifeBoardOffsets[board.id]=0;
    await lifeAction('Modifier le rythme',()=>lifeApi('/api/tracker-boards/'+board.id,
      {method:'PUT',body:JSON.stringify(choice)}));
  };
  section.querySelector('.tracker-board-period')?.after(wrap);
}
function lifeBoardToggleCustom(form){
  const preset=form.elements.period_preset;
  const panel=$('#trackerBoardCustomPeriod');
  panel?.classList.toggle('hidden',preset.value!=='custom');
}
$('#trackerBoardCreateToggle')?.addEventListener('click',()=>{
  const form=$('#trackerBoardCreateForm'),button=$('#trackerBoardCreateToggle');
  const closed=form.classList.toggle('hidden');
  button.setAttribute('aria-expanded',String(!closed));
  button.textContent=closed?'＋ Nouveau tableau':'− Fermer';
  if(!closed)form.elements.title.focus();
});
$('#trackerBoardCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,v=Object.fromEntries(new FormData(form).entries());
  let choice;
  try{choice=lifeBoardPeriodChoice(v.period_preset,v.custom_count,v.custom_unit)}
  catch(error){showUiError(error,'Création du tableau');return}
  // Freeze *all* fields until the create+reload finishes. Otherwise users
  // typing a second board immediately can lose its title to the old form reset.
  const controls=[...form.querySelectorAll('input,select,button')];
  controls.forEach(control=>control.disabled=true);
  try{
    const result=await runUiAction('Créer un tableau',()=>lifeApi('/api/tracker-boards',
      {method:'POST',body:JSON.stringify({title:v.title,color:v.color,...choice})}));
    if(result.ok){
      form.reset();lifeBoardToggleCustom(form);
      await loadLifeTools();
    }
  }finally{controls.forEach(control=>control.disabled=false)}
});
$('#trackerBoardPeriodPreset')?.addEventListener('change',e=>
  lifeBoardToggleCustom(e.currentTarget.form));
$('#trackerMonthPrev')?.addEventListener('click',()=>lifeTrackerChangeMonth(-1));
$('#trackerMonthNext')?.addEventListener('click',()=>lifeTrackerChangeMonth(1));
$('#trackerMonthToday')?.addEventListener('click',()=>{
  lifeBoardMonth=ymd(new Date()).slice(0,7);loadLifeTools();
});
$('#trackerBoardArchivesToggle')?.addEventListener('click',()=>{
  lifeBoardArchivesVisible=!lifeBoardArchivesVisible;renderTrackerBoards();
});

function renderLifeTrackers(){
  const root=$('#trackerList');if(!root)return;root.replaceChildren();
  if(!lifeTrackers.length)root.append(lifeNode('p','muted','Aucun tracker pour le moment. Crée ton premier suivi !'));
  lifeTrackers.forEach(t=>{
    const card=lifeNode('article','life-card');
    const heading=lifeNode('div','life-card-head');
    heading.append(lifeNode('strong','',t.title),lifeButton('Archiver',async()=>{
      if(!confirm('Archiver ce tracker ? Les mesures restent dans la base locale.'))return;
      await lifeAction('Archiver le tracker',()=>lifeApi('/api/trackers/'+t.id,{method:'DELETE'}));
    },'life-danger'));
    const last=t.entries?.[0];
    const summary=lifeNode('p','life-muted',last?'Dernière mesure : '+lifeNumber(last.value)+(t.unit?' '+t.unit:'')+' · '+lifeDate(last.entry_date):'Aucune mesure enregistrée');
    const form=lifeNode('form','life-entry-form');
    form.innerHTML='<label>Date<input name="entry_date" type="date" required></label><label>Valeur<input name="value" type="number" step="any" required></label><label>Note<input name="notes" maxlength="2000" placeholder="Facultatif"></label><button type="submit" class="primary">Enregistrer</button>';
    form.elements.entry_date.value=ymd(new Date());
    form.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form).entries());await lifeAction('Enregistrer la mesure',()=>lifeApi('/api/trackers/'+t.id+'/entries',{method:'PUT',body:JSON.stringify(v)}))};
    const history=lifeNode('div','life-history');
    (t.entries||[]).slice(0,8).forEach(entry=>history.append(lifeNode('span','life-history-item',lifeDate(entry.entry_date)+' · '+lifeNumber(entry.value)+(t.unit?' '+t.unit:''))));
    card.append(heading,summary,form,history);root.append(card);
  });
}
function renderLifeAdmin(){
  const root=$('#adminList');if(!root)return;root.replaceChildren();
  if(!lifeAdmin.length)root.append(lifeNode('p','muted','Aucune démarche enregistrée.'));
  const statusNames={todo:'À faire',waiting:'En attente',done:'Terminée'};
  lifeAdmin.forEach(item=>{
    const card=lifeNode('article','life-card'+(item.status==='done'?' life-complete':''));
    const heading=lifeNode('div','life-card-head');
    heading.append(lifeNode('strong','',item.title),lifeButton('Supprimer',async()=>{
      if(!confirm('Supprimer cette démarche et ses notes ?'))return;
      await lifeAction('Supprimer la démarche',()=>lifeApi('/api/admin/'+item.id,{method:'DELETE'}));
    },'life-danger'));
    const meta=lifeNode('div','life-muted',item.category+' · '+lifeDate(item.due_date));
    const select=lifeNode('select','life-status');
    Object.entries(statusNames).forEach(([value,label])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;select.append(opt)});
    select.value=item.status;
    select.onchange=async()=>{const ok=await lifeAction('Changer le statut',()=>lifeApi('/api/admin/'+item.id,{method:'PUT',body:JSON.stringify({status:select.value})}));if(!ok)select.value=item.status};
    const notes=lifeNode('textarea','life-admin-notes');notes.value=item.notes||'';notes.rows=2;notes.placeholder='Notes, pièces à préparer, contact…';
    const save=lifeButton('Enregistrer les notes',()=>lifeAction('Enregistrer les notes',()=>lifeApi('/api/admin/'+item.id,{method:'PUT',body:JSON.stringify({notes:notes.value})})));
    card.append(heading,meta,select,notes,save);root.append(card);
  });
}
function renderLifeCaptures(){
  const root=$('#captureInbox');if(!root)return;root.replaceChildren();
  const unread=lifeCaptures.filter(x=>!x.seen).length;
  const badge=$('#captureNavBadge');if(badge){badge.textContent=String(unread);badge.classList.toggle('hidden',unread===0)}
  if(!lifeCaptures.length)root.append(lifeNode('p','muted','La boîte est vide. Utilise la capture rapide pour envoyer une idée ici.'));
  lifeCaptures.forEach(item=>{
    const card=lifeNode('article','life-card life-capture'+(!item.seen?' life-unread':''));
    const tag=lifeDestinations.find(d=>d.key===item.destination)?.tag||'#Carnet';
    const head=lifeNode('div','life-card-head');
    head.append(lifeNode('strong','',tag+(item.seen?'':' · Nouveau')),
      lifeButton('Supprimer',async()=>{if(!confirm('Supprimer cette note ?'))return;await lifeAction('Supprimer la note',()=>lifeApi('/api/captures/'+item.id,{method:'DELETE'}))},'life-danger'));
    const content=lifeNode('button','life-capture-body',item.body);
    content.title='Consulter et marquer comme lu';
    content.onclick=async()=>{if(!item.seen)await lifeAction('Marquer comme consulté',()=>lifeApi('/api/captures/'+item.id,{method:'PUT',body:JSON.stringify({seen:true})}));};
    card.append(head,content,lifeNode('small','life-muted',item.created_at.replace('T',' ')));root.append(card);
  });
}
function renderJournalLifePage(){
  const trackers=$('#journalTrackerSummary'),admin=$('#journalAdminSummary'),captures=$('#journalCaptureSummary');
  if(trackers){trackers.replaceChildren();const list=lifeTrackers.slice(0,5);
    if(!list.length)trackers.append(lifeButton('Créer un tracker →',()=>showView('trackers'),'journal-life-link'));
    list.forEach(t=>trackers.append(lifeButton(t.title+' : '+(t.entries?.[0]?lifeNumber(t.entries[0].value)+(t.unit?' '+t.unit:''):'—'),()=>showView('trackers'),'journal-life-link')));
  }
  if(admin){admin.replaceChildren();const list=lifeAdmin.filter(x=>x.status!=='done').slice(0,5);
    if(!list.length)admin.append(lifeButton('Ajouter une démarche →',()=>showView('admin'),'journal-life-link'));
    list.forEach(d=>admin.append(lifeButton(d.title+(d.due_date?' · '+lifeDate(d.due_date):''),()=>showView('admin'),'journal-life-link')));
  }
  if(captures){captures.replaceChildren();const list=lifeCaptures.filter(x=>!x.seen).slice(0,6);
    if(!list.length)captures.append(lifeNode('p','journal-empty','Rien de nouveau.'));
    list.forEach(c=>captures.append(lifeButton((lifeDestinations.find(d=>d.key===c.destination)?.tag||'#Carnet')+' '+c.body.slice(0,48),()=>showView('captures'),'journal-life-link journal-unread')));
  }
}
function lifeSetJournalPage(index){
  lifeJournalPage=Math.max(0,Math.min(1,index));
  const book=$('#journalBook');book?.classList.toggle('journal-page-2',lifeJournalPage===1);
  lifeSetText('#journalPageNumber',lifeJournalPage?'3–4':'1–2');
  $('#journalPrevPage').disabled=lifeJournalPage===0;
  $('#journalNextPage').disabled=lifeJournalPage===1;
}
$('#journalPrevPage')?.addEventListener('click',()=>lifeSetJournalPage(0));
$('#journalNextPage')?.addEventListener('click',()=>lifeSetJournalPage(1));
$('#journalBackToToday')?.addEventListener('click',()=>lifeSetJournalPage(0));
$('#journalQuickCapture')?.addEventListener('click',()=>lifeOpenCapture());
$('#trackerCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  const v=Object.fromEntries(new FormData(form).entries());
  if(await lifeAction('Créer un tracker',()=>lifeApi('/api/trackers',{method:'POST',body:JSON.stringify(v)})))form.reset();
});
$('#adminCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;
  const v=Object.fromEntries(new FormData(form).entries());
  if(await lifeAction('Créer une démarche',()=>lifeApi('/api/admin',{method:'POST',body:JSON.stringify(v)})))form.reset();
});
$('#capturesOpenQuick')?.addEventListener('click',()=>lifeOpenCapture());
function lifeParseCapture(){
  const text=$('#quickCaptureText').value;
  const m=text.match(/^\s*(#[^\s]+)\s*/u);
  const found=m?lifeDestinations.find(d=>d.tag.toLocaleLowerCase('fr-FR')===m[1].toLocaleLowerCase('fr-FR')):null;
  if(found)lifeCaptureChoice=found.key;
  const body=found?text.slice(m[0].length).trim():text.replace(/^\s*#[^\s]+\s*/u,'').trim();
  return {destination:lifeCaptureChoice,body};
}
function lifeSuggestions(){
  const input=$('#quickCaptureText'),root=$('#quickCaptureSuggestions');if(!input||!root)return;
  const text=input.value,match=text.match(/^\s*#([^\s]*)/u);
  root.replaceChildren();
  if(!match){root.classList.add('hidden');return}
  root.classList.remove('hidden');
  const q=match[1].toLocaleLowerCase('fr-FR');
  lifeDestinations.filter(d=>d.tag.slice(1).toLocaleLowerCase('fr-FR').includes(q)).forEach(d=>{
    const button=lifeButton(d.tag+' · '+d.label,()=>{
      lifeCaptureChoice=d.key;
      input.value=d.tag+' '+text.slice(match[0].length).trimStart();
      root.classList.add('hidden');input.focus();
      input.setSelectionRange(input.value.length,input.value.length);
      lifeSetText('#quickCaptureDestination','Destination : '+d.label);
    },'quick-capture-suggestion');
    button.setAttribute('role','option');root.append(button);
  });
}
function lifeOpenCapture(){
  const overlay=$('#quickCaptureOverlay');overlay.classList.remove('hidden');
  lifeCaptureChoice='carnet';lifeSetText('#quickCaptureDestination','Destination : Carnet / boîte de réception');
  $('#quickCaptureText').value='';$('#quickCaptureSuggestions').classList.add('hidden');
  $('#quickCaptureText').focus();
}
function lifeCloseCapture(){$('#quickCaptureOverlay').classList.add('hidden')}
$('#quickCaptureClose')?.addEventListener('click',lifeCloseCapture);
$('#quickCaptureOverlay')?.addEventListener('click',e=>{if(e.target.id==='quickCaptureOverlay')lifeCloseCapture()});
$('#quickCaptureText')?.addEventListener('input',()=>{
  lifeSuggestions();const value=lifeParseCapture();
  const dest=lifeDestinations.find(d=>d.key===value.destination);
  lifeSetText('#quickCaptureDestination','Destination : '+(dest?.label||'Carnet'));
});
$('#quickCaptureSend')?.addEventListener('click',async()=>{
  const {destination,body}=lifeParseCapture();
  if(!body){$('#quickCaptureText').focus();return}
  const btn=$('#quickCaptureSend');btn.disabled=true;
  try{
    // Le carnet est une boîte de réception : ne pas prétendre écrire dans
    // un carnet de la bibliothèque sans avoir choisi le carnet précis.
    if(destination==='taches'){
      await lifeApi('/api/tasks',{method:'POST',body:JSON.stringify({title:body.slice(0,120),notes:body.slice(120)})});
    }else if(destination==='postit'){
      await lifeApi('/api/postits',{method:'POST',body:JSON.stringify({title:'Capture rapide',body,color:'gold',shape:'rounded'})});
    }else if(destination==='administratif'){
      await lifeApi('/api/admin',{method:'POST',body:JSON.stringify({title:body.slice(0,180),notes:body.slice(180)})});
    }else{
      await lifeApi('/api/captures',{method:'POST',body:JSON.stringify({destination,body})});
    }
    lifeCloseCapture();await loadLifeTools();await refresh();
    const toast=lifeNode('div','toast');
    toast.append(lifeNode('strong','','✓ Idée rangée'),lifeNode('div','task-meta',
      destination==='carnet'?'Ta note attend dans la boîte de réception #Carnet.':'Destination : '+(lifeDestinations.find(d=>d.key===destination)?.tag||destination)));
    $('#toastArea').append(toast);setTimeout(()=>toast.remove(),4500);
  }catch(err){showUiError(err,'Impossible de ranger la note')}
  finally{btn.disabled=false}
});
function lifeShortcut(){return localStorage.getItem('atelierQuickCaptureShortcut')||'Ctrl+Shift+Space'}
function lifeShortcutFromEvent(e){
  const mods=[e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null].filter(Boolean);
  const key=e.code==='Space'?'Space':e.code.startsWith('Key')?e.code.slice(3):e.code.startsWith('Digit')?e.code.slice(5):e.key.length===1?e.key.toUpperCase():e.key;
  return [...mods,key].join('+');
}
$('#settingsQuickCaptureShortcut')?.addEventListener('keydown',async e=>{
  e.preventDefault();e.stopPropagation();
  if(e.key==='Escape'){e.currentTarget.blur();return}
  if(!e.ctrlKey&&!e.altKey&&!e.metaKey)return;
  if(['Control','Alt','Shift','Meta'].includes(e.key))return;
  const combination=lifeShortcutFromEvent(e),previous=lifeShortcut();
  const field=e.currentTarget;
  try{
    await lifeApi('/api/quick-capture/hotkey',{method:'POST',body:JSON.stringify({shortcut:combination})});
    localStorage.setItem('atelierQuickCaptureShortcut',combination);
    field.value=combination;field.blur();
    lifeSetText('#settingsGlobalShortcutStatus','Raccourci enregistré.');
  }catch(err){
    field.value=previous;
    showUiError(err,'Raccourci non enregistré');
  }
});
$('#settingsQuickCaptureOpen')?.addEventListener('click',lifeOpenCapture);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('#quickCaptureOverlay').classList.contains('hidden')){e.preventDefault();lifeCloseCapture();return}
  if(!$('#quickCaptureOverlay').classList.contains('hidden')&&e.ctrlKey&&e.key==='Enter'){e.preventDefault();$('#quickCaptureSend').click();return}
  if(e.target?.id==='settingsQuickCaptureShortcut')return;
  if(lifeShortcutFromEvent(e)===lifeShortcut()){e.preventDefault();lifeOpenCapture()}
});
function lifeSoundEnabled(){return localStorage.getItem('atelierReminderSound')==='1'}
function lifeReminderChime(force=false){
  if(!force&&!lifeSoundEnabled())return;
  try{
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return;
    if(!lifeAudioContext)lifeAudioContext=new AudioContext();
    if(lifeAudioContext.state==='suspended')lifeAudioContext.resume().catch(()=>{});
    const now=lifeAudioContext.currentTime;
    [660,880].forEach((freq,i)=>{
      const oscillator=lifeAudioContext.createOscillator();
      const gain=lifeAudioContext.createGain();
      oscillator.type='sine';oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(.0001,now+i*.14);
      gain.gain.exponentialRampToValueAtTime(.12,now+i*.14+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,now+i*.14+.24);
      oscillator.connect(gain);gain.connect(lifeAudioContext.destination);
      oscillator.start(now+i*.14);oscillator.stop(now+i*.14+.25);
    });
  }catch(err){console.warn('[Atelier] Son de rappel indisponible',err)}
}
$('#settingsReminderSound')?.addEventListener('change',e=>{
  localStorage.setItem('atelierReminderSound',e.target.checked?'1':'0');
  if(e.target.checked)lifeReminderChime(true);
});
$('#settingsTestReminderSound')?.addEventListener('click',()=>lifeReminderChime(true));
function lifeRenderSettings(){
  const sound=$('#settingsReminderSound'),shortcut=$('#settingsQuickCaptureShortcut');
  if(sound)sound.checked=lifeSoundEnabled();
  if(shortcut)shortcut.value=lifeShortcut();
}
lifeSetJournalPage(0);
lifeRenderSettings();
lifeApi('/api/quick-capture/hotkey').then(result=>{
  if(result?.shortcut){
    localStorage.setItem('atelierQuickCaptureShortcut',result.shortcut);
    lifeRenderSettings();
  }
}).catch(err=>console.warn('[Atelier] Raccourci natif indisponible',err));
loadLifeTools();
