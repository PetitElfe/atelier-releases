import base64
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import personal_design as design

PNG='data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\ntest').decode()


class PersonalDesignTest(unittest.TestCase):
    def test_installation_gate_uses_existing_isolation_guard(self):
        with patch.object(design.updater,'guard',side_effect=RuntimeError('Other installation')):
            self.assertFalse(design.available())
        with patch.object(design.updater,'guard') as guard:
            self.assertTrue(design.available())
            guard.assert_called_once_with(external_runner=True)

    def test_saved_art_survives_and_old_theme_is_backed_up(self):
        with tempfile.TemporaryDirectory() as folder:
            untouched=Path(folder)/'atelier.db';untouched.write_bytes(b'not touched')
            self.assertEqual(design.get(folder),{'revision':0,'theme':{}})
            art={'id:homeBtn':{'src':PNG,'name':'Bouton maison'}}
            first=design.save(folder,0,art)
            self.assertEqual(design.get(folder),first)
            design.save(folder,1,{})
            self.assertEqual(json.loads((Path(folder)/'personal-design-v1.previous.json').read_text()),first)
            self.assertEqual(untouched.read_bytes(),b'not touched')

    def test_stale_window_does_not_overwrite_theme(self):
        with tempfile.TemporaryDirectory() as folder:
            first=design.save(folder,0,{'app':{'src':PNG}})
            with self.assertRaises(design.Conflict):design.save(folder,0,{})
            self.assertEqual(design.get(folder),first)

    def test_invalid_inputs_never_replace_the_saved_theme(self):
        with tempfile.TemporaryDirectory() as folder:
            first=design.save(folder,0,{'app':{'src':PNG}})
            invalid=[{'bad"]{color:red}':{'src':PNG}}, {'app':{'src':'https://example.com/a.png'}},
                     {'app':{'src':'data:image/svg+xml;base64,PHN2Zz4='}},
                     {'app':{'src':'data:image/png;base64,AAAA'}},
                     {'app':{'src':PNG,'size':float('nan')}}, {'app':{'src':PNG,'x':True}},
                     {'app':{'src':PNG,'hideLabel':'yes'}}, {'app':{'src':PNG,'fit':'url(bad)'}}]
            for theme in invalid:
                with self.subTest(theme=theme),self.assertRaises(ValueError):design.save(folder,1,theme)
            self.assertEqual(design.get(folder),first)

    def test_corrupt_saved_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'personal-design-v1.json';p.write_text('{oops')
            with self.assertRaises(ValueError):design.save(folder,0,{})
            self.assertEqual(p.read_text(),'{oops')

if __name__=='__main__':unittest.main()
