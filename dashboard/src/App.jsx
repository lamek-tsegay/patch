import { useEffect, useMemo, useRef, useState } from "react";
import { commitFix, commitFixApproved, loadDashboardData } from "./lib/dashboardData";

const COVER_ALERTS = [
  { label: 'Vulnerability detected', color: '#ff3c3c', delay: '0.5s' },
  { label: 'SQL injection — CWE-89', color: '#ff3c3c', delay: '1.2s' },
  { label: 'Hardcoded secret — CWE-798', color: '#f59e0b', delay: '2.0s' },
  { label: 'Weak crypto — CWE-327', color: '#f59e0b', delay: '2.8s' },
  { label: 'Patch agent activated', color: '#22c55e', delay: '3.8s' },
];

function BrandIcon() {
  return (
    <svg className="brand-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="30" height="30" rx="6" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
      <polygon points="16,4 28,10 28,22 16,28 4,22 4,10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" fill="none"/>
      <polygon points="16,4 28,10 16,16" fill="rgba(255,255,255,0.08)"/>
      <polygon points="16,4 4,10 16,16" fill="rgba(255,255,255,0.04)"/>
      <polygon points="16,16 28,10 28,22" fill="rgba(255,255,255,0.06)"/>
      <polygon points="16,16 4,10 4,22" fill="rgba(255,255,255,0.03)"/>
      <polygon points="16,16 28,22 16,28" fill="rgba(255,255,255,0.05)"/>
      <polygon points="16,16 4,22 16,28" fill="rgba(255,255,255,0.07)"/>
      <circle cx="16" cy="16" r="2" fill="rgba(255,255,255,0.5)"/>
    </svg>
  );
}

