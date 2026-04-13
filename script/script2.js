/* ═══════════════════════════════════════════════════
   HOMOLOGATION DATA (read from sessionStorage or
   fetched from /api/players which reads homologation.csv)
═══════════════════════════════════════════════════ */

/* Formula: SG = 0.43*H + 0.2*S + 0.37*(S/T)
   H = homologation score (from CSV, 0–10)
   S = run score (points)
   T = time in SECONDS (convert ms → s)
   We calculate for each run, pick the one with highest SG per robot
*/
function calcSG(H, S, T_ms) {
  if (!S || S === 0) return 0;
  const T_s = T_ms / 1000;            // convert ms to seconds
  if (!T_s || T_s === 0) return 0.43 * H + 0.2 * S;
  return 0.43 * H + 0.2 * S + 0.37 * (S / T_s);
}

/* ═══ LOAD DATA ════════════════════════════════════ */
async function loadAll() {
  try {
    // 1. Load all runs — try sessionStorage first, then server, then localStorage
    let allRuns = [];
    try {
      const lbAll = sessionStorage.getItem('lb_all');
      if (lbAll) { allRuns = JSON.parse(lbAll); console.log('[data] sessionStorage:', allRuns.length); }
    } catch {}
    if (!allRuns.length) {
      try {
        const r = await fetch('/api/leaderboard');
        if (r.ok) { allRuns = await r.json(); console.log('[data] server:', allRuns.length); }
      } catch {}
    }
    if (!allRuns.length) {
      try {
        const bk = localStorage.getItem('lb_backup');
        if (bk) { allRuns = JSON.parse(bk); console.log('[data] localStorage:', allRuns.length); }
      } catch {}
    }
    if (!allRuns.length) {
      setMsg('No run data found. Press P on the dashboard to export, then press L to open this page.');
      return;
    }

    // 2. Normalize all entries — c1..c5/fin/finished/disq may be 0/1 or true/false
    allRuns = allRuns.map(e => ({
      ...e,
      c1: e.c1===true||e.c1===1||e.c1==='Y'||e.c1==='YES' ? 1 : 0,
      c2: e.c2===true||e.c2===1||e.c2==='Y'||e.c2==='YES' ? 1 : 0,
      c3: e.c3===true||e.c3===1||e.c3==='Y'||e.c3==='YES' ? 1 : 0,
      c4: e.c4===true||e.c4===1||e.c4==='Y'||e.c4==='YES' ? 1 : 0,
      c5: e.c5===true||e.c5===1||e.c5==='Y'||e.c5==='YES' ? 1 : 0,
      fin: e.fin===true||e.fin===1||e.fin==='Y'||e.fin==='YES' ? 1 : 0,
      finished: e.finished===true||e.finished===1||e.finished==='Y'||e.finished==='YES',
      disq: e.disq===true||e.disq===1||e.disq==='Y'||e.disq==='YES',
      score: parseInt(e.score)||0,
      time: parseInt(e.time)||0,
      run: parseInt(e.run)||1,
      robotId: parseInt(e.robotId)||0,
    }));

    // 3. Try to get H from server (may have been added after runs were saved)
    //    But prefer H already embedded in the entry (saved by dashboard since fix)
    let serverH = {};
    try {
      const r = await fetch('/api/players');
      if (r.ok) {
        const players = await r.json();
        players.forEach((p, idx) => {
          serverH[idx] = parseFloat(p.homologation_score) || 0;
        });
      }
    } catch {}

    // 4. Per player: calculate SG for EACH run, then pick best per player.
    //    Key by robotName (lowercased) as primary, robotId as secondary.
    //    This handles edge cases where same player might have different robotIds.
    const perPlayerRuns = {};  // key → array of {entry, sg}
    allRuns.forEach(entry => {
      const H = parseFloat(entry.H) || serverH[entry.robotId] || 0;
      const S = entry.score || 0;
      const T = entry.time || 0;
      const sg = calcSG(H, S, T);
      const enriched = { ...entry, H, sg: parseFloat(sg.toFixed(6)) };
      // Use robotName as key so same player with diff robotId still deduplicates
      const key = (entry.robotName || '').trim().toLowerCase() || String(entry.robotId);
      if (!perPlayerRuns[key]) perPlayerRuns[key] = [];
      perPlayerRuns[key].push(enriched);
    });

    // 5. For each player, pick the run with the HIGHEST SG score
    const best = Object.values(perPlayerRuns).map(runs => {
      return runs.reduce((champion, r) => r.sg > champion.sg ? r : champion);
    });

    // 6. Sort by SG descending
    const ranked = best.sort((a, b) => b.sg - a.sg);
    console.log(`[dedup] ${allRuns.length} raw entries → ${ranked.length} distinct players`);

    console.log('[final] Ranked', ranked.length, 'distinct players');
    renderResults(ranked);

  } catch(err) {
    setMsg('Error: ' + err.message);
    console.error(err);
  }
}

function setMsg(msg) {
  document.getElementById('loadMsg').textContent = msg;
}

