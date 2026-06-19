// dashboard/src/App.jsx  
import { useCallback, useEffect, useMemo, useState } from "react";  
  
const API = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";  
const MAP_HTML = "./models/02_interactive_heatmap.html";  
  
const NAV_ITEMS = [  
  ["overview", "Overview"],  
  ["heatmap", "Heatmap"],  
  ["priority", "Priority"],  
  ["anomalies", "Anomalies"],  
  ["models", "Models"],  
];  
  
const TIER_ORDER = ["All", "Critical", "High", "Medium", "Low"];  
  
const TIER_COLOR = {  
  Critical: { bg: "#FFF1F1", border: "#F3B0B0", text: "#B42318", dot: "#EF4444" },  
  High:     { bg: "#FFF7ED", border: "#F7C58B", text: "#A85500", dot: "#F97316" },  
  Medium:   { bg: "#EEF6FF", border: "#A9CCF7", text: "#2C6CB3", dot: "#3B82F6" },  
  Low:      { bg: "#ECFDF3", border: "#A7E3B0", text: "#23764A", dot: "#22C55E" },  
};  
  
const THEMES = {  
  light: {  
    page: "#F4FAFF",  
    page2: "#ECF5FF",  
    surface: "#FFFFFF",  
    surface2: "#F8FBFF",  
    border: "#D7E6F4",  
    border2: "#B9D7F2",  
    text: "#0B1B2B",  
    muted: "#60738A",  
    muted2: "#7F93A8",  
    accent: "#2F7DFF",  
    accent2: "#66B8FF",  
    accentSoft: "#E7F3FF",  
    deep: "#0D2340",  
    deep2: "#102B4A",  
    shadow: "0 14px 38px rgba(47, 125, 255, 0.10)",  
    hero: "linear-gradient(135deg, #EAF6FF 0%, #D8ECFF 100%)",  
  },  
  dark: {  
    page: "#06111F",  
    page2: "#091628",  
    surface: "#0B1728",  
    surface2: "#10263D",  
    border: "#20374F",  
    border2: "#2C4D6D",  
    text: "#EAF2FF",  
    muted: "#8EA6BE",  
    muted2: "#A9BFD5",  
    accent: "#66B8FF",  
    accent2: "#9AD9FF",  
    accentSoft: "#102B48",  
    deep: "#081423",  
    deep2: "#0D2340",  
    shadow: "0 18px 46px rgba(0, 0, 0, 0.34)",  
    hero: "linear-gradient(135deg, #0D2340 0%, #102B4A 100%)",  
  },  
};  
  
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
  
function pickList(payload, keys = ["data", "rows", "hotspots", "clusters", "grid", "priority", "anomalies"]) {  
  if (!payload) return [];  
  if (Array.isArray(payload)) return payload;  
  for (const key of keys) {  
    if (Array.isArray(payload[key])) return payload[key];  
  }  
  return [];  
}  
  
function toNum(v) {  
  const n = Number(v);  
  return Number.isFinite(n) ? n : 0;  
}  
  
function formatNumber(v) {  
  const n = Number(v);  
  if (!Number.isFinite(n)) return "—";  
  return new Intl.NumberFormat("en-IN").format(n);  
}  
  
function formatFloat(v, digits = 2) {  
  const n = Number(v);  
  if (!Number.isFinite(n)) return "—";  
  return n.toFixed(digits);  
}  
  
function cleanName(v) {  
  const s = String(v ?? "").replace(/^BTP\d+\s*-\s*/i, "").trim();  
  return s || "Unnamed";  
}  
  
function scoreOf(row = {}) {  
  return toNum(  
    row.congestion_score ??  
      row.congestion_rank_score ??  
      row.priority_score ??  
      row.total_score ??  
      row.score ??  
      row.value  
  );  
}  
  
function tierOf(row = {}) {  
  const explicit = row.risk_tier ?? row.risk_level;  
  if (explicit && TIER_COLOR[explicit]) return explicit;  
  const score = scoreOf(row);  
  if (score >= 8000) return "Critical";  
  if (score >= 3000) return "High";  
  if (score >= 1000) return "Medium";  
  return "Low";  
}  
  
function normalizeHotspot(row = {}, idx = 0) {  
  const lat = toNum(row.avg_lat ?? row.centroid_lat ?? row.latitude);  
  const lon = toNum(row.avg_lon ?? row.centroid_lon ?? row.longitude);  
  const score = scoreOf(row);  
  return {  
    id: row.cluster_id ?? row.id ?? row.junction_clean ?? idx,  
    label: cleanName(row.top_junction ?? row.junction_clean ?? row.label ?? `Hotspot ${idx + 1}`),  
    score,  
    violations: toNum(row.total_violations ?? row.violation_count ?? row.violations),  
    priority: toNum(row.priority_score ?? score),  
    tier: tierOf(row),  
    risk_level: row.risk_level ?? tierOf(row),  
    lat,  
    lon,  
    raw: row,  
  };  
}  
  
