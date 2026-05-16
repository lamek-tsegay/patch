# policy-and-commit

Owner: **Zablon**

NemoClaw YAML policy engine plus the git commit pipeline. Every agent action — scan, propose, write, commit — passes through policy first. Blocked actions are emitted as events for the dashboard. Approved fixes land as real commits with a human-review gate.

See [/shared/schema.md](../shared/schema.md) for the Finding contract. Import the model from `shared.schema`, do not redefine it.
