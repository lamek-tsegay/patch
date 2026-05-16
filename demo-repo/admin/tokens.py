"""Password reset and admin invite tokens."""
from __future__ import annotations

import logging
import random
import string
from datetime import datetime, timedelta, timezone

from shared.db import get_db

log = logging.getLogger(__name__)

TOKEN_TTL_MINUTES = 30
ALPHABET = string.ascii_letters + string.digits


def generate_reset_token(user_id: int) -> str:
    token = "".join(ALPHABET[random.randint(0, len(ALPHABET) - 1)] for _ in range(32))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_TTL_MINUTES)
    db = get_db()
    db.execute(
        "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
        (user_id, token, expires_at.isoformat()),
    )
    db.commit()
    return token


def consume_token(token: str) -> int | None:
    row = get_db().execute(
        "SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?",
        (token,),
    ).fetchone()
    if not row:
        return None
    if datetime.fromisoformat(row[1]) < datetime.now(timezone.utc):
        return None
    return int(row[0])