function normalizeAnomaly(row = {}, idx = 0) {  
  const label =  
    row.date ??  
    row.day ??  
    row.created_dt ??  
    row.timestamp ??  
    row.label ??  
    `Anomaly ${idx + 1}`;  
  const score = toNum(row.anomaly_score ?? row.score ?? row.value);  
  const flag = row.anomaly_flag ?? row.flag ?? (score < 0 ? -1 : 1);  
  return {  
    id: row.id ?? row.date ?? row.day ?? idx,  
    label: String(label),  
    score,  
    flag,  
    raw: row,  
  };  
}  
  
function themeUi(theme) {  
  return THEMES[theme] ?? THEMES.light;  
}  
  
function Card({ theme, style = {}, children }) {  
  const ui = themeUi(theme);  
  return (  
    <div  
      style={{  
        background: ui.surface,  
        border: `1px solid ${ui.border}`,  
        borderRadius: 20,  
        boxShadow: ui.shadow,  
        ...style,  
      }}  
    >  
      {children}  
    </div>  
  );  
}  
  
function SectionTitle({ theme, title, subtitle, action }) {  
  const ui = themeUi(theme);  
  return (  
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>  
      <div>  
        <div style={{ fontSize: 18, fontWeight: 900, color: ui.text }}>{title}</div>  
        {subtitle ? <div style={{ fontSize: 12, color: ui.muted, marginTop: 4 }}>{subtitle}</div> : null}  
      </div>  
      {action}  
    </div>  
  );  
}  
  
function KPI({ theme, label, value, sub, tone = "accent" }) {  
  const ui = themeUi(theme);  
  const color = tone === "red" ? "#EF4444" : tone === "orange" ? "#F97316" : tone === "green" ? "#22C55E" : ui.accent;  
  return (  
    <Card theme={theme} style={{ padding: 14 }}>  
      <div style={{ fontSize: 11, color: ui.muted, marginBottom: 8 }}>{label}</div>  
      <div style={{ fontSize: 23, fontWeight: 900, color }}>{value}</div>  
      {sub ? <div style={{ fontSize: 11, color: ui.muted, marginTop: 4 }}>{sub}</div> : null}  
    </Card>  
  );  
}  
  
function TierBadge({ theme, tier }) {  
  const ui = themeUi(theme);  
  const color = TIER_COLOR[tier] ?? { bg: ui.accentSoft, border: ui.border, text: ui.text, dot: ui.accent };  
  return (  
    <span  
      style={{  
        display: "inline-flex",  
        alignItems: "center",  
        gap: 6,  
        padding: "5px 10px",  
        borderRadius: 999,  
        background: color.bg,  
        border: `1px solid ${color.border}`,  
        color: color.text,  
        fontSize: 11,  
        fontWeight: 800,  
        whiteSpace: "nowrap",  
      }}  
    >  
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color.dot, display: "inline-block" }} />  
      {tier}  
    </span>  
  );  
}  
  
function Spinner({ theme }) {  
  const ui = themeUi(theme);  
  return (  
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 24, color: ui.muted }}>  
      Loading…  
    </div>  
  );  
}  
  
function EmptyState({ theme, title, text }) {  
  const ui = themeUi(theme);  
  return (  
    <div  
      style={{  
        padding: 18,  
        borderRadius: 16,  
        border: `1px dashed ${ui.border2}`,  
        background: ui.accentSoft,  
        color: ui.text,  
      }}  
    >  
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>  
      <div style={{ fontSize: 12, color: ui.muted, lineHeight: 1.7 }}>{text}</div>  
    </div>  
  );  
}  
  
