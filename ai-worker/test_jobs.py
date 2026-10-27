"""Protocol tests with a deliberately blocked inference; no models or credentials required."""
import importlib.util
from pathlib import Path
from threading import Event
import time
import types
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

model = types.ModuleType('model')
model.MODEL_ID = 'test-model'
model.MODEL_REVISION = 'test-revision'
model.generate = lambda *args, **kwargs: {'iconUrl': 'icon', 'mascotUrl': 'mascot'}
spec = importlib.util.spec_from_file_location('worker_protocol_test', Path(__file__).with_name('app.py'))
worker = importlib.util.module_from_spec(spec)
with patch.dict('sys.modules', {'model': model}):
    spec.loader.exec_module(worker)


class JobsTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict('os.environ', {'ARTWORK_WORKER_TOKEN': 'test-only'})
        self.env.start()
        self.client = TestClient(worker.app)
        self.headers = {'Authorization': 'Bearer test-only'}
        with worker._jobs_lock:
            worker._jobs.clear()

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def completed(self, job_id):
        for _ in range(200):
            data = self.client.get('/jobs/' + job_id, headers=self.headers).json()
            if data['status'] in ('ready', 'failed'):
                return data
            time.sleep(0.01)
        self.fail('Job did not complete')

    def test_private_endpoints(self):
        self.assertEqual(self.client.post('/jobs', json={'name': 'Cocina'}).status_code, 401)
        self.assertEqual(self.client.get('/jobs/unknown').status_code, 401)
        self.assertEqual(self.client.get('/jobs/unknown', headers=self.headers).status_code, 404)

    def test_returns_before_inference_and_reuses_job(self):
        release = Event()
        entered = Event()
        def slow(*args, **kwargs):
            entered.set()
            release.wait(timeout=5)
            return {'iconUrl': 'icon', 'mascotUrl': 'mascot'}
        with patch.object(worker, 'generate', slow):
            response = self.client.post('/jobs', json={'name': 'Cocina'}, headers=self.headers)
            self.assertEqual(response.status_code, 202)
            job_id = response.json()['id']
            try:
                self.assertTrue(entered.wait(timeout=1))
                self.assertEqual(self.client.get('/jobs/' + job_id, headers=self.headers).json()['status'], 'running')
                duplicate = self.client.post('/jobs', json={'name': 'Cocina'}, headers=self.headers)
                self.assertEqual(duplicate.json()['id'], job_id)
            finally:
                release.set()
            result = self.completed(job_id)
        self.assertEqual(result['result'], {'iconUrl': 'icon', 'mascotUrl': 'mascot'})

    def test_failure_is_sanitized_and_can_be_retried(self):
        with patch.object(worker, 'generate', side_effect=RuntimeError('internal-details')):
            job_id = self.client.post('/jobs', json={'name': 'Cocina'}, headers=self.headers).json()['id']
            self.assertEqual(self.completed(job_id)['status'], 'failed')
        retry = self.client.post('/jobs', json={'name': 'Cocina'}, headers=self.headers).json()['id']
        self.assertNotEqual(retry, job_id)
        self.assertEqual(self.completed(retry)['status'], 'ready')


if __name__ == '__main__':
    unittest.main()
