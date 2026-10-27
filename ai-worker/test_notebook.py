"""Exercise the notebook's executable replacement and tunnel cleanup on Linux."""
import ast
import errno
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

notebook = json.loads((Path(__file__).resolve().parents[1] / 'notebooks/Bandarlog_IA_gratis.ipynb').read_text())
source = ''.join(next(c for c in notebook['cells'] if c['id'] == 'bandarlog-5')['source'])
function = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'install_cloudflared')
namespace = {}
exec(compile(ast.Module(body=[function], type_ignores=[]), '<notebook-install>', 'exec'), namespace)
install = namespace['install_cloudflared']


class NotebookTest(unittest.TestCase):
    def test_cell_syntax_and_main_default(self):
        for cell in notebook['cells']:
            if cell['cell_type'] == 'code':
                ast.parse(''.join(cell['source']))
        self.assertIn("REF = 'main'", ''.join(notebook['cells'][1]['source']))

    @unittest.skipUnless(shutil.which('sleep'), 'Requires a local sleep executable')
    def test_replaces_busy_binary_and_stops_previous_tunnel(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cloudflared'
            data = Path(shutil.which('sleep')).read_bytes()
            install(path, data)
            process = subprocess.Popen([str(path), '30'])
            log = (Path(directory) / 'tunnel.log').open('w')
            try:
                with self.assertRaises(OSError) as error:
                    path.write_bytes(data)
                self.assertEqual(error.exception.errno, errno.ETXTBSY)
                install(path, data)
                install(path, data)
                self.assertIsNone(process.poll())
                self.assertEqual(path.read_bytes(), data)
                self.assertEqual(path.stat().st_mode & 0o777, 0o700)
                self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['cloudflared', 'tunnel.log'])
                cleanup = 'previous_tunnel =' + source.split('previous_tunnel =', 1)[1].split('tunnel_log_path =', 1)[0]
                context = {'tunnel': process, 'tunnel_log': log, 'worker_url': 'old-url', 'subprocess': subprocess}
                exec(cleanup, context)
                self.assertIsNotNone(process.poll())
                self.assertTrue(log.closed)
                self.assertNotIn('worker_url', context)
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
                log.close()


if __name__ == '__main__':
    unittest.main()
