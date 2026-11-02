"""Prevent older JDR prototype from replacing the unified Manor entry point."""
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/"app"/"public"

class UnifiedJdrEntrypointTest(unittest.TestCase):
    def test_one_atelier_nav_entry(self):
        page=(PUBLIC/"index.html").read_text(encoding="utf-8")
        self.assertEqual(page.count('id="openJdrWorkspace"'),1)
        self.assertIn('id="openJdrWorkspace" onclick="window.location.href=\'/jdr.html\'"',page)
        self.assertNotIn('id="openLegacyJdrWorkspace"',page)

    def test_old_table_url_opens_manoir_by_default(self):
        landing=(PUBLIC/"jdr.html").read_text(encoding="utf-8")
        self.assertIn("location.replace('/jdr-manoir.html?mode=players')",landing)
        self.assertIn('playerStageCanvas', (PUBLIC/"jdr-manoir.html").read_text(encoding="utf-8"))
        self.assertIn('launchMjConsole', (PUBLIC/"jdr-manoir.html").read_text(encoding="utf-8"))
        self.assertNotIn("Nouvelle carte (Combat)",landing)
        manor=(PUBLIC/"jdr-manoir.html").read_text(encoding="utf-8")
        for text in ["Shoulkar","Faire apparaître les 3 PJ","miniBoard","roomSelect"]:
            self.assertIn(text,manor)

    def test_legacy_source_and_mj_remain_available_without_replacing_v3(self):
        legacy=(PUBLIC/"jdr-legacy.html").read_text(encoding="utf-8")
        old_mj=(PUBLIC/"jdr-mj.html").read_text(encoding="utf-8")
        self.assertIn('Prototype MJ local',legacy)
        self.assertIn("window.open('/jdr-legacy.html'",old_mj)

    def test_updater_includes_both_versions(self):
        man=json.loads((ROOT/"manifest.json").read_text(encoding="utf-8"))
        listed={x["path"] for x in man["files"]}
        self.assertTrue({"public/jdr.html","public/jdr-manoir.html","public/jdr-legacy.html"}.issubset(listed))

if __name__=="__main__":
    unittest.main()
