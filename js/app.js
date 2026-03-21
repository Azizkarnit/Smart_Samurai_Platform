/* ──────────────────────────────────────────
   CONFIG  –  edit if needed
────────────────────────────────────────── */
const CFG = {
  url:    'http://127.0.0.1:8086',
  token:  'yMp_JdkvdiYNhW3H-MHbImYO08y6Amy_PNa2atWeQQ4WdDoH5-4YA8cFtBZXsmwoDmSiA-huLUJ07bUTGOegWQ==',
  org:    'istic',
  bucket: 'makerlabs',
  poll:   1000
};

/* ──────────────────────────────────────────
   STATIC MAPS
────────────────────────────────────────── */
const CHALLENGE_KEYS  = ['challenge1','challenge2','challenge3','challenge4','challenge5','fin'];
const CHALLENGE_NAMES = { challenge1:'HADH', challenge2:'ANUBIS', challenge3:'KBAR', challenge4:'CHAMS', challenge5:'SPIDER', fin:'FINISH LINE' };

/* ──────────────────────────────────────────
   STATE
────────────────────────────────────────── */
let S = {
  phase:          'IDLE',  // IDLE | READY | RUNNING | DISQ | FINISHED
  robotId:        -2,      // -2 = never seen anything
  prevData:       null,
  tableRows:      [],      // challenge keys already rendered
  prevScore:      0,
  popupOpen:      false,
  leaderboard:    [],
};

/* ──────────────────────────────────────────
   INFLUXDB  –  query latest point (pivoted)
────────────────────────────────────────── */
const FLUX = (bucket, org) => `
from(bucket: "${bucket}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "wokwi")
  |> last()
  |> pivot(rowKey:["id_robot"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["id_robot"], desc: true)
  |> limit(n: 1)
`;

async function queryInflux() {
  const res = await fetch(`${CFG.url}/api/v2/query?org=${encodeURIComponent(CFG.org)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${CFG.token}`,
      'Content-Type':  'application/vnd.flux',
      'Accept':        'application/csv'
    },
    body: FLUX(CFG.bucket, CFG.org)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return parseInfluxCSV(await res.text());
}

/* ──────────────────────────────────────────
   PARSE  –  InfluxDB annotated CSV
────────────────────────────────────────── */
function parseInfluxCSV(text) {
  const lines = text.split('\n');
  let headers = null;
  const rows  = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const vals = line.split(',');
    if (!headers) { headers = vals.map(v => v.trim()); continue; }
    if (vals.length < 2) continue;
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function extractData(rows) {
  if (!rows || rows.length === 0) return null;
  // Always use the row with the highest id_robot (most recent robot)
  const r = rows.reduce((best, cur) => {
    const a = parseInt(cur['id_robot'] ?? '-1');
    const b = parseInt(best['id_robot'] ?? '-1');
    return a > b ? cur : best;
  }, rows[0]);
  return {
    id_robot:   parseInt(r['id_robot']   ?? '-1'),
    deb:        parseInt(r['deb']        ?? '0'),
    challenge1: parseInt(r['challenge1'] ?? '0'),
    challenge2: parseInt(r['challenge2'] ?? '0'),
    challenge3: parseInt(r['challenge3'] ?? '0'),
    challenge4: parseInt(r['challenge4'] ?? '0'),
    challenge5: parseInt(r['challenge5'] ?? '0'),
    fin:        parseInt(r['fin']        ?? '0'),
    dis:        parseInt(r['dis']        ?? '0'),
    score:      parseInt(r['score']      ?? '0'),
    temps_passe:parseInt(r['temps_passe']?? '0'),
    _time: r['_time'] || ''
  };
}

/* ──────────────────────────────────────────
   POLL LOOP
────────────────────────────────────────── */
let polling = false;

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const rows = await queryInflux();
    const data = extractData(rows);

    // Mark connection live
    document.getElementById('connDot').classList.add('live');
    document.getElementById('connText').textContent = 'LIVE';
    document.getElementById('lastPoll').innerHTML =
      `LAST POLL: <span>${new Date().toLocaleTimeString()}</span>`;

    if (data) processData(data);

  } catch (err) {
    document.getElementById('connDot').classList.remove('live');
    document.getElementById('connText').textContent = 'ERR: ' + String(err.message).slice(0,45);
    console.error('[poll]', err);
  } finally {
    polling = false;
  }
}

