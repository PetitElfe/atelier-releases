"""Lanceur Windows sans saisie automatique : demande une fenêtre au compagnon TEST.
Le fichier .cmd voisin peut être affecté à une touche macro / un bouton de souris.
Ne modifie aucune note et n'accède jamais aux données de la version stable.
"""
from __future__ import annotations
from pathlib import Path
import os
import sys
import tempfile
import time

TEST_CODE=Path(r"E:\LATELIER_TEST_0180\code_0180")
TEST_DATA=Path(r"E:\LATELIER_TEST_0180\data")

def request_capture(data_dir: Path, now: float | None=None) -> Path:
    """Demande consommée par le compagnon dans les 15 secondes."""
    data_dir=Path(data_dir)
    if not data_dir.is_dir():
        raise FileNotFoundError("Dossier TEST inexistant")
    target=data_dir / "quick-capture-open-request.txt"
    temp=data_dir / ("quick-capture-macro-" + str(os.getpid()) + ".tmp")
    try:
        temp.write_text(str(now if now is not None else time.time()),encoding="ascii")
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    return target

if __name__=="__main__":
    if "--self-test" in sys.argv:
        with tempfile.TemporaryDirectory() as root:
            data=Path(root)
            assert float(request_capture(data,12).read_text(encoding="ascii"))==12
        print("PASS: capture macro signaling isolated")
    else:
        if os.name!="nt" or Path(__file__).resolve().parent.parent != TEST_CODE.resolve():
            raise SystemExit("Lanceur réservé à l'installation TEST du Goblin.")
        request_capture(TEST_DATA)
