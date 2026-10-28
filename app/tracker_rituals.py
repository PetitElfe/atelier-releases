"""Rituels Trackers : étapes optionnelles, progression, jours fixes et archives.
Ne crée AUCUNE tâche dans le Journal et ne modifie pas les données des RDV.
SQLite partagé uniquement au sein de l'installation TEST/Nathan correspondante.
"""
from datetime import date, timedelta
from calendar import monthrange

LINK_TABLES={'task':('tasks','title'), 'objective':('objective_nodes','title'),
             'admin':('admin_documents','title')}

def normalized_row_config(body, mode):
    target=body.get('target_count')
    if target in ('',None):target=None
    else:
        if isinstance(target,bool) or not isinstance(target,(str,int)):raise ValueError('Objectif numérique invalide.')
        try:target=int(target)
        except (ValueError,TypeError):raise ValueError('Objectif numérique invalide.')
        if target<1 or target>1000:raise ValueError('Choisis entre 1 et 1000.')
    if mode!='number' and target is not None:raise ValueError('Objectif réservé aux compteurs.')
    day=body.get('weekday')
    if day in ('',None):day=None
    else:
        if isinstance(day,bool):raise ValueError('Jour fixe incorrect.')
        try:day=int(day)
        except (ValueError,TypeError):raise ValueError('Jour fixe incorrect.')
        if day<0 or day>6:raise ValueError('Jour fixe incorrect.')
    link=str(body.get('linked_type') or '').strip()
    identity=body.get('linked_id')
    if not link:identity=None
    elif link not in LINK_TABLES or isinstance(identity,bool):
        raise ValueError('Lien incorrect.')
    elif identity is not None:
        try:identity=int(identity)
        except (ValueError,TypeError):raise ValueError('Lien incorrect.')
        if identity<1:raise ValueError('Lien incorrect.')
    if link and identity is None:raise ValueError('Choisis l’élément à relier.')
    return target,day,link,identity

def check_link(c,link,identity):
    if not link:return
    table,_=LINK_TABLES[link]
    if not c.execute(f'SELECT id FROM {table} WHERE id=?',(identity,)).fetchone():
        raise ValueError('La tâche, l’objectif ou la démarche à relier est introuvable.')

def options(c):
    result={}
    for key,(table,column) in LINK_TABLES.items():
        # Query fixed trusted table names only, never user-injected identifiers.
        result[key]=[{'id':r['id'],'title':r['title']} for r in c.execute(
            f'SELECT id,{column} title FROM {table} ORDER BY id DESC LIMIT 200')]
    return result

def steps_for_row(c,row_id,start=None,end=None):
    steps=[dict(r) for r in c.execute(
        'SELECT id,title,order_index FROM tracker_row_steps '
        'WHERE row_id=? AND active=1 ORDER BY order_index,id',(row_id,))]
    for step in steps:
        if start and end:
            step['checks']=[r['day'] for r in c.execute(
                'SELECT day FROM tracker_row_step_checks WHERE step_id=? AND day BETWEEN ? AND ?',
                (step['id'],start,end))]
        else:step['checks']=[]
    return steps

def save_setup(c,row_id,body,ts):
    row=c.execute('SELECT r.*,b.archived board_archived FROM tracker_board_rows r '
                  'JOIN tracker_boards b ON b.id=r.board_id WHERE r.id=?',
                  (row_id,)).fetchone()
    if not row or row['archived'] or row['board_archived']:raise LookupError('Ligne de tracker introuvable.')
    title=str(body.get('title') or '').strip()
    if not 1<=len(title)<=100:raise ValueError('Nom du suivi requis (100 caractères maximum).')
    mode=row['mode']
    target,weekday,link,identity=normalized_row_config(body,mode)
    check_link(c,link,identity)
    elements=body.get('steps',[])
    if not isinstance(elements,list) or len(elements)>30:
        raise ValueError('30 étapes maximum par habitude.')
    if mode!='check' and elements:raise ValueError('Les sous-étapes concernent uniquement les habitudes à cocher.')
    valid=[]
    known={r['id'] for r in c.execute('SELECT id FROM tracker_row_steps WHERE row_id=?',(row_id,))}
    seen=set()
    for idx,step in enumerate(elements):
        if not isinstance(step,dict):raise ValueError('Étape incorrecte.')
        name=str(step.get('title') or '').strip()
        if not 1<=len(name)<=180:raise ValueError('Chaque étape doit avoir un nom (180 caractères max).')
        identifier=step.get('id')
        if identifier in ('',None):identifier=None
        else:
            if isinstance(identifier,bool):raise ValueError('Étape incorrecte.')
            try:identifier=int(identifier)
            except (ValueError,TypeError):raise ValueError('Étape incorrecte.')
            if identifier not in known or identifier in seen:raise ValueError('Étape inconnue ou en double.')
            seen.add(identifier)
        valid.append((identifier,name,idx))
    c.execute('UPDATE tracker_board_rows SET title=?,target_count=?,weekday=?,linked_type=?,linked_id=?,updated_at=? WHERE id=?',
              (title,target,weekday,link,identity,ts,row_id))
    # Archiving a step NEVER erases its previously checked days.
    c.execute('UPDATE tracker_row_steps SET active=0 WHERE row_id=?',(row_id,))
    for identifier,name,idx in valid:
        if identifier is not None:
            c.execute('UPDATE tracker_row_steps SET title=?,order_index=?,active=1 WHERE id=?',
                      (name,idx,identifier))
        else:
            c.execute('INSERT INTO tracker_row_steps(row_id,title,order_index,active) VALUES(?,?,?,1)',
                      (row_id,name,idx))
    return {'ok':True}

