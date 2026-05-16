import os
from dotenv import load_dotenv
from github import Github, Auth
from shared.schema import Finding
from engine import PolicyEngine

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO", "lamek-tsegay/patch")


def verify_against_file(finding: Finding, file_content: str) -> bool:
    """
    Anti-hallucination guard from schema.md.
    Checks vulnerable_code actually exists in the file.
    """
    return finding.vulnerable_code.strip() in file_content


def apply_patch(original: str, search: str, replace: str) -> str | None:
    """
    Applies a search/replace patch to file content.
    Returns None if search string not found.
    """
    if search not in original:
        return None
    return original.replace(search, replace, 1)


def commit_fix(finding: Finding, proposal: dict) -> dict:
    """
    Called when a fix proposal arrives from Law's fix-proposer.
    Checks policy — will always return blocked until human approves.
    Emits policy events to dashboard.
    """
    engine = PolicyEngine()

    # Severity check
    engine.check_severity(finding)

    # Policy check — will block until human approves
    commit_event = engine.check_can_commit(finding)
    pr_event = engine.check_can_open_pr(finding)

    return {
        "status": "awaiting_approval",
        "finding_id": str(finding.finding_id),
        "proposal_id": proposal.get("proposal_id"),
        "message": "Awaiting human approval before any code changes.",
        "events": engine.get_events()
    }


def commit_fix_approved(finding: Finding, proposal: dict) -> dict:
    """
    Called ONLY after human clicks approve on BK's dashboard.
    Applies the patch, commits to a branch, opens a PR.
    Returns pr_url and event log.
    """
    engine = PolicyEngine()
    engine.approve(finding)

    try:
        auth = Auth.Token(GITHUB_TOKEN)
        g = Github(auth=auth)
        repo = g.get_repo(GITHUB_REPO)

        patches = proposal.get("patches", [])
        if not patches:
            return {
                "status": "error",
                "reason": "No patches found in proposal",
                "events": engine.get_events()
            }

        # Use first patch for demo
        patch = patches[0]
        file_path = patch["file"]
        search = patch["search"]
        replace = patch["replace"]

        # Step 1 — get current file
        file_contents = repo.get_contents(file_path)
        original = file_contents.decoded_content.decode("utf-8")

        # Step 2 — anti-hallucination guard
        if not verify_against_file(finding, original):
            return {
                "status": "error",
                "reason": "vulnerable_code not found in file — finding rejected",
                "events": engine.get_events()
            }

        # Step 3 — apply the patch
        updated = apply_patch(original, search, replace)
        if updated is None:
            return {
                "status": "error",
                "reason": "Patch search string not found in file",
                "events": engine.get_events()
            }

        # Step 4 — create branch
        branch_name = f"patch/fix-{str(finding.finding_id)[:8]}"
        base_sha = repo.get_branch("main").commit.sha
        repo.create_git_ref(
            ref=f"refs/heads/{branch_name}",
            sha=base_sha
        )

        # Step 5 — commit the fix
        repo.update_file(
            path=file_path,
            message=f"fix({finding.category}): patch {finding.cwe} in {file_path}",
            content=updated,
            sha=file_contents.sha,
            branch=branch_name
        )

        # Step 6 — open pull request
        pr = repo.create_pull(
            title=f"[Patch] {finding.severity.upper()} {finding.category} in {file_path}",
            body=f"""## Security Fix — {finding.cwe}

**Severity:** {finding.severity}
**Category:** {finding.category}
**File:** `{file_path}`
**Finding ID:** {finding.finding_id}
**Proposal ID:** {proposal.get('proposal_id')}
**Strategy:** {proposal.get('strategy')}

### What was wrong
{finding.description}

### How an attacker exploits it
{finding.exploit_path}

### Fix applied
{proposal.get('rationale')}

### Tradeoffs
{proposal.get('tradeoffs')}

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
            "finding_id": str(finding.finding_id),
            "proposal_id": proposal.get("proposal_id"),
            "events": engine.get_events()
        }

    except Exception as e:
        print(f"[COMMIT] Error: {e}")
        return {
            "status": "error",
            "reason": str(e),
            "events": engine.get_events()
        }