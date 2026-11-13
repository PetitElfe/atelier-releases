import unittest,sys,json,types
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
import test_admin_contacts as Fixtures
import admin_workspace as A,admin_support as C,alimentation as F
class DailyTests(unittest.TestCase):
 setUp=Fixtures.ContactTests.setUp
 tearDown=Fixtures.ContactTests.tearDown
 fixture=Fixtures.ContactTests.fixture
 case=Fixtures.ContactTests.case
 def test_shared_contacts_validate_links_and_unlink_without_deleting(self):
  self.fixture();one=self.case();two=self.case(title='Autre démarche')
  result=C.command(self.c,'/contact',{'admin_id':one['admin_id'],'name':'Accueil','email':'a@example.org','phone':'05 61 00 00 00','address':'Toulouse','website':'https://example.org'},A)
  C.command(self.c,'/contact-link',{'admin_id':two['admin_id'],'contact_id':result['contact_id']},A)
  self.assertEqual(len(C.snapshot(self.c)['contact_links']),2)
  C.command(self.c,'/contact-link',{'admin_id':one['admin_id'],'contact_id':result['contact_id'],'unlink':True},A)
  self.assertEqual(len(C.snapshot(self.c)['contact_book']),1)
  with self.assertRaises(ValueError):C.command(self.c,'/contact',{'name':'Test','website':'javascript:alert(1)'},A)
  with self.assertRaises(LookupError):C.command(self.c,'/contact',{'contact_id':result['contact_id'],'revision':0,'name':'Stale'},A)
 def test_missing_product_nutrients_are_missing_and_not_zero(self):
  item=F.clean_product({'code':'12345678','product_name':'Fixture','nutriments':{'salt_100g':1.2,'proteins_100g':float('nan')},'nutrient_levels':{'salt':'high'}})
  self.assertEqual(item['nutrients'],{'salt':1.2});self.assertNotIn('iron',item['nutrients'])
  with self.assertRaises(ValueError):F.validate('product',{'name':'X','nutrients':{'salt':-2}})
  with self.assertRaises(ValueError):F.lookup('http://localhost/')
  with self.assertRaises(ValueError):F.validate('meal',{'day':'2026-11-13','items':[{'grams':0,'product':item}]})
 def test_multiple_documents_in_different_folders_are_linked_not_copied(self):
  self.fixture();case=self.case();(self.root/'a').mkdir();(self.root/'b').mkdir();(self.root/'a'/'one.pdf').write_bytes(b'%PDF-fixture');(self.root/'b'/'two.docx').write_bytes(b'PKfixture');(self.root/'admin-workspace.json').write_text(json.dumps({'root':str(self.root)}))
  result=A.native(self.c,self.root,{'action':'register-many','admin_id':case['admin_id'],'kind':'document','paths':['a/one.pdf','b/two.docx']});self.assertEqual(len(result['files']),2);self.assertEqual(len(A.snapshot(self.c)['files']),2);self.assertEqual(len(list(self.root.rglob('*.pdf'))),1)
  with self.assertRaises(ValueError):A.native(self.c,self.root,{'action':'register-many','paths':['../outside.pdf']})
 def test_native_edit_menus_enabled_without_enabling_devtools(self):
  import desktop_shell
  settings=types.SimpleNamespace(AreDefaultContextMenusEnabled=False,AreDevToolsEnabled=False)
  class Edge:
   def on_webview_ready(self,sender,args):settings.AreDefaultContextMenusEnabled=False
  fake=types.ModuleType('webview.platforms.edgechromium');fake.EdgeChrome=Edge
  with patch.dict(sys.modules,{'webview.platforms.edgechromium':fake}):
   desktop_shell.enable_native_editing_menus();Edge().on_webview_ready(types.SimpleNamespace(CoreWebView2=types.SimpleNamespace(Settings=settings)),None)
  self.assertTrue(settings.AreDefaultContextMenusEnabled);self.assertFalse(settings.AreDevToolsEnabled)
