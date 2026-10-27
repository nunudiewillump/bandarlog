import hmac
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from model import generate, MODEL_ID, MODEL_REVISION

app=FastAPI(docs_url=None,redoc_url=None)
class CommissionRequest(BaseModel):
    name:str=Field(min_length=1,max_length=200)
    description:str=Field(default='',max_length=3000)

@app.get('/health')
def health():
    return {'ok':True,'model':MODEL_ID,'revision':MODEL_REVISION,'device':'cpu','configured':bool(os.getenv('ARTWORK_WORKER_TOKEN'))}

@app.post('/generate')
def artwork(data:CommissionRequest,authorization:str=Header(default='')):
    token=os.getenv('ARTWORK_WORKER_TOKEN')
    if not token:raise HTTPException(503,'El servicio no tiene configurada su clave privada.')
    if not hmac.compare_digest(authorization,'Bearer '+token):raise HTTPException(401,'No autorizado.')
    try:return generate(data.name,data.description,seed=int.from_bytes(__import__('hashlib').sha256((data.name+data.description).encode()).digest()[:4],'big'))
    except Exception:raise HTTPException(503,'No se pudieron generar las ilustraciones.')
