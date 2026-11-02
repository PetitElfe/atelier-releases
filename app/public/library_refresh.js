/* Windows TEST — real notebooks on a shelf, preserving all existing IDs/content. */
(function(){
  const rememberKey=id=>'atelier-library-last-page-v1-'+Number(id);
  const baseContent=renderLibraryNotebookContent;
  renderLibraryNotebookContent=function(domain){
    baseContent(domain);
    if(librarySelectedNotebookId&&librarySelectedPageId){
      try{localStorage.setItem(rememberKey(librarySelectedNotebookId),String(librarySelectedPageId))}catch(_){}
    }
  };
  let navigating=false;
  async function openNotebook(id){
    if(navigating)return;
    navigating=true;
    try{
      if(await flushLibraryAutosave()===false)return;
      const notebook=libraryNotebookById(id);if(!notebook)return;
      let remembered;try{remembered=Number(localStorage.getItem(rememberKey(id)))}catch(_){}
      const entries=notebook.entries||[];
      libraryLeaveExpanded();librarySelectedNotebookId=Number(id);
      librarySelectedPageId=entries.find(p=>Number(p.id)===remembered)?.id||entries.at(-1)?.id||null;
      libraryEditorMode='write';libraryPageDirty=false;renderLibraryDomain();
    }finally{navigating=false}
  }
  const baseDomain=renderLibraryDomain;
  renderLibraryDomain=function(){
    baseDomain();
    const domain=objectiveNodeById(librarySelectedDomainId);if(!domain)return;
    // Replace the old shortcuts' handlers too: each path waits for saving.
    document.querySelectorAll('#libraryDomainQuickContext [data-notebook-id]').forEach(button=>{
      button.onclick=()=>openNotebook(Number(button.dataset.notebookId));
    });
    const rows=document.querySelectorAll('#libraryNotebookList .library-notebook-row');
    rows.forEach((row,index)=>{
      const book=libraryNotebookState.sections[index];if(!book)return;
      row.querySelector('.library-notebook-link').onclick=()=>openNotebook(book.id);
    });
    const overview=document.querySelector('#libraryNotebookList .library-overview-link');
    if(overview)overview.onclick=async()=>{
      if(await flushLibraryAutosave()===false)return;
      libraryLeaveExpanded();librarySelectedNotebookId=null;librarySelectedPageId=null;renderLibraryDomain();
    };
    const root=document.getElementById('libraryOverviewPanel');if(!root)return;
    let shelf=document.getElementById('libraryRealShelf');
    if(!shelf){shelf=document.createElement('section');shelf.id='libraryRealShelf';shelf.className='library-real-shelf';root.prepend(shelf)}
    shelf.replaceChildren();
    const title=document.createElement('h3');title.textContent='Mes carnets';shelf.append(title);
    const books=document.createElement('div');books.className='library-shelf-books';shelf.append(books);
    if(libraryNotebookState.loading){books.textContent='Chargement des carnets…';return}
    (libraryNotebookState.sections||[]).forEach((notebook,index)=>{
      const book=document.createElement('button');book.type='button';book.className='library-shelf-book';
      book.dataset.notebookId=String(notebook.id);book.style.setProperty('--book-color',['#78977d','#aa91be','#c39b69','#8faac4','#b9756b'][index%5]);
      const label=document.createElement('strong');label.textContent=notebook.title;
      const count=document.createElement('small');const n=(notebook.entries||[]).length;count.textContent=n+' page'+(n>1?'s':'');
      book.append(label,count);book.title='Ouvrir le carnet '+notebook.title;book.onclick=()=>openNotebook(notebook.id);books.append(book);
    });
    const add=document.createElement('button');add.type='button';add.className='library-shelf-book library-shelf-add';
    add.textContent='＋ Nouveau carnet';add.onclick=()=>document.getElementById('addLibraryNotebook').click();books.append(add);
  };
})();
