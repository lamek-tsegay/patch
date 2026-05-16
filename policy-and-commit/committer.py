import os
from dotenv import load_dotenv
from github import Github
from shared.schema import Finding
from policy_and_commit.engine import PolicyEngine

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO", "lamek-tsegay/patch")


def verify_against_file(finding: Finding, repo) -> bool:
    """
    Anti-hallucination guard from schema.md.
    Checks vulnerable_code actually exists in the file
    at the exact lines specified.
    """
    try:
        contents = repo.get_contents(finding.file)
        file_lines = contents.decoded_content.decode("utf-8").splitlines()
        actual_lines = "\n".join(
            file_lines[finding.line_start - 1: finding.line_end]
        )
        return finding.vulnerable_code.strip() in actual_lines
    except Exception as e:
        print(f"[COMMIT] Verification failed: {e}")
        return False


def commit_fix(finding: Finding, fix_code: str) -> dict:
    """
    Called after human approval is received.
    Verifies the finding, commits the fix, opens a PR.
    Returns a result dict with status and PR url.
    """
    engine = PolicyEngine()

    # Step 1 — severity check
    engine.check_severity(finding)

    # Step 2 — policy check for commit
    commit_event = engine.check_can_commit(finding)
    if not commit_event.allowed:
        print(f"[COMMIT] Blocked by policy: {commit_event.reason}")
        return {
            "status": "blocked",
            "reason": commit_event.reason,
            "events": engine.get_events()
        }

    # Step 3 — policy check for PR
    pr_event = engine.check_can_open_pr(finding)
    if not pr_event.allowed:
        print(f"[COMMIT] PR blocked by policy: {pr_event.reason}")
        return {
            "status": "blocked",
            "reason": pr_event.reason,
            "events": engine.get_events()
        }

    return {
        "status": "blocked",
        "reason": "Awaiting human approval",
        "events": engine.get_events()
    }


def commit_fix_approved(finding: Finding, fix_code: str) -> dict:
    """
    Called only after human clicks approve on dashboard.
    Actually makes the git changes and opens the PR.
    """
    engine = PolicyEngine()

    # Log the human approval
    engine.approve(finding)

    try:
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(GITHUB_REPO)

        # Step 1 — verify finding is real
        if not verify_against_file(finding, repo):
            return {
                "status": "error",
                "reason": "Finding failed verification — vulnerable_code not found in file",
                "events": engine.get_events()
            }

        # Step 2 — get current file
        file_contents = repo.get_contents(finding.file)
        original = file_contents.decoded_content.decode("utf-8")

        # Step 3 — replace vulnerable lines with fix
        lines = original.splitlines(keepends=True)
        lines[finding.line_start - 1: finding.line_end] = [
            fix_code + "\n"
        ]
        updated = "".join(lines)

        # Step 4 — create a new branch for this fix
        branch_name = f"patch/fix-{str(finding.finding_id)[:8]}"
        base_sha = repo.get_branch("main").commit.sha
        repo.create_git_ref(
            ref=f"refs/heads/{branch_name}",
            sha=base_sha
        )

        # Step 5 — commit the fix
        repo.update_file(
            path=finding.file,
            message=f"fix({finding.category}): patch {finding.cwe} in {finding.file}",
            content=updated,
            sha=file_contents.sha,
            branch=branch_name
        )

        # Step 6 — open pull request
        pr = repo.create_pull(
            title=f"[Patch] {finding.severity.upper()} {finding.category} in {finding.file}",
            body=f"""## Security Fix — {finding.cwe}

**Severity:** {finding.severity}
**Category:** {finding.category}
**File:** `{finding.file}` (lines {finding.line_start}–{finding.line_end})
**Finding ID:** {finding.finding_id}

### What was wrong
{finding.description}

### How an attacker exploits it
{finding.exploit_path}

### What was changed
Vulnerable code replaced with verified fix after human approval.

---
*Opened automatically by Patch after human approval.*
""",
            head=branch_name,
            base="main"
        )

        print(f"[COMMIT] PR opened: {pr.html_url}")

        return {
            "status": "success",
            "pr_url": pr.html_url,
            "branch": branch_name,
            "events": engine.get_events()
        }

    except Exception as e:
        print(f"[COMMIT] Error: {e}")
        return {
            "status": "error",
            "reason": str(e),
            "events": engine.get_events()
        }