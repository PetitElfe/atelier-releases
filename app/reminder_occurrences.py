"""Durable per-occurrence reminders. Templates remain editable with their event."""
from calendar import monthrange
from datetime import date,datetime,timedelta

def initialise(c):
    c.execute('''CREATE TABLE IF NOT EXISTS reminder_occurrences(
      id INTEGER PRIMARY KEY AUTOINCREMENT,template_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,instance_date TEXT NOT NULL,due_at TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',
      snoozed_until TEXT,UNIQUE(template_id,instance_date))''')

def _next(day,kind,anchor):
    if kind=='daily':return day+timedelta(days=1)
    if kind=='weekly':return day+timedelta(days=7)
    if kind=='monthly':
        year=day.year+(day.month==12);month=day.month%12+1
        return date(year,month,min(anchor,monthrange(year,month)[1]))
    return None

def all_reminders(c,now=None):
    now=now or datetime.now();initialise(c)
    start=now.date()-timedelta(days=7);end=now.date()+timedelta(days=90)
    result=[]
    for row in c.execute("SELECT * FROM reminders WHERE status='pending'").fetchall():
        reminder=dict(row);event=None
        if reminder['entity_type']=='event':event=c.execute('SELECT * FROM events WHERE id=?',(reminder['entity_id'],)).fetchone()
        elif reminder['entity_type']=='task':
            task=c.execute('SELECT title,completed,archived FROM tasks WHERE id=?',(reminder['entity_id'],)).fetchone()
            if not task or task['completed'] or task['archived']:continue
            reminder['entity_title']=task['title']
        if reminder['entity_type']=='event' and (not event or event['status'] in ('done','cancelled')):continue
        if not event or event['recurrence']=='none':
            if event:reminder['entity_title']=event['title']
            result.append(reminder);continue
        try:
            anchor=date.fromisoformat(event['event_date']);day=anchor
            base=datetime.fromisoformat(reminder['remind_at'])
            offset=base-datetime.combine(anchor,datetime.min.time())
            if base.tzinfo is not None:continue
        except (ValueError,TypeError):continue
        while day<start:
            following=_next(day,event['recurrence'],anchor.day)
            if following is None:break
            day=following
        seen=set()
        while day<=end:
            if day>=start:
                iso=day.isoformat();seen.add(iso);due=(datetime.combine(day,datetime.min.time())+offset).isoformat(timespec='seconds')
                c.execute('''INSERT INTO reminder_occurrences(template_id,event_id,instance_date,due_at,title)
                  VALUES(?,?,?,?,?) ON CONFLICT(template_id,instance_date) DO UPDATE SET
                  due_at=CASE WHEN reminder_occurrences.snoozed_until IS NULL THEN excluded.due_at ELSE reminder_occurrences.due_at END,
                  title=CASE WHEN reminder_occurrences.snoozed_until IS NULL THEN excluded.title ELSE reminder_occurrences.title END''',(row['id'],event['id'],iso,due,row['title']))
            following=_next(day,event['recurrence'],anchor.day)
            if following is None:break
            day=following
        existing=c.execute("SELECT * FROM reminder_occurrences WHERE template_id=? AND status='pending'",(row['id'],)).fetchall()
        for occurrence in existing:
            iso=occurrence['instance_date']
            action=c.execute('SELECT action FROM event_instance_actions WHERE event_id=? AND instance_date=?',(event['id'],iso)).fetchone()
            done=c.execute('SELECT 1 FROM event_completions WHERE event_id=? AND instance_date=?',(event['id'],iso)).fetchone()
            if done or action or (start.isoformat()<=iso<=end.isoformat() and iso not in seen):
                c.execute("UPDATE reminder_occurrences SET status='done' WHERE id=?",(occurrence['id'],));continue
            item=reminder.copy();item['title']=occurrence['title'];item.update(id=-occurrence['id'],template_id=row['id'],instance_date=iso,
                remind_at=occurrence['due_at'],snoozed_until=occurrence['snoozed_until'],entity_title=event['title'])
            result.append(item)
    return sorted(result,key=lambda r:(r.get('snoozed_until') or r['remind_at'],r['id']))

