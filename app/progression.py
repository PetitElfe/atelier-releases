"""Progression engine for L'Atelier.

Pure SQLite service; no modifications of existing user tables.
Call initialise(conn) on the application's database connection before use.
All award mutations are transactional at the caller's connection boundary.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import sqlite3


XP_RULES = {
    "task": 8,
    "objective_step": 18,
    "objective_complete": 45,
    "study": 6,
    "habit": 5,
    "routine": 7,
    "rest": 3,
}

# The first completion of a given type on a day receives full XP.
# Further distinct completions yield progressively less, without ever
# becoming negative. Duplicates of the same source receive zero.
DECAY_PERCENT = (100, 70, 40, 20)
RECURRING_KINDS = frozenset(("study", "habit", "routine", "rest"))


def initialise(conn: sqlite3.Connection) -> None:
    """Additive schema. Safe to call repeatedly on an existing database."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS progression_xp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            action_key TEXT NOT NULL DEFAULT 'complete',
            earned_on TEXT NOT NULL,
            xp INTEGER NOT NULL CHECK(xp >= 0),
            created_at TEXT NOT NULL,
            UNIQUE(source_kind, source_id, action_key)
        );
        CREATE INDEX IF NOT EXISTS idx_progression_earned
            ON progression_xp_events(earned_on, source_kind);
    """)


def level_requirement(level: int) -> int:
    """XP required to advance FROM level to level+1."""
    if level < 1:
        raise ValueError("Level must be positive")
    return 100 + (level - 1) * 25 + ((level - 1) // 10) * 75


def level_from_xp(total_xp: int) -> dict:
    """Return level and progress within the current level."""
    remaining = max(0, int(total_xp))
    level = 1
    while remaining >= level_requirement(level):
        remaining -= level_requirement(level)
        level += 1
    needed = level_requirement(level)
    return {
        "level": level,
        "total_xp": max(0, int(total_xp)),
        "xp_into_level": remaining,
        "xp_to_next_level": needed,
        "milestone": (level % 10 == 0),
    }


def award(
    conn: sqlite3.Connection, *,
    source_kind: str,
    source_id: str | int,
    earned_on: str | None = None,
    action_key: str = "complete",
    today: date | None = None,
) -> dict:
    """Award XP at most once per unique action; reject future/old dates.

    All inputs are validated before any write. Calling award twice with the
    same source/action returns an unchanged result. The caller commits.
    """
    if source_kind not in XP_RULES:
        raise ValueError("Unknown activity type")
    source_id = str(source_id).strip()
    action_key = str(action_key).strip()
    if not source_id or not action_key:
        raise ValueError("Missing source identity")

    current_day = today or date.today()
    day = date.fromisoformat(earned_on) if earned_on else current_day
    if day > current_day or day < current_day - timedelta(days=7):
        raise ValueError("Activity date must be within the last seven days")

    # A recurring action earns XP once per activity/date, while completed
    # tasks and objective steps earn XP only once for their lifetime.
    # The DB UNIQUE constraint remains unchanged for existing installations.
    if source_kind in RECURRING_KINDS:
        action_key = day.isoformat() + ":" + action_key

    existing = conn.execute("""
        SELECT id, xp FROM progression_xp_events
        WHERE source_kind=? AND source_id=? AND action_key=?
    """, (source_kind, source_id, action_key)).fetchone()
    if existing is not None:
        return {"awarded": False, "xp": 0, "event_id": existing[0]}

    count = conn.execute("""
        SELECT COUNT(*) FROM progression_xp_events
        WHERE source_kind=? AND earned_on=?
    """, (source_kind, day.isoformat())).fetchone()[0]
    multiplier = DECAY_PERCENT[min(count, len(DECAY_PERCENT) - 1)]
    xp = max(1, (XP_RULES[source_kind] * multiplier + 50) // 100)
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        cursor = conn.execute("""
            INSERT INTO progression_xp_events
                (source_kind, source_id, action_key, earned_on, xp, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (source_kind, source_id, action_key, day.isoformat(), xp, created_at))
    except sqlite3.IntegrityError:
        return {"awarded": False, "xp": 0, "event_id": None}
    return {"awarded": True, "xp": xp, "event_id": cursor.lastrowid}


def summary(conn: sqlite3.Connection) -> dict:
    total = conn.execute(
        "SELECT COALESCE(SUM(xp), 0) FROM progression_xp_events"
    ).fetchone()[0]
    events = conn.execute(
        "SELECT COUNT(*) FROM progression_xp_events"
    ).fetchone()[0]
    return {**level_from_xp(total), "events": events}


def history(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    if not 1 <= limit <= 500:
        raise ValueError("History limit must be between 1 and 500")
    rows = conn.execute("""
        SELECT id, source_kind, source_id, action_key, earned_on, xp, created_at
        FROM progression_xp_events ORDER BY id DESC LIMIT ?
    """, (limit,)).fetchall()
    return [
        dict(zip(("id", "source_kind", "source_id", "action_key",
                  "earned_on", "xp", "created_at"), row))
        for row in rows
    ]
