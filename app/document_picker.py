"""Windows' native multi-file picker, scoped to the configured documents root."""
import json,os,subprocess
from pathlib import Path
EXTENSIONS={'.pdf','.doc','.docx','.odt','.ods','.xlsx','.xls','.png','.jpg','.jpeg','.txt'}
def choose(base,models=False):
 if os.name!='nt':raise ValueError('Le choix dans l’Explorateur est disponible sur le PC Windows.')
 script='''Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.InitialDirectory = $env:ATELIER_DOCUMENT_ROOT
$d.Multiselect = $true
$d.CheckFileExists = $true
$d.RestoreDirectory = $true
$d.Filter = 'Documents|*.pdf;*.doc;*.docx;*.odt;*.ods;*.xlsx;*.xls;*.png;*.jpg;*.jpeg;*.txt'
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { ConvertTo-Json -Compress -InputObject @($d.FileNames) } else { '[]' }
$d.Dispose()
'''
 result=subprocess.run(['powershell.exe','-NoProfile','-STA','-Command',script],capture_output=True,encoding='utf-8',timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),env={**os.environ,'ATELIER_DOCUMENT_ROOT':str(base)})
 if result.returncode:raise ValueError('Impossible d’ouvrir le choix de documents Windows.')
 paths=json.loads(result.stdout.strip() or '[]')
 if not isinstance(paths,list) or len(paths)>100:raise ValueError('Choisis au maximum 100 documents à la fois.')
 selected=[];allowed={'.pdf','.doc','.docx'} if models else EXTENSIONS
 for value in paths:
  path=Path(value)
  if path.suffix.lower() not in allowed or not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(base.resolve()):raise ValueError('Choisis des documents dans ton dossier configuré.')
  selected.append(str(path.resolve().relative_to(base.resolve())))
 return list(dict.fromkeys(selected))
