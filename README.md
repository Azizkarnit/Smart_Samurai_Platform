# 🤖 Robot Race — Live Competition Dashboard

A real-time robot competition scoring and monitoring system built for **MakerLabs**. Operators score robots through a CLI script, and results stream live to a web dashboard powered by InfluxDB — showing challenge progress, timers, disqualifications, and a persistent leaderboard.

---

## 📸 Overview

This system was built to manage and display a **multi-challenge robot obstacle course competition in real time**.

> ⚠️ **This repository is a simulation/testing platform.**
> The operator scores robots manually through a CLI to simulate and validate the full pipeline — database writing, live dashboard updates, leaderboard persistence, and state transitions — before deploying the real hardware system.

### 🔬 Real-World Target System
In the actual competition, the CLI will be replaced by:
- **Sensors** placed across the course that automatically detect when a robot reaches or completes a challenge
- **Physical buttons** operated by on-site referees to verify each challenge outcome and award points — or register a disqualification — in real time
- The same InfluxDB + dashboard pipeline will be used, just fed by hardware instead of manual input

This simulation platform was essential to validate the entire data flow and dashboard behavior before the physical hardware is integrated.

---

## ⚙️ How It Works

```
Operator CLI (Python)
        │
        │  writes data on every event
        ▼
   InfluxDB (local)
        │
        │  polled every 1 second
        ▼
  Flask Web Server
        │
        │  serves dashboard + leaderboard API
        ▼
  Browser Dashboard (HTML/CSS/JS)
        │
        ├── Live challenge table
        ├── Status banners (Ready / Running / Disqualified / Finished)
        ├── Popup alerts
        └── Persistent leaderboard (saved to CSV)
```

---

## 🏁 Competition Flow

1. Operator types `start` → new robot registered, dashboard shows **READY TO RUN ?**
2. Operator types `dep` → timer starts, dashboard shows **RUN STARTED**
3. For each challenge completed, operator types `chall1` through `chall5` and selects a score tier (MIN / MED / MAX)
4. If the robot finishes, operator types `fin` → dashboard shows **🏆 HE MADE IT !!**
5. If the robot breaks a rule, operator types `disq` → dashboard flashes red and shows **❌ DISQUALIFIED**
6. Results are saved to the leaderboard and the CSV file automatically
7. Next `start` resets the table for the new robot

---

## 🏆 Challenges

| Command | Challenge | Max Points |
|---------|-----------|------------|
| `chall1` | HADH | 10 |
| `chall2` | ANUBIS | 20 |
| `chall3` | KBAR | 30 |
| `chall4` | CHAMS | 30 |
| `chall5` | SPIDER | 30 |
| `fin` | FINISH LINE | 10 |

---

## 🗂️ Project Structure

```
├── your_script.py        # Operator CLI — scores robots and writes to InfluxDB
├── server.py             # Flask server — serves dashboard + leaderboard CSV API
├── robot_dashboard.html  # Live dashboard frontend
├── leaderboard.csv       # Auto-generated — cleared on every server restart
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Database | InfluxDB v2 (time-series) |
| Backend | Python + Flask |
| Frontend | Vanilla HTML / CSS / JS |
| Fonts | Bebas Neue, Orbitron, Share Tech Mono |
| Data query | Flux query language |

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.x
- InfluxDB v2 installed and running
- An InfluxDB bucket named `makerlabs` under org `istic`

### Install dependencies
```bash
pip install flask influxdb-client
```

### Configure InfluxDB CORS (required for browser access)
Add these to your Windows System Environment Variables:
```
INFLUXD_HTTP_CORS_ENABLED = true
INFLUXD_HTTP_CORS_ORIGINS = *
```

---

## ▶️ Running the Project

Open **4 separate terminal windows** in this order:

**1. Start InfluxDB**
```cmd
cd C:\path\to\influxdb
influxd
```

**2. Start the dashboard server**
```cmd
python server.py
```
> ⚠️ This automatically clears `leaderboard.csv` on every start

**3. Open the dashboard in your browser**
```
http://localhost:5000/
```

**4. Start the scoring script**
```cmd
python your_script.py
```

---

## 🎮 Operator Commands

| Command | Action |
|---------|--------|
| `start` | Register a new robot |
| `dep` | Begin the run (starts timer) |
| `chall1` → `chall5` | Score each challenge |
| `fin` | Mark the robot as finished |
| `disq` | Disqualify the current robot |

---

## 📊 Leaderboard

- Displayed as a fixed sidebar on the dashboard
- Ranked by completion time (ascending) — faster robots rank higher
- Disqualified robots appear below finishers, ranked by score
- Saved automatically to `leaderboard.csv` after every run
- Can be manually cleared via the **🗑 CLEAR LEADERBOARD** button
- Exportable via the **⬇ EXPORT ALL RESULTS** button

---

## 👥 Authors

Built for the **MakerLabs Robotics Competition** at **ISTIC**.

---

## 🔮 Roadmap

- [ ] Replace CLI with sensor integration (auto-detect robot at each checkpoint)
- [ ] Add referee hardware buttons for challenge validation and disqualification
- [ ] Support multiple simultaneous robot tracking
- [ ] Add camera feed integration per challenge zone
- [ ] Mobile-friendly referee interface
