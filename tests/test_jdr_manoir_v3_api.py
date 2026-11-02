import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 18869
BASE = f'http://127.0.0.1:{PORT}'

def request(path, method='GET', obj=None, origin=None):
    headers = {}
    data = None
    if obj is not None:
        data = json.dumps(obj).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if origin:
        headers['Origin'] = origin
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, method=method, headers=headers), timeout=4) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())

class ManorV3ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='atelier-test-manoir-')
        env = dict(os.environ, ATELIER_DATA_DIR=cls.temp.name, ATELIER_PORT=str(PORT), ATELIER_NO_BROWSER='1')
        cls.server = subprocess.Popen([sys.executable, str(ROOT / 'app' / 'app.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                request('/api/version')
                break
            except Exception:
                time.sleep(0.12)
        else:
            cls.tearDownClass()
            raise AssertionError('Atelier did not start')
    @classmethod
    def tearDownClass(cls):
        if getattr(cls, 'server', None):
            cls.server.terminate()
            try: cls.server.wait(timeout=5)
            except subprocess.TimeoutExpired: cls.server.kill()
        if getattr(cls, 'temp', None): cls.temp.cleanup()

    def test_manoir_v3_is_isolated_atomic_and_conflict_safe(self):
        code, obj = request('/api/jdr/manoir')
        self.assertEqual(code, 200)
        self.assertEqual(obj['rev'], 0)
        self.assertIsNone(obj['state'])
        state = {'version':3, 'seen':{'hall':True,'salon':False}, 'tokens':[{'id':'pj1','name':'PJ','kind':'PJ'}], 'sheets':[{'id':'sheet1','name':'Fiche'}], 'shoulkar':{'hp':48}}
        code, obj = request('/api/jdr/manoir', 'POST', {'rev':0,'state':state}, BASE)
        self.assertEqual((code,obj['rev']),(200,1))
        code, obj = request('/api/jdr/manoir')
        self.assertEqual((code,obj['rev']),(200,1))
        self.assertEqual(obj['state'],state)
        code, obj = request('/api/jdr/manoir','POST',{'rev':0,'state':state}, BASE)
        self.assertEqual(code,409)
        code, obj = request('/api/jdr/manoir','POST',{'rev':1,'state':state},'https://attacker.example')
        self.assertEqual(code,403)
        code, obj = request('/api/jdr/manoir','POST',{'rev':1,'state':{'version':1}}, BASE)
        self.assertEqual(code,400)
        code, obj = request('/api/jdr/state')
        self.assertEqual(code,200)
        self.assertIsNone(obj['state'])
        self.assertTrue((Path(self.temp.name)/'jdr-manoir-v3.json').is_file())

if __name__ == '__main__':
    unittest.main()
