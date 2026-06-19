import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000/api";

// ─── Fetch helper ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(API + path, opts);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("API error", path, e);
    return null;
  }
}

// ─── Design tokens ───────────────────────────────────────────────────────────
const TIER_COLOR = {
  Critical: { bg: "#2D0A0A", border: "#C0392B", text: "#FF6B6B", dot: "#E74C3C" },
  High:     { bg: "#2D1A00", border: "#C07C00", text: "#FFB347", dot: "#E67E22" },
  Medium:   { bg: "#0A1A2D", border: "#1A7ABF", text: "#64B5F6", dot: "#2196F3" },
  Low:      { bg: "#0A2D12", border: "#1A7A3A", text: "#81C784", dot: "#4CAF50"  },
};
const TIER_ORDER = ["Critical", "High", "Medium", "Low"];

// ─── Colour constants ─────────────────────────────────────────────────────────
const C = {
  bg:       "#0D0F14",
  surface:  "#13161D",
  border:   "#1E2330",
  text:     "#E2E8F0",
  muted:    "#64748B",
  accent:   "#3B82F6",
  accentDim:"#1E3A5F",
  red:      "#E74C3C",
  amber:    "#E67E22",
  green:    "#27AE60",
};

// ─── Reusable components ─────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "16px 18px", ...style
    }}>
      {children}
    </div>
  );
}

function Label({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      color: C.muted, textTransform: "uppercase", marginBottom: 6, ...style
    }}>
      {children}
    </div>
  );
}

function TierBadge({ tier }) {
  const t = TIER_COLOR[tier] || TIER_COLOR.Low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      padding: "2px 8px", borderRadius: 99,
      background: t.bg, border: `1px solid ${t.border}`, color: t.text,
    }}>
      {tier}
    </span>
  );
}

