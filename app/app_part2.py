class Handler(BaseHTTPRequestHandler):
    server_version = 'AtelierLocal/' + atelier_version()

    def log_message(self, fmt, *args):
        print('[Atelier]', fmt % args)

    def _json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self):
        n = int(self.headers.get('Content-Length', '0') or 0)
        if not n: return {}
        try: return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception: return {}

    def _serve_static(self, path):
        rel = 'index.html' if path in ('','/') else path.lstrip('/')
        target = (PUBLIC / rel).resolve()
        if PUBLIC.resolve() not in target.parents and target != PUBLIC.resolve():
            self.send_error(403); return
        if not target.exists() or not target.is_file():
            target = PUBLIC / 'index.html'
        data = target.read_bytes()
        ctype = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', ctype + ('; charset=utf-8' if ctype.startswith('text/') or ctype.endswith('javascript') else ''))
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path); p = u.path; q = parse_qs(u.query)
        if not p.startswith('/api/'):
            return self._serve_static(p)
        if p == '/api/version':
            return self._json({'version': atelier_version()})
        if p == '/api/runtime-version':
            return self._json({'version':atelier_version()})
        with conn() as c:
            if p == '/api/habits':
                rows=[dict(row) for row in c.execute('SELECT * FROM habits WHERE archived=0 ORDER BY id')]
                for row in rows:
                    row['checked_dates']=[x['checked_date'] for x in c.execute('SELECT checked_date FROM habit_checks WHERE habit_id=? ORDER BY checked_date DESC LIMIT 90',(row['id'],))]
                return self._json(rows)
            if p == '/api/cycle-periods':
                return self._json([dict(row) for row in c.execute('SELECT * FROM menstrual_periods ORDER BY start_date DESC,id DESC LIMIT 120')])
            if p == '/api/events':
                start = q.get('start', ['1900-01-01'])[0]; end = q.get('end', ['2100-12-31'])[0]
                rows = c.execute('SELECT * FROM events WHERE event_date <= ? ORDER BY event_date,start_time,id', (end,)).fetchall()
                expanded = expand_events(rows, start, end)
                done_rows = c.execute('SELECT event_id,instance_date,completed_at FROM event_completions WHERE instance_date BETWEEN ? AND ?', (start,end)).fetchall()
                done_map = {(r['event_id'],r['instance_date']): r['completed_at'] for r in done_rows}
                action_rows = c.execute('SELECT event_id,instance_date,action,moved_event_id,action_at FROM event_instance_actions WHERE instance_date BETWEEN ? AND ?', (start,end)).fetchall()
                action_map = {(r['event_id'],r['instance_date']): dict(r) for r in action_rows}
                for e in expanded:
                    key = (e['id'], e.get('instance_date') or e['event_date'])
                    completed_at = done_map.get(key)
                    action = action_map.get(key)
                    e['instance_done'] = bool(completed_at)
                    e['instance_completed_at'] = completed_at or ''
                    e['instance_action'] = action['action'] if action else ''
                    e['moved_event_id'] = action['moved_event_id'] if action else None
                    e['instance_action_at'] = action['action_at'] if action else ''
                return self._json(expanded)
            if p == '/api/event-template':
                title = (q.get('title', [''])[0] or '').strip()
                if not title:
                    return self._json({'found': False})
                row = c.execute(
                    '''SELECT category,contact,travel_time
                       FROM events
                       WHERE lower(trim(title)) = lower(trim(?))
                       ORDER BY event_date DESC, updated_at DESC, id DESC
                       LIMIT 1''',
                    (title,)
                ).fetchone()
                if not row:
                    return self._json({'found': False})
                data = dict(row); data['found'] = True
                return self._json(data)
            if p == '/api/tasks':
                rows = c.execute('''SELECT t.*,o.title AS objective_title,o.node_type AS objective_node_type
                                    FROM tasks t
                                    LEFT JOIN objective_nodes o ON o.id=t.objective_node_id
                                    WHERE t.archived=0
                                    ORDER BY t.completed,t.important DESC,COALESCE(t.due_date,'9999-12-31'),t.order_index,t.id''').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/objective-nodes':
                rows=c.execute('''SELECT o.*,
                                         (SELECT COUNT(*) FROM objective_nodes ch WHERE ch.parent_id=o.id) AS child_count,
                                         (SELECT COUNT(*) FROM tasks t WHERE t.objective_node_id=o.id AND t.archived=0) AS task_count
                                  FROM objective_nodes o
                                  ORDER BY COALESCE(o.parent_id,0),o.order_index,o.id''').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/objective-library':
                node_id=int_or_none(q.get('node_id',[None])[0])
                if not node_id:
                    return self._json({'sections':[]})
                sections=c.execute('''SELECT * FROM objective_library_sections
                                      WHERE node_id=? ORDER BY order_index,id''',(node_id,)).fetchall()
                data=[]
                for section in sections:
                    item=dict(section)
                    entries=c.execute('''SELECT * FROM objective_library_entries
                                         WHERE section_id=? ORDER BY order_index,id''',(section['id'],)).fetchall()
                    item['entries']=[dict(x) for x in entries]
                    data.append(item)
                return self._json({'sections':data})
            if p == '/api/shopping':
                rows = c.execute('SELECT * FROM shopping_items WHERE archived=0 ORDER BY checked, id').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/foods':
                rows = c.execute("""SELECT * FROM food_items WHERE status='active'
                                    ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date='' THEN 1 ELSE 0 END,
                                             expiry_date, id""").fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/recipe-books':
                rows = c.execute('''SELECT b.id,b.name,COUNT(r.id) AS recipe_count
                                    FROM recipe_books b
                                    LEFT JOIN recipes r ON r.book_id=b.id AND r.archived=0
                                    GROUP BY b.id,b.name
                                    ORDER BY b.id''').fetchall()
                return self._json([dict(r) for r in rows])
            if p in ('/api/recipes','/api/meals'):
                rows = c.execute('''SELECT r.*,b.name AS book_name
                                    FROM recipes r
                                    LEFT JOIN recipe_books b ON b.id=r.book_id
                                    WHERE r.archived=0
                                    ORDER BY lower(r.title),r.id''').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/meal-ideas':
                rows = c.execute('''SELECT m.id AS idea_id,r.*,b.name AS book_name
                                    FROM meal_idea_links m
                                    JOIN recipes r ON r.id=m.recipe_id
                                    LEFT JOIN recipe_books b ON b.id=r.book_id
                                    WHERE r.archived=0
                                    ORDER BY m.created_at DESC,m.id DESC''').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/reminders':
                rows = c.execute('''
                    SELECT * FROM reminders
                    WHERE status != 'done'
                    ORDER BY COALESCE(snoozed_until,remind_at),id
                ''').fetchall()
                data=[]
                for row in rows:
                    item=dict(row); item['entity_title']=''
                    if item['entity_type']=='event':
                        linked=c.execute('SELECT title FROM events WHERE id=?',(item['entity_id'],)).fetchone()
                        item['entity_title']=linked['title'] if linked else ''
                    elif item['entity_type']=='task':
                        linked=c.execute('SELECT title FROM tasks WHERE id=?',(item['entity_id'],)).fetchone()
                        item['entity_title']=linked['title'] if linked else ''
                    data.append(item)
                return self._json(data)
            if p == '/api/reminders/due':
                now = q.get('now', [now_iso()])[0]
                rows = c.execute('''
                    SELECT * FROM reminders
                    WHERE status='pending' AND COALESCE(snoozed_until,remind_at) <= ?
                    ORDER BY COALESCE(snoozed_until,remind_at), id
                ''', (now,)).fetchall()
                data=[]
                for row in rows:
                    item=dict(row); item['entity_title']=''
                    if item['entity_type']=='event':
                        linked=c.execute('SELECT title FROM events WHERE id=?',(item['entity_id'],)).fetchone()
                        item['entity_title']=linked['title'] if linked else ''
                    elif item['entity_type']=='task':
                        linked=c.execute('SELECT title FROM tasks WHERE id=?',(item['entity_id'],)).fetchone()
                        item['entity_title']=linked['title'] if linked else ''
                    data.append(item)
                return self._json(data)
        return self._json({'error':'not found'},404)

    def do_POST(self):
        u = urlparse(self.path); p = u.path; body = self._body(); ts = now_iso()
        if p == '/api/version':
            return self._json({'version': atelier_version()})
        if p == '/api/shutdown':
            self._json({'ok':True,'version':atelier_version()})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if p == '/api/recipe-import-url':
            try:
                return self._json(import_recipe_from_url(body.get('url','')))
            except ValueError as exc:
                return self._json({'error':str(exc)},400)
            except Exception as exc:
                print('[Atelier] Import recette URL:', exc)
                return self._json({'error':"Impossible de lire cette page. Vérifie le lien ou essaie une autre recette."},502)
        with conn() as c:
            if p == '/api/habits':
                title=str(body.get('title','')).strip()[:120]
                if not title: return self._json({'error':'Le nom est requis.'},400)
                freq='weekly' if body.get('frequency')=='weekly' else 'daily'
                try: target=max(1,min(7,int(body.get('target_per_week',7 if freq=='daily' else 3))))
                except (ValueError,TypeError): return self._json({'error':'Objectif hebdomadaire incorrect.'},400)
                cur=c.execute('INSERT INTO habits(title,frequency,target_per_week,created_at,updated_at) VALUES(?,?,?,?,?)',(title,freq,target,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
            if p == '/api/cycle-periods':
                try:
                    start=date.fromisoformat(str(body.get('start_date','')))
                    end=date.fromisoformat(str(body['end_date'])) if body.get('end_date') else None
                except (ValueError,TypeError): return self._json({'error':'Dates invalides.'},400)
                if end and (end<start or (end-start).days>20): return self._json({'error':'La période de règles ne peut pas dépasser 21 jours.'},400)
                cur=c.execute('INSERT INTO menstrual_periods(start_date,end_date,notes,created_at) VALUES(?,?,?,?)',(start.isoformat(),end.isoformat() if end else None,str(body.get('notes',''))[:500],ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        with conn() as c:
            if p == '/api/reminders':
                title=(body.get('title') or '').strip()
                remind_at=(body.get('remind_at') or '').strip()
                if not title: return self._json({'error':'Le titre du rappel est requis.'},400)
                if not remind_at: return self._json({'error':'La date et l’heure du rappel sont requises.'},400)
                cur=c.execute('''INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,snoozed_until,created_at)
                                 VALUES('standalone',0,?,?,'pending',NULL,?)''',(title,remind_at,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/events':
                vals = (
                    body.get('title','').strip(), body.get('event_date'), body.get('start_time') or None, body.get('end_time') or None,
                    1 if body.get('all_day') else 0, body.get('category','general'), body.get('location',''), body.get('notes',''),
                    body.get('contact',''), body.get('travel_time',''), body.get('url',''), body.get('status','planned'), body.get('recurrence','none'),
                    1 if body.get('show_in_month', True) else 0, ts, ts)
                if not vals[0] or not vals[1]: return self._json({'error':'title and event_date required'},400)
                cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
                eid=cur.lastrowid
                for ra in body.get('reminders',[]) or []:
                    if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                    when = (ra or {}).get('remind_at')
                    if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('event',eid,(ra or {}).get('title',''),when,'pending',ts))
                c.commit(); return self._json({'id':eid},201)
            if p == '/api/objective-nodes':
                title=(body.get('title') or '').strip()
                node_type=(body.get('node_type') or 'objective').strip()
                parent_id=int_or_none(body.get('parent_id'))
                if not title: return self._json({'error':'Le nom est requis.'},400)
                if node_type not in ('domain','objective','milestone','step'):
                    return self._json({'error':'Type de nœud invalide.'},400)
                if parent_id and not c.execute('SELECT id FROM objective_nodes WHERE id=?',(parent_id,)).fetchone():
                    return self._json({'error':'Parent introuvable.'},404)
                oi=c.execute('SELECT COALESCE(MAX(order_index),0)+1 n FROM objective_nodes WHERE parent_id IS ?',(parent_id,)).fetchone()['n']
                progress=max(0,min(100,int_or_none(body.get('progress')) or 0))
                status=(body.get('status') or 'active').strip()
                if status not in ('active','paused','done'): status='active'
                if status=='done': progress=100
                cur=c.execute('''INSERT INTO objective_nodes(parent_id,node_type,title,description,status,progress,order_index,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?,?)''',
                              (parent_id,node_type,title,body.get('description',''),status,progress,oi,ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/objective-library-sections':
                node_id=int_or_none(body.get('node_id'))
                title=(body.get('title') or '').strip()
                section_type=(body.get('section_type') or 'resources').strip()
                if not node_id or not c.execute('SELECT id FROM objective_nodes WHERE id=?',(node_id,)).fetchone():
                    return self._json({'error':'Objectif introuvable.'},404)
                if not title: return self._json({'error':'Le nom de la section est requis.'},400)
                oi=c.execute('SELECT COALESCE(MAX(order_index),0)+1 n FROM objective_library_sections WHERE node_id=?',(node_id,)).fetchone()['n']
                cur=c.execute('''INSERT INTO objective_library_sections(node_id,title,section_type,order_index,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?)''',(node_id,title,section_type,oi,ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/objective-library-entries':
                section_id=int_or_none(body.get('section_id'))
                title=(body.get('title') or '').strip()
                if not section_id or not c.execute('SELECT id FROM objective_library_sections WHERE id=?',(section_id,)).fetchone():
                    return self._json({'error':'Section introuvable.'},404)
                if not title: return self._json({'error':'Le titre est requis.'},400)
                oi=c.execute('SELECT COALESCE(MAX(order_index),0)+1 n FROM objective_library_entries WHERE section_id=?',(section_id,)).fetchone()['n']
                cur=c.execute('''INSERT INTO objective_library_entries(section_id,title,url,notes,done,order_index,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?)''',
                              (section_id,title,body.get('url',''),body.get('notes',''),1 if body.get('done') else 0,oi,ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/tasks':
                title=body.get('title','').strip()
                if not title: return self._json({'error':'title required'},400)
                oi=c.execute('SELECT COALESCE(MAX(order_index),0)+1 n FROM tasks').fetchone()['n']
                objective_node_id=int_or_none(body.get('objective_node_id'))
                if objective_node_id and not c.execute('SELECT id FROM objective_nodes WHERE id=?',(objective_node_id,)).fetchone():
                    objective_node_id=None
                cur=c.execute('''INSERT INTO tasks(title,due_date,due_time,notes,completed,archived,important,objective_node_id,order_index,created_at,updated_at)
                                 VALUES(?,?,?,?,0,0,?,?,?,?,?)''',(title,body.get('due_date') or None,body.get('due_time') or None,body.get('notes',''),1 if body.get('important') else 0,objective_node_id,oi,ts,ts))
                tid=cur.lastrowid
                for ra in body.get('reminders',[]) or []:
                    if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                    when = (ra or {}).get('remind_at')
                    if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('task',tid,(ra or {}).get('title',''),when,'pending',ts))
                c.commit(); return self._json({'id':tid},201)
            if p == '/api/shopping':
                name=body.get('name','').strip()
                if not name: return self._json({'error':'name required'},400)
                count=max(1,int(body.get('purchase_count') or 1))
                cur=c.execute('''INSERT INTO shopping_items(name,quantity,purchase_count,price,calories,checked,archived,created_at,updated_at)
                                 VALUES(?,?,?,?,?,0,0,?,?)''',
                              (name,body.get('quantity',''),count,float_or_none(body.get('price')),float_or_none(body.get('calories')),ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/foods':
                name=body.get('name','').strip()
                if not name: return self._json({'error':'name required'},400)
                mode=(body.get('expiry_mode') or ('date' if body.get('expiry_date') else 'none')).strip()
                if mode not in ('pending','date','none'): mode='pending'
                expiry=(body.get('expiry_date') or None) if mode=='date' else None
                units=max(1,int(body.get('units_count') or 1))
                cur=c.execute('''INSERT INTO food_items(name,quantity,units_count,price,calories,expiry_date,expiry_mode,notes,status,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                              (name,body.get('quantity',''),units,float_or_none(body.get('price')),float_or_none(body.get('calories')),expiry,mode,body.get('notes',''),'active',ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/recipe-books':
                name=(body.get('name') or '').strip()
                if not name: return self._json({'error':'name required'},400)
                try:
                    cur=c.execute('INSERT INTO recipe_books(name,created_at) VALUES(?,?)',(name,ts))
                    c.commit(); return self._json({'id':cur.lastrowid},201)
                except sqlite3.IntegrityError:
                    row=c.execute('SELECT id FROM recipe_books WHERE lower(name)=lower(?)',(name,)).fetchone()
                    return self._json({'id':row['id'] if row else None,'existing':True})
            if p == '/api/meal-ideas':
                recipe_id=int_or_none(body.get('recipe_id'))
                if not recipe_id: return self._json({'error':'recipe_id required'},400)
                recipe=c.execute('SELECT id FROM recipes WHERE id=? AND archived=0',(recipe_id,)).fetchone()
                if not recipe: return self._json({'error':'recipe not found'},404)
                c.execute('INSERT OR IGNORE INTO meal_idea_links(recipe_id,created_at) VALUES(?,?)',(recipe_id,ts))
                c.commit()
                row=c.execute('SELECT id FROM meal_idea_links WHERE recipe_id=?',(recipe_id,)).fetchone()
                return self._json({'id':row['id'],'recipe_id':recipe_id},201)
            if p in ('/api/recipes','/api/meals'):
                title=body.get('title','').strip()
                if not title: return self._json({'error':'title required'},400)
                book_id=int_or_none(body.get('book_id'))
                if not book_id or not c.execute('SELECT id FROM recipe_books WHERE id=?',(book_id,)).fetchone():
                    row=c.execute("SELECT id FROM recipe_books WHERE name='À classer'").fetchone()
                    book_id=row['id'] if row else None
                cur=c.execute('''INSERT INTO recipes(title,book_id,notes,recipe,base_servings,ingredients_json,image_data,source_url,archived,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?,0,?,?)''',
                              (title,book_id,body.get('notes',''),body.get('recipe',''),max(1,int_or_none(body.get('base_servings')) or 1),
                               body.get('ingredients_json','[]'),body.get('image_data',''),body.get('source_url',''),ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
        return self._json({'error':'not found'},404)

    def do_PUT(self):
        u=urlparse(self.path); p=u.path; body=self._body(); ts=now_iso(); parts=p.strip('/').split('/')
        with conn() as c:
            if len(parts)==4 and parts[:2]==['api','habits'] and parts[3]=='check':
                try:
                    hid=int(parts[2]); when=date.fromisoformat(str(body.get('date','')))
                except (ValueError,TypeError): return self._json({'error':'Date invalide.'},400)
                if not c.execute('SELECT 1 FROM habits WHERE id=? AND archived=0',(hid,)).fetchone():return self._json({'error':'Habitude introuvable.'},404)
                if body.get('done',True):
                    c.execute('INSERT OR IGNORE INTO habit_checks(habit_id,checked_date,completed_at) VALUES(?,?,?)',(hid,when.isoformat(),ts))
                else:c.execute('DELETE FROM habit_checks WHERE habit_id=? AND checked_date=?',(hid,when.isoformat()))
                c.commit();return self._json({'ok':True})
            if len(parts)==3 and parts[:2]==['api','habits']:
                hid=int(parts[2]);title=str(body.get('title','')).strip()[:120]
                if not title:return self._json({'error':'Nom requis.'},400)
                freq='weekly' if body.get('frequency')=='weekly' else 'daily'
                try: target=max(1,min(7,int(body.get('target_per_week',7))))
                except (ValueError,TypeError): return self._json({'error':'Objectif invalide.'},400)
                c.execute('UPDATE habits SET title=?,frequency=?,target_per_week=?,updated_at=? WHERE id=?',(title,freq,target,ts,hid))
                c.commit();return self._json({'ok':True})
        with conn() as c:
            if len(parts)==3 and parts[0]=='api' and parts[1]=='recipe-books':
                bid=int(parts[2]); book=c.execute('SELECT * FROM recipe_books WHERE id=?',(bid,)).fetchone()
                if not book: return self._json({'error':'Livre introuvable.'},404)
                if book['name'].lower()=='à classer':
                    return self._json({'error':'Le livre « À classer » sert de rangement de secours et ne peut pas être renommé.'},400)
                name=(body.get('name') or '').strip()
                if not name: return self._json({'error':'Le nom du livre est requis.'},400)
                try:
                    c.execute('UPDATE recipe_books SET name=? WHERE id=?',(name,bid))
                    c.commit(); return self._json({'ok':True})
                except sqlite3.IntegrityError:
                    return self._json({'error':'Un livre porte déjà ce nom.'},409)
            if len(parts)==3 and parts[0]=='api' and parts[1]=='objective-nodes':
                oid=int(parts[2]); old=c.execute('SELECT * FROM objective_nodes WHERE id=?',(oid,)).fetchone()
                if not old: return self._json({'error':'Objectif introuvable.'},404)
                d=dict(old); d.update(body)
                title=(d.get('title') or '').strip()
                node_type=(d.get('node_type') or 'objective').strip()
                parent_id=int_or_none(d.get('parent_id'))
                if not title: return self._json({'error':'Le nom est requis.'},400)
                if node_type not in ('domain','objective','milestone','step'):
                    return self._json({'error':'Type de nœud invalide.'},400)
                if parent_id==oid: return self._json({'error':'Un élément ne peut pas être son propre parent.'},400)
                if parent_id:
                    parent=c.execute('SELECT id FROM objective_nodes WHERE id=?',(parent_id,)).fetchone()
                    if not parent: return self._json({'error':'Parent introuvable.'},404)
                    descendant=c.execute('''WITH RECURSIVE tree(id) AS (
                                              SELECT id FROM objective_nodes WHERE parent_id=?
                                              UNION ALL
                                              SELECT n.id FROM objective_nodes n JOIN tree t ON n.parent_id=t.id
                                            ) SELECT 1 FROM tree WHERE id=? LIMIT 1''',(oid,parent_id)).fetchone()
                    if descendant: return self._json({'error':'Impossible de déplacer un élément dans un de ses sous-éléments.'},400)
                progress=max(0,min(100,int_or_none(d.get('progress')) or 0))
                status=(d.get('status') or 'active').strip()
                if status not in ('active','paused','done'): status='active'
                if status=='done': progress=100
                c.execute('''UPDATE objective_nodes SET parent_id=?,node_type=?,title=?,description=?,status=?,progress=?,order_index=?,updated_at=?
                             WHERE id=?''',
                          (parent_id,node_type,title,d.get('description',''),status,progress,int_or_none(d.get('order_index')) or 0,ts,oid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='objective-library-sections':
                sid=int(parts[2]); old=c.execute('SELECT * FROM objective_library_sections WHERE id=?',(sid,)).fetchone()
                if not old: return self._json({'error':'Section introuvable.'},404)
                d=dict(old); d.update(body)
                title=(d.get('title') or '').strip()
                if not title: return self._json({'error':'Le nom de la section est requis.'},400)
                c.execute('''UPDATE objective_library_sections SET title=?,section_type=?,order_index=?,updated_at=? WHERE id=?''',
                          (title,d.get('section_type','resources'),int_or_none(d.get('order_index')) or 0,ts,sid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='objective-library-entries':
                eid=int(parts[2]); old=c.execute('SELECT * FROM objective_library_entries WHERE id=?',(eid,)).fetchone()
                if not old: return self._json({'error':'Ressource introuvable.'},404)
                d=dict(old); d.update(body)
                title=(d.get('title') or '').strip()
                if not title: return self._json({'error':'Le titre est requis.'},400)
                c.execute('''UPDATE objective_library_entries SET title=?,url=?,notes=?,done=?,order_index=?,updated_at=? WHERE id=?''',
                          (title,d.get('url',''),d.get('notes',''),1 if d.get('done') else 0,int_or_none(d.get('order_index')) or 0,ts,eid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==4 and parts[0]=='api' and parts[1]=='events' and parts[3]=='complete-instance':
                eid=int(parts[2]); instance_date=(body.get('instance_date') or '').strip()
                if not instance_date: return self._json({'error':'instance_date required'},400)
                if body.get('done', True):
                    c.execute('''INSERT INTO event_completions(event_id,instance_date,completed_at)
                                 VALUES(?,?,?)
                                 ON CONFLICT(event_id,instance_date) DO UPDATE SET completed_at=excluded.completed_at''',
                              (eid,instance_date,ts))
                else:
                    c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                c.commit(); return self._json({'ok':True})

            if len(parts)==4 and parts[0]=='api' and parts[1]=='events' and parts[3]=='postpone-instance':
                try:
                    eid=int(parts[2])
                    instance_date=(body.get('instance_date') or '').strip()
                    new_date=(body.get('new_date') or '').strip()
                    new_time=(body.get('new_time') or '').strip()
                    if not instance_date or not new_date or not new_time:
                        return self._json({'error':'Date et heure requises pour le report.'},400)
                    old=c.execute('SELECT * FROM events WHERE id=?',(eid,)).fetchone()
                    if not old: return self._json({'error':'Rendez-vous introuvable.'},404)

                    existing=c.execute('SELECT * FROM event_instance_actions WHERE event_id=? AND instance_date=?',(eid,instance_date)).fetchone()
                    moved_event_id=existing['moved_event_id'] if existing and existing['action']=='postponed' else None

                    new_end=None
                    if old['start_time'] and old['end_time']:
                        try:
                            sh,sm=map(int,old['start_time'].split(':')); eh,em=map(int,old['end_time'].split(':'))
                            duration=(eh*60+em)-(sh*60+sm)
                            if duration<0: duration+=24*60
                            nh,nm=map(int,new_time.split(':'))
                            end_minutes=(nh*60+nm+duration)%(24*60)
                            new_end=f'{end_minutes//60:02d}:{end_minutes%60:02d}'
                        except Exception:
                            new_end=None

                    if moved_event_id:
                        moved=c.execute('SELECT id FROM events WHERE id=?',(moved_event_id,)).fetchone()
                        if moved:
                            c.execute('''UPDATE events SET event_date=?,start_time=?,end_time=?,updated_at=? WHERE id=?''',
                                      (new_date,new_time,new_end,ts,moved_event_id))
                        else:
                            moved_event_id=None

                    if not moved_event_id:
                        vals=(old['title'],new_date,new_time,new_end,0,old['category'],old['location'],old['notes'],
                              old['contact'],old['travel_time'],old['url'],'planned','none',old['show_in_month'],ts,ts)
                        cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
                        moved_event_id=cur.lastrowid

                    if old['recurrence']=='none':
                        try:
                            old_dt=datetime.fromisoformat(f"{instance_date}T{old['start_time'] or '00:00'}")
                            new_dt=datetime.fromisoformat(f"{new_date}T{new_time}")
                            delta=new_dt-old_dt
                            rems=c.execute("SELECT * FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,)).fetchall()
                            for rem in rems:
                                shifted=(datetime.fromisoformat(rem['remind_at'])+delta).replace(microsecond=0).isoformat()
                                snoozed=None
                                if rem['snoozed_until']:
                                    snoozed=(datetime.fromisoformat(rem['snoozed_until'])+delta).replace(microsecond=0).isoformat()
                                c.execute('UPDATE reminders SET entity_id=?,remind_at=?,snoozed_until=? WHERE id=?',
                                          (moved_event_id,shifted,snoozed,rem['id']))
                        except Exception as reminder_error:
                            print('[Atelier] Report du rappel ignoré:', reminder_error)
                    else:
                        # Une occurrence de série reportée reçoit ses propres rappels.
                        # Les modèles de rappels de la série ne sont ni déplacés ni supprimés.
                        try:
                            base_dt=datetime.fromisoformat(f"{old['event_date']}T{old['start_time'] or '00:00'}")
                            moved_dt=datetime.fromisoformat(f"{new_date}T{new_time}")
                            delta=moved_dt-base_dt
                            c.execute("DELETE FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(moved_event_id,))
                            rems=c.execute("SELECT * FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,)).fetchall()
                            for rem in rems:
                                shifted=(datetime.fromisoformat(rem['remind_at'])+delta).replace(microsecond=0).isoformat()
                                c.execute("INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)",
                                          ('event',moved_event_id,rem['title'],shifted,'pending',ts))
                        except Exception as reminder_error:
                            print('[Atelier] Report des rappels récurrents ignoré:', reminder_error)

                    c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                    c.execute('''INSERT INTO event_instance_actions(event_id,instance_date,action,moved_event_id,action_at)
                                 VALUES(?,?,?,?,?)
                                 ON CONFLICT(event_id,instance_date) DO UPDATE SET action='postponed',moved_event_id=excluded.moved_event_id,action_at=excluded.action_at''',
                              (eid,instance_date,'postponed',moved_event_id,ts))
                    c.commit()
                    return self._json({'ok':True,'moved_event_id':moved_event_id,'new_date':new_date,'new_time':new_time})
                except Exception as ex:
                    print('[Atelier] Erreur report rendez-vous:', repr(ex))
                    return self._json({'error':'Le report a échoué côté Atelier.','detail':str(ex)},500)

            if len(parts)==4 and parts[0]=='api' and parts[1]=='events' and parts[3]=='cancel-instance':
                try:
                    eid=int(parts[2]); instance_date=(body.get('instance_date') or '').strip()
                    if not instance_date: return self._json({'error':'Date du rendez-vous requise.'},400)
                    old=c.execute('SELECT * FROM events WHERE id=?',(eid,)).fetchone()
                    if not old: return self._json({'error':'Rendez-vous introuvable.'},404)
                    c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                    c.execute('''INSERT INTO event_instance_actions(event_id,instance_date,action,moved_event_id,action_at)
                                 VALUES(?,?, 'cancelled', NULL, ?)
                                 ON CONFLICT(event_id,instance_date) DO UPDATE SET action='cancelled',moved_event_id=NULL,action_at=excluded.action_at''',
                              (eid,instance_date,ts))
                    if old['recurrence']=='none':
                        c.execute("UPDATE reminders SET status='done' WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,))
                    c.commit(); return self._json({'ok':True})
                except Exception as ex:
                    print('[Atelier] Erreur annulation rendez-vous:', repr(ex))
                    return self._json({'error':"L’annulation a échoué côté Atelier.",'detail':str(ex)},500)

            if len(parts)==4 and parts[0]=='api' and parts[1]=='events' and parts[3]=='instance-action':
                eid=int(parts[2]); instance_date=(body.get('instance_date') or '').strip(); action=(body.get('action') or '').strip()
                if not instance_date or action not in ('postponed','cancelled'):
                    return self._json({'error':'invalid action'},400)
                old=c.execute('SELECT * FROM events WHERE id=?',(eid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                moved_event_id=None
                if action=='postponed':
                    new_date=(body.get('new_date') or '').strip(); new_time=(body.get('new_time') or '').strip()
                    if not new_date or not new_time: return self._json({'error':'new_date and new_time required'},400)
                    new_end=None
                    if old['start_time'] and old['end_time']:
                        try:
                            sh,sm=map(int,old['start_time'].split(':')); eh,em=map(int,old['end_time'].split(':'))
                            duration=(eh*60+em)-(sh*60+sm)
                            if duration<0: duration+=24*60
                            nh,nm=map(int,new_time.split(':')); end_minutes=(nh*60+nm+duration)%(24*60)
                            new_end=f'{end_minutes//60:02d}:{end_minutes%60:02d}'
                        except Exception:
                            new_end=None
                    vals=(old['title'],new_date,new_time,new_end,0,old['category'],old['location'],old['notes'],
                          old['contact'],old['travel_time'],old['url'],'planned','none',old['show_in_month'],ts,ts)
                    cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
                    moved_event_id=cur.lastrowid

                if old['recurrence']=='none':
                    if action=='cancelled':
                        c.execute("UPDATE reminders SET status='done' WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,))
                    elif action=='postponed' and moved_event_id:
                        try:
                            old_dt=datetime.fromisoformat(f"{instance_date}T{old['start_time'] or '00:00'}")
                            new_dt=datetime.fromisoformat(f"{new_date}T{new_time}")
                            delta=new_dt-old_dt
                            rems=c.execute("SELECT * FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,)).fetchall()
                            for rem in rems:
                                shifted=(datetime.fromisoformat(rem['remind_at'])+delta).replace(microsecond=0).isoformat()
                                snoozed=None
                                if rem['snoozed_until']:
                                    snoozed=(datetime.fromisoformat(rem['snoozed_until'])+delta).replace(microsecond=0).isoformat()
                                c.execute('UPDATE reminders SET entity_id=?,remind_at=?,snoozed_until=? WHERE id=?',
                                          (moved_event_id,shifted,snoozed,rem['id']))
                        except Exception:
                            pass

                c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                c.execute('''INSERT INTO event_instance_actions(event_id,instance_date,action,moved_event_id,action_at)
                             VALUES(?,?,?,?,?)
                             ON CONFLICT(event_id,instance_date) DO UPDATE SET action=excluded.action,moved_event_id=excluded.moved_event_id,action_at=excluded.action_at''',
                          (eid,instance_date,action,moved_event_id,ts))
                c.commit(); return self._json({'ok':True,'moved_event_id':moved_event_id})

            if len(parts)==4 and parts[0]=='api' and parts[1]=='events' and parts[3]=='edit-instance':
                # Édition atomique d'une seule occurrence récurrente.
                try:
                    eid=int(parts[2])
                    old=c.execute('SELECT * FROM events WHERE id=?',(eid,)).fetchone()
                    if not old: return self._json({'error':'Rendez-vous introuvable.'},404)
                    if old['recurrence']=='none': return self._json({'error':'Ce rendez-vous n’est pas récurrent.'},400)
                    instance_date=(body.get('instance_date') or '').strip()
                    event_day=(body.get('event_date') or '').strip()
                    title=(body.get('title') or '').strip()
                    if not instance_date or not event_day or not title:
                        return self._json({'error':'Date de l’occurrence, date et titre requis.'},400)
                    existing=c.execute('SELECT * FROM event_instance_actions WHERE event_id=? AND instance_date=?',(eid,instance_date)).fetchone()
                    moved_id=existing['moved_event_id'] if existing and existing['action']=='postponed' else None
                    if moved_id and not c.execute('SELECT id FROM events WHERE id=?',(moved_id,)).fetchone():
                        moved_id=None
                    vals=(title,event_day,body.get('start_time') or None,body.get('end_time') or None,
                          1 if body.get('all_day') else 0,body.get('category','general'),body.get('location',''),
                          body.get('notes',''),body.get('contact',''),body.get('travel_time',''),body.get('url',''),
                          body.get('status','planned'),'none',1 if body.get('show_in_month',True) else 0,ts)
                    if moved_id:
                        c.execute('''UPDATE events SET title=?,event_date=?,start_time=?,end_time=?,all_day=?,category=?,location=?,notes=?,contact=?,travel_time=?,url=?,status=?,recurrence=?,show_in_month=?,updated_at=? WHERE id=?''',
                                  vals+(moved_id,))
                    else:
                        cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals+(ts,))
                        moved_id=cur.lastrowid
                    c.execute("DELETE FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(moved_id,))
                    for ra in body.get('reminders',[]) or []:
                        if isinstance(ra,str): ra={'remind_at':ra,'title':''}
                        when=(ra or {}).get('remind_at')
                        if when:
                            c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',
                                      ('event',moved_id,(ra or {}).get('title',''),when,'pending',ts))
                    c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                    c.execute('''INSERT INTO event_instance_actions(event_id,instance_date,action,moved_event_id,action_at)
                                 VALUES(?,?,'postponed',?,?)
                                 ON CONFLICT(event_id,instance_date) DO UPDATE SET action='postponed',moved_event_id=excluded.moved_event_id,action_at=excluded.action_at''',
                              (eid,instance_date,moved_id,ts))
                    c.commit()
                    return self._json({'ok':True,'moved_event_id':moved_id})
                except Exception as ex:
                    print('[Atelier] Erreur édition occurrence:',repr(ex))
                    return self._json({'error':'La modification de cette occurrence a échoué.','detail':str(ex)},500)

            if len(parts)==3 and parts[0]=='api' and parts[1]=='events':
                eid=int(parts[2]); old=c.execute('SELECT * FROM events WHERE id=?',(eid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                c.execute('''UPDATE events SET title=?,event_date=?,start_time=?,end_time=?,all_day=?,category=?,location=?,notes=?,contact=?,travel_time=?,url=?,status=?,recurrence=?,show_in_month=?,updated_at=? WHERE id=?''',
                          (d['title'],d['event_date'],d.get('start_time') or None,d.get('end_time') or None,1 if d.get('all_day') else 0,d.get('category','general'),d.get('location',''),d.get('notes',''),d.get('contact',''),d.get('travel_time',''),d.get('url',''),d.get('status','planned'),d.get('recurrence','none'),1 if d.get('show_in_month',1) else 0,ts,eid))
                if 'reminders' in body:
                    c.execute("DELETE FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,))
                    for ra in body.get('reminders',[]) or []:
                        if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                        when = (ra or {}).get('remind_at')
                        if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('event',eid,(ra or {}).get('title',''),when,'pending',ts))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='tasks':
                tid=int(parts[2]); old=c.execute('SELECT * FROM tasks WHERE id=?',(tid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                objective_node_id=int_or_none(d.get('objective_node_id'))
                if objective_node_id and not c.execute('SELECT id FROM objective_nodes WHERE id=?',(objective_node_id,)).fetchone():
                    objective_node_id=None
                c.execute('''UPDATE tasks SET title=?,due_date=?,due_time=?,notes=?,completed=?,archived=?,important=?,objective_node_id=?,order_index=?,updated_at=? WHERE id=?''',
                          (d['title'],d.get('due_date') or None,d.get('due_time') or None,d.get('notes',''),1 if d.get('completed') else 0,1 if d.get('archived') else 0,1 if d.get('important') else 0,objective_node_id,int(d.get('order_index') or 0),ts,tid))
                if 'reminders' in body:
                    c.execute("DELETE FROM reminders WHERE entity_type='task' AND entity_id=? AND status!='done'",(tid,))
                    for ra in body.get('reminders',[]) or []:
                        if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                        when = (ra or {}).get('remind_at')
                        if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('task',tid,(ra or {}).get('title',''),when,'pending',ts))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='shopping' and parts[2]=='validate':
                rows=c.execute('SELECT * FROM shopping_items WHERE archived=0 AND checked=1 ORDER BY id').fetchall()
                moved=[]
                for row in rows:
                    cur=c.execute('''INSERT INTO food_items(name,quantity,units_count,price,calories,expiry_date,expiry_mode,notes,status,created_at,updated_at)
                                     VALUES(?,?,?,?,?,NULL,'pending','', 'active',?,?)''',
                                  (row['name'],row['quantity'] or '',max(1,int(row['purchase_count'] or 1)),row['price'],row['calories'],ts,ts))
                    moved.append(cur.lastrowid)
                    c.execute('UPDATE shopping_items SET archived=1,updated_at=? WHERE id=?',(ts,row['id']))
                c.commit(); return self._json({'ok':True,'count':len(moved),'food_ids':moved})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='shopping':
                iid=int(parts[2]); old=c.execute('SELECT * FROM shopping_items WHERE id=?',(iid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                c.execute('''UPDATE shopping_items SET name=?,quantity=?,purchase_count=?,price=?,calories=?,checked=?,archived=?,updated_at=? WHERE id=?''',
                          (d['name'],d.get('quantity',''),max(1,int(d.get('purchase_count') or 1)),float_or_none(d.get('price')),float_or_none(d.get('calories')),
                           1 if d.get('checked') else 0,1 if d.get('archived') else 0,ts,iid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='foods':
                iid=int(parts[2]); old=c.execute('SELECT * FROM food_items WHERE id=?',(iid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                mode=(d.get('expiry_mode') or ('date' if d.get('expiry_date') else 'none')).strip()
                if mode not in ('pending','date','none'): mode='pending'
                expiry=(d.get('expiry_date') or None) if mode=='date' else None
                c.execute('''UPDATE food_items SET name=?,quantity=?,units_count=?,price=?,calories=?,expiry_date=?,expiry_mode=?,notes=?,status=?,updated_at=? WHERE id=?''',
                          (d['name'],d.get('quantity',''),max(1,int(d.get('units_count') or 1)),float_or_none(d.get('price')),float_or_none(d.get('calories')),
                           expiry,mode,d.get('notes',''),d.get('status','active'),ts,iid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1] in ('recipes','meals'):
                iid=int(parts[2]); old=c.execute('SELECT * FROM recipes WHERE id=?',(iid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                book_id=int_or_none(d.get('book_id'))
                if not book_id or not c.execute('SELECT id FROM recipe_books WHERE id=?',(book_id,)).fetchone():
                    row=c.execute("SELECT id FROM recipe_books WHERE name='À classer'").fetchone()
                    book_id=row['id'] if row else None
                c.execute('''UPDATE recipes
                             SET title=?,book_id=?,notes=?,recipe=?,base_servings=?,ingredients_json=?,image_data=?,source_url=?,archived=?,updated_at=?
                             WHERE id=?''',
                          (d['title'],book_id,d.get('notes',''),d.get('recipe',''),max(1,int_or_none(d.get('base_servings')) or 1),
                           d.get('ingredients_json','[]'),d.get('image_data',''),d.get('source_url',''),1 if d.get('archived') else 0,ts,iid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='reminders':
                rid=int(parts[2])
                rem=c.execute('SELECT * FROM reminders WHERE id=?',(rid,)).fetchone()
                if not rem: return self._json({'error':'Rappel introuvable.'},404)
                title=(body.get('title') or '').strip()
                remind_at=(body.get('remind_at') or '').strip()
                if rem['entity_type']=='standalone' and not title:
                    return self._json({'error':'Le titre du rappel est requis.'},400)
                if not remind_at: return self._json({'error':'La date et l’heure du rappel sont requises.'},400)
                c.execute("UPDATE reminders SET title=?,remind_at=?,snoozed_until=NULL,status='pending' WHERE id=?",(title,remind_at,rid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==4 and parts[0]=='api' and parts[1]=='reminders':
                rid=int(parts[2]); action=parts[3]
                if action=='done':
                    c.execute("UPDATE reminders SET status='done' WHERE id=?",(rid,)); c.commit(); return self._json({'ok':True})
                if action=='finish':
                    rem=c.execute('SELECT * FROM reminders WHERE id=?',(rid,)).fetchone()
                    if not rem: return self._json({'error':'not found'},404)
                    if rem['entity_type']=='task':
                        c.execute("UPDATE tasks SET completed=1,updated_at=? WHERE id=?",(ts,rem['entity_id']))
                    elif rem['entity_type']=='event':
                        c.execute("UPDATE events SET status='done',updated_at=? WHERE id=?",(ts,rem['entity_id']))
                    c.execute("UPDATE reminders SET status='done' WHERE id=?",(rid,))
                    c.commit(); return self._json({'ok':True})
                if action=='snooze':
                    val=body.get('snoozed_until')
                    if not val: return self._json({'error':'snoozed_until required'},400)
                    c.execute("UPDATE reminders SET status='pending',snoozed_until=? WHERE id=?",(val,rid)); c.commit(); return self._json({'ok':True})
        return self._json({'error':'not found'},404)


    def do_DELETE(self):
        u=urlparse(self.path); p=u.path; parts=p.strip('/').split('/')
        with conn() as c:
            if len(parts)==3 and parts[:2]==['api','events']:
                eid=int(parts[2])
                if not c.execute('SELECT id FROM events WHERE id=?',(eid,)).fetchone():
                    return self._json({'error':'Rendez-vous introuvable.'},404)
                # Supprimer aussi les rappels et les statuts des occurrences rattachés.
                c.execute("DELETE FROM reminders WHERE entity_type='event' AND entity_id=?",(eid,))
                c.execute('DELETE FROM event_completions WHERE event_id=?',(eid,))
                c.execute('DELETE FROM event_instance_actions WHERE event_id=?',(eid,))
                c.execute('UPDATE event_instance_actions SET moved_event_id=NULL WHERE moved_event_id=?',(eid,))
                c.execute('DELETE FROM events WHERE id=?',(eid,))
                c.commit()
                return self._json({'ok':True})
            if len(parts)==3 and parts[:2]==['api','habits']:
                c.execute('UPDATE habits SET archived=1 WHERE id=?',(int(parts[2]),));c.commit();return self._json({'ok':True})
            if len(parts)==3 and parts[:2]==['api','cycle-periods']:
                c.execute('DELETE FROM menstrual_periods WHERE id=?',(int(parts[2]),));c.commit();return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='objective-nodes':
                oid=int(parts[2]); node=c.execute('SELECT id FROM objective_nodes WHERE id=?',(oid,)).fetchone()
                if not node: return self._json({'error':'Objectif introuvable.'},404)
                ids=[r['id'] for r in c.execute('''WITH RECURSIVE tree(id) AS (
                                                     SELECT id FROM objective_nodes WHERE id=?
                                                     UNION ALL
                                                     SELECT n.id FROM objective_nodes n JOIN tree t ON n.parent_id=t.id
                                                   ) SELECT id FROM tree''',(oid,)).fetchall()]
                if ids:
                    marks=','.join('?' for _ in ids)
                    c.execute(f'UPDATE tasks SET objective_node_id=NULL WHERE objective_node_id IN ({marks})',ids)
                c.execute('DELETE FROM objective_nodes WHERE id=?',(oid,))
                c.commit(); return self._json({'ok':True,'deleted_nodes':len(ids)})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='objective-library-sections':
                sid=int(parts[2]); c.execute('DELETE FROM objective_library_sections WHERE id=?',(sid,))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='objective-library-entries':
                eid=int(parts[2]); c.execute('DELETE FROM objective_library_entries WHERE id=?',(eid,))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='reminders':
                rid=int(parts[2])
                rem=c.execute('SELECT * FROM reminders WHERE id=?',(rid,)).fetchone()
                if not rem: return self._json({'error':'Rappel introuvable.'},404)
                c.execute('DELETE FROM reminders WHERE id=?',(rid,))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='meal-ideas':
                iid=int(parts[2])
                c.execute('DELETE FROM meal_idea_links WHERE id=?',(iid,))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='recipe-books':
                bid=int(parts[2]); book=c.execute('SELECT * FROM recipe_books WHERE id=?',(bid,)).fetchone()
                if not book: return self._json({'error':'Livre introuvable.'},404)
                if book['name'].lower()=='à classer':
                    return self._json({'error':'Le livre « À classer » ne peut pas être supprimé.'},400)
                fallback=c.execute("SELECT id FROM recipe_books WHERE name='À classer'").fetchone()
                if not fallback: return self._json({'error':'Livre de secours introuvable.'},500)
                moved=c.execute('SELECT COUNT(*) AS n FROM recipes WHERE book_id=? AND archived=0',(bid,)).fetchone()['n']
                c.execute('UPDATE recipes SET book_id=?,updated_at=? WHERE book_id=?',(fallback['id'],now_iso(),bid))
                c.execute('DELETE FROM recipe_books WHERE id=?',(bid,))
                c.commit(); return self._json({'ok':True,'moved_recipes':moved})
        return self._json({'error':'not found'},404)
