"""File download endpoint.

Lumen lets customers upload CSVs and rendered reports. This endpoint
streams a previously uploaded file back to the requester. Files live
under ./storage/uploads/ on the app server.
"""
from __future__ import annotations

import logging
import os

from flask import Blueprint, abort, request, send_file

from auth.routes import require_login

log = logging.getLogger(__name__)

files_bp = Blueprint("files", __name__)

UPLOAD_DIR = os.environ.get("LUMEN_UPLOAD_DIR", "./storage/uploads")


@files_bp.get("/files/<file_id>/download")
@require_login
def download(file_id: str):
    filename = request.args.get("name")
    if not filename:
        abort(400, "name query param required")

    path = os.path.join(UPLOAD_DIR, file_id, filename)
    if not os.path.exists(path):
        abort(404)

    return send_file(path, as_attachment=True, download_name=filename)
