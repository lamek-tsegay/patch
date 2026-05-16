"""Parameterized SQL helpers for the customers table.

Centralizes user-facing query patterns so handlers don't build SQL
strings by hand. All methods on this class use parameterized queries.
"""
from __future__ import annotations

from typing import Any

from shared.db import get_db


class CustomerQueries:
    def __init__(self, db=None):
        self._db = db or get_db()

    def find_by_email_and_status(self, email: str, status: str) -> Any:
        sql = "SELECT * FROM users WHERE email = ? AND status = ?"
        cursor = self._db.execute(sql, (email, status))
        return cursor.fetchone()

    def find_by_external_id(self, external_id: str) -> Any:
        sql = "SELECT id, name, email FROM customers WHERE external_id = ?"
        cursor = self._db.execute(sql, (external_id,))
        return cursor.fetchone()

    def list_active_plans(self, plan: str, limit: int = 100) -> list[Any]:
        sql = """
            SELECT id, name, email, plan
              FROM customers
             WHERE plan = ?
               AND status = 'active'
             ORDER BY created_at DESC
             LIMIT ?
        """
        cursor = self._db.execute(sql, (plan, int(limit)))
        return cursor.fetchall()

    def count_by_status(self, status: str) -> int:
        sql = "SELECT COUNT(*) FROM customers WHERE status = ?"
        return int(self._db.execute(sql, (status,)).fetchone()[0])
