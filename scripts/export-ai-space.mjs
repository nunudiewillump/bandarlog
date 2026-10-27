import {mkdir,copyFile} from 'node:fs/promises';
const target='.data/ai-space';await mkdir(target+'/assets',{recursive:true});
for(const file of ['Dockerfile','model.py','app.py','icons.py','requirements.txt','requirements.lock'])await copyFile('ai-worker/'+file,target+'/'+file);
await copyFile('ai-worker/SPACE.md',target+'/README.md');await copyFile('public/monkey.webp',target+'/assets/monkey.webp');console.log('Paquete preparado en '+target);
