"""
Robot Race Dashboard Server
============================
Serves the dashboard HTML and provides /api endpoints
to persist the leaderboard as a CSV file.

The CSV is CLEARED automatically every time this server starts.

Usage:
    pip install flask
    python server.py

Then open:  http://localhost:5000/
"""

import csv
import json
import os
from datetime import datetime
from flask import Flask, send_from_directory, request, jsonify

# ── Config ────────────────────────────────────────────────────
PORT        = 5000
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
HTML_FILE   = "robot_dashboard.html"
CSV_FILE    = os.path.join(SCRIPT_DIR, "leaderboard.csv")

CSV_FIELDS  = [
    "rank", "robotId", "score", "time", "challenges",
    "challenge1", "challenge2", "challenge3", "challenge4", "challenge5",
    "fin", "finished", "disq", "timestamp"
]

app = Flask(__name__, static_folder=SCRIPT_DIR)

# ── Clear CSV on startup ──────────────────────────────────────
def clear_csv():
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
    print(f"[server] ✅ CSV cleared → {CSV_FILE}")

# ── Routes ────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(SCRIPT_DIR, HTML_FILE)

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    """Return current leaderboard as JSON array."""
    entries = []
    if not os.path.exists(CSV_FILE):
        return jsonify([])
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            entries.append({
                "robotId":    int(row.get("robotId",    0)),
                "score":      int(row.get("score",      0)),
                "time":       int(row.get("time",       0)),
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


@app.route("/api/leaderboard", methods=["POST"])
def save_leaderboard():
    """Receive full leaderboard JSON array and overwrite the CSV."""
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "expected a JSON array"}), 400

    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for i, entry in enumerate(data):
            writer.writerow({
                "rank":        i + 1,
                "robotId":     entry.get("robotId",    ""),
                "score":       entry.get("score",      0),
                "time":        entry.get("time",       0),
                "challenges":  entry.get("challenges", 0),
                "challenge1":  "YES" if entry.get("c1")  else "NO",
                "challenge2":  "YES" if entry.get("c2")  else "NO",
                "challenge3":  "YES" if entry.get("c3")  else "NO",
                "challenge4":  "YES" if entry.get("c4")  else "NO",
                "challenge5":  "YES" if entry.get("c5")  else "NO",
                "fin":         "YES" if entry.get("fin") else "NO",
                "finished":    "YES" if entry.get("finished") else "NO",
                "disq":        "YES" if entry.get("disq")     else "NO",
                "timestamp":   entry.get("ts", datetime.now().isoformat()),
            })

    print(f"[server] 💾 Leaderboard saved — {len(data)} entries")
    return jsonify({"saved": len(data)})


# ── Start ─────────────────────────────────────────────────────
if __name__ == "__main__":
    clear_csv()   # wipe CSV every time server starts
    print(f"[server] 🚀 Dashboard → http://localhost:{PORT}/")
    app.run(host="0.0.0.0", port=PORT, debug=False)
