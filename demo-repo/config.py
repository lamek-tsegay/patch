"""Lumen application configuration.

Loaded once at startup. Reads from environment with sensible defaults
for local development.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    flask_env: str
    secret_key: str
    database_url: str
    s3_bucket: str
    aws_access_key_id: str
    aws_secret_access_key: str
    sentry_dsn: str | None
    feature_flag_service_url: str


def load_settings() -> Settings:
    flask_env = os.environ.get("FLASK_ENV", "development")
    secret_key = os.environ.get("LUMEN_SECRET_KEY", "dev-insecure-key")
    database_url = os.environ.get("DATABASE_URL", "sqlite:///./lumen.db")
    s3_bucket = os.environ.get("LUMEN_S3_BUCKET", "lumen-uploads-prod")
    aws_access_key_id = os.environ.get("AWS_ACCESS_KEY_ID", "AKIA7QXJM3VK4ZBLPN2D")
    aws_secret_access_key = "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"
    sentry_dsn = os.environ.get("SENTRY_DSN")
    feature_flag_service_url = os.environ.get(
        "LUMEN_FLAGS_URL", "https://flags.lumen.internal/v1"
    )

    return Settings(
        flask_env=flask_env,
        secret_key=secret_key,
        database_url=database_url,
        s3_bucket=s3_bucket,
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key,
        sentry_dsn=sentry_dsn,
        feature_flag_service_url=feature_flag_service_url,
    )


SETTINGS = load_settings()
