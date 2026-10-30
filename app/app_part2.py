
# Tracker boards: each board has its own recurring window. Month/day marks
# are indexed by ISO dates and are NEVER migrated/deleted on rhythm changes.
TRACKER_PERIOD_LIMITS={'days':90,'weeks':12,'months':24,'years':5}
TRACKER_MONTH_NAMES=('janvier','février','mars','avril','mai','juin',
                     'juillet','août','septembre','octobre','novembre','décembre')

def tracker_period_choice(unit,count):
    try:
        if unit not in TRACKER_PERIOD_LIMITS or isinstance(count,bool):raise ValueError()
        count=int(count)
        if count<1 or count>TRACKER_PERIOD_LIMITS[unit]:raise ValueError()
    except (ValueError,TypeError):
        raise ValueError('Choisis une période entre 1 et 90 jours, 12 semaines, 24 mois ou 5 ans.')
    return unit,count

def tracker_period_anchor(unit,today=None):
    today=today or date.today()
    if unit in ('days','weeks'):
        return (today-timedelta(days=today.weekday())) if unit=='weeks' else today
    return date(today.year,1 if unit=='years' else today.month,1)

def tracker_month_offset(when,months):
    index=(when.year*12+when.month-1)+months
    if index<12 or index>119987:raise ValueError('Période hors calendrier.')
    return date(index//12,index%12+1,1)

def tracker_window(board,offset=0,today=None):
    today=today or date.today()
    unit,count=tracker_period_choice(board['period_unit'],board['period_count'])
    try:anchor=date.fromisoformat(board['anchor_date'])
    except (ValueError,TypeError):anchor=tracker_period_anchor(unit,today)
    if isinstance(offset,bool) or not isinstance(offset,int) or abs(offset)>60:
        raise ValueError('Déplacement de période invalide.')
    if unit in ('days','weeks'):
        days=count*(7 if unit=='weeks' else 1)
        index=(today-anchor).days//days+offset
        start=anchor+timedelta(days=index*days)
        end=start+timedelta(days=days-1)
        monthly=False
    else:
        months=count*(12 if unit=='years' else 1)
        diff=(today.year-anchor.year)*12+today.month-anchor.month
        start=tracker_month_offset(anchor,(diff//months+offset)*months)
        end=tracker_month_offset(start,months)-timedelta(days=1)
        monthly=months>=4
    columns=[]
    if monthly:
        cursor=start
        while cursor<=end:
            label=TRACKER_MONTH_NAMES[cursor.month-1][:3].capitalize()
            columns.append({'day':cursor.isoformat(),'label':label,
                            'secondary':str(cursor.year)[-2:],
                            'title':TRACKER_MONTH_NAMES[cursor.month-1].capitalize()+' '+str(cursor.year)})
            cursor=tracker_month_offset(cursor,1)
    else:
        cursor=start
        weekday=('L','M','M','J','V','S','D')
        while cursor<=end:
            columns.append({'day':cursor.isoformat(),
                            'label':weekday[cursor.weekday()],
                            'secondary':str(cursor.day),
                            'title':cursor.strftime('%d/%m/%Y')})
            cursor+=timedelta(days=1)
    if unit=='weeks': cadence=f'{count} semaine'+('s' if count>1 else '')
    elif unit=='days':cadence=f'{count} jour'+('s' if count>1 else '')
    elif unit=='years':cadence=f'{count} an'+('s' if count>1 else '')
    else:cadence=f'{count} mois'
    return {'start':start.isoformat(),'end':end.isoformat(),'columns':columns,
            'cadence':cadence,'granularity':'months' if monthly else 'days',
            'label':start.strftime('%d/%m/%Y')+' – '+end.strftime('%d/%m/%Y')}

# Budget ALPHA 0.15.0 : montants en centimes, aucune connexion bancaire.
def budget_amount(value):
    from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
    try:
        d=Decimal(str(value).replace(',','.'))
        if not d.is_finite() or d<0 or d>Decimal('100000000'): raise ValueError()
        return int((d*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    except (InvalidOperation,ValueError,TypeError):
        raise ValueError('Montant invalide (positif, au maximum 100 millions d’euros).')

def budget_date(value):
    try: return date.fromisoformat(str(value)).isoformat()
    except (ValueError,TypeError): raise ValueError('Date invalide.')

def budget_month(value):
    try:
        text=str(value)
        return date.fromisoformat(text+'-01') if len(text)==7 else date.fromisoformat(text).replace(day=1)
    except (ValueError,TypeError): raise ValueError('Mois invalide.')

def budget_last_day(year,month):
    return monthrange(year,month)[1]

def budget_entry_day(month,day):
    return date(month.year,month.month,min(day,budget_last_day(month.year,month.month)))

def budget_due_in_month(item,month):
    due=budget_entry_day(month,item['day_of_month']).isoformat()
    return due if item['start_date']<=due and (not item['end_date'] or item['end_date']>=due) else None

def budget_materialize(c,month,ts):
    today=date.today().isoformat()
    for rule in c.execute('SELECT * FROM budget_rules WHERE active=1').fetchall():
        due=budget_due_in_month(rule,month)
        if not due:continue
        status='presumed' if rule['kind']=='fixed' and due<=today else 'pending'
        c.execute("""INSERT OR IGNORE INTO budget_entries
          (rule_id,scheduled_date,title,kind,category,amount_cents,status,source,actual_date,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)""",
          (rule['id'],due,rule['title'],'income' if rule['kind']=='income' else 'expense',
           rule['category'],rule['amount_cents'],status,'scheduled',due if status=='presumed' else None,ts))
    # Une charge consultée à l'avance devient « présumée payée » à échéance,
    # sans jamais transformer un revenu en revenu confirmé.
    c.execute("""UPDATE budget_entries
      SET status='presumed', actual_date=scheduled_date
      WHERE source='scheduled' AND status='pending' AND scheduled_date<=?
      AND rule_id IN (SELECT id FROM budget_rules WHERE kind='fixed')""",(today,))
    for debt in c.execute('SELECT * FROM budget_debts WHERE archived=0').fetchall():
        due=budget_due_in_month(debt,month)
        if not due:continue
        repaid=int(c.execute("""SELECT COALESCE(SUM(amount_cents),0) FROM budget_entries
          WHERE debt_id=? AND status='confirmed'""",(debt['id'],)).fetchone()[0])
        planned=int(c.execute("""SELECT COALESCE(SUM(amount_cents),0) FROM budget_entries
          WHERE debt_id=? AND scheduled_date<? AND status!='skipped'""",(debt['id'],due)).fetchone()[0])
        remaining_plan=max(0,debt['total_cents']-planned)
        installment=min(debt['monthly_cents'],remaining_plan)
        if installment==0:continue
        c.execute("""INSERT OR IGNORE INTO budget_entries
          (debt_id,scheduled_date,title,kind,category,amount_cents,status,source,created_at)
          VALUES(?,? ,?,'expense','Crédits / dettes',?,'pending','scheduled',?)""",
          (debt['id'],due,debt['title'],installment,ts))
    c.commit()

def budget_snapshot(c,month,ts):
    # Materialiser chronologiquement les mois depuis le solde de départ :
    # sinon un mois antérieur jamais ouvert fausserait le solde actuel.
    settings=c.execute('SELECT * FROM budget_settings WHERE id=1').fetchone()
    start_date=settings['opening_date'] if settings else None
    if not start_date:
        dates=[r[0] for r in c.execute('SELECT start_date FROM budget_rules UNION ALL SELECT start_date FROM budget_debts').fetchall()]
        start_date=min(dates) if dates else month.isoformat()
    cursor=budget_month(start_date)
    if cursor>month:cursor=month
    span=(month.year-cursor.year)*12+(month.month-cursor.month)
    if span>240:raise ValueError('Historique supérieur à 20 ans : ajuste la date du solde initial.')
    while cursor<=month:
        budget_materialize(c,cursor,ts)
        cursor=date(cursor.year+1,1,1) if cursor.month==12 else date(cursor.year,cursor.month+1,1)
    first=month.isoformat();last=month.replace(day=budget_last_day(month.year,month.month)).isoformat()
    entries=[dict(x) for x in c.execute(
      'SELECT * FROM budget_entries WHERE scheduled_date BETWEEN ? AND ? ORDER BY scheduled_date,id',(first,last))]
    settings=c.execute('SELECT * FROM budget_settings WHERE id=1').fetchone()
    opening=int(settings['opening_balance_cents']) if settings else 0
    start=settings['opening_date'] if settings else '2026-01-01'
    # Le solde courant suit les confirmations et les charges présumées jusqu'à aujourd'hui.
    today=min(date.today().isoformat(),last)
    movement=c.execute("""SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE -amount_cents END),0)
      FROM budget_entries WHERE status IN ('confirmed','presumed') AND COALESCE(actual_date,scheduled_date)<=?
       AND COALESCE(actual_date,scheduled_date)>=?""",(today,start)).fetchone()[0]
    balance=opening+int(movement)
    pending=[x for x in entries if x['status']=='pending']
    # Le prévisionnel tient compte de TOUTES les échéances entre le solde
    # initial et la fin du mois sélectionné, pas seulement du mois affiché.
    forecast=int(opening+c.execute("""SELECT COALESCE(SUM(
       CASE WHEN kind='income' THEN amount_cents ELSE -amount_cents END),0)
       FROM budget_entries WHERE status IN ('confirmed','presumed','pending')
       AND COALESCE(actual_date,scheduled_date)>=?
       AND COALESCE(actual_date,scheduled_date)<=?""",(start,last)).fetchone()[0])
    notes=c.execute('SELECT notes FROM budget_month_notes WHERE month=?',(first[:7],)).fetchone()
    debts=[]
    for item in c.execute('SELECT * FROM budget_debts ORDER BY archived,id DESC'):
        debt=dict(item)
        paid=int(c.execute("""SELECT COALESCE(SUM(amount_cents),0) FROM budget_entries
        WHERE debt_id=? AND status='confirmed'""",(item['id'],)).fetchone()[0])
        debt['repaid_cents']=paid;debt['remaining_cents']=max(0,debt['total_cents']-paid);debts.append(debt)
    return {'month':first[:7],'entries':entries,'rules':[dict(x) for x in c.execute('SELECT * FROM budget_rules ORDER BY active DESC,id DESC')],
     'debts':debts,'opening_balance_cents':opening,'opening_date':start,'balance_cents':balance,
     'forecast_cents':forecast,'notes':notes['notes'] if notes else '',
     'income_cents':sum(x['amount_cents'] for x in entries if x['kind']=='income' and x['status']!='skipped'),
     'expenses_cents':sum(x['amount_cents'] for x in entries if x['kind']=='expense' and x['status']!='skipped'),
     'pending_income':[x for x in pending if x['kind']=='income'],
     'upcoming_charges':[x for x in entries if x['kind']=='expense' and x['source']=='scheduled' and x['scheduled_date']>=date.today().isoformat() and x['status']!='skipped']}

class Handler(BaseHTTPRequestHandler):
    server_version = 'AtelierLocal/' + atelier_version()

    def log_message(self, fmt, *args):
        print('[Atelier]', fmt % args)

    def _json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        # L'application est locale et mutable : aucune réponse JSON d'état ne doit être périmée.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Pragma', 'no-cache')
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
        parts=p.strip('/').split('/')
        if len(parts) in (4,5) and parts[:2]==['api','events'] and parts[3]=='attachments':
            try:
                event_id=int(parts[2])
                file_id=int(parts[4]) if len(parts)==5 else None
            except ValueError:return self._json({'error':'Identifiant invalide.'},400)
            with conn() as c:
                if not c.execute('SELECT 1 FROM events WHERE id=?',(event_id,)).fetchone():
                    return self._json({'error':'Rendez-vous introuvable.'},404)
                if file_id is None:return self._json(admin_docs.event_summaries(c,event_id))
                attachment=admin_docs.event_detail(c,event_id,file_id)
                if not attachment:return self._json({'error':'Fichier introuvable.'},404)
                content=attachment['content']
                self.send_response(200)
                self.send_header('Content-Type',attachment['mime_type'])
                self.send_header('Content-Length',str(len(content)))
                self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Cache-Control','no-store, max-age=0')
                self.send_header('Content-Disposition',
                    "attachment; filename=\"fichier\"; filename*=UTF-8''"+quote(attachment['filename']))
                self.end_headers()
                self.wfile.write(content)
                return
        if len(parts)==5 and parts[:2]==['api','admin'] and parts[3]=='attachments':
            try:admin_id=int(parts[2]);file_id=int(parts[4])
            except ValueError:return self._json({'error':'Identifiant invalide.'},400)
            with conn() as c:
                attachment=admin_docs.detail(c,admin_id,file_id)
                if not attachment:return self._json({'error':'Fichier introuvable.'},404)
                content=attachment['content']
                self.send_response(200)
                self.send_header('Content-Type',attachment['mime_type'])
                self.send_header('Content-Length',str(len(content)))
                self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Cache-Control','no-store, max-age=0')
                self.send_header('Content-Disposition',
                    "attachment; filename=\"fichier\"; filename*=UTF-8''"+quote(attachment['filename']))
                self.end_headers()
                self.wfile.write(content)
                return
        if p == '/api/quick-capture/hotkey':
            return self._json({'shortcut':quick_capture_native.read_preference(DATA/'quick-capture-hotkey.json')})
        if p == '/api/desktop-postits/status':
            try:
                desktop_postits._guard()
                return self._json({'available':True,
                                   'running':desktop_postits.is_running(),
                                   'startup':desktop_postits.startup_enabled()})
            except (RuntimeError,OSError) as exc:
                return self._json({'available':False,'error':str(exc)})
        if p == '/api/postits':
            archived=1 if q.get('archived',['0'])[0]=='1' else 0
            with conn() as c:
                return self._json([dict(row) for row in c.execute(
                    'SELECT * FROM home_postits WHERE archived=? ORDER BY id',(archived,)).fetchall()])
        if p == '/api/update/status':
            try:
                updater.guard()
                return self._json(updater.status())
            except RuntimeError as exc:
                return self._json({'error':str(exc)},403)
        if p == '/api/update/check':
            try:
                return self._json(updater.check())
            except RuntimeError as exc:
                return self._json({'error':str(exc)},403)
            except Exception as exc:
                return self._json({'error':'GitHub ou manifeste indisponible : '+str(exc)},502)

        with conn() as c:
            if p == '/api/standalone-preparations':
                archived=q.get('archived',['0'])[0]=='1'
                lists=[dict(row) for row in c.execute(
                    'SELECT id,title,due_date,archived,created_at,updated_at '
                    'FROM standalone_preparation_lists WHERE archived=? '
                    'ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,due_date,id',
                    (int(archived),))]
                for item in lists:
                    item['items']=[dict(row) for row in c.execute(
                        'SELECT id,title,done,order_index FROM standalone_preparation_items '
                        'WHERE list_id=? AND archived=0 ORDER BY order_index,id',(item['id'],))]
                return self._json(lists)
            if p == '/api/tracker-links/options':
                return self._json(tracker_rituals.options(c))
            if p == '/api/tracker-boards/history':
                return self._json(tracker_rituals.monthly_archive(c,date.today()))
            if p == '/api/tracker-boards/daily':
                try:
                    day=date.fromisoformat(q.get('day',[date.today().isoformat()])[0])
                    if abs((day-date.today()).days)>366:raise ValueError()
                except (TypeError,ValueError):
                    return self._json({'error':'Date de suivi invalide.'},400)
                return self._json(tracker_rituals.daily(c,day,tracker_window))
            if p == '/api/preparations/upcoming':
                try:
                    return self._json(event_preparations.upcoming(c,expand_events,q.get('today',[None])[0]))
                except ValueError as ex: return self._json({'error':str(ex)},400)
            if p == '/api/budget':
                try: return self._json(budget_snapshot(c,budget_month(q.get('month',[date.today().strftime('%Y-%m')])[0]),now_iso()))
                except ValueError as ex:return self._json({'error':str(ex)},400)
            if p == '/api/tracker-boards':
                try:
                    month=str(q.get('month',[date.today().strftime('%Y-%m')])[0])
                    if len(month)!=7 or date.fromisoformat(month+'-01').strftime('%Y-%m')!=month:
                        raise ValueError()
                    archived=str(q.get('archived',['0'])[0])=='1'
                    view=str(q.get('periods',['0'])[0])=='1'
                    shifts=json.loads(str(q.get('offsets',['{}'])[0])) if view else {}
                    if not isinstance(shifts,dict) or len(shifts)>48:raise ValueError()
                    if any(not str(k).isdigit() or isinstance(v,bool) or
                           not isinstance(v,int) or abs(v)>60 for k,v in shifts.items()):
                        raise ValueError()
                except (ValueError,TypeError):
                    return self._json({'error':'Mois ou périodes invalides.'},400)
                boards=[dict(row) for row in c.execute(
                    'SELECT * FROM tracker_boards WHERE archived=? ORDER BY id DESC',(int(archived),))]
                try:
                    for board in boards:
                        if archived:board['archive_summary']=tracker_rituals.archive_month_summary(c,board)
                        if view:board['period']=tracker_window(board,shifts.get(str(board['id']),0))
                        board['rows']=[dict(row) for row in c.execute(
                            'SELECT id,title,mode,order_index,target_count,weekday,linked_type,linked_id FROM tracker_board_rows '
                            'WHERE board_id=? AND archived=0 ORDER BY order_index,id',(board['id'],))]
                        for line in board['rows']:
                            line['steps']=tracker_rituals.steps_for_row(
                                c,line['id'],board['period']['start'] if view else month+'-01',
                                board['period']['end'] if view else month+'-31')
                            if view:
                                line['marks']={row['day']:row['value'] for row in c.execute(
                                    'SELECT day,value FROM tracker_board_marks '
                                    'WHERE row_id=? AND day BETWEEN ? AND ?',
                                    (line['id'],board['period']['start'],board['period']['end']))}
                            else:
                                line['marks']={row['day']:row['value'] for row in c.execute(
                                    'SELECT day,value FROM tracker_board_marks WHERE row_id=? AND day LIKE ?',
                                    (line['id'],month+'-%'))}
                except (ValueError,OverflowError):
                    return self._json({'error':'Période hors calendrier.'},400)
                return self._json(boards)
            if p == '/api/trackers':
                trackers=[dict(row) for row in c.execute('SELECT * FROM personal_trackers WHERE archived=0 ORDER BY id')]
                for item in trackers:
                    item['entries']=[dict(row) for row in c.execute(
                        'SELECT id,entry_date,value,notes FROM personal_tracker_entries WHERE tracker_id=? ORDER BY entry_date DESC LIMIT 90',(item['id'],))]
                return self._json(trackers)
            if p == '/api/admin':
                archived=str(q.get('archived',['0'])[0])=='1'
                items=[dict(row) for row in c.execute(
                    "SELECT a.*,e.title AS event_title,e.event_date AS linked_event_date "
                    "FROM admin_documents a LEFT JOIN events e ON a.event_id=e.id "
                    "WHERE a.archived=? "
                    "ORDER BY CASE a.status WHEN 'todo' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, "
                    "COALESCE(a.due_date,'9999'),a.id DESC",(int(archived),))]
                for item in items:item['attachments']=admin_docs.summaries(c,item['id'])
                return self._json(items)
            if p == '/api/captures':
                return self._json([dict(row) for row in c.execute('SELECT * FROM quick_captures ORDER BY seen,created_at DESC,id DESC LIMIT 300')])
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
                linked_admin={}
                for item in c.execute('SELECT id,title,event_id FROM admin_documents WHERE event_id IS NOT NULL'):
                    linked_admin.setdefault(item['event_id'],[]).append({'id':item['id'],'title':item['title']})
                event_files={}
                for e in expanded:
                    if e['id'] not in event_files:
                        event_files[e['id']]=admin_docs.event_summaries(c,e['id'])
                    e['attachments']=event_files[e['id']]
                    e['admin_links']=linked_admin.get(e['id'],[])
                    key = (e['id'], e.get('instance_date') or e['event_date'])
                    completed_at = done_map.get(key)
                    action = action_map.get(key)
                    e['instance_done'] = bool(completed_at)
                    e['instance_completed_at'] = completed_at or ''
                    e['instance_action'] = action['action'] if action else ''
                    e['moved_event_id'] = action['moved_event_id'] if action else None
                    e['instance_action_at'] = action['action_at'] if action else ''
                return self._json(event_preparations.attach(c,[e for e in expanded if e.get('instance_action')!='hidden']))
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
            if p == '/api/progression':
                return self._json(progression.summary(c))
            if p == '/api/progression/history':
                return self._json(progression.history(c))
            if p == '/api/objective-map':
                try:
                    root_id=int(q.get('domain_id',['0'])[0])
                    return self._json(objective_maps.get_map(c,root_id))
                except (ValueError,TypeError) as ex:
                    return self._json({'error':str(ex)},400)
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
        u = urlparse(self.path); p = u.path
        parts=p.strip('/').split('/')
        if len(parts)==4 and parts[:2] in (['api','admin'],['api','events']) and parts[3]=='attachments':
            try:incoming_size=int(self.headers.get('Content-Length','0') or '0')
            except ValueError:return self._json({'error':'Taille invalide.'},400)
            if incoming_size>admin_docs.MAX_ATTACHMENT_REQUEST:
                return self._json({'error':'Pièce jointe trop volumineuse (4 Mo max).'},413)
        body = self._body(); ts = now_iso()
        if len(parts)==4 and parts[:2]==['api','admin'] and parts[3]=='attachments':
            try:admin_id=int(parts[2])
            except ValueError:return self._json({'error':'Démarche invalide.'},400)
            try:
                name,mime,content=admin_docs.filename_and_bytes(
                    body.get('filename'),body.get('mime_type'),body.get('base64'))
            except (ValueError,AttributeError) as exc:
                return self._json({'error':str(exc)},400)
            with conn() as c:
                if not c.execute('SELECT 1 FROM admin_documents WHERE id=?',(admin_id,)).fetchone():
                    return self._json({'error':'Démarche introuvable.'},404)
                cur=c.execute('INSERT INTO admin_attachments(admin_id,filename,mime_type,byte_size,content,created_at) '
                    'VALUES(?,?,?,?,?,?)',(admin_id,name,mime,len(content),content,ts))
                c.commit()
                return self._json({'id':cur.lastrowid,'filename':name},201)
        if len(parts)==4 and parts[:2]==['api','events'] and parts[3]=='attachments':
            try:event_id=int(parts[2])
            except ValueError:return self._json({'error':'Rendez-vous invalide.'},400)
            try:
                name,mime,content=admin_docs.filename_and_bytes(
                    body.get('filename'),body.get('mime_type'),body.get('base64'))
            except (ValueError,AttributeError) as exc:
                return self._json({'error':str(exc)},400)
            with conn() as c:
                if not c.execute('SELECT 1 FROM events WHERE id=?',(event_id,)).fetchone():
                    return self._json({'error':'Rendez-vous introuvable.'},404)
                cur=c.execute('INSERT INTO event_attachments(event_id,filename,mime_type,byte_size,content,created_at) '
                    'VALUES(?,?,?,?,?,?)',(event_id,name,mime,len(content),content,ts))
                c.commit()
                return self._json({'id':cur.lastrowid,'filename':name},201)
        if p == '/api/version':
            return self._json({'version': atelier_version()})
        if p == '/api/quick-capture/hotkey':
            try:
                shortcut=str(body.get('shortcut') or '')
                quick_capture_native.parse_hotkey(shortcut)
                target=DATA/'quick-capture-hotkey.json'
                temporary=DATA/'quick-capture-hotkey.tmp'
                temporary.write_text(json.dumps({'shortcut':shortcut}),encoding='utf-8')
                temporary.replace(target)
                return self._json({'shortcut':shortcut,'ok':True})
            except (ValueError,TypeError) as ex:
                return self._json({'error':str(ex)},400)
            except OSError as ex:
                return self._json({'error':'Impossible de sauvegarder le raccourci : '+str(ex)},500)
        if p == '/api/shutdown':
            self._json({'ok':True,'version':atelier_version()})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if p == '/api/update/start':
            # Only this installation's localhost UI may initiate an update.
            # The per-edition port is fixed by the server configuration.
            if (self.headers.get('Origin') != f'http://{HOST}:{PORT}'
                    or self.headers.get('X-Atelier-Update') != '1'):
                return self._json({'error':'Action réservée aux Paramètres de cette installation.'},403)
            try:
                return self._json(updater.begin(str(body.get('revision',''))))
            except RuntimeError as exc:
                return self._json({'error':str(exc)},409)
            except Exception as exc:
                return self._json({'error':'Mise à jour impossible : '+str(exc)},502)

        if p in ('/api/desktop-postits/start','/api/desktop-postits/startup','/api/desktop-postits/new'):
            # Native desktop actions are restricted to this installation's origin.
            if (self.headers.get('Origin') != f'http://{HOST}:{PORT}'
                    or self.headers.get('X-Atelier-Desktop') != '1'):
                return self._json({'error':'Action réservée à cette installation de L’Atelier.'},403)
            try:
                if p.endswith('/startup'):
                    if not isinstance(body,dict) or not isinstance(body.get('enabled'),bool):
                        return self._json({'error':'Réglage incorrect.'},400)
                    enabled=desktop_postits.set_startup(body['enabled'])
                    return self._json({'ok':True,'startup':enabled})
                if p.endswith('/new'):
                    desktop_postits._guard()
                    note_id=desktop_postits.create_note()
                    desktop_postits.launch()
                    return self._json({'ok':True,'id':note_id},201)
                return self._json(desktop_postits.launch())
            except (RuntimeError,OSError) as exc:
                return self._json({'error':str(exc)},409)
        if p == '/api/standalone-preparations':
            title=str(body.get('title') or '').strip()[:150]
            if not title:return self._json({'error':'Nom du préparatif requis.'},400)
            try:
                due=date.fromisoformat(str(body['due_date'])).isoformat() if body.get('due_date') else None
            except (TypeError,ValueError):return self._json({'error':'Date incorrecte.'},400)
            with conn() as c:
                if c.execute('SELECT COUNT(*) FROM standalone_preparation_lists WHERE archived=0').fetchone()[0]>=60:
                    return self._json({'error':'Archive une liste avant d’en ajouter.'},409)
                cur=c.execute('INSERT INTO standalone_preparation_lists '
                              '(title,due_date,created_at,updated_at) VALUES(?,?,?,?)',
                              (title,due,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if p.startswith('/api/standalone-preparations/') and p.endswith('/items'):
            parts=p.strip('/').split('/')
            if len(parts)!=4:return self._json({'error':'Adresse invalide.'},404)
            try:list_id=int(parts[2])
            except (TypeError,ValueError):return self._json({'error':'Liste invalide.'},400)
            title=str(body.get('title') or '').strip()[:180]
            if not title:return self._json({'error':'Élément requis.'},400)
            with conn() as c:
                if not c.execute('SELECT 1 FROM standalone_preparation_lists WHERE id=? AND archived=0',
                                 (list_id,)).fetchone():
                    return self._json({'error':'Liste introuvable ou archivée.'},404)
                if c.execute('SELECT COUNT(*) FROM standalone_preparation_items WHERE list_id=? AND archived=0',
                             (list_id,)).fetchone()[0]>=80:
                    return self._json({'error':'Maximum 80 éléments par liste.'},409)
                order=c.execute('SELECT COALESCE(MAX(order_index),0)+1 FROM standalone_preparation_items '
                                'WHERE list_id=?',(list_id,)).fetchone()[0]
                cur=c.execute('INSERT INTO standalone_preparation_items '
                              '(list_id,title,order_index,created_at,updated_at) VALUES(?,?,?,?,?)',
                              (list_id,title,order,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if p == '/api/tracker-boards':
            title=str(body.get('title') or '').strip()[:100]
            color=str(body.get('color') or 'sage')
            if not title:return self._json({'error':'Nom du tableau requis.'},400)
            if color not in ('sage','rose','mauve','gold','blue','peach'):
                return self._json({'error':'Couleur de tableau invalide.'},400)
            try:
                unit,count=tracker_period_choice(
                    body.get('period_unit','months'),body.get('period_count',1))
            except ValueError as ex:return self._json({'error':str(ex)},400)
            anchor=tracker_period_anchor(unit).isoformat()
            with conn() as c:
                if c.execute('SELECT COUNT(*) FROM tracker_boards WHERE archived=0').fetchone()[0]>=48:
                    return self._json({'error':'Archive un tableau avant d’en créer un autre.'},409)
                cur=c.execute('INSERT INTO tracker_boards(title,color,period_unit,period_count,anchor_date,'
                              'created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                              (title,color,unit,count,anchor,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if len(parts)==4 and parts[:2]==['api','tracker-board-rows'] and parts[3]=='duplicate':
            try:row_id=int(parts[2])
            except (ValueError,TypeError):return self._json({'error':'Ligne invalide.'},400)
            with conn() as c:
                row=c.execute('SELECT r.*, b.archived AS board_archived FROM tracker_board_rows r '
                    'JOIN tracker_boards b ON b.id=r.board_id WHERE r.id=?',(row_id,)).fetchone()
                if not row or row['archived'] or row['board_archived']:
                    return self._json({'error':'Ligne introuvable ou archivée.'},404)
                if c.execute('SELECT COUNT(*) FROM tracker_board_rows WHERE board_id=? AND archived=0',
                             (row['board_id'],)).fetchone()[0]>=80:
                    return self._json({'error':'Limite de lignes atteinte.'},409)
                index=c.execute('SELECT COALESCE(MAX(order_index),0)+1 FROM tracker_board_rows WHERE board_id=?',
                                (row['board_id'],)).fetchone()[0]
                copy_title=(row['title']+' (copie)')[:100]
                new=c.execute('INSERT INTO tracker_board_rows '
                    '(board_id,title,mode,target_count,weekday,linked_type,linked_id,order_index,created_at,updated_at) '
                    'VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (row['board_id'],copy_title,row['mode'],row['target_count'],row['weekday'],
                     row['linked_type'],row['linked_id'],index,ts,ts)).lastrowid
                # Les sous-étapes sont une configuration ; les coches restent propres à la ligne source.
                for step in c.execute('SELECT title,order_index FROM tracker_row_steps '
                                      'WHERE row_id=? AND active=1 ORDER BY order_index,id',(row_id,)).fetchall():
                    c.execute('INSERT INTO tracker_row_steps(row_id,title,order_index,active) VALUES(?,?,?,1)',
                              (new,step['title'],step['order_index']))
                c.commit()
                return self._json({'id':new,'title':copy_title},201)
        if p.startswith('/api/tracker-boards/') and p.endswith('/rows'):
            parts=p.strip('/').split('/')
            if len(parts)!=4:return self._json({'error':'Adresse invalide.'},404)
            try:board_id=int(parts[2])
            except ValueError:return self._json({'error':'Tableau invalide.'},400)
            title=str(body.get('title') or '').strip()[:100]
            mode=str(body.get('mode') or 'check')
            if not title or mode not in ('check','number'):
                return self._json({'error':'Ligne ou type de suivi invalide.'},400)
            try:
                target,weekday,link,identity=tracker_rituals.normalized_row_config(body,mode)
            except ValueError as ex:return self._json({'error':str(ex)},400)
            with conn() as c:
                try:tracker_rituals.check_link(c,link,identity)
                except ValueError as ex:return self._json({'error':str(ex)},400)
                if not c.execute('SELECT 1 FROM tracker_boards WHERE id=? AND archived=0',(board_id,)).fetchone():
                    return self._json({'error':'Tableau introuvable ou archivé.'},404)
                if c.execute('SELECT COUNT(*) FROM tracker_board_rows WHERE board_id=? AND archived=0',(board_id,)).fetchone()[0]>=80:
                    return self._json({'error':'Limite de lignes atteinte.'},409)
                index=c.execute('SELECT COALESCE(MAX(order_index),0)+1 FROM tracker_board_rows WHERE board_id=?',
                                (board_id,)).fetchone()[0]
                cur=c.execute('INSERT INTO tracker_board_rows '
                              '(board_id,title,mode,target_count,weekday,linked_type,linked_id,order_index,created_at,updated_at) '
                              'VALUES(?,?,?,?,?,?,?,?,?,?)',
                              (board_id,title,mode,target,weekday,link,identity,index,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if p == '/api/trackers':
            title=str(body.get('title') or '').strip()[:120]
            unit=str(body.get('unit') or '').strip()[:32]
            if not title:return self._json({'error':'Nom du tracker requis.'},400)
            try:
                target=float(body['target']) if body.get('target') not in (None,'') else None
                if target is not None and (not math.isfinite(target) or abs(target)>100000000):raise ValueError()
            except (TypeError,ValueError):return self._json({'error':'Objectif numérique invalide.'},400)
            with conn() as c:
                cur=c.execute('INSERT INTO personal_trackers(title,unit,target,created_at,updated_at) VALUES(?,?,?,?,?)',(title,unit,target,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if p == '/api/admin':
            title=str(body.get('title') or '').strip()[:180]
            if not title:return self._json({'error':'Nom de démarche requis.'},400)
            due=str(body.get('due_date') or '').strip()
            try:due=date.fromisoformat(due).isoformat() if due else None
            except ValueError:return self._json({'error':'Date invalide.'},400)
            category=str(body.get('category') or 'Général').strip()[:80]
            notes=str(body.get('notes') or '')[:8000]
            with conn() as c:
                cur=c.execute('INSERT INTO admin_documents(title,category,due_date,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)',(title,category,due,notes,ts,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if p == '/api/captures':
            destination=str(body.get('destination') or '').lower()
            if destination not in ('carnet','taches','rappels','postit','administratif','tracker'):
                return self._json({'error':'Destination inconnue.'},400)
            content=str(body.get('body') or '').strip()
            if not content or len(content)>10000:return self._json({'error':'Texte requis (10 000 caractères maximum).'},400)
            with conn() as c:
                cur=c.execute('INSERT INTO quick_captures(destination,body,created_at) VALUES(?,?,?)',(destination,content,ts))
                c.commit();return self._json({'id':cur.lastrowid},201)
        if p == '/api/postits':
            if not isinstance(body,dict):return self._json({'error':'Données incorrectes.'},400)
            title=str(body.get('title','')).strip()[:120] or 'Sans titre'
            content=str(body.get('body',''))
            colors={'sage','mauve','gold','red','pink','blue','peach','cream','deep-blue','deep-green'}
            color=str(body.get('color','gold'))
            shape=str(body.get('shape','rounded'))
            if len(content)>20000 or color not in colors or shape not in ('square','rounded','pill'):
                return self._json({'error':'Texte, couleur ou forme incorrects.'},400)
            with conn() as c:
                count=c.execute('SELECT COUNT(*) FROM home_postits WHERE archived=0').fetchone()[0]
                if count>=100:return self._json({'error':'Archive quelques notes avant d’en ajouter.'},409)
                cur=c.execute('INSERT INTO home_postits(title,body,color,shape,archived,created_at,updated_at) VALUES(?,?,?,?,0,?,?)',
                              (title,content,color,shape,ts,ts))
                c.commit()
                return self._json({'id':cur.lastrowid},201)
        if p == '/api/recipe-import-url':
            try:
                return self._json(import_recipe_from_url(body.get('url','')))
            except ValueError as exc:
                return self._json({'error':str(exc)},400)
            except Exception as exc:
                print('[Atelier] Import recette URL:', exc)
                return self._json({'error':"Impossible de lire cette page. Vérifie le lien ou essaie une autre recette."},502)
        with conn() as c:
            if p == '/api/budget/rules':
                try:
                    kind=str(body.get('kind',''))
                    if kind not in ('income','fixed'):raise ValueError('Type invalide.')
                    title=str(body.get('title','')).strip()[:120]
                    if not title:raise ValueError('Nom requis.')
                    amount=budget_amount(body.get('amount'))
                    day=int(body.get('day_of_month'))
                    if day<1 or day>31:raise ValueError('Jour invalide.')
                    start=budget_date(body.get('start_date'));end=budget_date(body['end_date']) if body.get('end_date') else None
                    if end and end<start:raise ValueError('La fin précède le début.')
                    cur=c.execute("""INSERT INTO budget_rules(kind,title,category,amount_cents,day_of_month,start_date,end_date,created_at)
                       VALUES(?,?,?,?,?,?,?,?)""",(kind,title,str(body.get('category') or 'Général')[:80],amount,day,start,end,ts))
                    c.commit();return self._json({'id':cur.lastrowid},201)
                except (ValueError,TypeError) as ex:return self._json({'error':str(ex)},400)
            if p == '/api/budget/debts':
                try:
                    title=str(body.get('title','')).strip()[:120]
                    if not title:raise ValueError('Nom requis.')
                    total=budget_amount(body.get('total'));monthly=budget_amount(body.get('monthly'))
                    if total<=0 or monthly<=0:raise ValueError('Montant nul.')
                    day=int(body.get('day_of_month'))
                    if not 1<=day<=31:raise ValueError('Jour invalide.')
                    start=budget_date(body.get('start_date'));end=budget_date(body['end_date']) if body.get('end_date') else None
                    if end and end<start:raise ValueError('Fin invalide.')
                    cur=c.execute("""INSERT INTO budget_debts(title,total_cents,monthly_cents,day_of_month,start_date,end_date,created_at)
                      VALUES(?,?,?,?,?,?,?)""",(title,total,monthly,day,start,end,ts))
                    c.commit();return self._json({'id':cur.lastrowid},201)
                except (ValueError,TypeError) as ex:return self._json({'error':str(ex)},400)
            if p == '/api/budget/entries':
                try:
                    title=str(body.get('title','')).strip()[:120]
                    if not title:raise ValueError('Nom requis.')
                    kind=str(body.get('kind','expense'))
                    if kind not in ('income','expense'):raise ValueError('Type invalide.')
                    amount=budget_amount(body.get('amount'))
                    when=budget_date(body.get('date'))
                    status='pending' if body.get('planned') else 'confirmed'
                    cur=c.execute("""INSERT INTO budget_entries(scheduled_date,title,kind,category,amount_cents,status,source,actual_date,notes,created_at)
                       VALUES(?,?,?,?,? ,?,'manual',?,?,?)""",
                      (when,title,kind,str(body.get('category') or 'Général')[:80],amount,status,None if status=='pending' else when,str(body.get('notes') or '')[:2000],ts))
                    c.commit();return self._json({'id':cur.lastrowid},201)
                except (ValueError,TypeError) as ex:return self._json({'error':str(ex)},400)
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
                overlap=c.execute('SELECT 1 FROM menstrual_periods WHERE start_date<=? AND COALESCE(end_date,start_date)>=? LIMIT 1',
                                  ((end or start).isoformat(),start.isoformat())).fetchone()
                if overlap: return self._json({'error':'Cette période chevauche des règles déjà enregistrées. Modifie la période existante.'},409)
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
                    1 if body.get('all_day') else 0, body.get('category','general'), body.get('color','auto'), body.get('location',''), body.get('notes',''),
                    body.get('contact',''), body.get('travel_time',''), body.get('url',''), body.get('status','planned'), body.get('recurrence','none'),
                    1 if body.get('show_in_month', True) else 0, ts, ts)
                if not vals[0] or not vals[1]: return self._json({'error':'title and event_date required'},400)
                cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,color,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
                eid=cur.lastrowid
                for ra in body.get('reminders',[]) or []:
                    if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                    when = (ra or {}).get('remind_at')
                    if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('event',eid,(ra or {}).get('title',''),when,'pending',ts))
                try:
                    if 'preparations' in body:
                        event_preparations.replace_templates(c,eid,body['preparations'],ts)
                except (ValueError,TypeError,LookupError) as ex:
                    c.rollback();return self._json({'error':str(ex)},400)
                c.commit(); return self._json({'id':eid},201)
            if p == '/api/objective-map/edges':
                try:
                    objective_maps.add_edge(c,int(body['from_id']),int(body['to_id']))
                    c.commit(); return self._json({'ok':True},201)
                except (ValueError,KeyError,TypeError,sqlite3.IntegrityError) as ex:
                    return self._json({'error':str(ex)},400)
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
        if len(parts)==4 and parts[:2]==['api','tracker-board-rows'] and parts[3]=='move':
            try:row_id=int(parts[2])
            except (ValueError,TypeError):return self._json({'error':'Ligne invalide.'},400)
            direction=body.get('direction')
            dropping='before_id' in body
            if not dropping and direction not in ('up','down'):
                return self._json({'error':'Sens du déplacement invalide.'},400)
            with conn() as c:
                current=c.execute(
                    'SELECT board_id FROM tracker_board_rows WHERE id=? AND archived=0',(row_id,)).fetchone()
                if not current:return self._json({'error':'Ligne introuvable.'},404)
                rows=[x['id'] for x in c.execute(
                    'SELECT id FROM tracker_board_rows WHERE board_id=? AND archived=0 '
                    'ORDER BY order_index,id',(current['board_id'],))]
                position=rows.index(row_id)
                if dropping:
                    try:
                        anchor=None if body['before_id'] is None else int(body['before_id'])
                    except (TypeError,ValueError):
                        return self._json({'error':'Position cible invalide.'},400)
                    if anchor is not None and anchor not in rows:
                        return self._json({'error':'La ligne cible doit être dans le même tableau.'},400)
                    if anchor==row_id:return self._json({'ok':True,'moved':False})
                    rows.remove(row_id)
                    rows.insert(rows.index(anchor) if anchor is not None else len(rows),row_id)
                else:
                    target=position+(-1 if direction=='up' else 1)
                    if target<0 or target>=len(rows):
                        return self._json({'ok':True,'moved':False})
                    rows[position],rows[target]=rows[target],rows[position]
                for index,identity in enumerate(rows,1):
                    c.execute('UPDATE tracker_board_rows SET order_index=?,updated_at=? WHERE id=?',
                              (index,ts,identity))
                c.commit()
                return self._json({'ok':True,'moved':True})
        if len(parts)==4 and parts[:2]==['api','tracker-board-rows'] and parts[3]=='setup':
            try:row_id=int(parts[2])
            except (TypeError,ValueError):return self._json({'error':'Ligne invalide.'},400)
            try:
                with conn() as c:
                    reply=tracker_rituals.save_setup(c,row_id,body,ts)
                    c.commit()
                    return self._json(reply)
            except ValueError as ex:return self._json({'error':str(ex)},400)
            except LookupError as ex:return self._json({'error':str(ex)},404)
        if len(parts)==4 and parts[:2]==['api','tracker-row-steps'] and parts[3]=='check':
            try:
                step_id=int(parts[2])
                day=date.fromisoformat(str(body['day'])).isoformat()
                with conn() as c:
                    reply=tracker_rituals.toggle_step(c,step_id,day,body.get('done'),ts)
                    c.commit()
                    return self._json(reply)
            except (TypeError,ValueError,KeyError) as ex:
                return self._json({'error':str(ex)},400)
            except LookupError as ex:return self._json({'error':str(ex)},404)
        if len(parts)==3 and parts[:2]==['api','standalone-preparation-items']:
            try:entry_id=int(parts[2])
            except (TypeError,ValueError):return self._json({'error':'Élément invalide.'},400)
            if type(body.get('done')) is not bool:
                return self._json({'error':'Case à cocher incorrecte.'},400)
            with conn() as c:
                changed=c.execute(
                    'UPDATE standalone_preparation_items SET done=?,updated_at=? '
                    'WHERE id=? AND archived=0 AND list_id IN '
                    '(SELECT id FROM standalone_preparation_lists WHERE archived=0)',
                    (int(body['done']),ts,entry_id))
                c.commit()
                return self._json({'ok':bool(changed.rowcount)},200 if changed.rowcount else 404)
        if len(parts)==3 and parts[:2]==['api','standalone-preparations']:
            try:list_id=int(parts[2])
            except (TypeError,ValueError):return self._json({'error':'Liste invalide.'},400)
            if type(body.get('archived')) is not bool:
                return self._json({'error':'Archivage incorrect.'},400)
            with conn() as c:
                changed=c.execute('UPDATE standalone_preparation_lists SET archived=?,updated_at=? WHERE id=?',
                                  (int(body['archived']),ts,list_id))
                c.commit()
                return self._json({'ok':bool(changed.rowcount)},200 if changed.rowcount else 404)
        if len(parts)==3 and parts[:2]==['api','tracker-boards']:
            try:board_id=int(parts[2])
            except (ValueError,TypeError):return self._json({'error':'Tableau invalide.'},400)
            if 'archived' in body:
                archived=body['archived']
                if type(archived) is not bool:
                    return self._json({'error':'Archivage invalide.'},400)
                with conn() as c:
                    updated=c.execute('UPDATE tracker_boards SET archived=?,updated_at=? WHERE id=?',
                                      (int(archived),ts,board_id))
                    c.commit()
                    return self._json({'ok':bool(updated.rowcount)},200 if updated.rowcount else 404)
            try:
                unit,count=tracker_period_choice(body['period_unit'],body['period_count'])
            except (ValueError,TypeError,KeyError) as ex:
                return self._json({'error':'Périodicité invalide.'},400)
            # A rhythm change never clears old cells. Restore the old rhythm to
            # view its historic marks again; keep the same anchored date.
            anchor=tracker_period_anchor(unit).isoformat()
            with conn() as c:
                updated=c.execute(
                    'UPDATE tracker_boards SET period_unit=?,period_count=?,anchor_date=?,updated_at=? '
                    'WHERE id=? AND archived=0',(unit,count,anchor,ts,board_id))
                c.commit()
                return self._json({'ok':bool(updated.rowcount)},200 if updated.rowcount else 404)
        if len(parts)==4 and parts[:2]==['api','tracker-board-rows'] and parts[3]=='mark':
            try:
                row_id=int(parts[2])
                when=date.fromisoformat(str(body['day'])).isoformat()
                value=body.get('value')
            except (ValueError,TypeError,KeyError):return self._json({'error':'Jour invalide.'},400)
            with conn() as c:
                row=c.execute('SELECT r.mode,r.weekday,r.target_count FROM tracker_board_rows r '
                              'JOIN tracker_boards b ON r.board_id=b.id '
                              'WHERE r.id=? AND r.archived=0 AND b.archived=0',(row_id,)).fetchone()
                if not row:return self._json({'error':'Ligne introuvable ou archivée.'},404)
                if row['weekday'] is not None and date.fromisoformat(when).weekday()!=row['weekday']:
                    return self._json({'error':'Cette ligne est prévue un autre jour de la semaine.'},409)
                if row['mode']=='check' and value is not None and c.execute(
                      'SELECT 1 FROM tracker_row_steps WHERE row_id=? AND active=1 LIMIT 1',(row_id,)).fetchone():
                    return self._json({'error':'Termine les étapes de la liste pour valider cette habitude.'},409)
                if value is not None:
                    if row['mode']=='check':
                        if type(value) is not bool or not value:
                            return self._json({'error':'Utilise une case cochée ou vide.'},400)
                        encoded='1'
                    else:
                        try:
                            if isinstance(value,bool):raise ValueError()
                            numeric=float(value)
                            if not math.isfinite(numeric) or abs(numeric)>1000000:raise ValueError()
                            if row['target_count'] is not None:
                                if numeric<0 or numeric>row['target_count'] or not numeric.is_integer():
                                    raise ValueError()
                            encoded=format(numeric,'.8g')
                        except (TypeError,ValueError):
                            return self._json({'error':'Valeur numérique invalide.'},400)
                    c.execute('INSERT INTO tracker_board_marks(row_id,day,value,updated_at) VALUES(?,?,?,?) '
                              'ON CONFLICT(row_id,day) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
                              (row_id,when,encoded,ts))
                else:
                    c.execute('DELETE FROM tracker_board_marks WHERE row_id=? AND day=?',(row_id,when))
                c.commit();return self._json({'ok':True})
        if len(parts)==3 and parts[:2]==['api','cycle-periods']:
            try:
                period_id=int(parts[2])
                start=date.fromisoformat(str(body.get('start_date','')))
                end=date.fromisoformat(str(body['end_date'])) if body.get('end_date') else None
                if end and (end<start or (end-start).days>20):
                    return self._json({'error':'La période de règles ne peut pas dépasser 21 jours.'},400)
                with conn() as c:
                    previous=c.execute('SELECT id FROM menstrual_periods WHERE id=?',(period_id,)).fetchone()
                    if not previous:return self._json({'error':'Période introuvable.'},404)
                    overlap=c.execute('SELECT 1 FROM menstrual_periods WHERE id!=? AND start_date<=? AND COALESCE(end_date,start_date)>=? LIMIT 1',
                                      (period_id,(end or start).isoformat(),start.isoformat())).fetchone()
                    if overlap:return self._json({'error':'Ces dates chevauchent une autre période.'},409)
                    c.execute('UPDATE menstrual_periods SET start_date=?,end_date=? WHERE id=?',
                              (start.isoformat(),end.isoformat() if end else None,period_id))
                    c.commit()
                return self._json({'ok':True})
            except (ValueError,TypeError):return self._json({'error':'Date ou identifiant invalide.'},400)
        if len(parts)==4 and parts[:2]==['api','trackers'] and parts[3]=='entries':
            try:
                tracker_id=int(parts[2]);when=date.fromisoformat(str(body.get('entry_date') or date.today().isoformat())).isoformat()
                value=float(body.get('value'))
                if not math.isfinite(value) or abs(value)>100000000:raise ValueError()
                notes=str(body.get('notes') or '')[:2000]
            except (TypeError,ValueError):return self._json({'error':'Date ou valeur numérique invalide.'},400)
            with conn() as c:
                if not c.execute('SELECT 1 FROM personal_trackers WHERE id=? AND archived=0',(tracker_id,)).fetchone():
                    return self._json({'error':'Tracker introuvable.'},404)
                c.execute("""INSERT INTO personal_tracker_entries(tracker_id,entry_date,value,notes,created_at)
                   VALUES(?,?,?,?,?) ON CONFLICT(tracker_id,entry_date) DO UPDATE SET value=excluded.value,notes=excluded.notes""",
                   (tracker_id,when,value,notes,ts))
                c.commit();return self._json({'ok':True})
        if len(parts)==3 and parts[:2]==['api','admin']:
            try:doc_id=int(parts[2])
            except ValueError:return self._json({'error':'Identifiant invalide.'},400)
            with conn() as c:
                row=c.execute('SELECT * FROM admin_documents WHERE id=?',(doc_id,)).fetchone()
                if not row:return self._json({'error':'Démarche introuvable.'},404)
                status=str(body.get('status',row['status']))
                if status not in ('todo','waiting','done'):return self._json({'error':'Statut invalide.'},400)
                title=str(body.get('title',row['title'])).strip()[:180]
                if not title:return self._json({'error':'Nom requis.'},400)
                due=str(body.get('due_date',row['due_date']) or '').strip()
                try:due=date.fromisoformat(due).isoformat() if due else None
                except ValueError:return self._json({'error':'Date invalide.'},400)
                raw_event=body.get('event_id',row['event_id'])
                try:event_id=int(raw_event) if raw_event not in (None,'') else None
                except (TypeError,ValueError):return self._json({'error':'Rendez-vous invalide.'},400)
                if event_id is not None and not c.execute('SELECT 1 FROM events WHERE id=?',(event_id,)).fetchone():
                    return self._json({'error':'Rendez-vous introuvable.'},404)
                raw_archive=body.get('archived',bool(row['archived']))
                if type(raw_archive) is not bool:return self._json({'error':'Archivage invalide.'},400)
                c.execute('UPDATE admin_documents SET title=?,category=?,due_date=?,status=?,notes=?,event_id=?,archived=?,updated_at=? WHERE id=?',
                    (title,str(body.get('category',row['category']))[:80],due,status,str(body.get('notes',row['notes']))[:8000],event_id,int(raw_archive),ts,doc_id))
                c.commit();return self._json({'ok':True})
        if len(parts)==3 and parts[:2]==['api','captures']:
            try:capture_id=int(parts[2])
            except ValueError:return self._json({'error':'Identifiant invalide.'},400)
            with conn() as c:
                updated=c.execute('UPDATE quick_captures SET seen=? WHERE id=?',(1 if body.get('seen',True) else 0,capture_id))
                c.commit();return self._json({'ok':bool(updated.rowcount)})
        if len(parts)==5 and parts[:2]==['api','events'] and parts[3]=='preparations':
            try:
                eid=int(parts[2]); pid=int(parts[4]); day=str(body.get('instance_date') or '')
                if not isinstance(body.get('done'),bool): raise ValueError('État de case invalide.')
                with conn() as c:
                    event_preparations.set_checked(c,eid,pid,day,body['done'],ts)
                    c.commit()
                return self._json({'ok':True})
            except (ValueError,TypeError) as ex: return self._json({'error':str(ex)},400)
            except LookupError as ex: return self._json({'error':str(ex)},404)
        if len(parts)==3 and parts[:2]==['api','postits']:
            if not isinstance(body,dict):return self._json({'error':'Données incorrectes.'},400)
            try:note_id=int(parts[2])
            except (TypeError,ValueError):return self._json({'error':'Note invalide.'},400)
            with conn() as c:
                old=c.execute('SELECT * FROM home_postits WHERE id=?',(note_id,)).fetchone()
                if not old:return self._json({'error':'Post-it introuvable.'},404)
                title=str(body.get('title',old['title'])).strip()[:120] or 'Sans titre'
                content=str(body.get('body',old['body']))
                color=str(body.get('color',old['color']))
                shape=str(body.get('shape',old['shape']))
                raw_archived=body.get('archived',bool(old['archived']))
                if type(raw_archived) is not bool:
                    return self._json({'error':'Statut d’archivage invalide.'},400)
                archived=int(raw_archived)
                colors={'sage','mauve','gold','red','pink','blue','peach','cream','deep-blue','deep-green'}
                if len(content)>20000 or color not in colors or shape not in ('square','rounded','pill'):
                    return self._json({'error':'Texte, couleur ou forme incorrects.'},400)
                if old['archived'] and not archived:
                    count=c.execute('SELECT COUNT(*) FROM home_postits WHERE archived=0').fetchone()[0]
                    if count>=100:
                        return self._json({'error':'Archive quelques notes avant de les restaurer.'},409)
                c.execute('UPDATE home_postits SET title=?,body=?,color=?,shape=?,archived=?,updated_at=? WHERE id=?',
                          (title,content,color,shape,archived,ts,note_id))
                c.commit()
                return self._json({'ok':True,'id':note_id})
        if p == '/api/objective-map/node':
            try:
                with conn() as c:
                    node_id=int(body['node_id'])
                    if 'x' in body or 'y' in body:
                        if not ('x' in body and 'y' in body):
                            raise ValueError('Les deux coordonnées sont requises')
                        objective_maps.set_position(c,node_id,float(body['x']),float(body['y']))
                    if 'validation_mode' in body:
                        objective_maps.set_validation(c,node_id,str(body['validation_mode']))
                    if 'required' in body:
                        if not isinstance(body['required'],bool): raise ValueError('Statut obligatoire invalide')
                        objective_maps.set_required(c,node_id,body['required'])
                    objective_maps.reconcile_automatic(c,progression,ts)
                    c.commit()
                return self._json({'ok':True})
            except (KeyError,TypeError,ValueError) as ex:
                return self._json({'error':str(ex)},400)
        if p == '/api/objective-map/settings':
            try:
                with conn() as c:
                    objective_maps.set_ordering(c,int(body['domain_id']),str(body['ordering']))
                    c.commit()
                return self._json({'ok':True})
            except (KeyError,TypeError,ValueError) as ex:
                return self._json({'error':str(ex)},400)
        if p == '/api/budget/settings':
            try:
                opening=budget_amount(abs(float(str(body.get('opening_balance','0')).replace(',','.'))))
                if float(str(body.get('opening_balance','0')).replace(',','.'))<0:opening=-opening
                when=budget_date(body.get('opening_date'))
                with conn() as c:
                    c.execute('INSERT INTO budget_settings(id,opening_balance_cents,opening_date) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET opening_balance_cents=excluded.opening_balance_cents,opening_date=excluded.opening_date',(opening,when))
                    c.commit()
                return self._json({'ok':True})
            except (ValueError,TypeError) as ex:return self._json({'error':str(ex)},400)
        if p == '/api/budget/notes':
            try:
                month=budget_month(body.get('month')).strftime('%Y-%m')
                with conn() as c:
                    c.execute('INSERT INTO budget_month_notes(month,notes) VALUES(?,?) ON CONFLICT(month) DO UPDATE SET notes=excluded.notes',(month,str(body.get('notes') or '')[:10000]))
                    c.commit()
                return self._json({'ok':True})
            except ValueError as ex:return self._json({'error':str(ex)},400)
        if len(parts)==4 and parts[:2]==['api','budget'] and parts[3]=='status':
            try:
                eid=int(parts[2]); status=str(body.get('status',''))
                if status not in ('confirmed','presumed','pending','skipped'):raise ValueError('Statut invalide.')
                with conn() as c:
                    old=c.execute('SELECT * FROM budget_entries WHERE id=?',(eid,)).fetchone()
                    if not old:return self._json({'error':'Opération introuvable.'},404)
                    amount=budget_amount(body.get('amount')) if body.get('amount') not in (None,'') else old['amount_cents']
                    # Corriger des montants uniquement si explicitement demandé ; amount est en euros.
                    actual=budget_date(body.get('actual_date')) if status=='confirmed' and body.get('actual_date') else date.today().isoformat() if status=='confirmed' else old['scheduled_date'] if status=='presumed' else None
                    c.execute('UPDATE budget_entries SET status=?,amount_cents=?,actual_date=? WHERE id=?',(status,amount,actual,eid))
                    c.commit()
                return self._json({'ok':True})
            except (ValueError,TypeError) as ex:return self._json({'error':str(ex)},400)
        if len(parts)==4 and parts[:2]==['api','budget'] and parts[3]=='archive':
            try:
                rid=int(parts[2])
                with conn() as c:
                    table='budget_debts' if body.get('kind')=='debt' else 'budget_rules'
                    field='archived' if table=='budget_debts' else 'active'
                    value=1 if table=='budget_debts' else 0
                    c.execute(f'UPDATE {table} SET {field}=? WHERE id=?',(value,rid))
                    reference='debt_id' if table=='budget_debts' else 'rule_id'
                    c.execute(f"""UPDATE budget_entries SET status='skipped'
                         WHERE {reference}=? AND scheduled_date>? AND status='pending'""",(rid,date.today().isoformat()))
                    c.commit()
                return self._json({'ok':True})
            except (ValueError,TypeError) as ex:return self._json({'error':str(ex)},400)
        with conn() as c:
            if len(parts)==4 and parts[:2]==['api','habits'] and parts[3]=='check':
                try:
                    hid=int(parts[2]); when=date.fromisoformat(str(body.get('date','')))
                except (ValueError,TypeError): return self._json({'error':'Date invalide.'},400)
                if not c.execute('SELECT 1 FROM habits WHERE id=? AND archived=0',(hid,)).fetchone():return self._json({'error':'Habitude introuvable.'},404)
                if body.get('done',True):
                    inserted=c.execute('INSERT OR IGNORE INTO habit_checks(habit_id,checked_date,completed_at) VALUES(?,?,?)',(hid,when.isoformat(),ts))
                    # Older history is preserved, but only the 7-day window
                    # earns XP. A repeat check never awards a second time.
                    if inserted.rowcount and date.today()-timedelta(days=7)<=when<=date.today():
                        progression.award(c,source_kind='habit',source_id=hid,earned_on=when.isoformat())
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
                if status=='done' and old['status']!='done' and not objective_maps.can_complete(c,oid):
                    return self._json({'error':'Termine d’abord les étapes précédentes.'},409)
                if status=='done': progress=100
                c.execute('''UPDATE objective_nodes SET parent_id=?,node_type=?,title=?,description=?,status=?,progress=?,order_index=?,updated_at=?
                             WHERE id=?''',
                          (parent_id,node_type,title,d.get('description',''),status,progress,int_or_none(d.get('order_index')) or 0,ts,oid))
                if status!='done':
                    objective_maps.reconcile_automatic(c,progression,ts)
                if status=='done' and old['status']!='done':
                    progression.award(c,source_kind='objective_step' if node_type!='objective' else 'objective_complete',source_id=oid)
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
                objective_maps.reconcile_automatic(c,progression,ts)
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

            if len(parts)==4 and parts[0]=='api' and parts[1]=='events' and parts[3]=='hide-instance':
                try:
                    eid=int(parts[2]); instance_date=str(body.get('instance_date') or '').strip()
                    if not instance_date:return self._json({'error':'Date requise.'},400)
                    existing=c.execute('SELECT action,moved_event_id FROM event_instance_actions WHERE event_id=? AND instance_date=?',
                                       (eid,instance_date)).fetchone()
                    completed=c.execute('SELECT 1 FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date)).fetchone()
                    if not ((existing and existing['action'] in ('postponed','cancelled')) or completed):
                        return self._json({'error':'Cette occurrence n’est ni reportée, ni annulée, ni terminée.'},400)
                    if completed:
                        c.execute('DELETE FROM event_completions WHERE event_id=? AND instance_date=?',(eid,instance_date))
                    if not existing:
                        c.execute("INSERT INTO event_instance_actions(event_id,instance_date,action,moved_event_id,action_at) VALUES(?,?,'hidden',NULL,?)",
                                  (eid,instance_date,ts))
                    c.execute("UPDATE event_instance_actions SET action='hidden',action_at=? WHERE event_id=? AND instance_date=?",
                              (ts,eid,instance_date))
                    c.commit();return self._json({'ok':True})
                except Exception as ex:
                    return self._json({'error':'Impossible de masquer cette occurrence.','detail':str(ex)},500)

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
                            c.execute('''UPDATE events SET event_date=?,start_time=?,end_time=?,all_day=?,updated_at=? WHERE id=?''',
                                      (new_date,None if old['all_day'] else new_time,new_end,old['all_day'],ts,moved_event_id))
                        else:
                            moved_event_id=None

                    if not moved_event_id:
                        vals=(old['title'],new_date,None if old['all_day'] else new_time,new_end,old['all_day'],old['category'],old['color'],old['location'],old['notes'],
                              old['contact'],old['travel_time'],old['url'],'planned','none',old['show_in_month'],ts,ts)
                        cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,color,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
                        moved_event_id=cur.lastrowid

                    event_preparations.copy_to_event(c,eid,moved_event_id,instance_date,ts)
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
                    vals=(old['title'],new_date,new_time,new_end,0,old['category'],old['color'],old['location'],old['notes'],
                          old['contact'],old['travel_time'],old['url'],'planned','none',old['show_in_month'],ts,ts)
                    cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,color,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
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
                          1 if body.get('all_day') else 0,body.get('category','general'),body.get('color','auto'),body.get('location',''),
                          body.get('notes',''),body.get('contact',''),body.get('travel_time',''),body.get('url',''),
                          body.get('status','planned'),'none',1 if body.get('show_in_month',True) else 0,ts)
                    if moved_id:
                        c.execute('''UPDATE events SET title=?,event_date=?,start_time=?,end_time=?,all_day=?,category=?,color=?,location=?,notes=?,contact=?,travel_time=?,url=?,status=?,recurrence=?,show_in_month=?,updated_at=? WHERE id=?''',
                                  vals+(moved_id,))
                    else:
                        cur=c.execute('''INSERT INTO events(title,event_date,start_time,end_time,all_day,category,color,location,notes,contact,travel_time,url,status,recurrence,show_in_month,created_at,updated_at)
                                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals+(ts,))
                        moved_id=cur.lastrowid
                    event_preparations.copy_to_event(c,eid,moved_id,instance_date,ts)
                    if 'preparations' in body:
                        event_preparations.replace_templates(c,moved_id,body['preparations'],ts)
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
                # Déplacer la date ou l'heure d'un rendez-vous déplace aussi ses
                # rappels existants du même intervalle, sauf si le formulaire
                # fournit explicitement une nouvelle liste de rappels.
                reminder_delta=None
                if 'reminders' not in body and (d['event_date']!=old['event_date'] or
                        (d.get('start_time') or None)!=(old['start_time'] or None)):
                    try:
                        before=datetime.fromisoformat(f"{old['event_date']}T{old['start_time'] or '00:00'}")
                        after=datetime.fromisoformat(f"{d['event_date']}T{d.get('start_time') or '00:00'}")
                        reminder_delta=after-before
                    except (ValueError, TypeError):
                        return self._json({'error':'Date ou heure du rendez-vous invalide.'},400)
                c.execute('''UPDATE events SET title=?,event_date=?,start_time=?,end_time=?,all_day=?,category=?,color=?,location=?,notes=?,contact=?,travel_time=?,url=?,status=?,recurrence=?,show_in_month=?,updated_at=? WHERE id=?''',
                          (d['title'],d['event_date'],d.get('start_time') or None,d.get('end_time') or None,1 if d.get('all_day') else 0,d.get('category','general'),d.get('color','auto'),d.get('location',''),d.get('notes',''),d.get('contact',''),d.get('travel_time',''),d.get('url',''),d.get('status','planned'),d.get('recurrence','none'),1 if d.get('show_in_month',1) else 0,ts,eid))
                if reminder_delta:
                    pending=c.execute("SELECT * FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,)).fetchall()
                    for reminder in pending:
                        shifted=(datetime.fromisoformat(reminder['remind_at'])+reminder_delta).replace(microsecond=0).isoformat()
                        snoozed=(datetime.fromisoformat(reminder['snoozed_until'])+reminder_delta).replace(microsecond=0).isoformat() if reminder['snoozed_until'] else None
                        c.execute("UPDATE reminders SET remind_at=?,snoozed_until=? WHERE id=?",(shifted,snoozed,reminder['id']))
                if 'reminders' in body:
                    c.execute("DELETE FROM reminders WHERE entity_type='event' AND entity_id=? AND status!='done'",(eid,))
                    for ra in body.get('reminders',[]) or []:
                        if isinstance(ra, str): ra = {'remind_at': ra, 'title': ''}
                        when = (ra or {}).get('remind_at')
                        if when: c.execute('INSERT INTO reminders(entity_type,entity_id,title,remind_at,status,created_at) VALUES(?,?,?,?,?,?)',('event',eid,(ra or {}).get('title',''),when,'pending',ts))
                if 'preparations' in body:
                    try: event_preparations.replace_templates(c,eid,body['preparations'],ts)
                    except (ValueError,TypeError,LookupError) as ex:
                        c.rollback();return self._json({'error':str(ex)},400)
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
                objective_maps.reconcile_automatic(c,progression,ts)
                if d.get('completed') and not old['completed']:
                    progression.award(c,source_kind='task',source_id=tid)
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
        if p == '/api/objective-map/edges':
            q=parse_qs(u.query)
            try:
                with conn() as c:
                    objective_maps.remove_edge(c,int(q['from_id'][0]),int(q['to_id'][0]))
                    c.commit()
                return self._json({'ok':True})
            except (KeyError,IndexError,ValueError,TypeError) as ex:
                return self._json({'error':str(ex)},400)
        if len(parts)==3 and parts[:2]==['api','postits']:
            try: note_id=int(parts[2])
            except (TypeError,ValueError):return self._json({'error':'Post-it invalide.'},400)
            with conn() as c:
                row=c.execute('SELECT archived FROM home_postits WHERE id=?',(note_id,)).fetchone()
                if not row:return self._json({'error':'Post-it introuvable.'},404)
                if not row['archived']:return self._json({'error':'Archive ce Post-it avant sa suppression.'},409)
                c.execute('DELETE FROM desktop_postit_layout WHERE note_id=?',(note_id,))
                c.execute('DELETE FROM home_postits WHERE id=? AND archived=1',(note_id,))
                c.commit()
            return self._json({'ok':True})
        with conn() as c:
            if len(parts)==5 and parts[:2]==['api','events'] and parts[3]=='attachments':
                try:event_id=int(parts[2]);file_id=int(parts[4])
                except ValueError:return self._json({'error':'Identifiant invalide.'},400)
                deleted=c.execute('DELETE FROM event_attachments WHERE event_id=? AND id=?',
                                  (event_id,file_id))
                c.commit()
                return self._json({'ok':True} if deleted.rowcount else {'error':'Fichier introuvable.'},
                                  200 if deleted.rowcount else 404)
            if len(parts)==5 and parts[:2]==['api','admin'] and parts[3]=='attachments':
                try:admin_id=int(parts[2]);file_id=int(parts[4])
                except ValueError:return self._json({'error':'Identifiant invalide.'},400)
                deleted=c.execute('DELETE FROM admin_attachments WHERE admin_id=? AND id=?',
                                  (admin_id,file_id))
                c.commit()
                return self._json({'ok':True} if deleted.rowcount else {'error':'Fichier introuvable.'},
                                  200 if deleted.rowcount else 404)
            if len(parts)==3 and parts[:2]==['api','events']:
                eid=int(parts[2])
                if not c.execute('SELECT id FROM events WHERE id=?',(eid,)).fetchone():
                    return self._json({'error':'Rendez-vous introuvable.'},404)
                # Supprimer aussi les rappels et les statuts des occurrences rattachés.
                c.execute("DELETE FROM reminders WHERE entity_type='event' AND entity_id=?",(eid,))
                c.execute('DELETE FROM event_completions WHERE event_id=?',(eid,))
                c.execute('DELETE FROM event_preparation_checks WHERE preparation_id IN (SELECT id FROM event_preparations WHERE event_id=?)',(eid,))
                c.execute('DELETE FROM event_preparations WHERE event_id=?',(eid,))
                c.execute('DELETE FROM event_instance_actions WHERE event_id=?',(eid,))
                c.execute('UPDATE event_instance_actions SET moved_event_id=NULL WHERE moved_event_id=?',(eid,))
                c.execute('DELETE FROM events WHERE id=?',(eid,))
                c.commit()
                return self._json({'ok':True})
            if len(parts)==3 and parts[:2]==['api','tracker-board-rows']:
                try:row_id=int(parts[2])
                except ValueError:return self._json({'error':'Ligne invalide.'},400)
                c.execute('UPDATE tracker_board_rows SET archived=1,updated_at=? WHERE id=?',(now_iso(),row_id))
                c.commit();return self._json({'ok':True})
            if len(parts)==3 and parts[:2]==['api','trackers']:
                c.execute('UPDATE personal_trackers SET archived=1 WHERE id=?',(int(parts[2]),))
                c.commit();return self._json({'ok':True})
            if len(parts)==4 and parts[:2]==['api','trackers'] and parts[3]=='entries':
                return self._json({'error':'Utilise le formulaire pour modifier une mesure.'},405)
            if len(parts)==3 and parts[:2]==['api','admin']:
                c.execute('DELETE FROM admin_documents WHERE id=?',(int(parts[2]),))
                c.commit();return self._json({'ok':True})
            if len(parts)==3 and parts[:2]==['api','captures']:
                c.execute('DELETE FROM quick_captures WHERE id=?',(int(parts[2]),))
                c.commit();return self._json({'ok':True})
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
