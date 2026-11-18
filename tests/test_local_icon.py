import json,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import local_icon

class LocalIconTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.data=Path(self.temp.name);local_icon._phase='idle';local_icon._message=''
 def tearDown(self):self.temp.cleanup()
 def wait(self):
  for _ in range(200):
   if not local_icon._lock.locked():return
   time.sleep(.01)
  self.fail('Local worker did not finish')
 def test_selection_accepts_only_an_owned_icon_name(self):
  root=local_icon.folder(self.data);outside=self.data/'secret.png';outside.write_bytes(b'private')
  for name in ['../secret.png',str(outside),'https://example.invalid/art.png','icon-wrong.ico']:
   (root/'selection.json').write_text(json.dumps({'file':name}));self.assertIsNone(local_icon.selected(self.data))
  icon=root/('icon-'+'a'*32+'.ico');icon.write_bytes(b'icon');(root/'selection.json').write_text(json.dumps({'file':icon.name}));self.assertEqual(local_icon.selected(self.data),icon)
 def test_cancel_preserves_previous_icon_and_never_stores_a_source_path(self):
  root=local_icon.folder(self.data);old=root/('icon-'+'a'*32+'.ico');old.write_bytes(b'old');(root/'selection.json').write_text(json.dumps({'file':old.name}))
  with patch('updater.guard'),patch.object(local_icon,'_powershell',return_value=False):local_icon.change(self.data,'fixture.exe','choose');self.wait()
  self.assertEqual(local_icon.selected(self.data),old);self.assertEqual(list(root.glob('*.ico')),[old])
 def test_choose_and_reset_keep_only_local_generated_ico_metadata(self):
  def convert(data,exe,mode,output=None):
   if mode=='Choose':output.write_bytes(b'generated ICO')
   return True
  with patch('updater.guard'),patch.object(local_icon,'_powershell',side_effect=convert):
   local_icon.change(self.data,'fixture.exe','choose');self.wait();self.assertEqual(local_icon._phase,'success');icon=local_icon.selected(self.data);self.assertTrue(icon.is_file())
   record=json.loads((icon.parent/'selection.json').read_text());self.assertEqual(set(record),{'file'});self.assertEqual(set(local_icon.status(self.data)),{'available','custom','phase','message'})
   local_icon.change(self.data,'fixture.exe','reset');self.wait();self.assertIsNone(local_icon.selected(self.data));self.assertFalse(list(icon.parent.glob('*.ico')))
 def test_launch_command_contains_no_user_image_or_remote_service(self):
  from types import SimpleNamespace
  with patch.object(local_icon.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as run:
   local_icon._powershell(self.data,'fixture.exe','Choose',self.data/'output.ico')
  args=run.call_args.args[0];self.assertIn('-STA',args);self.assertNotIn('-InputPng',args)
  text=(Path(local_icon.__file__).with_suffix('.ps1')).read_text()
  self.assertNotIn('Invoke-WebRequest',text);self.assertNotIn('HttpClient',text)

 def test_reapply_requires_windows_acknowledgement(self):
  root=local_icon.folder(self.data);icon=root/('icon-'+'b'*32+'.ico');icon.write_bytes(b'fixture');(root/'selection.json').write_text(json.dumps({'file':icon.name}))
  with patch('updater.guard'),patch.object(local_icon,'_powershell',return_value={'shortcuts':0,'windows':0}):
   with self.assertRaisesRegex(RuntimeError,'aucune fenêtre'):local_icon.reapply(self.data)
  with patch('updater.guard'),patch.object(local_icon,'_powershell',return_value={'shortcuts':1,'windows':1}):
   self.assertEqual(local_icon.reapply(self.data)['windows'],1)