/* ──────────────────────────────────────────
   STATE MACHINE
────────────────────────────────────────── */
function processData(d) {
  const prev = S.prevData;

  /* ── NEW ROBOT: "start" was typed → Python incremented id_robot and reset all vars to 0 ── */
  if (d.id_robot >= 0 && d.id_robot !== S.robotId) {
    onNewRobot(d);  // clears table, shows READY TO RUN ?
    S.prevData = { ...d };
    return;
  }

  /* ── Run is fully over: do nothing until we see a new id_robot ── */
  if (S.phase === 'DISQ' || S.phase === 'FINISHED') {
    // Don't update prevData here — keep it frozen so we don't drift
    return;
  }

  /* ── READY phase: waiting for dep command → deb becomes 1 ── */
  if (S.phase === 'READY' || S.phase === 'IDLE') {
    if (d.deb === 1) onRunStarted(d);
    // NOTE: no return here — fall through so if challenge1 arrives
    // in the same poll as deb=1 it still gets caught below
  }

  /* ── RUNNING phase: track challenges, disq, score, timer ── */
  if (S.phase === 'RUNNING') {
    for (const key of CHALLENGE_KEYS) {
      // treat prev as all-zero if we just transitioned so nothing is skipped
      const wasZero = !prev || prev[key] !== 1;
      if (d[key] === 1 && wasZero) onChallengeCompleted(key, d);
    }
    if (d.dis === 1 && (!prev || prev.dis !== 1)) onDisq(d);
    updateLiveScore(d.score);
    updateTimer(d.temps_passe);
  }

  S.prevData = { ...d };
}

/* ──────────────────────────────────────────
   EVENT HANDLERS
────────────────────────────────────────── */
function onNewRobot(d) {
  resetDashboard();
  S.robotId = d.id_robot;
  S.phase   = 'READY';

  setStatus('READY TO RUN ?', 's-ready');
  el('robotIdBadge').textContent = `ROBOT  #${d.id_robot}`;
  el('liveScore').textContent    = '0 pts';

  // If data already shows deb==1 (page reload during a run)
  if (d.deb === 1) {
    onRunStarted(d);
    for (const key of CHALLENGE_KEYS) {
      if (d[key] === 1) onChallengeCompleted(key, d);
    }
    if (d.dis === 1) onDisq(d);
  }
}

function onRunStarted(d) {
  S.phase = 'RUNNING';
  setStatus('RUN STARTED', 's-running');
  el('timerDisplay').textContent = 'ELAPSED: 0 s';
}

