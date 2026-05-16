"""Thin factory for the NIM client. Keeps env handling in one place."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from repo root (parent of this file's directory) so this
# works regardless of where the CLI is invoked from.
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env")

from shared.nemotron_client import NIMNemotronClient  # noqa: E402


def make_client() -> NIMNemotronClient:
    endpoint = os.environ.get("NIM_ENDPOINT")
    api_key = os.environ.get("NIM_API_KEY")
    if not endpoint:
        raise RuntimeError("NIM_ENDPOINT is not set in environment")
    if not api_key:
        raise RuntimeError("NIM_API_KEY is not set in environment")
    return NIMNemotronClient(endpoint=endpoint, api_key=api_key)
