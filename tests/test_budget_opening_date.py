from datetime import date
import unittest
import test_budget_removal as budget_fixture
namespace = budget_fixture.namespace


class BudgetOpeningDateTests(unittest.TestCase):
    def setUp(self):
        self.fixture = budget_fixture.BudgetRemovalTests()
        self.fixture.setUp()
        self.c = self.fixture.c

    def tearDown(self):
        self.fixture.tearDown()

    def test_seventh_is_anchor_and_history_is_preserved(self):
        current = date.today().replace(day=1)
        month = date(current.year - (current.month == 1), (current.month - 2) % 12 + 1, 1)
        prior = date(month.year - (month.month == 1), (month.month - 2) % 12 + 1, 1)
        self.c.execute('UPDATE budget_settings SET opening_date=?', (prior.isoformat(),))
        for day, kind, amount, status in [(2,'expense',10000,'confirmed'),
                                          (7,'expense',2500,'confirmed'),
                                          (10,'income',5000,'confirmed'),
                                          (12,'expense',2000,'pending')]:
            when = month.replace(day=day).isoformat()
            self.c.execute("""INSERT INTO budget_entries(scheduled_date,title,kind,category,
                amount_cents,status,source,actual_date,notes,created_at)
                VALUES(?,'Preserved entry',?,'Test',?,?,'manual',?,'Preserved note','test')""",
                (when,kind,amount,status,when if status == 'confirmed' else None))
        self.c.commit()
        before = namespace['budget_snapshot'](self.c,prior,'test')
        rows = [tuple(r) for r in self.c.execute('SELECT * FROM budget_entries ORDER BY id')]
        save = namespace['budget_save_month_opening']
        save(self.c,{'month':month.strftime('%Y-%m'),'reference_date':month.replace(day=7).isoformat(),
                     'amount':'500','revision':0})
        self.c.commit()
        result = namespace['budget_snapshot'](self.c,month,'test')
        self.assertEqual(result['opening_date'],month.replace(day=7).isoformat())
        self.assertEqual(result['month_opening_date'],result['opening_date'])
        self.assertEqual(result['balance_cents'],52500)
        self.assertEqual(result['forecast_cents'],50500)
        self.assertEqual(namespace['budget_snapshot'](self.c,current,'test')['month_opening_balance_cents'],52500)
        self.assertEqual(namespace['budget_snapshot'](self.c,prior,'test')['balance_cents'],before['balance_cents'])
        self.assertEqual([tuple(r) for r in self.c.execute('SELECT * FROM budget_entries ORDER BY id')],rows)
        # Older clients updating only the amount must retain the chosen date.
        save(self.c,{'month':month.strftime('%Y-%m'),'amount':500,'revision':1});self.c.commit()
        self.assertEqual(namespace['budget_snapshot'](self.c,month,'test')['opening_date'],result['opening_date'])
        with self.assertRaises(ValueError):
            save(self.c,{'month':month.strftime('%Y-%m'),'reference_date':current.isoformat(),'amount':900,'revision':2})
        with self.assertRaises(LookupError):
            save(self.c,{'month':month.strftime('%Y-%m'),'reference_date':month.replace(day=8).isoformat(),'amount':900,'revision':0})

    def test_current_cash_reconciliation_uses_the_selected_anchor(self):
        month = self.fixture.month
        when = month.replace(day=min(7,date.today().day)).isoformat()
        namespace['budget_save_month_opening'](self.c,{'month':month.strftime('%Y-%m'),
            'reference_date':when,'amount':500,'revision':0})
        self.c.commit()
        original = namespace['budget_snapshot'](self.c,month,'test')
        namespace['budget_save_current_balance'](self.c,{'month':month.strftime('%Y-%m'),
            'amount':600,'revision':0,'base_balance_cents':original['balance_cents']},'test')
        self.c.commit()
        updated = namespace['budget_snapshot'](self.c,month,'test')
        self.assertEqual(updated['balance_cents'],60000)
        self.assertEqual(updated['opening_date'],when)


if __name__ == '__main__':
    unittest.main()
