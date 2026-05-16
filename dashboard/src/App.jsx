import { useEffect, useMemo, useState } from "react";
import {
  commitFix,
  commitFixApproved,
  loadDashboardData,
} from "./lib/dashboardData";

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

  useEffect(() => {
    let isActive = true;

    async function hydrateDashboard() {
      try {
        const nextState = await loadDashboardData();
        if (!isActive) {
          return;
        }
        setDashboardState(nextState);
        setSelectedProposalId(nextState.fixProposals[0]?.proposal_id ?? "");
        setLoadingState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }
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
    if (!dashboardState?.selectedFinding || !selectedProposalId) {
      return;
    }

    const proposal = dashboardState.fixProposals.find(
      (item) => item.proposal_id === selectedProposalId,
    );

    if (!proposal) {
      return;
    }

    setActionState("staging");
    setActionError("");

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
      setActionState("awaiting_approval");
      setOpenSection("policy");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "failed to stage fix");
      setActionState("error");
    }
  }

  async function handleHumanApprove() {
    if (!dashboardState?.selectedFinding || !selectedProposalId) {
      return;
    }

    const proposal = dashboardState.fixProposals.find(
      (item) => item.proposal_id === selectedProposalId,
    );

    if (!proposal) {
      return;
    }

    setActionState("approving");
    setActionError("");

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
    if (!dashboardState) {
      return [];
    }

    const selectedFinding = dashboardState.selectedFinding;

    return [
      {
        id: "findings",
        title: "findings",
        summary: `${dashboardState.findings.length} findings · contract-shaped payloads`,
        content: selectedFinding ? (
          <div className="finding-card">
            <div className="finding-heading">
              <div>
              <p className="eyebrow critical">{selectedFinding.severity}</p>
                <h3>raw sql query reachable from login form</h3>
                <p className="finding-path">
                  {selectedFinding.file}:{selectedFinding.line_start}
                </p>
              </div>
              <span className="live-indicator">selected</span>
            </div>

            <p className="finding-description">{selectedFinding.description}</p>

            <div className="finding-meta">
              <div>
                <p className="mini-label">category</p>
                <p>{selectedFinding.category}</p>
              </div>
              <div>
                <p className="mini-label">confidence</p>
                <p>{selectedFinding.confidence}</p>
              </div>
              <div>
                <p className="mini-label">cwe</p>
                <p>{selectedFinding.cwe}</p>
              </div>
            </div>

            <div className="evidence-strip">
              <p className="mini-label">exploit path</p>
              <p>{selectedFinding.exploit_path}</p>
            </div>

            <div className="fix-list">
              <p className="mini-label">three ranked fix options</p>
              {dashboardState.fixProposals.map((proposal) => (
                <button
                  className={`fix-row ${
                    selectedProposalId === proposal.proposal_id ? "selected" : ""
                  }`}
                  key={proposal.proposal_id}
                  onClick={() => setSelectedProposalId(proposal.proposal_id)}
                  type="button"
                >
                  <span className="fix-rank">{proposal.rank}</span>
                  <span className="fix-copy">
                    <strong>{proposal.title}</strong>
                    <small>{proposal.rationale}</small>
                  </span>
                  <span
                    className={`risk-chip risk-${proposal.breaking_change_risk}`}
                  >
                    {proposal.breaking_change_risk}
                  </span>
                </button>
              ))}
            </div>

            <div className="approval-banner">
              <span className={`approval-pill state-${dashboardState.approvalState}`}>
                {dashboardState.approvalState}
              </span>
              <p>
                call <code>commit_fix(finding, proposal)</code> first, then only
                call <code>commit_fix_approved()</code> when a human confirms.
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
                  : "stage fix for approval"}
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

            <div className="queue-list">
              <p className="mini-label">queue</p>
              {dashboardState.findings.slice(1).map((finding) => (
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
        ) : (
          <div className="empty-state">
            <strong>no findings loaded</strong>
            <p>waiting for serialized Finding payloads from the detector.</p>
          </div>
        ),
      },
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
                <small>{stat.label === "approval state" ? "policy enforced" : "live"}</small>
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

        {sections
          .filter((section) => section.id !== "findings")
          .map((section, index) => {
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
