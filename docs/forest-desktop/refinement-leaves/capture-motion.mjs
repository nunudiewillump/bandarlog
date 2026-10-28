import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const frames='/tmp/bandarlog-canopy-frames';await fs.mkdir(frames,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:8098/docs/forest-desktop/refinement-leaves/comms.html');await page.evaluate(()=>document.fonts.ready);
await page.evaluate(()=>{
 const cursor=document.createElement('div');cursor.id='preview-cursor';cursor.style.cssText='position:fixed;z-index:1000;pointer-events:none;width:22px;height:28px;';cursor.innerHTML='<svg viewBox="0 0 22 28"><path d="M2 2L3 23L8 17L13 26L17 24L12 15L20 15Z" fill="#faf8f2" stroke="#103b2d" stroke-width="1.5"/></svg>';document.body.append(cursor);
 const note=document.createElement('div');note.textContent='Prototipo · cursor y caída provocados para revisar';note.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:999;background:#103b2d;color:#faf8f2;padding:6px 12px;font:14px Nunito,sans-serif';document.body.append(note);
 const random=Math.random;Math.random=()=>0.9;window.bandarlogCanopyDemo.dropLeaf();Math.random=random;
 const animation=document.querySelector('.canopy-loose-leaf').getAnimations()[0];animation.pause();window.previewLeafAnimation=animation;
});
const observations=[];
for(let frame=0;frame<=84;frame++){
 const t=frame/12*1000;const x=frame<42?380+frame*18:1136-(frame-42)*18;
 await page.mouse.move(x,75);
 await page.evaluate(({x,t})=>{const cursor=document.getElementById('preview-cursor');cursor.style.left=x+'px';cursor.style.top='75px';window.previewLeafAnimation.currentTime=t;},{x,t});
 await page.waitForTimeout(45);
 await page.screenshot({path:`${frames}/${String(frame).padStart(3,'0')}.png`});
 if(frame%12===0) observations.push(await page.evaluate(t=>{const leaf=document.querySelector('.canopy-loose-leaf');const r=leaf?.getBoundingClientRect();return{simulatedTimeMs:t,leafPresent:!!leaf,leafX:r?.x??null,leafRight:r?.right??null,leafY:r?.y??null,respondingBoughs:[...document.querySelectorAll('.tree-bough')].filter(e=>Math.abs(parseFloat(e.style.getPropertyValue('--leaf-x'))||0)>.01).length};},t));
}
await fs.writeFile('docs/forest-desktop/refinement-leaves/motion-preview.json',JSON.stringify({kind:'Illustrative recording of the working presentation prototype',frameRate:12,simulatedFallMs:7000,observations,limitations:['Cursor is intentionally swept for demonstration; looseleaf triggered through previewhook rather than waiting26–40s.','Falltimeline stepped deterministically; GIF timing is authored preview timing, not an application performance measurement.','No task/API event or physical device comfort claim.']},null,2)+'\n');
await browser.close();console.log('Captured85canopydemoframes.');
