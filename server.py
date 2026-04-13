"""
Robot Race Dashboard Server
============================
Run:  python server.py
Open: http://localhost:5000/
"""

import csv
import os
from datetime import datetime
from flask import Flask, send_from_directory, request, jsonify

# ── Config ─────────────────────────────────────────────
PORT         = 5000
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
HTML_FILE    = "dashboard_video.html"   # change to dashboard_animated.html if needed
STATIC_DIR   = os.path.join(SCRIPT_DIR, "static")
CSV_FILE     = os.path.join(SCRIPT_DIR, "leaderboard.csv")
PLAYERS_FILE = os.path.join(SCRIPT_DIR, "homologation.csv")

CSV_FIELDS = [
    "rank", "robotId", "robotName", "leader", "club", "run",
    "score", "time", "H", "challenges",
    "challenge1", "challenge2", "challenge3", "challenge4", "challenge5",
    "fin", "finished", "disq", "timestamp"
]

app = Flask(__name__)
os.makedirs(STATIC_DIR, exist_ok=True)

# ── Clear leaderboard CSV on every startup ──────────────
def clear_csv():
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=CSV_FIELDS).writeheader()
    print(f"[server] CSV cleared → {CSV_FILE}")

# ── Routes ──────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(SCRIPT_DIR, HTML_FILE)

# Serve anything in /static/ (video, images, etc.)
@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

# Serve css/, js/, map files etc. from root folder
@app.route("/<path:filepath>")
def root_files(filepath):
    if filepath.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(SCRIPT_DIR, filepath)

# ── Players — read from homologation.csv ───────────────
@app.route("/api/players", methods=["GET"])
def get_players():
    """
    Returns an ordered list from homologation.csv.
    Index 0 = first row = InfluxDB id_robot 0, etc.
    """
    players = []
    if not os.path.exists(PLAYERS_FILE):
        return jsonify({"error": "homologation.csv not found"}), 404
    with open(PLAYERS_FILE, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            players.append({
                "csvId":            row.get("id_robot",            "").strip(),
                "leader":           row.get("Leader_name",         "").strip(),
                "robotName":        row.get("Robot_name",          "").strip(),
                "club":             row.get("Nom_club",            "").strip(),
                "homologation_score": row.get("homologation_score","0").strip(),
            })
    return jsonify(players)

# ── Leaderboard GET ─────────────────────────────────────
@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    entries = []
    if not os.path.exists(CSV_FILE):
        return jsonify([])
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            entries.append({
                "robotId":    int(row.get("robotId",    0)),
                "robotName":  row.get("robotName",  ""),
                "leader":     row.get("leader",     ""),
                "club":       row.get("club",       ""),
                "run":        int(row.get("run",    1)),
                "score":      int(row.get("score",  0)),
                "time":       int(row.get("time",   0)),
                "H":          float(row.get("H", 0) or 0),
                "challenges": int(row.get("challenges", 0)),
                "c1":  row.get("challenge1", "NO") == "YES",
                "c2":  row.get("challenge2", "NO") == "YES",
                "c3":  row.get("challenge3", "NO") == "YES",
                "c4":  row.get("challenge4", "NO") == "YES",
                "c5":  row.get("challenge5", "NO") == "YES",
                "fin": row.get("fin",        "NO") == "YES",
                "finished": row.get("finished", "NO") == "YES",
                "disq":     row.get("disq",     "NO") == "YES",
                "ts":  row.get("timestamp", ""),
            })
    return jsonify(entries)

# ── Leaderboard POST ────────────────────────────────────
@app.route("/api/leaderboard", methods=["POST"])
def save_leaderboard():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "expected JSON array"}), 400
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for i, e in enumerate(data):
            writer.writerow({
                "rank":       i + 1,
                "robotId":    e.get("robotId",   ""),
                "robotName":  e.get("robotName", ""),
                "leader":     e.get("leader",    ""),
                "club":       e.get("club",      ""),
                "run":        e.get("run",       1),
                "score":      e.get("score",     0),
                "time":       e.get("time",      0),
                "H":          e.get("H",         0),
                "challenges": e.get("challenges",0),
                "challenge1": "YES" if e.get("c1")  else "NO",
                "challenge2": "YES" if e.get("c2")  else "NO",
                "challenge3": "YES" if e.get("c3")  else "NO",
                "challenge4": "YES" if e.get("c4")  else "NO",
                "challenge5": "YES" if e.get("c5")  else "NO",
                "fin":        "YES" if e.get("fin") else "NO",
                "finished":   "YES" if e.get("finished") else "NO",
                "disq":       "YES" if e.get("disq")     else "NO",
                "timestamp":  e.get("ts", datetime.now().isoformat()),
            })
    print(f"[server] Leaderboard saved — {len(data)} entries")
    return jsonify({"saved": len(data)})

# ── Start ────────────────────────────────────────────────
if __name__ == "__main__":
    clear_csv()
    print(f"[server] Dashboard → http://localhost:{PORT}/")
    print(f"[server] Place video → {STATIC_DIR}/robot_run_record.mp4")
    app.run(host="0.0.0.0", port=PORT, debug=False)
