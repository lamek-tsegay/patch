"""Auth-related routes and decorators for Lumen.

Provides require_login / require_admin used across the admin Blueprints.
"""
from __future__ import annotations

import logging
from functools import wraps

from flask import Blueprint, jsonify, session

from auth.models import User
from shared.db import get_db

log = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


def _current_user() -> User | None:
    user_id = session.get("user_id")
    if user_id is None:
        return None
    row = get_db().execute(
        "SELECT id, email, password_hash, is_admin, is_active FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    return User(
        id=row[0], email=row[1], password_hash=row[2],
        is_admin=bool(row[3]), is_active=bool(row[4]),
    )


def require_login(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if _current_user() is None:
            return jsonify({"error": "auth required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _current_user()
        if user:
            return fn(*args, **kwargs)
        return jsonify({"error": "admin required"}), 403
    return wrapper


@auth_bp.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True}), 200