function RankedList({ theme, rows, activeId, onSelect, metricLabel = "Score", emptyText = "No data." }) {  
  const ui = themeUi(theme);  
  const max = Math.max(...rows.map((r) => r.score || 0), 1);  
  
  if (!rows?.length) {  
    return <EmptyState theme={theme} title="Nothing to show" text={emptyText} />;  
  }  
  
  return (  
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>  
      {rows.map((row, idx) => {  
        const active = String(activeId ?? "") === String(row.id ?? "");  
        const tier = row.tier;  
        return (  
          <button  
            key={String(row.id ?? idx)}  
            type="button"  
            onClick={() => onSelect?.(row)}  
            style={{  
              width: "100%",  
              border: `1px solid ${active ? ui.accent : ui.border}`,  
              background: active ? ui.accentSoft : ui.surface2,  
              borderRadius: 14,  
              padding: "10px 12px",  
              textAlign: "left",  
              cursor: "pointer",  
              color: ui.text,  
            }}  
          >  
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>  
              <div  
                style={{  
                  width: 26,  
                  height: 26,  
                  borderRadius: 999,  
                  background: TIER_COLOR[tier]?.bg ?? ui.accentSoft,  
                  border: `1px solid ${TIER_COLOR[tier]?.border ?? ui.border}`,  
                  display: "flex",  
                  alignItems: "center",  
                  justifyContent: "center",  
                  fontSize: 11,  
                  fontWeight: 900,  
                  color: TIER_COLOR[tier]?.text ?? ui.text,  
                  flex: "0 0 auto",  
                }}  
              >  
                {idx + 1}  
              </div>  
              <div style={{ flex: 1, minWidth: 0 }}>  
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>  
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: ui.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>  
                    {row.label}  
                  </div>  
                  <TierBadge theme={theme} tier={tier} />  
                </div>  
                <div style={{ height: 5, background: ui.border, borderRadius: 999, overflow: "hidden" }}>  
                  <div  
                    style={{  
                      width: `${Math.max(4, (row.score / max) * 100)}%`,  
                      height: "100%",  
                      background: TIER_COLOR[tier]?.dot ?? ui.accent,  
                      borderRadius: 999,  
                    }}  
                  />  
                </div>  
              </div>  
              <div style={{ minWidth: 72, textAlign: "right" }}>  
                <div style={{ fontSize: 12.5, fontWeight: 900, color: ui.text }}>{formatNumber(row.score)}</div>  
                <div style={{ fontSize: 10, color: ui.muted }}>{metricLabel}</div>  
              </div>  
            </div>  
          </button>  
        );  
      })}  
    </div>  
  );  
}  
  
