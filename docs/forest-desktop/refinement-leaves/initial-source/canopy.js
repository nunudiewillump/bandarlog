// Presentation prototype only: no application state, API or data requests.
(() => {
  const header=document.querySelector('.topbar');
  if(!header)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const hover=matchMedia('(hover: hover) and (pointer: fine)');
  const boughs=[...header.querySelectorAll('.tree-bough')];
  let pending=0, point=null, timer=0, branchBounds=[];
  const reset=()=>boughs.forEach(b=>{b.style.setProperty('--leaf-x','0px');b.style.setProperty('--leaf-y','0px');b.style.setProperty('--leaf-r','0deg');});
  const cacheBounds=()=>{branchBounds=boughs.map(b=>{const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});};
  header.addEventListener('pointerenter',cacheBounds,{passive:true});
  header.addEventListener('pointermove',event=>{
    if(reduced.matches||!hover.matches||document.hidden)return;
    point={x:event.clientX,y:event.clientY};
    if(pending)return;
    pending=requestAnimationFrame(()=>{
      pending=0;if(!point)return;
      if(!branchBounds.length)cacheBounds();
      boughs.forEach((b,index)=>{
        const anchor=branchBounds[index],dx=point.x-anchor.x,dy=point.y-anchor.y;
        const reach=Math.max(0,1-Math.abs(dx)/225);
        const depth=Number(b.dataset.depth),strength=(depth+1)/3;
        b.style.setProperty('--leaf-x',`${Math.max(-6,Math.min(6,dx*.035))*reach*strength}px`);
        b.style.setProperty('--leaf-y',`${Math.max(-3,Math.min(3,dy*.025))*reach*strength}px`);
        b.style.setProperty('--leaf-r',`${Math.max(-1.8,Math.min(1.8,dx*.013))*reach*strength}deg`);
      });
    });
  },{passive:true});
  header.addEventListener('pointerleave',()=>{point=null;reset();},{passive:true});
  addEventListener('resize',()=>{branchBounds=[];reset();},{passive:true});
  function dropLeaf(){
    if(reduced.matches||document.hidden||document.querySelector('.canopy-loose-leaf'))return false;
    const leaf=document.createElement('span');leaf.className='canopy-loose-leaf';leaf.setAttribute('aria-hidden','true');
    const workspace=document.querySelector('.workspace');
    const left=workspace?workspace.getBoundingClientRect().left:0;
    const x=Math.random()>.5?innerWidth-22:left+8;
    leaf.style.setProperty('--fall-left',`${x}px`);
    leaf.style.setProperty('--fall-top',`${header.getBoundingClientRect().bottom-8}px`);
    leaf.innerHTML='<svg viewBox="-30 -90 60 100" focusable="false"><path d="M0 0C-11-4-24-18-26-34C-28-51-15-69-3-83C11-77 23-62 24-44C26-25 13-8 0 0Z" fill="#648254"/><path d="M0 0Q-3-43-3-76" stroke="#b6c698" stroke-width="2.6" fill="none"/></svg>';
    document.body.append(leaf);leaf.addEventListener('animationend',()=>leaf.remove(),{once:true});return true;
  }
  function schedule(){clearTimeout(timer);if(document.hidden||reduced.matches)return;timer=setTimeout(()=>{dropLeaf();schedule();},26000+Math.random()*14000);}
  document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('canopy-paused',document.hidden);if(document.hidden){clearTimeout(timer);reset();}else schedule();});
  reduced.addEventListener('change',()=>{if(reduced.matches){document.querySelectorAll('.canopy-loose-leaf').forEach(l=>l.remove());reset();}schedule();});
  schedule();
  // Exposed only for deterministic visual capture, not a proposed user control.
  window.bandarlogCanopyDemo={dropLeaf,reset,parameters:{intervalMinMs:26000,intervalMaxMs:40000,fallMs:6500,maxX:6,maxY:3,maxRotation:1.8}};
})();
