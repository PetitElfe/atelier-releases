/* ALPHA TEST — saisie directe et navigation des formulaires sans soumission involontaire. */
(()=>{
  const modal=document.getElementById('modalBackdrop');
  if(modal){
    new MutationObserver(()=>{
      if(modal.classList.contains('hidden'))return;
      requestAnimationFrame(()=>{
        const field=modal.querySelector('#modalBody input:not([type=hidden]):not([type=checkbox]):not([type=file]), #modalBody textarea');
        if(field&&!field.disabled&&field.getClientRects().length)field.focus({preventScroll:true});
      });
    }).observe(modal,{attributes:true,attributeFilter:['class']});
  }
  document.addEventListener('toggle',event=>{
    const details=event.target;
    if(details?.matches?.('.life-admin-edit-details')&&details.open){
      const input=details.querySelector('input:not([type=hidden])');
      requestAnimationFrame(()=>input?.focus({preventScroll:true}));
    }
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    const field=event.target;
    if(!(field instanceof HTMLInputElement)||field.type==='submit'||field.type==='button'||
      field.type==='checkbox'||field.type==='radio'||field.type==='file'||field.type==='search')return;
    const form=field.closest('form');
    if(!form||!form.matches('#eventForm,#taskForm,#reminderForm,#adminCreateForm,.life-admin-edit-form,.tracker-add-row,.tracker-setup-form,#trackerBoardCreateForm,#trackerCreateForm'))return;
    const fields=[...form.querySelectorAll('input,select,textarea')].filter(item=>
      !item.disabled&&!item.readOnly&&item.type!=='hidden'&&item.type!=='checkbox'&&
      item.type!=='radio'&&item.type!=='file'&&item.getClientRects().length);
    const pos=fields.indexOf(field);
    if(pos<0)return;
    event.preventDefault();
    const next=fields[pos+1];
    if(next)next.focus();
  });
})();
