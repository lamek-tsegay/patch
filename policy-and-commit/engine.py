import yaml
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from shared.schema import Finding


@dataclass
class PolicyEvent:
    timestamp: str
    action: str
    allowed: bool
    reason: str
    finding_id: str = None


class PolicyEngine:
    def __init__(self, policy_path: str = None):
        if policy_path is None:
            policy_path = os.path.join(
                os.path.dirname(__file__), "policy.yaml"
            )
        with open(policy_path, "r") as f:
            self.policy = yaml.safe_load(f)
        self.events = []

    def _emit_event(self, action: str, allowed: bool, 
                    reason: str, finding_id: str = None):
        event = PolicyEvent(
            timestamp=datetime.utcnow().isoformat(),
            action=action,
            allowed=allowed,
            reason=reason,
            finding_id=finding_id
        )
        self.events.append(event)
        status = "ALLOWED" if allowed else "BLOCKED"
        print(f"[POLICY] {status} — {action}: {reason}")
        return event

    def check_can_read_file(self, filepath: str) -> PolicyEvent:
        denied = self.policy["rules"]["filesystem"]["deny_read"]
        for pattern in denied:
            if ".env" in filepath or "secrets" in filepath:
                return self._emit_event(
                    action=f"read_file:{filepath}",
                    allowed=False,
                    reason=f"File matches deny_read pattern: {pattern}"
                )
        return self._emit_event(
            action=f"read_file:{filepath}",
            allowed=True,
            reason="File is within allowed read scope"
        )

    def check_can_commit(self, finding: Finding) -> PolicyEvent:
        gate = self.policy["rules"]["human_gate"]["required_for"]
        if "commit_to_branch" in gate:
            return self._emit_event(
                action="commit_to_branch",
                allowed=False,
                reason="Human approval required before commit. Waiting for approval signal.",
                finding_id=str(finding.finding_id)
            )
        return self._emit_event(
            action="commit_to_branch",
            allowed=True,
            reason="Policy allows commit",
            finding_id=str(finding.finding_id)
        )

    def check_can_open_pr(self, finding: Finding) -> PolicyEvent:
        gate = self.policy["rules"]["human_gate"]["required_for"]
        if "open_pull_request" in gate:
            return self._emit_event(
                action="open_pull_request",
                allowed=False,
                reason="Human approval required before PR. Waiting for approval signal.",
                finding_id=str(finding.finding_id)
            )
        return self._emit_event(
            action="open_pull_request",
            allowed=True,
            reason="Policy allows PR",
            finding_id=str(finding.finding_id)
        )

    def approve(self, finding: Finding) -> PolicyEvent:
        return self._emit_event(
            action="human_approval_received",
            allowed=True,
            reason=f"Human approved fix for {finding.category} "
                   f"in {finding.file}",
            finding_id=str(finding.finding_id)
        )

    def check_severity(self, finding: Finding) -> PolicyEvent:
        escalate = self.policy["rules"]["severity_thresholds"][
            "auto_escalate_to_human"
        ]
        if finding.severity in escalate:
            return self._emit_event(
                action=f"severity_check:{finding.severity}",
                allowed=True,
                reason=f"Severity {finding.severity} flagged as urgent — escalating to human immediately",
                finding_id=str(finding.finding_id)
            )
        return self._emit_event(
            action=f"severity_check:{finding.severity}",
            allowed=True,
            reason=f"Severity {finding.severity} within normal handling",
            finding_id=str(finding.finding_id)
        )

    def get_events(self) -> list:
        return [
            {
                "timestamp": e.timestamp,
                "action": e.action,
                "allowed": e.allowed,
                "reason": e.reason,
                "finding_id": e.finding_id
            }
            for e in self.events
        ]
