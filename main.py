import time, json, os
from influxdb_client import InfluxDBClient, Point
from datetime import datetime, timezone

# ── InfluxDB config ────────────────────────────────
url    = "http://127.0.0.1:8086"
token  = "yMp_JdkvdiYNhW3H-MHbImYO08y6Amy_PNa2atWeQQ4WdDoH5-4YA8cFtBZXsmwoDmSiA-huLUJ07bUTGOegWQ=="
org    = "istic"
bucket = "makerlabs"

client    = InfluxDBClient(url=url, token=token, org=org)
write_api = client.write_api()

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "robot_state.json")

# ── State ──────────────────────────────────────────
id_robot = -1
deb = c1 = c2 = c3 = c4 = c5 = fin = total = disq = 0
y = -1          # -1=waiting for dep, 0=after dep, 1-5=challenges done
run_active = False   # True between dep and end_run

# ── Persistence helpers ────────────────────────────
def save_state():
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump({"id_robot": id_robot}, f)
    except Exception as e:
        print(f"⚠ Could not save state: {e}")

def load_state():
    """Returns saved id_robot or -1 if no state file."""
    if not os.path.exists(STATE_FILE):
        return -1
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
            return int(data.get("id_robot", -1))
    except Exception:
        return -1

def clear_state():
    if os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)

def reset_bucket():
    delete_api = client.delete_api()
    delete_api.delete(
        start="1970-01-01T00:00:00Z",
        stop=datetime.now(timezone.utc).isoformat(),
        predicate='',
        bucket=bucket,
        org=org
    )
    print("🧹 InfluxDB bucket cleared")

# ── Send data ──────────────────────────────────────
def send_data():
    point = Point("wokwi") \
        .tag("id_robot", str(id_robot)) \
        .field("deb",        int(deb))   \
        .field("challenge1", int(c1))    \
        .field("challenge2", int(c2))    \
        .field("challenge3", int(c3))    \
        .field("challenge4", int(c4))    \
        .field("challenge5", int(c5))    \
        .field("fin",        int(fin))   \
        .field("dis",        int(disq))  \
        .field("score",      int(total))
    write_api.write(bucket=bucket, org=org, record=point)
    print("✅ Sent")

def end_run():
    global deb, c1, c2, c3, c4, c5, fin, total, disq, y, run_active
    print(f"🏁 Final Score : {total} pts  |  Challenges: {sum([c1,c2,c3,c4,c5])}/5")
    send_data()
    save_state()   # persist id_robot so restart resumes from here
    deb = c1 = c2 = c3 = c4 = c5 = fin = total = disq = 0
    y = -1
    run_active = False

# ── Boot ───────────────────────────────────────────
print("🎮 Simulation Started")
print("Commands: start | dep | chall1-5 | fin | disq")
print("─" * 44)

saved_id = load_state()
if saved_id >= 0:
    id_robot = saved_id
    print(f"♻  Resuming from saved state — last id_robot was #{id_robot}")
    print(f"   Next player will be #{id_robot + 1}")
    print("   (Type 'resetall' to wipe and start fresh)")
else:
    reset_bucket()
    print("🆕 Fresh start — bucket cleared")

# ── Main loop ──────────────────────────────────────
while True:
    cmd = input("▶ ").strip().lower()

    # ── RESET ALL (fresh start) ─────────────────────
    if cmd == "resetall":
        confirm = input("⚠  This clears ALL data. Type 'yes' to confirm: ").strip().lower()
        if confirm == "yes":
            reset_bucket()
            clear_state()
            id_robot = -1
            deb = c1 = c2 = c3 = c4 = c5 = fin = total = disq = 0
            y = -1
            run_active = False
            print("✅ Full reset done — fresh start")
        else:
            print("Cancelled.")
        continue

    # ── START ──────────────────────────────────────
    if cmd == "start":
        if run_active:
            print("⚠  A run is already active — type 'disq' or wait for fin before start")
            continue
        if y != -1:
            print("⚠  Previous robot still active — type 'disq' to end it first")
            continue
        id_robot += 1
        deb = c1 = c2 = c3 = c4 = c5 = fin = total = disq = 0
        y = -1
        print(f"🤖 Robot #{id_robot} registered — type 'dep' to start run")
        send_data()

    # ── DEP ────────────────────────────────────────
    elif cmd == "dep":
        if id_robot < 0:
            print("⚠  Type 'start' first")
            continue
        if run_active:
            print("⚠  Run already started")
            continue
        deb = 1
        y   = 0
        run_active = True
        print("🚀 Run started!")
        send_data()

    # ── CHALLENGES ─────────────────────────────────
    elif cmd == "chall1":
        if y != 0: print(f"⚠  Not at challenge 1 (step={y})"); continue
        c1=1; total+=20; y=1
        print("✅ Challenge 1 — HADH  (+20 pts)")
        send_data()

    elif cmd == "chall2":
        if y != 1: print(f"⚠  Not at challenge 2 (step={y})"); continue
        c2=1; total+=20; y=2
        print("✅ Challenge 2 — ANUBIS  (+20 pts)")
        send_data()

    elif cmd == "chall3":
        if y != 2: print(f"⚠  Not at challenge 3 (step={y})"); continue
        c3=1; total+=20; y=3
        print("✅ Challenge 3 — KBAR  (+20 pts)")
        send_data()

    elif cmd == "chall4":
        if y != 3: print(f"⚠  Not at challenge 4 (step={y})"); continue
        c4=1; total+=20; y=4
        print("✅ Challenge 4 — CHAMS  (+20 pts)")
        send_data()

    elif cmd in ("chall5", "fin"):
        if y != 4: print(f"⚠  Not at challenge 5 (step={y})"); continue
        c5=1; fin=1; total+=20; y=5
        print("✅ Challenge 5 — SPIDER + FIN  (+20 pts)")
        send_data()
        end_run()

    # ── DISQUALIFY ─────────────────────────────────
    elif cmd == "disq":
        if not run_active:
            print("⚠  No active run to disqualify")
            continue
        disq = 1
        print("❌ DISQUALIFIED")
        send_data()
        end_run()

    else:
        print("Commands: start | dep | chall1 | chall2 | chall3 | chall4 | chall5 | fin | disq | resetall")
