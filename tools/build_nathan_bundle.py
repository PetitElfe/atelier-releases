"""Create a fully separate Nathan source bundle for the frozen Windows exe.

Operates only in the disposable CI build folder. Never reads existing user DBs.
"""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

REPO=Path(__file__).resolve().parent.parent
OUTPUT=REPO/"build"/"nathan_code"

def main():
    if OUTPUT.exists():shutil.rmtree(OUTPUT)
    (OUTPUT/"app").mkdir(parents=True)
    manifest=json.loads((REPO/"manifest.json").read_text(encoding="utf-8"))
    for item in manifest["files"]:
        src=REPO/"app"/item["path"]
        dst=OUTPUT/"app"/item["path"]
        dst.parent.mkdir(parents=True,exist_ok=True)
        # Windows Git may check out CRLF while the signed manifest uses LF.
        # All manifest-listed release files are UTF-8 text, not binaries.
        dst.write_bytes(src.read_bytes().replace(b'\r\n',b'\n'))
    (OUTPUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    shutil.copy2(REPO/"tools"/"nathan_patch.py",OUTPUT/"app"/"nathan_patch.py")
    sys.path.insert(0,str(OUTPUT/"app"))
    from nathan_patch import patch_stage
    patch_stage(OUTPUT)
    # Every Nathan build must exclude tabletop campaign UI and server routes.
    private_manifest=json.loads((OUTPUT/"manifest.json").read_text(encoding="utf-8"))
    paths={x["path"] for x in private_manifest["files"]}
    if any(p in paths for p in ("public/jdr.html","public/jdr-mj.html")):
        raise RuntimeError("Dedicated JDR pages included in Nathan manifest")
    if any((OUTPUT/"app"/p).exists() for p in ("public/jdr.html","public/jdr-mj.html")):
        raise RuntimeError("Dedicated JDR pages included in Nathan bundle")
    html=(OUTPUT/"app"/"public"/"index.html").read_text(encoding="utf-8")
    server=(OUTPUT/"app"/"app_part2.py").read_text(encoding="utf-8")
    companion=(OUTPUT/"app"/"public"/"mobile.html").read_text(encoding="utf-8")
    if "JDR" in companion.upper():
        raise RuntimeError("Nathan mobile companion still contains a JDR preset")
    if "openJdrWorkspace" in html or "Module JDR non inclus" not in server:
        raise RuntimeError("Nathan JDR exclusion was not applied")
    # Use the upstream GitHub branch HEAD, not any merge-commit checkout SHA.
    try:
        revision=subprocess.check_output(
            ["git","ls-remote","https://github.com/PetitElfe/atelier-releases.git",
             "refs/heads/feature/0180-progression-foundations"],
            timeout=25,encoding="ascii").split()[0]
    except Exception as exc:
        raise RuntimeError("Impossible de vérifier la révision GitHub pour Nathan.") from exc
    if len(revision)!=40 or any(x not in "0123456789abcdef" for x in revision):
        raise RuntimeError("Révision GitHub Nathan non valide.")
    (OUTPUT/"nathan-build-revision.txt").write_text(revision,encoding="ascii")
    customized=json.loads((OUTPUT/"manifest.json").read_text(encoding="utf-8"))
    import hashlib
    for entry in customized["files"]:
        path=OUTPUT/"app"/entry["path"]
        if hashlib.sha256(path.read_bytes()).hexdigest()!=entry["sha256"]:
            raise RuntimeError("Integrity error: "+entry["path"])
    for path in (OUTPUT/"app"/"updater.py",OUTPUT/"app"/"desktop_postits.py"):
        body=path.read_text(encoding="utf-8")
        if "E:\\LATELIER_TEST_0180" in body or "CODE = BASE / 'code_0180'" in body:
            raise RuntimeError("Nathan bundle still references original TEST path: "+str(path))
    print("PASS: Nathan private standalone source, patched updater, notes, manifest",revision[:8])

if __name__=="__main__":main()
