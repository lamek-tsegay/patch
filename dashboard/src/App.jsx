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
      <polygon points="16,2 30,9 30,23 16,30 2,23 2,9" fill="rgba(8,12,35,0.95)" stroke="rgba(0,150,255,0.7)" strokeWidth="1.5"/>
      <polygon points="16,7 25,11.5 25,20.5 16,25 7,20.5 7,11.5" fill="rgba(0,30,100,0.5)" stroke="rgba(0,180,255,0.5)" strokeWidth="1"/>
      <polygon points="16,11 21,13.5 21,18.5 16,21 11,18.5 11,13.5" fill="rgba(0,80,200,0.4)" stroke="rgba(0,200,255,0.9)" strokeWidth="1.2"/>
      <circle cx="16" cy="16" r="2.5" fill="rgba(0,200,255,0.95)"/>
      <circle cx="16" cy="16" r="4" fill="none" stroke="rgba(0,180,255,0.4)" strokeWidth="0.5"/>
    </svg>
  );
}

function CoverPage({ onEnter }) {
  const canvasRef = useRef(null);
  const bgRafRef = useRef(null);
  const logoCanvasRef = useRef(null);
  const logoRafRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState("idle");
  const mouseRef = useRef({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const zoomRef = useRef({ scale: 1, opacity: 1, zooming: false });

  useEffect(() => { const t = setTimeout(() => setReady(true), 600); return () => clearTimeout(t); }, []);

  function handleClick() {
    if (phase !== "idle") return;
    setPhase("shutting");
    setTimeout(onEnter, 900);
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;
    let tick = 0;
    const particles = [];
    function resize() {
      canvas.width = canvas.offsetWidth * DPR;
      canvas.height = canvas.offsetHeight * DPR;
      ctx.scale(DPR, DPR);
      particles.length = 0;
      const n = Math.floor(canvas.offsetWidth * canvas.offsetHeight / 7000);
      for (let i = 0; i < n; i++) particles.push({
        x: Math.random()*canvas.offsetWidth, y: Math.random()*canvas.offsetHeight,
        r: Math.random()*1.2+0.2, s: Math.random()*0.15+0.02,
        o: Math.random()*0.35+0.05, d: (Math.random()-0.5)*0.08
      });
    }
    function frame() {
      const W=canvas.offsetWidth, H=canvas.offsetHeight;
      ctx.clearRect(0,0,W,H); tick++;
      for (const p of particles) {
        p.y-=p.s; p.x+=p.d;
        if(p.y<-2){p.y=H+2;p.x=Math.random()*W;}
        if(p.x<0||p.x>W)p.x=Math.random()*W;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(100,160,255,${p.o})`; ctx.fill();
      }
      bgRafRef.current=requestAnimationFrame(frame);
    }
    resize(); new ResizeObserver(resize).observe(canvas); frame();
    return()=>cancelAnimationFrame(bgRafRef.current);
  },[]);

  useEffect(() => {
    const canvas = logoCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;
    const SIZE = 500;
    canvas.width = SIZE*DPR; canvas.height = SIZE*DPR;
    ctx.scale(DPR, DPR);
    const cx=SIZE/2, cy=SIZE/2;

    function onMouseMove(e) {
      const rect=canvas.getBoundingClientRect();
      mouseRef.current={ x:(e.clientX-rect.left-SIZE/2)/(SIZE/2), y:(e.clientY-rect.top-SIZE/2)/(SIZE/2) };
    }
    canvas.addEventListener("mousemove", onMouseMove);

    function proj(x,y,z,rx,ry) {
      const cosRx=Math.cos(rx),sinRx=Math.sin(rx);
      const cosRy=Math.cos(ry),sinRy=Math.sin(ry);
      const y1=y*cosRx-z*sinRx,z1=y*sinRx+z*cosRx;
      const x2=x*cosRy+z1*sinRy,z2=-x*sinRy+z1*cosRy;
      const fov=420,sc=fov/(fov+z2);
      return [cx+x2*sc, cy+y1*sc, sc, z2];
    }

    function hexRing(R,D,rx,ry) {
      return [0,60,120,180,240,300].map(a=>{
        const r=a*Math.PI/180;
        return proj(R*Math.cos(r),D,R*Math.sin(r),rx,ry);
      });
    }

    function drawHexFace(pts, fill, stroke, lw=2) {
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<6;i++) ctx.lineTo(pts[i][0],pts[i][1]);
      ctx.closePath();
      if(fill){ctx.fillStyle=fill;ctx.fill();}
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
    }

    let tick=0;
    function frame() {
      const z=zoomRef.current, rot=rotRef.current, m=mouseRef.current;
      rot.vx+=(m.y*0.6-rot.x)*0.06; rot.vy+=(m.x*0.6-rot.y)*0.06;
      rot.vx*=0.88; rot.vy*=0.88;
      rot.x+=rot.vx; rot.y+=rot.vy;
      if(z.zooming){z.scale=Math.min(z.scale*1.08,40);z.opacity=Math.max(0,1-(z.scale-1)/8);}

      ctx.clearRect(0,0,SIZE,SIZE);
      ctx.save();
      ctx.translate(cx,cy); ctx.scale(z.scale,z.scale); ctx.translate(-cx,-cy);
      ctx.globalAlpha=z.opacity;

      const autoY=tick*0.002;
      const rx=rot.x*0.8 - 0.52, ry=rot.y*0.8+autoY;

      // Ground glow
      const groundY = cy+80;
      const gg=ctx.createRadialGradient(cx,groundY,0,cx,groundY,160);
      gg.addColorStop(0,"rgba(0,100,255,0.25)"); gg.addColorStop(1,"rgba(0,100,255,0)");
      ctx.fillStyle=gg; ctx.beginPath(); ctx.ellipse(cx,groundY,160,30,0,0,Math.PI*2); ctx.fill();

      // Orbital rings on ground
      [160,130,105].forEach((r,i)=>{
        ctx.strokeStyle=`rgba(30,100,255,${0.15-i*0.03})`; ctx.lineWidth=1;
        ctx.setLineDash([3,6]);
        ctx.beginPath(); ctx.ellipse(cx,groundY,r,r*0.18,0,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      });

      // Orbiting dots
      [0,1,2].forEach(i=>{
        const a=tick*0.02+i*2.1;
        const orR=145-i*18;
        const dx=cx+orR*Math.cos(a), dy=groundY+orR*0.18*Math.sin(a);
        ctx.beginPath(); ctx.arc(dx,dy,2,0,Math.PI*2);
        ctx.fillStyle=`rgba(80,180,255,${0.6+Math.sin(a)*0.3})`; ctx.fill();
      });

      // Outer hex (large, dark with glow edge)
      const R1=115, D1=18;
      const top1=hexRing(R1,-D1,rx,ry), bot1=hexRing(R1,D1,rx,ry);

      // Side faces outer
      for(let i=0;i<6;i++){
        const j=(i+1)%6;
        const avgSc=(bot1[i][2]+bot1[j][2]+top1[i][2]+top1[j][2])/4;
        const l=0.1+avgSc*0.25;
        ctx.beginPath();
        ctx.moveTo(bot1[i][0],bot1[i][1]); ctx.lineTo(bot1[j][0],bot1[j][1]);
        ctx.lineTo(top1[j][0],top1[j][1]); ctx.lineTo(top1[i][0],top1[i][1]);
        ctx.closePath();
        ctx.fillStyle=`rgba(8,12,30,${0.92})`; ctx.fill();
        ctx.strokeStyle=`rgba(20,80,200,${0.3+l*0.3})`; ctx.lineWidth=1; ctx.stroke();
      }
      drawHexFace(bot1,"rgba(5,8,20,0.95)","rgba(20,80,200,0.3)",1);
      drawHexFace(top1,"rgba(10,15,35,0.9)","rgba(40,120,255,0.5)",1.5);

      // Blue glow rim on top face
      ctx.shadowColor="rgba(0,120,255,0.8)"; ctx.shadowBlur=12;
      drawHexFace(top1,null,"rgba(0,150,255,0.9)",2);
      ctx.shadowBlur=0;

      // Inner hex (medium)
      const R2=72, D2=22;
      const top2=hexRing(R2,-D2,rx,ry), bot2=hexRing(R2,D2,rx,ry);
      for(let i=0;i<6;i++){
        const j=(i+1)%6;
        ctx.beginPath();
        ctx.moveTo(bot2[i][0],bot2[i][1]); ctx.lineTo(bot2[j][0],bot2[j][1]);
        ctx.lineTo(top2[j][0],top2[j][1]); ctx.lineTo(top2[i][0],top2[i][1]);
        ctx.closePath();
        ctx.fillStyle="rgba(5,10,40,0.95)"; ctx.fill();
        ctx.strokeStyle="rgba(0,100,255,0.4)"; ctx.lineWidth=1; ctx.stroke();
      }
      drawHexFace(bot2,"rgba(3,6,18,0.95)","rgba(0,100,255,0.3)",1);

      // Inner top with blue glow
      ctx.shadowColor="rgba(0,150,255,1)"; ctx.shadowBlur=20;
      drawHexFace(top2,"rgba(0,30,100,0.6)","rgba(0,180,255,1)",2);
      ctx.shadowBlur=0;

      // Innermost hex glow fill
      const R3=38, D3=24;
      const top3=hexRing(R3,-D3,rx,ry);
      const innerGrd=ctx.createRadialGradient(
        top3.reduce((s,p)=>s+p[0],0)/6, top3.reduce((s,p)=>s+p[1],0)/6, 0,
        top3.reduce((s,p)=>s+p[0],0)/6, top3.reduce((s,p)=>s+p[1],0)/6, 50
      );
      innerGrd.addColorStop(0,"rgba(0,180,255,0.9)"); innerGrd.addColorStop(1,"rgba(0,80,200,0)");
      ctx.shadowColor="rgba(0,200,255,0.8)"; ctx.shadowBlur=15;
      drawHexFace(top3,innerGrd,"rgba(0,200,255,0.8)",1.5);
      ctx.shadowBlur=0;

      // P letter mark in center
      const fcx=top2.reduce((s,p)=>s+p[0],0)/6;
      const fcy=top2.reduce((s,p)=>s+p[1],0)/6;
      ctx.save();
      ctx.translate(fcx,fcy);
      ctx.font="bold 28px Inter,sans-serif";
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.shadowColor="rgba(0,200,255,1)"; ctx.shadowBlur=10;
      ctx.fillStyle="rgba(150,220,255,0.95)";
      ctx.fillText("⬡", 0, 0);
      ctx.shadowBlur=0;
      ctx.restore();

      ctx.restore();
      tick++;
      logoRafRef.current=requestAnimationFrame(frame);
    }

    frame();
    return()=>{cancelAnimationFrame(logoRafRef.current);canvas.removeEventListener("mousemove",onMouseMove);};
  },[]);

  return (
    <div style={{position:"fixed",inset:0,zIndex:100,background:"#06080f",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>

      <style>{`
        @keyframes slideIn{0%{opacity:0;transform:translateX(20px)}20%{opacity:1;transform:translateX(0)}100%{opacity:1}}
        @keyframes dot{0%,100%{opacity:1}50%{opacity:0.15}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes orbitPulse{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:0.7;transform:scale(1.02)}}
        @keyframes scanBlink{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes shutterTop{0%{transform:translateY(-100%)}100%{transform:translateY(0)}}
        @keyframes shutterBot{0%{transform:translateY(100%)}100%{transform:translateY(0)}}
        @keyframes shutterOpen{0%{transform:translateY(0)}100%{transform:translateY(-100%)}}
        @keyframes shutterOpenBot{0%{transform:translateY(0)}100%{transform:translateY(100%)}}
      `}</style>



      <div style={{position:"relative",zIndex:2,textAlign:"center",userSelect:"none",display:"flex",flexDirection:"column",alignItems:"center",marginTop:-40}}>

        {/* Logo canvas */}
        <div style={{animation:"fadeUp 1s 0.2s both",position:"relative"}}>
          <canvas
            ref={logoCanvasRef}
            onClick={handleClick}
            style={{width:500,height:500,display:"block",cursor:phase==="idle"?"pointer":"default",filter:"drop-shadow(0 20px 80px rgba(0,120,255,0.6))"}}
          />
        </div>

        {/* PATCH wordmark */}
        <div style={{animation:"fadeUp 0.8s 0.5s both",marginTop:-30}}>
          <div style={{
            fontSize:"clamp(52px,8vw,96px)",
            fontWeight:900,
            letterSpacing:"0.12em",
            lineHeight:1,
            color:"#fff",
            fontFamily:"Inter,-apple-system,sans-serif",
            textTransform:"uppercase",
            textShadow:"0 0 40px rgba(0,100,255,0.3)",
          }}>
            PATCH
          </div>
        </div>

        {/* Subtitle */}
        <div style={{animation:"fadeUp 0.8s 0.7s both",marginTop:10,fontSize:12,color:"rgba(160,180,220,0.6)",letterSpacing:"0.2em",textTransform:"uppercase",fontFamily:"Inter,sans-serif",fontWeight:500}}>
          AI Security. Real-World Protection.
        </div>

        {/* Active badge */}
        <div style={{animation:"fadeUp 0.8s 0.9s both",marginTop:20}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 18px",border:"1px solid rgba(0,150,255,0.3)",borderRadius:999,background:"rgba(0,100,255,0.08)",backdropFilter:"blur(8px)"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#3b82f6",boxShadow:"0 0 8px #3b82f6",display:"inline-block",animation:"scanBlink 1.2s infinite"}}/>
            <span style={{fontSize:10,color:"rgba(100,180,255,0.8)",letterSpacing:"0.2em",fontFamily:"Inter,sans-serif",textTransform:"uppercase",fontWeight:600}}>
              Threat Intelligence Active
            </span>
          </div>
        </div>

        {/* Click hint */}
        {ready && (
          <div style={{animation:"fadeUp 0.8s 1.2s both",marginTop:24,fontSize:10,color:"rgba(255,255,255,0.15)",letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"Inter,sans-serif"}}>
            Click logo to enter
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewPage({ dashboardState, scanState = "idle", handleRunScan = () => {} }) {
  const findings = dashboardState?.findings ?? [];
  const proposals = dashboardState?.fixProposals ?? [];
  const policyEvents = dashboardState?.policyEvents ?? [];
  const [tick, setTick] = useState(0);
  const [activityLog, setActivityLog] = useState([
    { time: "now", msg: "Agent initialized", color: "#3b82f6" },
    { time: "2s ago", msg: "Policy engine loaded", color: "#3b82f6" },
    { time: "5s ago", msg: "Database connected · patch.db", color: "#22c55e" },
    { time: "8s ago", msg: "NIM endpoint verified", color: "#22c55e" },
    { time: "12s ago", msg: "Nemotron-Super-120B · ready", color: "#3b82f6" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scanState === "scanning") {
      setActivityLog(l => [{ time: "now", msg: "Running scan on demo-repo-fast/", color: "#f59e0b" }, ...l.slice(0,7)]);
    }
    if (scanState === "done") {
      setActivityLog(l => [{ time: "now", msg: `Scan complete · ${findings.length} findings persisted`, color: "#22c55e" }, ...l.slice(0,7)]);
    }
  }, [scanState]);

  const critCount = findings.filter(f=>f.severity==="critical").length;
  const highCount = findings.filter(f=>f.severity==="high").length;
  const medCount = findings.filter(f=>f.severity==="medium"||f.severity==="low").length;

  return (
    <div className="page">
      <style>{`
        @keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}
        @keyframes bar-fill{from{width:0}to{width:var(--w)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scan-line{0%{top:0}100%{top:100%}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:20}}>
          <div>
            <div className="page-title">Overview</div>
            <div className="page-sub">Autonomous threat detection · Nemotron-Super-120B · Brev A100</div>
          </div>
          <button className="btn-primary" onClick={handleRunScan} disabled={scanState==="scanning"} type="button" style={{marginTop:4,whiteSpace:"nowrap",flexShrink:0}}>
            {scanState==="scanning"?"Scanning...":scanState==="done"?"Scan Again":"Run Scan"}
          </button>
        </div>
        {scanState==="scanning"&&<div className="notice notice-load" style={{marginTop:12}}><strong>Scanning demo-repo-fast/</strong><p>Nemotron is analyzing your codebase. This takes about 2 minutes...</p></div>}
        {scanState==="error"&&<div className="notice notice-err" style={{marginTop:12}}><strong>Scan failed</strong><p>Check that the scanner is configured correctly on Brev.</p></div>}
        {scanState==="done"&&<div className="notice notice-ok" style={{marginTop:12}}><strong>Scan complete</strong><p>Findings refreshed from patch.db.</p></div>}
      </div>

      {/* Top stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Total Findings",val:findings.length,color:"#3b82f6",sub:"active threats"},
          {label:"Fix Proposals",val:proposals.length,color:"#22c55e",sub:"ready to commit"},
          {label:"Policy Blocks",val:policyEvents.filter(e=>e.verdict==="block").length,color:"#f59e0b",sub:"gated actions"},
          {label:"Agent Status",val:"LIVE",color:"#22c55e",sub:"nemotron-super"},
        ].map((s,i)=>(
          <div key={i} className="stat" style={{animation:`fadeIn 0.4s ${i*0.1}s both`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:s.color,boxShadow:`0 0 6px ${s.color}`,animation:"pulse-dot 2s infinite"}}/>
              <span style={{fontSize:10,color:"var(--muted2)",letterSpacing:"0.08em",textTransform:"uppercase"}}>{s.label}</span>
            </div>
            <div style={{fontSize:32,fontWeight:800,color:s.color,lineHeight:1,fontFamily:"Inter,sans-serif"}}>{s.val}</div>
            <div style={{fontSize:10,color:"var(--muted2)",marginTop:4}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Middle row: severity breakdown + activity log */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>

        {/* Severity breakdown */}
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:10,color:"var(--muted2)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:16}}>Severity Breakdown</div>
          {[
            {label:"Critical",count:critCount,total:Math.max(findings.length,1),color:"#ef4444"},
            {label:"High",count:highCount,total:Math.max(findings.length,1),color:"#f59e0b"},
            {label:"Medium / Low",count:medCount,total:Math.max(findings.length,1),color:"#3b82f6"},
          ].map((b,i)=>(
            <div key={i} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.7)"}}>{b.label}</span>
                <span style={{fontSize:12,color:b.color,fontWeight:700}}>{b.count}</span>
              </div>
              <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",background:b.color,width:`${(b.count/b.total)*100}%`,borderRadius:2,transition:"width 1s ease",boxShadow:`0 0 8px ${b.color}`}}/>
              </div>
            </div>
          ))}

          {/* NIM usage */}
          <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:10,color:"var(--muted2)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>Model Pipeline</div>
            {[
              {label:"Detection",model:"Nemotron-Super-120B",status:"active"},
              {label:"Fix Proposer",model:"Nemotron-Super-120B",status:"active"},
              {label:"Policy Engine",model:"NemoClaw rules",status:"enforcing"},
            ].map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>{m.label}</div>
                  <div style={{fontSize:10,color:"var(--muted2)",fontFamily:'"SF Mono",monospace'}}>{m.model}</div>
                </div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:4,background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)",letterSpacing:"0.08em"}}>{m.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live activity log */}
        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px #22c55e",animation:"pulse-dot 1s infinite"}}/>
            <span style={{fontSize:10,color:"var(--muted2)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Live Activity</span>
          </div>
          <div style={{fontFamily:'"SF Mono",ui-monospace,monospace',fontSize:11}}>
            {activityLog.map((entry,i)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:10,opacity:1-i*0.12,animation:`fadeIn 0.3s ${i*0.05}s both`}}>
                <span style={{color:"var(--muted2)",flexShrink:0,minWidth:50}}>{entry.time}</span>
                <span style={{color:i===0?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.5)"}}>{entry.msg}</span>
                {i===0&&<span style={{width:6,height:6,borderRadius:"50%",background:entry.color,flexShrink:0,marginTop:3,animation:"blink 1s infinite"}}/>}
              </div>
            ))}
          </div>
          {/* Uptime */}
          <div style={{marginTop:"auto",paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:10,color:"var(--muted2)"}}>Uptime</span>
            <span style={{fontSize:10,color:"#22c55e",fontFamily:'"SF Mono",monospace'}}>
              {String(Math.floor(tick/3600)).padStart(2,"0")}:{String(Math.floor((tick%3600)/60)).padStart(2,"0")}:{String(tick%60).padStart(2,"0")}
            </span>
          </div>
        </div>
      </div>

      {/* Findings list */}
      <div className="section-label">Active Findings</div>
      {findings.length===0&&(
        <div className="card" style={{textAlign:"center",padding:32,color:"var(--muted2)"}}>
          No findings yet — run a scan to detect vulnerabilities.
        </div>
      )}
      {findings.map((f,i) => (
        <div className="card" key={f.finding_id} style={{borderColor:f.severity==="critical"?"rgba(239,68,68,0.25)":f.severity==="high"?"rgba(245,158,11,0.2)":"rgba(59,130,246,0.15)",animation:`fadeIn 0.4s ${i*0.08}s both`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
            <span className={`sev sev-${f.severity}`}>{f.severity}</span>
            <span className="card-title">{f.category.replace(/_/g," ")}</span>
            <span style={{marginLeft:"auto",fontSize:10,color:"var(--muted2)",fontFamily:'"SF Mono",monospace'}}>{f.cwe}</span>
          </div>
          <div className="card-sub">{f.description}</div>
          <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:"var(--muted2)",fontFamily:'"SF Mono",monospace'}}>
            <span>{f.file}:{f.line_start}</span>
            <span>confidence {Math.round(f.confidence*100)}%</span>
          </div>
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
        {stats.map(s => <div className="stat" key={s.label}><div className="stat-val">{s.value}</div><div className="stat-key">{s.label}</div></div>)}
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
  const [activePage, setActivePage] = useState("overview");
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
