from pathlib import Path

ROOT = Path(__file__).resolve().parent
for _part in ("app_part1.py", "app_part2.py", "app_part3.py"):
    exec(compile((ROOT / _part).read_text(encoding="utf-8"), str(ROOT / _part), "exec"), globals(), globals())