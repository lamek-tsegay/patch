import { useMemo, useState } from "react";

const activeFinding = {
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

const findingQueue = [
  activeFinding,
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
];

const fixProposals = [
  {
    rank: 1,
    title: "use a parameterized query for the users lookup",
    rationale:
      "Bind the email as a SQL parameter so the driver escapes attacker input instead of executing it as query syntax.",
    tradeoffs:
      "Low-risk and minimal diff, but only fixes this one query site.",
    risk: "low",
  },
  {
    rank: 2,
    title: "move login lookup into a typed auth helper",
    rationale:
      "Encapsulate the query in one safe helper so the login path and future callers share the same parameterized access pattern.",
    tradeoffs:
      "Touches more code than rank 1 and requires light call-site cleanup.",
    risk: "medium",
  },
  {
    rank: 3,
    title: "migrate login reads to the orm auth repository",
    rationale:
      "Replace raw SQL in the auth path with the repo abstraction already used elsewhere in the app.",
    tradeoffs:
      "Largest change surface, but best for long-term consistency.",
    risk: "medium",
  },
];

const reasoningTrace = [
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
    detail: "confirmed direct string interpolation before db.execute() in auth path",
  },
  {
    step: "04",
    title: "ranked three remediation strategies",
    detail: "sorted fixes by blast radius, readability, and break risk",
  },
];

const policyEvents = [
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
];

const auditTrail = [
  ["10:41:02", "scan started against demo-repo"],
  ["10:41:05", "finding emitted to patch.db"],
  ["10:41:08", "three fix proposals attached"],
  ["10:41:10", "policy event stream appended"],
  ["10:41:12", "approval state set to awaiting human review"],
];

const stats = [
  { label: "active findings", value: "3" },
  { label: "policy blocks", value: "2" },
  { label: "ranked fixes ready", value: "3" },
  { label: "approval state", value: "awaiting" },
];

function RobotMascot() {
  return (
    <div className="robot" aria-hidden="true">
      <div className="robot-antenna" />
      <div className="robot-head">
        <span className="robot-ear robot-ear-left" />
        <span className="robot-ear robot-ear-right" />
        <div className="robot-visor">
          <div className="robot-face">
            <span className="robot-eye" />
            <span className="robot-eye" />
          </div>
          <div className="robot-mouth" />
        </div>
      </div>

      <div className="robot-neck" />

      <div className="robot-torso">
        <span className="robot-shoulder robot-shoulder-left" />
        <span className="robot-shoulder robot-shoulder-right" />
        <div className="robot-badge">★</div>
      </div>

      <div className="robot-arm robot-arm-left">
        <span className="robot-upper-arm" />
        <span className="robot-elbow" />
        <span className="robot-forearm" />
        <span className="robot-hand robot-hand-hip" />
      </div>

      <div className="robot-arm robot-arm-right">
        <span className="robot-upper-arm" />
        <span className="robot-elbow" />
        <span className="robot-forearm" />
        <span className="robot-hand robot-hand-thumbs-up">
          <span className="robot-thumb" />
        </span>
      </div>

      <div className="robot-hips" />

      <div className="robot-leg robot-leg-left">
        <span className="robot-knee-cap" />
        <span className="robot-thigh" />
        <span className="robot-shin" />
        <span className="robot-foot" />
      </div>

      <div className="robot-leg robot-leg-right">
        <span className="robot-knee-cap" />
        <span className="robot-thigh" />
        <span className="robot-shin" />
        <span className="robot-foot" />
      </div>
    </div>
  );
}

