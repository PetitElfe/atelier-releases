"""Read shopping rows from this installation's backups; never restore a database."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3


def search(data, port, installation_id):
    root = Path(data).resolve()
    sources, seen = [], set()
    report = {'sources': sources, 'scanned': 0, 'skipped': 0}
    budget = 128 * 1024 * 1024

    def safe(path, parent):
        path = Path(path)
        return (path.is_file() and path.resolve().is_relative_to(parent.resolve())
                and not any(p.is_symlink() or getattr(p, 'is_junction', lambda: False)()
                            for p in [path, *path.parents] if p != parent.parent))

    def add(label, rows):
        clean = []
        for row in rows:
            try:
                name = str(row.get('name', '')).strip()
                count = int(row.get('purchase_count') or 1)
                price = row.get('price')
                if price is not None:
                    price = float(price)
                    if not 0 <= price <= 1000000:
                        continue
                if not 1 <= len(name) <= 120 or not 1 <= count <= 999:
                    continue
                signature = (name.casefold(), count, price)
                if signature in seen:
                    continue
                seen.add(signature)
                clean.append({'name': name, 'price': price, 'purchase_count': count})
            except (ValueError, TypeError, AttributeError, OverflowError):
                continue
        if clean:
            sources.append({'label': label, 'cart': clean})

    def browser_rows(browser):
        for key, value in (browser.get('local_storage') or {}).items():
            if key.startswith('atelier-groceries-pc:') and not key.endswith((':history', ':previous')):
                try:
                    cached = json.loads(value)
                    if cached.get('identity') in (None, installation_id):
                        yield from cached.get('cart', [])
                except (ValueError, TypeError, AttributeError):
                    pass

    def read_json(path, parent, complete=False):
        nonlocal budget
        try:
            if not safe(path, parent) or path.stat().st_size > min(budget, 64 * 1024 * 1024):
                report['skipped'] += 1
                return
            budget -= path.stat().st_size
            value = json.loads(path.read_text(encoding='utf-8-sig'))
            report['scanned'] += 1
            if complete:
                if (value.get('installation_id') != installation_id or value.get('edition_port') != port
                        or value.get('format') != 'atelier-complete-backup-v1'):
                    report['skipped'] += 1
                    return
                table = value.get('tables', {}).get('shopping_items', {})
                rows = [dict(zip(table.get('columns', []), row)) for row in table.get('rows', [])]
                add(path.name, rows)
                add(path.name + ' · saisies du navigateur', browser_rows(value.get('browser', {})))
            else:
                add(path.parent.parent.name + ' · saisies du navigateur', browser_rows(value))
        except (OSError, ValueError, TypeError, AttributeError):
            report['skipped'] += 1

    read_json(root / 'browser-settings.json', root)
    complete = root / 'backups' / 'complete'
    files = sorted(complete.glob('*.json'), key=lambda p: (p.name == 'original-before-first-complete-backup.json', p.name), reverse=True)
    report['skipped'] += max(0, len(files) - 30)
    for path in files[:30]:
        read_json(path, root, complete=True)
    # Only known Misu backup folders beside this data directory, never another drive/profile.
    folders = []
    for pattern in ('SAUVEGARDE_AUTO_TEST_*', 'LATELIER_SAUVEGARDE_*'):
        folders.extend(root.parent.glob(pattern))
    folders.sort(key=lambda p: p.name, reverse=True)
    report['skipped'] += max(0, len(folders) - 40)
    for folder in folders[:40]:
        db = folder / 'data' / 'atelier.db'
        try:
            if not safe(db, root.parent):
                report['skipped'] += 1
                continue
            marker = folder / 'data' / 'installation-id.json'
            if marker.exists() and (not safe(marker, root.parent)
                    or json.loads(marker.read_text())['id'] != installation_id):
                report['skipped'] += 1
                continue
            with closing(sqlite3.connect(db.resolve().as_uri() + '?mode=ro&immutable=1', uri=True, timeout=1)) as c:
                c.row_factory = sqlite3.Row
                c.execute('PRAGMA query_only=ON')
                cols = {r[1] for r in c.execute('PRAGMA table_info(shopping_items)')}
                price = 'price' if 'price' in cols else 'NULL AS price'
                count = 'purchase_count' if 'purchase_count' in cols else '1 AS purchase_count'
                rows = c.execute('SELECT name,' + price + ',' + count + ' FROM shopping_items ORDER BY id LIMIT 1000').fetchall()
                add(folder.name, [dict(row) for row in rows])
                report['scanned'] += 1
            read_json(folder / 'data' / 'browser-settings.json', root.parent)
        except (OSError, ValueError, sqlite3.Error, KeyError):
            report['skipped'] += 1
    return report
