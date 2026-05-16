import { useEffect, useMemo, useState } from "react";
import { loadDashboardData } from "./lib/dashboardData";

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
    { label: "approval state", value: proposalCount ? "awaiting" : "idle" },
  ];
}

export default function App() {
  const [openSection, setOpenSection] = useState("findings");
  const [dashboardState, setDashboardState] = useState(null);
  const [loadingState, setLoadingState] = useState("loading");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function hydrateDashboard() {
      try {
        const nextState = await loadDashboardData();
        if (!isActive) {
          return;
        }
        setDashboardState(nextState);
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
                <button className="fix-row" key={proposal.proposal_id} type="button">
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
          <div className="status-pill">
            <span className="status-dot" />
            {dashboardState?.metadata.live ? "live" : "demo"}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">bk dashboard · integration-ready</p>
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
                <div className="accordion-panel">{section.content}</div>
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
