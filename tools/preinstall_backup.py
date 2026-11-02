"""Sauvegarde preinstallation non destructive de L'Atelier.

Usage (application fermee):
  python tools/preinstall_backup.py --root E:\\00_LATELIER --destination E:\\LATELIER_SAUVEGARDE_0_18_AVANT_INSTALLATION

Ne copie pas le localStorage du navigateur : son export distinct est obligatoire.
Ce script refuse une destination existante et ne supprime aucun fichier.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import socket
import sqlite3
from datetime import datetime, timezone


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def assert_closed(port: int = 8765) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            raise RuntimeError(
                "L'Atelier semble encore ouvert sur localhost. Fermez-le avant de sauvegarder."
            )
    except (ConnectionRefusedError, TimeoutError, OSError):
        pass


def backup(root: Path, destination: Path, *, check_port: bool = True) -> dict:
    root = root.expanduser().resolve()
    destination = destination.expanduser().resolve()
    if not root.is_dir():
        raise ValueError("Dossier d'installation absent.")
    if destination.exists():
        raise FileExistsError("La destination existe deja : aucun remplacement autorise.")
    if destination == root or root in destination.parents or destination in root.parents:
        raise ValueError("La sauvegarde doit etre dans un autre dossier, hors de l'installation.")
    if check_port:
        assert_closed()
    sources = [root / name for name in ("data", "user")]
    missing = [str(source) for source in sources if not source.is_dir()]
    if missing:
        raise ValueError("Dossier obligatoire absent : " + ", ".join(missing))
    # Refuse a symlink that could unexpectedly copy private files outside root.
    for source in sources:
        for item in (source, *source.rglob("*")):
            if item.is_symlink():
                raise ValueError("Lien symbolique non pris en charge : " + str(item))

    destination.mkdir(parents=True, exist_ok=False)
    try:
        for source in sources:
            shutil.copytree(source, destination / source.name)
        files = {}
        for source in sources:
            for original in source.rglob("*"):
                if not original.is_file():
                    continue
                rel = original.relative_to(root)
                copied = destination / rel
                expected = digest(original)
                if expected != digest(copied):
                    raise RuntimeError("Copie incoherente : " + str(rel))
                files[str(rel).replace("\\", "/")] = expected
        for database in (destination / "data").rglob("*.db"):
            with sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True) as conn:
                if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Base SQLite endommagee : " + str(database))
        report = {
            "saved_at_utc": datetime.now(timezone.utc).isoformat(),
            "original_root": str(root),
            "file_count": len(files),
            "files_sha256": files,
            "verified": True,
            "browser_local_storage_backed_up": False,
            "warning": "Exporter separement le localStorage de l'accueil avant installation.",
        }
        (destination / "verification.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return report
    except Exception:
        # Never remove an incomplete backup automatically: inspection first.
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    report = backup(args.root, args.destination)
    print(f"Sauvegarde verifiee : {report['file_count']} fichiers.")
    print("IMPORTANT : le localStorage de l'accueil reste a sauvegarder separement.")


if __name__ == "__main__":
    main()
