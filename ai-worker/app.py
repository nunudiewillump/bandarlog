import hashlib
import hmac
import os
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from uuid import uuid4
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from model import generate, MODEL_ID, MODEL_REVISION

app = FastAPI(docs_url=None, redoc_url=None)
_executor = ThreadPoolExecutor(max_workers=1)
_jobs = {}
_jobs_lock = Lock()


class CommissionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default='', max_length=3000)


def authorize(authorization):
    token = os.getenv('ARTWORK_WORKER_TOKEN')
    if not token:
        raise HTTPException(503, 'El servicio no tiene configurada su clave privada.')
    if not hmac.compare_digest(authorization, 'Bearer ' + token):
        raise HTTPException(401, 'No autorizado.')


def render(data):
    seed = int.from_bytes(hashlib.sha256((data.name + data.description).encode()).digest()[:4], 'big')
    return generate(data.name, data.description, seed=seed)


@app.get('/health')
def health():
    return {'ok': True, 'model': MODEL_ID, 'revision': MODEL_REVISION, 'device': 'cpu',
            'configured': bool(os.getenv('ARTWORK_WORKER_TOKEN')), 'jobs': True}


def run_job(job_id, data):
    with _jobs_lock:
        _jobs[job_id]['status'] = 'running'
    try:
        result = render(data)
    except Exception:
        with _jobs_lock:
            _jobs[job_id].update(status='failed', updated=time.monotonic())
    else:
        with _jobs_lock:
            _jobs[job_id].update(status='ready', result=result, updated=time.monotonic())


@app.post('/jobs', status_code=202)
def create_job(data: CommissionRequest, authorization: str = Header(default='')):
    authorize(authorization)
    key = (data.name, data.description)
    with _jobs_lock:
        # Bound memory and avoid starting duplicate inference after a client retry.
        for job_id, job in list(_jobs.items()):
            if job['status'] in ('ready', 'failed') and time.monotonic() - job['updated'] > 3600:
                del _jobs[job_id]
        for job_id, job in _jobs.items():
            if job['key'] == key and job['status'] != 'failed':
                return {'id': job_id, 'status': job['status']}
        if len(_jobs) >= 8:
            finished = [k for k, v in _jobs.items() if v['status'] in ('ready', 'failed')]
            if finished:
                del _jobs[finished[0]]
            else:
                raise HTTPException(429, 'El generador está ocupado. Reinténtalo más tarde.')
        job_id = uuid4().hex
        _jobs[job_id] = {'key': key, 'status': 'queued', 'updated': time.monotonic()}
        _executor.submit(run_job, job_id, data)
    return {'id': job_id, 'status': 'queued'}


@app.get('/jobs/{job_id}')
def get_job(job_id: str, authorization: str = Header(default='')):
    authorize(authorization)
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, 'La generación ha expirado o la sesión se ha reiniciado.')
        result = {'id': job_id, 'status': job['status']}
        if job['status'] == 'ready':
            result['result'] = job['result']
        return result


# Compatibility for local callers; external clients should use short /jobs requests.
@app.post('/generate')
def artwork(data: CommissionRequest, authorization: str = Header(default='')):
    authorize(authorization)
    try:
        return render(data)
    except Exception:
        raise HTTPException(503, 'No se pudieron generar las ilustraciones.')