export default function App() {
  const [openSection, setOpenSection] = useState("findings");

  const sectionMap = useMemo(
    () => ({
      findings: (
        <div className="finding-card">
          <div className="finding-heading">
            <div>
              <p className="eyebrow critical">{activeFinding.severity}</p>
              <h3>raw sql query reachable from login form</h3>
              <p className="finding-path">
                {activeFinding.file}:{activeFinding.line_start}
              </p>
            </div>
            <span className="live-indicator">selected</span>
          </div>

          <p className="finding-description">{activeFinding.description}</p>

          <div className="finding-meta">
            <div>
              <p className="mini-label">category</p>
              <p>{activeFinding.category}</p>
            </div>
            <div>
              <p className="mini-label">confidence</p>
              <p>{activeFinding.confidence}</p>
            </div>
            <div>
              <p className="mini-label">cwe</p>
              <p>{activeFinding.cwe}</p>
            </div>
          </div>

          <div className="evidence-strip">
            <p className="mini-label">exploit path</p>
            <p>{activeFinding.exploit_path}</p>
          </div>

          <div className="fix-list">
            <p className="mini-label">three ranked fix options</p>
            {fixProposals.map((proposal) => (
              <button className="fix-row" key={proposal.rank} type="button">
                <span className="fix-rank">{proposal.rank}</span>
                <span className="fix-copy">
                  <strong>{proposal.title}</strong>
                  <small>{proposal.rationale}</small>
                </span>
                <span className={`risk-chip risk-${proposal.risk}`}>
                  {proposal.risk}
                </span>
              </button>
            ))}
          </div>

          <div className="action-row">
            <button className="primary-button" type="button">
              approve rank 1
            </button>
            <button className="ghost-button" type="button">
              review diff
            </button>
          </div>

          <div className="queue-list">
            <p className="mini-label">queue</p>
            {findingQueue.slice(1).map((finding) => (
              <div className="queue-row" key={finding.finding_id}>
                <span className={`severity-pill severity-${finding.severity}`}>
                  {finding.severity}
                </span>
                <div>
                  <strong>{finding.category}</strong>
                  <small>
                    {finding.file}:{finding.line_start}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      reasoning: (
        <div className="simple-list">
          {reasoningTrace.map((item) => (
            <div className="list-row detail-row" key={item.step}>
              <span>{item.step}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ),
      policy: (
        <div className="simple-list">
          {policyEvents.map((event) => (
            <div className={`policy-row ${event.verdict}`} key={event.summary}>
              <span>{event.verdict}</span>
              <div>
                <strong>{event.summary}</strong>
                <p>{event.note}</p>
              </div>
            </div>
          ))}
        </div>
      ),
      audit: (
        <div className="simple-list">
          {auditTrail.map(([time, event]) => (
            <div className="audit-row" key={`${time}-${event}`}>
              <span>{time}</span>
              <p>{event}</p>
            </div>
          ))}
        </div>
      ),
    }),
    [],
  );

  const sections = [
    {
      id: "findings",
      title: "findings",
      summary: "sqlite-backed queue · 3 findings loaded",
    },
    {
      id: "reasoning",
      title: "reasoning",
      summary: "nano-readable narration of the current scan",
    },
    {
      id: "policy",
      title: "policy",
      summary: "live allow and block events from NemoClaw",
    },
    {
      id: "audit",
      title: "audit trail",
      summary: "chronological demo log from scan start to approval",
    },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">p</div>
          <span>patch.agent</span>
        </div>

        <div className="topbar-right">
          <span className="tiny-chip">sqlite ./patch.db</span>
          <span className="tiny-chip">jsonl streams pending</span>
          <div className="status-pill">
            <span className="status-dot" />
            live
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">bk dashboard · demo mode</p>
          <h1>
            patch secures
            <br />
            your code.
          </h1>
          <p>
            live findings, ranked fix proposals, visible policy control, and a
            clean approval path built for the demo room.
          </p>

          <div className="hero-actions">
            <button className="primary-button" type="button">
              run scan
            </button>
            <button className="ghost-button" type="button">
              open findings
            </button>
          </div>

          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="stat-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-robot">
          <RobotMascot />
        </div>
      </section>

      <section className="accordion-stack">
        {sections.map((section) => {
          const isOpen = openSection === section.id;

          return (
            <div className={`accordion ${isOpen ? "open" : ""}`} key={section.id}>
              <button
                className="accordion-trigger"
                onClick={() => setOpenSection(isOpen ? "" : section.id)}
                type="button"
              >
                <div className="accordion-labels">
                  <span className="accordion-title">{section.title}</span>
                  <span className="accordion-summary">{section.summary}</span>
                </div>
                <span className="accordion-symbol">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen ? (
                <div className="accordion-panel">{sectionMap[section.id]}</div>
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