function HeatmapHero({  
  theme,  
  allRows,  
  visibleRows,  
  selected,  
  onSelect,  
  selectedTier,  
  setSelectedTier,  
  search,  
  setSearch,  
  apiOk,  
}) {  
  const ui = themeUi(theme);  
  const counts = useMemo(() => {  
    const out = { All: allRows.length, Critical: 0, High: 0, Medium: 0, Low: 0 };  
    allRows.forEach((r) => {  
      if (out[r.tier] !== undefined) out[r.tier] += 1;  
    });  
    return out;  
  }, [allRows]);  
  
  const topRows = visibleRows.slice(0, 8);  
  const selectedRow = selected ?? visibleRows[0] ?? allRows[0];  
  
  return (  
    <Card theme={theme} style={{ overflow: "hidden" }}>  
      <div  
        style={{  
          padding: 18,  
          background: ui.hero,  
          borderBottom: `1px solid ${ui.border}`,  
        }}  
      >  
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>  
          <div>  
            <div style={{ fontSize: 24, fontWeight: 950, color: ui.text }}>Bengaluru Parking Heatmap</div>  
            <div style={{ fontSize: 12, color: ui.muted, marginTop: 4 }}>  
              Interactive map-first view of illegal parking hotspots and congestion impact.  
            </div>  
          </div>  
  
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>  
            {TIER_ORDER.map((tier) => (  
              <button  
                key={tier}  
                type="button"  
                onClick={() => setSelectedTier?.(tier)}  
                style={{  
                  border: `1px solid ${selectedTier === tier ? ui.accent : ui.border}`,  
                  background: selectedTier === tier ? ui.accentSoft : ui.surface,  
                  color: selectedTier === tier ? ui.accent : ui.muted,  
                  borderRadius: 999,  
                  padding: "8px 12px",  
                  fontSize: 11,  
                  fontWeight: 900,  
                  cursor: "pointer",  
                }}  
              >  
                {tier}  
                {tier !== "All" ? ` (${counts[tier] || 0})` : ""}  
              </button>  
            ))}  
          </div>  
        </div>  
  
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>  
          <input  
            value={search}  
            onChange={(e) => setSearch?.(e.target.value)}  
            placeholder="Search junction / cluster"  
            style={{  
              minWidth: 240,  
              flex: "1 1 240px",  
              borderRadius: 12,  
              border: `1px solid ${ui.border}`,  
              background: ui.surface,  
              color: ui.text,  
              padding: "10px 12px",  
              outline: "none",  
            }}  
          />  
          <a  
            href={MAP_HTML}  
            target="_blank"  
            rel="noreferrer"  
            style={{  
              display: "inline-flex",  
              alignItems: "center",  
              justifyContent: "center",  
              textDecoration: "none",  
              borderRadius: 12,  
              padding: "10px 14px",  
              background: ui.accent,  
              color: "#fff",  
              fontSize: 12,  
              fontWeight: 900,  
              border: "none",  
            }}  
          >  
            Open full heatmap  
          </a>  
          <span  
            style={{  
              display: "inline-flex",  
              alignItems: "center",  
              gap: 8,  
              borderRadius: 999,  
              padding: "8px 12px",  
              background: apiOk ? "#EAFBF1" : "#FFF1F1",  
              color: apiOk ? "#1F7A4D" : "#B42318",  
              border: `1px solid ${apiOk ? "#B7E7C8" : "#F3B0B0"}`,  
              fontSize: 11,  
              fontWeight: 800,  
            }}  
          >  
            <span  
              style={{  
                width: 8,  
                height: 8,  
                borderRadius: "50%",  
                background: apiOk ? "#22C55E" : "#EF4444",  
                display: "inline-block",  
              }}  
            />  
            {apiOk ? "API online" : "API offline"}  
          </span>  
        </div>  
      </div>  
  
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.65fr", minHeight: 560 }}>  
        <div style={{ borderRight: `1px solid ${ui.border}`, background: ui.surface }}>  
          <div style={{ height: 560, background: ui.surface2 }}>  
            <iframe  
              title="Bengaluru parking heatmap"  
              src={MAP_HTML}  
              style={{ width: "100%", height: "100%", border: "none", display: "block", background: ui.surface2 }}  
            />  
          </div>  
  
          <div  
            style={{  
              padding: 14,  
              borderTop: `1px solid ${ui.border}`,  
              display: "flex",  
              gap: 10,  
              flexWrap: "wrap",  
              alignItems: "center",  
              background: ui.surface,  
            }}  
          >  
            <span style={{ fontSize: 11, color: ui.muted }}>  
              Heatmap legend:  
            </span>  
            {["Critical", "High", "Medium", "Low"].map((tier) => (  
              <TierBadge key={tier} theme={theme} tier={tier} />  
            ))}  
            <span style={{ fontSize: 11, color: ui.muted, marginLeft: "auto" }}>  
              Click a hotspot on the right to inspect its risk profile.  
            </span>  
          </div>  
        </div>  
  
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, background: ui.surface2 }}>  
          <div  
            style={{  
              background: ui.accentSoft,  
              border: `1px solid ${ui.border}`,  
              borderRadius: 16,  
              padding: 14,  
            }}  
          >  
            <div style={{ fontSize: 12, color: ui.muted, marginBottom: 6 }}>Selected hotspot</div>  
            {selectedRow ? (  
              <>  
                <div style={{ fontSize: 18, fontWeight: 950, color: ui.text, marginBottom: 8 }}>{selectedRow.label}</div>  
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>  
                  <TierBadge theme={theme} tier={selectedRow.tier} />  
                  <span style={{ fontSize: 11, color: ui.muted }}>  
                    Rank {selectedRow.rank ? `#${selectedRow.rank}` : "in current filter"}  
                  </span>  
                </div>  
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>  
                  <div style={{ background: ui.surface, borderRadius: 14, padding: 10, border: `1px solid ${ui.border}` }}>  
                    <div style={{ fontSize: 10, color: ui.muted }}>Congestion score</div>  
                    <div style={{ fontSize: 18, fontWeight: 950, color: ui.text }}>{formatNumber(selectedRow.score)}</div>  
                  </div>  
                  <div style={{ background: ui.surface, borderRadius: 14, padding: 10, border: `1px solid ${ui.border}` }}>  
                    <div style={{ fontSize: 10, color: ui.muted }}>Violations</div>  
                    <div style={{ fontSize: 18, fontWeight: 950, color: ui.text }}>{formatNumber(selectedRow.violations)}</div>  
                  </div>  
                  <div style={{ background: ui.surface, borderRadius: 14, padding: 10, border: `1px solid ${ui.border}` }}>  
                    <div style={{ fontSize: 10, color: ui.muted }}>Latitude</div>  
                    <div style={{ fontSize: 14, fontWeight: 800, color: ui.text }}>{formatFloat(selectedRow.lat, 4)}</div>  
                  </div>  
                  <div style={{ background: ui.surface, borderRadius: 14, padding: 10, border: `1px solid ${ui.border}` }}>  
                    <div style={{ fontSize: 10, color: ui.muted }}>Longitude</div>  
                    <div style={{ fontSize: 14, fontWeight: 800, color: ui.text }}>{formatFloat(selectedRow.lon, 4)}</div>  
                  </div>  
                </div>  
              </>  
            ) : (  
              <EmptyState  
                theme={theme}  
                title="No hotspot selected"  
                text="Use the tier filters or click a hotspot in the list to see details here."  
              />  
            )}  
          </div>  
  
          <div>  
            <SectionTitle  
              theme={theme}  
              title="Top hotspots"  
              subtitle="Ranked by congestion-weighted severity"  
            />  
            <div style={{ marginTop: 10 }}>  
              <RankedList  
                theme={theme}  
                rows={topRows.map((r, idx) => ({ ...r, rank: idx + 1 }))}  
                activeId={selectedRow?.id}  
                onSelect={onSelect}  
                metricLabel="Score"  
                emptyText="No hotspots match the current filter."  
              />  
            </div>  
          </div>  
        </div>  
      </div>  
    </Card>  
  );  
}  
  
