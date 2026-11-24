from pathlib import Path
import tempfile,sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import creator_access as access
class CreatorAccessTests(unittest.TestCase):
 def setUp(self):self.t=tempfile.TemporaryDirectory();self.data=Path(self.t.name);access.ATTEMPTS.clear()
 def tearDown(self):self.t.cleanup()
 def test_password_protects_writes_and_sessions_are_private(self):
  self.assertTrue(access.allowed(self.data,''));state=access.authenticate(self.data,'setup','MotDePassePrive42')
  self.assertTrue(state['configured']);self.assertFalse(access.allowed(self.data,''));self.assertTrue(access.allowed(self.data,state['token']))
  self.assertNotIn('MotDePassePrive42',(self.data/'creator-access.json').read_text())
  with self.assertRaises(PermissionError):access.authenticate(self.data,'login','wrong')
  with self.assertRaises(PermissionError):access.authenticate(self.data,'setup','nouveauMotDePasse')
  new=access.authenticate(self.data,'login','MotDePassePrive42');access.authenticate(self.data,'logout',token=new['token']);self.assertFalse(access.allowed(self.data,new['token']))
 def test_named_themes_and_removal_keep_previous_copy(self):
  saved=access.save_preset(self.data,'Forêt',{});identifier=saved[0]['id'];self.assertEqual(access.presets(self.data,identifier)['name'],'Forêt')
  access.save_preset(self.data,'Nuit',{});self.assertEqual(len(access.presets(self.data)),2)
  access.remove_preset(self.data,identifier);self.assertEqual(len(access.presets(self.data)),1);self.assertTrue((self.data/'personal-design-presets'/'archive'/(identifier+'.json')).is_file())
  with self.assertRaises(ValueError):access.presets(self.data,'../escape')
if __name__=='__main__':unittest.main()
