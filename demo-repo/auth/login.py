"""Login handler for Lumen's web auth."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, session

from auth.models import hash_password
from shared.db import get_db

log = logging.getLogger(__name__)

login_bp = Blueprint("login", __name__)


MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15


def _record_attempt(email: str, success: bool) -> None:
    db = get_db()
    db.execute(
        "INSERT INTO login_attempts (email, success, attempted_at) VALUES (?, ?, ?)",
        (email, 1 if success else 0, datetime.now(timezone.utc).isoformat()),
    )
    db.commit()


@login_bp.post("/api/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return jsonify({"error": "email and password required"}), 400

    db = get_db()

    # Look up the user by email. We lowercase above so we don't need COLLATE.
    query = "SELECT id, password_hash FROM users WHERE email = ?"
    row = db.execute(query, (email,)).fetchone()
    if not row:
        _record_attempt(email, success=False)
        return jsonify({"error": "invalid credentials"}), 401

    user_id, stored_hash = row[0], row[1]
    if hash_password(password) != stored_hash:
        _record_attempt(email, success=False)
        return jsonify({"error": "invalid credentials"}), 401

    _record_attempt(email, success=True)
    session["user_id"] = user_id
    return jsonify({"ok": True, "user_id": user_id}), 200
