"""Durable shopping sessions: one receipt, one stock transfer, one payment."""
from datetime import date,datetime,timedelta
from decimal import Decimal,InvalidOperation,ROUND_HALF_UP
import hashlib,json,re

def initialise(c):
 c.executescript('''CREATE TABLE IF NOT EXISTS grocery_links(client_key TEXT PRIMARY KEY,shopping_id INTEGER NOT NULL,food_id INTEGER);
 CREATE TABLE IF NOT EXISTS grocery_receipts(operation_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS grocery_reminders(food_id INTEGER NOT NULL,reminder_id INTEGER NOT NULL,PRIMARY KEY(food_id,reminder_id));''')

def cents(value,optional=False):
 if optional and value in (None,''):return None
 try:
  d=Decimal(str(value).replace(',','.'))
  if not d.is_finite() or d<0 or d>Decimal('1000000'):raise ValueError()
  return int((d*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
 except (InvalidOperation,ValueError,TypeError):raise ValueError('Prix invalide. Indique un montant positif ou zéro.')

def expiry(value):
 if not value:return None
 try:return date.fromisoformat(str(value)).isoformat()
 except ValueError:raise ValueError('Date de péremption invalide.')

def snapshot(c):
 cart=[]
 for r in c.execute('SELECT * FROM shopping_items WHERE archived=0 ORDER BY id'):
  x=dict(r);x['key']='pc-'+str(x['id']);cart.append(x)
 foods=[]
 for r in c.execute("SELECT f.*,g.client_key FROM food_items f LEFT JOIN grocery_links g ON g.food_id=f.id WHERE f.status='active' ORDER BY f.expiry_date IS NULL,f.expiry_date,f.id"):
  x=dict(r);x['key']=x.pop('client_key') or 'food-'+str(x['id']);foods.append(x)
 return {'cart':cart,'foods':foods}

def sync_reminders(c,food_id,ts):
 for row in c.execute('SELECT reminder_id FROM grocery_reminders WHERE food_id=?',(food_id,)).fetchall():c.execute('DELETE FROM reminders WHERE id=?',(row[0],))
 c.execute('DELETE FROM grocery_reminders WHERE food_id=?',(food_id,))
 food=c.execute('SELECT * FROM food_items WHERE id=?',(food_id,)).fetchone()
 if not food or food['status']!='active' or not food['expiry_date']:return
 end=date.fromisoformat(food['expiry_date'])
 for delta in (3,2,0):
  day=end-timedelta(days=delta)
  if day<date.today():continue
  label='aujourd’hui' if delta==0 else 'dans '+str(delta)+' jours'
  cur=c.execute("INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES('standalone',?,?,?,'pending',?)",(-food_id,food['name']+' · à consommer '+label,day.isoformat()+'T09:00',ts))
  c.execute('INSERT INTO grocery_reminders VALUES(?,?)',(food_id,cur.lastrowid))

def _row(c,item,ts):
 if not isinstance(item,dict):raise ValueError('Article invalide.')
 key=str(item.get('key',''))
 if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',key):raise ValueError('Identifiant d’article invalide.')
 link=c.execute('SELECT * FROM grocery_links WHERE client_key=?',(key,)).fetchone()
 sid=link['shopping_id'] if link else item.get('id')
 if sid is not None and (type(sid) is not int or sid<1):raise ValueError('Identifiant PC invalide.')
 old=c.execute('SELECT * FROM shopping_items WHERE id=?',(sid,)).fetchone() if sid else None
 if sid and not old:raise LookupError('Cet article a été retiré du PC. Ta saisie reste sur cet appareil.')
 if old and old['archived']:raise LookupError('Cet article a déjà été acheté ou archivé. Actualise la liste.')
 name=str(item.get('name','')).strip()
 if not 1<=len(name)<=120:raise ValueError('Indique le nom de l’aliment (120 caractères maximum).')
 price=cents(item.get('price'),True);price=None if price is None else price/100
 count=item.get('purchase_count',old['purchase_count'] if old else 1)
 if type(count) is not int or not 1<=count<=1000:raise ValueError('Quantité invalide.')
 values={'name':name,'price':price,'purchase_count':count,'checked':1 if item.get('checked') else 0}
 if old:
  base=item.get('base')
  if not isinstance(base,dict):raise LookupError('Version d’origine manquante. Actualise avant de modifier.')
  for field,val in values.items():
   if field not in base or (old[field]!=base[field] and old[field]!=val):raise LookupError('Modifié sur un autre appareil : '+field+'. Ta version est conservée.')
  c.execute('UPDATE shopping_items SET name=?,price=?,purchase_count=?,checked=?,updated_at=? WHERE id=?',(*values.values(),ts,sid))
 else:
  sid=c.execute("INSERT INTO shopping_items(name,price,purchase_count,checked,created_at,updated_at) VALUES(?,?,?,?,?,?)",(*values.values(),ts,ts)).lastrowid
 if not link:
  try:c.execute('INSERT INTO grocery_links(client_key,shopping_id) VALUES(?,?)',(key,sid))
  except Exception:raise LookupError('Cet article est déjà synchronisé. Actualise la liste.')
 return dict(c.execute('SELECT * FROM shopping_items WHERE id=?',(sid,)).fetchone()),key

def action(c,kind,body,ts):
 op=body.get('operation_id')
 if not isinstance(op,str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',op):raise ValueError('Identifiant de validation manquant.')
 fingerprint=hashlib.sha256(json.dumps([kind,body],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
 c.execute('BEGIN IMMEDIATE')
 old=c.execute('SELECT * FROM grocery_receipts WHERE operation_id=?',(op,)).fetchone()
 if old:
  if old['fingerprint']!=fingerprint:raise LookupError('Une validation différente utilise le même identifiant.')
  return json.loads(old['response'])
 if kind in ('cart','checkout','remove'):
  items=body.get('items')
  if not isinstance(items,list) or not 1<=len(items)<=500:raise ValueError('Choisis de 1 à 500 articles.')
  if len({i.get('key') for i in items if isinstance(i,dict)})!=len(items):raise ValueError('Article répété dans cette validation.')
  rows=[(_row(c,item,ts),item) for item in items]
  result={'ok':True,'cart':[dict(row,id=row['id'],key=key) for ((row,key),_) in rows]}
  if kind=='remove':
   for ((row,key),_) in rows:c.execute('UPDATE shopping_items SET archived=1,updated_at=? WHERE id=?',(ts,row['id']))
   result={'ok':True}
  if kind=='checkout':
   day=date.today().isoformat();total=0;foods=[];ids=set()
   for ((row,key),item) in rows:
    if row['id'] in ids:raise ValueError('Le même article apparaît deux fois.')
    ids.add(row['id']);price=cents(row['price']);total+=price*row['purchase_count']
    due=expiry(item.get('expiry_date'))
    fid=c.execute("INSERT INTO food_items(name,quantity,units_count,price,calories,expiry_date,expiry_mode,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'','active',?,?)",(row['name'],row['quantity'],row['purchase_count'],row['price'],row['calories'],due,'date' if due else 'none',ts,ts)).lastrowid
    c.execute('UPDATE shopping_items SET archived=1,checked=1,updated_at=? WHERE id=?',(ts,row['id']))
    c.execute('UPDATE grocery_links SET food_id=? WHERE client_key=?',(fid,key));sync_reminders(c,fid,ts)
    foods.append(dict(c.execute('SELECT * FROM food_items WHERE id=?',(fid,)).fetchone(),key=key))
   budget=c.execute("INSERT INTO budget_entries(scheduled_date,title,kind,category,amount_cents,status,source,actual_date,notes,created_at) VALUES(?,?,'expense','Alimentation',?,'confirmed','manual',?,?,?)",(day,'Courses · '+datetime.now().strftime('%d/%m'),total,day,'Achat validé manuellement · '+op,ts)).lastrowid
   result={'ok':True,'foods':foods,'total_cents':total,'budget_entry_id':budget}
 elif kind=='food':
  key=str(body.get('key',''));link=c.execute('SELECT food_id FROM grocery_links WHERE client_key=?',(key,)).fetchone()
  fid=link['food_id'] if link else int(key[5:]) if key.startswith('food-') and key[5:].isdigit() else None
  row=c.execute('SELECT * FROM food_items WHERE id=?',(fid,)).fetchone()
  if not row:raise LookupError('Inventaire en attente de confirmation du PC.')
  due=expiry(body.get('expiry_date'));status=body.get('status','active')
  if status not in ('active','consumed','discarded'):raise ValueError('État d’inventaire invalide.')
  if row['expiry_date']!=body.get('base_expiry') and row['expiry_date']!=due:raise LookupError('Cette date a changé sur le PC. Ta saisie reste conservée.')
  c.execute('UPDATE food_items SET expiry_date=?,expiry_mode=?,status=?,updated_at=? WHERE id=?',(due,'date' if due else 'none',status,ts,fid));sync_reminders(c,fid,ts)
  result={'ok':True,'foods':[dict(c.execute('SELECT * FROM food_items WHERE id=?',(fid,)).fetchone(),key=key)]}
 else:raise ValueError('Action de courses inconnue.')
 c.execute('INSERT INTO grocery_receipts VALUES(?,?,?)',(op,fingerprint,json.dumps(result,ensure_ascii=False)))
 return result
