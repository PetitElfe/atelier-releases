import unittest,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import test_admin_planning as Fixtures
import admin_workspace as A,admin_planning as P
class ContactTests(unittest.TestCase):
 setUp=Fixtures.PlanningTests.setUp
 tearDown=Fixtures.PlanningTests.tearDown
 fixture=Fixtures.PlanningTests.fixture
 case=Fixtures.PlanningTests.case
 def test_contact_validation_save_clear_and_keep_on_legacy_edit(self):
  self.fixture();result=self.case(contact={'name':'Accueil Mission locale','phone':'05 61 00 00 00'})
  snapshot=A.snapshot(self.c);self.assertEqual(snapshot['contacts'][str(result['admin_id'])]['phone'],'05 61 00 00 00')
  item=next(x for x in snapshot['cases'] if x['id']==result['admin_id']);task=snapshot['actions'][0]
  self.case(admin_id=item['id'],base_updated_at=item['updated_at'],action_revision=task['revision'])
  self.assertEqual(A.snapshot(self.c)['contacts'][str(item['id'])]['name'],'Accueil Mission locale')
  for phone in ['javascript:alert(1)','+33#123','05\n61','1234567890123456789']:
   with self.assertRaises(ValueError):P.contact({'phone':phone})
  self.assertEqual(P.contact({'name':'','phone':''}),{'name':'','phone':''})
 def test_stale_phone_state_does_not_advance_another_occurrence(self):
  self.fixture();result=self.case();item=next(x for x in A.snapshot(self.c)['cases'] if x['id']==result['admin_id'])
  body={'admin_id':item['id'],'state':'done','base_updated_at':item['updated_at']}
  P.command(self.c,'/api/admin-workspace/case-state',body,A)
  with self.assertRaises(LookupError):P.command(self.c,'/api/admin-workspace/case-state',body,A)
  self.assertEqual(len(A.snapshot(self.c)['actions']),2)
 def test_mobile_does_not_allow_native_or_other_installation(self):
  class Handler:
   headers={'Content-Length':'70'}
   def _body(self):return {'installation_id':'wrong','action':'browse'}
   def _json(self,value,status=200):self.result=(value,status)
  db=self.root/'test.db';self.c.commit();self.c.backup(__import__('sqlite3').connect(db));h=Handler()
  with patch.object(A,'native',side_effect=AssertionError('No native file access')):
   for path in ['/api/mobile/admin-workspace/native','/api/mobile/admin-workspace/dossier']:
    A.serve(h,'POST',path,self.root,db,8876);self.assertIn(h.result[1],(400,409))
