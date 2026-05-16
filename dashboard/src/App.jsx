import { useEffect, useMemo, useState } from "react";
import {
  commitFix,
  commitFixApproved,
  loadDashboardData,
} from "./lib/dashboardData";

function RobotMascot() {
  return (
    <div className="robot" aria-hidden="true">
      <svg
        className="robot-svg"
        viewBox="0 0 360 500"
        role="img"
        aria-label="patch robot mascot"
      >
        <defs>
          <linearGradient id="metal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="28%" stopColor="#daddE6" />
            <stop offset="62%" stopColor="#b4b9c6" />
            <stop offset="100%" stopColor="#7f8798" />
          </linearGradient>
          <linearGradient id="metalDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#cfd4df" />
            <stop offset="100%" stopColor="#5c6474" />
          </linearGradient>
          <linearGradient id="visor" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#171a22" />
            <stop offset="100%" stopColor="#05060b" />
          </linearGradient>
          <linearGradient id="joint" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2f323b" />
            <stop offset="100%" stopColor="#0e1016" />
          </linearGradient>
          <radialGradient id="blueCore" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#72a9ff" />
            <stop offset="55%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#19398b" />
          </radialGradient>
          <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(37,99,235,0.65)" />
            <stop offset="100%" stopColor="rgba(37,99,235,0)" />
          </radialGradient>
          <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000000" floodOpacity="0.35" />
          </filter>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#2563eb" floodOpacity="0.35" />
          </filter>
        </defs>

        <ellipse cx="184" cy="474" rx="88" ry="18" fill="url(#floorGlow)" />

        <g filter="url(#shadow)">
          <rect x="176" y="16" width="6" height="28" rx="3" fill="#aeb7ca" />
          <circle cx="179" cy="10" r="8" fill="url(#blueCore)" filter="url(#softGlow)" />

          <g transform="translate(96 34)">
            <rect x="0" y="0" width="168" height="126" rx="36" fill="url(#metal)" />
            <rect x="10" y="10" width="148" height="106" rx="28" fill="#eff2f8" opacity="0.55" />
            <rect x="18" y="16" width="132" height="96" rx="26" fill="url(#visor)" />
            <ellipse cx="44" cy="58" rx="14" ry="17" fill="#ffffff" />
            <ellipse cx="88" cy="58" rx="14" ry="17" fill="#ffffff" />
            <path d="M59 83c8 10 24 10 32 0" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
            <g>
              <ellipse cx="-2" cy="57" rx="19" ry="28" fill="url(#metal)" />
              <ellipse cx="170" cy="57" rx="19" ry="28" fill="url(#metal)" />
              <circle cx="-2" cy="57" r="9" fill="url(#blueCore)" />
              <circle cx="170" cy="57" r="9" fill="url(#blueCore)" />
            </g>
          </g>

          <rect x="164" y="164" width="30" height="26" rx="12" fill="url(#metalDark)" />

          <g transform="translate(112 184)">
            <path
              d="M26 0h92c21 0 38 16 40 37l7 64c2 20-14 37-35 37H15C-6 138-22 121-20 101l7-64C-11 16 5 0 26 0Z"
              fill="url(#metal)"
            />
            <path
              d="M18 13h108c15 0 27 11 28 26l4 38c2 18-12 33-31 33H18c-19 0-33-15-31-33l4-38c1-15 13-26 27-26Z"
              fill="#ecf0f8"
              opacity="0.4"
            />
            <rect x="52" y="26" width="52" height="58" rx="16" fill="#14204d" />
            <path
              d="M78 39l7 14 16 2-12 10 4 16-15-8-15 8 4-16-12-10 16-2 7-14Z"
              fill="#4d8dff"
              filter="url(#softGlow)"
            />
          </g>

          <g transform="translate(98 318)">
            <rect x="36" y="0" width="90" height="22" rx="11" fill="url(#joint)" />
            <rect x="43" y="18" width="76" height="24" rx="10" fill="url(#metalDark)" />
          </g>

          <g transform="translate(76 206)">
            <ellipse cx="28" cy="18" rx="19" ry="21" fill="url(#joint)" />
            <rect x="18" y="20" width="24" height="74" rx="12" fill="url(#metal)" transform="rotate(28 30 57)" />
            <circle cx="51" cy="96" r="15" fill="url(#metalDark)" />
            <rect x="35" y="103" width="24" height="70" rx="12" fill="url(#metal)" transform="rotate(44 47 138)" />
            <circle cx="18" cy="184" r="17" fill="url(#metal)" />
            <circle cx="4" cy="203" r="14" fill="url(#metal)" />
            <circle cx="-8" cy="219" r="13" fill="url(#metal)" />
          </g>

          <g transform="translate(246 188)">
            <ellipse cx="18" cy="22" rx="19" ry="21" fill="url(#joint)" />
            <rect x="6" y="22" width="24" height="76" rx="12" fill="url(#metal)" transform="rotate(-36 18 60)" />
            <circle cx="42" cy="92" r="15" fill="url(#metalDark)" />
            <rect x="50" y="28" width="24" height="72" rx="12" fill="url(#metal)" transform="rotate(-10 62 64)" />
            <rect x="63" y="6" width="28" height="38" rx="13" fill="url(#metal)" />
            <rect x="77" y="-10" width="12" height="26" rx="6" fill="url(#metal)" />
            <circle cx="77" cy="4" r="11" fill="url(#metal)" />
          </g>

          <g transform="translate(124 350)">
            <rect x="0" y="0" width="26" height="70" rx="13" fill="url(#metal)" transform="rotate(4 13 35)" />
            <circle cx="20" cy="74" r="15" fill="url(#blueCore)" filter="url(#softGlow)" />
            <rect x="-4" y="84" width="44" height="92" rx="18" fill="url(#metal)" />
            <path d="M-12 177h60c-2 18-17 28-34 28-19 0-30-10-26-28Z" fill="url(#metal)" />
          </g>

          <g transform="translate(204 350)">
            <rect x="0" y="0" width="26" height="70" rx="13" fill="url(#metal)" transform="rotate(-4 13 35)" />
            <circle cx="20" cy="74" r="15" fill="url(#blueCore)" filter="url(#softGlow)" />
            <rect x="-4" y="84" width="44" height="92" rx="18" fill="url(#metal)" />
            <path d="M-12 177h60c-2 18-17 28-34 28-19 0-30-10-26-28Z" fill="url(#metal)" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function buildStats(data) {
  const findingCount = data.findings.length;
  const blockedCount = data.policyEvents.filter(
    (event) => event.verdict === "block",
  ).length;
  const proposalCount = data.fixProposals.length;

  return [
    { label: "active findings", value: String(findingCount) },
    { label: "policy blocks", value: String(blockedCount) },
    { label: "ranked fixes ready", value: String(proposalCount) },
    { label: "approval state", value: data.approvalState ?? "idle" },
  ];
}

export default function App() {
  const [openSection, setOpenSection] = useState("findings");
  const [dashboardState, setDashboardState] = useState(null);
  const [loadingState, setLoadingState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [actionState, setActionState] = useState("idle");
  const [actionError, setActionError] = useState("");
  const [actionResult, setActionResult] = useState(null);

  useEffect(() => {
    let isActive = true;

    async function hydrateDashboard() {
      try {
        const nextState = await loadDashboardData();
        if (!isActive) return;
        setDashboardState(nextState);
        setSelectedProposalId(nextState.fixProposals[0]?.proposal_id ?? "");
        setLoadingState("ready");
      } catch (error) {
        if (!isActive) return;
        setLoadError(error instanceof Error ? error.message : "failed to load");
        setLoadingState("error");
      }
    }

    hydrateDashboard();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleStageFix() {
    if (!dashboardState?.selectedFinding || !selectedProposalId) return;

    const proposal = dashboardState.fixProposals.find(
      (item) => item.proposal_id === selectedProposalId,
    );
    if (!proposal) return;

    setActionState("staging");
    setActionError("");
    setActionResult(null);

    try {
      const result = await commitFix(dashboardState.selectedFinding, proposal);
      setDashboardState((current) =>
        current
          ? {
              ...current,
              approvalState: result.status,
              selectedProposalId: result.selectedProposalId,
              policyEvents: result.events,
              auditTrail: [...result.auditEntries, ...current.auditTrail],
            }
          : current,
      );
      setActionResult(result);
      setActionState("awaiting_approval");
      setOpenSection("policy");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "failed to stage fix");
      setActionState("error");
    }
  }

  async function handleHumanApprove() {
    if (!dashboardState?.selectedFinding || !selectedProposalId) return;

    const proposal = dashboardState.fixProposals.find(
      (item) => item.proposal_id === selectedProposalId,
    );
    if (!proposal) return;

    setActionState("approving");
    setActionError("");
    setActionResult(null);

    try {
      const result = await commitFixApproved(
        dashboardState.selectedFinding,
        proposal,
      );
      setDashboardState((current) =>
        current
          ? {
              ...current,
              approvalState: result.status,
              selectedProposalId: result.selectedProposalId,
              policyEvents: result.events,
              auditTrail: [...result.auditEntries, ...current.auditTrail],
            }
          : current,
      );
      setActionResult(result);
      setActionState("approved");
      setOpenSection("audit");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "failed to approve fix",
      );
      setActionState("error");
    }
  }

  const stats = useMemo(
    () => (dashboardState ? buildStats(dashboardState) : []),
    [dashboardState],
  );

  const sections = useMemo(() => {
    if (!dashboardState) return [];

    return [
      {
        id: "reasoning",
        title: "reasoning",
        summary: `${dashboardState.reasoningTrace.length} steps · narration-ready`,
        content: (
          <div className="simple-list">
            {dashboardState.reasoningTrace.map((item) => (
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
      },
      {
        id: "policy",
        title: "policy",
        summary: `${dashboardState.policyEvents.length} events · ${dashboardState.metadata.policySource}`,
        content: (
          <div className="simple-list">
            {dashboardState.policyEvents.map((event, index) => (
              <div
                className={`policy-row ${event.verdict}`}
                key={`${event.summary}-${index}`}
              >
                <span>{event.verdict}</span>
                <div>
                  <strong>{event.summary}</strong>
                  <p>{event.note}</p>
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "audit",
        title: "audit trail",
        summary: `${dashboardState.auditTrail.length} events · chronological`,
        content: (
          <div className="simple-list">
            {dashboardState.auditTrail.map((entry) => (
              <div
                className="audit-row"
                key={`${entry.timestamp}-${entry.event}`}
              >
                <span>{entry.timestamp}</span>
                <p>{entry.event}</p>
              </div>
            ))}
          </div>
        ),
      },
    ];
  }, [dashboardState]);

  const selectedFinding = dashboardState?.selectedFinding;
  const queuedFindings = dashboardState?.findings.slice(1) ?? [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">p</div>
          <span>patch.agent</span>
        </div>

        <div className="topbar-right">
          <span className="tiny-chip">
            {dashboardState?.metadata.findingSource ?? "sqlite ./patch.db"}
          </span>
          <span className="tiny-chip">
            {dashboardState?.metadata.traceSource ?? "trace stream pending"}
          </span>
          <span className="tiny-chip">
            {dashboardState ? `source ${dashboardState.source}` : "loading data"}
          </span>
          <span className="tiny-chip">
            {dashboardState?.approvalState ?? "approval idle"}
          </span>
          <div className="status-pill">
            <span className="status-dot" />
            {dashboardState?.metadata.live ? "live" : "demo"}
          </div>
        </div>
      </header>

      <section className="hero home-screen" id="home">
        <div className="hero-text">
          <h1>
            patch secures
            <br />
            your code.
          </h1>
          <p>
            autonomous vulnerability detection and ranked fixes, under your
            control.
          </p>

          <div className="hero-actions">
            <a className="primary-button button-link" href="#findings-screen">
              run scan
            </a>
            <a className="ghost-button button-link" href="#findings-screen">
              open findings
            </a>
          </div>

          {loadingState === "error" ? (
            <div className="hero-notice error-notice">
              <strong>data load failed</strong>
              <p>{loadError}</p>
            </div>
          ) : null}

          {loadingState === "loading" ? (
            <div className="hero-notice loading-notice">
              <strong>loading dashboard state</strong>
              <p>checking api, then json file, then mock fallback</p>
            </div>
          ) : null}

          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="stat-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>
                  {stat.label === "approval state" ? "policy enforced" : "live"}
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-robot">
          <RobotMascot />
        </div>
      </section>

      <section className="details-screen" id="findings-screen">
        <div className="screen-block">
          <div className="screen-heading">
            <div className="section-index">
              <span>01</span>
              <h2>findings</h2>
              <b>{dashboardState?.findings.length ?? 0}</b>
            </div>
            <button
              className="section-collapse"
              onClick={() => setOpenSection(openSection === "findings" ? "" : "findings")}
              type="button"
            >
              {openSection === "findings" ? "⌃" : "⌄"}
            </button>
          </div>

          {openSection === "findings" && selectedFinding ? (
            <div className="feature-panel">
              <div className="feature-header">
                <div className="feature-title">
                  <span className="severity-mark severity-critical">critical</span>
                  <h3>sql injection</h3>
                  <p>
                    {selectedFinding.file}:{selectedFinding.line_start}
                  </p>
                </div>

                <div className="feature-meta-grid">
                  <div>
                    <span>category</span>
                    <strong>{selectedFinding.category}</strong>
                  </div>
                  <div>
                    <span>confidence</span>
                    <strong>{selectedFinding.confidence.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>first seen</span>
                    <strong>10:12:45</strong>
                  </div>
                </div>
              </div>

              <div className="feature-strip">
                <span>exploit path</span>
                <p>{selectedFinding.exploit_path}</p>
                <button className="mini-link" type="button">
                  view details
                </button>
              </div>

              <div className="feature-fixes">
                <span className="mini-label">ranked fix options</span>
                {dashboardState.fixProposals.map((proposal) => (
                  <button
                    className={`feature-fix-row ${
                      selectedProposalId === proposal.proposal_id ? "selected" : ""
                    }`}
                    key={proposal.proposal_id}
                    onClick={() => setSelectedProposalId(proposal.proposal_id)}
                    type="button"
                  >
                    <span className="feature-rank">{proposal.rank}</span>
                    <span className="feature-copy">
                      <strong>{proposal.title}</strong>
                      <small>{proposal.rationale}</small>
                    </span>
                    <span className={`effort-pill effort-${proposal.breaking_change_risk}`}>
                      {proposal.breaking_change_risk === "low"
                        ? "low effort"
                        : proposal.breaking_change_risk === "medium"
                          ? "medium effort"
                          : "higher effort"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="approval-banner">
                <span className={`approval-pill state-${dashboardState.approvalState}`}>
                  {dashboardState.approvalState}
                </span>
                <p>
                  blocked events come from <code>commit_fix(finding, proposal)</code>.
                  final approval comes from <code>commit_fix_approved()</code>.
                </p>
              </div>

              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={actionState === "staging" || actionState === "approving"}
                  onClick={handleStageFix}
                  type="button"
                >
                  {actionState === "staging"
                    ? "staging fix..."
                    : "approve rank 1"}
                </button>
                <button className="ghost-button" type="button">
                  review diff
                </button>
                <button
                  className="ghost-button"
                  disabled={dashboardState.approvalState !== "awaiting_approval"}
                  onClick={handleHumanApprove}
                  type="button"
                >
                  {actionState === "approving"
                    ? "approving..."
                    : "human approve commit"}
                </button>
              </div>

              {actionError ? (
                <div className="hero-notice error-notice inline-notice">
                  <strong>approval flow failed</strong>
                  <p>{actionError}</p>
                </div>
              ) : null}

              {actionResult?.status === "approved" ? (
                <div className="hero-notice success-notice inline-notice">
                  <strong>commit pipeline approved</strong>
                  <p>
                    {actionResult.branch
                      ? `branch ${actionResult.branch} created`
                      : "approval completed through the local policy bridge"}
                  </p>
                  {actionResult.prUrl ? (
                    <p>
                      pr ready:{" "}
                      <a href={actionResult.prUrl} target="_blank" rel="noreferrer">
                        {actionResult.prUrl}
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="stacked-list">
            {queuedFindings.map((finding) => (
              <div className="collapsed-finding-row" key={finding.finding_id}>
                <span className={`severity-mark severity-${finding.severity}`}>
                  {finding.severity}
                </span>
                <strong>{finding.category.replace("_", " ")}</strong>
                <span>
                  {finding.file}:{finding.line_start}
                </span>
                <span>{finding.category}</span>
                <span>{finding.severity === "high" ? "5m ago" : "18m ago"}</span>
                <button className="row-arrow" type="button">
                  ›
                </button>
              </div>
            ))}
          </div>
        </div>

        {sections.map((section, index) => {
          const isOpen = openSection === section.id;
          return (
            <div className="screen-block collapsed-block" key={section.id}>
              <button
                className="collapsed-heading"
                onClick={() => setOpenSection(isOpen ? "" : section.id)}
                type="button"
              >
                <div className="section-index">
                  <span>{String(index + 2).padStart(2, "0")}</span>
                  <h2>{section.title}</h2>
                  {section.id === "reasoning" ? <b>live</b> : null}
                  {section.id === "policy" ? <b>2 events</b> : null}
                  {section.id === "audit" ? <b>8 events</b> : null}
                </div>
                <div className="collapsed-summary">
                  <span>{section.summary}</span>
                  <span>{isOpen ? "⌃" : "⌄"}</span>
                </div>
              </button>
              {isOpen ? <div className="accordion-panel inline-panel">{section.content}</div> : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
