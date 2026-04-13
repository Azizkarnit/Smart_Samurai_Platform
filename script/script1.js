/* ═══ CONFIG ═══════════════════════════════════════ */
const CFG={
  url:'http://127.0.0.1:8086',
  token:'yMp_JdkvdiYNhW3H-MHbImYO08y6Amy_PNa2atWeQQ4WdDoH5-4YA8cFtBZXsmwoDmSiA-huLUJ07bUTGOegWQ==',
  org:'istic', bucket:'makerlabs', poll:1000
};

/* ═══ CHALLENGE MAPS ════════════════════════════════ */
const CKEYS=['challenge1','challenge2','challenge3','challenge4','challenge5','fin'];
const MIDS={challenge1:'mk-c1',challenge2:'mk-c2',challenge3:'mk-c3',challenge4:'mk-c4',challenge5:'mk-c5',fin:'mk-fin'};

/* ═══ VIDEO STOPS ════════════════════════════════════
   Index 0 = START, 1 = DEP, 2..6 = challenges, 7 = FIN
   Edit these times (in seconds + ms decimals) to match your video.
══════════════════════════════════════════════════════ */
const VIDEO_STOPS = [
  0.000,  // 0  START
  0.000,  // 1  DEP
  1.967,  // 2  C1
  3.700,  // 3  C2
  5.633,  // 4  C3
  6.733,  // 5  C4
  8.000,  // 6  C5
  8.000,  // 7  FIN
];

/* ═══ VIDEO CONTROLLER ═══════════════════════════════ */
let videoTarget = null;

function videoPlayTo(idx){
  const vid=el('runVideo'); if(!vid) return;
  const t=VIDEO_STOPS[Math.min(idx,VIDEO_STOPS.length-1)];
  if(t===undefined) return;
  videoTarget=t;
  vid.play().catch(e=>console.warn('[video]',e));
}

function checkStop(){
  if(videoTarget!==null){
    const vid=el('runVideo');
    if(vid && vid.currentTime >= videoTarget-0.015){
      vid.pause(); vid.currentTime=videoTarget; videoTarget=null; return;
    }
  }
  requestAnimationFrame(checkStop);
}

function videoStop(){const vid=el('runVideo');if(!vid)return;videoTarget=null;vid.pause();}
function videoReset(){const vid=el('runVideo');if(!vid)return;videoTarget=null;vid.pause();vid.currentTime=0;}

/* ═══ TIMER ══════════════════════════════════════════ */
let timerInterval=null, timerStart=null;

function formatTime(ms){
  if(!ms||ms<=0) return '—';
  const totalMs=Math.round(ms);
  const s=Math.floor(totalMs/1000), mil=totalMs%1000;
  const m=Math.floor(s/60), rem=s%60;
  if(m>0) return `${m}:${String(rem).padStart(2,'0')}.${String(mil).padStart(3,'0')}`;
  return `${s}.${String(mil).padStart(3,'0')}s`;
}

function startTimer(){
  stopTimer(); timerStart=Date.now();
  el('timerD').textContent='—';  // stays "—" during run; final time comes from DB
  timerInterval=setInterval(()=>{ /* internal tick only — display frozen until run ends */ },50);
}
function stopTimer(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;}}
function getElapsedMs(){return timerStart?Date.now()-timerStart:0;}

/* ═══ STATE ══════════════════════════════════════════
   jsPlayerIdx  — JS-managed sequential player counter
                  increments on real new player, stays on replay
   influxRobotId — last id_robot seen from InfluxDB
   isReplay     — set by ArrowLeft, cleared after use
══════════════════════════════════════════════════════ */
let S={
  phase:'IDLE', influxRobotId:-2, prevData:null,
  tableRows:[], popOpen:false,
  lb:[], run:1, players:[],
  stopIdx:0,
  jsPlayerIdx:0,   // actual player counter (not from influx)
  isReplay:false,  // true when ArrowLeft was pressed
};

/* ═══ DARK MODE ═══════════════════════════════════════ */
let dark=false;
function toggleDark(){dark=!dark;document.body.classList.toggle('dark',dark);try{localStorage.setItem('sd',dark?'1':'0')}catch{}}
function loadTheme(){try{if(localStorage.getItem('sd')==='1'){dark=true;document.body.classList.add('dark')}}catch{}}

/* ═══ RUN TOGGLE ══════════════════════════════════════ */
function setRun(n){S.run=n;el('rb1').classList.toggle('on',n===1);el('rb2').classList.toggle('on',n===2);}

