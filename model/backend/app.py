"""
Parking Intelligence Dashboard — Flask Backend
================================================
Serves pre-computed CSV artefacts (cluster_summary, junction_impact,
priority_ranking, prediction_report, daily_anomaly) produced by the
full pipeline script.

Edge-cases handled
------------------
* Missing artefact files  → 404 with descriptive JSON error
* Empty CSVs              → returns {"data": [], "count": 0, "warning": "..."}
* Corrupt / unreadable    → 500 with safe error message (no stack trace in prod)
* Model .pkl files absent → /api/model-info reports "not loaded" gracefully
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

# ── Configuration ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
ARTIFACT_DIR = BASE_DIR         # default artefact folder (override via env)
if os.getenv("ARTIFACT_DIR"):
    ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR"))

# Artefact file map  (key → filename inside ARTIFACT_DIR)
ARTEFACTS = {
    "cluster_summary":  "cluster_summary.csv",
    "junction_impact":  "junction_impact.csv",
    "priority_ranking": "priority_ranking.csv",
    "prediction_report":"prediction_report.csv",
    "daily_anomaly":    "daily_anomaly.csv",
}

MODEL_FILES = {
    "forecast":  "forecast_model.pkl",
    "dbscan":    "dbscan_model.pkl",
    "anomaly":   "anomaly_model.pkl",
}

app = Flask(__name__)
CORS(app)  # allow the React / plain-HTML frontend running on a different port


# ── Helpers ──────────────────────────────────────────────────────────────────

def _safe_read(name: str, **kwargs) -> tuple[pd.DataFrame | None, str | None]:
    """
    Load a named artefact CSV.

    Returns (DataFrame, None) on success.
    Returns (None, error_message) if the file is missing or unreadable.
    Treats a completely empty CSV as a valid, zero-row result.
    """
    filename = ARTEFACTS.get(name)
    if filename is None:
        return None, f"Unknown artefact '{name}'"

    path = ARTIFACT_DIR / filename
    if not path.exists():
        return None, f"Artefact file not found: {path}"

    try:
        df = pd.read_csv(path, low_memory=False, **kwargs)
    except Exception as exc:
        return None, f"Failed to read '{filename}': {exc}"

    return df, None


def _df_to_response(df: pd.DataFrame, warning: str | None = None) -> dict:
    """Convert a DataFrame to a JSON-safe dict, handling NaN / inf / dates."""
    # Replace non-JSON-safe floats
    df = df.replace([np.inf, -np.inf], np.nan)

    # Convert any Categorical columns to string (JSON-unfriendly otherwise)
    for col in df.select_dtypes(include="category").columns:
        df[col] = df[col].astype(str)

    records = df.to_dict(orient="records")

    # Sanitise individual NaN values that sneak through
    def _clean(v):
        if isinstance(v, float) and np.isnan(v):
            return None
        return v

    records = [{k: _clean(v) for k, v in row.items()} for row in records]

    result: dict = {"data": records, "count": len(records)}
    if warning:
        result["warning"] = warning
    return result


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    """Simple liveness probe."""
    return jsonify({
        "status": "ok",
        "artifact_dir": str(ARTIFACT_DIR),
        "artifact_dir_exists": ARTIFACT_DIR.exists(),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })


@app.route("/api/artefacts", methods=["GET"])
def list_artefacts():
    """List which artefact files are present on disk."""
    status = {}
    for key, filename in ARTEFACTS.items():
        p = ARTIFACT_DIR / filename
        status[key] = {
            "file": filename,
            "exists": p.exists(),
            "size_kb": round(p.stat().st_size / 1024, 1) if p.exists() else None,
        }
    return jsonify(status)


# ── Cluster summary ──────────────────────────────────────────────────────────

@app.route("/api/clusters", methods=["GET"])
def get_clusters():
    """
    DBSCAN hotspot cluster summary.
    Query params:
        limit  (int, default 50)  – max rows returned
        min_score (float)         – filter by minimum congestion_score
    """
    df, err = _safe_read("cluster_summary")
    if err:
        return jsonify({"error": err}), (404 if "not found" in err else 500)

    if df.empty:
        return jsonify({"data": [], "count": 0, "warning": "cluster_summary.csv is empty"})

    limit = request.args.get("limit", 50, type=int)
    min_score = request.args.get("min_score", type=float)

    if min_score is not None and "congestion_score" in df.columns:
        df = df[df["congestion_score"] >= min_score]

    df = df.head(limit)
    return jsonify(_df_to_response(df))


# ── Junction impact ──────────────────────────────────────────────────────────

@app.route("/api/junctions", methods=["GET"])
def get_junctions():
    """
    Per-junction impact / congestion ranking.
    Query params:
        top (int, default 20)
        sort_by (str, default 'congestion_rank_score') – column to sort by
    """
    df, err = _safe_read("junction_impact")
    if err:
        return jsonify({"error": err}), (404 if "not found" in err else 500)

    if df.empty:
        return jsonify({"data": [], "count": 0, "warning": "junction_impact.csv is empty"})

    top = request.args.get("top", 20, type=int)
    sort_by = request.args.get("sort_by", "congestion_rank_score")

    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=False)
    else:
        sort_by = "congestion_rank_score" if "congestion_rank_score" in df.columns else df.columns[0]
        df = df.sort_values(sort_by, ascending=False)

    df = df.head(top)
    return jsonify(_df_to_response(df))


# ── Priority ranking ─────────────────────────────────────────────────────────

@app.route("/api/priority", methods=["GET"])
def get_priority():
    """
    Full priority-score ranking for patrol deployment.
    Query params:
        limit (int, default 50)
        risk  (str) – filter by risk_level  e.g. ?risk=Critical
    """
    df, err = _safe_read("priority_ranking")
    if err:
        return jsonify({"error": err}), (404 if "not found" in err else 500)

    if df.empty:
        return jsonify({"data": [], "count": 0, "warning": "priority_ranking.csv is empty"})

    limit = request.args.get("limit", 50, type=int)
    risk_filter = request.args.get("risk", type=str)

    if risk_filter and "risk_level" in df.columns:
        df = df[df["risk_level"].astype(str).str.lower() == risk_filter.lower()]

    if "priority_rank" in df.columns:
        df = df.sort_values("priority_rank")

    df = df.head(limit)
    return jsonify(_df_to_response(df))


# ── Prediction report (top-10 deployment brief) ──────────────────────────────

@app.route("/api/report", methods=["GET"])
def get_report():
    """
    Top-10 deployment prediction report with risk level + officer count.
    """
    df, err = _safe_read("prediction_report")
    if err:
        return jsonify({"error": err}), (404 if "not found" in err else 500)

    if df.empty:
        return jsonify({"data": [], "count": 0, "warning": "prediction_report.csv is empty"})

    return jsonify(_df_to_response(df))


# ── Daily anomaly ────────────────────────────────────────────────────────────

@app.route("/api/anomalies", methods=["GET"])
def get_anomalies():
    """
    Daily anomaly detections (IsolationForest).
    Query params:
        only_anomalies (bool, default true)  – set false to return all rows
        limit (int, default 100)
        junction (str)                       – filter by junction_clean
    """
    df, err = _safe_read("daily_anomaly")
    if err:
        return jsonify({"error": err}), (404 if "not found" in err else 500)

    if df.empty:
        return jsonify({"data": [], "count": 0, "warning": "daily_anomaly.csv is empty"})

    only_anom = request.args.get("only_anomalies", "true").lower() == "true"
    limit = request.args.get("limit", 100, type=int)
    junction_filter = request.args.get("junction", type=str)

    if only_anom and "anomaly_flag" in df.columns:
        df = df[df["anomaly_flag"] == -1]

    if junction_filter and "junction_clean" in df.columns:
        df = df[df["junction_clean"].str.contains(junction_filter, case=False, na=False)]

    if "anomaly_score" in df.columns:
        df = df.sort_values("anomaly_score")   # most anomalous first (lowest score)

    df = df.head(limit)
    return jsonify(_df_to_response(df))


# ── Summary stats (dashboard KPIs) ──────────────────────────────────────────

@app.route("/api/summary", methods=["GET"])
def get_summary():
    """
    Aggregate KPIs for the dashboard header cards.
    Falls back gracefully if individual files are missing.
    """
    summary = {}

    # --- clusters ---
    df_c, _ = _safe_read("cluster_summary")
    if df_c is not None and not df_c.empty and "cluster_id" in df_c.columns:
        summary["total_clusters"] = int(len(df_c))
        if "congestion_score" in df_c.columns:
            summary["top_cluster_score"] = round(float(df_c["congestion_score"].max()), 1)
    else:
        summary["total_clusters"] = None
        summary["top_cluster_score"] = None

    # --- junctions ---
    df_j, _ = _safe_read("junction_impact")
    if df_j is not None and not df_j.empty:
        summary["total_junctions"] = int(len(df_j))
        if "total_violations" in df_j.columns:
            summary["total_violations"] = int(df_j["total_violations"].sum())
        if "congestion_rank_score" in df_j.columns:
            summary["avg_congestion_score"] = round(float(df_j["congestion_rank_score"].mean()), 2)
    else:
        summary["total_junctions"] = None
        summary["total_violations"] = None
        summary["avg_congestion_score"] = None

    # --- anomalies ---
    df_a, _ = _safe_read("daily_anomaly")
    if df_a is not None and not df_a.empty and "anomaly_flag" in df_a.columns:
        summary["anomaly_days"] = int((df_a["anomaly_flag"] == -1).sum())
    else:
        summary["anomaly_days"] = None

    # --- forecast metrics (from JSON if present) ---
    metrics_path = ARTIFACT_DIR / "forecast_metrics.json"
    if metrics_path.exists():
        try:
            with open(metrics_path, encoding="utf-8") as f:
                metrics = json.load(f)
            summary["forecast_metrics"] = metrics.get("forecast_metrics", {})
            summary["pipeline_rows"] = metrics.get("rows")
            summary["generated_at"] = metrics.get("generated_at")
        except Exception:
            summary["forecast_metrics"] = None
    else:
        summary["forecast_metrics"] = None

    return jsonify(summary)


# ── Model info ───────────────────────────────────────────────────────────────

@app.route("/api/model-info", methods=["GET"])
def model_info():
    """
    Reports which models are on disk and their type (no actual inference here).
    """
    info = {}
    for key, filename in MODEL_FILES.items():
        p = ARTIFACT_DIR / filename
        if not p.exists():
            info[key] = {"loaded": False, "reason": "file not found"}
            continue
        try:
            model = joblib.load(p)
            info[key] = {
                "loaded": True,
                "type": type(model).__name__,
                "module": type(model).__module__,
                "size_kb": round(p.stat().st_size / 1024, 1),
            }
        except Exception as exc:
            info[key] = {"loaded": False, "reason": str(exc)}

    return jsonify(info)

@app.route("/api/dashboard-summary", methods=["GET"])  
def dashboard_summary():  
    df_c, _ = _safe_read("cluster_summary")  
    df_j, _ = _safe_read("junction_impact")  
    df_a, _ = _safe_read("daily_anomaly")  
  
    return jsonify({  
        "clusters": int(len(df_c)) if df_c is not None else 0,  
        "junctions": int(len(df_j)) if df_j is not None else 0,  
        "anomalies": int((df_a["anomaly_flag"] == -1).sum()) if df_a is not None and "anomaly_flag" in df_a.columns else 0,  
    })

# ── Top-N junctions for map view ─────────────────────────────────────────────

@app.route("/api/map-points", methods=["GET"])
def map_points():
    """
    Returns lat/lon + metadata for the top-N junctions suitable for a map.
    Query params:
        top (int, default 30)
        source (str) – 'junctions' (default) or 'clusters'
    """
    source = request.args.get("source", "junctions")
    top = request.args.get("top", 30, type=int)

    if source == "clusters":
        df, err = _safe_read("cluster_summary")
        lat_col, lon_col, label_col = "avg_lat", "avg_lon", "top_junction"
        score_col = "congestion_score"
    else:
        df, err = _safe_read("junction_impact")
        lat_col, lon_col, label_col = "avg_lat", "avg_lon", "junction_clean"
        score_col = "congestion_rank_score"

    if err:
        return jsonify({"error": err}), (404 if "not found" in err else 500)

    if df is None or df.empty:
        return jsonify({"data": [], "count": 0})

    needed = [lat_col, lon_col]
    if not all(c in df.columns for c in needed):
        return jsonify({"error": f"GPS columns missing in {source} data"}), 500

    if score_col in df.columns:
        df = df.sort_values(score_col, ascending=False)

    df = df.head(top)

    cols = [c for c in [lat_col, lon_col, label_col, score_col,
                         "total_violations", "risk_level", "priority_score"]
            if c in df.columns]
    return jsonify(_df_to_response(df[cols]))


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "production") == "development"
    print(f"[Parking Intelligence API]  artefacts → {ARTIFACT_DIR}")
    app.run(host="0.0.0.0", port=port, debug=debug)
