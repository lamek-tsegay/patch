"""User model and password hashing helpers."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass
class User:
    id: int
    email: str
    password_hash: str
    is_admin: bool = False
    is_active: bool = True


def hash_password(password: str) -> str:
    return hashlib.md5(password.encode("utf-8")).hexdigest()


def verify_password(password: str, stored_hash: str) -> bool:
    return hash_password(password) == stored_hash
