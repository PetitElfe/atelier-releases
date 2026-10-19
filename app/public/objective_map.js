/* ALPHA 0.18 — progressive objective map; existing tree is preserved. */
(function(){
  let activeDomain=null, graph=null, scale=1, panX=0, panY=0, selected=null, mode='map', isRendering=false;
  const $map=()=>document.getElementById('objectiveMapRoot');
  const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    try{
      const incoming=await call('/api/objective-map?domain_id='+encodeURIComponent(domainId));
      if(activeDomain!==Number(domainId))return;
      graph=incoming;draw();
    }catch(err){const root=$map();if(root)root.innerHTML='<p class="muted">Carte indisponible : '+escapeText(err.message)+'</p>'}
  }
  function draw(){
    const root=$map(); if(!root||!graph||isRendering)return;
    isRendering=true;
    const nodes=graph.nodes||[], coords=new Map(nodes.map((n,i)=>[Number(n.id),position(n,i)]));
        const allNodes=nodes.map(n=>{
      const p=coords.get(Number(n.id)),status=n.status==='done'?' done':'';
      return '<button type="button" class="objective-map-node'+status+(selected===Number(n.id)?' selected':'')+'" data-node="'+n.id+'" style="left:'+p.x+'px;top:'+p.y+'px"><small>'+escapeText(n.node_type)+'</small><strong>'+escapeText(n.title)+'</strong></button>';
    }).join('');
    const edges=(graph.edges||[]).map(e=>{
      const a=coords.get(Number(e.from_id)),b=coords.get(Number(e.to_id));if(!a||!b)return '';
      return '<path d="M'+(a.x+76)+' '+(a.y+25)+' L'+(b.x+76)+' '+(b.y+25)+'" stroke="#B39870" stroke-width="3" fill="none" marker-end="url(#objective-arrow)"/>';
    }).join('');
    const opts=nodes.map(n=>'<option value="'+n.id+'">'+escapeText(n.title)+'</option>').join('');
    root.innerHTML='<div class="objective-map-toolbar"><button type="button" data-action="toggle">'+(mode==='map'?'Voir la liste':'Voir la carte')+'</button><button type="button" data-action="zoomout" aria-label="Dézoomer">−</button><span>'+Math.round(scale*100)+' %</span><button type="button" data-action="zoomin" aria-label="Zoomer">+</button><button type="button" data-action="reset">Recentrer</button><label>Ordre <select data-action="ordering"><option value="free" '+(graph.ordering==='free'?'selected':'')+'>Libre</option><option value="sequential" '+(graph.ordering==='sequential'?'selected':'')+'>Dans l’ordre</option></select></label></div>'+
       (mode==='map'?'<div class="objective-map-viewport" tabindex="0" aria-label="Carte des objectifs, déplaçable"><div class="objective-map-canvas" style="transform:translate('+panX+'px,'+panY+'px) scale('+scale+')"><svg class="objective-map-lines" width="2600" height="2400" viewBox="0 0 2600 2400" aria-hidden="true"><defs><marker id="objective-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#B39870"/></marker></defs>'+edges+'</svg>'+allNodes+'</div></div>':'<p class="muted">La liste originale est conservée sous la carte.</p>')+
       '<div class="objective-map-edit"><strong>Relier deux étapes</strong><select data-action="from" aria-label="Départ">'+opts+'</select><span>→</span><select data-action="to" aria-label="Arrivée">'+opts+'</select><button type="button" data-action="link">Relier</button></div>'+
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
      catch(err){alert('Ordre non enregistré : '+err.message)}
    };
    root.querySelector('[data-action="link"]').onclick=async()=>{
      const from_id=Number(root.querySelector('[data-action="from"]').value),to_id=Number(root.querySelector('[data-action="to"]').value);
      try{await call('/api/objective-map/edges',{method:'POST',body:JSON.stringify({from_id,to_id})});await refreshMap(activeDomain)}
      catch(err){alert('Liaison impossible : '+err.message)}
    };
    const viewport=root.querySelector('.objective-map-viewport');
    if(viewport){
      viewport.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();scale=Math.max(.4,Math.min(2.2,scale+(e.deltaY<0?.1:-.1)));draw()},{passive:false});
      let pointer=null;
      viewport.onpointerdown=e=>{
        if(e.button!==0)return;
        const button=e.target.closest('[data-node]');
        pointer={startX:e.clientX,startY:e.clientY,oldX:panX,oldY:panY,
                 nodeId:button?Number(button.dataset.node):null,moved:false};
        viewport.setPointerCapture(e.pointerId);
      };
      viewport.onpointermove=e=>{
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
        if(!pointer)return;
        const current=pointer;pointer=null;
        const dx=e.clientX-current.startX,dy=e.clientY-current.startY;
        if(current.nodeId){
          if(!current.moved){selected=current.nodeId;draw();return}
          const node=nodes.find(n=>Number(n.id)===current.nodeId),p=coords.get(current.nodeId);
          const x=p.x+dx/scale,y=p.y+dy/scale;
          try{await call('/api/objective-map/node',{method:'PUT',body:JSON.stringify({node_id:node.id,x,y})});node.x=x;node.y=y;draw()}
          catch(err){alert('Position non enregistrée : '+err.message);draw()}
        }else {panX=current.oldX+dx;panY=current.oldY+dy}
      };
      viewport.onpointercancel=()=>{pointer=null;draw()};
    }
    const inspector=root.querySelector('#objectiveMapInspector');
    const node=nodes.find(n=>Number(n.id)===selected);
    if(node){
      inspector.innerHTML='<strong>'+escapeText(node.title)+'</strong><label>Validation <select data-action="validation"><option value="manual">Manuelle</option><option value="tasks">Tâches terminées</option><option value="resources">Ressources terminées</option></select></label>';
      const select=inspector.querySelector('select');select.value=node.validation_mode||'manual';
      select.onchange=async e=>{
        try{await call('/api/objective-map/node',{method:'PUT',body:JSON.stringify({node_id:node.id,validation_mode:e.target.value})});node.validation_mode=e.target.value}
        catch(err){alert('Réglage non enregistré : '+err.message);select.value=node.validation_mode||'manual'}
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
