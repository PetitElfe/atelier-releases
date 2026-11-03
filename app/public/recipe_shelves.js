/* Recipe volumes, reversible archives and readable source links. */
(()=>{'use strict';
 const list=document.querySelector('#recipeLibraryList'),shelf=document.querySelector('#recipeBookShelf');if(!list||!shelf)return;
 let archived=false,archives=[],loading=false,archiveRequest=0,sort='title';
 const collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'}),pref='atelier-recipe-shelves-v1';
 try{const p=JSON.parse(localStorage.getItem(pref)||'{}');sort=['title','recent','shelf'].includes(p.sort)?p.sort:'title';recipeBookFilter=p.book||'all';recipeSearchQuery=typeof p.search==='string'?p.search.slice(0,200):''}catch(_){}
 const persist=()=>{try{localStorage.setItem(pref,JSON.stringify({sort,book:recipeBookFilter,search:recipeSearchQuery}))}catch(_){}};
 const toolbar=document.createElement('div');toolbar.className='recipe-shelf-toolbar';
 toolbar.innerHTML='<span id="recipeResultCount" role="status" aria-live="polite"></span><label>Trier <select id="recipeShelfSort"><option value="title">Titre A → Z</option><option value="recent">Modifiées récemment</option><option value="shelf">Rayon, puis titre</option></select></label><button id="recipeClearSearch" type="button">Effacer les filtres</button><button id="recipeShowArchived" type="button" aria-pressed="false">Recettes archivées</button>';
 list.before(toolbar);
 const $=id=>document.getElementById(id);
 async function reloadArchives(){const ticket=++archiveRequest;loading=true;renderCuisineLibrary();try{const result=await api('/api/recipes?archived=1');if(ticket===archiveRequest)archives=result}catch(e){showUiMessage('Archives indisponibles',e.message||'Réessaie dans un instant.')}finally{if(ticket===archiveRequest){loading=false;renderCuisineLibrary()}}}
 $('recipeShowArchived').onclick=()=>{if(loading)return;archived=!archived;if(archived)reloadArchives();else renderCuisineLibrary()};
 $('recipeShelfSort').onchange=e=>{sort=e.target.value;persist();renderCuisineLibrary()};
 $('recipeClearSearch').onclick=()=>{recipeSearchQuery='';recipeBookFilter='all';persist();renderCuisineLibrary();$('recipeSearch').focus()};
 renderCuisineLibrary=function(){
   const search=$('recipeSearch');search.value=recipeSearchQuery;search.oninput=e=>{recipeSearchQuery=e.target.value.slice(0,200);persist();renderCuisineLibrary()};
   $('recipeShelfSort').value=sort;$('recipeShowArchived').textContent=archived?'Revenir aux recettes':'Recettes archivées';$('recipeShowArchived').setAttribute('aria-pressed',String(archived));$('recipeShowArchived').disabled=loading;
   const source=archived?archives:state.recipes;
   if(recipeBookFilter!=='all'&&state.recipeBooks.length&&!state.recipeBooks.some(x=>String(x.id)===String(recipeBookFilter)))recipeBookFilter='all';
   const makeFilter=(id,name,count)=>{const button=document.createElement('button');button.type='button';button.className='recipe-book-button'+(String(id)===String(recipeBookFilter)?' active':'');button.setAttribute('aria-pressed',String(String(id)===String(recipeBookFilter)));button.innerHTML='<span>'+esc(name)+'</span><small>'+count+'</small>';button.onclick=()=>{recipeBookFilter=id;persist();renderCuisineLibrary()};return button};
   shelf.replaceChildren();shelf.append(makeFilter('all','Tous les rayons',source.length));
   for(const book of state.recipeBooks){const row=document.createElement('div');row.className='recipe-book-row';row.append(makeFilter(book.id,book.name,source.filter(x=>Number(x.book_id)===Number(book.id)).length));if(String(book.name).toLowerCase()!=='à classer'){
     const actions=document.createElement('div');actions.className='recipe-book-actions';actions.innerHTML='<button class="rename" type="button">Renommer</button><button class="delete" type="button">Supprimer</button>';actions.querySelector('.rename').setAttribute('aria-label','Renommer le rayon '+book.name);actions.querySelector('.delete').setAttribute('aria-label','Supprimer le rayon '+book.name);actions.querySelector('.rename').onclick=()=>openRenameRecipeBookModal(book);actions.querySelector('.delete').onclick=async()=>{await deleteRecipeBook(book);if(archived)await reloadArchives()};row.append(actions)}shelf.append(row)}
   const q=normalizeRecipeSearch(recipeSearchQuery),rows=source.filter(item=>(recipeBookFilter==='all'||String(item.book_id)===String(recipeBookFilter))&&(!q||normalizeRecipeSearch([item.title,item.book_name,item.notes,...parseRecipeIngredients(item).map(x=>x.name)].join(' ')).includes(q)));
   rows.sort((a,b)=>(sort==='recent'?String(b.updated_at||'').localeCompare(String(a.updated_at||'')):sort==='shelf'?collator.compare(a.book_name||'',b.book_name||''):0)||collator.compare(a.title,b.title)||a.id-b.id);
   $('recipeResultCount').textContent=loading?'Chargement des archives…':rows.length+' recette'+(rows.length>1?'s':'')+(archived?' archivée'+(rows.length>1?'s':''):'');
   $('recipeClearSearch').hidden=!q&&recipeBookFilter==='all';list.classList.toggle('recipes-archived',archived);list.replaceChildren();
   if(loading)return;
   if(!rows.length){const empty=document.createElement('div');empty.className='library-empty';empty.innerHTML=archived?'Aucune recette archivée dans cette sélection.':!state.recipes.length?'<strong>Ta bibliothèque attend ses premières recettes.</strong><p>Chaque recette prendra la forme d’un livre sur une étagère.</p><button id="createBlankRecipe" class="primary" type="button">Créer ma première recette</button>':'Aucune recette ne correspond à tes filtres.';list.append(empty);$('createBlankRecipe')?.addEventListener('click',()=>openRecipeModal());return}
   const selected=new Set(state.mealIdeas.map(x=>Number(x.id)));
   for(const item of rows){const card=document.createElement('article');card.className='recipe-library-card recipe-volume';card.dataset.recipeId=String(item.id);card.style.setProperty('--recipe-ink',['#73876a','#8c6f8f','#8e684c','#667d91','#9b7b45','#627e75'][Number(item.id)%6]);card.style.setProperty('--recipe-book-height',(244+Number(item.id)%4*10)+'px');
     card.innerHTML='<button class="recipe-library-title" type="button" id="recipeSpine'+Number(item.id)+'"><span class="recipe-spine-rule" aria-hidden="true"></span><span class="recipe-spine-name">'+esc(item.title)+'</span><span class="recipe-spine-foot" aria-hidden="true">'+esc(String(item.base_servings||1))+' pers.</span></button><div class="recipe-library-meta">'+esc(item.book_name||'À classer')+'</div><details class="recipe-volume-menu"><summary>Options</summary><div class="recipe-library-actions">'+(archived?'<button class="restore" type="button">Restaurer</button>':'<button class="idea" type="button" '+(selected.has(Number(item.id))?'disabled':'')+'>'+(selected.has(Number(item.id))?'Dans les idées de repas':'Ajouter aux idées de repas')+'</button><button class="edit" type="button">Modifier</button><button class="archive" type="button">Archiver</button>')+'</div></details>';
     const title=card.querySelector('.recipe-library-title');title.title=item.title+(item.notes?' — '+item.notes:'');title.setAttribute('aria-label','Ouvrir la recette '+item.title);title.onclick=()=>openRecipePage(item);
     const details=card.querySelector('details');details.addEventListener('toggle',()=>{if(details.open)for(const other of list.querySelectorAll('details[open]'))if(other!==details)other.open=false});
     if(archived){const restore=card.querySelector('.restore');restore.onclick=async()=>{restore.disabled=true;const result=await runUiAction('Impossible de restaurer la recette',()=>api('/api/recipes/'+item.id,{method:'PUT',body:JSON.stringify({archived:false})}));if(result.ok){await refresh();await reloadArchives()}else restore.disabled=false}}
     else{card.querySelector('.edit').onclick=()=>openRecipeModal(item);card.querySelector('.idea').onclick=async e=>{e.currentTarget.disabled=true;if(!await addRecipeToMealIdeas(item.id))renderCuisineLibrary()};card.querySelector('.archive').onclick=async()=>{if(!await askUiConfirm('Archiver la recette','Archiver « '+item.title+' » ? Tu pourras la retrouver et la restaurer dans Recettes archivées.','Archiver',true))return;const result=await runUiAction('Impossible d’archiver la recette',()=>api('/api/recipes/'+item.id,{method:'PUT',body:JSON.stringify({archived:true})}));if(result.ok)await refresh()}}
     list.append(card);
   }
 };
 // Block executable/unusable source URLs in old imported recipes as well.
 const basePage=renderRecipePage;renderRecipePage=function(item){basePage(item);
   const ingredients=parseRecipeIngredients(item),factor=recipeTargetServings/Math.max(1,Number(item.base_servings)||1);
   document.querySelectorAll('#recipeIngredientsList .recipe-ingredient-row').forEach((row,index)=>{
     const ing=ingredients[index],name=String(ing?.name||'').trim();if(!name)return;
     const quantity=[formatScaledQuantity(ing.quantity,factor),ing.unit].filter(Boolean).join(' '),button=document.createElement('button');button.type='button';button.className='recipe-shopping-add';button.textContent='+ Courses';button.setAttribute('aria-label','Ajouter '+name+' aux courses');
     const exists=()=>state.shopping.some(x=>normalizeRecipeSearch(x.name)===normalizeRecipeSearch(name)&&String(x.quantity||'').trim()===quantity.trim());
     if(exists()){button.disabled=true;button.textContent='Dans les courses'}
     button.onclick=async()=>{if(button.disabled)return;button.disabled=true;const result=await runUiAction('Impossible d’ajouter cet ingrédient',()=>api('/api/shopping',{method:'POST',body:JSON.stringify({name,quantity,purchase_count:1})}));if(result.ok){button.textContent='Dans les courses';await refresh()}else button.disabled=false};row.append(button);
   });
   const a=$('recipeSourceLink');try{const u=new URL(item?.source_url||'');if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer'}catch(_){a.removeAttribute('href');a.classList.add('hidden')}};
 const baseOpen=openRecipePage;openRecipePage=function(item){baseOpen(item);$('editRecipePage').disabled=!!item?.archived;$('editRecipePage').title=item?.archived?'Restaure cette recette pour la modifier.':'Modifier la recette'};
 renderCuisineLibrary();
})();
