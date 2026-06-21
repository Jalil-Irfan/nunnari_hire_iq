import { useState, useEffect, useCallback, useMemo, ChangeEvent, useRef } from 'react';
import './App.css';

/* ─── Types ─────────────────────────────────────────────── */
interface JobResult {
  parsed_name: string;
  skills: string[];
  skill_annotations?: Record<string, string>;
  note: string;
  evaluation?: { score: number; reasoning: string };
  metrics?: { token_usage: number; processing_time_sec: number };
}

interface JobState {
  jobId: string;
  filename: string;
  status: 'processing' | 'completed' | 'error' | 'stopped';
  result: JobResult | null;
  errorMessage?: string;
  progressStep: number;
  logs: string[];
  pdfUrl?: string; // memoized blob URL
}

const STEPS = ["Parsing", "Vectorizing", "Extracting", "Evaluating", "Done"];

const PREDEFINED_JDS: { label: string; icon: string; value: string }[] = [
  { label: "UI Developer", icon: "layout", value: "Seeking a passionate UI Developer to build sleek, modern web applications. Must be highly proficient in React, CSS, and modern frontend frameworks. Experience translating Figma designs into code is beneficial." },
  { label: "Backend Engineer", icon: "server", value: "Looking for a Backend Python Engineer experienced in FastAPI, async programming, and microservices architecture. Strong knowledge of PostgreSQL, Redis, and building scalable REST APIs is required." },
  { label: "Data Scientist", icon: "brain", value: "Hiring a Data Scientist to build and deploy generative AI models. Experience with PyTorch, HuggingFace, LangChain, and vector databases like ChromaDB is required." },
  { label: "DevOps Engineer", icon: "terminal", value: "Seeking a DevOps Engineer skilled in Docker, Kubernetes, CI/CD pipelines, Terraform, and cloud platforms (AWS/GCP). Experience with monitoring tools like Grafana and Prometheus is a plus." },
];

/* ─── SVG Icons (Inline) ─────────────────────────────────── */
const Icons = {
  upload: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  sparkles: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>,
  clock: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  coins: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/></svg>,
  chevDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  eye: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  zap: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  layout: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  server: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  brain: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
  terminal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  arrowRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const iconMap: Record<string, JSX.Element> = {
  layout: Icons.layout, server: Icons.server, brain: Icons.brain, terminal: Icons.terminal,
};

/* ─── Score Ring SVG Component ─────────────────────────── */
function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="score-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fill={color} fontSize={size > 40 ? 14 : 11} fontWeight="700">{score}%</text>
    </svg>
  );
}

