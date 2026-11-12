"""Manual validation and reconciliation must never silently invent payments."""
import unittest
import test_budget_removal as fixture
namespace=fixture.namespace
from datetime import date

class ManualBudgetTests(unittest.TestCase):
    setUp=fixture.BudgetRemovalTests.setUp
    tearDown=fixture.BudgetRemovalTests.tearDown
    entry=fixture.BudgetRemovalTests.entry
    snapshot=fixture.BudgetRemovalTests.snapshot
    def test_presumed_and_overdue_charges_do_not_change_cash(self):
        self.entry(status='presumed',amount=2000)
        self.c.execute("INSERT INTO budget_rules(kind,title,category,amount_cents,day_of_month,start_date,created_at) VALUES('fixed','Loyer','Logement',10000,1,?,'test')",(self.day,));self.c.commit()
        snap=self.snapshot()
        self.assertEqual(snap['balance_cents'],100000)
        self.assertEqual(snap['forecast_cents'],88000)
        self.assertEqual(next(e['status'] for e in snap['entries'] if e['title']=='Loyer'),'pending')
        self.assertEqual(self.snapshot()['balance_cents'],100000)

    def save_cash(self,amount,snapshot=None):
        snap=snapshot or self.snapshot()
        result=namespace['budget_save_current_balance'](self.c,{'month':self.day[:7],'amount':amount,'revision':snap['cash_revision'],'base_balance_cents':snap['balance_cents']},'test');self.c.commit();return result

    def test_cash_set_is_exact_repeatable_and_preserves_initial_balance_and_entries(self):
        self.entry(amount=1000);before=self.snapshot()
        self.save_cash('500.50');after=self.snapshot()
        self.assertEqual(after['balance_cents'],50050)
        self.assertEqual(after['month_opening_balance_cents'],before['month_opening_balance_cents'])
        self.assertEqual(after['entries'],before['entries'])
        self.save_cash('0');self.assertEqual(self.snapshot()['balance_cents'],0)
        self.save_cash('-20.10');self.assertEqual(self.snapshot()['balance_cents'],-2010)

    def test_cash_carries_forward_but_later_month_opening_overrides_it(self):
        self.save_cash(500)
        later=date(self.month.year+(self.month.month==12),self.month.month%12+1,1)
        self.assertEqual(namespace['budget_snapshot'](self.c,later,'test')['month_opening_balance_cents'],50000)
        namespace['budget_save_month_opening'](self.c,{'month':later.strftime('%Y-%m'),'amount':700,'revision':0});self.c.commit()
        self.assertEqual(namespace['budget_snapshot'](self.c,later,'test')['forecast_cents'],70000)
        self.assertEqual(self.snapshot()['balance_cents'],50000)

    def test_later_confirmations_and_undo_change_reconciled_cash_once(self):
        eid=self.entry(status='pending',amount=2000);self.save_cash(500)
        self.c.execute("UPDATE budget_entries SET status='confirmed',actual_date=? WHERE id=?",(self.day,eid));self.c.commit()
        self.assertEqual(self.snapshot()['balance_cents'],48000)
        self.assertEqual(self.snapshot()['balance_cents'],48000)
        self.c.execute("UPDATE budget_entries SET status='pending',actual_date=NULL WHERE id=?",(eid,));self.c.commit()
        self.assertEqual(self.snapshot()['balance_cents'],50000)

    def test_stale_cash_revision_and_changed_payments_are_rejected(self):
        old=self.snapshot();self.save_cash(500)
        with self.assertRaises(LookupError):self.save_cash(600,old)
        self.c.rollback();old=self.snapshot();self.entry(amount=1000)
        with self.assertRaises(LookupError):self.save_cash(600,old)
        self.c.rollback();self.assertEqual(self.snapshot()['balance_cents'],49000)
