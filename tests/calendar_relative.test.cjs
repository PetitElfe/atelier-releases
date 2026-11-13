const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/public/app_part2.js','utf8'),part=source.slice(source.indexOf('function atelierRelativeDateParts('),source.indexOf('// Position in viewport space'));
const context=vm.createContext({Date});vm.runInContext(part,context);const date=s=>new Date(s+'T12:00:00');
for(const [today,target,label,words] of [
 ['2026-11-17','2026-11-13','J+4','Il y a 4 jours'],['2026-11-10','2026-11-13','J−3','Dans 3 jours'],['2026-11-10','2026-11-10','J0','Aujourd’hui'],
 ['2026-01-31','2026-02-28','M−1','Dans 1 mois'],['2026-02-28','2026-01-31','M+1','Il y a 1 mois'],['2026-01-31','2026-03-02','M−1 · J−2','Dans 1 mois et 2 jours'],
 ['2024-02-28','2024-03-01','J−2','Dans 2 jours'],['2026-03-28','2026-03-30','J−2','Dans 2 jours'],['2026-10-24','2026-10-26','J−2','Dans 2 jours']
])test(today+' → '+target,()=>{const result=context.atelierRelativeDateParts(date(target),date(today));assert.equal(result.label,label);assert.equal(result.description,words)});
