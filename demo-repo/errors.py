"""Flask error handlers."""
from __future__ import annotations

import logging
import traceback

from flask import jsonify

log = logging.getLogger(__name__)


def register_error_handlers(app):
    @app.errorhandler(Exception)
    def handle_uncaught(exc: Exception):
        tb = traceback.format_exc()
        log.exception("uncaught exception")
        return jsonify({
            "error": "internal server error",
            "type": exc.__class__.__name__,
            "message": str(exc),
            "traceback": tb,
        }), 500