function onChallengeCompleted(key, d) {
  if (S.tableRows.includes(key)) return; // already rendered
  S.tableRows.push(key);

  const tbody = el('tableBody');
  const emptyRow = tbody.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();

  const pts    = d.score - S.prevScore;
  S.prevScore  = d.score;
  const name   = CHALLENGE_NAMES[key] || key.toUpperCase();
  const num    = S.tableRows.length;
  const isEnd  = key === 'fin';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><span class="pill pill-blue">${num}</span></td>
    <td class="chall-name">${isEnd ? '🏁 ' : ''}${name}</td>
    <td><span class="pill pill-green">✓ DONE</span></td>
    <td class="pts-val">+${pts} pts</td>
    <td class="time-val">${d.temps_passe} s</td>
    <td class="cum-score">${d.score} pts</td>
  `;
  tbody.appendChild(tr);

  updateLiveScore(d.score);

  // Finish reached
  if (isEnd) setTimeout(() => onFinished(d), 80);
}

function onDisq(d) {
  if (S.phase === 'DISQ' || S.phase === 'FINISHED') return;
  S.phase = 'DISQ';

  el('dashboard').classList.add('state-disq');
  setStatus('DISQUALIFIED', 's-disq');
  el('timerDisplay').textContent = '';

  showPopup('disq', '❌', 'DISQUALIFIED', d);
  showEndCard(d, 'disq');
  saveResult(d, false);
}

function onFinished(d) {
  if (S.phase === 'DISQ' || S.phase === 'FINISHED') return;
  S.phase = 'FINISHED';

  el('dashboard').classList.add('state-fin');
  setStatus('FINISHED!', 's-finished');
  el('timerDisplay').textContent = '';

  showPopup('win', '🏆', 'HE MADE IT !!', d);
  showEndCard(d, 'win');
  saveResult(d, true);
}

/* ──────────────────────────────────────────
   UI HELPERS
────────────────────────────────────────── */
function setStatus(text, cls) {
  const s = el('statusText');
  s.className = cls;
  s.textContent = text;
}

function updateLiveScore(v) {
  el('liveScore').textContent = v + ' pts';
}

function updateTimer(sec) {
  el('timerDisplay').textContent = `ELAPSED: ${sec} s`;
}

function resetDashboard() {
  S.phase     = 'IDLE';
  S.tableRows = [];
  S.prevScore = 0;
  S.prevData  = null;

  el('tableBody').innerHTML =
    '<tr class="empty-row"><td colspan="6">— AWAITING RUN DATA —</td></tr>';
  el('robotIdBadge').textContent = '';
  el('timerDisplay').textContent = '';
  el('liveScore').textContent    = '—';
  el('endCard').classList.remove('visible');
  setStatus('WAITING FOR ROBOT…', 's-waiting');

  const d = el('dashboard');
  d.classList.remove('state-disq','state-fin');
}

/* ──────────────────────────────────────────
   POPUP
────────────────────────────────────────── */
function showPopup(type, emoji, text, d) {
  if (S.popupOpen) return;
  S.popupOpen = true;

  const box = el('popupBox');
  box.className     = `popup-box ${type}`;
  el('popupEmoji').textContent    = emoji;
  el('popupText').textContent     = text;
  el('popupOverlay').classList.add('show');

  let n = 5;
  el('popupCountdown').textContent = `CLOSING IN ${n}…`;

  const t = setInterval(() => {
    n--;
    el('popupCountdown').textContent = n > 0 ? `CLOSING IN ${n}…` : 'CLOSING…';
    if (n <= 0) {
      clearInterval(t);
      el('popupOverlay').classList.remove('show');
      S.popupOpen = false;
    }
  }, 1000);
}

/* ──────────────────────────────────────────
   END CARD
────────────────────────────────────────── */
function showEndCard(d, type) {
  const doneCount = CHALLENGE_KEYS.filter(k => k !== 'fin' && d[k] === 1).length;

  el('endTitle').className = `end-card-title ${type}`;
  el('endTitle').textContent = type === 'disq'
    ? '❌  RUN ENDED  –  DISQUALIFIED'
    : '🏆  RUN COMPLETE  –  WELL DONE!';

  el('resultsGrid').innerHTML = `
    <div class="res-box">
      <div class="res-label">ROBOT ID</div>
      <div class="res-value">#${d.id_robot}</div>
    </div>
    <div class="res-box">
      <div class="res-label">CHALLENGES</div>
      <div class="res-value">${doneCount} / 5</div>
    </div>
    <div class="res-box">
      <div class="res-label">TIME SPENT</div>
      <div class="res-value">${d.temps_passe} s</div>
    </div>
    <div class="res-box">
      <div class="res-label">FINAL SCORE</div>
      <div class="res-value">${d.score} pts</div>
    </div>
    <div class="res-box">
      <div class="res-label">OUTCOME</div>
      <div class="res-value" style="font-size:.85rem;color:${type==='disq'?'var(--red)':'var(--green)'}">
        ${type === 'disq' ? 'DISQUALIFIED' : 'COMPLETED'}
      </div>
    </div>
  `;

  el('endCard').classList.add('visible');
}

/* ──────────────────────────────────────────
   LEADERBOARD
────────────────────────────────────────── */
/* ── LEADERBOARD  persistence via Flask /api ── */
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      S.leaderboard = await res.json();
    } else {
      S.leaderboard = [];
    }
  } catch {
    S.leaderboard = [];
  }
  renderLeaderboard();
}

async function saveLeaderboard() {
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(S.leaderboard)
    });
  } catch(e) {
    console.warn('Could not save leaderboard:', e);
  }
}

function clearLeaderboard() {
  if (!confirm('Clear the entire leaderboard? This cannot be undone.')) return;
  S.leaderboard = [];
  saveLeaderboard();
  renderLeaderboard();
}

function saveResult(d, finished) {
  const entry = {
    robotId:    d.id_robot,
    score:      d.score,
    time:       d.temps_passe,
    challenges: CHALLENGE_KEYS.filter(k => k !== 'fin' && d[k] === 1).length,
    finished,
    disq:       d.dis === 1,
    c1: d.challenge1, c2: d.challenge2, c3: d.challenge3,
    c4: d.challenge4, c5: d.challenge5, fin: d.fin,
    ts: new Date().toISOString()
  };

  // Replace if same robot already logged
  S.leaderboard = S.leaderboard.filter(r => r.robotId !== d.id_robot);
  S.leaderboard.push(entry);

  // Sort: finished → by time asc; disq → by score desc
  S.leaderboard.sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished)  return  1;
    if (a.finished && b.finished)   return a.time - b.time;
    return b.score - a.score;
  });

  saveLeaderboard();   // persists to CSV via Flask
  renderLeaderboard();
}

function renderLeaderboard() {
  const list = el('lbList');
  if (S.leaderboard.length === 0) {
    list.innerHTML = '<div class="sb-empty">NO RUNS COMPLETED YET<br><br>FINISH OR DISQUALIFY A RUN<br>TO APPEAR ON THE BOARD</div>';
    return;
  }

  list.innerHTML = S.leaderboard.map((r, i) => {
    const rankClass  = ['r1','r2','r3'][i] || '';
    const rankSymbol = ['🥇','🥈','🥉'][i] || `#${i+1}`;
    const statusHtml = r.disq
      ? `<span style="color:var(--red);font-size:.6rem">DISQ</span>`
      : `<span style="color:var(--green);font-size:.6rem">✓</span>`;

    return `
      <div class="lb-row ${rankClass}">
        <div class="lb-rank-num">${rankSymbol}</div>
        <div class="lb-info">
          <div class="lb-rid">ROBOT #${r.robotId} ${statusHtml}</div>
          <div class="lb-meta">${r.challenges}/5 challenges · ${r.score} pts</div>
        </div>
        <div class="lb-time">${r.time} s</div>
      </div>
    `;
  }).join('');
}

