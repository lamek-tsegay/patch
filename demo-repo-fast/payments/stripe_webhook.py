"""Stripe webhook handler.

Verifies Stripe signature, then dispatches to internal billing logic.
"""
from __future__ import annotations

import logging

import stripe
from flask import Blueprint, jsonify, request

log = logging.getLogger(__name__)

stripe_bp = Blueprint("stripe_webhook", __name__)

STRIPE_API_KEY = "sk_live_51Hq8aL2eZvKYlo2C8nLbXxYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefABCDEFghijklMNOPQRSTuvwxYZ"
STRIPE_WEBHOOK_SECRET = "whsec_placeholder_set_in_env"

stripe.api_key = STRIPE_API_KEY


@stripe_bp.post("/webhooks/stripe")
def stripe_webhook():
    payload = request.data
    sig = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        log.warning("invalid stripe webhook: %s", e)
        return jsonify({"error": "invalid signature"}), 400

    log.info("stripe event: %s", event["type"])
    return jsonify({"received": True}), 200
