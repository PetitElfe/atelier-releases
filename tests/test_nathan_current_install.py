import sys,tempfile,json,sqlite3,shutil,unittest,subprocess
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
import nathan_install as install
class NathanInstallTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.base=self.root/'LAtelierDuGoblinNathan';self.data=self.base/'data';self.data.mkdir(parents=True);self.code=self.base/'code';(self.code/'app').mkdir(parents=True)
  (self.code/'app/app.py').write_text('# old app');(self.code/'app/updater.py').write_text("BASE='LAtelierDuGoblinNathan'\nPORT = 8877")
  (self.code/'manifest.json').write_text(json.dumps({'build_sequence':1}));self.exe=self.base/'desktop/LAtelierDuGoblin_Nathan.exe';self.exe.parent.mkdir();self.exe.write_bytes(b'old executable')
  with closing(sqlite3.connect(self.data/'atelier.db')) as c, c:c.execute('CREATE TABLE witness(value TEXT)');c.execute("INSERT INTO witness VALUES('Nathan original data')")
  (self.data/'private-file.bin').write_bytes(b'personal document');(self.data/'installed-revision.txt').write_text('old');(self.base/'profile').mkdir();(self.base/'profile/preferences').write_text('original layout')
  self.download=self.root/'download.exe';self.download.write_bytes(b'new executable');self.payload=ROOT/'build/nathan_code'
  if not self.payload.exists():subprocess.run([sys.executable,str(ROOT/'tools/build_nathan_bundle.py')],cwd=ROOT,check=True)
 def test_upgrade_old_profile_preserves_database_documents_layout_and_backs_up(self):
  backup=install.install(self.payload,self.base,self.download)
  with closing(sqlite3.connect(self.data/'atelier.db')) as c:self.assertEqual(c.execute('SELECT * FROM witness').fetchone()[0],'Nathan original data')
  self.assertEqual((self.data/'private-file.bin').read_bytes(),b'personal document');self.assertEqual((self.base/'profile/preferences').read_text(),'original layout');self.assertTrue((backup/'data/atelier.db').is_file());self.assertEqual((backup/'application_avant.exe').read_bytes(),b'old executable');self.assertEqual(self.exe.read_bytes(),b'new executable');install.verify(self.code)
 def test_interrupted_upgrade_rolls_back_code_exe_and_keeps_every_data_file(self):
  with self.assertRaisesRegex(RuntimeError,'interruption'):install.install(self.payload,self.base,self.download,lambda:(_ for _ in ()).throw(RuntimeError('interruption')))
  self.assertEqual((self.code/'app/app.py').read_text(),'# old app');self.assertEqual(self.exe.read_bytes(),b'old executable');self.assertEqual((self.data/'installed-revision.txt').read_text(),'old');self.assertEqual((self.data/'private-file.bin').read_bytes(),b'personal document')
 def test_unrecognised_profile_is_never_overwritten(self):
  (self.code/'app/updater.py').write_text('not Nathan')
  with self.assertRaises(RuntimeError):install.install(self.payload,self.base,self.download)
  self.assertEqual(self.exe.read_bytes(),b'old executable')
if __name__=='__main__':unittest.main()
