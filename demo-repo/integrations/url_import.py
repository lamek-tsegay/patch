"""Pull-from-URL integration.

When a customer wants to bootstrap a dashboard from an existing JSON
export hosted on their internal share drive, they paste the URL here
and we fetch + ingest it.
"""
from __future__ import annotations

import logging

import requests
from flask import Blueprint, jsonify, request

from auth.routes import require_login

log = logging.getLogger(__name__)

url_import_bp = Blueprint("url_import", __name__)


@url_import_bp.post("/integrations/url-import")
@require_login
def url_import():
    payload = request.get_json(silent=True) or {}
    user_url = (payload.get("url") or "").strip()
    if not user_url:
        return jsonify({"error": "url required"}), 400

    response = requests.get(user_url, timeout=10)
    if response.status_code != 200:
        return jsonify({"error": "fetch failed", "status": response.status_code}), 502

    return jsonify({
        "ok": True,
        "bytes": len(response.content),
        "content_type": response.headers.get("Content-Type"),
    }), 200
