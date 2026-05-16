import { useState } from "react";

const sections = [
  {
    id: "findings",
    title: "findings",
    summary: "1 critical finding selected",
    content: (
      <div className="finding-card">
        <div className="finding-heading">
          <div>
            <p className="eyebrow critical">critical</p>
            <h3>raw sql query reachable from login form</h3>
            <p className="finding-path">app/api/auth.py:88</p>
          </div>
          <span className="live-indicator">selected</span>
        </div>

        <div className="finding-meta">
          <div>
            <p className="mini-label">severity</p>
            <p>critical</p>
          </div>
          <div>
            <p className="mini-label">category</p>
            <p>sql_injection</p>
          </div>
          <div>
            <p className="mini-label">confidence</p>
            <p>0.96</p>
          </div>
        </div>

        <div className="fix-list">
          <p className="mini-label">ranked fix options</p>
          <button className="fix-row" type="button">
            1. replace string interpolation with parameterized query
          </button>
          <button className="fix-row" type="button">
            2. move query into typed auth helper
          </button>
          <button className="fix-row" type="button">
            3. validate and reject unsafe characters before query build
          </button>
        </div>

        <div className="action-row">
          <button className="primary-button" type="button">
            approve fix
          </button>
          <button className="ghost-button" type="button">
            view finding
          </button>
        </div>
      </div>
    ),
  },
  {
    id: "reasoning",
    title: "reasoning",
    summary: "4 live steps available",
    content: (
      <div className="simple-list">
        <div className="list-row">
          <span>01</span>
          <p>indexed repository structure</p>
        </div>
        <div className="list-row">
          <span>02</span>
          <p>traced request input into auth flow</p>
        </div>
        <div className="list-row">
          <span>03</span>
          <p>confirmed unsafe sql sink</p>
        </div>
        <div className="list-row">
          <span>04</span>
          <p>ranked safe remediation options</p>
        </div>
      </div>
    ),
  },
  {
    id: "policy",
    title: "policy",
    summary: "2 blocked actions, 3 allowed",
    content: (
      <div className="simple-list">
        <div className="policy-row allow">
          <span>allow</span>
          <p>read demo-repo/auth.py</p>
        </div>
        <div className="policy-row allow">
          <span>allow</span>
          <p>git diff staged changes</p>
        </div>
        <div className="policy-row block">
          <span>block</span>
          <p>write .env</p>
        </div>
        <div className="policy-row block">
          <span>block</span>
          <p>outbound network request</p>
        </div>
      </div>
    ),
  },
  {
    id: "audit",
    title: "audit trail",
    summary: "latest event 10:41:12",
    content: (
      <div className="simple-list">
        <div className="audit-row">
          <span>10:41:02</span>
          <p>scan started</p>
        </div>
        <div className="audit-row">
          <span>10:41:06</span>
          <p>finding emitted</p>
        </div>
        <div className="audit-row">
          <span>10:41:08</span>
          <p>fix options attached</p>
        </div>
        <div className="audit-row">
          <span>10:41:12</span>
          <p>blocked action logged</p>
        </div>
      </div>
    ),
  },
];

function RobotMascot() {
  return (
    <div className="robot" aria-hidden="true">
      <div className="robot-antenna" />
      <div className="robot-head">
        <div className="robot-face">
          <span className="robot-eye" />
          <span className="robot-eye" />
        </div>
        <div className="robot-mouth" />
      </div>

      <div className="robot-neck" />

      <div className="robot-torso">
        <div className="robot-badge">+</div>
      </div>

      <div className="robot-arm robot-arm-left">
        <span className="robot-joint" />
        <span className="robot-forearm" />
      </div>

      <div className="robot-arm robot-arm-right">
        <span className="robot-joint" />
        <span className="robot-forearm" />
      </div>

      <div className="robot-hips" />

      <div className="robot-leg robot-leg-left">
        <span className="robot-thigh" />
        <span className="robot-shin" />
      </div>

      <div className="robot-leg robot-leg-right">
        <span className="robot-thigh" />
        <span className="robot-shin" />
      </div>
    </div>
  );
}

export default function App() {
  const [openSection, setOpenSection] = useState("findings");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">p</div>
          <span>patch.agent</span>
        </div>

        <div className="status-pill">
          <span className="status-dot" />
          live
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <h1>
            patch secures
            <br />
            your code.
          </h1>
          <p>
            autonomous vulnerability detection, ranked fix proposals, and
            human approval under visible policy control.
          </p>

          <div className="hero-actions">
            <button className="primary-button" type="button">
              run scan
            </button>
            <button className="ghost-button" type="button">
              view findings
            </button>
          </div>
        </div>

        <RobotMascot />
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