/* ──────────────────────────────────────────
   CSV  – append each run + full export
────────────────────────────────────────── */
function exportCSV() {
  const rows = S.leaderboard;
  if (rows.length === 0) { alert('No completed runs to export yet.'); return; }

  const HDR = ['Rank','Robot ID','Score','Time(s)','Challenges Done',
               'Challenge1','Challenge2','Challenge3','Challenge4','Challenge5',
               'Finish','Completed','Disqualified','Timestamp'];

  const body = rows.map((r, i) => [
    i+1, r.robotId, r.score, r.time, r.challenges,
    r.c1?'YES':'NO', r.c2?'YES':'NO', r.c3?'YES':'NO',
    r.c4?'YES':'NO', r.c5?'YES':'NO', r.fin?'YES':'NO',
    r.finished?'YES':'NO', r.disq?'YES':'NO', r.ts
  ].join(','));

  const csv = [HDR.join(','), ...body].join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `robot_race_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ──────────────────────────────────────────
   UTIL
────────────────────────────────────────── */
function el(id) { return document.getElementById(id); }

/* ──────────────────────────────────────────
   BOOT
────────────────────────────────────────── */
// Load leaderboard from CSV via Flask, then start polling
loadLeaderboard().then(() => {
  poll();
  setInterval(poll, CFG.poll);
});
