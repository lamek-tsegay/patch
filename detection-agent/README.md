# detection-agent

Owner: **Lam**

Scans first-party code in the target repo and emits `Finding` objects describing vulnerabilities it has identified. Single-agent loop, no hunter/verifier split.

See [/shared/schema.md](../shared/schema.md) for the Finding contract. Import the model from `shared.schema`, do not redefine it.
