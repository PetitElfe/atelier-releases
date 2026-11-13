"""Optional product lookup and meal records. Missing nutrients never mean zero."""
import json,math,re,sqlite3,uuid,time,threading
from contextlib import closing
from datetime import datetime
from urllib.request import Request,urlopen
from urllib.error import URLError
NUTRIENTS=('energy-kcal','proteins','carbohydrates','sugars','fat','saturated-fat','fiber','salt','iron','calcium','magnesium','potassium','vitamin-c','vitamin-d','vitamin-b12','folates')
_LOCK=threading.Lock();_CACHE={};_LAST=0
def initialise(c):
 c.executescript('CREATE TABLE IF NOT EXISTS alimentation_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);CREATE TABLE IF NOT EXISTS alimentation_operations(id TEXT PRIMARY KEY,result TEXT NOT NULL);')
def clean_product(product):
 values={}
 for key in NUTRIENTS:
  value=product.get('nutriments',{}).get(key+'_100g')
  if isinstance(value,(int,float)) and math.isfinite(value) and 0<=value<=1000000:values[key]=value
 code=str(product.get('code',''))
 return {'name':str(product.get('product_name') or product.get('product_name_fr') or 'Produit')[:200],'barcode':code if re.fullmatch(r'\d{8,14}',code) else '', 'nutrients':values,'levels':{k:v for k,v in product.get('nutrient_levels',{}).items() if k in ('sugars','salt','fat','saturated-fat') and v in ('low','moderate','high')},'source':'Open Food Facts','source_url':'https://world.openfoodfacts.org/product/'+code if re.fullmatch(r'\d{8,14}',code) else 'https://world.openfoodfacts.org','read_at':datetime.now().isoformat()}
def lookup(code):
 global _LAST
 if not re.fullmatch(r'\d{8,14}',str(code)):raise ValueError('Indique les 8 à 14 chiffres du code-barres.')
 with _LOCK:
  if code in _CACHE:return _CACHE[code]
  if time.monotonic()-_LAST<1:raise ValueError('Attends une seconde avant une nouvelle recherche.')
  _LAST=time.monotonic()
 request=Request('https://world.openfoodfacts.org/api/v2/product/'+code+'?fields=code,product_name,product_name_fr,nutriments,nutrient_levels',headers={'User-Agent':'LAtelierDuGoblin/0.18.0 (https://github.com/PetitElfe/atelier-releases)'})
 try:
  with urlopen(request,timeout=8) as response:
   if response.url.split('/')[2] not in ('world.openfoodfacts.org','fr.openfoodfacts.org'):raise ValueError('Redirection refusée.')
   raw=response.read(2000001)
  if len(raw)>2000000:raise ValueError('Réponse trop volumineuse.')
  data=json.loads(raw)
 except (URLError,OSError,ValueError) as e:raise ValueError('Recherche indisponible. Tu peux réessayer ou saisir les valeurs de l’emballage.') from e
 if not data.get('product'):raise ValueError('Produit introuvable dans Open Food Facts.')
 result=clean_product(data['product']);_CACHE[code]=result;return result
def validate(kind,data):
 if not isinstance(data,dict) or len(json.dumps(data))>100000:raise ValueError('Données alimentaires invalides.')
 if kind=='profile':
  for key,limits in {'weight':(20,400),'height':(100,250),'age':(18,120)}.items():
   if data.get(key) not in ('',None):
    value=float(data[key])
    if not math.isfinite(value) or not limits[0]<=value<=limits[1]:raise ValueError('Profil invalide : '+key)
  return {k:data[k] for k in ('weight','height','age','sex','notes') if k in data}
 if kind=='product':
  if not str(data.get('name','')).strip():raise ValueError('Nom du produit requis.')
  for k,v in data.get('nutrients',{}).items():
   if k not in NUTRIENTS or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1000000:raise ValueError('Valeur nutritionnelle invalide.')
  return data
 if kind=='quick':
  if not 1<=len(str(data.get('title','')).strip())<=180:raise ValueError('Nom du repas requis.')
  if len(str(data.get('notes','')))>8000:raise ValueError('Notes trop longues.')
  return {'title':data['title'],'notes':str(data.get('notes','')),'ingredients':str(data.get('ingredients',''))[:8000]}
 if kind=='meal':
  from datetime import date
  date.fromisoformat(data['day'])
  if not isinstance(data.get('items'),list) or not 1<=len(data['items'])<=80:raise ValueError('Ajoute au moins un aliment au repas.')
  for item in data['items']:
   grams=float(item.get('grams',0))
   if not math.isfinite(grams) or not 0<grams<=5000:raise ValueError('Portion invalide.')
   validate('product',item['product'])
  return data
 if kind=='cycle-plan':
  from datetime import date
  date.fromisoformat(data['last']);date.fromisoformat(data['next']);return {'last':data['last'],'next':data['next']}
 raise ValueError('Type inconnu.')
def serve(h,method,path,database):
 if not path.startswith('/api/alimentation'):return False
 try:
  if method=='GET':
   from urllib.parse import urlparse,parse_qs
   query=parse_qs(urlparse(h.path).query)
   if path=='/api/alimentation/lookup':h._json(lookup(query.get('code',[''])[0]));return True
   with closing(sqlite3.connect(database)) as c:
    c.row_factory=sqlite3.Row;records=[{'id':r['id'],'kind':r['kind'],'data':json.loads(r['data_json']),'revision':r['revision']} for r in c.execute('SELECT * FROM alimentation_records')]
   import utility_safety
   from pathlib import Path
   h._json({'records':records,'installation_id':utility_safety.identity(Path(database).parent)});return True
  if method!='POST':raise ValueError('Méthode inconnue.')
  origin=h.headers.get('Origin')
  if origin and origin!='http://'+h.headers.get('Host',''):raise ValueError('Origine refusée.')
  if int(h.headers.get('Content-Length','0'))>160000:raise ValueError('Requête trop volumineuse.')
  body=h._body()
  if body.get('expected_installation_id'):
   import utility_safety
   from pathlib import Path
   if body['expected_installation_id']!=utility_safety.identity(Path(database).parent):raise LookupError('Cette adresse correspond à une autre installation du PC.')
  operation=str(body.get('operation_id',''))
  if not re.fullmatch('[a-f0-9-]{36}',operation):raise ValueError('Identifiant invalide.')
  with closing(sqlite3.connect(database,timeout=15)) as c:
   c.execute('BEGIN IMMEDIATE');prior=c.execute('SELECT result FROM alimentation_operations WHERE id=?',(operation,)).fetchone()
   if prior:h._json(json.loads(prior[0]));return True
   identity=str(body.get('id') or uuid.uuid4());kind=body['kind'];data=validate(kind,body['data']);old=c.execute('SELECT revision,kind FROM alimentation_records WHERE id=?',(identity,)).fetchone()
   if old and old[1]!=kind:raise ValueError('Type de donnée différent.')
   if old and old[0]!=body.get('revision'):raise LookupError('Cet élément a été modifié ailleurs. Actualise avant de réessayer.')
   revision=(old[0]+1) if old else 1;c.execute('INSERT INTO alimentation_records VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,revision=excluded.revision',(identity,kind,json.dumps(data),revision));result={'id':identity,'revision':revision};c.execute('INSERT INTO alimentation_operations VALUES(?,?)',(operation,json.dumps(result)));c.commit();h._json(result)
 except LookupError as e:h._json({'error':str(e)},409)
 except (ValueError,KeyError,TypeError,OSError,sqlite3.Error) as e:h._json({'error':str(e)},400)
 return True