def get(c,rid):
    if rid>=0:
        row=c.execute('SELECT * FROM reminders WHERE id=?',(rid,)).fetchone()
        return dict(row) if row else None
    initialise(c)
    row=c.execute('''SELECT o.*,r.created_at,r.status AS template_status,e.title AS entity_title,e.status AS event_status
      FROM reminder_occurrences o JOIN reminders r ON r.id=o.template_id JOIN events e ON e.id=o.event_id WHERE o.id=?''',(-rid,)).fetchone()
    if not row:return None
    item=dict(row);item.update(id=rid,entity_type='event',entity_id=item['event_id'],remind_at=item['due_at'])
    if item['template_status']!='pending' or item['event_status'] in ('done','cancelled'):item['status']='done'
    if c.execute('SELECT 1 FROM event_instance_actions WHERE event_id=? AND instance_date=?',(item['event_id'],item['instance_date'])).fetchone():item['status']='done'
    if c.execute('SELECT 1 FROM event_completions WHERE event_id=? AND instance_date=?',(item['event_id'],item['instance_date'])).fetchone():item['status']='done'
    return item

def update(c,rid,action,now=None,when=None,title=None):
    now=now or datetime.now();item=get(c,rid)
    if not item:raise ValueError('Rappel introuvable.')
    if action not in ('done','finish','snooze','edit'):raise ValueError('Action invalide.')
    table='reminder_occurrences' if rid<0 else 'reminders';key=abs(rid)
    if action in ('snooze','edit'):
        try:
            parsed=datetime.fromisoformat(when)
            if parsed.tzinfo is not None:raise ValueError()
        except (ValueError,TypeError):raise ValueError('Date et heure locales invalides.')
        field='due_at' if rid<0 else 'remind_at'
        if action=='snooze':c.execute('UPDATE '+table+" SET snoozed_until=?,status='pending' WHERE id=?",(when,key))
        else:c.execute('UPDATE '+table+' SET '+field+"=?,title=?,snoozed_until=?,status='pending' WHERE id=?",(when,title or '',when if rid<0 else None,key))
        return item
    if action=='finish':
        stamp=now.isoformat(timespec='seconds')
        if item['entity_type']=='task':
            c.execute('UPDATE tasks SET completed=1,updated_at=? WHERE id=?',(stamp,item['entity_id']))
            import progression,objective_maps
            progression.award(c,source_kind='task',source_id=item['entity_id']);objective_maps.reconcile_automatic(c,progression,stamp)
        elif item['entity_type']=='event':
            if rid<0:c.execute('INSERT OR IGNORE INTO event_completions(event_id,instance_date,completed_at) VALUES(?,?,?)',(item['entity_id'],item['instance_date'],stamp))
            else:c.execute("UPDATE events SET status='done',updated_at=? WHERE id=? AND recurrence='none'",(stamp,item['entity_id']))
    c.execute('UPDATE '+table+" SET status='done' WHERE id=?",(key,))
    return item

def mobile_action(c,body):
    import hashlib,json,re
    operation=body.get('operation_id','')
    if not isinstance(operation,str) or not re.fullmatch('[A-Za-z0-9_-]{16,100}',operation):raise ValueError('Identifiant d’action invalide.')
    rid=body.get('reminder_id');action=body.get('action');expected=body.get('due_key')
    if type(rid) is not int or action not in ('finish','done','10','30','60') or not isinstance(expected,str):raise ValueError('Action de rappel invalide.')
    c.execute('CREATE TABLE IF NOT EXISTS mobile_reminder_actions(operation_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,response_json TEXT NOT NULL)')
    signature=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
    previous=c.execute('SELECT * FROM mobile_reminder_actions WHERE operation_id=?',(operation,)).fetchone()
    if previous:
        if previous['payload_hash']!=signature:raise ValueError('Identifiant réutilisé pour une autre action.')
        return json.loads(previous['response_json'])
    item=get(c,rid)
    if not item or item['status']!='pending' or (item.get('snoozed_until') or item['remind_at'])!=expected:
        raise LookupError('Ce rappel a changé sur le PC. L’action locale reste conservée pour vérification.')
    when=None
    if action in ('10','30','60'):
        epoch=body.get('snooze_epoch_ms')
        if type(epoch) is not int or not 0<epoch<4102444800000:raise ValueError('Report invalide.')
        when=datetime.fromtimestamp(epoch/1000).isoformat(timespec='seconds')
    update(c,rid,'snooze' if when else action,when=when)
    response={'ok':True,'operation_id':operation}
    c.execute('INSERT INTO mobile_reminder_actions VALUES(?,?,?)',(operation,signature,json.dumps(response)))
    return response
