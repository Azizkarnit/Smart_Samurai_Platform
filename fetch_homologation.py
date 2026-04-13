"""
fetch_homologation.py
======================
Fetches homologation data from Supabase and writes
homologation.csv in the format expected by server.py / main.py.

Usage:
    pip install supabase
    python fetch_homologation.py

Output:  homologation.csv  (same folder as this script)

Column mapping:
  Supabase              → CSV
  Leader_name           → Leader_name
  Robot_name            → Robot_name
  Club_name             → Nom_club
  Total_homologation_point → homologation_score
  (auto index)          → id_robot  (0-based, matches dashboard jsPlayerIdx)
"""

import csv
import os
import random

from supabase import create_client

# ── Supabase config ────────────────────────────────
SUPABASE_URL = "https://yzskwaehciljlhkysrln.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2t3YWVoY2lsamxoa3lzcmxuIiwicm9sZSI6Im"
    "Fub24iLCJpYXQiOjE3NzQ0Nzg1NDYsImV4cCI6MjA5MDA1NDU0Nn0."
    "fdxbKULvLF_vjuKgQ9ZzVt6asjTF_rkJJqWJJ-BKL-o"
)
TABLE_NAME   = "Line follower"

# ── Output file ────────────────────────────────────
OUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "homologation.csv")

# ── CSV columns (must match server.py expectations) ──
CSV_FIELDS = ["id_robot", "Leader_name", "Robot_name", "Nom_club", "homologation_score"]


def fetch_and_save():
    print("Connecting to Supabase…")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    response = supabase.table(TABLE_NAME).select(
        "Leader_name, Robot_name, Club_name, Total_homologation_point"
    ).execute()

    data = response.data
    if not data:
        print("⚠  No data returned from Supabase.")
        return

    print(f"✅ Fetched {len(data)} players")

    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for idx, row in enumerate(data):
            writer.writerow({
                "id_robot":           idx + 1,           # 1-based in CSV (server converts to 0-based idx)
                "Leader_name":        row.get("Leader_name",                "").strip(),
                "Robot_name":         row.get("Robot_name",                 "").strip(),
                "Nom_club":           row.get("Club_name",                  "").strip(),
                "homologation_score": row.get("Total_homologation_point",   0),
            })

    print(f"📄 Saved → {OUT_FILE}")
    print(f"   {len(data)} rows written")

    # Preview first 3 rows
    print("\nPreview:")
    for row in data[:3]:
        name  = row.get("Robot_name", "?")
        score = row.get("Total_homologation_point", "?")
        print(f"  {name} → H={score}")
    if len(data) > 3:
        print(f"  … and {len(data)-3} more")


if __name__ == "__main__":
    fetch_and_save()
