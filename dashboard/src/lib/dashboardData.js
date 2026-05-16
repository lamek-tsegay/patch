const mockFinding = {
  finding_id: "f3a9c1b2-7d4e-4a2f-9c81-1e6b5a4d3c20",
  severity: "critical",
  category: "sql_injection",
  file: "demo-repo/auth/login.py",
  line_start: 42,
  line_end: 44,
  vulnerable_code:
    "query = f\"SELECT id, password_hash FROM users WHERE email = '{email}'\"",
  description:
    "User-controlled email is interpolated directly into a SQL query in the login path. That makes the authentication check bypassable and turns the first matching row into a valid session.",
  exploit_path:
    "POST /api/login with email=' OR '1'='1' -- reaches cursor.execute() with attacker-controlled SQL.",
  cwe: "CWE-89",
  confidence: 0.95,
};

const mockData = {
  findings: [
    mockFinding,
    {
      finding_id: "0f4a0d31-5f83-4579-bf88-2fbaf4dc466d",
      severity: "high",
      category: "hardcoded_secret",
      file: "demo-repo/payments/stripe_client.py",
      line_start: 11,
      line_end: 11,
      vulnerable_code: 'STRIPE_SECRET_KEY = "sk_live_demo_key"',
      description: "A production-style Stripe secret is hardcoded in source.",
      exploit_path:
        "Anyone with read access to the repo or image can recover the key and call the payment provider directly.",
      cwe: "CWE-798",
      confidence: 0.91,
    },
    {
      finding_id: "f70ec61a-96f9-4488-a144-5b6894757bc9",
      severity: "medium",
      category: "broken_auth",
      file: "demo-repo/admin/session.py",
      line_start: 18,
      line_end: 19,
      vulnerable_code: "if user:\n    return True",
      description:
        "The admin gate checks truthiness of the user object rather than role or capability.",
      exploit_path:
        "Any authenticated account reaching the admin path is treated as authorized.",
      cwe: "CWE-285",
      confidence: 0.86,
    },
  ],
  fix_proposals: [
    {
      proposal_id: "8b2e7d10-3f56-4c11-b9a2-0c4e9d7a1f30",
      finding_id: mockFinding.finding_id,
      rank: 1,
      title: "use a parameterized query for the users lookup",
      rationale:
        "Bind the email as a SQL parameter so the driver escapes attacker input instead of executing it as query syntax.",
      tradeoffs: "Low-risk and minimal diff, but only fixes this one query site.",
      breaking_change_risk: "low",
    },
    {
      proposal_id: "30b0d4dc-9499-43aa-95ca-3997fd8ac59d",
      finding_id: mockFinding.finding_id,
      rank: 2,
      title: "move login lookup into a typed auth helper",
      rationale:
        "Encapsulate the query in one safe helper so the login path and future callers share the same parameterized access pattern.",
      tradeoffs:
        "Touches more code than rank 1 and requires light call-site cleanup.",
      breaking_change_risk: "medium",
    },
    {
      proposal_id: "eb8ddb1c-197b-4d78-b4c3-f9b0ec8249f0",
      finding_id: mockFinding.finding_id,
      rank: 3,
      title: "migrate login reads to the orm auth repository",
      rationale:
        "Replace raw SQL in the auth path with the repo abstraction already used elsewhere in the app.",
      tradeoffs: "Largest change surface, but best for long-term consistency.",
      breaking_change_risk: "medium",
    },
  ],
  reasoning_trace: [
    {
      step: "01",
      title: "indexed first-party code",
      detail: "scanned demo-repo and excluded third-party dependency source",
    },
    {
      step: "02",
      title: "traced attacker-controlled input",
      detail: "mapped request.email from POST /api/login into auth/login.py",
    },
    {
      step: "03",
      title: "validated exploitability",
      detail:
        "confirmed direct string interpolation before db.execute() in auth path",
    },
    {
      step: "04",
      title: "ranked three remediation strategies",
      detail: "sorted fixes by blast radius, readability, and break risk",
    },
  ],
  policy_events: [
    {
      verdict: "allow",
      summary: "read demo-repo/auth/login.py",
      note: "required to verify vulnerable_code against disk",
    },
    {
      verdict: "allow",
      summary: "read patch.db",
      note: "dashboard hydrated findings queue from repo-root sqlite",
    },
    {
      verdict: "block",
      summary: "write .env",
      note: "credential mutation blocked outside approved fix pipeline",
    },
    {
      verdict: "block",
      summary: "outbound network request",
      note: "policy denied egress during local demo mode",
    },
  ],
  audit_trail: [
    { timestamp: "10:41:02", event: "scan started against demo-repo" },
    { timestamp: "10:41:05", event: "finding emitted to patch.db" },
    { timestamp: "10:41:08", event: "three fix proposals attached" },
    { timestamp: "10:41:10", event: "policy event stream appended" },
    {
      timestamp: "10:41:12",
      event: "approval state set to awaiting human review",
    },
  ],
  metadata: {
    finding_source: "sqlite ./patch.db",
    trace_source: "mock trace stream",
    policy_source: "mock policy stream",
    live: true,
  },
};

function sortFindings(findings) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...findings].sort(
    (left, right) =>
      (order[left.severity] ?? Number.MAX_SAFE_INTEGER) -
      (order[right.severity] ?? Number.MAX_SAFE_INTEGER),
  );
}

function normalizeDashboardData(input) {
  const findings = sortFindings(input.findings ?? []);
  const selectedFinding = findings[0] ?? null;
  const proposals = (input.fix_proposals ?? [])
    .filter((proposal) => proposal.finding_id === selectedFinding?.finding_id)
    .sort((left, right) => left.rank - right.rank);

  return {
    findings,
    selectedFinding,
    fixProposals: proposals,
    reasoningTrace: input.reasoning_trace ?? [],
    policyEvents: input.policy_events ?? [],
    auditTrail: input.audit_trail ?? [],
    metadata: {
      findingSource: input.metadata?.finding_source ?? "sqlite ./patch.db",
      traceSource: input.metadata?.trace_source ?? "trace stream pending",
      policySource: input.metadata?.policy_source ?? "policy stream pending",
      live: input.metadata?.live ?? false,
    },
  };
}

async function loadJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`failed to load ${url}`);
  }

  return response.json();
}

export async function loadDashboardData() {
  if (window.__PATCH_DASHBOARD_DATA__) {
    return {
      source: "window override",
      ...normalizeDashboardData(window.__PATCH_DASHBOARD_DATA__),
    };
  }

  try {
    const apiPayload = await loadJson("/api/dashboard-state");
    return { source: "api", ...normalizeDashboardData(apiPayload) };
  } catch {
    try {
      const filePayload = await loadJson("/dashboard-data.json");
      return { source: "json file", ...normalizeDashboardData(filePayload) };
    } catch {
      return { source: "mock fallback", ...normalizeDashboardData(mockData) };
    }
  }
}
