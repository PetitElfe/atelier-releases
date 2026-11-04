from datetime import datetime,timedelta
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import native_reminders as reminders

class NativeReminderTests(unittest.TestCase):
    def test_xml_escapes_user_text_and_exposes_only_five_explicit_actions(self):
        node=ET.fromstring(reminders.xml('Titre <privé> & "citation"','securetoken'))
        self.assertEqual(node.findall('./visual/binding/text')[1].text,'Titre <privé> & "citation"')
        self.assertEqual(len(node.findall('./actions/action')),5)
        self.assertTrue(all(x.attrib['activationType']=='protocol' for x in node.findall('./actions/action')))
    def test_action_is_bound_to_current_due_date_and_only_applies_once(self):
        with tempfile.TemporaryDirectory() as folder:
            with sqlite3.connect(Path(folder)/'atelier.db') as c:
                c.execute('CREATE TABLE reminders(id INTEGER PRIMARY KEY,entity_type TEXT,entity_id INTEGER,title TEXT,remind_at TEXT,snoozed_until TEXT,status TEXT)');reminders.initialise(c)
                c.execute("INSERT INTO reminders VALUES(1,'standalone',0,'Test','2026-11-04T08:00',NULL,'pending')")
                c.execute("INSERT INTO native_reminder_delivery(reminder_id,due_key,token) VALUES(1,'2026-11-04T08:00','once')")
            self.assertTrue(reminders.activate(folder,'goblin-test-reminder://activate/once?a=10'))
            with sqlite3.connect(Path(folder)/'atelier.db') as c:first=c.execute('SELECT snoozed_until FROM reminders').fetchone()[0]
            self.assertFalse(reminders.activate(folder,'goblin-test-reminder://activate/once?a=60'))
            with sqlite3.connect(Path(folder)/'atelier.db') as c:self.assertEqual(c.execute('SELECT snoozed_until FROM reminders').fetchone()[0],first)
            with self.assertRaises(ValueError):reminders.activate(folder,'https://example.com/once?a=finish')
    def test_changed_reminder_is_not_overwritten_by_stale_notification(self):
        with tempfile.TemporaryDirectory() as folder:
            with sqlite3.connect(Path(folder)/'atelier.db') as c:
                c.execute('CREATE TABLE reminders(id INTEGER PRIMARY KEY,entity_type TEXT,entity_id INTEGER,title TEXT,remind_at TEXT,snoozed_until TEXT,status TEXT)');reminders.initialise(c)
                c.execute("INSERT INTO reminders VALUES(1,'standalone',0,'Test','2026-11-05T08:00',NULL,'pending')");c.execute("INSERT INTO native_reminder_delivery(reminder_id,due_key,token) VALUES(1,'2026-11-04T08:00','old')")
            self.assertFalse(reminders.activate(folder,'goblin-test-reminder://activate/old?a=cancel'))
            with sqlite3.connect(Path(folder)/'atelier.db') as c:self.assertEqual(c.execute('SELECT status FROM reminders').fetchone()[0],'pending')

if __name__=='__main__':unittest.main()
