"""Shopping receipts must atomically transfer stock and confirm exactly one payment."""
from datetime import date,timedelta
import uuid
import unittest
import test_budget_removal as fixture
import groceries

class GroceriesTests(unittest.TestCase):
 setUp=fixture.BudgetRemovalTests.setUp
 tearDown=fixture.BudgetRemovalTests.tearDown
 def run_action(self,kind,body):
  try:
   result=groceries.action(self.c,kind,body,'2026-11-12T10:00');self.c.commit();return result
  except Exception:self.c.rollback();raise
 def prepare(self):
  groceries.initialise(self.c)
  return {'key':'phone-test-1','name':'Lait','price':2.25,'purchase_count':2,'checked':1,'base':None}
 def job(self,**kw):return dict(operation_id='grocery-'+str(uuid.uuid4()),**kw)
 def test_lost_response_replay_and_single_payment(self):
  row=self.prepare();cart=self.job(items=[row]);self.run_action('cart',cart);self.run_action('cart',cart)
  row['base']={k:row[k] for k in ('name','price','purchase_count','checked')};checkout=self.job(items=[row]);a=self.run_action('checkout',checkout);b=self.run_action('checkout',checkout)
  self.assertEqual(a,b);self.assertEqual(a['total_cents'],450)
  self.assertEqual(self.c.execute('select count(*) from budget_entries').fetchone()[0],1)
  self.assertEqual(self.c.execute('select count(*) from food_items').fetchone()[0],1)
  snap=fixture.namespace['budget_snapshot'](self.c,date.today().replace(day=1),'test')
  self.assertEqual(snap['balance_cents'],99550)
  with self.assertRaises(LookupError):self.run_action('checkout',self.job(items=[row]))
 def test_missing_price_rolls_back_everything(self):
  row=self.prepare();row['price']=None
  with self.assertRaises(ValueError):self.run_action('checkout',self.job(items=[row]))
  for table in ('shopping_items','food_items','budget_entries','grocery_receipts'):self.assertEqual(self.c.execute('select count(*) from '+table).fetchone()[0],0)
 def test_optional_dates_and_three_reminders_replaced_and_cancelled(self):
  row=self.prepare();self.run_action('checkout',self.job(items=[row]))
  self.assertEqual(self.c.execute('select count(*) from reminders').fetchone()[0],0)
  due=(date.today()+timedelta(days=8)).isoformat();body=self.job(key=row['key'],expiry_date=due,base_expiry=None,status='active')
  self.run_action('food',body);self.run_action('food',body)
  expected=[(date.fromisoformat(due)-timedelta(days=n)).isoformat()+'T09:00' for n in (3,2,0)]
  self.assertEqual([r[0] for r in self.c.execute('select remind_at from reminders order by remind_at')],expected)
  self.run_action('food',self.job(key=row['key'],expiry_date=None,base_expiry=due,status='active'))
  self.assertEqual(self.c.execute('select count(*) from reminders').fetchone()[0],0)
 def test_conflict_preserves_pc_and_no_financial_write_before_finish(self):
  row=self.prepare();self.run_action('cart',self.job(items=[row]));old=dict(row);old['base']={k:row[k] for k in ('name','price','purchase_count','checked')};old['name']='Version téléphone'
  self.c.execute("update shopping_items set name='Version PC'");self.c.commit()
  with self.assertRaises(LookupError):self.run_action('cart',self.job(items=[old]))
  self.assertEqual(self.c.execute('select name from shopping_items').fetchone()[0],'Version PC')
  self.assertEqual(self.c.execute('select count(*) from budget_entries').fetchone()[0],0)
 def test_remove_archives_without_stock_or_payment(self):
  row=self.prepare();self.run_action('remove',self.job(items=[row]));self.assertEqual(groceries.snapshot(self.c)['cart'],[])
  for table in ('food_items','budget_entries'):self.assertEqual(self.c.execute('select count(*) from '+table).fetchone()[0],0)
