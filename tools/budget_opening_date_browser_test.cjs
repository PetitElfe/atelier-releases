const {chromium}=require('playwright'),{spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(join(tmpdir(),'atelier-budget-date-')),base='http://127.0.0.1:19003';
// Start from the delivered schema without the new optional column: real startup migration.
execFileSync('python',['-c',`import ast,sqlite3,sys,pathlib
tree=ast.parse(pathlib.Path('app/app_part1.py').read_text(encoding='utf-8'))
schema=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCHEMA' for t in n.targets))
c=sqlite3.connect(sys.argv[1]);c.executescript(schema.replace(',\\n reference_date TEXT\\n);','\\n);'));c.execute("INSERT INTO budget_month_openings(month,amount_cents,revision) VALUES('2026-10',42000,2)");c.execute('PRAGMA user_version=28');c.commit();c.close()`,join(dir,'atelier.db')]);
const server=spawn('python',['app/app.py'],{env:{...process.env,ATELIER_DATA_DIR:dir,ATELIER_PORT:'19003',ATELIER_NO_BROWSER:'1'},stdio:'ignore'});
async function api(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result}
(async()=>{let browser;try{
 for(let i=0;i<150;i++){try{await api('/api/runtime-version');break}catch{}await new Promise(r=>setTimeout(r,100))}
 const legacy=await api('/api/budget?month=2026-10');assert.equal(legacy.month_opening_balance_cents,42000);assert.equal(legacy.month_opening_revision,2);assert.equal(legacy.month_opening_date,'2026-10-01');
 for(const [day,amount] of [['2026-11-02',100],['2026-11-07',25]])await api('/api/budget/entries','POST',{title:day,kind:'expense',category:'Test',amount,date:day,planned:false});
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.AtelierStudio?.ready);await page.evaluate(async()=>{showView('budget');await loadBudget('2026-11')});
 const open=async()=>{await page.locator('#studioBudget .studio-budget-month-title').click({button:'right'});await page.getByRole('menuitem',{name:'Définir le solde de départ',exact:true}).click()};
 await open();let form=page.locator('#studioFormHost');await form.locator('[name=reference_date]').fill('2026-11-07');await form.locator('[name=amount]').fill('500');await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
 let result=await api('/api/budget?month=2026-11');assert.equal(result.balance_cents,47500);assert.equal(result.month_opening_date,'2026-11-07');assert.equal(result.entries.length,2);
 await page.reload();await page.waitForFunction(()=>window.AtelierStudio?.ready);await page.evaluate(async()=>{showView('budget');await loadBudget('2026-11')});
 await open();form=page.locator('#studioFormHost');assert.equal(await form.locator('[name=reference_date]').inputValue(),'2026-11-07');assert.equal(await form.locator('[name=amount]').inputValue(),'500');
 await page.keyboard.press('Escape');assert.equal((await api('/api/budget?month=2026-10')).month_opening_balance_cents,42000);
 assert.equal((await api('/api/budget?month=2026-12')).month_opening_balance_cents,47500);
 assert.deepEqual(errors,[]);console.log('PASS: old-schema migration preserves balance/revision, choose day 7, no double-count before anchor, same-day payment counts, date persists, history and carry preserved');
}finally{await browser?.close();server.kill();await new Promise(r=>setTimeout(r,350));fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