function ModelHealth({ theme, summary, modelInfo }) {  
  const ui = themeUi(theme);  
  const metrics = [  
    ["Total violations", summary?.total_violations],  
    ["Total clusters", summary?.total_clusters],  
    ["Total junctions", summary?.total_junctions],  
    ["Anomaly days", summary?.anomaly_days],  
    ["Top cluster score", summary?.top_cluster_score],  
    ["Forecast R²", summary?.forecast_metrics?.R2],  
  ];  
  
  return (  
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>  
      <Card theme={theme} style={{ padding: 16 }}>  
        <SectionTitle  
          theme={theme}  
          title="Model summary"  
          subtitle="Live values pulled from the backend"  
        />  
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>  
          {metrics.map(([label, value]) => (  
            <div  
              key={label}  
              style={{  
                border: `1px solid ${ui.border}`,  
                background: ui.surface2,  
                borderRadius: 14,  
                padding: 12,  
              }}  
            >  
              <div style={{ fontSize: 10, color: ui.muted }}>{label}</div>  
              <div style={{ fontSize: 18, fontWeight: 950, color: ui.text, marginTop: 4 }}>  
                {typeof value === "number" ? (Number.isInteger(value) ? formatNumber(value) : formatFloat(value, 2)) : "—"}  
              </div>  
            </div>  
          ))}  
        </div>  
        {summary?.generated_at ? (  
          <div style={{ fontSize: 11, color: ui.muted, marginTop: 12 }}>  
            Last generated: {String(summary.generated_at)}  
          </div>  
        ) : null}  
      </Card>  
  
      <Card theme={theme} style={{ padding: 16 }}>  
        <SectionTitle theme={theme} title="Model registry" subtitle="What is on disk right now" />  
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>  
          {Object.keys(modelInfo || {}).length ? (  
            Object.entries(modelInfo).map(([key, info]) => (  
              <div  
                key={key}  
                style={{  
                  border: `1px solid ${ui.border}`,  
                  borderRadius: 14,  
                  padding: 12,  
                  background: ui.surface2,  
                }}  
              >  
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>  
                  <div style={{ fontSize: 13, fontWeight: 900, color: ui.text }}>{key}</div>  
                  <span  
                    style={{  
                      fontSize: 10,  
                      fontWeight: 900,  
                      color: info?.loaded ? "#1F7A4D" : "#B42318",  
                      background: info?.loaded ? "#EAFBF1" : "#FFF1F1",  
                      borderRadius: 999,  
                      padding: "4px 8px",  
                    }}  
                  >  
                    {info?.loaded ? "loaded" : "missing"}  
                  </span>  
                </div>  
                <div style={{ fontSize: 11, color: ui.muted, marginTop: 8 }}>  
                  {info?.type ? `Type: ${info.type}` : info?.reason ?? "No details"}  
                </div>  
                {info?.size_kb ? (  
                  <div style={{ fontSize: 11, color: ui.muted, marginTop: 4 }}>  
                    Size: {info.size_kb} KB  
                  </div>  
                ) : null}  
              </div>  
            ))  
          ) : (  
            <div style={{ gridColumn: "1 / -1" }}>  
              <EmptyState theme={theme} title="No model info" text="The backend did not return model metadata." />  
            </div>  
          )}  
        </div>  
      </Card>  
    </div>  
  );  
}  
  
