/*
 * ═══════════════════════════════════════════════════════════════
 *  PATH OF THE SAMURAI — ESP32 Competition Controller  v2
 * ═══════════════════════════════════════════════════════════════
 *
 *  ── SENSOR / BUTTON MAPPING ───────────────────────────────────
 *  sensor_1  GPIO 21  → DEP (start run) — then reused for C5+FIN
 *  sensor_2  GPIO 22  → Challenge 1
 *  sensor_3  GPIO 23  → Challenge 2
 *  sensor_4  GPIO 25  → Challenge 3
 *  sensor_5  GPIO 26  → Challenge 4
 *  sensor_1  GPIO 21  → Challenge 5 + FIN  (same pin, second pass)
 *
 *  button_start    GPIO 4   → select next player (always allowed)
 *  button_dep      GPIO 18  → CLEAR DATABASE (deletes InfluxDB bucket data)
 *  button_disq     GPIO 5   → disqualify  (only during active run)
 *  button_override GPIO 19  → manually confirm current challenge (only during active run)
 *
 *  led_ok          GPIO 2   → feedback blinks
 *
 *  ── TIMER ─────────────────────────────────────────────────────
 *  Starts when sensor_1 fires DEP.
 *  Stops (and saves run_time_ms to InfluxDB) when FIN or DISQ.
 * ═══════════════════════════════════════════════════════════════
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ───────────────────────────────────────────────────────────────
//  CONFIGURATION
// ───────────────────────────────────────────────────────────────
const char* WIFI_SSID   = "ISTIC_Line_Follower";
const char* WIFI_PASS   = "Platform2026";

const char* INFLUX_HOST   = "192.168.1.3";
const int   INFLUX_PORT   = 8086;
const char* INFLUX_TOKEN  = "yMp_JdkvdiYNhW3H-MHbImYO08y6Amy_PNa2atWeQQ4WdDoH5-4YA8cFtBZXsmwoDmSiA-huLUJ07bUTGOegWQ==";
const char* INFLUX_ORG    = "istic";
const char* INFLUX_BUCKET = "makerlabs";

// ───────────────────────────────────────────────────────────────
//  PIN DEFINITIONS
// ───────────────────────────────────────────────────────────────
const int PIN_BTN_START    = 4;
const int PIN_BTN_DISQ     = 5;
const int PIN_BTN_DEP      = 18;   // Now: CLEAR DATABASE
const int PIN_BTN_OVERRIDE = 19;

const int PIN_S1 = 26;   // DEP trigger AND C5+FIN trigger
const int PIN_S2 = 23;   // Challenge 1
const int PIN_S3 = 25;   // Challenge 2
const int PIN_S4 = 21;   // Challenge 3
const int PIN_S5 = 22;   // Challenge 4

const int PIN_LED = 2;

// ───────────────────────────────────────────────────────────────
//  DEBOUNCE / COOLDOWN
// ───────────────────────────────────────────────────────────────
const unsigned long COOLDOWN_MS = 300;

// ───────────────────────────────────────────────────────────────
//  STATE
// ───────────────────────────────────────────────────────────────
int  id_robot  = -1;
int  deb       = 0;
int  c1=0, c2=0, c3=0, c4=0, c5=0;
int  fin_flag  = 0;
int  disq_flag = 0;
int  score     = 0;

// step:
//  -1 = waiting for player selection (START)
//   0 = player selected, waiting for DEP (sensor_1 first pass)
//   1 = run active, waiting for C1 (sensor_2)
//   2 = waiting for C2 (sensor_3)
//   3 = waiting for C3 (sensor_4)
//   4 = waiting for C4 (sensor_5)
//   5 = waiting for C5+FIN (sensor_1 second pass)
int  step = -1;

bool run_active = false;

unsigned long run_start_ms     = 0;
unsigned long run_elapsed_ms   = 0;
unsigned long lastChallengeTime = 0;

// Edge-detection last states
int lastStart = HIGH, lastDisq = HIGH;
int lastDep   = HIGH, lastOvr  = HIGH;
int lastS1 = HIGH, lastS2 = HIGH, lastS3 = HIGH;
int lastS4 = HIGH, lastS5 = HIGH;

// ───────────────────────────────────────────────────────────────
//  HELPERS
// ───────────────────────────────────────────────────────────────
void blinkLED(int times = 1) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, HIGH); delay(80);
    digitalWrite(PIN_LED, LOW);  delay(80);
  }
}

void blinkLED_error() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, HIGH); delay(40);
    digitalWrite(PIN_LED, LOW);  delay(40);
  }
}

// ── InfluxDB: write current run state ──────────────────────────
void sendToInflux() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[influx] ⚠ WiFi not connected — skipping");
    return;
  }

  String body = "wokwi,id_robot=";
  body += String(id_robot);
  body += " ";
  body += "deb="         + String(deb)           + "i,";
  body += "challenge1="  + String(c1)            + "i,";
  body += "challenge2="  + String(c2)            + "i,";
  body += "challenge3="  + String(c3)            + "i,";
  body += "challenge4="  + String(c4)            + "i,";
  body += "challenge5="  + String(c5)            + "i,";
  body += "fin="         + String(fin_flag)       + "i,";
  body += "dis="         + String(disq_flag)      + "i,";
  body += "score="       + String(score)          + "i,";
  body += "run_time_ms=" + String(run_elapsed_ms) + "i";

  String url = String("http://") + INFLUX_HOST + ":" + INFLUX_PORT
             + "/api/v2/write?org=" + INFLUX_ORG
             + "&bucket=" + INFLUX_BUCKET
             + "&precision=s";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", String("Token ") + INFLUX_TOKEN);
  http.addHeader("Content-Type",  "text/plain; charset=utf-8");

  int code = http.POST(body);
  if (code == 204 || code == 200) {
    Serial.println("[influx] ✅ Sent  (HTTP " + String(code) + ")");
  } else {
    Serial.println("[influx] ❌ HTTP " + String(code) + " — " + http.getString());
  }
  http.end();
}

// ── InfluxDB: DELETE all data in the bucket ────────────────────
//  Uses the InfluxDB v2 /api/v2/delete endpoint with a wide time range.
void clearInfluxDB() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[influx] ⚠ WiFi not connected — cannot clear DB");
    blinkLED_error();
    return;
  }

  String url = String("http://") + INFLUX_HOST + ":" + INFLUX_PORT
             + "/api/v2/delete?org=" + INFLUX_ORG
             + "&bucket=" + INFLUX_BUCKET;

  // Delete everything from epoch 0 to far future
  String body = "{\"start\":\"1970-01-01T00:00:00Z\",\"stop\":\"2099-12-31T23:59:59Z\"}";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", String("Token ") + INFLUX_TOKEN);
  http.addHeader("Content-Type",  "application/json");

  int code = http.POST(body);
  if (code == 204 || code == 200) {
    Serial.println("[influx] 🗑️  Database cleared (HTTP " + String(code) + ")");
    blinkLED(5);
  } else {
    Serial.println("[influx] ❌ Clear failed HTTP " + String(code) + " — " + http.getString());
    blinkLED_error();
  }
  http.end();
}

// ── End of run (FIN or DISQ) ───────────────────────────────────
void endRun() {
  run_elapsed_ms = millis() - run_start_ms;

  Serial.print("🏁 Score: ");      Serial.println(score);
  Serial.print("⏱  Run time: ");   Serial.print(run_elapsed_ms); Serial.println(" ms");
  Serial.print("   Challenges: "); Serial.println(String(c1+c2+c3+c4+c5) + "/5");

  sendToInflux();   // saves final state + run_time_ms

  // Reset run variables (keep id_robot)
  deb = c1 = c2 = c3 = c4 = c5 = fin_flag = disq_flag = score = 0;
  run_elapsed_ms = 0;
  step = -1;        // back to "waiting for next player START"
  run_active = false;
}

// ───────────────────────────────────────────────────────────────
//  SETUP
// ───────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BTN_START,    INPUT_PULLUP);
  pinMode(PIN_BTN_DISQ,     INPUT_PULLUP);
  pinMode(PIN_BTN_DEP,      INPUT_PULLUP);
  pinMode(PIN_BTN_OVERRIDE, INPUT_PULLUP);
  pinMode(PIN_S1, INPUT_PULLUP);
  pinMode(PIN_S2, INPUT_PULLUP);
  pinMode(PIN_S3, INPUT_PULLUP);
  pinMode(PIN_S4, INPUT_PULLUP);
  pinMode(PIN_S5, INPUT_PULLUP);

  Serial.print("[wifi] Connecting to "); Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500); Serial.print("."); attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[wifi] ✅ Connected — IP: " + WiFi.localIP().toString());
    blinkLED(3);
  } else {
    Serial.println("\n[wifi] ⚠ Could not connect — running offline");
    blinkLED_error();
  }

  Serial.println("═══════════════════════════════════════════");
  Serial.println(" PATH OF THE SAMURAI v2 — Ready");
  Serial.println("  START btn   → select next player");
  Serial.println("  DEP btn     → CLEAR DATABASE");
  Serial.println("  Sensor 1    → DEP start (then C5+FIN)");
  Serial.println("  Sensor 2–5  → Challenges 1–4");
  Serial.println("  OVERRIDE    → manual confirm (run only)");
  Serial.println("  DISQ btn    → disqualify (run only)");
  Serial.println("═══════════════════════════════════════════");
}

// ───────────────────────────────────────────────────────────────
//  LOOP
// ───────────────────────────────────────────────────────────────
void loop() {
  int bStart = digitalRead(PIN_BTN_START);
  int bDisq  = digitalRead(PIN_BTN_DISQ);
  int bDep   = digitalRead(PIN_BTN_DEP);
  int bOvr   = digitalRead(PIN_BTN_OVERRIDE);

  int vs1 = digitalRead(PIN_S1);
  int vs2 = digitalRead(PIN_S2);
  int vs3 = digitalRead(PIN_S3);
  int vs4 = digitalRead(PIN_S4);
  int vs5 = digitalRead(PIN_S5);

  unsigned long now = millis();

  // ── START button — always allowed ────────────────────────────
  //  Registers the next player. Does NOT reset an active run.
  if (bStart == LOW && lastStart == HIGH) {
    if (run_active) {
      // Allow selection of next player ID but warn operator
      Serial.println("⚠  Run still active! Registering next player ID anyway.");
    }
    id_robot++;
    // Reset all fields for the new player slot
    deb = c1 = c2 = c3 = c4 = c5 = fin_flag = disq_flag = score = 0;
    run_elapsed_ms = 0;
    step = 0;          // waiting for DEP (sensor_1)
    run_active = false;
    Serial.println("🤖 Player #" + String(id_robot) + " selected — waiting for DEP sensor");
    sendToInflux();
    blinkLED(2);
  }

  // ── DEP button — CLEAR DATABASE ──────────────────────────────
  if (bDep == LOW && lastDep == HIGH) {
    Serial.println("🗑️  DEP button: clearing InfluxDB...");
    clearInfluxDB();
  }

  // ── DISQUALIFY button — only during active run ────────────────
  if (bDisq == LOW && lastDisq == HIGH) {
    if (!run_active) {
      Serial.println("⚠  DISQ ignored — no active run");
      blinkLED_error();
    } else {
      disq_flag = 1;
      Serial.println("❌ DISQUALIFIED");
      endRun();
      blinkLED(4);
    }
  }

  // ── OVERRIDE button — two roles ──────────────────────────────
  //  1) depOverride: backs up Sensor 1 as DEP trigger (step 0, before run starts)
  //  2) challengeOverride: confirms current challenge (during active run)
  bool depOverride       = (bOvr == LOW && lastOvr == HIGH) && (step == 0);
  bool challengeOverride = (bOvr == LOW && lastOvr == HIGH)
                         && run_active
                         && (now - lastChallengeTime > COOLDOWN_MS);

  // ── SENSOR / STEP LOGIC ───────────────────────────────────────

  // STEP 0: Waiting for DEP → Sensor 1 (first pass) OR override button backup
  if (step == 0) {
    bool sensorFire = (vs1 == LOW && lastS1 == HIGH);
    if (sensorFire || depOverride) {
      deb = 1;
      step = 1;
      run_active = true;
      run_start_ms = millis();
      lastChallengeTime = now;
      if (depOverride && !sensorFire)
        Serial.println("🚀 DEP override (button) — run started! Timer running...");
      else
        Serial.println("🚀 DEP sensor — run started! Timer running...");
      sendToInflux();
      blinkLED(1);
    }
  }

  // STEP 1: Challenge 1 → Sensor 2
  else if (step == 1) {
    bool sensorFire = (vs2 == LOW && lastS2 == HIGH);
    if (sensorFire || challengeOverride) {
      c1 = 1; score += 20; step = 2;
      lastChallengeTime = now;
      Serial.println("✅ Challenge 1 — BAMBOO FOREST  (+20)  score=" + String(score));
      sendToInflux();
      blinkLED(1);
    }
  }

  // STEP 2: Challenge 2 → Sensor 3
  else if (step == 2) {
    bool sensorFire = (vs3 == LOW && lastS3 == HIGH);
    if (sensorFire || challengeOverride) {
      c2 = 1; score += 20; step = 3;
      lastChallengeTime = now;
      Serial.println("✅ Challenge 2 — KATANA FORGE  (+20)  score=" + String(score));
      sendToInflux();
      blinkLED(1);
    }
  }

  // STEP 3: Challenge 3 → Sensor 4
  else if (step == 3) {
    bool sensorFire = (vs4 == LOW && lastS4 == HIGH);
    if (sensorFire || challengeOverride) {
      c3 = 1; score += 20; step = 4;
      lastChallengeTime = now;
      Serial.println("✅ Challenge 3 — DARK FOREST  (+20)  score=" + String(score));
      sendToInflux();
      blinkLED(1);
    }
  }

  // STEP 4: Challenge 4 → Sensor 5
  else if (step == 4) {
    bool sensorFire = (vs5 == LOW && lastS5 == HIGH);
    if (sensorFire || challengeOverride) {
      c4 = 1; score += 20; step = 5;
      lastChallengeTime = now;
      Serial.println("✅ Challenge 4 — BROKEN BRIDGE  (+20)  score=" + String(score));
      sendToInflux();
      blinkLED(1);
    }
  }

  // STEP 5: Challenge 5 + FIN → Sensor 1 (second pass)
  else if (step == 5) {
    bool sensorFire = (vs1 == LOW && lastS1 == HIGH);
    if (sensorFire || challengeOverride) {
      c5 = 1; fin_flag = 1; score += 20; step = 6;
      lastChallengeTime = now;
      Serial.println("✅ Challenge 5 — BALANCE YIN-YANG + FIN  (+20)  score=" + String(score));
      Serial.println("🏆 RUN COMPLETE");
      endRun();
      blinkLED(5);
    }
  }

  // ── Save last states ─────────────────────────────────────────
  lastStart = bStart;
  lastDisq  = bDisq;
  lastDep   = bDep;
  lastOvr   = bOvr;
  lastS1 = vs1; lastS2 = vs2; lastS3 = vs3;
  lastS4 = vs4; lastS5 = vs5;

  delay(10);
}
