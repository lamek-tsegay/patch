"""Bulk-import customer records uploaded by admins.

Used by the internal data migration team to load fixtures from older
internal tooling that exported pickle blobs.
"""
from __future__ import annotations

import logging
import pickle
from typing import Any

from flask import Blueprint, jsonify, request

from auth.routes import require_admin
from shared.db import get_db

log = logging.getLogger(__name__)

import_bp = Blueprint("import_data", __name__)


def _persist_records(records: list[dict[str, Any]]) -> int:
    db = get_db()
    inserted = 0
    for r in records:
        db.execute(
            "INSERT INTO customers (external_id, name, email, plan) VALUES (?, ?, ?, ?)",
            (r["external_id"], r["name"], r["email"], r.get("plan", "free")),
        )
        inserted += 1
    db.commit()
    return inserted


@import_bp.post("/admin/import")
@require_admin
def import_data():
    blob = request.get_data()
    if not blob:
        return jsonify({"error": "empty body"}), 400

    records = pickle.loads(blob)
    if not isinstance(records, list):
        return jsonify({"error": "expected a list of records"}), 400

    n = _persist_records(records)
    log.info("imported %d customer records", n)
    return jsonify({"ok": True, "inserted": n}), 200