function App() {  
  const [theme, setTheme] = useState("light");  
  const [tab, setTab] = useState("overview");  
  const [apiOk, setApiOk] = useState(false);  
  
  const [summary, setSummary] = useState(null);  
  const [clusters, setClusters] = useState([]);  
  const [mapPoints, setMapPoints] = useState([]);  
  const [priority, setPriority] = useState([]);  
  const [anomalies, setAnomalies] = useState([]);  
  const [modelInfo, setModelInfo] = useState({});  
  
  const [selectedTier, setSelectedTier] = useState("All");  
  const [search, setSearch] = useState("");  
  const [selectedHotspot, setSelectedHotspot] = useState(null);  
  
  const ui = themeUi(theme);  
  
  const loadAll = useCallback(async () => {  
    const health = await apiFetch("/health");  
    setApiOk(!!health);  
  
    const [s, c, mp, p, a, mi] = await Promise.all([  
      apiFetch("/summary"),  
      apiFetch("/clusters?limit=60"),  
      apiFetch("/map-points?top=60&source=clusters"),  
      apiFetch("/priority?limit=20"),  
      apiFetch("/anomalies?limit=20"),  
      apiFetch("/model-info"),  
    ]);  
  
    setSummary(s ?? null);  
    setClusters(pickList(c, ["data", "clusters", "rows"]));  
    setMapPoints(pickList(mp, ["data", "points", "clusters", "rows"]));  
    setPriority(pickList(p, ["data", "priority", "grid", "rows"]));  
    setAnomalies(pickList(a, ["data", "anomalies", "rows"]));  
    setModelInfo(mi ?? {});  
  }, []);  
  
  useEffect(() => {  
    loadAll();  
  }, [loadAll]);  
  
  const allHotspots = useMemo(() => {  
    const source = mapPoints.length ? mapPoints : clusters;  
    return source.map((row, idx) => normalizeHotspot(row, idx)).sort((a, b) => b.score - a.score);  
  }, [mapPoints, clusters]);  
  
  const visibleHotspots = useMemo(() => {  
    const q = search.trim().toLowerCase();  
    return allHotspots  
      .filter((row) => (selectedTier === "All" ? true : row.tier === selectedTier))  
      .filter((row) => {  
        if (!q) return true;  
        const hay = `${row.label} ${row.tier} ${row.score} ${row.violations}`.toLowerCase();  
        return hay.includes(q);  
      })  
      .sort((a, b) => b.score - a.score);  
  }, [allHotspots, selectedTier, search]);  
  
  const priorityRows = useMemo(() => {  
    const base = priority.length ? priority : allHotspots;  
    return base.map((row, idx) => normalizeHotspot(row, idx)).sort((a, b) => b.score - a.score);  
  }, [priority, allHotspots]);  
  
  const anomalyRows = useMemo(() => anomalies.map((row, idx) => normalizeAnomaly(row, idx)), [anomalies]);  
  
  useEffect(() => {  
    if (visibleHotspots.length) {  
      const currentId = selectedHotspot?.id;  
      const exists = visibleHotspots.some((row) => String(row.id) === String(currentId));  
      if (!selectedHotspot || !exists) setSelectedHotspot(visibleHotspots[0]);  
    }  
  }, [visibleHotspots, selectedHotspot]);  
  
  useEffect(() => {  
    if (!selectedHotspot && allHotspots.length) setSelectedHotspot(allHotspots[0]);  
  }, [allHotspots, selectedHotspot]);  
  
  const criticalCount = useMemo(() => allHotspots.filter((r) => r.tier === "Critical").length, [allHotspots]);  
  
  const onSelectHotspot = useCallback((row) => {  
    setSelectedHotspot(row);  
    setTab("heatmap");  
  }, []);  
  
  return (  
    <div  
      style={{  
        minHeight: "100vh",  
        background: `linear-gradient(180deg, ${ui.page} 0%, ${ui.page2} 100%)`,  
        color: ui.text,  
      }}  
    >  
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" }}>  
        <aside  
          style={{  
            background: `linear-gradient(180deg, ${ui.deep} 0%, ${ui.deep2} 100%)`,  
            color: "#fff",  
            padding: 20,  
            position: "sticky",  
            top: 0,  
            height: "100vh",  
            display: "flex",  
            flexDirection: "column",  
            gap: 18,  
          }}  
        >  
          <div>  
            <div  
              style={{  
                width: 52,  
                height: 52,  
                borderRadius: 16,  
                background: "rgba(255,255,255,0.08)",  
                display: "flex",  
                alignItems: "center",  
                justifyContent: "center",  
                fontSize: 26,  
                fontWeight: 900,  
                marginBottom: 10,  
              }}  
            >  
              P  
            </div>  
            <div style={{ fontSize: 20, fontWeight: 950 }}>Parking Intelligence</div>  
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>  
              Bengaluru BTP · Jan–Apr 2024  
            </div>  
          </div>  
  
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>  
            {NAV_ITEMS.map(([id, label]) => {  
              const active = tab === id;  
              return (  
                <button  
                  key={id}  
                  type="button"  
                  onClick={() => setTab(id)}  
                  style={{  
                    textAlign: "left",  
                    border: `1px solid ${active ? "rgba(102,184,255,0.45)" : "rgba(255,255,255,0.08)"}`,  
                    background: active ? "rgba(102,184,255,0.12)" : "rgba(255,255,255,0.03)",  
                    color: "#fff",  
                    borderRadius: 14,  
                    padding: "11px 14px",  
                    cursor: "pointer",  
                    fontSize: 13,  
                    fontWeight: 800,  
                  }}  
                >  
                  {label}  
                </button>  
              );  
            })}  
          </div>  
  
          <div  
            style={{  
              marginTop: "auto",  
              paddingTop: 14,  
              borderTop: "1px solid rgba(255,255,255,0.10)",  
            }}  
          >  
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>API status</div>  
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>  
              <span  
                style={{  
                  width: 10,  
                  height: 10,  
                  borderRadius: "50%",  
                  background: apiOk ? "#22C55E" : "#EF4444",  
                  boxShadow: apiOk ? "0 0 0 4px rgba(34,197,94,0.18)" : "0 0 0 4px rgba(239,68,68,0.16)",  
                }}  
              />  
              <span style={{ fontSize: 13, fontWeight: 800 }}>{apiOk ? "Connected" : "Disconnected"}</span>  
            </div>  
  
            <button  
              type="button"  
              onClick={loadAll}  
              style={{  
                marginTop: 14,  
                width: "100%",  
                border: "none",  
                background: "#66B8FF",  
                color: "#0B1B2B",  
                borderRadius: 12,  
                padding: "10px 12px",  
                fontWeight: 900,  
                cursor: "pointer",  
              }}  
            >  
              Refresh data  
            </button>  
  
            <button  
              type="button"  
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}  
              style={{  
                marginTop: 10,  
                width: "100%",  
                border: "1px solid rgba(255,255,255,0.14)",  
                background: "rgba(255,255,255,0.04)",  
                color: "#fff",  
                borderRadius: 12,  
                padding: "10px 12px",  
                fontWeight: 900,  
                cursor: "pointer",  
              }}  
            >  
              {theme === "light" ? "Dark blue theme" : "Light blue theme"}  
            </button>  
          </div>  
        </aside>  
  
        <main style={{ padding: 20, overflowX: "hidden" }}>  
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>  
            <div>  
              <div style={{ fontSize: 12, color: ui.muted }}>AI-driven parking intelligence dashboard</div>  
              <div style={{ fontSize: 28, fontWeight: 950, color: ui.text, marginTop: 2 }}>  
                Illegal parking hotspots and enforcement priority  
              </div>  
            </div>  
  
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>  
              <button  
                type="button"  
                onClick={loadAll}  
                style={{  
                  borderRadius: 12,  
                  border: `1px solid ${ui.border}`,  
                  background: ui.surface,  
                  color: ui.text,  
                  padding: "10px 14px",  
                  fontWeight: 800,  
                  cursor: "pointer",  
                }}  
              >  
                Reload  
              </button>  
              <button  
                type="button"  
                onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}  
                style={{  
                  borderRadius: 12,  
                  border: `1px solid ${ui.border}`,  
                  background: ui.surface,  
                  color: ui.text,  
                  padding: "10px 14px",  
                  fontWeight: 800,  
                  cursor: "pointer",  
                }}  
              >  
                Toggle theme  
              </button>  
            </div>  
          </div>  
  
          {tab === "overview" && (  
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>  
              <HeatmapHero  
                theme={theme}  
                allRows={allHotspots}  
                visibleRows={visibleHotspots}  
                selected={selectedHotspot}  
                onSelect={onSelectHotspot}  
                selectedTier={selectedTier}  
                setSelectedTier={setSelectedTier}  
                search={search}  
                setSearch={setSearch}  
                apiOk={apiOk}  
              />  
  
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>  
                <KPI theme={theme} label="Total violations" value={formatNumber(summary?.total_violations)} tone="red" />  
                <KPI theme={theme} label="Hotspot clusters" value={formatNumber(summary?.total_clusters)} tone="orange" />  
                <KPI theme={theme} label="Critical hotspots" value={formatNumber(criticalCount)} tone="red" />  
                <KPI theme={theme} label="Anomaly days" value={formatNumber(summary?.anomaly_days)} tone="blue" />  
                <KPI theme={theme} label="Top cluster score" value={formatNumber(summary?.top_cluster_score)} tone="orange" />  
                <KPI theme={theme} label="Forecast R²" value={formatFloat(summary?.forecast_metrics?.R2, 3)} tone="green" />  
              </div>  
  
              <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16, alignItems: "start" }}>  
                <Card theme={theme} style={{ padding: 16 }}>  
                  <SectionTitle  
                    theme={theme}  
                    title="Ranked hotspot queue"  
                    subtitle="Clusters sorted by congestion-weighted severity"  
                  />  
                  <div style={{ marginTop: 12 }}>  
                    <RankedList  
                      theme={theme}  
                      rows={visibleHotspots.slice(0, 12)}  
                      activeId={selectedHotspot?.id}  
                      onSelect={onSelectHotspot}  
                      metricLabel="Score"  
                      emptyText="No hotspots match the current filter."  
                    />  
                  </div>  
                </Card>  
  
                <ModelHealth theme={theme} summary={summary} modelInfo={modelInfo} />  
              </div>  
  
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>  
                <Card theme={theme} style={{ padding: 16 }}>  
                  <SectionTitle  
                    theme={theme}  
                    title="Enforcement priority"  
                    subtitle="Use this as the action queue for patrol planning"  
                  />  
                  <div style={{ marginTop: 12 }}>  
                    <RankedList  
                      theme={theme}  
                      rows={priorityRows.slice(0, 12)}  
                      activeId={selectedHotspot?.id}  
                      onSelect={onSelectHotspot}  
                      metricLabel="Priority"  
                      emptyText="No priority rows available."  
                    />  
                  </div>  
                </Card>  
  
                <Card theme={theme} style={{ padding: 16 }}>  
                  <SectionTitle  
                    theme={theme}  
                    title="Anomaly feed"  
                    subtitle="Unexpected days or records that deviated from normal patterns"  
                  />  
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>  
                    {anomalyRows.length ? (  
                      anomalyRows.slice(0, 10).map((row, idx) => {  
                        const abnormal = row.flag === -1 || row.flag === "-1";  
                        return (  
                          <div  
                            key={String(row.id ?? idx)}  
                            style={{  
                              border: `1px solid ${ui.border}`,  
                              background: ui.surface2,  
                              borderRadius: 14,  
                              padding: 12,  
                              display: "flex",  
                              justifyContent: "space-between",  
                              gap: 12,  
                              alignItems: "center",  
                            }}  
                          >  
                            <div>  
                              <div style={{ fontSize: 12.5, fontWeight: 900, color: ui.text }}>{row.label}</div>  
                              <div style={{ fontSize: 11, color: ui.muted, marginTop: 4 }}>  
                                {abnormal ? "Detected anomaly" : "Normal behavior"}  
                              </div>  
                            </div>  
                            <div style={{ textAlign: "right" }}>  
                              <div style={{ fontSize: 13, fontWeight: 950, color: abnormal ? "#B42318" : ui.text }}>  
                                {formatFloat(row.score, 3)}  
                              </div>  
                              <div style={{ fontSize: 10, color: ui.muted }}>anomaly score</div>  
                            </div>  
                          </div>  
                        );  
                      })  
                    ) : (  
                      <EmptyState  
                        theme={theme}  
                        title="No anomalies yet"  
                        text="The backend did not return anomaly rows, or the anomaly artifact is missing."  
                      />  
                    )}  
                  </div>  
                </Card>  
              </div>  
            </div>  
          )}  
  
          {tab === "heatmap" && (  
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>  
              <HeatmapHero  
                theme={theme}  
                allRows={allHotspots}  
                visibleRows={visibleHotspots}  
                selected={selectedHotspot}  
                onSelect={onSelectHotspot}  
                selectedTier={selectedTier}  
                setSelectedTier={setSelectedTier}  
                search={search}  
                setSearch={setSearch}  
                apiOk={apiOk}  
              />  
            </div>  
          )}  
  
          {tab === "priority" && (  
            <Card theme={theme} style={{ padding: 16 }}>  
              <SectionTitle  
                theme={theme}  
                title="Enforcement priority"  
                subtitle="Ranked by congestion-weighted risk and operational urgency"  
              />  
              <div style={{ marginTop: 12 }}>  
                <RankedList  
                  theme={theme}  
                  rows={priorityRows}  
                  activeId={selectedHotspot?.id}  
                  onSelect={onSelectHotspot}  
                  metricLabel="Priority"  
                  emptyText="No priority rows available."  
                />  
              </div>  
            </Card>  
          )}  
  
          {tab === "anomalies" && (  
            <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr", gap: 16, alignItems: "start" }}>  
              <Card theme={theme} style={{ padding: 16 }}>  
                <SectionTitle  
                  theme={theme}  
                  title="Anomaly detections"  
                  subtitle="Days or records that deviated from the normal pattern"  
                />  
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>  
                  {anomalyRows.length ? (  
                    anomalyRows.map((row, idx) => {  
                      const abnormal = row.flag === -1 || row.flag === "-1";  
                      return (  
                        <div  
                          key={String(row.id ?? idx)}  
                          style={{  
                            border: `1px solid ${ui.border}`,  
                            background: ui.surface2,  
                            borderRadius: 14,  
                            padding: 12,  
                            display: "flex",  
                            justifyContent: "space-between",  
                            gap: 12,  
                            alignItems: "center",  
                          }}  
                        >  
                          <div>  
                            <div style={{ fontSize: 12.5, fontWeight: 900, color: ui.text }}>{row.label}</div>  
                            <div style={{ fontSize: 11, color: ui.muted, marginTop: 4 }}>  
                              {abnormal ? "Anomalous pattern" : "Normal pattern"}  
                            </div>  
                          </div>  
                          <div style={{ textAlign: "right" }}>  
                            <div style={{ fontSize: 13, fontWeight: 950, color: abnormal ? "#B42318" : ui.text }}>  
                              {formatFloat(row.score, 3)}  
                            </div>  
                            <div style={{ fontSize: 10, color: ui.muted }}>anomaly score</div>  
                          </div>  
                        </div>  
                      );  
                    })  
                  ) : (  
                    <EmptyState  
                      theme={theme}  
                      title="No anomaly data"  
                      text="The backend did not return anomaly rows."  
                    />  
                  )}  
                </div>  
              </Card>  
  
              <Card theme={theme} style={{ padding: 16 }}>  
                <SectionTitle  
                  theme={theme}  
                  title="How to read anomalies"  
                  subtitle="Useful shortcuts for operations"  
                />  
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>  
                  <EmptyState  
                    theme={theme}  
                    title="Lower scores are more unusual"  
                    text="Use anomalies to explain sudden changes in the heatmap, event spikes, or enforcement bursts."  
                  />  
                  <EmptyState  
                    theme={theme}  
                    title="Do not overreact to one day"  
                    text="Check whether anomalies align with weekends, events, or patrol shifts before changing enforcement."  
                  />  
                </div>  
              </Card>  
            </div>  
          )}  
  
          {tab === "models" && (  
            <ModelHealth theme={theme} summary={summary} modelInfo={modelInfo} />  
          )}  
        </main>  
      </div>  
    </div>  
  );  
}  
  
export default App;
