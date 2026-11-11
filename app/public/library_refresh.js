/* Domain workspace: compact shelf + route above a moodboard or a full notebook. */
(function(){
  const views=new Map();
  const colors=['#78977d','#aa91be','#c39b69','#8faac4','#b9756b'];
  const baseContent=renderLibraryNotebookContent;
  renderLibraryNotebookContent=function(domain){
    baseContent(domain);
    if(librarySelectedNotebookId&&librarySelectedPageId){
      try{localStorage.setItem('atelier-library-last-page-v1-'+Number(librarySelectedNotebookId),String(librarySelectedPageId))}catch(_){}
    }
  };
  let navigating=false;
  async function navigate(view,notebookId=null){
    if(navigating)return;
    navigating=true;
    try{
      if(await flushLibraryAutosave()===false)return;
      const domainId=Number(librarySelectedDomainId);if(!domainId)return;
      libraryLeaveExpanded();
      if(notebookId!==null){
        const book=libraryNotebookById(notebookId);if(!book)return;
        let remembered;try{remembered=Number(localStorage.getItem('atelier-library-last-page-v1-'+Number(notebookId)))}catch(_){}
        librarySelectedNotebookId=Number(notebookId);
        librarySelectedPageId=(book.entries||[]).find(p=>Number(p.id)===remembered)?.id||book.entries?.at(-1)?.id||null;
      }else{librarySelectedNotebookId=null;librarySelectedPageId=null;views.set(domainId,view)}
      libraryEditorMode='write';libraryPageDirty=false;renderLibraryDomain();
    }finally{navigating=false}
  }
  const oldOpen=openLibraryDomain;
  openLibraryDomain=function(id){views.set(Number(id),'home');return oldOpen(id)};
  const oldClose=closeLibraryDomain;
  closeLibraryDomain=function(){oldClose();if(!librarySelectedDomainId&&state.view==='library')$('#pageTitle').textContent='Bibliothèque'};
  const baseDomain=renderLibraryDomain;
  renderLibraryDomain=function(){
    baseDomain();
    const domain=objectiveNodeById(librarySelectedDomainId);if(!domain)return;
    if(state.view==='library')$('#pageTitle').textContent=domain.title;
    const panel=$('#libraryDomainPanel');panel.classList.add('library-compact-domain');
    const view=librarySelectedNotebookId?'notebook':views.get(Number(domain.id))||'home';
    const quick=$('#libraryDomainQuickContext');
    quick.replaceChildren();
    const home=document.createElement('button');home.type='button';home.id='libraryQuickProgress';home.dataset.domainView='home';
    home.className='domain-home-button'+(view==='home'?' active':'');home.title='Accueil du domaine · moodboard';home.setAttribute('aria-label','Accueil du domaine');
    home.innerHTML='<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    home.onclick=()=>navigate('home');quick.append(home);
    const shelf=document.createElement('div');shelf.id='libraryRealShelf';shelf.className='library-real-shelf domain-compact-shelf';shelf.setAttribute('aria-label','Carnets du domaine');
    const books=document.createElement('div');books.className='library-head-books library-shelf-books';shelf.append(books);
    if(libraryNotebookState.loading){const loading=document.createElement('span');loading.className='muted';loading.textContent='Chargement…';books.append(loading)}
    (libraryNotebookState.sections||[]).forEach((book,index)=>{
      const button=document.createElement('button');button.type='button';button.dataset.notebookId=String(book.id);
      button.className='library-head-book library-shelf-book domain-book-spine atelier-book'+(Number(librarySelectedNotebookId)===Number(book.id)?' active':'');
      button.style.setProperty('--leather',['#4b5946','#66506c','#805e3d','#3e596a','#7b4a42'][index%5]);button.style.setProperty('--book-color',colors[index%colors.length]);const title=document.createElement('span');title.className='atelier-spine-title';title.textContent=book.title;button.append(title);
      button.title=book.title+' · '+(book.entries||[]).length+' page(s)';button.setAttribute('aria-label','Ouvrir le carnet '+book.title);
      button.onclick=()=>navigate('notebook',book.id);books.append(button);
    });
    const add=document.createElement('button');add.type='button';add.id='libraryQuickAddNotebook';add.className='library-head-book library-shelf-book domain-book-spine library-shelf-add';add.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="2"/></svg>';add.title='Nouveau carnet';add.setAttribute('aria-label','Créer un carnet');add.onclick=()=>$('#addLibraryNotebook').click();books.append(add);quick.append(shelf);
    const route=document.createElement('button');route.type='button';route.dataset.domainView='map';route.className='domain-route-button'+(view==='map'?' active':'');route.title='Objectif & parcours';route.setAttribute('aria-label','Ouvrir le parcours');
    route.innerHTML='<svg viewBox="0 0 110 50" width="94" height="43" aria-hidden="true"><path d="M9 39C20 8 39 48 53 24S79 5 100 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 3"/><circle cx="9" cy="39" r="4" fill="#c39b69"/><circle cx="53" cy="24" r="4" fill="#aa91be"/><path d="M97 20V5l11 4-11 5" fill="#78977d" stroke="currentColor"/></svg><span>Parcours</span>';
    route.querySelector('span').textContent='Parcours · '+libraryProgressForDomain(domain)+' %';
    route.onclick=()=>navigate('map');quick.append(route);
    const mainGoal=objectiveChildren(domain.id).find(n=>n.node_type==='objective');
    const goal=document.createElement('span');goal.className='domain-current-goal';goal.textContent=mainGoal?mainGoal.title:'Sans objectif';quick.append(goal);
    const menu=document.createElement('button');menu.type='button';menu.className='domain-menu-button';menu.textContent='⋯';menu.title='Options du domaine';menu.setAttribute('aria-label','Options du domaine');
    menu.onclick=event=>showAtelierContextMenu(event,[
      {label:'Tous les domaines',run:async()=>{if(await flushLibraryAutosave()!==false)closeLibraryDomain()}},
      {label:'Configurer le domaine',run:()=>$('#libraryDomainConfigure').click()},
      {label:'Supprimer le domaine',run:()=>$('#libraryDomainDelete').click()}
    ]);quick.append(menu);
    document.querySelectorAll('#libraryNotebookList .library-notebook-row').forEach((row,index)=>{
      const book=libraryNotebookState.sections[index];if(book)row.querySelector('.library-notebook-link').onclick=()=>navigate('notebook',book.id);
    });
    const overview=$('#libraryOverviewPanel');overview.classList.toggle('hidden',view!=='map');
    $('#libraryNotebookPanel').classList.toggle('hidden',view!=='notebook');
    let mood=$('#libraryMoodboardPanel');if(!mood){mood=document.createElement('section');mood.id='libraryMoodboardPanel';$('#libraryDomainMain').prepend(mood)}
    mood.classList.toggle('hidden',view!=='home');
    if(view==='home'&&window.libraryMoodboard)window.libraryMoodboard.mount(Number(domain.id),mood);
  };
  const shelfCache=new Map();
  const oldDomainRender=renderLibraryDomain;
  renderLibraryDomain=function(...args){const result=oldDomainRender.apply(this,args);if(!libraryNotebookState.loading&&libraryNotebookState.domainId)shelfCache.set(Number(libraryNotebookState.domainId),libraryNotebookState.sections||[]);return result};
  const oldHubRender=renderLibrary;
  renderLibrary=function(...args){const result=oldHubRender.apply(this,args);const roots=libraryRootDomains();document.querySelectorAll('#libraryDomainShelf .library-domain-card').forEach((card,index)=>{
    const domain=roots[index];if(!domain)return;const row=document.createElement('div');row.className='library-domain-volumes';row.setAttribute('aria-label','Carnets de '+domain.title);card.append(row);
    const draw=books=>{if(!row.isConnected)return;row.replaceChildren();if(!books.length){const empty=document.createElement('span');empty.className='muted';empty.textContent='Aucun carnet pour le moment';row.append(empty)}books.forEach((book,i)=>{const b=document.createElement('button');b.type='button';b.className='atelier-book';b.style.setProperty('--leather',['#4b5946','#66506c','#805e3d','#3e596a','#7b4a42'][i%5]);b.style.setProperty('--spine-height',(155+i%4*12)+'px');const title=document.createElement('span');title.className='atelier-spine-title';title.textContent=book.title;b.append(title);b.title=book.title;b.setAttribute('aria-label','Ouvrir le carnet '+book.title);b.onclick=async()=>{try{openLibraryDomain(domain.id);await loadLibraryNotebooks(domain.id,book.id);await navigate('notebook',book.id)}catch(e){showUiError(e,'Carnet inaccessible')}};row.append(b)})};
    if(shelfCache.has(Number(domain.id)))draw(shelfCache.get(Number(domain.id)));
    else{row.textContent='Chargement des carnets…';api('/api/objective-library?node_id='+Number(domain.id)).then(data=>{shelfCache.set(Number(domain.id),data.sections||[]);draw(data.sections||[])}).catch(()=>{row.textContent='Carnets indisponibles : ouvre le domaine pour réessayer.'})}
  });return result};
})();
