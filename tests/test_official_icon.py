import unittest,tempfile,hashlib,json
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import official_icon
class OfficialIconTests(unittest.TestCase):
 def test_verified_copy_and_offline_last_good(self):
  ico=b'\0\0\1\0test';png=b'\x89PNG\r\n\x1a\ntest';m={'ico_sha256':hashlib.sha256(ico).hexdigest(),'png_sha256':hashlib.sha256(png).hexdigest()}
  with tempfile.TemporaryDirectory() as folder,patch.object(official_icon,'metadata',return_value=m),patch.object(official_icon,'download',return_value=ico):
   expected=official_icon.sync(folder);self.assertEqual(official_icon.current(folder),expected)
   expected.write_bytes(b'changed');self.assertIsNone(official_icon.current(folder))
 def test_wrong_hash_cannot_replace_icon(self):
  m={'ico_sha256':'a'*64,'png_sha256':'b'*64}
  with patch.object(official_icon,'download',return_value=b'\0\0\1\0bad'):
   with self.assertRaises(ValueError):official_icon.asset(m,'ico')
 def test_metadata_cannot_supply_remote_urls(self):
  with patch.object(official_icon,'download',return_value=json.dumps({'ico_sha256':'https://evil/','png_sha256':'b'*64}).encode()):
   with self.assertRaises(ValueError):official_icon.metadata()

 def test_official_fallback_is_not_a_private_override(self):
  import local_icon
  with tempfile.TemporaryDirectory() as folder,patch.object(official_icon,'current',return_value=Path(folder)/'official-icon/icon.ico'),patch('updater.guard'):
   local_icon._message='';status=local_icon.status(folder)
   self.assertFalse(status['custom']);self.assertIn('officielle',status['message'])