function CoverPage({ onEnter }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { const t = setTimeout(() => setReady(true), 600); return () => clearTimeout(t); }, []);
  function handleEnter() { setLeaving(true); setTimeout(onEnter, 600); }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    let tick = 0;
    const particles = [];

    function resize() {
      canvas.width = canvas.offsetWidth * DPR;
      canvas.height = canvas.offsetHeight * DPR;
      ctx.scale(DPR, DPR);
      particles.length = 0;
      const n = Math.floor(canvas.offsetWidth * canvas.offsetHeight / 8000);
      for (let i = 0; i < n; i++) particles.push({ x: Math.random()*canvas.offsetWidth, y: Math.random()*canvas.offsetHeight, r: Math.random()*1.2+0.3, s: Math.random()*0.25+0.04, o: Math.random()*0.25+0.05, d: (Math.random()-0.5)*0.15 });
    }

    const CODE = [
      "def authenticate(email, password):",
      "  conn = db.connect(DATABASE_URL)",
      '  query = f"SELECT * FROM users',
      "    WHERE email = '{email}'\"",
      "  result = conn.execute(query)",
      "  if result.fetchone(): return True",
    ];
    const IS_VULN = [false, false, true, true, true, false];

    function frame() {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      tick++;
      for (const p of particles) {
        p.y -= p.s; p.x += p.d;
        if (p.y < -2) { p.y = H+2; p.x = Math.random()*W; }
        if (p.x < 0 || p.x > W) p.x = Math.random()*W;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,255,255,${p.o})`; ctx.fill();
      }
      const lh = 26, sx = W*0.07, sy = H*0.22;
      ctx.font = '12px "SF Mono",ui-monospace,monospace';
      CODE.forEach((line, i) => {
        const y = sy + i*lh, phase = (tick - i*20)/80;
        if (phase < 0) return;
        const alpha = Math.min(1, phase*2) * 0.65;
        if (IS_VULN[i] && phase > 0.3) {
          const g = 0.4 + Math.sin(tick*0.07+i)*0.4;
          ctx.fillStyle = `rgba(255,60,60,${0.05*g})`;
          ctx.fillRect(sx-6, y-3, W*0.86, lh);
        }
        ctx.fillStyle = IS_VULN[i] ? `rgba(255,100,100,${alpha})` : `rgba(200,210,230,${alpha*0.55})`;
        ctx.fillText(line, sx, y+14);
        if (IS_VULN[i] && phase > 0.4) {
          ctx.font = '9px Inter,sans-serif';
          ctx.fillStyle = `rgba(255,60,60,${alpha*0.7})`;
          ctx.fillText('vulnerable', W*0.82, y+13);
          ctx.font = '12px "SF Mono",ui-monospace,monospace';
        }
      });
      const scanY = H*0.18 + ((tick%280)/280)*(H*0.68);
      const g = ctx.createLinearGradient(0,scanY-20,0,scanY+20);
      g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(0.5,'rgba(255,255,255,0.035)'); g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g; ctx.fillRect(0,scanY-20,W,40);
      rafRef.current = requestAnimationFrame(frame);
    }

    resize(); new ResizeObserver(resize).observe(canvas); frame();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div onClick={handleEnter} style={{ position:'fixed',inset:0,zIndex:100,cursor:'pointer',background:'#08090c',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',transition:'opacity 0.6s ease',opacity:leaving?0:1 }}>
      <canvas ref={canvasRef} style={{ position:'absolute',inset:0,width:'100%',height:'100%' }} />
      <style>{`
        @keyframes slideIn{0%{opacity:0;transform:translateX(20px)}20%{opacity:1;transform:translateX(0)}100%{opacity:1}}
        @keyframes dot{0%,100%{opacity:1}50%{opacity:0.15}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{ position:'absolute',top:28,right:28,zIndex:3,display:'flex',flexDirection:'column',gap:7 }}>
        {COVER_ALERTS.map((a,i) => (
          <div key={i} style={{ padding:'7px 14px',border:`1px solid ${a.color}28`,borderLeft:`2px solid ${a.color}`,background:'rgba(8,9,12,0.94)',color:a.color,fontSize:12,fontFamily:'Inter,sans-serif',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',gap:8,animation:`slideIn 2.5s ${a.delay} both` }}>
            <span style={{ width:5,height:5,borderRadius:'50%',background:a.color,display:'inline-block',animation:i===COVER_ALERTS.length-1?'none':'dot 1s infinite',flexShrink:0 }} />
            {a.label}
          </div>
        ))}
      </div>
      <div style={{ position:'relative',zIndex:2,textAlign:'center',userSelect:'none' }}>
        <div style={{ animation:'fadeUp 0.8s 0.3s both',display:'flex',alignItems:'center',justifyContent:'center',gap:20,marginBottom:20 }}>
          <svg viewBox="0 0 48 48" fill="none" style={{width:56,height:56}}>
            <polygon points="24,2 46,12 46,36 24,46 2,36 2,12" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none"/>
            <polygon points="24,2 46,12 24,24" fill="rgba(255,255,255,0.06)"/>
            <polygon points="24,2 2,12 24,24" fill="rgba(255,255,255,0.03)"/>
            <polygon points="24,24 46,12 46,36" fill="rgba(255,255,255,0.05)"/>
            <polygon points="24,24 2,12 2,36" fill="rgba(255,255,255,0.02)"/>
            <polygon points="24,24 46,36 24,46" fill="rgba(255,255,255,0.04)"/>
            <polygon points="24,24 2,36 24,46" fill="rgba(255,255,255,0.06)"/>
            <circle cx="24" cy="24" r="3" fill="rgba(255,255,255,0.6)"/>
          </svg>
          <div style={{ fontSize:'clamp(60px,10vw,130px)',fontWeight:800,letterSpacing:'-0.05em',lineHeight:0.88,color:'#fff',fontFamily:'Inter,-apple-system,sans-serif' }}>patch</div>
        </div>
        <div style={{ animation:'fadeUp 0.8s 0.55s both',fontSize:12,color:'rgba(255,255,255,0.28)',letterSpacing:'0.14em',textTransform:'uppercase',fontFamily:'Inter,sans-serif' }}>
          Autonomous Security · Nemotron Powered
        </div>
        <div style={{ animation:'fadeUp 0.8s 0.9s both',marginTop:36,display:'flex',alignItems:'center',gap:8,justifyContent:'center',fontSize:11,color:'rgba(255,255,255,0.16)',letterSpacing:'0.12em',textTransform:'uppercase' }}>
          <span style={{ width:14,height:1,background:'rgba(255,255,255,0.1)' }} />
          Click anywhere to enter
          <span style={{ width:14,height:1,background:'rgba(255,255,255,0.1)' }} />
        </div>
      </div>
    </div>
  );
}

function OverviewPage({ dashboardState, scanState = "idle", handleRunScan = () => {} }) {
  const findings = dashboardState?.findings ?? [];
  const proposals = dashboardState?.fixProposals ?? [];
  const policyEvents = dashboardState?.policyEvents ?? [];
  return (
    <div className="page">
      <div className="page-header">
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:20}}>
          <div>
            <div className="page-title">Overview</div>
            <div className="page-sub">High-level summary of the current scan and agent status.</div>
          </div>
          <button
            className="btn-primary"
            onClick={handleRunScan}
            disabled={scanState === "scanning"}
            type="button"
            style={{marginTop:4,whiteSpace:"nowrap",flexShrink:0}}
          >
            {scanState === "scanning" ? "Scanning..." : scanState === "done" ? "Scan Again" : "Run Scan"}
          </button>
        </div>
        {scanState === "scanning" && (
          <div className="notice notice-load" style={{marginTop:12}}>
            <strong>Scanning demo-repo/</strong>
            <p>Nemotron is analyzing your codebase for vulnerabilities. This takes 30-60 seconds...</p>
          </div>
        )}
        {scanState === "error" && (
          <div className="notice notice-err" style={{marginTop:12}}>
            <strong>Scan failed</strong>
            <p>Check that the scanner is configured correctly on Brev.</p>
          </div>
        )}
        {scanState === "done" && (
          <div className="notice notice-ok" style={{marginTop:12}}>
            <strong>Scan complete</strong>
            <p>Findings refreshed from patch.db.</p>
          </div>
        )}
      </div>
      <div className="stats" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="stat"><div className="stat-val red">{findings.length}</div><div className="stat-key">Total Findings</div></div>
        <div className="stat"><div className="stat-val">{proposals.length}</div><div className="stat-key">Fix Proposals</div></div>
        <div className="stat"><div className="stat-val">{policyEvents.filter(e=>e.verdict==='block').length}</div><div className="stat-key">Policy Blocks</div></div>
      </div>
      <div className="section-label">All Findings</div>
      {findings.map(f => (
        <div className="card" key={f.finding_id} style={{borderColor:f.severity==='critical'?'rgba(255,60,60,0.2)':f.severity==='high'?'rgba(245,158,11,0.2)':'rgba(255,255,255,0.06)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
            <span className={`sev sev-${f.severity}`}>{f.severity}</span>
            <span className="card-title">{f.category.replace(/_/g,' ')}</span>
          </div>
          <div className="card-sub">{f.description}</div>
          <div style={{fontSize:11,color:'var(--muted2)',fontFamily:'"SF Mono",ui-monospace,monospace'}}>{f.file}:{f.line_start} · {f.cwe} · confidence {Math.round(f.confidence*100)}%</div>
        </div>
      ))}
    </div>
  );
}

function AttackPathsPage({ dashboardState }) {
  const findings = dashboardState?.findings ?? [];
  const ATTACK_PATH = [
    {icon:"📦",name:"vulnerable-lib",ver:"v4.2.1",sev:"critical",cls:"vuln"},
    {icon:"🔗",name:"transitive-dep",ver:"v2.1.0",sev:"high",cls:"high"},
    {icon:"</>",name:"unsafe input",ver:"handling",sev:"high",cls:"high"},
    {icon:"🌐",name:"/api/login",ver:"POST",sev:"critical",cls:"vuln"},
    {icon:"🗄️",name:"users table",ver:"exposed",sev:"critical",cls:"vuln"},
  ];
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Attack Paths</div>
        <div className="page-sub">Visualized exploit chains from entry point to sensitive data.</div>
      </div>
      <div className="section-label">Primary Attack Chain</div>
      <div className="card">
        <div className="card-title" style={{marginBottom:4}}>SQL Injection → Data Exfiltration</div>
        <div className="card-sub">An attacker can exploit the login endpoint to access all user records.</div>
        <div className="path-wrap">
          {ATTACK_PATH.map((node,i) => (
            <div key={i} style={{display:'flex',alignItems:'center'}}>
              <div className={`path-node ${node.cls}`}>
                <div className="path-icon">{node.icon}</div>
                <div className="path-name">{node.name}</div>
                <div className="path-ver">{node.ver}</div>
                <div className={`path-sev ${node.cls==='vuln'?'critical':node.cls}`}>{node.sev}</div>
              </div>
              {i<ATTACK_PATH.length-1&&<div className="path-arr">→</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="section-label" style={{marginTop:20}}>Affected Files</div>
      {findings.map(f => (
        <div className="card" key={f.finding_id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:14,alignItems:'center',padding:'14px 18px'}}>
          <span className={`sev sev-${f.severity}`}>{f.severity}</span>
          <div>
            <div style={{fontSize:13,fontWeight:500}}>{f.category.replace(/_/g,' ')}</div>
            <div style={{fontSize:11,color:'var(--muted2)',fontFamily:'ui-monospace,monospace',marginTop:2}}>{f.file}:{f.line_start}</div>
          </div>
          <div style={{fontSize:11,color:'var(--muted2)'}}>{f.cwe}</div>
        </div>
      ))}
    </div>
  );
}

function FixProposalsPage({ dashboardState, selectedProposalId, setSelectedProposalId, actionState, actionError, actionResult, handleStageFix, handleHumanApprove }) {
  const proposals = dashboardState?.fixProposals ?? [];
  const finding = dashboardState?.selectedFinding;
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Fix Proposals</div>
        <div className="page-sub">Ranked remediation strategies generated by the hunting agent.</div>
      </div>
      {finding && (
        <>
          <div className="section-label">Fixing: {finding.category.replace(/_/g,' ')} in {finding.file}</div>
          {proposals.map(proposal => (
            <button key={proposal.proposal_id} className={`fix ${selectedProposalId===proposal.proposal_id?"selected":""}`} onClick={()=>setSelectedProposalId(proposal.proposal_id)} type="button" style={{marginBottom:10}}>
              <span className="fix-rank">{proposal.rank}</span>
              <span>
                <span className="fix-name">{proposal.title}</span>
                <span className="fix-desc">{proposal.rationale}</span>
                <span style={{display:'block',fontSize:11,color:'var(--muted2)',marginTop:4}}>{proposal.tradeoffs}</span>
              </span>
              <span className={`risk risk-${proposal.breaking_change_risk}`}>{proposal.breaking_change_risk} risk</span>
            </button>
          ))}
          <div className="approval">
            <span className={`state ${dashboardState.approvalState==="idle"?"state-idle":dashboardState.approvalState==="awaiting_approval"?"state-awaiting":"state-approved"}`}>
              {dashboardState.approvalState ?? "idle"}
            </span>
            <span className="approval-note">Human approval required before any code changes.</span>
          </div>
          <div className="actions">
            <button className="btn-primary" disabled={actionState==="staging"||actionState==="approving"} onClick={handleStageFix} type="button">{actionState==="staging"?"Staging...":"Stage Fix"}</button>
            <button className="btn-ghost" type="button">Review Diff</button>
            <button className="btn-ghost" disabled={dashboardState.approvalState!=="awaiting_approval"} onClick={handleHumanApprove} type="button">{actionState==="approving"?"Approving...":"Approve Commit"}</button>
          </div>
          {actionError&&<div className="notice notice-err"><strong>Failed</strong><p>{actionError}</p></div>}
          {actionResult?.status==="approved"&&(
            <div className="notice notice-ok">
              <strong>Commit approved</strong>
              <p>{actionResult.branch?`Branch ${actionResult.branch} created`:"Approval completed"}</p>
              {actionResult.prUrl&&<p>PR: <a href={actionResult.prUrl} target="_blank" rel="noreferrer">{actionResult.prUrl}</a></p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PolicyPage({ dashboardState }) {
  const events = dashboardState?.policyEvents ?? [];
  const audit = dashboardState?.auditTrail ?? [];
  const reasoning = dashboardState?.reasoningTrace ?? [];
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Policy</div>
        <div className="page-sub">NemoClaw policy engine events — every action logged before execution.</div>
      </div>
      <div className="two-col">
        <div>
          <div className="section-label">Policy Events</div>
          <div className="simple-list">
            {events.map((e,i) => (
              <div className={`policy-row ${e.verdict}`} key={i}>
                <span>{e.verdict}</span>
                <div><strong>{e.summary}</strong><p>{e.note}</p></div>
              </div>
            ))}
            {events.length===0&&<div style={{color:'var(--muted2)',fontSize:12,padding:'12px 0'}}>No events yet. Stage a fix to see policy events.</div>}
          </div>
        </div>
        <div>
          <div className="section-label">Audit Trail</div>
          <div className="simple-list">
            {audit.map((e,i) => (
              <div className="audit-row" key={i}>
                <span>{e.timestamp}</span>
                <p>{e.event}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{marginTop:20}}>
        <div className="section-label">Agent Reasoning</div>
        <div className="simple-list">
          {reasoning.map(item => (
            <div className="list-row" key={item.step}>
              <span>{item.step}</span>
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-sub">Configuration for the Patch agent and integrations.</div>
      </div>
      <div className="card">
        <div className="section-label" style={{marginBottom:0}}>GitHub Integration</div>
        {[
          {label:"Repository",desc:"Target repo for automated PRs",val:"lamek-tsegay/patch"},
          {label:"Branch Strategy",desc:"How fix branches are named",val:"patch/fix-{finding_id}"},
          {label:"GitHub Token",desc:"Personal access token with repo scope",val:"••••••••••••••••"},
        ].map(s => (
          <div className="setting-row" key={s.label}>
            <div><div className="setting-label">{s.label}</div><div className="setting-desc">{s.desc}</div></div>
            <div className="setting-val">{s.val}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="section-label" style={{marginBottom:0}}>NVIDIA NIM</div>
        {[
          {label:"Super Model",desc:"Used for detection and fix generation",val:"nvidia/nemotron-3-super-120b"},
          {label:"Nano Model",desc:"Used for policy summaries",val:"nvidia/nemotron-3-nano-30b"},
          {label:"Endpoint",desc:"NIM API base URL",val:"integrate.api.nvidia.com/v1"},
          {label:"API Key",desc:"Build.nvidia.com credential",val:"••••••••••••••••"},
        ].map(s => (
          <div className="setting-row" key={s.label}>
            <div><div className="setting-label">{s.label}</div><div className="setting-desc">{s.desc}</div></div>
            <div className="setting-val">{s.val}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="section-label" style={{marginBottom:0}}>Infrastructure</div>
        {[
          {label:"Brev Instance",desc:"Cloud compute for agent execution",val:"slippery-apricot-galliform"},
          {label:"Provider",desc:"GPU provider",val:"MASSEDCOMPUTE A100 80GB"},
          {label:"Demo Repo Path",desc:"Vulnerable app for scanning",val:"./demo-repo"},
          {label:"Database",desc:"SQLite path for findings",val:"sqlite:///patch.db"},
        ].map(s => (
          <div className="setting-row" key={s.label}>
            <div><div className="setting-label">{s.label}</div><div className="setting-desc">{s.desc}</div></div>
            <div className="setting-val">{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreatIntelPage({ dashboardState, selectedProposalId, setSelectedProposalId, actionState, actionError, actionResult, handleStageFix, handleHumanApprove }) {
  const [openSection, setOpenSection] = useState("findings");
  const stats = useMemo(() => dashboardState ? [
    { label:"Active Findings", value:String(dashboardState.findings.length), cls:"red" },
    { label:"Policy Blocks", value:String(dashboardState.policyEvents.filter(e=>e.verdict==="block").length), cls:"red" },
    { label:"Fixes Ready", value:String(dashboardState.fixProposals.length), cls:"" },
    { label:"Approval State", value:dashboardState.approvalState??"idle", cls:dashboardState.approvalState==="approved"?"green":"" },
  ] : [], [dashboardState]);
  const selectedFinding = dashboardState?.selectedFinding;
  const queuedFindings = dashboardState?.findings.slice(1) ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Threat Intelligence</div>
        <div className="page-sub">Autonomous vulnerability detection and ranked fixes, under your control.</div>
      </div>
      <div className="stats">
        {stats.map(s => <div className="stat" key={s.label}><div className={`stat-val ${s.cls}`}>{s.value}</div><div className="stat-key">{s.label}</div></div>)}
      </div>
      <div className="section-label">Active Findings</div>
      {selectedFinding && (
        <div className="finding">
          <div className="finding-top">
            <div>
              <span className="sev sev-critical">Critical</span>
              <div className="finding-name">{selectedFinding.category.replace(/_/g," ")}</div>
              <div className="finding-loc">{selectedFinding.file}:{selectedFinding.line_start}</div>
            </div>
            <div className="finding-meta">
              <div className="meta-cell"><div className="meta-key">Category</div><div className="meta-val" style={{fontSize:12}}>{selectedFinding.category}</div></div>
              <div className="meta-cell"><div className="meta-key">Confidence</div><div className="meta-val">{Math.round(selectedFinding.confidence*100)}%</div></div>
              <div className="meta-cell"><div className="meta-key">CWE</div><div className="meta-val" style={{fontSize:13}}>{selectedFinding.cwe}</div></div>
            </div>
          </div>
          <div className="exploit">
            <span className="exploit-key">Exploit Path</span>
            <span className="exploit-val">{selectedFinding.exploit_path}</span>
          </div>
          <div className="fixes-title">Ranked Fix Options</div>
          {dashboardState.fixProposals.map(proposal => (
            <button key={proposal.proposal_id} className={`fix ${selectedProposalId===proposal.proposal_id?"selected":""}`} onClick={()=>setSelectedProposalId(proposal.proposal_id)} type="button">
              <span className="fix-rank">{proposal.rank}</span>
              <span><span className="fix-name">{proposal.title}</span><span className="fix-desc">{proposal.rationale}</span></span>
              <span className={`risk risk-${proposal.breaking_change_risk}`}>{proposal.breaking_change_risk}</span>
            </button>
          ))}
          <div className="approval">
            <span className={`state ${dashboardState.approvalState==="idle"?"state-idle":dashboardState.approvalState==="awaiting_approval"?"state-awaiting":"state-approved"}`}>{dashboardState.approvalState??"idle"}</span>
            <span className="approval-note">Blocked via <code>commit_fix()</code>. Executes on <code>commit_fix_approved()</code>.</span>
          </div>
          <div className="actions">
            <button className="btn-primary" disabled={actionState==="staging"||actionState==="approving"} onClick={handleStageFix} type="button">{actionState==="staging"?"Staging...":"Stage Fix"}</button>
            <button className="btn-ghost" type="button">Review Diff</button>
            <button className="btn-ghost" disabled={dashboardState.approvalState!=="awaiting_approval"} onClick={handleHumanApprove} type="button">{actionState==="approving"?"Approving...":"Approve Commit"}</button>
          </div>
          {actionError&&<div className="notice notice-err"><strong>Failed</strong><p>{actionError}</p></div>}
          {actionResult?.status==="approved"&&(
            <div className="notice notice-ok">
              <strong>Commit approved</strong>
              <p>{actionResult.branch?`Branch ${actionResult.branch} created`:"Approval completed"}</p>
              {actionResult.prUrl&&<p>PR: <a href={actionResult.prUrl} target="_blank" rel="noreferrer">{actionResult.prUrl}</a></p>}
            </div>
          )}
        </div>
      )}
      {queuedFindings.length>0&&(
        <div>
          {queuedFindings.map(f=>(
            <div className="queue-row" key={f.finding_id}>
              <span className={`sev sev-${f.severity}`} style={{display:'inline-block'}}>{f.severity}</span>
              <strong style={{fontSize:13}}>{f.category.replace(/_/g," ")}</strong>
              <span>{f.file}:{f.line_start}</span>
              <span>{f.severity==="high"?"5m ago":"18m ago"}</span>
              <button className="btn-ghost" style={{padding:'5px 12px',fontSize:11}} type="button">Review →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { id:"overview", label:"Overview", icon:"○" },
  { id:"threat", label:"Threat Intelligence", icon:"◈", dot:true },
  { id:"paths", label:"Attack Paths", icon:"→" },
  { id:"fixes", label:"Fix Proposals", icon:"◻" },
  { id:"policy", label:"Policy", icon:"⊙" },
  { id:"settings", label:"Settings", icon:"⚙" },
];

export default function App() {
  const [showCover, setShowCover] = useState(true);
  const [scanState, setScanState] = useState("idle");
  const [activePage, setActivePage] = useState("threat");
  const [dashboardState, setDashboardState] = useState(null);
  const [loadingState, setLoadingState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [actionState, setActionState] = useState("idle");
  const [actionError, setActionError] = useState("");
  const [actionResult, setActionResult] = useState(null);

  useEffect(() => {
    let active = true;
    loadDashboardData()
      .then(s => { if (!active) return; setDashboardState(s); setSelectedProposalId(s.fixProposals[0]?.proposal_id ?? ""); setLoadingState("ready"); })
      .catch(err => { if (!active) return; setLoadError(err?.message ?? "failed"); setLoadingState("error"); });
    return () => { active = false; };
  }, []);

  async function handleStageFix() {
    if (!dashboardState?.selectedFinding || !selectedProposalId) return;
    const proposal = dashboardState.fixProposals.find(p => p.proposal_id === selectedProposalId);
    if (!proposal) return;
    setActionState("staging"); setActionError(""); setActionResult(null);
    try {
      const result = await commitFix(dashboardState.selectedFinding, proposal);
      setDashboardState(cur => cur ? { ...cur, approvalState: result.status, policyEvents: result.events, auditTrail: [...result.auditEntries, ...cur.auditTrail] } : cur);
      setActionResult(result); setActionState("awaiting_approval");
    } catch(err) { setActionError(err?.message ?? "failed"); setActionState("error"); }
  }

  async function handleHumanApprove() {
    if (!dashboardState?.selectedFinding || !selectedProposalId) return;
    const proposal = dashboardState.fixProposals.find(p => p.proposal_id === selectedProposalId);
    if (!proposal) return;
    setActionState("approving"); setActionError(""); setActionResult(null);
    try {
      const result = await commitFixApproved(dashboardState.selectedFinding, proposal);
      setDashboardState(cur => cur ? { ...cur, approvalState: result.status, policyEvents: result.events, auditTrail: [...result.auditEntries, ...cur.auditTrail] } : cur);
      setActionResult(result); setActionState("approved");
    } catch(err) { setActionError(err?.message ?? "failed"); setActionState("error"); }
  }

  async function handleRunScan() {
    setScanState("scanning");
    try {
      const res = await fetch("/api/run-scan", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        const fresh = await fetch("/api/dashboard-state");
        const state = await fresh.json();
        if (state.findings) {
          const order = {critical:0,high:1,medium:2,low:3};
          const sorted = [...state.findings].sort((a,b)=>(order[a.severity]??99)-(order[b.severity]??99));
          setDashboardState({
            source:"api",
            findings: sorted,
            selectedFinding: sorted[0] ?? null,
            fixProposals: state.fix_proposals ?? [],
            reasoningTrace: state.reasoning_trace ?? [],
            policyEvents: state.policy_events ?? [],
            auditTrail: state.audit_trail ?? [],
            approvalState: state.approval_state ?? "idle",
            metadata: {
              findingSource: state.metadata?.finding_source ?? "sqlite ./patch.db",
              traceSource: state.metadata?.trace_source ?? "trace stream",
              policySource: state.metadata?.policy_source ?? "policy stream",
              live: state.metadata?.live ?? true,
            }
          });
          setSelectedProposalId(state.fix_proposals?.[0]?.proposal_id ?? "");
        }
        setScanState("done");
      } else {
        setScanState("error");
      }
    } catch(err) {
      console.error(err);
      setScanState("error");
    }
  }

  const activeNav = NAV_ITEMS.find(n => n.id === activePage);
  const sharedProps = { dashboardState, selectedProposalId, setSelectedProposalId, actionState, actionError, actionResult, handleStageFix, handleHumanApprove };

  function renderPage() {
    if (loadingState === "loading") return <div className="page"><div className="notice notice-load"><strong>Loading</strong><p>Checking API → JSON → mock</p></div></div>;
    if (loadingState === "error") return <div className="page"><div className="notice notice-err"><strong>Failed</strong><p>{loadError}</p></div></div>;
    switch(activePage) {
      case "overview": return <OverviewPage {...sharedProps} scanState={scanState} handleRunScan={handleRunScan} />;
      case "threat": return <ThreatIntelPage {...sharedProps} />;
      case "paths": return <AttackPathsPage {...sharedProps} />;
      case "fixes": return <FixProposalsPage {...sharedProps} />;
      case "policy": return <PolicyPage {...sharedProps} />;
      case "settings": return <SettingsPage />;
      default: return <ThreatIntelPage {...sharedProps} />;
    }
  }

  return (
    <>
      {showCover && <CoverPage onEnter={() => setShowCover(false)} />}
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <BrandIcon />
            <div className="brand-text">
              <div className="brand-name">Patch</div>
              <div className="brand-tag">Autonomous Security</div>
            </div>
          </div>
          <nav className="nav">
            <div className="nav-group">
              <div className="nav-group-label">Navigation</div>
              {NAV_ITEMS.map(item => (
                <button key={item.id} className={`nav-item ${activePage===item.id?"active":""}`} onClick={() => setActivePage(item.id)}>
                  <span style={{ fontSize:14, width:16, textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                  {item.label}
                  {item.dot && <span className="nav-dot" />}
                </button>
              ))}
            </div>
          </nav>
          <div className="sidebar-footer">
            {[["Hunting Agent","Active"],["Verify Agent","Active"],["Policy Engine","Enforcing"]].map(([name,status]) => (
              <div className="agent-row" key={name}>
                <span className="agent-name">{name}</span>
                <span className="agent-status">{status}</span>
              </div>
            ))}
            <div style={{ marginTop:10, fontSize:10, color:'var(--muted)' }}>patch v2.1.0 · build 7f3a2c1</div>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div className="topbar-left">
              <span>Patch</span>
              <span className="topbar-sep">/</span>
              <span className="topbar-page">{activeNav?.label ?? "Dashboard"}</span>
            </div>
            <div className="topbar-right">
              <div className="chip">{dashboardState?.metadata?.findingSource ?? "sqlite ./patch.db"}</div>
              <div className="chip live"><span className="live-dot" />Live</div>
            </div>
          </div>
          {renderPage()}
        </main>
      </div>
    </>
  );
}