def toggle_step(c,step_id,day,done,ts):
    if type(done) is not bool:raise ValueError('Case incorrecte.')
    row=c.execute('SELECT r.id,r.weekday,r.mode,s.id step_id FROM tracker_row_steps s '
                  'JOIN tracker_board_rows r ON r.id=s.row_id '
                  'JOIN tracker_boards b ON b.id=r.board_id '
                  'WHERE s.id=? AND s.active=1 AND r.archived=0 AND b.archived=0',
                  (step_id,)).fetchone()
    if not row:raise LookupError('Étape introuvable.')
    if row['mode']!='check':raise ValueError('Une étape doit être cochable.')
    if row['weekday'] is not None and date.fromisoformat(day).weekday()!=row['weekday']:
        raise ValueError('Cette habitude est prévue un autre jour.')
    if done:
        c.execute('INSERT OR IGNORE INTO tracker_row_step_checks(step_id,day) VALUES(?,?)',(step_id,day))
    else:
        c.execute('DELETE FROM tracker_row_step_checks WHERE step_id=? AND day=?',(step_id,day))
    total=c.execute('SELECT count(*) FROM tracker_row_steps WHERE row_id=? AND active=1',(row['id'],)).fetchone()[0]
    checked=c.execute('SELECT count(*) FROM tracker_row_step_checks chk '
                      'JOIN tracker_row_steps st ON st.id=chk.step_id '
                      'WHERE st.row_id=? AND st.active=1 AND chk.day=?',(row['id'],day)).fetchone()[0]
    # Check the day if and only if every current step is complete.
    if total>0 and checked==total:
        c.execute('INSERT INTO tracker_board_marks(row_id,day,value,updated_at) VALUES(?,?,?,?) '
                  'ON CONFLICT(row_id,day) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
                  (row['id'],day,'1',ts))
    else:
        c.execute('DELETE FROM tracker_board_marks WHERE row_id=? AND day=?',(row['id'],day))
    return {'ok':True,'checked':checked,'total':total,'done':total>0 and total==checked}

def day_progress(row,value):
    if row['mode']=='number' and row['target_count'] is not None:
        amount=float(value) if value is not None else 0
        return (amount>=row['target_count'],amount)
    return (value is not None,None)

def daily(c,day,tracker_window):
    result=[]
    for board in c.execute('SELECT * FROM tracker_boards WHERE archived=0 ORDER BY id'):
        try:period=tracker_window(board,today=day)
        except (ValueError,OverflowError):continue
        if period['granularity']!='days' or not period['start']<=day.isoformat()<=period['end']:
            continue
        rows=c.execute('SELECT id,title,mode,target_count,weekday,linked_type,linked_id FROM tracker_board_rows '
                       'WHERE board_id=? AND archived=0 ORDER BY order_index,id',(board['id'],)).fetchall()
        for row in rows:
            if row['weekday'] is not None and row['weekday']!=day.weekday():continue
            if row['mode']=='number' and row['target_count'] is None:continue
            marked=c.execute('SELECT value FROM tracker_board_marks WHERE row_id=? AND day=?',
                             (row['id'],day.isoformat())).fetchone()
            value=marked['value'] if marked else None
            done,amount=day_progress(row,value)
            result.append({'board_id':board['id'],'board_title':board['title'],
                           'color':board['color'],'row_id':row['id'],'title':row['title'],
                           'mode':row['mode'],'target_count':row['target_count'],
                           'value':amount,'weekday':row['weekday'],'done':done,
                           'steps':steps_for_row(c,row['id'],day.isoformat(),day.isoformat()),
                           'linked_type':row['linked_type'],'linked_id':row['linked_id']})
    return {'day':day.isoformat(),'items':result}

def monthly_archive(c,now,months=60):
    """Read-only completed months, grouped by board and month.
    No board is silently archived or deleted on month rollover.
    """
    results=[]
    for board in c.execute('SELECT * FROM tracker_boards ORDER BY archived,id DESC'):
        created=str(board['created_at'])[:7]
        rows=c.execute('SELECT id,title,mode,target_count,weekday FROM tracker_board_rows '
                       'WHERE board_id=? ORDER BY order_index,id',(board['id'],)).fetchall()
        if not rows:continue
        # Past months only; never claim an unfinished current month is complete.
        for delta in range(1,months+1):
            yy=now.year+(now.month-1-delta)//12
            mm=(now.month-1-delta)%12+1
            label=f'{yy:04d}-{mm:02d}'
            if label<created:break
            days=monthrange(yy,mm)[1]
            begin=f'{label}-01';end=f'{label}-{days:02d}'
            completed=available=0;details=[]
            for row in rows:
                if row['mode']=='number' and row['target_count'] is None:continue
                # Monthly-granularity boards store one mark on the first of month.
                bymonth=(board['period_unit']=='years' or (board['period_unit']=='months' and board['period_count']>=4))
                eligible=[begin] if bymonth else [
                    f'{label}-{d:02d}' for d in range(1,days+1)
                    if row['weekday'] is None or date(yy,mm,d).weekday()==row['weekday']]
                marks={r['day']:r['value'] for r in c.execute(
                    'SELECT day,value FROM tracker_board_marks WHERE row_id=? AND day BETWEEN ? AND ?',
                    (row['id'],begin,end))}
                count=sum(day_progress(row,marks.get(d))[0] for d in eligible)
                completed+=count;available+=len(eligible)
                details.append({'title':row['title'],'completed':count,'total':len(eligible)})
            if available:
                results.append({'board_id':board['id'],'board_title':board['title'],
                                'archived':bool(board['archived']),'month':label,
                                'completed':completed,'total':available,'rows':details})
    return results
