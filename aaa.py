import time
from influxdb_client import InfluxDBClient, Point, WritePrecision

# InfluxDB config
url = "http://127.0.0.1:8086"
token = "yMp_JdkvdiYNhW3H-MHbImYO08y6Amy_PNa2atWeQQ4WdDoH5-4YA8cFtBZXsmwoDmSiA-huLUJ07bUTGOegWQ=="
org = "istic"
bucket = "makerlabs"

client = InfluxDBClient(url=url, token=token, org=org)
write_api = client.write_api()

# Variables
deb = hadh = anub = kbar = chams = spider = fin = total = disq = 0
y = -1
id_robot = -1
t3 = 0

def send_data():
    point = Point("wokwi") \
        .tag("id_robot", str(id_robot)) \
        .field("deb", deb) \
        .field("challenge1", hadh) \
        .field("challenge2", anub) \
        .field("challenge3", kbar) \
        .field("challenge4", chams) \
        .field("challenge5", spider) \
        .field("fin", fin) \
        .field("dis", disq) \
        .field("temps_passe", int(time.time() - t3)) \
        .field("score", total)

    write_api.write(bucket=bucket, org=org, record=point)
    print("✅ Data sent")

print("🎮 Simulation Started")

from influxdb_client.client.delete_api import DeleteApi
from datetime import datetime, timezone

def reset_bucket():
    delete_api = client.delete_api()

    start = "1970-01-01T00:00:00Z"
    stop = datetime.now(timezone.utc).isoformat()

    delete_api.delete(
        start=start,
        stop=stop,
        predicate='',  # empty = delete everything
        bucket=bucket,
        org=org
    )
    print("🧹 Bucket cleared")

reset_bucket()
while True:
    cmd = input("Enter command: ").lower()

    # START (PUSHP)
    if cmd == "start":
        id_robot += 1
        print(f"Robot ID: {id_robot}")
        send_data()

    # DISQUALIFY (PUSHD)
    elif cmd == "disq":
        disq = 1
        send_data()
        print("❌ Disqualified")

    # DEP (start timing)
    elif cmd == "dep" and y == -1:
        t3 = time.time()
        deb = 1
        y = 0
        print("🚀 Started")
        send_data()
    # HADH
    elif cmd == "chall1" and y == 0:
        choice = input("MIN=10 / disq: ")
        if choice == "min":
            total += 10
            hadh = 1
        elif choice == "disq":
            disq = 1
        y = 1
        send_data()

    # ANUBIS
    elif cmd == "chall2" and y == 1:
        choice = input("MED=20 / MIN=10 / disq: ")
        if choice == "med":
            total += 20
            anub = 1
        elif choice == "min":
            total += 10
            anub = 1
        elif choice == "disq":
            disq = 1
        y = 2
        send_data()

    # KBAR
    elif cmd == "chall3" and y == 2:
        choice = input("MAX=30 / MED=20 / disq: ")
        if choice == "max":
            total += 30
            kbar = 1
        elif choice == "med":
            total += 20
            kbar = 1
        elif choice == "disq":
            disq = 1
        y = 3
        send_data()

    # CHAMS
    elif cmd == "chall4" and y == 3:
        choice = input("MAX=30 / MED=20 / MIN=10 / disq: ")
        if choice == "max":
            total += 30
            chams = 1
        elif choice == "med":
            total += 20
            chams = 1
        elif choice == "min":
            total += 10
            chams = 1
        elif choice == "disq":
            disq = 1
        y = 4
        send_data()

    # SPIDER
    elif cmd == "chall5" and y == 4:
        choice = input("MAX=30 / MED=20 / disq: ")
        if choice == "max":
            total += 30
            spider = 1
        elif choice == "med":
            total += 20
            spider = 1
        elif choice == "disq":
            disq = 1
        y = 5
        send_data()

    # FIN
    elif cmd == "fin" and y == 5:
        choice = input("MIN=10 / disq: ")
        if choice == "min":
            total += 10
            fin = 1
        elif choice == "disq":
            disq = 1
        y = 6
        send_data()

    # END
    if disq == 1 or y == 6:
        print(f"🏁 Final Score: {total}")
        print(f"⏱ Time: {int(time.time() - t3)} sec")
        
        send_data()

        # RESET
        deb = hadh = anub = kbar = chams = spider = fin = total = disq = 0
        y = -1
        t3 = 0