/* ═══ RENDER ═══════════════════════════════════════ */
const RANK_KANIJ  = ['一', '二', '三'];    // kanji for 1,2,3
const RANK_LABELS = ['🥇 FIRST', '🥈 SECOND', '🥉 THIRD'];
const ANNOUNCE_MSGS = [
  { text: '🥉  Third Place — Bronze Warrior…', cls: 'bronze-txt' },
  { text: '🥈  Second Place — Silver Warrior…', cls: 'silver-txt' },
  { text: '🏆  FIRST PLACE — THE CHAMPION!', cls: 'gold-txt' },
];

function renderResults(ranked) {
  document.getElementById('loadScreen').style.display = 'none';
  const stage = document.getElementById('podiumStage');
  stage.style.display = 'flex';

  const top3    = ranked.slice(0, 3);
  const theRest = ranked.slice(3);

  // Build rest table immediately (no animation needed)
  buildRestTable(theRest, 4);

  // Animate podium: reveal positions 3 → 2 → 1
  buildPodium(top3);
  animatePodium(top3);
}

/* ── PODIUM ── */
function buildPodium(top3) {
  const row = document.getElementById('podiumRow');
  row.innerHTML = '';

  // Order: 3rd (left), 1st (center), 2nd (right) — classic podium layout
  const display = [
    top3[2] || null,   // left:  3rd
    top3[0] || null,   // center: 1st
    top3[1] || null,   // right:  2nd
  ];
  const posClass = ['pod-3', 'pod-1', 'pod-2'];
  const baseLabel = ['#3', '#1', '#2'];
  const trueRank  = [3, 1, 2];

  display.forEach((entry, i) => {
    if (!entry) return;
    const rank = trueRank[i];
    const col = document.createElement('div');
    col.className = `pod-col ${posClass[i]}`;
    col.id = `pod-col-${rank}`;

    const timeStr = entry.time ? formatTime(entry.time) : '—';

    col.innerHTML = `
      <div class="pod-circle">
        <div class="pod-kanji">${RANK_KANIJ[rank-1]}</div>
        <div class="pod-name">${esc(entry.robotName)}</div>
        <div class="pod-leader">${esc(entry.leader)}</div>
      </div>
      <div class="pod-score-val">SG: ${entry.sg.toFixed(3)}</div>
      <div class="pod-base">${baseLabel[i]}</div>
      <div class="pod-label">
        <span style="font-size:clamp(.72rem,1.2vw,1rem);font-weight:700;letter-spacing:1px">
          ⏱ ${timeStr}&nbsp;&nbsp;📜 Run ${entry.run}&nbsp;&nbsp;H: ${entry.H}
        </span>
      </div>
    `;
    row.appendChild(col);
  });
}

function animatePodium(top3) {
  const announce = document.getElementById('announce');
  const order = [3, 2, 1];  // reveal order: bronze first, gold last

  let step = 0;
  function nextStep() {
    if (step >= order.length) return;
    const rank = order[step];
    const msgIdx = step;   // 0=bronze, 1=silver, 2=gold

    // Show announce
    const am = ANNOUNCE_MSGS[msgIdx];
    announce.textContent = am.text;
    announce.className = `announce show ${am.cls}`;

    // Reveal the podium column
    const col = document.getElementById(`pod-col-${rank}`);
    if (col) col.classList.add('reveal');

    step++;
    if (step < order.length) {
      setTimeout(nextStep, 2200);
    }
  }

  setTimeout(nextStep, 600);
}

/* ── REST TABLE ── */
function buildRestTable(entries, startRank) {
  const tbody = document.getElementById('restBody');
  tbody.innerHTML = '';
  entries.forEach((e, i) => {
    const rank = startRank + i;
    const timeStr = e.time ? formatTime(e.time) : '—';
    const badge = e.disq
      ? '<span class="rbadge disq">DISQ</span>'
      : '<span class="rbadge done">✓</span>';
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${i * 0.06}s`;
    tr.innerHTML = `
      <td class="rank-num">#${rank}</td>
      <td class="rname">${esc(e.robotName)}</td>
      <td class="rleader">${esc(e.leader)}</td>
      <td class="rgs">${e.sg.toFixed(3)}</td>
      <td class="rscore">${e.score} pts</td>
      <td class="rtime">${timeStr}</td>
      <td class="rscore">${e.H}</td>
      <td><span class="run-tag">Run ${e.run}</span></td>
      <td>${badge}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ═══ UTILS ════════════════════════════════════════ */
function formatTime(ms) {
  if (!ms || ms <= 0) return '—';
  // Show full milliseconds — no rounding
  const totalMs = Math.round(ms);  // only round sub-ms floating point noise
  const s   = Math.floor(totalMs / 1000);
  const mil = totalMs % 1000;                   // full 3-digit ms
  const m   = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) return `${m}:${String(rem).padStart(2,'0')}.${String(mil).padStart(3,'0')}`;
  return `${s}.${String(mil).padStart(3,'0')}s`;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ═══ DARK MODE ════════════════════════════════════ */
let dark = false;
function loadTheme(){try{if(localStorage.getItem('sd')==='1'){dark=true;document.body.classList.add('dark')}}catch{}}
document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); dark=!dark; document.body.classList.toggle('dark',dark); try{localStorage.setItem('sd',dark?'1':'0')}catch{} }
});

/* ═══ BOOT ══════════════════════════════════════════ */
loadTheme();
loadAll();