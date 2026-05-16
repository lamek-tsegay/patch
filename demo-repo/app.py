"""Flask app factory for Lumen."""
from __future__ import annotations

import logging

from flask import Flask

from admin.diagnostics import diagnostics_bp
from admin.import_data import import_bp
from auth.login import login_bp
from auth.routes import auth_bp
from config import SETTINGS
from errors import register_error_handlers
from files.download import files_bp
from integrations.url_import import url_import_bp
from payments.stripe_webhook import stripe_bp

log = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = SETTINGS.secret_key

    app.register_blueprint(login_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(diagnostics_bp)
    app.register_blueprint(import_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(url_import_bp)
    app.register_blueprint(stripe_bp)

    register_error_handlers(app)
    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000)
