import base64,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import health_vault

def envelope():
 b=lambda n:base64.b64encode(bytes(n)).decode()
 return {'version':1,'kdf':{'name':'PBKDF2-SHA256','iterations':600000},'salt':b(16),'wrapped':{'iv':b(12),'data':b(48)},'recovery':{'iv':b(12),'data':b(48)},'payload':{'iv':b(12),'data':b(80)}}
class HealthVaultTests(unittest.TestCase):
 def test_opaque_conflict_backup_and_corruption_preserve_files(self):
  with tempfile.TemporaryDirectory() as d:
   self.assertIsNone(health_vault.load(d)['envelope']);e=envelope();health_vault.save(d,0,e)
   with self.assertRaises(health_vault.Conflict):health_vault.save(d,0,e)
   health_vault.save(d,1,e);self.assertEqual(health_vault.load(d)['revision'],2)
   self.assertEqual(json.loads((Path(d)/'health-vault-previous.json').read_text())['revision'],1)
   p=Path(d)/'health-vault-v1.json';p.write_text('broken')
   with self.assertRaises(ValueError):health_vault.save(d,2,e)
   self.assertEqual(p.read_text(),'broken')
 def test_refuses_plaintext_extra_fields_invalid_kdf_and_oversized_blocks(self):
  for key,value in [('name','secret.pdf'),('password','secret')]:
   e=envelope();e[key]=value
   with self.assertRaises(ValueError):health_vault.validate(e)
  e=envelope();e['kdf']['iterations']=1
  with self.assertRaises(ValueError):health_vault.validate(e)
  e=envelope();e['payload']['iv']='wrong'
  with self.assertRaises(ValueError):health_vault.validate(e)
if __name__=='__main__':unittest.main()
