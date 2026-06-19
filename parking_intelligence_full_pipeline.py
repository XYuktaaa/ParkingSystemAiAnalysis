import ast
import json
from pathlib import Path
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
import matplotlib.pyplot as plt

try:
    from xgboost import XGBRegressor

    HAS_XGBOOST = True
except Exception:
    HAS_XGBOOST = False

try:
    import folium
except Exception:
    folium = None

DATA_PATH = Path("Dataset.csv")
ARTIFACT_DIR = Path("model")
ARTIFACT_DIR.mkdir(exist_ok=True)

pd.set_option("display.max_columns", 200)
pd.set_option("display.width", 140)


def parse_violation(value):
    if pd.isna(value):
        return []
    if isinstance(value, list):
        return [str(x) for x in value]
    try:
        parsed = ast.literal_eval(value)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except Exception:
        pass
    return [str(value)]


def load_data(path=DATA_PATH):
    df = pd.read_csv(path, low_memory=False)

    df["created_dt"] = pd.to_datetime(df["created_datetime"], errors="coerce", utc=True)
    df["date"] = df["created_dt"].dt.date
    df["hour"] = df["created_dt"].dt.hour
    df["dow"] = df["created_dt"].dt.dayofweek
    df["month"] = df["created_dt"].dt.month
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["is_morning_peak"] = df["hour"].between(7, 9).astype(int)
    df["is_evening_peak"] = df["hour"].between(17, 20).astype(int)

    df["viol_list"] = df["violation_type"].apply(parse_violation)
    df["violation_count"] = df["viol_list"].apply(len)

    def any_token(tokens):
        tokens = [t.upper() for t in tokens]
        return lambda v: int(any(tok in str(x).upper() for x in v for tok in tokens))

    df["viol_main_road"] = df["viol_list"].apply(any_token(["MAIN ROAD"]))
    df["viol_double"] = df["viol_list"].apply(any_token(["DOUBLE PARKING"]))
    df["viol_footpath"] = df["viol_list"].apply(any_token(["FOOTPATH"]))
    df["viol_bus_stop"] = df["viol_list"].apply(any_token(["BUS STOP"]))
    df["viol_school"] = df["viol_list"].apply(any_token(["SCHOOL"]))
    df["viol_wrong"] = df["viol_list"].apply(any_token(["WRONG PARKING"]))
    df["viol_no_parking"] = df["viol_list"].apply(any_token(["NO PARKING"]))

    df["police_station"] = df["police_station"].fillna("Unknown")
    df["junction_name"] = df["junction_name"].fillna("No Junction")
    df["junction_clean"] = df["junction_name"].astype(str).str.strip()
    df["has_junction"] = (
        ~df["junction_clean"].isin(["No Junction", "no junction"])
    ).astype(int)

    top_vehicle_types = (
        df["vehicle_type"].fillna("Unknown").value_counts().head(8).index
    )
    df["vehicle_cat"] = (
        df["vehicle_type"]
        .fillna("Unknown")
        .where(
            df["vehicle_type"].fillna("Unknown").isin(top_vehicle_types), other="Other"
        )
    )

    def congestion_proxy(vlist):
        score = 0
        matched = False
        for item in vlist:
            s = str(item).upper()
            if "PARKING IN A MAIN ROAD" in s:
                score += 3
                matched = True
            elif "DOUBLE PARKING" in s:
                score += 2
                matched = True
            elif "PARKING ON FOOTPATH" in s:
                score += 2
                matched = True
            elif "PARKING ON BUS STOP" in s:
                score += 2
                matched = True
            elif "PARKING NEAR SCHOOL" in s:
                score += 2
                matched = True
            elif "WRONG PARKING" in s or "NO PARKING" in s:
                score += 1
                matched = True
        return score if matched else 1

    df["congestion_weight"] = df["viol_list"].apply(congestion_proxy)

    df["valid_gps"] = df["latitude"].between(12.7, 13.2) & df["longitude"].between(
        77.4, 77.9
    )

    return df


df = load_data()
df.head()


def run_dbscan_hotspots(data, eps_meters=150, min_samples=10):
    gps = data[(data["valid_gps"]) & (data["has_junction"] == 1)].copy()
    coords = np.radians(gps[["latitude", "longitude"]].values)
    eps_rad = eps_meters / 6_371_000

    model = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine", n_jobs=-1)
    gps["cluster_id"] = model.fit_predict(coords)

    cluster_summary = (
        gps[gps["cluster_id"] >= 0]
        .groupby("cluster_id")
        .agg(
            violation_count=("id", "count"),
            congestion_score=("congestion_weight", "sum"),
            avg_lat=("latitude", "mean"),
            avg_lon=("longitude", "mean"),
            top_junction=(
                "junction_clean",
                lambda x: x.mode().iloc[0] if not x.mode().empty else "Unknown",
            ),
        )
        .sort_values("congestion_score", ascending=False)
        .reset_index()
    )
    return gps, cluster_summary, model


