"""Local image worker; no metered API and no remote Python code."""
import base64
import io
import os
from pathlib import Path
import shutil
from huggingface_hub import snapshot_download
from safetensors.torch import save_file
from threading import Lock
import torch
from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
from PIL import Image
from icons import icon_plan,render_icon
from rembg import remove,new_session
_background_session=None

MODEL_ID = 'segmind/tiny-sd'
MODEL_REVISION = 'cad0bd7495fa6c4bcca01b19a723dc91627fe84f'
_lock = Lock()
_pipeline = None

def pipeline():
    global _pipeline
    if _pipeline is None:
        torch.set_num_threads(min(int(os.getenv('AI_THREADS', '4')), os.cpu_count() or 1))
        source=Path(snapshot_download(MODEL_ID,revision=MODEL_REVISION))
        converted=Path(os.environ.get('HF_HOME',str(Path.home()/'.cache/huggingface')))/('converted-'+MODEL_REVISION)
        if not (converted/'.ready').exists():
            converted.mkdir(parents=True,exist_ok=True)
            for file in source.rglob('*'):
                if not file.is_file():continue
                target=converted/file.relative_to(source);target.parent.mkdir(parents=True,exist_ok=True)
                if file.suffix=='.bin':
                    tensors=torch.load(file,map_location='cpu',weights_only=True)
                    save_file({key:value.contiguous() for key,value in tensors.items()},str(target.with_name('model.safetensors') if target.name=='pytorch_model.bin' else target.with_suffix('.safetensors')),metadata={'format':'pt'})
                elif file.suffix not in ['.msgpack','.h5']:shutil.copyfile(file,target)
            (converted/'.ready').write_text(MODEL_REVISION)
        _pipeline = StableDiffusionPipeline.from_pretrained(str(converted),use_safetensors=True,dtype=torch.float32)
        _pipeline.enable_attention_slicing()
        _pipeline.to('cpu')
    return _pipeline

def as_data_uri(image,cutout=True):
    global _background_session
    if cutout and _background_session is None:_background_session=new_session('u2netp')
    output=io.BytesIO()
    prepared=remove(image.convert('RGB'),session=_background_session) if cutout else image
    prepared.save(output,format='WEBP',quality=84)
    return 'data:image/webp;base64,'+base64.b64encode(output.getvalue()).decode()

def generate(name, description='', seed=17):
    # Only the commission's name and description are supplied; never members or tasks.
    raw=(name+' '+description).lower()
    categories=[(['cocina','comida','menu','menú'],'cooking pot and wooden spoon'),(['salud','botiqu','sanitari'],'first aid kit'),(['logíst','logist','transporte'],'camping tent and compass'),(['comunic','cartel','familia'],'megaphone'),(['anima','juego'],'theater masks'),(['infra','material','monta'],'tools and a hammer')]
    context=next((prompt for words,prompt in categories if any(word in raw for word in words)),'scout campfire and camping tent')
    negative='human, person, man, woman, text, letters, watermark, low quality, blurry, distorted, extra limbs'
    with _lock:
        pipe=pipeline()
        plan=icon_plan(pipe,name,description)
        icon=render_icon(plan)
        mascot=generate_mascot(pipe,context,seed+1)
        return {'iconUrl':as_data_uri(icon,cutout=False),'mascotUrl':as_data_uri(mascot),'model':MODEL_ID,'revision':MODEL_REVISION}

def generate_mascot(pipe,context,seed=18):
    reference=Image.open(os.environ.get('MONKEY_ASSET',str(Path(__file__).resolve().parents[1]/'public/monkey.webp'))).convert('RGBA')
    reference.thumbnail((384,512))
    canvas=Image.new('RGB',(384,512),'white');canvas.paste(reference,((384-reference.width)//2,(512-reference.height)//2),reference)
    image_pipe=StableDiffusionImg2ImgPipeline(**pipe.components)
    return image_pipe(prompt=f'adorable brown monkey scout, big round monkey ears and curled tail, green backpack and cream scarf, {context}, stylized 3d cartoon, full body, white background',negative_prompt='human, person, man, woman, text, letters, watermark, extra limbs, scary, photograph',image=canvas,strength=0.30,num_inference_steps=25,guidance_scale=6.0,generator=torch.Generator('cpu').manual_seed(seed)).images[0]
