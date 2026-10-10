class Handler(BaseHTTPRequestHandler):
    server_version = 'AtelierLocal/0.3.2'

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
        self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path); p = u.path; q = parse_qs(u.query)
        if not p.startswith('/api/'):
            return self._serve_static(p)
        if p == '/api/version':
            version_file = ROOT / 'VERSION'
            version = version_file.read_text(encoding='utf-8').strip() if version_file.exists() else '0.0.5'
            return self._json({'version': version})
        with conn() as c:
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
                rows = c.execute('SELECT * FROM tasks WHERE archived=0 ORDER BY completed, important DESC, COALESCE(due_date,\'9999-12-31\'), order_index, id').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/shopping':
                rows = c.execute('SELECT * FROM shopping_items WHERE archived=0 ORDER BY checked, id').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/foods':
                rows = c.execute("""SELECT * FROM food_items WHERE status='active'
                                    ORDER BY CASE WHEN expiry_date IS NULL OR expiry_date='' THEN 1 ELSE 0 END,
                                             expiry_date, id""").fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/meals':
                rows = c.execute('SELECT * FROM meal_ideas WHERE archived=0 ORDER BY updated_at DESC, id DESC').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/reminders':
                rows = c.execute('''
                    SELECT r.*,
                      CASE WHEN r.entity_type='event' THEN (SELECT title FROM events WHERE id=r.entity_id)
                           ELSE (SELECT title FROM tasks WHERE id=r.entity_id) END AS entity_title
                    FROM reminders r
                    WHERE r.status != 'done'
                    ORDER BY COALESCE(r.snoozed_until,r.remind_at),r.id
                ''').fetchall()
                return self._json([dict(r) for r in rows])
            if p == '/api/reminders/due':
                now = q.get('now', [now_iso()])[0]
                rows = c.execute('''
                    SELECT r.*, 
                      CASE WHEN r.entity_type='event' THEN (SELECT title FROM events WHERE id=r.entity_id)
                           ELSE (SELECT title FROM tasks WHERE id=r.entity_id) END AS entity_title
                    FROM reminders r
                    WHERE r.status='pending' AND COALESCE(r.snoozed_until,r.remind_at) <= ?
                    ORDER BY COALESCE(r.snoozed_until,r.remind_at), r.id
                ''', (now,)).fetchall()
                return self._json([dict(r) for r in rows])
        return self._json({'error':'not found'},404)

    def do_POST(self):
        u = urlparse(self.path); p = u.path; body = self._body(); ts = now_iso()
        if p == '/api/version':
            version_file = ROOT / 'VERSION'
            version = version_file.read_text(encoding='utf-8').strip() if version_file.exists() else '0.0.5'
            return self._json({'version': version})
        with conn() as c:
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
            if p == '/api/tasks':
                title=body.get('title','').strip()
                if not title: return self._json({'error':'title required'},400)
                oi=c.execute('SELECT COALESCE(MAX(order_index),0)+1 n FROM tasks').fetchone()['n']
                cur=c.execute('''INSERT INTO tasks(title,due_date,due_time,notes,completed,archived,important,order_index,created_at,updated_at)
                                 VALUES(?,?,?,?,0,0,?,?,?,?)''',(title,body.get('due_date') or None,body.get('due_time') or None,body.get('notes',''),1 if body.get('important') else 0,oi,ts,ts))
                tid=cur.lastrowid
                for ra in body.get('reminders',[]) or []:
                    if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                    when = (ra or {}).get('remind_at')
                    if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('task',tid,(ra or {}).get('title',''),when,'pending',ts))
                c.commit(); return self._json({'id':tid},201)
            if p == '/api/shopping':
                name=body.get('name','').strip()
                if not name: return self._json({'error':'name required'},400)
                cur=c.execute('INSERT INTO shopping_items(name,quantity,checked,archived,created_at,updated_at) VALUES(?,?,0,0,?,?)',
                              (name,body.get('quantity',''),ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/foods':
                name=body.get('name','').strip()
                if not name: return self._json({'error':'name required'},400)
                cur=c.execute('INSERT INTO food_items(name,quantity,expiry_date,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                              (name,body.get('quantity',''),body.get('expiry_date') or None,body.get('notes',''),'active',ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
            if p == '/api/meals':
                title=body.get('title','').strip()
                if not title: return self._json({'error':'title required'},400)
                cur=c.execute('''INSERT INTO meal_ideas(title,notes,recipe,base_servings,ingredients_json,image_data,archived,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,0,?,?)''',
                              (title,body.get('notes',''),body.get('recipe',''),max(1,int(body.get('base_servings') or 4)),
                               body.get('ingredients_json','[]'),body.get('image_data',''),ts,ts))
                c.commit(); return self._json({'id':cur.lastrowid},201)
        return self._json({'error':'not found'},404)

    def do_PUT(self):
        u=urlparse(self.path); p=u.path; body=self._body(); ts=now_iso(); parts=p.strip('/').split('/')
        with conn() as c:
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
                c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                c.execute('''INSERT INTO event_instance_actions(event_id,instance_date,action,moved_event_id,action_at)
                             VALUES(?,?,?,?,?)
                             ON CONFLICT(event_id,instance_date) DO UPDATE SET action=excluded.action,moved_event_id=excluded.moved_event_id,action_at=excluded.action_at''',
                          (eid,instance_date,action,moved_event_id,ts))
                c.commit(); return self._json({'ok':True,'moved_event_id':moved_event_id})

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
                c.execute('''UPDATE tasks SET title=?,due_date=?,due_time=?,notes=?,completed=?,archived=?,important=?,order_index=?,updated_at=? WHERE id=?''',
                          (d['title'],d.get('due_date') or None,d.get('due_time') or None,d.get('notes',''),1 if d.get('completed') else 0,1 if d.get('archived') else 0,1 if d.get('important') else 0,int(d.get('order_index') or 0),ts,tid))
                if 'reminders' in body:
                    c.execute("DELETE FROM reminders WHERE entity_type='task' AND entity_id=? AND status!='done'",(tid,))
                    for ra in body.get('reminders',[]) or []:
                        if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                        when = (ra or {}).get('remind_at')
                        if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('task',tid,(ra or {}).get('title',''),when,'pending',ts))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='shopping':
                iid=int(parts[2]); old=c.execute('SELECT * FROM shopping_items WHERE id=?',(iid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                c.execute('UPDATE shopping_items SET name=?,quantity=?,checked=?,archived=?,updated_at=? WHERE id=?',
                          (d['name'],d.get('quantity',''),1 if d.get('checked') else 0,1 if d.get('archived') else 0,ts,iid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='foods':
                iid=int(parts[2]); old=c.execute('SELECT * FROM food_items WHERE id=?',(iid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                c.execute('UPDATE food_items SET name=?,quantity=?,expiry_date=?,notes=?,status=?,updated_at=? WHERE id=?',
                          (d['name'],d.get('quantity',''),d.get('expiry_date') or None,d.get('notes',''),d.get('status','active'),ts,iid))
                c.commit(); return self._json({'ok':True})
            if len(parts)==3 and parts[0]=='api' and parts[1]=='meals':
                iid=int(parts[2]); old=c.execute('SELECT * FROM meal_ideas WHERE id=?',(iid,)).fetchone()
                if not old: return self._json({'error':'not found'},404)
                d=dict(old); d.update(body)
                c.execute('''UPDATE meal_ideas
                             SET title=?,notes=?,recipe=?,base_servings=?,ingredients_json=?,image_data=?,archived=?,updated_at=?
                             WHERE id=?''',
                          (d['title'],d.get('notes',''),d.get('recipe',''),max(1,int(d.get('base_servings') or 4)),
                           d.get('ingredients_json','[]'),d.get('image_data',''),1 if d.get('archived') else 0,ts,iid))
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
