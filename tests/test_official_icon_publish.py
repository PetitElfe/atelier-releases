import io,json,struct,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import official_icon_publish as P
PNG=b'\x89PNG\r\n\x1a\n'+b'\0\0\0\rIHDR'+struct.pack('>II',32,32)+b'\x08\x06\0\0\0'+b'\0'*4
class PublisherTests(unittest.TestCase):
 def tearDown(self):
  if P._session:P._session['cancel'].set();P.shutil.rmtree(P._session['folder'],ignore_errors=True)
  P._session=None
 def wait(self):
  for _ in range(200):
   if P.status()['phase'] not in ('preparing','publishing'):return
   time.sleep(.01)
  self.fail('Worker stuck')
 def prepared(self):
  def convert(s,args,payload=None,timeout=45):
   (s['folder']/'prepared.png').write_bytes(PNG);(s['folder']/'prepared.ico').write_bytes(b'\0\0\1\0fixture');return 0,''
  with patch.object(P,'_run',side_effect=convert):P.prepare(Path(tempfile.gettempdir())/'fixture-icon-data',PNG);self.wait()
  return P._session
 def test_png_bounds_and_wrong_type(self):
  self.assertEqual(P.validate(PNG),(32,32))
  for raw in (b'not an image',PNG[:16]+struct.pack('>II',8192,8192)+PNG[24:]):
   with self.assertRaises(ValueError):P.validate(raw)
 def test_prepare_never_publishes_and_deletes_source(self):
  s=self.prepared();self.assertEqual(s['phase'],'ready');self.assertFalse((s['folder']/'source.png').exists());self.assertTrue((s['folder']/'icon.json').exists());self.assertEqual(set(P.status()),{'phase','message','draft_id','step','elapsed'})
  P.cancel(s['draft_id']);self.assertFalse(s['folder'].exists())
 def test_wrong_draft_and_missing_cli_preserve_private_draft(self):
  s=self.prepared()
  with self.assertRaises(ValueError):P.publish('wrong')
  with patch.object(P.shutil,'which',return_value=None):
   with self.assertRaisesRegex(ValueError,'GitHub CLI'):P.publish(s['draft_id'])
  self.assertEqual(s['phase'],'ready');self.assertTrue((s['folder']/'icon.json').exists())
 def test_timeout_and_cancellation_kill_worker(self):
  import threading
  s={'cancel':threading.Event()}
  with self.assertRaises(TimeoutError):P._run(s,[sys.executable,'-c','import time; time.sleep(5)'],timeout=.05)
  s['cancel'].set()
  with self.assertRaises(P.Cancelled):P._run(s,[sys.executable,'-c','pass'])
 def test_publish_is_bounded_staged_and_uses_only_test_android_branch(self):
  s=self.prepared();calls=[]
  with tempfile.TemporaryDirectory() as data:
   s['data']=Path(data)
   def gh(session,args,payload=None,allow_failure=False):
    calls.append((args,payload))
    if args[:2]==['auth','status']:return 0,''
    if args[:2]==['release','view']:return 0,''
    if args[:2]==['release','upload']:return 0,''
    path=args[1]
    if path.endswith('/releases?per_page=100'):return 0,json.dumps([{'tag_name':'android-test-v0.1.20','draft':False}])
    if '/commits/android-test-' in path:return 0,json.dumps({'sha':'b'*40,'commit':{'tree':{'sha':'c'*40}}})
    if path.endswith('/git/trees'):return 0,json.dumps({'sha':'d'*40})
    if path.endswith('/git/commits'):return 0,json.dumps({'sha':'e'*40})
    return 0,'{}'
   with patch.object(P.shutil,'which',return_value='fixture-gh'),patch.object(P,'_gh',side_effect=gh),patch('local_icon.reapply',return_value={'message':'fixture applied'}):P.publish(s['draft_id']);self.wait()
   self.assertEqual(P.status()['phase'],'success');self.assertTrue((Path(data)/'official-icon/current.json').exists());self.assertFalse(s['folder'].exists())
   uploads=[a for a,p in calls if a[:2]==['release','upload']];self.assertEqual(len(uploads),2);self.assertIn('icon.json',uploads[-1][3]);self.assertFalse(any('main'==x for a,p in calls for x in a));self.assertTrue(any('test/official-icon-android' in a[1] for a,p in calls if a[0]=='api'))
 def test_http_guards_prevent_remote_or_other_edition_uploads(self):
  class H:
   def __init__(self,headers):self.headers=headers;self.rfile=io.BytesIO(PNG);self.result=None
   def _json(self,d,status=200):self.result=(d,status)
  for port,headers in [(8877,{}),(8876,{'Host':'127.0.0.1:8876','Origin':'https://evil.example','X-Atelier-Official-Icon':'1'}),(8876,{'Host':'remote.ts.net','Origin':'http://127.0.0.1:8876','X-Atelier-Official-Icon':'1'})]:
   h=H(headers);self.assertTrue(P.serve(h,'POST','/api/official-icon/prepare',Path('/fixture'),port,'127.0.0.1'));self.assertEqual(h.result[1],403);self.assertEqual(h.rfile.tell(),0)
  h=H({'Host':'127.0.0.1:8876','X-Atelier-Official-Icon':'1'})
  with patch('updater.guard'),patch('creator_access.allowed',return_value=True):P.serve(h,'GET','/api/official-icon/status',Path('/fixture'),8876,'127.0.0.1')
  self.assertEqual(h.result[1],200)