function KPI({ label, value, sub, color }) {
  return (
    <Card style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || C.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

function Spinner() {
  return (
    <div style={{ color: C.muted, fontSize: 12, padding: "24px 0", textAlign: "center" }}>
      Loading…
    </div>
  );
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────
function BarChart({ data, xKey, yKey, color = C.accent, height = 120 }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[yKey]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            title={`${d[xKey]}: ${d[yKey].toLocaleString()}`}
            style={{
              width: "100%", borderRadius: "3px 3px 0 0",
              background: color,
              height: `${Math.max(2, (d[yKey] / max) * (height - 20))}px`,
              cursor: "default", transition: "opacity .15s",
            }}
          />
          {data.length <= 8 && (
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2, whiteSpace: "nowrap" }}>
              {d[xKey]}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Heatmap grid ─────────────────────────────────────────────────────────────
function HeatGrid({ data, rowKey, cols }) {
  if (!data?.length) return null;
  const allVals = data.flatMap(r => cols.map(c => Number(r[c] || 0)));
  const max = Math.max(...allVals, 1);

  function cellColor(val) {
    const t = val / max;
    if (t > 0.75) return "#C0392B";
    if (t > 0.45) return "#E67E22";
    if (t > 0.20) return "#2196F3";
    if (t > 0.05) return "#1A3A5F";
    return "#13161D";
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ color: C.muted, textAlign: "left", padding: "4px 8px", fontWeight: 400, whiteSpace: "nowrap" }}>
              Junction
            </th>
            {cols.map(c => (
              <th key={c} style={{ color: C.muted, padding: "4px 6px", fontWeight: 400, whiteSpace: "nowrap" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              <td style={{
                color: C.text, padding: "5px 8px", whiteSpace: "nowrap",
                maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
                fontSize: 11,
              }}>
                {String(row[rowKey] || "").replace(/^BTP\d+ - /, "")}
              </td>
              {cols.map(c => {
                const v = Number(row[c] || 0);
                return (
                  <td key={c} title={`${c}: ${v.toLocaleString()}`} style={{
                    background: cellColor(v),
                    color: v > max * 0.2 ? "#fff" : C.muted,
                    padding: "5px 6px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderRadius: 3,
                  }}>
                    {v > 0 ? v.toLocaleString() : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Map placeholder (Folium link) ───────────────────────────────────────────
function MapPanel({ hotspots }) {
  if (!hotspots?.length) return <Spinner />;
  const tiers = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  hotspots.forEach(h => { if (tiers[h.risk_tier] !== undefined) tiers[h.risk_tier]++; });

  return (
    <div>
      <div style={{
        background: "#0A1520", borderRadius: 8, padding: 16,
        border: `1px solid ${C.border}`, marginBottom: 12,
        fontSize: 12, color: C.muted, textAlign: "center",
      }}>
        <div style={{ marginBottom: 8, color: C.text, fontWeight: 600 }}>
          Interactive Map
        </div>
        Open <code style={{ color: C.accent }}>models/02_interactive_heatmap.html</code> in
        your browser for the full Folium heatmap, or embed it below via iframe after running
        the pipeline.
        <div style={{ marginTop: 8 }}>
          <a
            href="./models/02_interactive_heatmap.html"
            target="_blank"
            rel="noreferrer"
            style={{
              color: C.accent, fontSize: 12,
              background: C.accentDim, padding: "5px 14px",
              borderRadius: 6, textDecoration: "none", display: "inline-block",
            }}
          >
            Open Heatmap →
          </a>
        </div>
      </div>

      {/* Cluster summary list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {hotspots.slice(0, 12).map((h, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: C.bg, borderRadius: 6, padding: "7px 10px",
            border: `1px solid ${TIER_COLOR[h.risk_tier]?.border || C.border}`,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: TIER_COLOR[h.risk_tier]?.dot || C.muted,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {String(h.top_junction || "Cluster " + (i + 1)).replace(/^BTP\d+ - /, "")}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>
                {h.centroid_lat?.toFixed(4)}, {h.centroid_lon?.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TIER_COLOR[h.risk_tier]?.text || C.text }}>
                {h.congestion_score?.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>score</div>
            </div>
            <TierBadge tier={h.risk_tier} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Live inference panel ────────────────────────────────────────────────────
function InferencePanel() {
  const [tab, setTab] = useState("severity");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [sevInput, setSevInput] = useState({
    total_violations: 8000, main_road_pct: 0.2, double_park_pct: 0.05,
    footpath_pct: 0.03, morning_peak_pct: 0.3, evening_peak_pct: 0.25,
    weekend_pct: 0.2, unique_vehicle_types: 5, approved_pct: 0.7,
    avg_lat: 12.972, avg_lon: 77.577,
  });

  const [zoneInput, setZoneInput] = useState({ lat: 12.972, lon: 77.577 });
  const [anomInput, setAnoInput] = useState({ daily_count: 800, daily_congestion: 2400, main_road_frac: 0.35, z_score: 3.5 });
  const [fcastInput, setFcastInput] = useState({ lag1: 120, lag2: 110, lag7: 95, roll3_mean: 108, roll7_mean: 105, dow: 1, month: 3 });

  async function runInference() {
    setLoading(true); setResult(null);
    let res;
    if (tab === "severity")  res = await apiFetch("/predict/severity",  { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(sevInput) });
    if (tab === "tier")      res = await apiFetch("/predict/tier",      { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(sevInput) });
    if (tab === "zone")      res = await apiFetch("/predict/zone",      { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(zoneInput) });
    if (tab === "anomaly")   res = await apiFetch("/predict/anomaly",   { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(anomInput) });
    if (tab === "forecast")  res = await apiFetch("/predict/forecast",  { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(fcastInput) });
    setResult(res); setLoading(false);
  }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
    color: C.text, fontSize: 12, padding: "5px 8px", width: "100%",
  };
  const rowStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 };

  return (
    <Card>
      <Label>Live Inference — Call Trained Models</Label>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {["severity","tier","zone","anomaly","forecast"].map(t => (
          <button key={t} onClick={() => { setTab(t); setResult(null); }} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${tab === t ? C.accent : C.border}`,
            background: tab === t ? C.accentDim : C.bg,
            color: tab === t ? C.accent : C.muted,
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {(tab === "severity" || tab === "tier") && (
        <div>
          <div style={rowStyle}>
            {["total_violations","main_road_pct","double_park_pct","morning_peak_pct"].map(k => (
              <div key={k}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{k.replace(/_/g," ")}</div>
                <input type="number" style={inputStyle} value={sevInput[k]}
                  onChange={e => setSevInput({...sevInput, [k]: parseFloat(e.target.value)})} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "zone" && (
        <div style={rowStyle}>
          {["lat","lon"].map(k => (
            <div key={k}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{k === "lat" ? "Latitude" : "Longitude"}</div>
              <input type="number" step="0.001" style={inputStyle} value={zoneInput[k]}
                onChange={e => setZoneInput({...zoneInput, [k]: parseFloat(e.target.value)})} />
            </div>
          ))}
        </div>
      )}

      {tab === "anomaly" && (
        <div style={rowStyle}>
          {Object.keys(anomInput).map(k => (
            <div key={k}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{k.replace(/_/g," ")}</div>
              <input type="number" step="0.01" style={inputStyle} value={anomInput[k]}
                onChange={e => setAnoInput({...anomInput, [k]: parseFloat(e.target.value)})} />
            </div>
          ))}
        </div>
      )}

      {tab === "forecast" && (
        <div style={rowStyle}>
          {Object.keys(fcastInput).map(k => (
            <div key={k}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{k.replace(/_/g," ")}</div>
              <input type="number" style={inputStyle} value={fcastInput[k]}
                onChange={e => setFcastInput({...fcastInput, [k]: parseFloat(e.target.value)})} />
            </div>
          ))}
        </div>
      )}

      <button onClick={runInference} disabled={loading} style={{
        marginTop: 4, padding: "7px 20px", borderRadius: 6, cursor: loading ? "wait" : "pointer",
        background: C.accent, border: "none", color: "#fff", fontWeight: 600, fontSize: 12,
      }}>
        {loading ? "Running…" : "Run Inference →"}
      </button>

      {result && (
        <div style={{
          marginTop: 12, background: C.bg, borderRadius: 6, padding: 12,
          border: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: 11, color: C.text,
        }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}

// ─── Priority grid panel ─────────────────────────────────────────────────────
function PriorityGrid({ data }) {
  if (!data?.length) return <Spinner />;
  const SLOT_COLS = ["00-04","04-08","08-12","12-16","16-20","20-24"];
  const present = SLOT_COLS.filter(c => c in data[0]);
  return <HeatGrid data={data} rowKey="junction_clean" cols={present.length ? present : SLOT_COLS} />;
}

// ─── Patrol zones panel ───────────────────────────────────────────────────────
function PatrolZones({ zones }) {
  if (!zones?.length) return <Spinner />;
  const max = Math.max(...zones.map(z => z.congestion_load || 0), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {zones.map((z, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: C.bg, borderRadius: 6, padding: "8px 10px",
          border: `1px solid ${C.border}`,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: C.accentDim, border: `2px solid ${C.accent}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: C.accent,
          }}>
            #{z.priority_rank}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                Zone {z.patrol_zone}
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>
                peak {z.peak_hour}:00h · {z.total_violations?.toLocaleString()} violations
              </span>
            </div>
            <div style={{
              height: 5, borderRadius: 3, background: C.border,
              overflow: "hidden",
            }}>
              <div style={{
                width: `${(z.congestion_load / max) * 100}%`,
                height: "100%", background: i < 3 ? C.red : i < 5 ? C.amber : C.accent,
                borderRadius: 3, transition: "width .4s",
              }} />
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
              {z.congestion_load?.toLocaleString()}
            </div>
            <div style={{ fontSize: 9, color: C.muted }}>load</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Anomaly panel ───────────────────────────────────────────────────────────
function AnomalyPanel({ anomalies }) {
  if (!anomalies?.length) return <Spinner />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {anomalies.slice(0, 10).map((a, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          background: C.bg, borderRadius: 6, padding: "7px 10px",
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 18, flexShrink: 0 }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.text }}>
              {String(a.junction_clean).replace(/^BTP\d+ - /, "")}
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              {a.date} · {a.daily_count?.toLocaleString()} violations · z={Number(a.z_score || 0).toFixed(2)}
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: (a.anomaly_score || 0) < -0.22 ? C.red : C.amber,
          }}>
            {Number(a.anomaly_score || 0).toFixed(3)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("overview");
  const [stats, setStats]       = useState(null);
  const [hotspots, setHotspots] = useState(null);
  const [grid, setGrid]         = useState(null);
  const [zones, setZones]       = useState(null);
  const [temporal, setTemporal] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [apiOk, setApiOk] = useState(null);

  const fetchAll = useCallback(async () => {
    const health = await apiFetch("/health");
    setApiOk(!!health);
    const [s, h, g, z, t, a] = await Promise.all([
      apiFetch("/stats"),
      apiFetch("/hotspots?limit=50"),
      apiFetch("/priority-grid?limit=15"),
      apiFetch("/patrol-zones"),
      apiFetch("/temporal"),
      apiFetch("/anomalies?limit=20"),
    ]);
    if (s) setStats(s);
    if (h) setHotspots(h.hotspots);
    if (g) setGrid(g.grid);
    if (z) setZones(z.zones);
    if (t) setTemporal(t);
    if (a) setAnomalies(a.anomalies);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const TABS = [
    { id: "overview",  label: "Overview"   },
    { id: "hotspots",  label: "Hotspots"   },
    { id: "priority",  label: "Priority Grid" },
    { id: "patrol",    label: "Patrol Zones" },
    { id: "anomalies", label: "Anomalies"  },
    { id: "inference", label: "Live Inference" },
  ];

  const s = { fontSize: 13, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" };

  const hourData = temporal?.hourly?.map(r => ({
    x: `${String(r.hour).padStart(2,"0")}h`,
    y: r.total || 0,
  })) || [];

  const dowData = temporal?.dow?.map(r => ({
    x: r.day_name || r.dow,
    y: r.total || 0,
  })) || [];

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13,
    }}>
      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "0 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 52,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🚔</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
            Parking Intelligence
          </span>
          <span style={{
            fontSize: 10, color: C.muted, background: C.bg,
            padding: "2px 8px", borderRadius: 99, border: `1px solid ${C.border}`,
          }}>
            Bengaluru · 2023–24
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: apiOk === null ? C.amber : apiOk ? C.green : C.red,
          }} />
          <span style={{ fontSize: 10, color: C.muted }}>
            {apiOk === null ? "Connecting…" : apiOk ? "API connected" : "API offline — run backend"}
          </span>
          <button onClick={fetchAll} style={{
            background: C.accentDim, border: `1px solid ${C.accent}`,
            color: C.accent, borderRadius: 6, padding: "4px 12px",
            fontSize: 11, cursor: "pointer", fontWeight: 600,
          }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "0 24px", display: "flex", gap: 0,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "none", border: "none",
            borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
            color: tab === t.id ? C.accent : C.muted,
            padding: "10px 14px", fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
            cursor: "pointer", transition: "all .15s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <KPI label="Total Violations" value={stats ? stats.total_violations.toLocaleString() : "—"} color={C.text} />
              <KPI label="Critical Junctions" value={stats?.n_critical ?? "—"} color={C.red} sub="severity_tier = Critical" />
              <KPI label="DBSCAN Clusters" value={stats?.n_clusters ?? "—"} color={C.amber} sub="hotspot zones" />
              <KPI label="Top Junction Score" value={stats ? stats.top_congestion_score.toLocaleString() : "—"} color={C.accent} sub={stats?.top_junction?.replace(/^BTP\d+ - /,"").slice(0,24)} />
            </div>

            {/* Temporal charts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <Label>Violations by Hour of Day</Label>
                <BarChart
                  data={hourData}
                  xKey="x" yKey="y"
                  color={C.accent} height={130}
                />
                <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
                  Note: 04–06h peak reflects patrol shift patterns, not true violation density.
                </div>
              </Card>
              <Card>
                <Label>Violations by Day of Week</Label>
                <BarChart data={dowData} xKey="x" yKey="y" color={C.amber} height={130} />
              </Card>
            </div>

            {/* Top junctions */}
            <Card>
              <Label>Top 10 Junctions by Congestion Score</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(grid || []).slice(0, 10).map((j, i) => {
                  const score = j.total_score || j.congestion_score || 0;
                  const maxScore = (grid?.[0]?.total_score || grid?.[0]?.congestion_score || 1);
                  const name = String(j.junction_clean || "").replace(/^BTP\d+ - /, "");
                  const tier = score > 8000 ? "Critical" : score > 3000 ? "High" : score > 1000 ? "Medium" : "Low";
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 0",
                      borderBottom: i < 9 ? `1px solid ${C.border}` : "none",
                    }}>
                      <span style={{ fontSize: 10, color: C.muted, width: 20, textAlign: "right" }}>
                        #{i + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: C.text }}>{name.slice(0, 45)}</span>
                          <TierBadge tier={tier} />
                        </div>
                        <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{
                            width: `${(score / maxScore) * 100}%`,
                            height: "100%",
                            background: TIER_COLOR[tier]?.dot || C.accent,
                            borderRadius: 2,
                          }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 60, textAlign: "right" }}>
                        {Number(score).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ── HOTSPOTS ── */}
        {tab === "hotspots" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            <Card>
              <Label>DBSCAN Cluster Map</Label>
              <MapPanel hotspots={hotspots} />
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card>
                <Label>Cluster tier distribution</Label>
                {hotspots ? (() => {
                  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
                  hotspots.forEach(h => { if (counts[h.risk_tier] !== undefined) counts[h.risk_tier]++; });
                  const total = hotspots.length;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {TIER_ORDER.map(t => (
                        <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 60, fontSize: 11, color: TIER_COLOR[t].text }}>{t}</span>
                          <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                            <div style={{
                              width: `${(counts[t] / total) * 100}%`,
                              height: "100%", background: TIER_COLOR[t].dot, borderRadius: 4,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: C.muted, width: 30, textAlign: "right" }}>{counts[t]}</span>
                        </div>
                      ))}
                    </div>
                  );
                })() : <Spinner />}
              </Card>
              <Card>
                <Label>Model performance</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    ["Severity model R²",    "0.959"],
                    ["Severity model MAE",   "294 congestion units"],
                    ["Tier classifier CV",   "97.6% accuracy"],
                    ["Forecaster MAE",       "10.8 violations/day"],
                    ["Forecaster R²",        "0.948"],
                    ["Validation F1",        "0.634 (imbalanced)"],
                    ["K-Means silhouette",   "0.50"],
                    ["Anomaly contamination","5.0%"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, paddingBottom: 5 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>{k}</span>
                      <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ── PRIORITY GRID ── */}
        {tab === "priority" && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <Label>Enforcement Priority Matrix — Junction × Time Slot</Label>
                <div style={{ fontSize: 11, color: C.muted }}>
                  Congestion-weighted violation score per 4-hour patrol window. Red = highest urgency.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                {[["#C0392B","Critical"], ["#E67E22","High"], ["#2196F3","Medium"]].map(([c, l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
                    <span style={{ color: C.muted }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <PriorityGrid data={grid} />
          </Card>
        )}

        {/* ── PATROL ZONES ── */}
        {tab === "patrol" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            <Card>
              <Label>K-Means Patrol Zone Assignments (priority ranked)</Label>
              <PatrolZones zones={zones} />
            </Card>
            <Card>
              <Label>Zone deployment guide</Label>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
                <p style={{ marginBottom: 10 }}>
                  Each zone is sized by congestion load, not geography. Deploy officers to zones in priority order.
                </p>
                {(zones || []).slice(0, 5).map((z, i) => (
                  <div key={i} style={{
                    background: C.bg, borderRadius: 6, padding: "8px 10px",
                    marginBottom: 6, border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontWeight: 600, color: C.text, marginBottom: 3 }}>
                      Zone {z.patrol_zone} — Priority #{z.priority_rank}
                    </div>
                    <div>Centroid: {Number(z.centroid_lat).toFixed(4)}, {Number(z.centroid_lon).toFixed(4)}</div>
                    <div>Peak hour: {z.peak_hour}:00 · Load: {Number(z.congestion_load).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── ANOMALIES ── */}
        {tab === "anomalies" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <Label>Isolation Forest — Flagged Anomalous Days</Label>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
                Days where violation count was statistically anomalous vs. 7-day rolling baseline.
              </div>
              <AnomalyPanel anomalies={anomalies} />
            </Card>
            <Card>
              <Label>Anomaly interpretation</Label>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
                <div style={{ marginBottom: 10 }}>
                  The Isolation Forest flags junction-days where the combination of
                  daily count, congestion, main-road fraction, and z-score deviates
                  significantly from baseline.
                </div>
                <div style={{ background: C.bg, borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Score interpretation</div>
                  <div>Below −0.22 → High anomaly (event / spike)</div>
                  <div>−0.22 to −0.18 → Medium anomaly</div>
                  <div>Above −0.18 → Normal variation</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Why "No Junction" dominates</div>
                  <div>
                    Violations without named junctions aggregate into a single bucket, making its
                    daily counts higher and more variable than any individual named junction.
                    Treat those dates as city-wide event indicators.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── INFERENCE ── */}
        {tab === "inference" && (
          <div style={{ maxWidth: 680 }}>
            <InferencePanel />
            <div style={{ marginTop: 12, fontSize: 11, color: C.muted }}>
              All inputs use default values matching a typical high-risk junction.
              Adjust sliders and re-run to explore model behaviour.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