gps_df, cluster_summary, dbscan_model = run_dbscan_hotspots(df)
cluster_summary.head(10)


def plot_heatmap_folium(
    gps_df, cluster_summary, output_html=ARTIFACT_DIR / "parking_heatmap.html"
):
    if folium is None:
        print("folium is not installed.")
        return None

    center_lat = gps_df["latitude"].mean()
    center_lon = gps_df["longitude"].mean()
    m = folium.Map(
        location=[center_lat, center_lon], zoom_start=12, tiles="CartoDB positron"
    )

    for _, row in cluster_summary.head(30).iterrows():
        radius = max(6, min(30, row["congestion_score"] / 300))
        popup = (
            f"<b>Cluster {int(row['cluster_id'])}</b><br>"
            f"Violations: {int(row['violation_count'])}<br>"
            f"Congestion score: {int(row['congestion_score'])}<br>"
            f"Top junction: {row['top_junction']}"
        )
        folium.CircleMarker(
            location=[row["avg_lat"], row["avg_lon"]],
            radius=radius,
            fill=True,
            fill_opacity=0.45,
            popup=popup,
        ).add_to(m)

    m.save(str(output_html))
    return m


heatmap_map = plot_heatmap_folium(gps_df, cluster_summary)
heatmap_map


def compute_impact_score(data):
    out = data.copy()
    out["peak_factor"] = np.where(
        out["is_morning_peak"] | out["is_evening_peak"], 1.4, 1.0
    )
    out["junction_factor"] = np.where(out["has_junction"] == 1, 1.2, 1.0)
    out["impact_score"] = (
        out["congestion_weight"] * out["peak_factor"] * out["junction_factor"]
    )
    return out


df = compute_impact_score(df)

junction_impact = (
    df[df["has_junction"] == 1]
    .groupby("junction_clean")
    .agg(
        total_violations=("id", "count"),
        total_impact=("impact_score", "sum"),
        avg_impact=("impact_score", "mean"),
        morning_peak_share=("is_morning_peak", "mean"),
        evening_peak_share=("is_evening_peak", "mean"),
        main_road_share=("viol_main_road", "mean"),
        avg_lat=("latitude", "mean"),
        avg_lon=("longitude", "mean"),
    )
    .sort_values("total_impact", ascending=False)
    .reset_index()
)


def normalize_series(s):
    s = s.astype(float)
    denom = s.max() - s.min()
    if denom == 0:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - s.min()) / denom


junction_impact["norm_violations"] = normalize_series(
    junction_impact["total_violations"]
)
junction_impact["norm_impact"] = normalize_series(junction_impact["total_impact"])
junction_impact["congestion_rank_score"] = (
    0.55 * junction_impact["norm_impact"] + 0.45 * junction_impact["norm_violations"]
) * 100

junction_impact.head(15)


daily = (
    df[df["has_junction"] == 1]
    .groupby(["junction_clean", "date"])
    .agg(
        count=("id", "count"),
        impact=("impact_score", "sum"),
        main_road_frac=("viol_main_road", "mean"),
        morning_peak_frac=("is_morning_peak", "mean"),
        evening_peak_frac=("is_evening_peak", "mean"),
    )
    .reset_index()
    .sort_values(["junction_clean", "date"])
)

for lag in [1, 2, 7]:
    daily[f"lag{lag}"] = daily.groupby("junction_clean")["count"].shift(lag)

daily["roll3_mean"] = daily.groupby("junction_clean")["count"].transform(
    lambda x: x.shift(1).rolling(3, min_periods=2).mean()
)
daily["roll7_mean"] = daily.groupby("junction_clean")["count"].transform(
    lambda x: x.shift(1).rolling(7, min_periods=3).mean()
)
daily["date_dt"] = pd.to_datetime(daily["date"])
daily["dow"] = daily["date_dt"].dt.dayofweek
daily["month"] = daily["date_dt"].dt.month
daily["is_weekend"] = (daily["dow"] >= 5).astype(int)

forecast_df = daily.dropna().copy()
feature_cols = [
    "lag1",
    "lag2",
    "lag7",
    "roll3_mean",
    "roll7_mean",
    "dow",
    "month",
    "is_weekend",
    "impact",
    "main_road_frac",
    "morning_peak_frac",
    "evening_peak_frac",
]
X = forecast_df[feature_cols]
y = forecast_df["count"]

split_idx = int(len(forecast_df) * 0.8)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

if HAS_XGBOOST:
    forecast_model = XGBRegressor(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        objective="reg:squarederror",
    )
else:
    forecast_model = RandomForestRegressor(
        n_estimators=300, max_depth=12, min_samples_leaf=3, random_state=42, n_jobs=-1
    )

forecast_model.fit(X_train, y_train)
pred = forecast_model.predict(X_test)

