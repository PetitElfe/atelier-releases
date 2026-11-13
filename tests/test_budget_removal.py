"""Financial regression: deletion is recoverable and excluded from every total."""
import ast
from calendar import monthrange
from datetime import date
from pathlib import Path
import sqlite3
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'app'))
import utility_details

# Exercise the real schema and the actual budget functions without starting the UI.
part1 = ast.parse((ROOT / 'app/app_part1.py').read_text())
SCHEMA = next(ast.literal_eval(n.value) for n in part1.body if isinstance(n, ast.Assign)
              and any(isinstance(t, ast.Name) and t.id == 'SCHEMA' for t in n.targets))
functions = [n for n in ast.parse((ROOT / 'app/app_part2.py').read_text()).body
             if isinstance(n, ast.FunctionDef) and n.name.startswith('budget_')]
namespace = {'date': date, 'monthrange': monthrange}
exec(compile(ast.Module(body=functions, type_ignores=[]), '<real budget functions>', 'exec'), namespace)


class BudgetRemovalTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(':memory:')
        self.c.row_factory = sqlite3.Row
        self.c.executescript(SCHEMA)
        self.c.execute('CREATE UNIQUE INDEX idx_budget_rule_occurrence ON budget_entries(rule_id,occurrence_date)')
        self.c.execute('CREATE UNIQUE INDEX idx_budget_debt_occurrence ON budget_entries(debt_id,occurrence_date)')
        utility_details.initialise(self.c)
        self.month = date.today().replace(day=1)
        self.day = self.month.isoformat()
        self.c.execute('INSERT INTO budget_settings VALUES(1,100000,?)', (self.day,))
        self.c.commit()

    def tearDown(self):
        self.c.close()

    def entry(self, status='confirmed', kind='expense', amount=1234):
        row = self.c.execute("""INSERT INTO budget_entries(scheduled_date,title,kind,category,
            amount_cents,status,source,actual_date,notes,created_at)
            VALUES(?,'Courses',?,'Alimentation',?,?,'manual',?,'Note conservée','test')""",
            (self.day, kind, amount, status, self.day if status in ('confirmed', 'presumed') else None))
        self.c.commit()
        return row.lastrowid

    def change(self, entry, method, revision, **fields):
        result = utility_details.budget_support(self.c, method, ['api', 'budget-entries', str(entry)], {},
                                                {'revision': revision, **fields})
        self.c.commit()
        return result

    def snapshot(self):
        return namespace['budget_snapshot'](self.c, self.month, 'test')

    def test_month_opening_checkpoint_preserves_history_and_carries_forward(self):
        self.entry(amount=1000)
        before=self.snapshot()
        next_month=date(self.month.year+(self.month.month==12),self.month.month%12+1,1)
        save=namespace['budget_save_month_opening']
        save(self.c,{'month':next_month.strftime('%Y-%m'),'amount':'125,50','revision':0});self.c.commit()
        self.assertEqual(self.snapshot()['balance_cents'],before['balance_cents'])
        after=namespace['budget_snapshot'](self.c,next_month,'test')
        self.assertEqual(after['forecast_cents'],12550)
        self.assertEqual(after['month_opening_balance_cents'],12550)
        self.assertEqual(self.c.execute('SELECT count(*) FROM budget_entries').fetchone()[0],1)
        with self.assertRaises(LookupError):save(self.c,{'month':next_month.strftime('%Y-%m'),'amount':0,'revision':0})
        self.c.rollback()
        save(self.c,{'month':next_month.strftime('%Y-%m'),'amount':0,'revision':1});self.c.commit()
        self.assertEqual(namespace['budget_snapshot'](self.c,next_month,'test')['forecast_cents'],0)
        save(self.c,{'month':next_month.strftime('%Y-%m'),'amount':'-20.10','revision':2});self.c.commit()
        self.assertEqual(namespace['budget_snapshot'](self.c,next_month,'test')['forecast_cents'],-2010)
        later=date(next_month.year+(next_month.month==12),next_month.month%12+1,1)
        self.assertEqual(namespace['budget_snapshot'](self.c,later,'test')['forecast_cents'],-2010)
        self.assertEqual(self.snapshot()['forecast_cents'],before['forecast_cents'])
        for amount in ('NaN','Infinity','100000001','wrong'):
            with self.assertRaises((ValueError,ArithmeticError)):save(self.c,{'month':next_month.strftime('%Y-%m'),'amount':amount,'revision':3})

    def test_remove_restore_preserves_every_state_date_note_and_receipt(self):
        for state in ('confirmed', 'presumed', 'pending', 'skipped'):
            with self.subTest(state=state):
                entry = self.entry(state)
                old = dict(self.c.execute('SELECT * FROM budget_entries WHERE id=?', (entry,)).fetchone())
                self.c.execute("INSERT INTO budget_attachments(entry_id,filename,mime_type,byte_size,content,created_at) VALUES(?,'ticket.txt','text/plain',3,?,'test')", (entry, b'abc'))
                self.c.commit()
                self.change(entry, 'DELETE', 1)
                self.assertIn(entry, [r['id'] for r in self.snapshot()['removed_entries']])
                self.change(entry, 'PUT', 2, archived=False)
                restored = dict(self.c.execute('SELECT * FROM budget_entries WHERE id=?', (entry,)).fetchone())
                self.assertEqual({k: v for k, v in restored.items() if k != 'revision'},
                                 {k: v for k, v in old.items() if k != 'revision'})
                self.assertEqual(self.c.execute('SELECT content FROM budget_attachments WHERE entry_id=?', (entry,)).fetchone()[0], b'abc')

    def test_cash_forecast_envelope_and_income_exclude_removed_rows(self):
        expense, income, pending = self.entry(amount=1000), self.entry(kind='income', amount=5000), self.entry(status='pending', amount=300)
        utility_details.budget_support(self.c, 'PUT', ['api', 'budget', 'category-limits'], {}, {'month': self.day[:7], 'category': 'Alimentation', 'amount': 100, 'revision': 0})
        self.c.commit()
        before = self.snapshot()
        self.assertEqual((before['balance_cents'], before['forecast_cents']), (104000, 103700))
        for entry in (expense, income, pending): self.change(entry, 'DELETE', 1)
        after = self.snapshot()
        self.assertEqual((after['balance_cents'], after['forecast_cents'], after['income_cents'], after['expenses_cents']), (100000, 100000, 0, 0))
        limits = utility_details.budget_support(self.c, 'GET', ['api', 'budget', 'category-limits'], {'month': [self.day[:7]]}, {})
        self.assertEqual((limits[0]['spent_cents'], limits[0]['planned_cents']), (0, 0))
        for entry in (expense, income, pending): self.change(entry, 'PUT', 2, archived=False)
        self.assertEqual(self.snapshot()['forecast_cents'], before['forecast_cents'])

    def test_removed_occurrence_does_not_reappear_and_future_repeat_survives(self):
        self.c.execute("INSERT INTO budget_rules(kind,title,amount_cents,day_of_month,start_date,created_at) VALUES('fixed','Loyer',50000,1,?,'test')", (self.day,))
        self.c.commit()
        entry = self.snapshot()['entries'][0]
        self.change(entry['id'], 'DELETE', entry['revision'])
        for _ in range(3): self.assertFalse(self.snapshot()['entries'])
        removed = self.snapshot()['removed_entries'][0]
        self.assertEqual(removed['status'], entry['status'])
        following = date(self.month.year + (self.month.month == 12), self.month.month % 12 + 1, 1)
        future = namespace['budget_snapshot'](self.c, following, 'test')
        self.assertEqual(len(future['entries']), 1)
        self.assertEqual(future['entries'][0]['rule_id'], entry['rule_id'])
        self.assertEqual(self.c.execute('SELECT count(*) FROM budget_entries').fetchone()[0], 2)

    def test_rescheduled_pending_occurrence_is_not_regenerated_before_or_after_removal(self):
        self.c.execute("INSERT INTO budget_rules(kind,title,amount_cents,day_of_month,start_date,created_at) VALUES('income','Revenu',50000,1,?,'test')", (self.day,))
        self.c.commit()
        entry = self.snapshot()['entries'][0]
        following = date(self.month.year + (self.month.month == 12), self.month.month % 12 + 1, 1)
        self.change(entry['id'], 'PUT', entry['revision'], scheduled_date=following.isoformat(), base={'scheduled_date': self.day})
        self.assertFalse(self.snapshot()['entries'], 'Moving an occurrence must not create another copy at the old date')
        moved = dict(self.c.execute('SELECT * FROM budget_entries WHERE id=?', (entry['id'],)).fetchone())
        self.change(entry['id'], 'DELETE', moved['revision'])
        self.assertFalse(self.snapshot()['entries'], 'Deleting the moved occurrence must still retain its original schedule identity')
        self.assertEqual(self.c.execute('SELECT count(*) FROM budget_entries').fetchone()[0], 1)

    def test_stale_delete_restore_and_edits_cannot_resurrect_a_line(self):
        entry = self.entry()
        self.change(entry, 'DELETE', 1)
        for method, fields in [('DELETE', {}), ('PUT', {'archived': False})]:
            with self.assertRaises(LookupError): self.change(entry, method, 1, **fields)
            self.c.rollback()
        with self.assertRaises(LookupError):
            utility_details.budget_support(self.c, 'PUT', ['api', 'budget-entries', str(entry)], {}, {'title': 'Stale', 'base': {'title': 'Courses'}})
        self.c.rollback()
        self.change(entry, 'PUT', 2, archived=False)
        with self.assertRaises(LookupError): self.change(entry, 'DELETE', 1)
        self.c.rollback()
        self.assertEqual(len(self.snapshot()['entries']), 1)

    def test_deleted_debt_installment_is_excluded_from_paid_and_planned(self):
        self.c.execute("INSERT INTO budget_debts(title,total_cents,monthly_cents,day_of_month,start_date,created_at) VALUES('Crédit',20000,10000,1,?,'test')", (self.day,))
        self.c.commit()
        entry = self.snapshot()['entries'][0]
        self.c.execute("UPDATE budget_entries SET status='confirmed',actual_date=?,revision=revision+1 WHERE id=?", (self.day, entry['id']))
        self.c.commit()
        self.assertEqual(self.snapshot()['debts'][0]['repaid_cents'], 10000)
        self.change(entry['id'], 'DELETE', entry['revision'] + 1)
        self.assertEqual(self.snapshot()['debts'][0]['repaid_cents'], 0)
        self.assertEqual(self.snapshot()['debts'][0]['remaining_cents'], 20000)
        self.change(entry['id'], 'PUT', entry['revision'] + 2, archived=False)
        self.assertEqual(self.snapshot()['debts'][0]['repaid_cents'], 10000)


if __name__ == '__main__': unittest.main()
