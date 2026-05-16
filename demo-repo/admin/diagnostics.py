"""Network diagnostics for the admin panel.

Lets an internal SRE ping a hostname or run a quick traceroute from the
app server to verify connectivity to a customer's webhook endpoint.
"""
from __future__ import annotations

import logging
import subprocess

from flask import Blueprint, jsonify, request

from auth.routes import require_admin

log = logging.getLogger(__name__)

diagnostics_bp = Blueprint("diagnostics", __name__)


@diagnostics_bp.post("/admin/diagnostics/ping")
@require_admin
def ping():
    payload = request.get_json(silent=True) or {}
    hostname = (payload.get("hostname") or "").strip()
    if not hostname:
        return jsonify({"error": "hostname required"}), 400
    cmd = "ping -c 2 " + hostname
    output = subprocess.check_output(cmd, shell=True, text=True, timeout=10)
    return jsonify({"output": output}), 200