/* ═══ PLAYERS ═════════════════════════════════════════ */
async function loadPlayers(){
  try{
    const r=await fetch('/api/players');
    if(r.ok){S.players=await r.json();console.log(`[players] ${S.players.length} loaded`);}
  }catch(e){console.warn('[players]',e);}
}

function fillPlayer(idx){
  const n=S.players.length; if(!n) return;
  const p=S.players[idx%n];
  if(!p) return;
  el('dRobot').textContent=p.robotName||'—';
  el('dLeader').textContent=p.leader||'—';
  el('dClub').textContent=p.club||'—';
}

/* ═══ INFLUX ══════════════════════════════════════════ */
const FLUX=(b)=>`from(bucket:"${b}")|>range(start:-24h)|>filter(fn:(r)=>r._measurement=="wokwi")|>last()|>pivot(rowKey:["id_robot"],columnKey:["_field"],valueColumn:"_value")|>sort(columns:["id_robot"],desc:true)|>limit(n:1)`;

async function queryInflux(){
  const r=await fetch(`${CFG.url}/api/v2/query?org=${encodeURIComponent(CFG.org)}`,{
    method:'POST',
    headers:{'Authorization':`Token ${CFG.token}`,'Content-Type':'application/vnd.flux','Accept':'application/csv'},
    body:FLUX(CFG.bucket)
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseCSV(await r.text());
}

function parseCSV(text){
  const lines=text.split('\n'); let h=null; const rows=[];
  for(const raw of lines){
    const line=raw.trim();
    if(!line||line.startsWith('#')) continue;
    const vals=line.split(',');
    if(!h){h=vals.map(v=>v.trim());continue;}
    if(vals.length<2) continue;
    const row={}; h.forEach((k,i)=>{row[k]=(vals[i]||'').trim();}); rows.push(row);
  }
  return rows;
}

function extract(rows){
  if(!rows||!rows.length) return null;
  const r=rows.reduce((b,c)=>parseInt(c['id_robot']??'-1')>parseInt(b['id_robot']??'-1')?c:b,rows[0]);
  return {
    id_robot:    parseInt(r['id_robot']    ??'-1'),
    deb:         parseInt(r['deb']         ??'0'),
    challenge1:  parseInt(r['challenge1']  ??'0'),
    challenge2:  parseInt(r['challenge2']  ??'0'),
    challenge3:  parseInt(r['challenge3']  ??'0'),
    challenge4:  parseInt(r['challenge4']  ??'0'),
    challenge5:  parseInt(r['challenge5']  ??'0'),
    fin:         parseInt(r['fin']         ??'0'),
    dis:         parseInt(r['dis']         ??'0'),
    score:       parseInt(r['score']       ??'0'),
    run_time_ms: parseInt(r['run_time_ms'] ??'0'),  // from Arduino timer
  };
}

/* ═══ POLL ════════════════════════════════════════════ */
let polling=false;
async function poll(){
  if(polling) return; polling=true;
  try{
    const d=extract(await queryInflux());
    el('connDot').classList.add('live');
    el('connText').textContent='LIVE';
    el('sPoll').textContent=new Date().toLocaleTimeString();
    if(d) processData(d);
  }catch(e){
    el('connDot').classList.remove('live');
    el('connText').textContent='DISCONNECTED';
    console.error('[poll]',e);
  }finally{ polling=false; }
}

/* ═══ STATE MACHINE ═══════════════════════════════════ */
function processData(d){
  const prev=S.prevData;

  // New id_robot from InfluxDB → new player started in Python
  if(d.id_robot>=0 && d.id_robot!==S.influxRobotId){
    onNewRobot(d); S.prevData={...d}; return;
  }

  if(S.phase==='DISQ'||S.phase==='FINISHED') return;

  if(S.phase==='READY'||S.phase==='IDLE'){
    if(d.deb===1) onDep(d);
    S.prevData={...d};
  }

  if(S.phase==='RUNNING'){
    for(const k of CKEYS){ if(d[k]===1&&(!prev||prev[k]!==1)) onChallenge(k,d); }
    if(d.dis===1&&(!prev||prev.dis!==1)) onDisq(d);
    el('scoreD').textContent=d.score+' pts';
  }

  S.prevData={...d};
}

/* ═══ EVENTS ══════════════════════════════════════════ */
function onNewRobot(d){
  const wasReplay=S.isReplay;
  reset();
  S.influxRobotId=d.id_robot;
  S.phase='READY';

  // Only advance player counter when it's a real new player (not replay)
  if(!wasReplay){
    // On very first robot, jsPlayerIdx stays 0; subsequent ones increment
    if(S.influxRobotId>0) S.jsPlayerIdx++;
    // Recover counter from leaderboard on first load (after restart)
    if(S.influxRobotId===0 && S.lb.length>0){
      const maxSaved=Math.max(...S.lb.map(r=>r.robotId));
      S.jsPlayerIdx=maxSaved+1;
    }
  }
  // isReplay is consumed — clear it
  S.isReplay=false;

  setStatus('Warrior Stands Ready','sr');
  el('sRid').textContent='#'+(S.jsPlayerIdx);
  el('scoreD').textContent='0 pts';
  fillPlayer(S.jsPlayerIdx);
  videoReset();

  if(d.deb===1){
    onDep(d);
    for(const k of CKEYS){ if(d[k]===1) onChallenge(k,d); }
    if(d.dis===1) onDisq(d);
  }
}

function onDep(d){
  S.phase='RUNNING';
  setStatus('The Battle Has Begun','sg');
  S.stopIdx=1;
  startTimer();
  videoPlayTo(1);
  const sm=el('mk-start'); if(sm) sm.classList.add('hit');
}

function onChallenge(k,d){
  if(S.tableRows.includes(k)) return;
  S.tableRows.push(k);
  const stopMap={challenge1:2,challenge2:3,challenge3:4,challenge4:5,challenge5:6,fin:7};
  S.stopIdx=stopMap[k]||S.stopIdx+1;
  videoPlayTo(S.stopIdx);
  const m=el(MIDS[k]); if(m) m.classList.add('hit');
  el('scoreD').textContent=d.score+' pts';
  updateSum(d,false,false);
  if(k==='fin') setTimeout(()=>onFinished(d),100);
}

function onDisq(d){
  if(S.phase==='DISQ'||S.phase==='FINISHED') return;
  S.phase='DISQ';
  // Use run_time_ms from InfluxDB (Arduino timer); fallback to JS elapsed if DB not yet updated
  const elapsed=(d.run_time_ms&&d.run_time_ms>0)?d.run_time_ms:getElapsedMs();
  stopTimer();
  setStatus('Dishonored','sd');
  el('timerD').textContent=formatTime(elapsed);
  videoStop();
  const lk=S.tableRows[S.tableRows.length-1];
  if(lk&&MIDS[lk]){const m=el(MIDS[lk]);m.classList.remove('hit');m.classList.add('fail');}
  updateSum(d,false,true,elapsed);
  showPopup('disq','💔','DISHONORED');
  saveResult(d,false,elapsed);
}

function onFinished(d){
  if(S.phase==='DISQ'||S.phase==='FINISHED') return;
  S.phase='FINISHED';
  // Use run_time_ms from InfluxDB (Arduino timer); fallback to JS elapsed if DB not yet updated
  const elapsed=(d.run_time_ms&&d.run_time_ms>0)?d.run_time_ms:getElapsedMs();
  stopTimer();
  setStatus('Honor Achieved','sf');
  el('timerD').textContent=formatTime(elapsed);
  const vid=el('runVideo'); if(vid){videoTarget=null;vid.play().catch(()=>{});}
  updateSum(d,true,false,elapsed);
  showPopup('win','🌸','HE MADE IT !!');
  saveResult(d,true,elapsed);
  // Auto-switch run after all players finish run 1
  checkAutoSwitchRun();
}

/* ═══ UI HELPERS ══════════════════════════════════════ */
function setStatus(t,c){const s=el('statusText');s.className='stxt '+c;s.textContent=t;}

function updateSum(d,fin,disq,elapsed){
  const t=elapsed!==undefined?elapsed:getElapsedMs();
  el('sCh').textContent=CKEYS.filter(k=>k!=='fin'&&d[k]===1).length+'/5';
  el('sTime').textContent=formatTime(t);
  el('sScore').textContent=d.score+' pts';
  if(disq){el('sOut').textContent='DISHONORED';el('sOut').style.color='var(--red)';}
  else if(fin){el('sOut').textContent='HONORED ✓';el('sOut').style.color='var(--green)';}
}

function reset(){
  S.phase='IDLE'; S.tableRows=[]; S.prevData=null; S.stopIdx=0;
  // Do NOT reset jsPlayerIdx, isReplay, run here — managed externally
  ['dRobot','dLeader','dClub','sRid','timerD','sCh','sTime','sScore'].forEach(i=>el(i).textContent='—');
  el('scoreD').textContent='—'; el('sOut').textContent='—'; el('sOut').style.color='';
  setStatus('Awaiting…','sw');
  stopTimer();
  document.querySelectorAll('.mk').forEach(m=>m.classList.remove('hit','fail'));
  videoReset();
}

/* ═══ AUTO-SWITCH RUN ════════════════════════════════
   After all players in homologation.csv finish run 1,
   automatically switch the run toggle to run 2.
══════════════════════════════════════════════════════ */
function checkAutoSwitchRun(){
  if(S.run!==1) return;
  const n=S.players.length; if(!n) return;
  // Count distinct robotIds that have a completed (non-replay) run 1 entry
  const run1ids=new Set(S.lb.filter(r=>r.run===1).map(r=>r.robotId));
  // All n players (indices 0..n-1) must have run 1 saved
  const allDone=[...Array(n).keys()].every(i=>run1ids.has(i));
  console.log(`[auto-switch] run1 done: ${run1ids.size}/${n}`);
  if(allDone){
    setRun(2);
    console.log('[auto-switch] All players done run 1 → switched to Run 2');
    setStatus('All done Run 1 — now on Run 2','sr');
  }
}

/* ═══ POPUP ═══════════════════════════════════════════ */
function showPopup(type,emoji,text){
  if(S.popOpen) return; S.popOpen=true;
  el('popBox').className='popbox '+type;
  el('popEmoji').textContent=emoji;
  el('popText').textContent=text;
  el('popOv').classList.add('show');
  let n=5; el('popCd').textContent=`Closing in ${n}…`;
  const t=setInterval(()=>{
    n--; el('popCd').textContent=n>0?`Closing in ${n}…`:'Closing…';
    if(n<=0){clearInterval(t);el('popOv').classList.remove('show');S.popOpen=false;}
  },1000);
}

/* ═══ LEADERBOARD ═════════════════════════════════════ */
async function saveLB(){
  try{
    await fetch('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(S.lb)});
  }catch(e){console.warn('[saveLB]',e);}
}

async function loadLB(){
  try{
    const r=await fetch('/api/leaderboard');
    const data=r.ok?await r.json():[];
    if(data.length>0){
      S.lb=data;
      // Restore jsPlayerIdx from saved data (for restarts)
      const maxRobotId=Math.max(...data.map(r=>r.robotId));
      S.jsPlayerIdx=maxRobotId+1;
      console.log('[lb] Loaded',data.length,'entries, next player idx:',S.jsPlayerIdx);
    } else {
      // Fallback: localStorage backup
      try{
        const bk=localStorage.getItem('lb_backup');
        if(bk){
          S.lb=JSON.parse(bk);
          if(S.lb.length){
            const maxId=Math.max(...S.lb.map(r=>r.robotId));
            S.jsPlayerIdx=maxId+1;
          }
          console.log('[recovery] Restored',S.lb.length,'from localStorage');
          saveLB();
        }
      }catch{}
    }
  }catch(e){console.warn('[loadLB]',e); S.lb=[];}
  renderLB();
}

function renderLB(){
  const list=document.getElementById('lbList'); if(!list) return;
  if(!S.lb.length){list.innerHTML='<p class="lbmt">No warriors yet…</p>';return;}
  list.innerHTML=S.lb.map((r,i)=>{
    const rc=['r1','r2','r3'][i]||'', rs=['🥇','🥈','🥉'][i]||`#${i+1}`;
    const b=r.disq?'<span class="lbbadge disq">DISQ</span>':'<span class="lbbadge done">✓</span>';
    return`<div class="lbrow ${rc}"><div class="lbrank">${rs}</div><div class="lbinf"><div class="lbrobot">${r.robotName||''} ${b}</div><div class="lbmeta">${r.leader||''} · Run ${r.run} · ${r.score}pts</div></div><div class="lbtime">${formatTime(r.time)}</div></div>`;
  }).join('');
}

function saveResult(d,fin,elapsed){
  const n=S.players.length;
  const pidx=S.jsPlayerIdx;
  const p=n>0?S.players[pidx%n]:{};
  const t=elapsed!==undefined?elapsed:getElapsedMs();
  const H=parseFloat(p.homologation_score||p.H||0);
  const e={
    robotId:pidx, robotName:p.robotName||`Robot #${pidx}`,
    leader:p.leader||'—', club:p.club||'—',
    run:S.run, score:d.score, time:t, H:H,
    challenges:CKEYS.filter(k=>k!=='fin'&&d[k]===1).length,
    // Normalize all boolean fields consistently as numbers 0/1
    finished:fin?1:0, disq:d.dis===1?1:0,
    c1:d.challenge1?1:0, c2:d.challenge2?1:0, c3:d.challenge3?1:0,
    c4:d.challenge4?1:0, c5:d.challenge5?1:0, fin:d.fin?1:0,
    ts:new Date().toISOString()
  };
  // Replace same player+run (handles replay override)
  S.lb=S.lb.filter(r=>!(r.robotId===pidx&&r.run===S.run));
  S.lb.push(e);
  S.lb.sort((a,b)=>{
    if(a.finished&&!b.finished) return -1;
    if(!a.finished&&b.finished) return 1;
    if(a.finished&&b.finished) return a.time-b.time;
    return b.score-a.score;
  });
  saveLB(); renderLB();
  // Safe backup to localStorage
  try{localStorage.setItem('lb_backup',JSON.stringify(S.lb));}catch{}
}

function exportCSV(){
  if(!S.lb.length){alert('No runs to export.');return;}
  const H=['Rank','Name','Leader','Club','Run','Score','Time(ms)','H','Challenges','C1','C2','C3','C4','C5','Fin','Done','DISQ','Timestamp'];
  const B=S.lb.map((r,i)=>[i+1,r.robotName,r.leader,r.club,r.run,r.score,r.time,r.H||0,r.challenges,
    r.c1?1:0,r.c2?1:0,r.c3?1:0,r.c4?1:0,r.c5?1:0,
    r.fin?1:0,r.finished?1:0,r.disq?1:0,r.ts].join(','));
  const url=URL.createObjectURL(new Blob([[H.join(','),...B].join('\n')],{type:'text/csv'}));
  Object.assign(document.createElement('a'),{href:url,download:'runs.csv'}).click();
  URL.revokeObjectURL(url);
  console.log('[export]',S.lb.length,'entries → runs.csv');
}

/* ═══ KEYBOARD SHORTCUTS ══════════════════════════════ */
function el(id){return document.getElementById(id);}

document.addEventListener('keydown',function(e){
  const tag=e.target.tagName;

  // SPACE — dark/light toggle (always first, never blocked)
  if(e.code==='Space'&&tag!=='INPUT'&&tag!=='TEXTAREA'){
    e.preventDefault(); toggleDark(); return;
  }
  if(tag==='INPUT'||tag==='TEXTAREA') return;

  switch(e.code){
    case 'KeyP':
      e.preventDefault(); exportCSV(); break;

    case 'KeyR':
      e.preventDefault(); setRun(S.run===1?2:1); break;

    case 'KeyL':
      e.preventDefault();
      sessionStorage.setItem('lb_all',JSON.stringify(S.lb));
      window.open('final_results.html','_blank'); break;

    case 'KeyC':
      e.preventDefault();
      if(!confirm('Clear ALL saved run data? This cannot be undone.')) break;
      S.lb=[]; S.jsPlayerIdx=0;
      saveLB();
      try{localStorage.removeItem('lb_backup');}catch{}
      renderLB();
      console.log('[clear] All data cleared');
      break;

    case 'ArrowLeft':
      e.preventDefault();
      if(S.influxRobotId<0){console.warn('[replay] No robot yet');break;}
      S.isReplay=true;
      S.popOpen=false;  // clear popup lock so it doesn't block the next run
      el('popOv').classList.remove('show');  // hide any lingering popup
      reset();
      S.isReplay=true;  // restore after reset (reset doesn't touch it but be safe)
      setStatus('Try Again — type start','sr');
      console.log(`[replay] jsPlayerIdx=${S.jsPlayerIdx} run=${S.run} — will retry`);
      break;
  }
});

/* ═══ BOOT ════════════════════════════════════════════ */
loadTheme();
document.addEventListener('DOMContentLoaded',()=>{
  const vid=el('runVideo');
  if(vid){
    vid.addEventListener('play',()=>requestAnimationFrame(checkStop));
    vid.load();
    vid.addEventListener('loadeddata',()=>{vid.currentTime=0;},{once:true});
  }
});
Promise.all([
  loadPlayers().catch(e=>console.warn('[boot] players:',e)),
  loadLB().catch(e=>console.warn('[boot] lb:',e))
]);
poll();
setInterval(poll,CFG.poll);