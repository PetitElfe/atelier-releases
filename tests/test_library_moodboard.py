import json
import sqlite3
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import library_moodboard as mood


class MoodboardTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('CREATE TABLE objective_nodes(id INTEGER PRIMARY KEY,node_type TEXT)')
        self.db.executemany('INSERT INTO objective_nodes VALUES(?,?)', [(1, 'domain'), (2, 'domain'), (3, 'step')])
        self.db.execute('CREATE TABLE notebooks(id INTEGER PRIMARY KEY,body TEXT)')
        self.db.execute("INSERT INTO notebooks VALUES(1,'existing writing')")
        mood.initialise(self.db)
        self.db.commit()
        self.addCleanup(self.db.close)

    def item(self, **changes):
        return dict(id='a', kind='text', text='Inspiration\nMa note', x=24, y=30, w=280, h=220, color='sage', **changes)

    def save(self, domain, revision, items):
        with self.db:
            return mood.save(self.db, domain, revision, items)

    def test_per_domain_storage_is_additive_and_preserves_notebooks(self):
        self.assertEqual(mood.get(self.db, 1)['revision'], 0)
        self.assertEqual(self.save(1, 0, [self.item()])['revision'], 1)
        self.assertEqual(mood.get(self.db, 1)['items'][0]['text'], 'Inspiration\nMa note')
        self.assertEqual(mood.get(self.db, 2)['items'], [])
        self.assertEqual(self.db.execute('SELECT body FROM notebooks').fetchone()[0], 'existing writing')
        self.save(1, 1, [])
        self.assertEqual(mood.get(self.db, 1)['items'], [])

    def test_stale_save_never_overwrites_the_other_window(self):
        self.save(1, 0, [self.item()])
        with self.assertRaises(mood.Conflict):
            self.save(1, 0, [])
        self.assertEqual(mood.get(self.db, 1)['revision'], 1)
        self.assertEqual(len(mood.get(self.db, 1)['items']), 1)

    def test_unsafe_urls_images_and_geometry_are_rejected_without_changes(self):
        self.save(1, 0, [self.item()])
        for change in [dict(kind='link', url='javascript:alert(1)'), dict(kind='link', url='https://user:pass@example.com'),
                       dict(kind='image', src='data:image/svg+xml;base64,xxx'), dict(kind='image', src='data:image/png;base64,YWJj'),
                       dict(x=float('nan')), dict(w=-2), dict(text='a'*10001)]:
            data=self.item();data.update(change)
            with self.assertRaises(ValueError):
                self.save(1, 1, [data])
        self.assertEqual(mood.get(self.db, 1)['revision'], 1)

    def test_real_image_and_web_link_round_trip(self):
        image=self.item();image.update(kind='image',src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
        link=self.item();link.update(id='b',kind='link',url='https://example.com/english')
        self.save(1,0,[image,link])
        self.assertEqual(mood.get(self.db,1)['items'][0]['src'],image['src'])
        self.assertEqual(mood.get(self.db,1)['items'][1]['url'],link['url'])

    def test_only_existing_domains_are_writable_and_duplicate_ids_are_rejected(self):
        for domain in (3, 99):
            with self.assertRaises(ValueError):
                self.save(domain, 0, [])
        with self.assertRaises(ValueError):
            self.save(1, 0, [self.item(), self.item()])
        with self.assertRaises(ValueError):
            self.save(1, True, [])
        self.assertEqual(mood.get(self.db, 1)['revision'], 0)

    def test_content_is_retained_in_a_sqlite_backup(self):
        self.save(1, 0, [self.item()])
        target=sqlite3.connect(':memory:');self.addCleanup(target.close);target.row_factory=sqlite3.Row
        self.db.backup(target)
        self.assertEqual(mood.get(target, 1)['items'], mood.get(self.db, 1)['items'])


if __name__ == '__main__':
    unittest.main()