/* ─── App ───────────────────────────────────────────────── */
function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [jd, setJd] = useState('');
  const [jdPrompt, setJdPrompt] = useState('');
  const [isGeneratingJd, setIsGeneratingJd] = useState(false);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [evalMode, setEvalMode] = useState<'deterministic' | 'agentic'>('deterministic');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  const fmt = (b: number) => {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B','KB','MB'][i];
  };

  /* ── File Management ─── */
  const onFiles = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setGlobalError(null);
    if (!e.target.files) return;
    const valid = Array.from(e.target.files).filter(f => {
      if (f.type !== 'application/pdf') { setGlobalError('Only PDF files.'); return false; }
      if (f.size > 5 * 1024 * 1024) { setGlobalError('Max 5 MB.'); return false; }
      return true;
    });
    setFiles(p => [...p, ...valid]);
  }, []);

  const removeFile = useCallback((i: number) => setFiles(f => f.filter((_, idx) => idx !== i)), []);

  const previewFile = useCallback((file: File) => {
    setPreviewPdfUrl(URL.createObjectURL(file));
    setDrawerJobId(null); // close any job drawer
  }, []);

  const clearAll = useCallback(() => {
    eventSourcesRef.current.forEach(s => s.close());
    eventSourcesRef.current.clear();
    setFiles([]);
    setJd('');
    setJdPrompt('');
    setJobs([]);
    setGlobalError(null);
    setDrawerJobId(null);
    setPreviewPdfUrl(null);
    setExpandedLogs(new Set());
  }, []);

  /* ── AI JD Generator ─── */
  const generateJD = useCallback(async () => {
    if (!jdPrompt.trim()) return;
    setIsGeneratingJd(true);
    try {
      const res = await fetch('http://localhost:8000/generate-jd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: jdPrompt }),
      });
      const d = await res.json();
      if (d.jd) setJd(d.jd);
      else if (d.error) setGlobalError(d.error);
    } catch { setGlobalError('AI offline.'); }
    finally { setIsGeneratingJd(false); }
  }, [jdPrompt]);

  /* ── Upload & Evaluate ─── */
  const handleUpload = useCallback(async () => {
    if (!files.length || !jd.trim()) return;
    setGlobalError(null);
    setJobs([]);
    setDrawerJobId(null);

    const batch: JobState[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('jd', jd);
      fd.append('mode', evalMode);
      try {
        const r = await (await fetch('http://localhost:8000/upload', { method: 'POST', body: fd })).json();
        if (r.error) {
          batch.push({ jobId: `e-${Math.random()}`, filename: file.name, status: 'error', result: null, errorMessage: r.error, progressStep: 0, logs: [] });
        } else {
          batch.push({ jobId: r.job_id, filename: file.name, status: 'processing', result: null, progressStep: 0, logs: ['Queued...'], pdfUrl: URL.createObjectURL(file) });
        }
      } catch { setGlobalError('Connection failed.'); }
    }
    setJobs(batch);
  }, [files, jd]);

  const handleStop = useCallback(() => {
    eventSourcesRef.current.forEach(s => s.close());
    eventSourcesRef.current.clear();
    setJobs(j => j.map(x => x.status === 'processing' ? { ...x, status: 'stopped', errorMessage: 'Cancelled.' } : x));
  }, []);

  /* ── SSE Streaming ─── */
  useEffect(() => {
    jobs.filter(j => j.status === 'processing').forEach(job => {
      if (eventSourcesRef.current.has(job.jobId)) return;
      const src = new EventSource(`http://localhost:8000/stream/${job.jobId}`);
      eventSourcesRef.current.set(job.jobId, src);

      src.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        setJobs(prev => prev.map(j => {
          if (j.jobId !== job.jobId) return j;
          if (d.type === 'progress') {
            const stepMap: Record<string, number> = { parse: 0, embed: 1, extract: 2, evaluate: 3 };
            return { ...j, progressStep: stepMap[d.node] ?? j.progressStep, logs: [...j.logs, d.message] };
          }
          if (d.type === 'completed') {
            src.close(); eventSourcesRef.current.delete(job.jobId);
            return { ...j, status: 'completed', progressStep: 4, result: d.result, logs: [...j.logs, `Done in ${d.result.metrics?.processing_time_sec}s`] };
          }
          if (d.type === 'error') {
            src.close(); eventSourcesRef.current.delete(job.jobId);
            return { ...j, status: 'error', errorMessage: d.error, logs: [...j.logs, `ERROR: ${d.error}`] };
          }
          return j;
        }));
      };
      src.onerror = () => { src.close(); eventSourcesRef.current.delete(job.jobId); };
    });
  }, [jobs]);

  /* ── Derived State ─── */
  const isProcessing = jobs.some(j => j.status === 'processing');
  const completed = useMemo(() => jobs.filter(j => j.status === 'completed' && j.result).sort((a, b) => (b.result!.evaluation?.score || 0) - (a.result!.evaluation?.score || 0)), [jobs]);
  const drawerJob = jobs.find(j => j.jobId === drawerJobId);

  const kpis = useMemo(() => {
    const c = completed.length;
    const avgScore = c ? Math.round(completed.reduce((s, j) => s + (j.result!.evaluation?.score || 0), 0) / c) : 0;
    const totalTokens = completed.reduce((s, j) => s + (j.result!.metrics?.token_usage || 0), 0);
    const avgTime = c ? (completed.reduce((s, j) => s + (j.result!.metrics?.processing_time_sec || 0), 0) / c).toFixed(1) : '0';
    return { total: jobs.length, completed: c, avgScore, totalTokens, avgTime };
  }, [jobs, completed]);

  const toggleLogs = useCallback((id: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ── CSV Export ─── */
  const exportCSV = useCallback(() => {
    if (!completed.length) return;
    let csv = "data:text/csv;charset=utf-8,Name,File,Score,Time(s),Tokens,Skills,Reasoning\n";
    completed.forEach(j => {
      const r = j.result!;
      csv += `"${r.parsed_name}","${j.filename}",${r.evaluation?.score || 0},${r.metrics?.processing_time_sec || 0},${r.metrics?.token_usage || 0},"${r.skills.join('; ')}","${(r.evaluation?.reasoning || '').replace(/"/g, '""')}"\n`;
    });
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = 'HireIQ_Shortlist.csv';
    a.click();
  }, [completed]);

  /* ─── Render ──────────────────────────────────────────── */
  return (
    <div className="app">
      {/* ─── Topbar ─── */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark" />
          <span className="logo-text">HireIQ</span>
          <span className="version-tag">v3</span>
        </div>
        <div className="topbar-right">
          {isProcessing && <span className="live-dot" />}
          {isProcessing && <span className="live-text">Streaming</span>}
        </div>
      </header>

      {globalError && <div className="toast">{globalError}<button onClick={() => setGlobalError(null)}>{Icons.x}</button></div>}

      {/* ─── Main Layout ─── */}
      <main className="main">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          {/* Upload Section */}
          <section className="sb-section">
            <label className="sb-label">Resumes</label>
            <div className="drop-area" onClick={() => fileInputRef.current?.click()}>
              <input type="file" multiple accept="application/pdf" ref={fileInputRef} onChange={onFiles} hidden />
              {Icons.upload}
              <span>Upload PDFs</span>
            </div>
            {files.length > 0 && (
              <div className="file-chips">
                {files.map((f, i) => (
                  <div key={i} className="chip">
                    {Icons.file}
                    <span className="chip-name clickable" onClick={() => previewFile(f)}>{f.name}</span>
                    <span className="chip-sz">{fmt(f.size)}</span>
                    <button className="chip-x" onClick={() => removeFile(i)}>{Icons.x}</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* JD Section */}
          <section className="sb-section grow">
            <label className="sb-label">Job Description</label>
            <div className="template-grid">
              {PREDEFINED_JDS.map((t, i) => (
                <button key={i} className={`tpl-btn ${jd === t.value ? 'active' : ''}`} onClick={() => setJd(t.value)}>
                  {iconMap[t.icon]}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div className="ai-row">
              <input className="ai-input" placeholder="Describe role for AI..." value={jdPrompt} onChange={e => setJdPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateJD()} />
              <button className="ai-trigger" onClick={generateJD} disabled={isGeneratingJd || !jdPrompt.trim()}>
                {isGeneratingJd ? <span className="spin-sm" /> : Icons.sparkles}
              </button>
            </div>

            <textarea className="jd-area" placeholder="Paste or generate a Job Description..." value={jd} onChange={e => setJd(e.target.value)} />
          </section>

          {/* Action */}
          <div className="sb-actions">
            
            {/* Mode Toggle */}
            <div className="mode-toggle">
              <span className={`mode-label ${evalMode === 'deterministic' ? 'active' : ''}`} onClick={() => setEvalMode('deterministic')}>Deterministic</span>
              <div className="toggle-track" onClick={() => setEvalMode(m => m === 'deterministic' ? 'agentic' : 'deterministic')}>
                <div className={`toggle-thumb ${evalMode}`} />
              </div>
              <span className={`mode-label ${evalMode === 'agentic' ? 'active' : ''}`} onClick={() => setEvalMode('agentic')}>Agentic ✨</span>
            </div>

            <button className={`eval-btn ${isProcessing ? 'pulsing' : ''}`} onClick={handleUpload} disabled={!files.length || !jd.trim() || isProcessing}>
              {isProcessing ? <><span className="spin-sm" /> Evaluating...</> : <>{Icons.zap} Evaluate</>}
            </button>
            {isProcessing && <button className="stop-btn" onClick={handleStop}>Stop</button>}
            {(files.length > 0 || jobs.length > 0) && <button className="stop-btn" onClick={clearAll}>Clear All</button>}
          </div>
        </aside>

        {/* ── Content ── */}
        <div className="content">
          {/* KPI Strip */}
          {jobs.length > 0 && (
            <div className="kpi-strip">
              <div className="kpi"><span className="kpi-val">{kpis.total}</span><span className="kpi-label">Uploaded</span></div>
              <div className="kpi"><span className="kpi-val">{kpis.completed}</span><span className="kpi-label">Evaluated</span></div>
              <div className="kpi"><span className="kpi-val">{kpis.avgScore}%</span><span className="kpi-label">Avg Score</span></div>
              <div className="kpi"><span className="kpi-val">{kpis.avgTime}s</span><span className="kpi-label">Avg Time</span></div>
              <div className="kpi"><span className="kpi-val">{kpis.totalTokens}</span><span className="kpi-label">Tokens</span></div>
              {completed.length > 0 && <button className="export-btn" onClick={exportCSV}>{Icons.download} CSV</button>}
            </div>
          )}

          {/* Processing Cards */}
          {jobs.filter(j => j.status === 'processing').length > 0 && (
            <div className="section-block">
              <div className="section-title">Processing</div>
              <div className="proc-cards">
                {jobs.filter(j => j.status === 'processing').map(j => (
                  <div key={j.jobId} className="proc-card">
                    <div className="proc-top">
                      <span className="spin-sm" />
                      <span className="proc-file">{j.filename}</span>
                      <button className="log-toggle" onClick={() => toggleLogs(j.jobId)}>{Icons.terminal}</button>
                    </div>
                    <div className="mini-bar"><div className="mini-fill" style={{ width: `${(j.progressStep / 4) * 100}%` }} /></div>
                    <div className="step-dots">
                      {STEPS.map((s, i) => (
                        <span key={i} className={`dot ${i < j.progressStep ? 'done' : i === j.progressStep ? 'active' : ''}`}>{s}</span>
                      ))}
                    </div>
                    {expandedLogs.has(j.jobId) && (
                      <div className="inline-term">
                        {j.logs.map((l, i) => <div key={i}>{l}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Cards */}
          {jobs.filter(j => j.status === 'error' || j.status === 'stopped').map(j => (
            <div key={j.jobId} className="err-card">
              <strong>{j.filename}</strong> — {j.errorMessage}
            </div>
          ))}

          {/* Results Table */}
          {completed.length > 0 && (
            <div className="section-block">
              <div className="section-title">Results</div>
              <div className="results-grid">
                {completed.map((j, idx) => {
                  const s = j.result!.evaluation?.score || 0;
                  return (
                    <div key={j.jobId} className="result-row" onClick={() => setDrawerJobId(j.jobId)}>
                      <span className="rank">#{idx + 1}</span>
                      <ScoreRing score={s} size={44} />
                      <div className="result-info">
                        <div className="result-name">{j.result!.parsed_name}</div>
                        <div className="result-file">{j.filename}</div>
                      </div>
                      <div className="result-skills">
                        {j.result!.skills.slice(0, 4).map((sk, i) => <span key={i} className="pill">{sk}</span>)}
                      </div>
                      <div className="result-meta">
                        <span>{Icons.clock} {j.result!.metrics?.processing_time_sec}s</span>
                        <span>{Icons.coins} {j.result!.metrics?.token_usage}</span>
                      </div>
                      <button className="view-btn" onClick={(e) => { e.stopPropagation(); setDrawerJobId(j.jobId); }}>{Icons.eye} Details</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {jobs.length === 0 && (
            <div className="empty">
              <div className="empty-icon">{Icons.zap}</div>
              <h2>Ready to Evaluate</h2>
              <p>Upload resumes and provide a job description to begin AI-powered screening.</p>
            </div>
          )}
        </div>
      </main>

      {/* ─── Detail Drawer ─── */}
      <div className={`drawer-overlay ${(drawerJob || previewPdfUrl) ? 'open' : ''}`} onClick={() => { setDrawerJobId(null); setPreviewPdfUrl(null); }} />
      <div className={`drawer ${(drawerJob || previewPdfUrl) ? 'open' : ''}`}>

        {/* Preview-only mode (from chip click) */}
        {!drawerJob && previewPdfUrl && (
          <>
            <div className="drawer-head">
              <div><h2>Resume Preview</h2></div>
              <button className="drawer-close" onClick={() => setPreviewPdfUrl(null)}>{Icons.close}</button>
            </div>
            <div className="drawer-pdf full">
              <iframe src={previewPdfUrl} title="PDF Preview" />
            </div>
          </>
        )}

        {/* Detail mode (from result click) */}
        {drawerJob && (
          <>
            <div className="drawer-head">
              <div>
                <h2>{drawerJob.result?.parsed_name || 'Processing...'}</h2>
                <span className="drawer-file">{drawerJob.filename}</span>
              </div>
              <button className="drawer-close" onClick={() => setDrawerJobId(null)}>{Icons.close}</button>
            </div>

            {drawerJob.result && (
              <div className="drawer-body">
                <div className="drawer-score-row">
                  <ScoreRing score={drawerJob.result.evaluation?.score || 0} size={72} />
                  <div className="drawer-metrics">
                    <div className="dm"><span className="dm-val">{drawerJob.result.evaluation?.score || 0}%</span><span className="dm-label">Match</span></div>
                    <div className="dm"><span className="dm-val">{drawerJob.result.metrics?.processing_time_sec}s</span><span className="dm-label">Time</span></div>
                    <div className="dm"><span className="dm-val">{drawerJob.result.metrics?.token_usage}</span><span className="dm-label">Tokens</span></div>
                  </div>
                </div>

                <div className="drawer-section">
                  <h4>AI Reasoning</h4>
                  <p className="reasoning-text">{drawerJob.result.evaluation?.reasoning}</p>
                </div>

                <div className="drawer-section">
                  <h4>Extracted Skills & Evidence</h4>
                  <div className="skill-annotations">
                    {drawerJob.result.skills.map((s, i) => (
                      <div key={i} className="annotation-row">
                        <span className="annotation-skill">{s}</span>
                        <span className="annotation-evidence">
                          {drawerJob.result!.skill_annotations?.[s] || 'No annotation available'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {drawerJob.result.note?.includes('Fallback') && (
                  <div className="fallback-banner">{drawerJob.result.note}</div>
                )}

                {/* Logs Accordion */}
                <details className="drawer-details">
                  <summary>Pipeline Logs</summary>
                  <div className="drawer-term">
                    {drawerJob.logs.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </details>

                {/* Responsible AI Disclaimer */}
                <div className="rai-banner">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <div>
                    <strong>AI-Generated Content</strong>
                    <p>This evaluation was produced by a local LLM (Llama 3.2). Scores, skill extraction, and reasoning are machine-generated and may contain inaccuracies. Always verify results with human judgement before making hiring decisions.</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