forecast_metrics = {
    "MAE": float(mean_absolute_error(y_test, pred)),
    "RMSE": float(np.sqrt(mean_squared_error(y_test, pred))),
    "R2": float(r2_score(y_test, pred)),
}
forecast_metrics


daily_anomaly = (
    df[df["has_junction"] == 1]
    .groupby(["junction_clean", "date"])
    .agg(
        daily_count=("id", "count"),
        daily_impact=("impact_score", "sum"),
        main_road_frac=("viol_main_road", "mean"),
    )
    .reset_index()
    .sort_values(["junction_clean", "date"])
)

daily_anomaly["roll7_mean"] = daily_anomaly.groupby("junction_clean")[
    "daily_count"
].transform(lambda x: x.shift(1).rolling(7, min_periods=3).mean())
daily_anomaly["roll7_std"] = daily_anomaly.groupby("junction_clean")[
    "daily_count"
].transform(lambda x: x.shift(1).rolling(7, min_periods=3).std())
daily_anomaly["z_score"] = (
    (daily_anomaly["daily_count"] - daily_anomaly["roll7_mean"])
    / daily_anomaly["roll7_std"].replace(0, np.nan)
).fillna(0)

anom_features = ["daily_count", "daily_impact", "main_road_frac", "z_score"]
iso = IsolationForest(n_estimators=200, contamination=0.05, random_state=42)
daily_anomaly["anomaly_flag"] = iso.fit_predict(daily_anomaly[anom_features].fillna(0))
daily_anomaly["anomaly_score"] = iso.decision_function(
    daily_anomaly[anom_features].fillna(0)
)

daily_anomaly.sort_values("anomaly_score").head(10)


latest_date = forecast_df["date_dt"].max()
latest_rows = forecast_df[forecast_df["date_dt"] == latest_date].copy()

latest_rows["predicted_next_day_violations"] = np.maximum(
    0, forecast_model.predict(latest_rows[feature_cols])
)

priority_base = latest_rows[["junction_clean", "predicted_next_day_violations"]].merge(
    junction_impact[
        [
            "junction_clean",
            "congestion_rank_score",
            "total_violations",
            "total_impact",
            "avg_lat",
            "avg_lon",
        ]
    ],
    on="junction_clean",
    how="left",
)

priority_base["pred_norm"] = normalize_series(
    priority_base["predicted_next_day_violations"]
)
priority_base["impact_norm"] = normalize_series(priority_base["congestion_rank_score"])
priority_base["hotspot_norm"] = normalize_series(priority_base["total_violations"])

priority_base["priority_score"] = (
    0.50 * priority_base["pred_norm"]
    + 0.30 * priority_base["impact_norm"]
    + 0.20 * priority_base["hotspot_norm"]
) * 100

priority_base = priority_base.sort_values(
    "priority_score", ascending=False
).reset_index(drop=True)
priority_base["priority_rank"] = np.arange(1, len(priority_base) + 1)

priority_base.head(20)


report = priority_base.head(10).copy()
report["recommended_officers"] = np.where(
    report["priority_score"] >= 85, 3, np.where(report["priority_score"] >= 65, 2, 1)
)
report["risk_level"] = pd.cut(
    report["priority_score"],
    bins=[-np.inf, 50, 70, 85, np.inf],
    labels=["Low", "Moderate", "High", "Critical"],
)

report = report[
    [
        "priority_rank",
        "junction_clean",
        "predicted_next_day_violations",
        "congestion_rank_score",
        "priority_score",
        "recommended_officers",
        "risk_level",
        "avg_lat",
        "avg_lon",
    ]
]

report


ARTIFACT_DIR.mkdir(exist_ok=True)

cluster_summary.to_csv(ARTIFACT_DIR / "cluster_summary.csv", index=False)
junction_impact.to_csv(ARTIFACT_DIR / "junction_impact.csv", index=False)
daily_anomaly.to_csv(ARTIFACT_DIR / "daily_anomaly.csv", index=False)
priority_base.to_csv(ARTIFACT_DIR / "priority_ranking.csv", index=False)
report.to_csv(ARTIFACT_DIR / "prediction_report.csv", index=False)

joblib.dump(dbscan_model, ARTIFACT_DIR / "dbscan_model.pkl")
joblib.dump(forecast_model, ARTIFACT_DIR / "forecast_model.pkl")
joblib.dump(iso, ARTIFACT_DIR / "anomaly_model.pkl")

with open(ARTIFACT_DIR / "forecast_metrics.json", "w", encoding="utf-8") as f:
    json.dump(
        {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "rows": int(len(df)),
            "clusters": int((cluster_summary["cluster_id"] >= 0).sum()),
            "forecast_metrics": forecast_metrics,
        },
        f,
        indent=2,
    )

print("Saved to:", ARTIFACT_DIR.resolve())
