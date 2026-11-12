"""Bundle only verified, already-personalized Nathan code, never user data."""
import hashlib,json,os,re,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
 if manifest.get('edition')!='NATHAN':raise RuntimeError('Edition Nathan requise.')
 output=ROOT/'build/nathan_code'
 if output.exists():shutil.rmtree(output)
 for f in manifest['files']:
  data=(ROOT/'app'/f['path']).read_bytes().replace(b'\r\n',b'\n')
  if hashlib.sha256(data).hexdigest()!=f['sha256']:raise RuntimeError('SHA incorrect : '+f['path'])
  path=output/'app'/f['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
 (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 revision=os.environ.get('GITHUB_SHA') or subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 if not re.fullmatch('[a-f0-9]{40}',revision):raise RuntimeError('Révision incorrecte.')
 (output/'nathan-build-revision.txt').write_text(revision,encoding='ascii')
 from nathan_install import verify
 verify(output)
 assert not list(output.rglob('*.db'))
 print('PASS: verified common Nathan payload without owner-only assets/data',revision)
if __name__=='__main__':main()
