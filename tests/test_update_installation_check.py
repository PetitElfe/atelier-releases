"""An unchanged manifest must not hide damaged or missing installed files."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'app'))
import updater


class InstallationCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.code=Path(self.temp.name);(self.code/'app/public').mkdir(parents=True)
        names=['app.py','app_part1.py','app_part2.py','app_part3.py','updater.py','public/index.html','public/styles.css','VERSION']+[f'fixture-{i}.txt' for i in range(8)]
        files=[]
        for name in names:
            data=('fixture '+name).encode();(self.code/'app'/name).write_bytes(data)
            files.append({'path':name,'sha256':hashlib.sha256(data).hexdigest()})
        self.raw=(json.dumps({'version':'0.18.0','format':2,'build_sequence':2026110906,'files':files},indent=4)+'\n').encode()
        (self.code/'manifest.json').write_bytes(self.raw)
        for name,value in [('CODE',self.code),('guard',None),('_latest_revision','a'*40),('_selected_branch','test/windows-library-calendar-20261103'),('_get',self.raw)]:
            if name=='CODE':p=patch.object(updater,name,value)
            else:p=patch.object(updater,name,return_value=value)
            p.start();self.addCleanup(p.stop)

    def test_latest_delivery_reports_the_exact_installed_and_remote_build(self):
        result=updater.check();expected=hashlib.sha256(self.raw).hexdigest()[:8]
        self.assertFalse(result['available']);self.assertFalse(result['repair_required'])
        self.assertEqual(result['installed_build'],expected);self.assertEqual(result['latest_build'],expected)
        self.assertEqual(result['revision'],'a'*40)

    def test_missing_file_proposes_repair_without_touching_the_installation(self):
        target=self.code/'app/public/index.html';target.unlink()
        result=updater.check();self.assertTrue(result['available']);self.assertTrue(result['repair_required'])
        self.assertEqual(result['damaged_files'],['public/index.html']);self.assertFalse(target.exists())
        self.assertEqual((self.code/'manifest.json').read_bytes(),self.raw)

    def test_modified_file_is_detected_even_when_the_manifest_is_current(self):
        target=self.code/'app/public/styles.css';target.write_bytes(b'modified fixture')
        result=updater.check();self.assertTrue(result['available']);self.assertEqual(result['damaged_files'],['public/styles.css'])
        self.assertEqual(target.read_bytes(),b'modified fixture')

if __name__=='__main__':unittest.main()
