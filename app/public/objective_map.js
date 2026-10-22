/* ALPHA 0.18 — progressive objective map; existing tree is preserved. */
(function(){
  let activeDomain=null, graph=null, scale=1, panX=0, panY=0, selected=null, mode='map', isRendering=false, requestVersion=0;
  const $map=()=>document.getElementById('objectiveMapRoot');
  const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const typeLabel={domain:'Domaine',objective:'Objectif',milestone:'Étape',step:'Étape',subobjective:'Sous-objectif'};
  const position=(node,index)=>{
    if(node.x!==null && node.y!==null)return {x:Number(node.x),y:Number(node.y)};
    return {x:100+(index%4)*210,y:100+Math.floor(index/4)*140};
  };
  const call=async(path,opts)=>{
    if(typeof api!=='function')throw new Error('API indisponible');
    return api(path,opts);
  };
  async function refreshMap(domainId){
    if(!domainId || !document.getElementById('objectiveMapRoot'))return;
    activeDomain=Number(domainId);
    const version=++requestVersion;
    try{
      const incoming=await call('/api/objective-map?domain_id='+encodeURIComponent(domainId));
      if(activeDomain!==Number(domainId)||version!==requestVersion)return;
      graph=incoming;draw();
    }catch(err){if(version!==requestVersion)return;const root=$map();if(root)root.innerHTML='<p class="muted">Carte indisponible : '+escapeText(err.message)+'</p>'}
  }
  function showMapError(message){
    const root=$map();if(!root)return;
    const old=root.querySelector('.objective-map-error');if(old)old.remove();
    const notice=document.createElement('div');notice.className='objective-map-error';notice.setAttribute('role','alert');
    const label=document.createElement('span');label.textContent=message;
    const close=document.createElement('button');close.type='button';close.textContent='Fermer';close.onclick=()=>notice.remove();
    notice.append(label,close);root.prepend(notice);
  }
  function draw(){
    const root=$map(); if(!root||!graph||isRendering)return;
    isRendering=true;
    const nodes=graph.nodes||[], coords=new Map(nodes.map((n,i)=>[Number(n.id),position(n,i)]));
        const allNodes=nodes.map(n=>{
      const p=coords.get(Number(n.id)),status=n.status==='done'?' done':'';
      return '<button type="button" class="objective-map-node'+status+(selected===Number(n.id)?' selected':'')+'" data-node="'+n.id+'" style="left:'+p.x+'px;top:'+p.y+'px"><small>'+escapeText(typeLabel[n.node_type]||'Étape')+'</small><strong>'+escapeText(n.title)+'</strong><span class="objective-map-handle" data-connect="'+n.id+'" title="Tirer vers une autre étape pour relier"></span></button>';
    }).join('');
    const edges=(graph.edges||[]).map(e=>{
      const a=coords.get(Number(e.from_id)),b=coords.get(Number(e.to_id));if(!a||!b)return '';
      return '<path class="objective-map-edge" data-from="'+e.from_id+'" data-to="'+e.to_id+'" d="M'+(a.x+76)+' '+(a.y+25)+' L'+(b.x+76)+' '+(b.y+25)+'" stroke="#829b78" stroke-width="3" fill="none" marker-end="url(#objective-arrow)"/>';
    }).join('');
    const opts=nodes.map(n=>'<option value="'+n.id+'">'+escapeText(n.title)+'</option>').join('');
    root.innerHTML='<div class="objective-map-toolbar"><button type="button" data-action="toggle">'+(mode==='map'?'Voir la liste':'Voir la carte')+'</button><button type="button" data-action="zoomout" aria-label="Dézoomer">−</button><span>'+Math.round(scale*100)+' %</span><button type="button" data-action="zoomin" aria-label="Zoomer">+</button><button type="button" data-action="reset">Recentrer</button><label>Ordre <select data-action="ordering"><option value="free" '+(graph.ordering==='free'?'selected':'')+'>Libre</option><option value="sequential" '+(graph.ordering==='sequential'?'selected':'')+'>Dans l’ordre</option></select></label></div>'+
       (mode==='map'?'<div class="objective-map-viewport" tabindex="0" aria-label="Carte des objectifs, déplaçable"><div class="objective-map-canvas" style="transform:translate('+panX+'px,'+panY+'px) scale('+scale+')"><svg class="objective-map-lines" width="2600" height="2400" viewBox="0 0 2600 2400" aria-hidden="true"><defs><marker id="objective-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#B39870"/></marker></defs>'+edges+'</svg>'+allNodes+'</div></div>':'<p class="muted">La liste originale est conservée sous la carte.</p>')+
       '<div class="objective-map-edit"><strong>Relier deux étapes</strong><select data-action="from" aria-label="Départ">'+opts+'</select><span>→</span><select data-action="to" aria-label="Arrivée">'+opts+'</select><button type="button" data-action="link">Relier</button><button type="button" data-action="unlink">Supprimer le lien</button></div>'+
       '<p class="muted">Glisse les cartes pour les déplacer, ou le fond pour naviguer. Clique sur une étape pour régler sa validation.</p>'+
       '<div class="objective-map-inspector" id="objectiveMapInspector"></div>';
    root.querySelector('[data-action="toggle"]').onclick=()=>{mode=mode==='map'?'list':'map';draw()};
    for(const action of ['zoomin','zoomout','reset']){
      root.querySelector('[data-action="'+action+'"]').onclick=()=>{
        if(action==='reset'){scale=1;panX=0;panY=0}else scale=Math.max(.4,Math.min(2.2,scale+(action==='zoomin'?.2:-.2)));
        draw();
      };
    }
    root.querySelector('[data-action="ordering"]').onchange=async e=>{
      try{await call('/api/objective-map/settings',{method:'PUT',body:JSON.stringify({domain_id:activeDomain,ordering:e.target.value})});graph.ordering=e.target.value}
      catch(err){showMapError('Ordre non enregistré : '+err.message)}
    };
    root.querySelector('[data-action="link"]').onclick=async()=>{
      const from_id=Number(root.querySelector('[data-action="from"]').value),to_id=Number(root.querySelector('[data-action="to"]').value);
      try{await call('/api/objective-map/edges',{method:'POST',body:JSON.stringify({from_id,to_id})});graph.edges=graph.edges||[];if(!graph.edges.some(e=>Number(e.from_id)===from_id&&Number(e.to_id)===to_id))graph.edges.push({from_id,to_id});draw();await refreshMap(activeDomain)}
      catch(err){showMapError('Liaison impossible : '+err.message)}
    };
    root.querySelector('[data-action="unlink"]').onclick=async()=>{
      const from_id=Number(root.querySelector('[data-action="from"]').value),to_id=Number(root.querySelector('[data-action="to"]').value);
      if(!(graph.edges||[]).some(e=>Number(e.from_id)===from_id&&Number(e.to_id)===to_id))return;
      try{await call('/api/objective-map/edges?from_id='+from_id+'&to_id='+to_id,{method:'DELETE'});await refreshMap(activeDomain)}
      catch(err){showMapError('Suppression du lien impossible : '+err.message)}
    };
    const viewport=root.querySelector('.objective-map-viewport');
    if(viewport){
      viewport.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(.4,Math.min(2.2,scale+(e.deltaY<0?.1:-.1)));draw()},{passive:false});
      let pointer=null,connection=null,draft=null;
      viewport.oncontextmenu=e=>{
        // SVG strokes are thin; allow a small contextual hit area around each
        // connection without making the entire map intercept right-clicks.
        let path=e.target.closest('.objective-map-edge');
        if(!path){
          const canvas=viewport.querySelector('.objective-map-canvas');
          const bounds=canvas?.getBoundingClientRect();
          if(bounds){
            const x=(e.clientX-bounds.left)/scale,y=(e.clientY-bounds.top)/scale;
            const distanceToSegment=(px,py,ax,ay,bx,by)=>{
              const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
              const t=den?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)):0;
              return Math.hypot(px-ax-t*dx,py-ay-t*dy);
            };
            for(const candidate of viewport.querySelectorAll('.objective-map-edge')){
              const start=coords.get(Number(candidate.dataset.from)),end=coords.get(Number(candidate.dataset.to));
              if(start&&end&&distanceToSegment(x,y,start.x+76,start.y+25,end.x+76,end.y+25)<=12/scale){
                path=candidate;break;
              }
            }
          }
        }
        if(!path)return;
        e.preventDefault();
        viewport.querySelector('.objective-map-context')?.remove();
        const menu=document.createElement('button');
        menu.type='button';menu.className='objective-map-context';menu.textContent='Supprimer la liaison';
        const rect=viewport.getBoundingClientRect();
        menu.style.left=Math.max(0,Math.min(viewport.clientWidth-180,e.clientX-rect.left))+'px';
        menu.style.top=Math.max(0,Math.min(viewport.clientHeight-46,e.clientY-rect.top))+'px';
        menu.onclick=async()=>{
          menu.remove();
          try{await call('/api/objective-map/edges?from_id='+Number(path.dataset.from)+'&to_id='+Number(path.dataset.to),{method:'DELETE'});await refreshMap(activeDomain)}
          catch(err){showMapError('Suppression impossible : '+err.message)}
        };
        viewport.append(menu);menu.focus();
      };
      viewport.onkeydown=e=>{if(e.key==='Escape')viewport.querySelector('.objective-map-context')?.remove();};
      viewport.onpointerdown=e=>{
        if(e.button!==0)return;
        const handle=e.target.closest('[data-connect]');
        if(handle){
          e.preventDefault();connection=Number(handle.dataset.connect);
          const p=coords.get(connection);
          draft=document.createElementNS('http://www.w3.org/2000/svg','path');
          draft.setAttribute('class','objective-map-preview');
          draft.setAttribute('d','M'+(p.x+152)+' '+(p.y+25)+' L'+(p.x+152)+' '+(p.y+25));
          root.querySelector('.objective-map-lines').append(draft);
          viewport.setPointerCapture(e.pointerId);return;
        }
        const button=e.target.closest('[data-node]');
        pointer={startX:e.clientX,startY:e.clientY,oldX:panX,oldY:panY,
                 nodeId:button?Number(button.dataset.node):null,moved:false};
        (button || viewport).setPointerCapture(e.pointerId);
      };
      viewport.onpointermove=e=>{
        if(connection!==null&&draft){
          const p=coords.get(connection),rect=viewport.getBoundingClientRect();
          const x=(e.clientX-rect.left-panX)/scale,y=(e.clientY-rect.top-panY)/scale;
          draft.setAttribute('d','M'+(p.x+152)+' '+(p.y+25)+' L'+x+' '+y);
          return;
        }
        if(!pointer)return;
        const dx=e.clientX-pointer.startX,dy=e.clientY-pointer.startY;
        if(Math.abs(dx)+Math.abs(dy)>5)pointer.moved=true;
        if(pointer.nodeId){
          const i=nodes.findIndex(n=>Number(n.id)===pointer.nodeId);
          const p=coords.get(pointer.nodeId),el=root.querySelector('[data-node="'+pointer.nodeId+'"]');
          if(i>=0&&el){el.style.left=(p.x+dx/scale)+'px';el.style.top=(p.y+dy/scale)+'px'}
        }else{
          const canvas=root.querySelector('.objective-map-canvas');
          if(canvas)canvas.style.transform='translate('+(pointer.oldX+dx)+'px,'+(pointer.oldY+dy)+'px) scale('+scale+')';
        }
      };
      viewport.onpointerup=async e=>{
        if(connection!==null){
          const from_id=connection;
          // Pointer capture and SVG overlays can retarget elementFromPoint.
          // Resolve the drop against visible node rectangles instead.
          const target=[...viewport.querySelectorAll('[data-node]')].find(el=>{
            const rect=el.getBoundingClientRect();
            return e.clientX>=rect.left&&e.clientX<=rect.right&&
                   e.clientY>=rect.top&&e.clientY<=rect.bottom;
          });
          const to_id=target?Number(target.dataset.node):null;
          connection=null;draft?.remove();draft=null;
          if(to_id!==null&&to_id!==from_id){
            try{await call('/api/objective-map/edges',{method:'POST',body:JSON.stringify({from_id,to_id})});graph.edges=graph.edges||[];if(!graph.edges.some(e=>Number(e.from_id)===from_id&&Number(e.to_id)===to_id))graph.edges.push({from_id,to_id});draw();await refreshMap(activeDomain)}
            catch(err){showMapError('Liaison impossible : '+err.message)}
          }else if(to_id===from_id)showMapError('Choisis une autre étape pour créer la liaison.');
          return;
        }
        if(!pointer)return;
        const current=pointer;pointer=null;
        const dx=e.clientX-current.startX,dy=e.clientY-current.startY;
        if(current.nodeId){
          if(!current.moved){selected=current.nodeId;draw();return}
          const node=nodes.find(n=>Number(n.id)===current.nodeId),p=coords.get(current.nodeId);
          const x=p.x+dx/scale,y=p.y+dy/scale;
          try{await call('/api/objective-map/node',{method:'PUT',body:JSON.stringify({node_id:node.id,x,y})});node.x=x;node.y=y;draw()}
          catch(err){showMapError('Position non enregistrée : '+err.message);draw()}
        }else {panX=current.oldX+dx;panY=current.oldY+dy}
      };
      viewport.onpointercancel=()=>{pointer=null;connection=null;draft?.remove();draft=null;draw()};
    }
    const inspector=root.querySelector('#objectiveMapInspector');
    const node=nodes.find(n=>Number(n.id)===selected);
    if(node){
      inspector.innerHTML='<strong>'+escapeText(node.title)+'</strong><label>Validation <select data-action="validation"><option value="manual">Manuelle</option><option value="tasks">Tâches terminées</option><option value="resources">Ressources terminées</option></select></label><label><input type="checkbox" data-action="required" '+(node.required?'checked':'')+'>Étape obligatoire</label>';
      const select=inspector.querySelector('select');select.value=node.validation_mode||'manual';
      inspector.querySelector('[data-action="required"]').onchange=async e=>{
        const required=e.target.checked;
        try{await call('/api/objective-map/node',{method:'PUT',body:JSON.stringify({node_id:node.id,required})});node.required=required?1:0}
        catch(err){showMapError('Statut non enregistré : '+err.message);e.target.checked=!!node.required}
      };
      select.onchange=async e=>{
        try{await call('/api/objective-map/node',{method:'PUT',body:JSON.stringify({node_id:node.id,validation_mode:e.target.value})});node.validation_mode=e.target.value}
        catch(err){showMapError('Réglage non enregistré : '+err.message);select.value=node.validation_mode||'manual'}
      };
    }
    isRendering=false;
  }
  window.renderObjectiveMap=function(domainId){
    const root=$map();
    if(!root)return;
    if(activeDomain!==Number(domainId)){
      selected=null;scale=1;panX=0;panY=0;
      graph=null;
    }
    // Re-fetch after edits to objective titles, steps or completion state.
    // The previous cached graph could keep deleted/renamed nodes onscreen.
    refreshMap(domainId);
  };
})();
