/* StudyTracker — application de suivi d'études (cours, QCM, notes, agenda)
   Créé par Lem HORNOY */

let S = {courses:[], tests:[], attempts:[], events:[], exams:[], set:{theme:'auto', rank:true, colors:{}, done:{}}};
let view = 'dash', filt = {sem:'', sub:''}, open = {}, form = null, cid = null, Q = null, subj = '', sSem = '', cap = null;
let now = new Date();
let cal = {y:now.getFullYear(), m:now.getMonth(), sel:null, mode:'month'};
let ref = null, saveT = null, flash = null, newColor = '#2f5fd0', courseColor = null, mName = '', draft = {};
// chronomètre du QCM + pomodoro
let chrono = {on:false, t0:0, elapsed:0, limit:0};
let pomo = {phase:'idle', work:25, brk:5, left:0, total:0, runs:0, t0:0, tick:null, preset:false};
let openCorr = {};
let recurrence = {on:true, days:[1,3,7,30], remember:false};
let draftRec = null;

const THEMES = [
  ['auto','Auto','Suit le réglage de ton système'],
  ['light','Clair','Fond clair, texte sombre'],
  ['dark','Sombre','Gris foncé, doux le soir'],
  ['night','Nuit','Bleu nuit profond'],
  ['ocean','Océan','Bleus froids, très lisibles'],
  ['forest','Forêt','Verts naturels'],
  ['rose','Rose','Tons chauds rosés'],
  ['sepia','Sépia','Papier ancien, repose les yeux'],
  ['lavender','Lavande','Violet doux et clair'],
  ['sand','Sable','Beige chaud et lumineux'],
  ['mint','Menthe','Vert d’eau frais'],
  ['slate','Ardoise','Gris bleu sobre'],
  ['sunset','Coucher de soleil','Oranges chauds'],
  ['candy','Bonbon','Rose et violet pastel'],
  ['contrast','Contraste élevé','Noir et blanc, lisibilité maximale'],
  ['nord','Nord','Palette polaire gris-bleu']
];
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const strip = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'});
const fmtShort = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {weekday:'short', day:'numeric', month:'short'});
const avg = l => l.length ? l.reduce((s, x) => s + x, 0) / l.length : null;
const pct = a => a.score / a.max * 100;
const cls = p => p == null ? 'mut' : p >= 70 ? 'ok' : p >= 50 ? 'warn' : 'bad';
const f1 = p => p == null ? '–' : Math.round(p) + ' %';
const val = id => ((document.getElementById(id) || {}).value || '').trim();
const setStatus = t => { const el = $('#status'); if (el) el.textContent = t; };
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2200); }
const rk = p => { const r = S.set.rank && rank(p); return r ? `<span class="rk" style="background:${r[1]};${r[0] === 'B' ? 'color:#12351c' : ''}">${r[0]}</span>` : ''; };
function rank(p) {
  if (p == null) return null;
  return p < 20 ? ['D', '#8b1a1a'] : p < 50 ? ['C', '#e06666'] : p < 70 ? ['B', '#7fcf93'] : p < 80 ? ['A', '#1e7a3c'] : p < 90 ? ['S', '#d4a900'] : ['SS', 'linear-gradient(135deg,#ec4899,#8b5cf6)'];
}

// ---------- couleurs par matière ----------
const PALETTE = ['#2f5fd0','#0b7fa8','#2f7a46','#8a5cd6','#c2427a','#b5762a','#3f8f8f','#5c6bc0','#a3472c','#4a7c2f','#7a5cc0','#c94f3d'];
const hashHue = s => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function colorOf(sub) {
  const c = (S.set.colors || {})[sub];
  if (c) return c;
  if (!sub) return '#8a8f98';
  return `hsl(${hashHue(sub)} 52% 45%)`;
}
function setColor(sub, hex) { if (!S.set.colors) S.set.colors = {}; S.set.colors[sub] = hex; save(); render(); }

// ---------- stockage ----------
async function init() {
  let ok = false;
  try {
    if (typeof claude !== 'undefined' && claude.use) {
      const user = await claude.use('user'), db = await claude.use('db'), id = user && await user.id();
      if (db && id) {
        ref = db.collection('data/users/' + id).doc('store');
        const s = await ref.get();
        if (s.exists && s.data().json) S = Object.assign(S, JSON.parse(s.data().json));
        ok = true; setStatus('Données enregistrées sur ton compte.');
      }
    }
  } catch (e) { ref = null; }
  if (!ok) {
    try { const j = localStorage.getItem('studytracker'); if (j) S = Object.assign(S, JSON.parse(j)); } catch (e) {}
    setStatus('Mode local : données conservées dans ce navigateur.');
  }
  S.set = Object.assign({theme:'auto', rank:true, colors:{}, done:{}, focus:{}, help:'', recPreset:null, autoEvents:true}, S.set);
  // migration des libellés de rappels automatiques
  for (const e of S.events) {
    if (!e.autoKey) continue;
    const item = e.kind === 'course' ? S.courses.find(x => x.id === e.itemId) : S.tests.find(x => x.id === e.itemId);
    if (!item) continue;
    e.title = e.kind === 'course' ? 'J' + (e.day || '') + ' · ' + item.title : 'QCM J' + (e.day || '') + ' · ' + item.title;
  }
  if (!S.set.focus) S.set.focus = {};
  const sel = $('#theme');
  if (sel) sel.innerHTML = THEMES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('');
  applyTheme(); render(); paintProf(); paintThemes();
  installPrompt();
}

// ---------- installation (PWA) ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; paintInstall(true); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; paintInstall(false); toast('StudyTracker est installé sur cet appareil.'); });
function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function installPrompt() {
  if (isStandalone() || localStorage.getItem('st-noinstall') === '1') return;
  if (!deferredPrompt) {
    // iOS/iPadOS : pas d'événement, on affiche les instructions une seule fois
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !sessionStorage.getItem('st-ios-shown')) {
      sessionStorage.setItem('st-ios-shown', '1');
      setTimeout(() => toast('Pour installer : Partager → « Sur l’écran d’accueil ».'), 1800);
    }
    return;
  }
  paintInstall(true);
}
function paintInstall(show) {
  const host = document.getElementById('install-host');
  if (!host) return;
  if (!show || isStandalone()) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="bkbar inst">
    <span>📲 Installer StudyTracker : une icône sur ton écran, en plein écran, utilisable hors ligne.</span>
    <span class="row" style="gap:6px"><button class="btn s" data-act="installApp">Installer</button><button class="btn q s" data-act="installNo">Plus tard</button></span>
  </div>`;
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const json = JSON.stringify(S);
    if (ref) { try { await ref.set({json}); } catch (e) { setStatus('Échec de l’enregistrement.'); } }
    else { try { localStorage.setItem('studytracker', json); } catch (e) {} }
    // sauvegarde silencieuse dans le fichier lié (max. 1 fois par 2 minutes)
    if (bkHandle && bkStatus.auto && Date.now() - (bkStatus.lastAuto || 0) > 12e4) {
      bkStatus.lastAuto = Date.now();
      bkWrite(true).catch(() => {});
    }
  }, 350);
}
function applyTheme() {
  const t = S.set.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const sel = $('#theme'); if (sel) sel.value = t;
  const tn = $('#theme-name'); if (tn) tn.textContent = (THEMES.find(x => x[0] === t) || THEMES[0])[1];
  const rk = $('#rk'); if (rk) rk.checked = S.set.rank;
}



// ---------- calculs ----------
const rd = t => t.round || 0;
const cur = t => S.attempts.filter(a => a.testId === t.id && (a.round || 0) === rd(t)).sort((a, b) => a.date < b.date ? -1 : 1);
const all = t => S.attempts.filter(a => a.testId === t.id).sort((a, b) => a.date < b.date ? -1 : 1);
function statsFor(ts) {
  const at = ts.flatMap(cur).sort((a, b) => a.date < b.date ? -1 : 1), ps = at.map(pct); let trend = null;
  if (ps.length >= 4) { const h = Math.floor(ps.length / 2); trend = avg(ps.slice(h)) - avg(ps.slice(0, h)); }
  return {n:at.length, avg:avg(ps), trend, last:at[at.length - 1], ps, at};
}
const testsOfCourse = c => S.tests.filter(t => t.courseId === c.id);
const courseStats = c => statsFor(testsOfCourse(c));
const testsOfSubject = s => S.tests.filter(t => t.subject === s);
const subjStats = s => statsFor(testsOfSubject(s));
const subjects = () => [...new Set([...S.courses.map(c => c.subject), ...S.tests.map(t => t.subject), ...S.exams.map(e => e.subject), ...Object.keys(S.set.colors || {})])].filter(Boolean).sort();
const semesters = () => [...new Set([...S.courses.map(c => c.semester), ...S.exams.map(e => e.semester)])].filter(Boolean).sort();
function spark(ps) {
  if (ps.length < 2) return '';
  const w = 110, h = 28;
  return `<svg width="${w}" height="${h}"><polyline points="${ps.map((p, i) => `${(i / (ps.length - 1) * w).toFixed(1)},${(h - p / 100 * h).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ac)" stroke-width="2"/></svg>`;
}
function chart(at) {
  if (at.length < 1) return '<div class="empty">Pas encore de résultats.</div>';
  const W = 560, H = 170, L = 30;
  const x = i => L + (at.length === 1 ? (W - L) / 2 : i / (at.length - 1) * (W - L - 10));
  const y = p => H - 20 - p / 100 * (H - 30);
  let run = 0; const ra = at.map((a, i) => (run += pct(a)) / (i + 1));
  return `<div class="scroll"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:420px">
  ${[0, 50, 100].map(v => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--bd)"/><text x="0" y="${y(v) + 3}">${v}</text>`).join('')}
  <polyline fill="none" stroke="var(--mut)" stroke-dasharray="4 3" stroke-width="1.5" points="${ra.map((p, i) => x(i) + ',' + y(p)).join(' ')}"/>
  <polyline fill="none" stroke="var(--ac)" stroke-width="2" points="${at.map((a, i) => x(i) + ',' + y(pct(a))).join(' ')}"/>
  ${at.map((a, i) => `<circle cx="${x(i)}" cy="${y(pct(a))}" r="3.5" fill="var(--ac)"><title>${fmt(a.date)} : ${Math.round(pct(a))}%</title></circle>`).join('')}
  </svg></div><div class="mut">Trait plein : chaque résultat · pointillés : moyenne cumulée</div>`;
}
function weak(list) {
  const out = [], n = Date.now();
  for (const c of list) {
    const st = courseStats(c), why = [];
    if (!testsOfCourse(c).length) continue;
    if (!st.n) why.push('Aucun résultat dans ce cycle');
    else {
      if (st.avg < 60) why.push('Moyenne faible (' + f1(st.avg) + ')');
      if (st.trend != null && st.trend < -10) why.push('Résultats en baisse');
      if ((n - new Date(st.last.date)) / 864e5 > 21 && st.avg < 80) why.push('Pas révisé depuis 3 semaines');
    }
    if (why.length) out.push({label:c.title, sub:c.subject, why, avg:st.avg ?? -1});
  }
  return out.sort((a, b) => a.avg - b.avg);
}
function missed(ts) {
  const m = {};
  for (const t of ts) for (const a of cur(t)) for (const i of a.wrong || []) { const k = t.id + '|' + i; m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).map(([k, n]) => {
    const [tid, i] = k.split('|'), t = S.tests.find(t => t.id === tid);
    return {n, q:strip(t?.questions?.[i]?.q), t:t?.title};
  }).filter(x => x.q).sort((a, b) => b.n - a.n).slice(0, 5);
}
function rounds(ts) {
  const m = {};
  for (const t of ts) for (const a of all(t)) (m[a.round || 0] = m[a.round || 0] || []).push(pct(a));
  return Object.keys(m).sort((a, b) => a - b).map(r => ({r:+r, avg:avg(m[r]), n:m[r].length}));
}

// ---------- minuteurs : chronomètre QCM & pomodoro ----------
const mmss = sec => { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
function beep(times = 2) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880 - i * 120;
      g.gain.value = 0.0001; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    }
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1400);
  } catch (e) {}
}
async function notify(title, body) {
  beep(2);
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') new Notification(title, {body, tag:'studytracker-pomo'});
  } catch (e) {}
  toast(title);
}
function chronoStart() { chrono.on = true; chrono.t0 = Date.now(); chrono.elapsed = 0; }
function chronoStop() { if (chrono.on) { chrono.elapsed = (Date.now() - chrono.t0) / 1000; chrono.on = false; } }
function chronoTick() {
  if (!chrono.on) return;
  chrono.elapsed = (Date.now() - chrono.t0) / 1000;
  const el = document.getElementById('chrono-t');
  if (el) el.textContent = '⏱ ' + mmss(chrono.elapsed);
  const bar = document.getElementById('chrono-bar');
  if (bar && chrono.limit) {
    bar.style.width = Math.min(100, chrono.elapsed / chrono.limit * 100) + '%';
    bar.style.background = chrono.elapsed / chrono.limit > 0.85 ? 'var(--bad)' : 'var(--warn)';
  }
  if (chrono.limit && chrono.elapsed >= chrono.limit && Q && view === 'quiz' && !Q.timeUpDone) {
    Q.timeUpDone = true; notify('Temps écoulé', 'La limite de temps du QCM est atteinte.');
    render();
  }
}
function pomoStart() {
  pomo.phase = 'work'; pomo.total = pomo.work * 60; pomo.left = pomo.total; pomo.t0 = Date.now(); pomo.preset = false;
  notify('Focus démarré', pomo.work + ' min de travail, puis ' + pomo.brk + ' min de pause.');
  pomoTick(); render();
}
function logFocusSession() {
  if (!S.set.focus) S.set.focus = {};
  const k = today();
  S.set.focus[k] = (S.set.focus[k] || 0) + 1;
  save();
}
function pomoStartBreak() {
  if (pomo.phase !== 'work') return;
  logFocusSession();
  pomo.phase = 'break'; pomo.total = pomo.brk * 60; pomo.left = pomo.total; pomo.t0 = Date.now(); pomo.runs++;
  notify('Pause !', 'Vous êtes en pause — reprise dans ' + pomo.brk + ' min.');
  pomoTick(); render();
}
function pomoResume() { if (pomo.phase !== 'break') return; notify('Reprise', 'La pause est terminée, on repart sur ' + pomo.work + ' min.'); pomoStart(); }
function pomoStop(silent) {
  pomo.phase = 'idle'; pomo.left = 0; pomo.total = 0;
  if (!silent) toast('Mode focus arrêté.');
  render();
}
function pomoTick() {
  if (pomo.phase !== 'work' && pomo.phase !== 'break') return;
  const el = Date.now() - pomo.t0;
  pomo.left = Math.max(0, pomo.total - el / 1000);
  const pb = document.getElementById('pomo-btn-sub');
  if (pb && pomo.phase === 'work') pb.textContent = 'Focus en cours · ' + mmss(pomo.left) + ' — cliquer pour gérer';
  if (pomo.phase === 'work') {
    const t = document.getElementById('pomo-t'), b = document.getElementById('pomo-bar');
    if (t) t.textContent = mmss(pomo.left);
    if (b) b.style.width = (100 - pomo.left / pomo.total * 100) + '%';
    if (pomo.left <= 0) { pomoStartBreak(); return; }
  } else {
    const t = document.getElementById('pomo-t'), b = document.getElementById('pomo-bar');
    if (t) t.textContent = mmss(pomo.left);
    if (b) b.style.width = (100 - pomo.left / pomo.total * 100) + '%';
    if (pomo.left <= 0) { pomoResume(); return; }
  }
}
function pomoMini() {
  if (pomo.phase !== 'work') return '';
  return `<div class="focusbar" id="focusbar"><span>🍅 Focus · <b id="pomo-t">${mmss(pomo.left)}</b></span>
    <span class="bar" style="flex:1;max-width:220px"><i id="pomo-bar" style="width:${100 - pomo.left / pomo.total * 100}%;background:var(--bad)"></i></span>
    <button class="btn q s" data-act="pomoStop">Arrêter</button></div>`;
}
function breakOverlay() {
  const pctDone = 100 - pomo.left / pomo.total * 100;
  return `<div class="backdrop" style="z-index:70">
    <div class="modal" style="text-align:center;max-width:380px">
      <div style="font-size:42px;line-height:1">☕</div>
      <h3 style="margin-top:10px;font-size:21px">Vous êtes en pause !</h3>
      <p>Repose-toi : pas d’écran, un peu d’eau, et on reprend.</p>
      <div class="big" id="pomo-t" style="font-size:44px;margin:10px 0 4px">${mmss(pomo.left)}</div>
      <div class="bar" style="height:9px"><i id="pomo-bar" style="width:${pctDone}%;background:var(--ok)"></i></div>
      <p class="mut" style="margin-top:10px">Reprise automatique dans ${mmss(pomo.left)} · pause ${pomo.brk} min</p>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn g s" data-act="pomoStop">Arrêter le focus</button></div>
    </div></div>`;
}
setInterval(() => { chronoTick(); if (pomo.phase !== 'idle') pomoTick(); }, 250);

// ---------- récurrence automatique (agenda) ----------
const PRESETS = [['Classique', [1, 3, 7, 30]], ['Express', [1, 3, 7]], ['Examen', [1, 2, 4, 7, 14, 30]], ['Espacé', [1, 7, 21, 45]], ['Une fois', [1]]];
const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function nextRec() {
  if (draftRec) return draftRec;
  const p = S.set.recPreset;
  if (!p) return {on:true, days:[1, 3, 7, 30]};
  return {on: !!p.on, days: p.days && p.days.length ? p.days.slice() : [1, 3, 7, 30]};
}
function recChips(prefix) {
  const r = nextRec();
  return `<div class="row" style="margin-top:10px"><span class="mut" style="min-width:96px">Révision auto</span>
    <button class="chip ${r.on ? 'on' : ''}" data-act="recToggle">${r.on ? '✓ Activée' : 'Désactivée'}</button>
    ${r.on ? `<span class="mut">rappel les jours</span>${r.days.map((d, i) => `<span class="tag" style="padding:2px 9px">J${d}</span>`).join('')}` : ''}</div>
  ${r.on ? `<div class="row" style="margin-top:8px"><span class="mut" style="min-width:96px">Rythme</span>
    ${PRESETS.map(([n, d]) => `<button class="chip ${d.join(',') === r.days.join(',') ? 'on' : ''}" data-act="recPreset" data-v="${n}">${n} <span class="mut">J${d.join('/J')}</span></button>`).join('')}
    <button class="chip" data-act="recEdit">✎ Personnaliser</button></div>
  <div class="row" style="margin-top:6px"><label class="mut" style="display:flex;gap:6px;align-items:center;cursor:pointer">
    <input type="checkbox" data-act="recRemember" ${S.set.recPreset ? 'checked' : ''}> Mémoriser ce rythme pour les prochains cours et QCM</label></div>` : ''}`;
}
function scheduleFor(item) {
  const r = item.rec;
  if (!r || !r.on || !r.days || !r.days.length) return;
  const base = item.createdAt || today();
  for (const n of r.days) {
    const d = addDays(base, n);
    const key = 'auto|' + item.kind + '|' + item.id + '|' + n;
    if (S.events.some(e => e.autoKey === key)) continue;
    S.events.push({
      id: uid(), date: d, type: item.kind === 'course' ? 'Révision' : 'QCM',
      title: (item.kind === 'course' ? 'J' + n + ' · ' + item.title : 'QCM J' + n + ' · ' + item.title),
      autoKey: key, itemId: item.id, kind: item.kind, day: n, until: ''
    });
  }
}
function removeSchedule(kind, id) {
  S.events = S.events.filter(e => !(e.autoKey && e.itemId === id && e.kind === kind));
}
function itemRecHtml(kind, item) {
  const r = item.rec || {on:false, days:[]};
  const c = item.createdAt ? fmt(item.createdAt) : '–';
  return `<div class="mut" style="margin-top:6px">Créé le ${c} · ${r.on ? 'révisions ' + r.days.map(d => 'J' + d).join(' / ') : 'pas de révision auto'}</div>
  <div class="row" style="margin-top:4px"><button class="btn q s" data-act="itemRec" data-kind="${kind}" data-id="${item.id}">⏱ Modifier la récurrence</button></div>`;
}

// ---------- tâches du jour (depuis l'agenda) ----------
const doneKey = (eid, d) => eid + '|' + d;
const isDone = (eid, d) => !!(S.set.done || {})[doneKey(eid, d)];
function tasksFor(d) {
  const out = [];
  for (const e of S.events) {
    const o = {id:e.id, date:d, title:e.title, type:e.type, due:e.date, auto:e.autoKey || '', itemId:e.itemId || '', kind:e.kind || '', day:e.day || 0, itemTitle:e.itemTitle || ''};
    if (e.date === d) out.push(o);
    else if (e.until && e.date < d && e.until >= d) out.push(o);
  }
  return out.sort((a, b) => (a.type || '').localeCompare(b.type || '') || a.title.localeCompare(b.title));
}
function itemName(kind, id) {
  const it = kind === 'course' ? S.courses.find(x => x.id === id) : S.tests.find(x => x.id === id);
  return it ? it.title : '';
}
function toggleTask(eid, d) {
  if (!S.set.done) S.set.done = {};
  const k = doneKey(eid, d);
  if (S.set.done[k]) delete S.set.done[k]; else S.set.done[k] = true;
  save(); render();
}

// ---------- vues ----------
const TABS = [['dash','Accueil'],['courses','Cours'],['tests','Tests & QCM'],['stats','Statistiques'],['cal','Calendrier'],['exams','Notes partiels'],['help','Aide']];
let openProf = false;
function exportBackup() {
  try {
    const data = JSON.stringify(Object.assign({}, S, {_app:'StudyTracker', _savedAt:new Date().toISOString()}));
    const d = new Date(), st = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], {type:'application/json'}));
    a.download = 'studytracker-' + st + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Sauvegarde téléchargée.');
  } catch (e) { toast('Sauvegarde impossible.'); }
}
function avatarHtml(size) {
  const p = S.set.profile || {}, px = size || 34;
  const ini = (p.name || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?';
  return p.photo ? `<img class="av" src="${p.photo}" alt="" style="width:${px}px;height:${px}px">`
    : `<span class="av avi" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.42)}px">${esc(ini)}</span>`;
}
function profPanel() {
  const p = S.set.profile || {};
  return `<div class="profpop" id="prof-pop">
    <div class="row" style="gap:12px;align-items:center">
      <span id="pf-av">${avatarHtml(56)}</span>
      <span class="row" style="gap:6px;flex-wrap:wrap">
        <span class="btn g s" role="button" tabindex="0" data-act="pick" data-for="profPhoto">🖼 Photo</span><input type="file" accept="image/*" data-act="profPhoto" hidden>
        ${p.photo ? '<button class="btn q s" data-act="profPhotoDel">Retirer</button>' : ''}
      </span></div>
    <input id="pf-name" placeholder="Nom d’utilisateur" value="${esc(p.name || '')}" maxlength="40" style="margin-top:12px">
    <div class="row" style="margin-top:10px"><button class="btn s" data-act="profSave">Enregistrer</button></div>
    <div class="mut" style="margin-top:8px">Nom et photo restent sur cet appareil.</div>
    <hr style="border:none;border-top:1px solid var(--bd);margin:12px 0">
    <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn s" data-act="bkSave">💾 Sauvegarder</button>
      <button class="btn g s" data-act="bkRestore">⬆ Restaurer</button></div>
    <div class="mut" style="margin-top:8px">${bkHandle ? 'Fichier lié : ' + esc(bkHandle.name) : (FS_OK() ? 'Un seul choix de fichier au premier clic, ensuite la sauvegarde réécrit ce même fichier sans aucune fenêtre.' : 'Ce navigateur ne permet pas l’écriture directe : la sauvegarde va dans « Téléchargements ».')}</div>
    <div class="mut" style="margin-top:6px">${bkAge()} · ${Math.round(JSON.stringify(S).length / 1024)} Ko · ${S.courses.length} cours · ${S.tests.length} QCM</div>
  </div>`;
}
// ---------- sauvegarde dans un fichier (File System Access API) ----------
let bkHandle = null;        // poignée vers le fichier de sauvegarde choisi
let bkStatus = {last:0, auto:true, err:''};
const FS_OK = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
function bkName() { return 'StudyTracker-sauvegarde.json'; }
function bkData() {
  return JSON.stringify(Object.assign({}, S, {_app:'StudyTracker', _savedAt:new Date().toISOString()}), null, 1);
}
function bkAge() {
  const d = bkStatus.last || (S.set.backup && S.set.backup.last) || 0;
  if (!d) return 'jamais sauvegardé';
  const h = (Date.now() - d) / 36e5;
  if (h < 1) return 'sauvegardé à l’instant';
  if (h < 24) return 'sauvegardé il y a ' + Math.round(h) + ' h';
  const j = Math.round(h / 24);
  return 'sauvegardé il y a ' + j + ' jour' + (j > 1 ? 's' : '');
}
// écrit dans le fichier déjà choisi (sans fenêtre) ; demande le fichier la 1re fois
async function bkWrite(silent) {
  const data = bkData();
  if (bkHandle) {
    try {
      const w = await bkHandle.createWritable();
      await w.write(data); await w.close();
      bkStatus.last = Date.now(); if (!S.set.backup) S.set.backup = {};
      S.set.backup.last = bkStatus.last;
      try { localStorage.setItem('studytracker', JSON.stringify(S)); } catch (e) {}
      if (!silent) toast('Sauvegardé dans ' + bkHandle.name + '.');
      return true;
    } catch (e) {
      if (e && e.name === 'NotAllowedError') { bkHandle = null; if (!silent) toast('Accès au fichier perdu — choisis-le à nouveau.'); }
      else { if (!silent) toast('Écriture impossible dans le fichier.'); }
      if (silent) return false;
    }
  }
  if (!FS_OK()) return false;
  try {
    const h = await window.showSaveFilePicker({suggestedName:bkName(), types:[{description:'Sauvegarde StudyTracker', accept:{'application/json':['.json']}}]});
    bkHandle = h;
    return await bkWrite(silent);
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Sauvegarde annulée.');
    return false;
  }
}
// repli universel : téléchargement classique
function bkDownload() {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bkData()], {type:'application/json'}));
    a.download = bkName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    bkStatus.last = Date.now(); if (!S.set.backup) S.set.backup = {}; S.set.backup.last = bkStatus.last;
    try { localStorage.setItem('studytracker', JSON.stringify(S)); } catch (e) {}
    toast('Sauvegarde téléchargée dans « Téléchargements ».');
  } catch (e) { toast('Sauvegarde impossible.'); }
}
async function bkSave() {
  if (FS_OK()) { if (!await bkWrite(false)) bkDownload(); }
  else bkDownload();
  render();
}
// restauration : depuis le fichier déjà lié, ou depuis l'explorateur
// ouvre l'explorateur de fichiers et restaure la sauvegarde choisie
function bkPickFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json,application/octet-stream';
  inp.style.position = 'fixed'; inp.style.left = '-9999px';
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = (inp.files || [])[0];
    if (!f) { inp.remove(); return; }
    let data;
    try { data = JSON.parse(await f.text()); }
    catch (e) { toast('Ce fichier n’est pas une sauvegarde StudyTracker.'); inp.remove(); return; }
    inp.remove();
    await bkApply(data, f.name);
  });
  inp.click();
}
async function bkRestore() {
  openProf = false; paintProf();     // on referme le panneau : il masquait la fenêtre
  setTimeout(bkPickFile, 80);
}
async function bkApply(data, name) {
  if (!data || !Array.isArray(data.courses)) { toast('Ce fichier n’est pas une sauvegarde StudyTracker.'); return false; }
  const d = data._savedAt ? new Date(data._savedAt).toLocaleString('fr-FR') : 'date inconnue';
  if (!await confirmDialog({title:'Êtes-vous sûr de vouloir restaurer cette sauvegarde ?', text:`Les données actuelles seront remplacées par celles du ${d} : ${data.courses.length} cours et ${(data.tests || []).length} QCM.`})) return false;
  S = Object.assign({courses:[], tests:[], attempts:[], events:[], exams:[], set:{}}, data);
  delete S._app; delete S._savedAt;
  S.set = Object.assign({theme:'auto', rank:true, colors:{}, done:{}, focus:{}, help:'', recPreset:null, autoEvents:true}, S.set);
  save(); applyTheme(); render(); paintProf(); paintThemes();
  toast('Sauvegarde restaurée' + (name ? ' depuis ' + name : '') + '.');
  return true;
}

let openThemes = false;
function themeGallery() {
  const p = S.set.profile || {}, name = p.name ? esc(p.name) : '';
  return `<div class="themepop" id="theme-pop">
    <div class="row sp" style="margin-bottom:10px"><b>Choisir un thème</b>
      <button class="x" data-act="themeClose">✕</button></div>
    ${name ? `<div class="mut" style="margin-bottom:8px">Préférence enregistrée pour ${name}.</div>` : ''}
    <div class="tgrid">${THEMES.map(([k, l, d]) => `<button class="tcard ${S.set.theme === k ? 'on' : ''}" data-act="setTheme" data-v="${k}" title="${esc(d)}">
      <span class="tsw t-${k}"><i></i><i></i><i></i></span>
      <b>${esc(l)}</b><small>${esc(d)}</small>
      ${S.set.theme === k ? '<span class="tcheck">✓</span>' : ''}</button>`).join('')}</div>
  </div>`;
}
function paintThemes() {
  const old = $('#theme-pop'); if (old) old.remove();
  const btn = $('#theme-btn'); if (btn) btn.classList.toggle('on', openThemes);
  const wrap = $('#theme-wrap');
  if (openThemes && wrap) wrap.insertAdjacentHTML('beforeend', themeGallery());
}
function paintProf() {
  const p = S.set.profile || {};
  const av = $('#prof-av'); if (av) av.innerHTML = avatarHtml(30);
  const nm = $('#prof-name'); if (nm) nm.textContent = p.name || 'Mon profil';
  const btn = $('#prof-btn'); if (btn) btn.classList.toggle('on', openProf);
  const old = $('#prof-pop'); if (old) old.remove();
  const wrap = $('#prof-wrap');
  if (openProf && wrap) wrap.insertAdjacentHTML('beforeend', profPanel());
}
function snapshot() {
  // champs des fenêtres modales (profil, sauvegarde…) : on garde la saisie
  if (cap) {
    const n = $('#p-name'); if (n) draft.pName = n.value;
  }
  if (form === 'subject') { const n = $('#m-name'); if (n) mName = n.value; }
  if (form === 'course') {
    for (const [id, k] of [['c-sub','cSub'], ['c-sem','cSem'], ['c-title','cTitle'], ['c-notes','cNotes']]) {
      const el = document.getElementById(id); if (el) draft[k] = el.value;
    }
  }
}
function render() {
  const nTasks = tasksFor(today()).filter(t => !isDone(t.id, t.date)).length;
  $('#nav').innerHTML = TABS.map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}${k === 'dash' && nTasks ? `<span class="n">${nTasks}</span>` : ''}</button>`).join('');
  $('#app').innerHTML = ({dash, courses, tests, stats, cal:calendar, exams, help, course:courseView, quiz:quizView})[view]();
  if (cap) $('#app').innerHTML += cap;
  paintProf(); paintThemes();
  if (flash) { $('#app').innerHTML = flashHtml(flash) + $('#app').innerHTML; }
  const ob = $('#break-overlay'); if (ob) ob.remove();
  if (pomo.phase === 'break') document.body.insertAdjacentHTML('beforeend', `<div id="break-overlay">${breakOverlay()}</div>`);
  const fb = $('#focusbar'); if (fb) fb.remove();
  document.body.classList.toggle('focus-on', pomo.phase === 'work');
  if (pomo.phase === 'work') document.body.insertAdjacentHTML('beforeend', pomoMini());
  const pv = $('#pdf-reader'); if (pv) pv.remove();
  if (openPdf) document.body.insertAdjacentHTML('beforeend', pdfReaderHtml(openPdf));
}

// ---------- lecteur PDF plein écran ----------
function pdfReaderHtml(id) {
  const c = S.courses.find(x => x.id === id);
  if (!c) { openPdf = null; return ''; }
  const box = document.createElement('div');
  box.innerHTML = c.notes || '';
  const pages = [...box.querySelectorAll('figure.pdfpage img')].map(i => i.getAttribute('src'));
  if (!pages.length) { openPdf = null; return ''; }
  return `<div class="pdfread" id="pdf-reader">
    <div class="bar"><span class="t">📖 ${esc(c.title)} · ${pages.length} page(s)</span>
      <button class="btn q s" data-act="readPdfClose">✕ Fermer</button></div>
    <div class="view">${pages.map((src, i) => `<img src="${src}" alt="Page ${i + 1}" loading="lazy">`).join('')}</div>
  </div>`;
}
function flashHtml(f) {
  return `<div class="card" style="border-color:color-mix(in srgb,var(--ac) 40%,var(--bd));background:color-mix(in srgb,var(--ac) 7%,var(--card))">
    <div class="row sp"><div><b>${esc(f.title)}</b><div class="mut" style="margin-top:4px">${esc(f.body)}</div></div>
    <button class="btn q s" data-act="closeFlash">Fermer</button></div></div>`;
}
const badgeAvg = a => `<span class="pill ${cls(a)}">${f1(a)}</span>${rk(a)}`;
function subjectColor(sub) {
  const c = (S.set.colors || {})[sub];
  if (c) return c;
  const co = S.courses.find(c => c.subject === sub);
  if (co && co.color) return co.color;
  return colorOf(sub);
}
const dot = s => `<span class="dot" style="background:${subjectColor(s)}"></span>`;






function dash() {
  const g = avg(S.tests.flatMap(cur).map(pct)), subs = subjects(), w = weak(S.courses);
  const rec = [...S.attempts].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 5);
  const d = today();
  const tasks = tasksFor(d), dn = tasks.filter(t => isDone(t.id, t.date)).length;
  const pf = pomo.phase;
  const pbtn = `<button class="btn-pomo" data-act="pomoOpen">
      <span class="pi">${pf === 'work' ? '🍅' : pf === 'break' ? '☕' : '🍅'}</span>
      <span><b>Pomodoro</b><small id="pomo-btn-sub">${pf === 'work' ? 'Focus en cours · ' + mmss(pomo.left) + ' — cliquer pour gérer' : pf === 'break' ? 'Pause en cours · ' + mmss(pomo.left) : `Mode focus : ${pomo.work} min de travail, ${pomo.brk} min de pause`}</small></span>
    </button>`;
  const ppanel = pomo.preset ? `<div class="card" style="border-color:color-mix(in srgb,var(--bad) 35%,var(--bd))">
      <div class="row sp"><h3>🍅 Mode focus (Pomodoro)</h3><button class="x" data-act="pomoClose">✕</button></div>
      <div class="row" style="margin-top:10px"><span class="mut" style="min-width:96px">Travail</span>
        ${[15, 25, 45, 50].map(n => `<button class="chip ${pomo.work === n ? 'on' : ''}" data-act="pomoWork" data-v="${n}">${n} min</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><span class="mut" style="min-width:96px">Pause</span>
        ${[3, 5, 10, 15].map(n => `<button class="chip ${pomo.brk === n ? 'on' : ''}" data-act="pomoBreak" data-v="${n}">${n} min</button>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn" style="background:var(--bad);border-color:var(--bad);color:#fff" data-act="pomoStart">▶ Démarrer le focus</button>
        <span class="mut">Pendant la pause, l’application se bloque jusqu’à la reprise.</span></div>
    </div>` : '';
  const p = tasks.length ? dn / tasks.length * 100 : 0;
  // bandeau de sauvegarde
  const lastBk = bkStatus.last || (S.set.backup && S.set.backup.last) || 0;
  const ageJ = lastBk ? (Date.now() - lastBk) / 864e5 : 999;
  const bkBar = `<div class="bkbar ${ageJ > 7 ? 'warn' : ''}">
    <span>💾 ${ageJ > 7 ? '<b>Aucune sauvegarde récente</b> — tes données vivent dans ce navigateur.' : 'Dernière sauvegarde : ' + bkAge() + '.'}</span>
    <span class="row" style="gap:6px"><button class="btn s" data-act="bkSave">Sauvegarder</button><button class="btn g s" data-act="bkRestore">Restaurer</button></span>
  </div>`;
  return `${bkBar}${pbtn}${ppanel}<div class="grid">
    <div class="kpi"><div class="lbl">Moyenne QCM</div><div class="big ${cls(g)}">${f1(g)}${rk(g)}</div></div>
    <div class="kpi"><div class="lbl">Cours</div><div class="big">${S.courses.length}</div></div>
    <div class="kpi"><div class="lbl">Tests passés</div><div class="big">${S.attempts.length}</div></div>
    <div class="kpi"><div class="lbl">À faire aujourd’hui</div><div class="big">${tasks.length - dn}${tasks.length ? `<span class="mut" style="font-size:14px;font-weight:500"> / ${tasks.length}</span>` : ''}</div></div>
  </div>

  <h2>✅ Tâches à faire aujourd’hui <span class="mut" style="font-weight:400">· ${fmtShort(d)}</span></h2>
  <div class="card">
    ${tasks.length ? `<div class="prog"><div class="bar"><i style="width:${p}%;background:${p === 100 ? 'var(--ok)' : 'var(--ac)'}"></i></div><span class="mut">${dn}/${tasks.length}</span></div>` : ''}
    ${tasks.map(t => `<div class="task ${isDone(t.id, t.date) ? 'done' : ''}">
      <input type="checkbox" ${isDone(t.id, t.date) ? 'checked' : ''} data-act="task" data-id="${t.id}" data-d="${t.date}">
      <div class="tt"><b>${esc(t.auto ? (t.kind === 'course' ? 'J' + t.day + ' · ' + (itemName(t.kind, t.itemId) || t.title) : 'QCM J' + t.day + ' · ' + (itemName(t.kind, t.itemId) || t.title)) : t.title)}</b>
        <div class="mut"><span class="tag">${esc(t.type || 'Autre')}</span>${t.auto ? 'révision automatique' : (t.due !== t.date ? 'du ' + fmt(t.due) : 'aujourd’hui')}</div></div>
      ${t.auto && t.kind === 'course' ? `<button class="btn q s" data-act="openItem" data-kind="course" data-id="${t.itemId}">Ouvrir</button>` : ''}
      ${t.auto && t.kind === 'test' ? `<button class="btn q s" data-act="quiz" data-id="${t.itemId}">QCM</button>` : ''}
    </div>`).join('') || `<div class="empty">Aucune tâche pour aujourd’hui.<br><span class="mut">Ajoute un événement dans l’onglet <b>Calendrier</b> : il apparaîtra ici le jour venu.</span></div>`}
    ${tasks.length ? `<div class="mut" style="margin-top:8px">Les tâches viennent de ton agenda. <button class="btn q s" data-act="view" data-v="cal">Ouvrir le calendrier</button></div>` : ''}
  </div>

  ${subs.length ? `<h2>Matières</h2><div class="grid">${subs.map(s => {
    const a = subjStats(s).avg;
    return `<div class="card" style="margin:0"><div class="row sp"><b><span class="dot" style="background:${subjectColor(s)}"></span> ${esc(s)}</b><span>${badgeAvg(a)}</span></div>
    <div class="bar"><i style="width:${a || 0}%;background:${subjectColor(s)}"></i></div></div>`;
  }).join('')}</div>` : ''}

  <h2>🎯 À retravailler</h2>
  ${w.length ? w.map(x => `<div class="card"><b>${dot(x.sub)} ${esc(x.label)}</b> <span class="tag">${esc(x.sub)}</span><div class="mut">${x.why.map(esc).join(' · ')}</div></div>`).join('')
    : `<div class="card empty">${S.attempts.length ? 'Rien d’alarmant, continue !' : 'Ajoute des cours et des QCM pour voir tes points faibles.'}</div>`}

  <h2>Derniers résultats</h2>
  ${rec.length ? rec.map(a => {
    const t = S.tests.find(t => t.id === a.testId);
    return `<div class="card row sp" style="padding:11px 15px"><span>${esc(t ? t.title : '(supprimé)')} <span class="mut">· ${fmt(a.date)}</span></span><span class="pill ${cls(pct(a))}">${a.score}/${a.max}</span></div>`;
  }).join('') : '<div class="card empty">Aucun résultat.</div>'}`;
}

function courses() {
  const subs = subjects(), sems = semesters();
  const list = S.courses.filter(c => (!filt.sem || c.semester === filt.sem) && (!filt.sub || c.subject === filt.sub));
  const f = form === 'course' ? `<div class="card"><div class="row">
      <input id="c-sub" class="flex1" placeholder="Matière" list="dl-sub" data-act="subInput" value="${esc(draft.cSub || '')}"><input id="c-sem" class="flex1" placeholder="Semestre (S1…)" list="dl-sem" value="${esc(draft.cSem || '')}"><input id="c-title" class="flex1" placeholder="Titre du cours" value="${esc(draft.cTitle || '')}"></div>
    <div class="row" style="margin-top:10px"><span class="mut" style="min-width:52px">Couleur</span>
      ${PALETTE.map(c => `<button class="sw ${(courseColor || '').toLowerCase() === c.toLowerCase() ? 'sel' : ''}" data-act="pickCourseColor" data-v="${c}" style="background:${c}"></button>`).join('')}
      <input type="color" id="c-color" value="${PALETTE[0]}" data-act="customCourseColor" title="Couleur personnalisée" style="width:34px;height:26px;padding:1px;border-radius:8px;cursor:pointer;background:var(--bg)">
      <span class="mut">de la matière</span></div>
    <div class="row" style="margin-top:8px"><span class="btn g s" role="button" tabindex="0" data-act="pick" data-for="impCourse">📄 Importer un Word ou un PDF</span><input type="file" id="c-file" accept=".docx,.pdf,.html,.txt" data-act="impCourse" hidden><span class="mut" id="c-fn"></span></div>
    <textarea id="c-notes" placeholder="Contenu du cours (texte simple, ou importé depuis Word en gardant la mise en forme)" style="margin-top:8px">${esc(draft.cNotes || '')}</textarea>
    ${recChips()}
    <div class="row" style="margin-top:8px"><button class="btn" data-act="addCourse">Enregistrer</button><button class="btn g" data-act="cancel">Annuler</button></div></div>
    <datalist id="dl-sub">${subs.map(s => `<option value="${esc(s)}">`).join('')}</datalist><datalist id="dl-sem">${sems.map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : '';
  const fm = form === 'subject' ? `<div class="card">
      <div class="row sp"><h3>Nouvelle matière</h3><button class="x" data-act="cancel">✕</button></div>
      <div class="row" style="margin-top:10px"><input id="m-name" class="flex1" placeholder="Nom de la matière (ex. Droit constitutionnel)" value="${esc(mName)}" data-act="mName"></div>
      <div class="row" style="margin-top:12px"><span class="mut" style="min-width:52px">Couleur</span>
        ${PALETTE.map(c => `<button class="sw ${newColor.toLowerCase() === c.toLowerCase() ? 'sel' : ''}" data-act="pickColor" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('')}
        <label class="sw" style="display:grid;place-items:center;background:var(--bg);border:1px dashed var(--bd);cursor:pointer" title="Couleur personnalisée">
          <input type="color" id="m-color" value="${PALETTE[0]}" data-act="customColor" style="opacity:0;position:absolute;width:1px;height:1px">
          <span style="font-size:15px">🎨</span></label>
        <span class="row" style="gap:6px;margin-left:6px"><span class="dot" style="background:${newColor};width:12px;height:12px"></span><span class="mut">${esc(mName || 'Aperçu')}</span></span>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn" data-act="addSubject">Créer la matière</button><button class="btn g" data-act="cancel">Annuler</button></div>
      <div class="mut" style="margin-top:8px">La couleur sert partout : cartes de cours, statistiques, notes, calendrier.</div></div>` : '';
  const gs = {};
  list.forEach(c => ((gs[c.semester] = gs[c.semester] || {})[c.subject] = gs[c.semester][c.subject] || []).push(c));
  const noCourse = subs.filter(s => !S.courses.some(c => c.subject === s));
  return `<div class="row sp"><div class="row">
    <select data-act="fsem"><option value="">Tous les semestres</option>${sems.map(s => `<option ${filt.sem === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <select data-act="fsub"><option value="">Toutes les matières</option>${subs.map(s => `<option ${filt.sub === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    <span class="row"><button class="btn g" data-act="form" data-v="subject">🎨 Nouvelle matière</button><button class="btn" data-act="form" data-v="course">+ Nouveau cours</button></span></div><div style="height:10px"></div>${fm}${f}
  ${noCourse.length ? `<div class="card"><div class="mut" style="margin-bottom:6px">Matières créées, sans cours pour l’instant :</div><div class="row">${noCourse.map(s => `<span class="row" style="gap:4px"><button class="chip" data-act="color" data-v="${esc(s)}">${dot(s)} ${esc(s)}</button><button class="x" data-act="delSubject" data-v="${esc(s)}" title="Supprimer la matière">✕</button></span>`).join('')}</div></div>` : ''}
  ${Object.keys(gs).sort().map(sem => `<h2>${esc(sem)}</h2>${Object.keys(gs[sem]).sort().map(sb => `
    <div class="row sp" style="margin:10px 0 6px"><span class="row"><b>${dot(sb)} ${esc(sb)}</b>${rk(subjStats(sb).avg)}</span>
      <button class="btn g s" data-act="delSubject" data-v="${esc(sb)}">🗑 Supprimer la matière</button></div>
    <div class="grid">${gs[sem][sb].map(c => {
      const st = courseStats(c);
      return `<div class="card cc" style="--h:${c.color || subjectColor(sb)}" data-act="openCourse" data-id="${c.id}">
        <div class="row sp"><h3>${esc(c.title)}</h3><button class="x" data-act="delCourse" data-id="${c.id}">✕</button></div>
        <div class="mut">${testsOfCourse(c).length} test(s) · ${strip(c.notes).length ? '📄 contenu' : 'vide'}${c.rec && c.rec.on ? ` · 🔁 J${c.rec.days.join('/J')}` : ''}</div>
        <div class="row sp" style="margin-top:6px">${spark(st.ps)}<span>${badgeAvg(st.avg)}</span></div>
        ${c.rec && c.rec.on ? '' : ''}</div>`;
    }).join('')}</div>`).join('')}`).join('') || '<div class="card empty">Aucun cours. Ajoute-en un ou importe un Word.</div>'}`;
}

function courseView() {
  const c = S.courses.find(c => c.id === cid);
  if (!c) { view = 'courses'; return courses(); }
  const col = c.color || subjectColor(c.subject);
  return `<button class="btn g s" data-act="view" data-v="courses">← Retour</button>
  <div class="card" style="margin-top:10px;border-left:5px solid ${col}">
    <div class="row sp"><h2 style="margin:0">${esc(c.title)}</h2><span>${dot(c.subject)} <span class="tag">${esc(c.subject)}</span><span class="tag">${esc(c.semester)}</span></span></div>
    <div class="row" style="margin:10px 0 4px">
      <span class="btn g s" role="button" tabindex="0" data-act="pick" data-for="impNotes" data-id="${c.id}">📄 Ajouter un Word / PDF</span><input type="file" accept=".docx,.pdf,.html,.txt" data-act="impNotes" data-id="${c.id}" hidden>
      <span class="btn g s" role="button" tabindex="0" data-act="pick" data-for="impImages" data-id="${c.id}">🖼 Ajouter des images</span><input type="file" accept="image/*" multiple data-act="impImages" data-id="${c.id}" hidden>
      <button class="btn g s" data-act="editNotes" data-id="${c.id}">✎ Modifier</button>
      ${/pdfpage/i.test(c.notes || '') ? `<button class="btn s" data-act="readPdf" data-id="${c.id}">📖 Lire en plein écran</button>` : ''}
    </div>
    ${itemRecHtml('course', c)}
    <div class="docwrap">${c.notes ? `<div class="doc" style="margin-top:8px">${c.notes.trim().startsWith('<') ? c.notes : `<div class="q">${esc(c.notes)}</div>`}</div>` : '<span class="mut">Aucun contenu.</span>'}</div>
    ${/<img/i.test(c.notes || '') ? `<div class="row" style="margin-top:10px"><button class="btn g s" data-act="delImages" data-id="${c.id}">🗑 Supprimer les images</button><span class="mut">le texte et sa mise en forme sont conservés</span></div>` : ''}
  </div>
  <h2>Tests liés</h2>
  ${testsOfCourse(c).map(t => `<div class="card row sp" style="padding:11px 15px"><span>${esc(t.title)} <span class="mut">${(t.questions || []).length} question(s)</span></span><span>${(t.questions || []).length ? `<button class="btn s" data-act="quiz" data-id="${t.id}">▶ Lancer</button>` : ''}</span></div>`).join('') || '<div class="card empty">Aucun test pour ce cours.</div>'}`;
}

function tests() {
  const f = form === 'test' ? `<div class="card"><div class="row"><input id="t-title" class="flex1" placeholder="Titre du test / QCM">
    <select id="t-scope" data-act="scope"><option value="course">Lié à un cours</option><option value="subject">Toute une matière</option></select>
    <select id="t-course" class="flex1">${S.courses.map(c => `<option value="${c.id}">${esc(c.subject)} – ${esc(c.title)}</option>`).join('') || '<option value="">(crée d’abord un cours)</option>'}</select>
    <input id="t-subject" class="flex1" placeholder="Matière" list="dl-s2" style="display:none"><datalist id="dl-s2">${subjects().map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
    ${recChips()}
    <div class="row" style="margin-top:8px"><button class="btn" data-act="addTest">Enregistrer</button><button class="btn g" data-act="cancel">Annuler</button></div></div>` : '';
  const help = helpOpen ? `<div class="card info" style="margin-bottom:10px"><b>💡 Import d’un QCM</b>
    <div class="mut" style="margin-top:4px">Le fichier doit contenir les <b>bonnes réponses</b>. Formats acceptés : Word (.docx), PDF, .txt, .json, ou un texte collé.</div>
    <div class="mut" style="margin-top:4px;font-size:12.5px">Réponses reconnues : <b>Paris ✓</b>, <b>* Paris</b>, <b>(vrai)</b>, <b>[x]</b>, <b>Réponse : b</b>, ou un corrigé à part (<b>Corrigé : 1b 2a</b>). Rien de détecté ? Le corrigé peut être saisi à la main.</div></div>` : '';
  return help + `<div class="row sp"><span class="mut">Tes QCM et tes notes.</span>
    <span class="row"><button class="btn g s" data-act="resetAll">↺ Tout réinitialiser</button><button class="btn g s" data-act="qcmHelp" title="Aide sur l’import">?</button><button class="btn" data-act="form" data-v="test">+ Nouveau test</button></span></div><div style="height:10px"></div>${f}
  ${S.tests.map(t => {
    const c = S.courses.find(c => c.id === t.courseId), at = cur(t), ps = at.map(pct), n = (t.questions || []).length;
    const noAns = (t.questions || []).filter(q => !(q.answer >= 0)).length;
    return `<div class="card"><div class="row sp"><div><b>${esc(t.title)}</b><div><span class="tag">${t.scope === 'course' ? 'Cours' : 'Matière'}</span><span class="mut">${esc(t.scope === 'course' ? (c ? c.title : '(cours supprimé)') : t.subject)} · ${n} question(s)${noAns ? ` · <span class="warn">${noAns} sans réponse indiquée</span>` : ''}${rd(t) ? ' · cycle ' + (rd(t) + 1) : ''}</span></div></div>
      <div class="row">${spark(ps)}${badgeAvg(avg(ps))}<button class="x" data-act="delTest" data-id="${t.id}">✕</button></div></div>
      <div class="row" style="margin-top:8px">${n ? `<button class="btn s" data-act="quiz" data-id="${t.id}">▶ Répondre</button>
      <button class="btn g s" data-act="quiz" data-id="${t.id}" data-chrono="1" title="Répondre avec chronomètre">▶⏱</button>` : ''}
      <button class="btn g s" data-act="addMenu" data-id="${t.id}">⬆ Importer</button>
      ${noAns && n ? `<button class="btn g s" data-act="keyTest" data-id="${t.id}">🔑 Corrigé (${noAns})</button>` : ''}
      ${all(t).length ? `<button class="btn g s" data-act="toggle" data-id="${t.id}">${open[t.id] ? 'Historique ▲' : 'Historique'}</button>` : ''}
      <button class="btn g s" data-act="moreMenu" data-id="${t.id}" title="Plus d’options">⋯</button></div>
      ${menuFor(t.id, 'add')}${menuFor(t.id, 'more')}
      <div class="row" style="margin-top:8px"><span class="mut">Note manuelle :</span><input type="number" id="s-${t.id}" min="0" step="0.5" placeholder="Note"> / <input type="number" id="m-${t.id}" min="1" step="0.5" value="20"><input type="date" id="d-${t.id}" value="${today()}"><button class="btn s" data-act="addAttempt" data-id="${t.id}">Ajouter</button></div>
      ${itemRecHtml('test', t)}
      ${open[t.id] ? `<div style="margin-top:8px">${[...all(t)].reverse().map(a => `<div class="row sp mut"><span>${fmt(a.date)} · cycle ${(a.round || 0) + 1}</span><span class="row"><span class="pill ${cls(pct(a))}">${a.score}/${a.max} (${f1(pct(a))})</span><button class="btn q s" data-act="editAttempt" data-id="${a.id}" title="Modifier cette note">✎</button><button class="x" data-act="delAttempt" data-id="${a.id}">✕</button></span></div>`).join('')}</div>` : ''}</div>`;
  }).join('') || '<div class="card empty">Aucun test. Crée un test puis importe un QCM depuis Word.</div>'}`;
}

// ---------- menus d'actions (QCM) ----------
let testMenu = null;   // {id, kind:'add'|'more'}
let helpOpen = false;  // encart d'aide de l'onglet Tests & QCM
let openPdf = null;    // cours PDF affiché en plein écran
function menuFor(id, kind) {
  if (!testMenu || testMenu.id !== id || testMenu.kind !== kind) return '';
  const items = kind === 'add' ? [
    ['pickQcm', '📄 Choisir un fichier (Word, PDF, texte, JSON)'],
    ['pasteQ', '📋 Coller du texte'],
    ['sep', ''],
    ['impNewTest', '＋ Nouveau test depuis un fichier']
  ] : [
    ['relinkTest', '🔗 Rattacher à une matière / un cours'],
    ['reset', '↺ Nouveau cycle'],
    ['delTest', '🗑 Supprimer ce QCM', 'danger']
  ];
  return `<div class="tmenu">${items.map(([act, label, cl]) => act === 'sep'
    ? '<div class="tsep"></div>'
    : `<button class="tmi ${cl || ''}" data-act="${act}" data-id="${id}">${label}</button>`).join('')}</div>`;
}
function closeTestMenu() { if (testMenu) { testMenu = null; render(); } }

// sélecteur de fichier pour un QCM (Word, PDF, texte, JSON).
// Créé et ouvert dans le clic : Safari/iPad n'autorise pas un .click() différé.
function qcmPicker(testId) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.docx,.pdf,.txt,.json,application/pdf,application/json,text/plain';
  inp.style.position = 'fixed'; inp.style.left = '-9999px';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => importQcmFile(inp, testId), { once: true });
  return inp;
}
async function importQcmFile(inp, testId) {
  const f = (inp.files || [])[0];
  inp.remove();
  if (!f) return;
  const test = S.tests.find(x => x.id === testId);
  if (!test) return;
  try {
    let qs;
    if (/\.json$/i.test(f.name)) {
      const j = JSON.parse(await f.text());
      qs = (Array.isArray(j) ? j : j.questions).map(x => ({
        q:x.q || x.question, choices:(x.choices || x.options || []).map(String),
        answer:x.answer ?? x.correct ?? -1, expl:x.expl || x.explanation || ''
      })).filter(x => x.q && x.choices && x.choices.length > 1);
    } else {
      let txt;
      if (/\.pdf$/i.test(f.name)) txt = await readDoc(f, true);
      else if (/\.docx$/i.test(f.name)) txt = await docxToHtml(await f.arrayBuffer());
      else txt = await f.text();
      qs = parseQCM(txt);
    }
    if (!qs || !qs.length) { toast('Aucune question reconnue dans ce fichier. Vérifie que les questions ont bien des propositions (a, b, c…).'); return; }
    test.questions = (test.questions || []).concat(qs);
    const noAns = qs.filter(q => q.answer < 0).length;
    if (noAns === qs.length) {
      const res = await promptDialog({title:'Aucune réponse détectée', text:'Le fichier ne contient aucune bonne réponse lisible. Tu peux saisir le corrigé maintenant (ex. « 1b 2a 3c » ou « b, a, c »), ou plus tard avec « 🔑 Corrigé ».', fields:[{label:'Corrigé (facultatif)', value:''}], ok:'Appliquer', danger:false});
      if (res && res[0].trim()) applyKey(qs, res[0]);
    }
    const left = test.questions.filter(q => !(q.answer >= 0)).length;
    flash = {title:qs.length + ' question(s) importée(s)', body:(left ? `${test.questions.length - left} bonne(s) réponse(s) détectée(s) sur ${test.questions.length}, ${left} à compléter.` : 'Les questions, les choix et les bonnes réponses ont été détectés automatiquement.') + ' Clique sur « ▶ Répondre » pour t’entraîner ; la correction s’affiche à la fin.'};
    save(); render();
  } catch (err) { toast('Import impossible : ' + err.message); }
}

// ---------- QCM ----------
function allCorrOpen() { return Object.keys(openCorr).some(k => openCorr[k]); }
function quizView() {
  const t = S.tests.find(t => t.id === Q.id);
  if (!t) { view = 'tests'; return tests(); }
  const qs = t.questions || [];
  if (!qs.length) { view = 'tests'; return tests(); }
  if (Q.i >= qs.length) {
    const p = Q.score / qs.length * 100;
    const qdone = (S.attempts.find(a => a.id === Q.attemptId) || {});
    return `<div class="qwrap"><div class="card" style="text-align:center">
      <h2 style="margin-top:4px">${esc(t.title)}</h2>
      <div class="big ${cls(p)}" style="font-size:38px">${Q.score}/${qs.length}${rk(p)}</div>
      <p class="mut">Résultat enregistré (${f1(p)}).${Q.elapsed ? ` Temps : ${mmss(Q.elapsed)}${Q.limit ? ' (limite ' + mmss(Q.limit) + ')' : ''} · ${(Q.elapsed / qs.length).toFixed(1)} s/question.` : ''}</p>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="btn" data-act="quiz" data-id="${t.id}">Recommencer</button><button class="btn g" data-act="view" data-v="tests">Terminer</button></div>
    </div>
    <h2>Correction — ${qs.length} question(s)</h2>
    <div class="row" style="margin-bottom:10px"><button class="btn g s" data-act="toggleAllCorr" data-id="${t.id}">${allCorrOpen() ? 'Tout replier' : 'Tout déplier'}</button></div>
    <div class="corr">${qs.map((q, i) => {
      const mine = Q.answers[i];
      const ok = mine === q.answer;
      const o = openCorr[Q.attemptId + '|' + i];
      return `<details class="citem" ${o ? 'open' : ''} data-act="corrToggle" data-id="${Q.attemptId + '|' + i}">
        <summary><span class="cnum ${ok ? 'ok' : mine == null ? 'mut' : 'bad'}">${ok ? '✓' : mine == null ? '–' : '✗'}</span> ${i + 1}. ${esc(strip(q.q))}</summary>
        <div class="cbody">
          <div class="mut">Ta réponse : ${mine == null ? '<i>sans réponse</i>' : esc(strip(q.choices[mine] || ''))}</div>
          <div class="ca">✔ Bonne réponse : ${q.answer >= 0 && q.choices[q.answer] ? esc(strip(q.choices[q.answer])) : '<span class="mut">non indiquée dans l’import</span>'}</div>
          ${q.expl ? `<div class="mut" style="margin-top:3px">💡 ${esc(strip(q.expl))}</div>` : ''}
        </div></details>`;
    }).join('')}</div></div>`;
  }
  const q = qs[Q.i], mine = Q.answers[Q.i], revealed = Q.revealed[Q.i];
  const isLast = Q.i + 1 >= qs.length;
  const timeUp = chrono.on && chrono.limit > 0 && chrono.elapsed >= chrono.limit;
  return `<div class="qwrap"><div class="qhead"><span class="mut">${esc(t.title)}</span><button class="btn q s" data-act="quitQuiz">Quitter</button></div>
  ${chrono.on ? `<div class="chrono"><span class="ct" id="chrono-t">⏱ ${mmss(chrono.elapsed)}</span>${chrono.limit ? `<span class="mut">/ ${mmss(chrono.limit)}</span><span class="bar" style="flex:1"><i id="chrono-bar" style="width:${Math.min(100, chrono.elapsed / chrono.limit * 100)}%;background:${chrono.elapsed / chrono.limit > .85 ? 'var(--bad)' : 'var(--warn)'}"></i></span>` : `<span class="mut">chronomètre libre</span>`}</div>` : ''}
  ${timeUp ? `<div class="fb wrong" style="margin-bottom:12px"><b class="bad">Temps écoulé !</b> Tu ne peux plus répondre. <button class="btn s" data-act="endQuiz">Voir la correction</button></div>` : ''}
  <div class="bar" style="margin-bottom:14px"><i style="width:${Q.i / qs.length * 100}%;background:var(--ac)"></i></div>
  <div class="card">
    <div class="qnum">Question ${Q.i + 1} / ${qs.length}</div>
    <div style="font-size:16.5px;font-weight:600;margin:8px 0 12px">${esc(strip(q.q))}</div>
    ${q.choices.map((c, i) => {
      const k = mine === i ? 'sel' : '';
      return `<button class="ch ${k}" data-act="pick" data-i="${i}" ${timeUp ? 'disabled' : ''}>
        <span class="lt">${'ABCDEFGH'[i]}.</span><span>${esc(strip(c))}</span></button>`;
    }).join('')}
    <div class="mut" style="margin-top:6px">Les réponses s’afficheront à la fin, avec la correction complète.</div>
    <div class="row" style="justify-content:space-between;margin-top:14px">
      <button class="btn q s" data-act="prevQ" ${Q.i ? '' : 'disabled'}>← Précédent</button>
      <button class="btn" data-act="nextQ" ${mine == null ? 'disabled' : ''}>${isLast ? 'Terminer et voir mes résultats →' : 'Question suivante →'}</button>
    </div>
  </div></div>`;
}

function focusSessions() {
  const f = S.set.focus || {};
  const days = Object.keys(f).sort();
  const total = days.reduce((a, k) => a + f[k], 0);
  const td = f[today()] || 0;
  // semaine en cours (lundi → dimanche)
  const now = new Date(), off = (now.getDay() + 6) % 7;
  let week = 0;
  for (let i = 0; i <= off; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    week += f[k] || 0;
  }
  // série de jours consécutifs avec au moins une session
  let streak = 0;
  const d = new Date(now);
  for (;;) {
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (f[k]) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const x = new Date(now); x.setDate(now.getDate() - i);
    const k = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    last14.push({k, n:f[k] || 0, l:x.toLocaleDateString('fr-FR', {weekday:'narrow'})});
  }
  return {f, days, total, td, week, streak, last14, max:Math.max(1, ...last14.map(x => x.n))};
}
function focusStatsCard() {
  const fsx = focusSessions();
  const bars = fsx.last14.map(x => `<div class="fbar" title="${fmt(x.k)} : ${x.n} session(s)"><i style="height:${Math.round(x.n / fsx.max * 100)}%"></i><span>${x.l}</span></div>`).join('');
  return `<h2>🍅 Sessions de focus</h2>
  <div class="grid">
    <div class="kpi"><div class="lbl">Aujourd’hui</div><div class="big">${fsx.td}</div></div>
    <div class="kpi"><div class="lbl">Cette semaine</div><div class="big">${fsx.week}</div></div>
    <div class="kpi"><div class="lbl">Total</div><div class="big">${fsx.total}</div></div>
    <div class="kpi"><div class="lbl">Série en cours</div><div class="big">${fsx.streak}<span class="mut" style="font-size:14px;font-weight:500"> jour(s)</span></div></div>
  </div>
  <div class="card" style="margin-top:10px"><div class="mut" style="margin-bottom:6px">14 derniers jours (sessions terminées)</div>
    <div class="fbars">${bars}</div></div>`;
}
function help() {
  const h = S.set.help || '';
  return `<div class="row sp"><h2 style="margin:0">❓ Aide</h2><button class="btn s" data-act="helpEdit">✎ Modifier</button></div>
  <div class="card" style="margin-top:10px">
    <div class="doc">${h ? (h.trim().startsWith('<') ? h : `<div class="q">${esc(h)}</div>`) : '<span class="mut">Cette rubrique est vide pour l’instant. Clique sur « ✎ Modifier » pour écrire ta propre aide : mode d’emploi, méthodes de révision, consignes…</span>'}</div>
  </div>
  <h2>Démarrer en 4 étapes</h2>
  <div class="card">
    <div class="mut" style="line-height:1.8">
      <b>1. Crée tes matières</b> — onglet Cours → « 🎨 Nouvelle matière », avec une couleur.<br>
      <b>2. Ajoute tes cours</b> — « + Nouveau cours » ou importe un fichier Word (.docx) : la mise en forme d’origine est conservée.<br>
      <b>3. Importe tes QCM</b> — onglet Tests &amp; QCM → « ⬆ Importer des questions » (.docx, .txt ou .json). Questions, choix et bonnes réponses sont détectés automatiquement ; la correction s’affiche à la fin.<br>
      <b>4. Laisse l’agenda travailler</b> — à la création d’un cours ou d’un QCM, l’appli note la date et place automatiquement des rappels de révision (par défaut J1 / J3 / J7 / J30). Le rythme est modifiable à la création (rythme prédéfini ou personnalisé) et après coup, sur chaque cours ou QCM (« ⏱ Modifier la récurrence »). Coche « Mémoriser ce rythme » pour l’appliquer aux prochains.<br>
      <b>5. Organise-toi</b> — onglet Calendrier : les événements du jour apparaissent dans « Tâches à faire aujourd’hui » sur l’accueil. Le bouton rouge Pomodoro lance un mode focus avec pause bloquante.
    </div>
  </div>`;
}
function stats() {
  const subs = subjects();
  if (!subs.length) return `<div class="card empty">Ajoute des cours et des tests pour voir des statistiques.</div>${focusStatsCard()}`;
  const ALL = '__all__';
  if (!subj) subj = ALL;
  if (subj !== ALL && !subs.includes(subj)) subj = ALL;
  const all = subj === ALL;
  const ts = all ? S.tests : testsOfSubject(subj);
  const cs = all ? S.courses : S.courses.filter(c => c.subject === subj);
  const st = statsFor(ts), rs = rounds(ts), mm = missed(ts), w = weak(cs);
  const chips = `<div class="row" style="margin-bottom:10px">
      <button class="chip ${all ? 'on' : ''}" data-act="subj" data-v="${ALL}">📚 Toutes les matières</button>
      ${subs.map(s => `<button class="chip ${s === subj ? 'on' : ''}" data-act="subj" data-v="${esc(s)}">${dot(s)} ${esc(s)}</button>`).join('')}</div>`;
  const perSubject = all ? `<h2>Détail par matière</h2><div class="card scroll"><table class="plain">
      <tr><th>Matière</th><th>Moyenne</th><th>Résultats</th><th>Tendance</th><th>Cours</th></tr>
      ${subs.map(s => {
        const x = subjStats(s);
        return `<tr><td>${dot(s)} ${esc(s)}</td><td>${f1(x.avg)}</td><td>${x.n}</td>
          <td class="${x.trend == null ? 'mut' : x.trend >= 0 ? 'ok' : 'bad'}">${x.trend == null ? '–' : (x.trend >= 0 ? '+' : '') + Math.round(x.trend) + ' pts'}</td>
          <td>${S.courses.filter(c => c.subject === s).length}</td></tr>`;
      }).join('')}</table></div>
      <h2>Matières les plus solides / les plus fragiles</h2>
      <div class="card">${subs.map(s => ({s, a:subjStats(s).avg})).filter(x => x.a != null).sort((a, b) => b.a - a.a)
        .map((x, i) => `<div class="row sp" style="padding:3px 0"><span>${i === 0 ? '🏆 ' : ''}${dot(x.s)} ${esc(x.s)}</span><span class="pill ${cls(x.a)}">${f1(x.a)}</span></div>`).join('') || '<span class="mut">Pas encore assez de résultats.</span>'}</div>` : '';
  return `${chips}
  <div class="grid"><div class="kpi"><div class="lbl">Moyenne ${all ? 'générale' : ''} (cycle actuel)</div><div class="big ${cls(st.avg)}">${f1(st.avg)}${rk(st.avg)}</div></div>
  <div class="kpi"><div class="lbl">Résultats</div><div class="big">${st.n}</div></div>
  <div class="kpi"><div class="lbl">Tendance</div><div class="big ${st.trend == null ? 'mut' : st.trend >= 0 ? 'ok' : 'bad'}">${st.trend == null ? '–' : (st.trend >= 0 ? '+' : '') + Math.round(st.trend) + ' pts'}</div></div>
  <div class="kpi"><div class="lbl">Tests</div><div class="big">${ts.length}</div></div></div>
  <h2>Évolution</h2><div class="card">${chart(st.at)}</div>
  ${perSubject}
  <h2>Par cours</h2><div class="card">${cs.map(c => { const x = courseStats(c); return `<div class="row sp" style="padding:3px 0"><span>${dot(c.subject)} ${esc(c.title)}</span><span>${badgeAvg(x.avg)}</span></div>`; }).join('') || '<span class="mut">Aucun cours.</span>'}</div>
  <h2>Comparatif des cycles</h2><div class="card">${rs.length > 1 ? rs.map((r, i) => `<div class="row sp"><span>Cycle ${r.r + 1} <span class="mut">(${r.n} rés.)</span></span><span>${badgeAvg(r.avg)} ${i ? `<span class="${r.avg >= rs[i - 1].avg ? 'ok' : 'bad'}">${r.avg >= rs[i - 1].avg ? '▲ +' : '▼ '}${Math.round(r.avg - rs[i - 1].avg)} pts</span>` : ''}</span></div>`).join('') : '<span class="mut">Utilise « Nouveau cycle » sur un test pour comparer avant / après.</span>'}</div>
  <h2>🎯 Points à revoir</h2>${w.map(x => `<div class="card"><b>${esc(x.label)}</b><div class="mut">${x.why.map(esc).join(' · ')}</div></div>`).join('')}
  ${mm.length ? `<div class="card"><b>Questions les plus ratées</b>${mm.map(m => `<div class="mut">• ${esc(m.q)} <i>(${m.n}×, ${esc(m.t)})</i></div>`).join('')}</div>` : ''}
  ${!w.length && !mm.length ? '<div class="card empty">Rien à signaler pour le moment.</div>' : ''}
  ${focusStatsCard()}`;
}

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function dstr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function mondayOf(ds) { const d = new Date(ds + 'T12:00:00'); const o = (d.getDay() + 6) % 7; d.setDate(d.getDate() - o); return dstr(d); }
function evColor(e) {
  let sub = e.subject || '';
  if (!sub && e.itemId) {
    const it = e.kind === 'course' ? S.courses.find(x => x.id === e.itemId) : S.tests.find(x => x.id === e.itemId);
    if (it) sub = it.subject || (it.courseId ? ((S.courses.find(c => c.id === it.courseId) || {}).subject || '') : '');
  }
  return sub ? subjectColor(sub) : '';
}
function evLabel(e) {
  if (!e.autoKey) return e.title;
  const n = itemName(e.kind, e.itemId);
  return (e.kind === 'course' ? 'J' + e.day + ' · ' + (n || e.title) : 'QCM J' + e.day + ' · ' + (n || e.title));
}
function calSwitch() {
  const modes = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']];
  return `<div class="row sp" style="margin-bottom:10px"><div class="seg">${modes.map(([k, l]) => `<button class="${cal.mode === k ? 'on' : ''}" data-act="calMode" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="row"><button class="btn g s" data-act="mon" data-v="-1">←</button>
    <button class="btn g s" data-act="calToday">Aujourd’hui</button>
    <button class="btn g s" data-act="mon" data-v="1">→</button></div></div>`;
}
function addEventCard(dateStr, compact) {
  const sel = dateStr || cal.sel;
  return `<div class="card" style="margin-top:12px"><div class="mut">${sel ? 'Ajouter le ' + fmt(sel) : 'Clique sur un jour pour ajouter un événement'}</div>
  ${sel ? `<div class="row" style="margin-top:6px"><input id="e-title" class="flex1" placeholder="Ex. Partiel de droit">
    <select id="e-type"><option>Partiel</option><option>DS</option><option>Rendu</option><option>Révision</option><option>Devoir</option><option>Autre</option></select>
    <input id="e-subject" class="flex1" placeholder="Matière (couleur)" list="dl-evsub" style="max-width:170px"><datalist id="dl-evsub">${subjects().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${compact ? '' : `<input type="date" id="e-until" title="Jusqu’au (facultatif)"><span class="mut">jusqu’au</span>`}
    <button class="btn" data-act="addEvent">Ajouter</button></div>
    ${compact ? '' : `<div class="mut" style="margin-top:6px">Avec une date « jusqu’au », l’événement apparaît dans tes tâches du jour pendant toute la période.</div>`}` : ''}</div>`;
}
function evRow(e, showDate) {
  const auto = !!e.autoKey;
  const c = evColor(e);
  const done = auto && isDone(e.id, e.date);
  return `<div class="card evrow ${done ? 'done' : ''}" ${c ? `style="--c:${c}"` : ''}>
    <span class="row" style="gap:10px;align-items:center;min-width:0;flex:1">
      ${auto ? `<input type="checkbox" ${done ? 'checked' : ''} data-act="task" data-id="${e.id}" data-d="${e.date}" title="Marquer comme fait">` : `<span class="evdot" style="background:${c || 'var(--mut)'}"></span>`}
      <span style="min-width:0"><b>${esc(evLabel(e))}</b>
      <span class="evmeta"><span class="tag">${esc(e.type)}</span>${auto ? ' <span class="tag">auto</span>' : ''}${showDate ? `<span class="mut"> ${fmt(e.date)}</span>` : ''}${e.until ? `<span class="mut"> → ${fmt(e.until)}</span>` : ''}</span></span>
    </span>
    <span class="row">${e.itemId ? `<button class="btn q s" data-act="${e.kind === 'test' ? 'quiz' : 'openItem'}" ${e.kind === 'test' ? '' : 'data-kind="course"'} data-id="${e.itemId}">${e.kind === 'test' ? 'QCM' : 'Ouvrir'}</button>` : ''}
      <button class="x" data-act="editEvent" data-id="${e.id}">✎</button><button class="x" data-act="delEvent" data-id="${e.id}">✕</button></span></div>`;
}

function calendar() {
  const mode = cal.mode || 'month';
  const head = `<div class="row sp" style="margin-bottom:8px"><b>${calTitle(mode)}</b></div>`;
  if (mode === 'day') {
    const d = cal.sel || today();
    const evs = S.events.filter(e => e.date === d || (e.until && e.date <= d && e.until >= d)).sort((a, b) => a.date.localeCompare(b.date));
    return calSwitch() + head + `<div class="card"><div class="row sp"><button class="btn g s" data-act="calStep" data-v="-1">← Jour précédent</button><button class="btn g s" data-act="calStep" data-v="1">Jour suivant →</button></div>
      <div class="mut" style="margin-top:8px">${fmtShort(d)}${d === today() ? ' · aujourd’hui' : ''}</div></div>
      ${evs.length ? evs.map(e => evRow(e, false)).join('') : '<div class="card empty">Rien ce jour-là.</div>'}
      ${addEventCard(d, true)}`;
  }
  if (mode === 'week') {
    const mon = mondayOf(cal.sel || today());
    const days = [];
    for (let i = 0; i < 7; i++) { const dd = addDays(mon, i); days.push({d:dd, evs:S.events.filter(e => e.date === dd || (e.until && e.date <= dd && e.until >= dd)).sort((a, b) => a.date.localeCompare(b.date))}); }
    return calSwitch() + head + `<div class="week">${days.map(x => `<div class="wcol ${x.d === today() ? 'td' : ''} ${cal.sel === x.d ? 'sel' : ''}" data-act="day" data-v="${x.d}">
        <div class="whead"><b>${JOURS[(new Date(x.d + 'T12:00:00').getDay() + 6) % 7].slice(0, 3)}</b><span>${+x.d.slice(8, 10)}</span></div>
        ${x.evs.length ? x.evs.map(e => `<div class="wev" style="${evColor(e) ? '--c:' + evColor(e) : ''}">${esc(evLabel(e))}</div>`).join('') : '<div class="mut" style="font-size:11px;padding:4px 2px">–</div>'}
      </div>`).join('')}</div>
      <div class="mut" style="margin-top:8px">Clique sur un jour pour voir son détail et ajouter un événement.</div>
      ${addEventCard(cal.sel || mon, true)}`;
  }
  // mois (affichage de base)
  const {y, m} = cal, first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), cells = [];
  ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(d => cells.push(`<div class="h">${d}</div>`));
  for (let i = 0; i < off; i++) cells.push('<div class="off"></div>');
  for (let d = 1; d <= dim; d++) {
    const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const evs = S.events.filter(e => e.date === ds);
    cells.push(`<div data-act="day" data-v="${ds}" class="${cal.sel === ds ? 'sel' : ''} ${ds === today() ? 'td' : ''}"><span class="n">${d}</span>${evs.slice(0, 2).map(e => `<span class="ev" style="${evColor(e) ? '--c:' + evColor(e) : ''}">${esc(evLabel(e))}</span>`).join('')}${evs.length > 2 ? `<span class="ev more">+${evs.length - 2}</span>` : ''}</div>`);
  }
  const list = S.events.filter(e => e.date.startsWith(y + '-' + String(m + 1).padStart(2, '0'))).sort((a, b) => a.date < b.date ? -1 : 1);
  return calSwitch() + head + `<div class="cal">${cells.join('')}</div>
    ${addEventCard(null, false)}
    <h2>Ce mois-ci</h2>${list.map(e => evRow(e, true)).join('') || '<div class="card empty">Rien ce mois-ci.</div>'}`;
}
function calTitle(mode) {
  if (mode === 'day') return fmt(cal.sel || today());
  if (mode === 'week') {
    const mon = mondayOf(cal.sel || today()), sun = addDays(mon, 6);
    return 'Semaine du ' + fmt(mon) + ' au ' + fmt(sun);
  }
  return MOIS[cal.m] + ' ' + cal.y;
}

function exams() {
  const sems = semesters();
  if (!sems.includes(sSem)) sSem = sems[0] || '';
  const f = `<div class="card"><div class="row"><input id="x-sem" class="flex1" placeholder="Semestre" list="dl-sem" value="${esc(sSem)}"><input id="x-sub" class="flex1" placeholder="Matière" list="dl-sub"><input type="number" id="x-g" step="0.25" placeholder="Note"> / <input type="number" id="x-m" value="20"><input type="number" id="x-c" value="1" step="0.5" title="Coefficient"><span class="mut">coef</span><button class="btn" data-act="addExam">Ajouter</button></div></div>
  <datalist id="dl-sub">${subjects().map(s => `<option value="${esc(s)}">`).join('')}</datalist><datalist id="dl-sem">${sems.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`;
  const e20 = e => e.grade / e.max * 20;
  const wavg = l => { const c = l.reduce((s, e) => s + e.coef, 0); return c ? l.reduce((s, e) => s + e20(e) * e.coef, 0) / c : null; };
  const bySem = sems.map(s => ({s, l:S.exams.filter(e => e.semester === s)})), cmp = bySem.map(x => ({...x, a:wavg(x.l)}));
  const cur_ = S.exams.filter(e => e.semester === sSem).sort((a, b) => e20(b) - e20(a));
  const sb = subjects().filter(s => S.exams.some(e => e.subject === s)).map(s => {
    const l = S.exams.filter(e => e.subject === s), q = subjStats(s).avg;
    return {s, a:avg(l.map(e => e20(e) / 20 * 100)), q};
  });
  return f + (sems.length ? `<div class="row" style="margin-bottom:10px">${sems.map(s => `<button class="chip ${s === sSem ? 'on' : ''}" data-act="sSem" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '') +
  `<div class="card"><div class="row sp"><b>${esc(sSem) || '–'}</b><span class="pill">${wavg(cur_) == null ? '–' : wavg(cur_).toFixed(2) + ' / 20'} ${rk(wavg(cur_) == null ? null : wavg(cur_) * 5)}</span></div>
  ${cur_.map(e => `<div class="row sp" style="padding:3px 0"><span>${dot(e.subject)} ${esc(e.subject)} <span class="mut">coef ${e.coef}</span></span><span class="row"><span class="pill ${cls(e20(e) * 5)}">${e.grade}/${e.max}</span>${rk(e20(e) * 5)}<button class="x" data-act="delExam" data-id="${e.id}">✕</button></span></div>`).join('') || '<span class="mut">Aucune note ce semestre.</span>'}
  ${cur_.length ? `<div class="mut" style="margin-top:6px">Meilleure : ${esc(cur_[0].subject)} (${e20(cur_[0]).toFixed(1)}/20) · Plus faible : ${esc(cur_[cur_.length - 1].subject)} (${e20(cur_[cur_.length - 1]).toFixed(1)}/20)</div>` : ''}</div>
  ${cmp.filter(x => x.a != null).length > 1 ? `<h2>Comparaison des semestres</h2><div class="card">${cmp.filter(x => x.a != null).map((x, i, a) => `<div class="row sp"><span>${esc(x.s)}</span><span><b>${x.a.toFixed(2)}/20</b> ${i ? `<span class="${x.a >= a[i - 1].a ? 'ok' : 'bad'}">${x.a >= a[i - 1].a ? '▲ +' : '▼ '}${(x.a - a[i - 1].a).toFixed(2)}</span>` : ''}</span></div><div class="bar"><i style="width:${x.a * 5}%;background:var(--ac)"></i></div>`).join('')}</div>` : ''}
  ${sb.length ? `<h2>Partiels vs QCM</h2><div class="card scroll"><table class="plain"><tr><th>Matière</th><th>Partiels</th><th>QCM</th><th>Écart</th></tr>${sb.map(x => `<tr><td>${dot(x.s)} ${esc(x.s)}</td><td>${f1(x.a)}</td><td>${f1(x.q)}</td><td class="${x.q == null ? 'mut' : x.q >= x.a ? 'ok' : 'bad'}">${x.q == null ? '–' : (x.q - x.a >= 0 ? '+' : '') + Math.round(x.q - x.a) + ' pts'}</td></tr>`).join('')}</table><div class="mut">Un QCM nettement meilleur que le partiel suggère de t’entraîner en conditions d’examen.</div></div>` : ''}`;
}

// ---------- import Word : conversion en HTML fidèle ----------
function escapeHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function decodeEnt(s) {
  return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}
function alignOf(s) {
  const a = (s.match(/text-align\s*:\s*(left|right|center|justify)/i) || [])[1];
  if (a) return a.toLowerCase();
  const j = (s.match(/text-align\s*:\s*(both)/i) || [])[1];
  return j ? 'justify' : '';
}
// reconstruit proprement les tableaux : un seul <table>, lignes regroupées,
// première ligne en en-tête (<th>), tableaux vides et imbrications supprimés
function tidyTables(html) {
  let h = String(html || '');
  // 1) on aplatit les imbrications : <table><table>…</table><table>…</table></table>
  for (let guard = 0; guard < 12; guard++) {
    const before = h;
    h = h.replace(/<table([^>]*)>\s*(?=<table)/gi, '')
         .replace(/<\/table>\s*(?=<\/table>)/gi, '')
         .replace(/<\/table>\s*<table[^>]*>/gi, '');
    if (h === before) break;
  }
  // 2) un seul <table> par bloc : toutes les lignes sont regroupées
  h = h.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (m, inner) => {
    const rows = [];
    inner.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (mm, tr) => {
      const cells = [];
      tr.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi, (mc, tag, attrs, content) => {
        const w = (attrs.match(/width\s*:\s*([\d.]+)\s*px/i) || [])[1];
        cells.push({w: w ? Math.round(+w) : null, html: String(content).replace(/^<p[^>]*>([\s\S]*?)<\/p>$/i, '$1').trim()});
        return '';
      });
      if (cells.length) rows.push(cells);
      return '';
    });
    if (!rows.length) return '';
    const th = c => `<th${c.w ? ` style="width:${c.w}px"` : ''}>${c.html}</th>`;
    const td = c => `<td${c.w ? ` style="width:${c.w}px"` : ''}>${c.html}</td>`;
    const head = '<tr>' + rows[0].map(th).join('') + '</tr>';
    const body = rows.slice(1).map(r => '<tr>' + r.map(td).join('') + '</tr>').join('');
    return `<table><thead>${head}</thead>${body ? `<tbody>${body}</tbody>` : ''}</table>`;
  });
  return h;
}
function cell(s) {
  const w = (s.match(/width\s*:\s*([\d.]+)\s*px/i) || [])[1];
  // le texte de la cellule est mis à plat : un <p> y ajoute des marges et décale les lignes
  const flat = String(s || '')
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, t) => (/<(ul|ol|table|h[1-6])/i.test(t) ? m : t + '<br>'))
    .replace(/<br>\s*$/, '');
  return `<td${w ? ` style="width:${Math.round(+w)}px"` : ''}>${flat.trim()}</td>`;
}
// compression des images pour ne pas alourdir la sauvegarde (et ne pas dépasser le quota)
function compressImage(file, maxW = 1280, quality = 0.82) {
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
          const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || maxW) * scale));
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality));
        } catch (e) { resolve(fr.result); }
      };
      img.onerror = () => resolve(fr.result);
      img.src = fr.result;
    };
    fr.onerror = () => resolve('');
    fr.readAsDataURL(file);
  });
}
function shrinkDataUrl(src, maxW = 1280, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        if ((img.naturalWidth || 0) <= maxW) return resolve(src);
        const scale = maxW / img.naturalWidth;
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', quality));
      } catch (e) { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
const IMG_OK = /^data:image\/(png|jpe?g|gif|webp|bmp|svg)/i;

async function docxToHtml(arrayBuffer) {
  const res = await mammoth.convertToHtml({arrayBuffer}, {
    styleMap: [
      "p[style-name='Title'] => h1:fresh", "p[style-name='Titre'] => h1:fresh",
      "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Titre 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh", "p[style-name='Titre 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh", "p[style-name='Titre 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh", "p[style-name='Titre 4'] => h4:fresh",
      "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Citation'] => blockquote:fresh",
      "p[style-name='List Paragraph'] => p:fresh"
    ],
    convertImage: mammoth.images.imgElement(async img => {
      const b64 = await img.read('base64');
      let src = 'data:' + img.contentType + ';base64,' + b64;
      if (IMG_OK.test(src)) src = await shrinkDataUrl(src);
      return {src};
    })
  });
  let html = res.value || '';
  html = html.replace(/<p>(\s|&nbsp;)*<\/p>/g, '');
  // une image seule dans un paragraphe devient une <figure> (affichage propre, marges maîtrisées)
  html = html.replace(/<p>\s*(<img[^>]*>)\s*<\/p>/gi, '<figure class="img">$1</figure>');
  // styles de paragraphe
  html = html.replace(/<(p|h[1-6]|li)([^>]*?)style="([^"]*)"([^>]*)>/gi, (m, tag, a1, st, a2) => {
    const al = alignOf(st), attrs = a1 + a2;
    const indent = (st.match(/margin-left\s*:\s*([\d.]+)px/i) || [])[1];
    let style = al ? ` class="${al === 'left' ? 'l' : al[0]}"` : '';
    if (indent && +indent > 20) style += ` style="margin-left:${Math.min(+indent, 120)}px"`;
    return `<${tag}${attrs}${style}>`;
  });
  // tableaux : on reconstruit un seul <table> à partir de toutes les lignes trouvées
  // (mammoth émet un <table> par ligne, parfois imbriqué : HTML invalide une fois collé)
  html = html.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (m, attrs, content) => cell(content));
  html = tidyTables(html);
  // gras / italique / couleur laissés tels quels ; suppression des attributs mammoth inutiles
  html = html.replace(/\s*style="text-align:\s*(left|right|center|justify);?"/gi, '');
  return reorderHtml(html.trim());
}
async function htmlToClean(file) {
  const txt = await file.text();
  if (!/<\/?[a-z][\s\S]*>/i.test(txt)) return null;
  const doc = new DOMParser().parseFromString(txt, 'text/html');
  const scope = doc.querySelector('#C1') || doc.body;
  scope.querySelectorAll('script,style,meta,link,title,.word-section-title,[style*="mso-"]').forEach(n => {
    if (n.tagName === 'META' || n.tagName === 'LINK' || n.tagName === 'TITLE' || n.tagName === 'STYLE' || n.tagName === 'SCRIPT') n.remove();
  });
  scope.querySelectorAll('[style]').forEach(n => {
    const keep = [];
    const st = n.getAttribute('style');
    const al = alignOf(st);
    if (al) keep.push('text-align:' + al);
    const w = (st.match(/font-weight\s*:\s*(bold|[6-9]00)/i));
    if (w && !/^(B|STRONG|H[1-6])$/.test(n.tagName)) keep.push('font-weight:600');
    if (keep.length) n.setAttribute('style', keep.join(';')); else n.removeAttribute('style');
  });
  scope.querySelectorAll('span,p,div,li,td,th,h1,h2,h3,h4').forEach(n => {
    if (n.tagName === 'SPAN' && !n.getAttribute('style') && !n.children.length) { n.replaceWith(...n.childNodes); }
  });
  scope.querySelectorAll('img').forEach(n => n.remove());
  let html = scope.innerHTML;
  html = html.replace(/<(\w+)[^>]*class="?Mso[^"]*"?[^>]*>/gi, '<$1>');
  return html.trim();
}
// remet dans le bon ordre texte / images d'un HTML importé (certains convertisseurs
// regroupent toutes les images en fin de document)
function reorderHtml(html) {
  const box = document.createElement('div');
  box.innerHTML = html;
  const blocks = [...box.children];
  if (blocks.length < 2) return html;
  const items = [];
  for (const el of blocks) {
    const imgs = [...el.querySelectorAll('img')];
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (imgs.length && !txt) items.push({type:'img', el, imgs});
    else items.push({type:txt || imgs.length ? 'text' : 'empty', el});
  }
  const imgIdx = items.map((x, i) => x.type === 'img' ? i : -1).filter(i => i >= 0);
  // images nues hors figure (ex. <p><img></p> seul) déjà comptées comme 'img'
  const txtIdx = items.map((x, i) => x.type !== 'img' ? i : -1).filter(i => i >= 0);
  if (!imgIdx.length || !txtIdx.length) return html;
  const lastText = Math.max(...txtIdx);
  if (!imgIdx.every(i => i > lastText)) return html;   // ordre déjà correct
  // toutes les images sont à la fin : on les répartit entre les blocs de texte
  const imgEls = items.filter(x => x.type === 'img').map(x => x.el);
  const rest = items.filter(x => x.type !== 'img').map(x => x.el);
  const out = document.createElement('div');
  const n = rest.length, k = imgEls.length;
  rest.forEach((el, i) => {
    out.appendChild(el);
    const share = Math.floor((i + 1) * k / n) - Math.floor(i * k / n);
    for (let j = 0; j < share; j++) {
      const src = imgEls.shift();
      if (!src) break;
      let fig;
      if (src.tagName === 'FIGURE' && src.classList.contains('img')) fig = src;
      else if (src.tagName === 'FIGURE') { src.classList.add('img'); fig = src; }
      else {
        const im = src.querySelector('img') || src;
        fig = document.createElement('figure');
        fig.className = 'img';
        fig.appendChild(im.cloneNode(true));
      }
      out.appendChild(fig);
    }
  });
  imgEls.forEach(src => {
    let fig;
    if (src.tagName === 'FIGURE') { src.classList.add('img'); fig = src; }
    else { fig = document.createElement('figure'); fig.className = 'img'; fig.appendChild((src.querySelector('img') || src).cloneNode(true)); }
    out.appendChild(fig);
  });
  return out.innerHTML;
}
async function readDoc(file, qcm) {
  if (/\.docx$/i.test(file.name)) {
    if (typeof mammoth === 'undefined') throw new Error('Le lecteur Word n’a pas pu être chargé (connexion internet ?).');
    return await docxToHtml(await file.arrayBuffer());
  }
  if (/\.pdf$/i.test(file.name)) return await pdfToHtml(file, qcm);
  if (/\.(html?|doc)$/i.test(file.name)) { const h = await htmlToClean(file); if (h) return h; }
  return '<div class="q">' + escapeHtml(await file.text()) + '</div>';
}
// ---------- lecture d'un PDF (texte + images, dans l'ordre des pages) ----------
let pdfjsPromise = null;
function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    // 1) lecteur embarqué (fichier unique ou fichiers à côté) : marche hors ligne
    if (window.pdfjsLib && window.pdfjsLib.getDocument) {
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; } catch (e) {}
      return window.pdfjsLib;
    }
    // 2) sinon, chargement depuis un CDN (dépannage)
    const bases = [
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/',
      'https://unpkg.com/pdfjs-dist@3.11.174/build/'
    ];
    let err = null;
    for (const b of bases) {
      try {
        const lib = await import(b + 'pdf.min.js');
        const pdfjs = lib.default || lib;
        try { pdfjs.GlobalWorkerOptions.workerSrc = b + 'pdf.worker.min.js'; } catch (e) {}
        return pdfjs;
      } catch (e) { err = e; }
    }
    throw new Error('lecteur PDF indisponible (fichier pdf.min.js manquant ?)');
  })();
  return pdfjsPromise;
}
function pdfLinesToHtml(items) {
  return items.map(it => it.type === 'text' ? `<p>${esc(it.s)}</p>` : '').join('');
}
async function pdfToHtml(file, qcm) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({data, isEvalSupported:false}).promise;
  // QCM : on ne garde que le texte (la détection lit les lignes)
  if (qcm) {
    let txt = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      txt += linesOf(content.items).map(l => l.s).join('\n') + '\n';
    }
    return txt;
  }
  // cours : chaque page est rendue comme dans un lecteur PDF (fidélité totale)
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    // largeur cible : 1600 px max (net sur iPad, sans exploser la sauvegarde)
    const base = page.getViewport({scale:1});
    const scale = Math.min(2.2, Math.max(1.2, 1600 / base.width));
    const vp = page.getViewport({scale});
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx2d = cv.getContext('2d');
    ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0, 0, cv.width, cv.height);
    await page.render({canvasContext:ctx2d, viewport:vp}).promise;
    // JPEG pour les pages sans transparence : beaucoup plus léger que le PNG
    pages.push(cv.toDataURL('image/jpeg', 0.82));
  }
  const html = pages.map((src, i) => `<figure class="pdfpage"><img src="${src}" alt="Page ${i + 1}"><figcaption>Page ${i + 1} / ${pages.length}</figcaption></figure>`).join('');
  return html;
}
// regroupe les fragments de texte d'une page en lignes lisibles
function linesOf(items) {
  const lines = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    const x = it.transform[4];
    let line = lines.find(l => Math.abs(l.y - y) <= 3);
    if (!line) { line = {y, parts:[]}; lines.push(line); }
    line.parts.push({x, s:it.str, w:it.width || 0});
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(l => {
    l.parts.sort((a, b) => a.x - b.x);
    let txt = '', prevEnd = null;
    for (const pt of l.parts) {
      if (prevEnd != null && pt.x - prevEnd > 12) txt += ' ';
      txt += pt.s;
      prevEnd = pt.x + pt.w;
    }
    return {y:l.y, s:txt.replace(/\s+/g, ' ').trim()};
  }).filter(l => l.s);
}

// ---------- import QCM : détection automatique ----------
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
function cleanTxt(s) {
  return decodeEnt(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2460-\u2473]/g, ch => { const n = ch.charCodeAt(0) - 0x2460; return LETTERS[n % 26].toUpperCase() + ')'; })
    .replace(/[\u24B6-\u24E9]/g, ch => { const n = ch.charCodeAt(0) - 0x24B6; return LETTERS[n % 26].toUpperCase() + ')'; })
    .replace(/([^\s])\s*[✓✔✅☑★]/g, '$1 *')
    .replace(/^\s*[✓✔✅☑★]\s*/gm, '* ')
    .replace(/[■●◉◼]/g, '* ')
    .replace(/[✗✘❌]/g, '')
    .replace(/(?<![A-Za-zÀ-ÿ])[☐◻□○◯✕](?![A-Za-zÀ-ÿ])/g, ' ');
}
const QRE = /^(?:question\s*(?:n[°o]?\s*)?\d{0,3}\s*[).:\-–]\s*|q\s*\d{0,3}\s*[).:\-–]\s*|\d{1,3}\s*[).:\-–]\s*)(.+)$/i;
const ORE = /^(?:[\(\[]?([A-Ha-h])[\)\].:\-–]|[\(\[]?([A-Ha-h])[\)\]])\s*(.+)$/;
const STAR_RE = /^(?:[*✓✔✅☑●■►>»★☆→]|\[[xX]\]|\(x\)|-{0,2}>)\s*/;
// marqueurs de bonne réponse en fin de ligne : "Paris ✓", "Rome (vrai)", "3 ✔ *"
const END_STAR_RE = /[\s.,;:]*(?:\(\s*(?:vrai|true|juste|correcte?|oui|bonne r[ée]ponse)\s*\)|\[\s*[xXvV]\s*\]|✓|✔|✅|☑|★|[*•●])\s*$/i;
// marqueur de bonne réponse n'importe où : "(Réponse correcte — …)", "(bonne réponse)", "[x]", "✔"
const INLINE_MARK_RE = /\s*[\(\[]\s*(?:r[ée]ponse\s+correcte|bonne\s+r[ée]ponse|r[ée]ponse\s+juste|correcte?|correct|vrai|true|juste|oui)\b[^\)\]]*[\)\]]/i;
// indices explicites de réponse, même quand c'est mal écrit
const ANS_RE = /^(?:la\s+)?(?:bonne\s+)?(?:r[ée]ponses?|r[ée]p\.?|answer|correct(?:e)?\s+(?:answer|choice|choix|option)|solution|choix\s+correct)\s*(?:correcte|attendue|juste)?\s*(?:est)?\s*(?:la\s+)?[:=]?\s*(.+)$/i;
const EXPL_RE = /^(?:expl(?:ication)?|justification|corrig[ée]|pourquoi|commentaire)\s*[:=]\s*(.+)$/i;
// en-tête d'une section "corrigé" (liste de réponses type "1. B")
const KEY_HEAD_RE = /^(?:corrig[ée]s?|r[ée]ponses?|solutions?|answer\s*key|bar[èe]me|key|r[ée]ponses?\s+correctes?)[^a-zà-ÿ]*$/i;
// ligne de corrigé : "1. B", "Q3 : b", "12 - c"
const KEY_LINE_RE = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[).:\-–]?\s*[=:]?\s*\(?([A-Ha-h])\)?[).:]?$/;
// case à cocher vide / cochée en préfixe
const BOX_RE = /^\[\s*([xX]?)\s*\]\s*/;

function parseQCM(text) {
  const lines = cleanTxt(text).split(/\r?\n/).map(l => l.replace(/\s+$/, '').trim())
    .filter(l => l && !/^[-_=*•]{3,}$/.test(l));
  const qs = []; let c = null, usedO = 0;
  const key = [];          // corrigé séparé : {n, letter}
  let curExpl = '';        // explication lue dans la parenthèse du choix correct
  let inKey = false;       // on est dans une section "Corrigé"
  const push = () => { if (c && c.choices.length >= 2) qs.push(c); c = null; };
  const setAns = (val) => {
    if (!c) return false;
    const v = String(val || '').trim().replace(/^[\(\[\s]+|[\)\]\s.]+$/g, '');
    if (!v) return false;
    let idx = -1;
    if (/^[A-Ha-h]$/.test(v)) idx = LETTERS.indexOf(v.toLowerCase());
    else idx = c.choices.findIndex(ch => normCho(ch) === normCho(v));
    if (idx < 0) {
      const m = v.match(/^([A-Ha-h])\b/);
      if (m) idx = LETTERS.indexOf(m[1].toLowerCase());
    }
    if (idx < 0) {
      // "b) Rome" ou "réponse b - Rome"
      const m = v.match(/^[\(\[]?([A-Ha-h])[\)\].:\-–]\s*(.+)$/);
      if (m) idx = c.choices.findIndex(ch => normCho(ch) === normCho(m[2]));
    }
    if (idx >= 0 && idx < c.choices.length) { c.answer = idx; return true; }
    return false;
  };
  const isKeyLine = l => {
    const t = l.replace(/^[-–•]\s*/, '');
    return KEY_LINE_RE.test(t) || /^\d{1,3}\s*[).:\-–]\s*[A-Ha-h](?:\s*[,;/]\s*[A-Ha-h])*$/.test(t);
  };
  for (const raw of lines) {
    // ---- sections de corrigé ----
    const trimmed = raw.trim();
    const headInline = trimmed.match(/^(?:corrig[ée]s?|r[ée]ponses?|solutions?|bar[èe]me)\s*[:=]?\s*(.+)$/i);
    if (KEY_HEAD_RE.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
      push(); inKey = true; continue;
    }
    if (headInline && /\d\s*[).:\-–]?\s*[A-Ha-h]\b/.test(headInline[1]) && /^[\s\d).:\-–A-Ha-h,;/]+$/.test(headInline[1].trim())) {
      const pairs = [...headInline[1].matchAll(/(\d{1,3})\s*[).:\-–]?\s*\(?([A-Ha-h])\b/g)];
      if (pairs.length) { push(); pairs.forEach(m2 => key.push({n:+m2[1], letter:m2[2].toLowerCase()})); continue; }
    }
    if (headInline && /^[\(\[]?[A-Ha-h][\)\]]?\.?$/.test(headInline[1].trim())) {
      const li = LETTERS.indexOf(headInline[1].replace(/[^A-Ha-h]/g, '').toLowerCase());
      push();
      if (qs.length && li >= 0) qs[qs.length - 1].answer = li;
      continue;
    }
    if (inKey) {
      const t = raw.replace(/^[-–•]\s*/, '');
      let km = t.match(KEY_LINE_RE);
      if (!km) km = (m => m && {1:m[1], 2:m[2]})(t.match(/^\(?(\d{1,3})\)?\s*[).:\-–=]?\s*\(?([A-Ha-h])\)?$/));
      if (km) { key.push({n:+km[1], letter:km[2].toLowerCase()}); continue; }
      if (/^(?:corrig[ée]s?|r[ée]ponses?|solutions?|bar[èe]me)\b/i.test(t)) continue;
      const multi = [...t.matchAll(/(\d{1,3})\s*[).:\-–]\s*([A-Ha-h])\b/g)];
      if (multi.length > 1) { multi.forEach(m2 => key.push({n:+m2[1], letter:m2[2].toLowerCase()})); continue; }
      if (isKeyLine(t)) continue;
      // une nouvelle question apparaît : on sort du corrigé
      if (/^(?:question|q)\s*\d/i.test(t) || /^\d{1,3}\s*[).:\-–]\s+\S/.test(t)) inKey = false;
      else continue;
    }

    let line = raw;
    // case à cocher en tête : [x] / [ ] / (x)
    let boxed = null;
    let bm = line.match(BOX_RE);
    if (bm) { boxed = bm[1].toLowerCase() === 'x'; line = line.slice(bm[0].length).trim(); }
    if ((m => m)(line.match(/^\(x\)\s*/i))) { boxed = true; line = line.replace(/^\(x\)\s*/i, ''); }

    // marqueur de bonne réponse n'importe où dans le choix : "Mercure (Réponse correcte — …)"
    let endStar = false;
    const inlineM = line.match(INLINE_MARK_RE);
    if (inlineM) {
      endStar = true;
      // on garde l'explication éventuelle : "(Réponse correcte — texte)" → texte
      const inner = inlineM[0].replace(/^[\s\(\[]+|[\s\)\]]+$/g, '');
      const ex = inner.replace(/^(?:r[ée]ponse\s+correcte|bonne\s+r[ée]ponse|r[ée]ponse\s+juste|correcte?|correct|vrai|true|juste|oui)\b\s*[:\-–—]?\s*/i, '').trim();
      if (ex && !curExpl) curExpl = ex;
      line = line.replace(INLINE_MARK_RE, '').trim();
    }
    // marqueur de bonne réponse en fin de ligne : "Paris ✓", "Paris *", "Rome (vrai)"
    if (!endStar) endStar = END_STAR_RE.test(line);
    if (endStar) line = line.replace(END_STAR_RE, '').trim();
    // variante produit par cleanTxt : "Paris *"
    if (/\s\*\s*$/.test(line)) { endStar = true; line = line.replace(/\s\*\s*$/, '').trim(); }
    // marqueur en tête : "* Paris", "✓ Paris", "X Paris" (croix seule), "> Paris"
    let headStar = false;
    if (/^[xX](?=[\s).:\-–]|$)/.test(line) && !/^[xX][).]/.test(line)) { headStar = true; line = line.slice(1).trim(); }
    else if (STAR_RE.test(line)) { headStar = true; line = line.replace(STAR_RE, '').trim(); }
    if (headStar) line = line.replace(STAR_RE, '').trim();
    // croix « X » seule en tête de choix = mauvaise réponse
    const star = endStar || headStar || boxed === true;

    let m;
    // ---- réponse explicite ----
    if (c && (m = line.match(ANS_RE)) && !ORE.test(line)) {
      if (setAns(m[1])) continue;
    }
    if (c && (m = line.match(EXPL_RE))) { c.expl = m[1].trim(); continue; }

    // ---- ligne "question N" ----
    if (/^(?:question|q)\s*\d/i.test(line)) {
      push(); c = {q:line.replace(/^(?:question|q)\s*\d*\s*[).:\-–]?\s*/i, ''), choices:[], answer:-1, expl:''};
      continue;
    }
    // ---- choix lettré A) … ----
    const body = line;
    if ((m = body.match(ORE)) && (m[2] || m[1]) && m[3] && m[3].trim()) {
      if (!c) c = {q:'', choices:[], answer:-1, expl:''};
      c.choices.push(m[3].trim());
      if (star) { c.answer = c.choices.length - 1; if (curExpl) { c.expl = curExpl; curExpl = ''; } }
      usedO++;
      continue;
    }
    // ---- nouveau titre de question ----
    // une ligne se terminant par "?" ouvre une nouvelle question, même sans numéro
    if (c && c.choices.length >= 1 && /\?\s*$/.test(line) && line.length > 8) {
      push(); c = {q:line, choices:[], answer:-1, expl:''}; continue;
    }
    if ((m = line.match(QRE)) && m[1]) {
      const txt = m[1].trim();
      if (!(c && c.choices.length >= 2 && txt.length > 140)) {
        push(); c = {q:txt, choices:[], answer:-1, expl:''}; continue;
      }
    }
    // ---- suites ----
    if (c && c.choices.length === 0 && !star && !isChoiceLike(line)) { c.q += (c.q ? ' ' : '') + line; continue; }
    if (c && (star || isChoiceLike(line))) { c.choices.push(line.replace(/^[-–•]\s*/, '')); if (star) { c.answer = c.choices.length - 1; if (curExpl) { c.expl = curExpl; curExpl = ''; } } continue; }
    if (c && c.choices.length >= 2 && c.q === '') { c.q = line; continue; }
    if (c && c.choices.length >= 2) {
      // une ligne qui ressemble à une réponse seule ("b", "B.") sur sa propre ligne
      if (setAns(line)) continue;
      c.choices[c.choices.length - 1] += ' ' + line;
      continue;
    }
    if (!c) { c = {q:line, choices:[], answer:-1, expl:''}; continue; }
    c.q += ' ' + line;
  }
  push();

  // ---- réponses séparées (choix sans lettre) ----
  const extra = lines.map(l => { const m = l.replace(/^[-–•]\s*/, '').match(/^(\d{1,3})\s*[).:\-–]?\s*[=:]?\s*\(?([A-Ha-h])\)?$/); return m ? {n:+m[1], letter:m[2].toLowerCase()} : null; }).filter(Boolean);
  key.push(...extra);

  // ---- appliquer le corrigé séparé ----
  if (key.length) {
    const numbered = qs.map((q, i) => {
      const m = (q.q || '').match(/^(?:question\s*)?(\d{1,3})\s*[).:\-–]/i);
      return m ? +m[1] : null;
    });
    for (const k of key) {
      let idx = numbered.indexOf(k.n);
      if (idx < 0 && numbered.every(x => x === null) && k.n >= 1 && k.n <= qs.length) idx = k.n - 1;
      if (idx >= 0 && qs[idx] && qs[idx].answer < 0) {
        const li = LETTERS.indexOf(k.letter);
        if (li >= 0 && li < qs[idx].choices.length) qs[idx].answer = li;
      }
    }
  }

  // ---- 2e passe : choix sans lettre (liste à puces) ----
  if (qs.length === 0) {
    const alt = parseBullets(lines);
    if (alt.length && (alt.length > qs.length || alt.some(q => q.answer >= 0) || !qs.length)) return alt;
  }
  return qs;
}
// une ligne courte et sans ponctuation de fin ressemble à une proposition (liste à puces)
function isChoiceLike(l) {
  const t = String(l || '').trim();
  if (!t || t.length > 120) return false;
  if (/[?!:]$/.test(t)) return false;
  if (/\.$/.test(t) && t.split(/\s+/).length > 6) return false;
  return true;
}
// applique un corrigé saisi à la main : "1b 2a", "b, a, c", "1-B;2-C"
function applyKey(qs, txt) {
  const s = String(txt || '').trim();
  if (!s) return 0;
  const pairs = [...s.matchAll(/(\d{1,3})\s*[).:\-–=]?\s*\(?([A-Ha-h])\b/g)].map(m => ({n:+m[1], letter:m[2].toLowerCase()}));
  let applied = 0;
  if (pairs.length >= Math.max(1, Math.round(qs.length / 2))) {
    for (const p of pairs) {
      const i = p.n - 1, li = LETTERS.indexOf(p.letter);
      if (qs[i] && qs[i].answer < 0 && li >= 0 && li < qs[i].choices.length) { qs[i].answer = li; applied++; }
    }
    return applied;
  }
  const letters = s.replace(/[^A-Ha-h]/g, '').toLowerCase().split('');
  qs.forEach((q, i) => {
    const li = LETTERS.indexOf(letters[i]);
    if (q.answer < 0 && li >= 0 && li < q.choices.length) { q.answer = li; applied++; }
  });
  return applied;
}
function normCho(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseBullets(lines) {
  const qs = []; let c = null;
  const push = () => { if (c && c.choices.length >= 2) qs.push(c); c = null; };
  for (const raw of lines) {
    const starred = STAR_RE.test(raw);
    const line = raw.replace(STAR_RE, '');
    let m;
    if (c && (m = line.match(ANS_RE))) {
      const v = m[1].trim(); const idx = /^[A-Ha-h]$/.test(v) ? LETTERS.indexOf(v.toLowerCase()) : c.choices.findIndex(x => x.toLowerCase() === v.toLowerCase());
      if (idx >= 0 && idx < c.choices.length) c.answer = idx; continue;
    }
    if (c && (m = line.match(EXPL_RE))) { c.expl = m[1].trim(); continue; }
    if (!c || (line.endsWith('?') && !starred)) {
      push(); c = {q:line, choices:[], answer:-1, expl:''}; continue;
    }
    if (line.endsWith(':')) { push(); c = {q:line, choices:[], answer:-1, expl:''}; continue; }
    if (c.choices.length >= 2 && (line.endsWith('?') || /^(?:question|q)\b/i.test(line))) { push(); c = {q:line, choices:[], answer:-1, expl:''}; continue; }
    c.choices.push(line); if (starred) c.answer = c.choices.length - 1;
  }
  push();
  return qs;
}

// ---------- modale de confirmation ----------
function confirmDialog(opts) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(opts.title)}</h3><p>${esc(opts.text || '')}</p>
      <div class="acts"><button class="btn q" data-r="0">${esc(opts.cancel || 'Annuler')}</button>
      <button class="btn ${opts.danger === false ? '' : 'd'}" data-r="1" style="${opts.danger === false ? '' : 'background:var(--bad);border-color:var(--bad);color:#fff'}">${esc(opts.ok || 'Supprimer')}</button></div></div>`;
    const done = v => { back.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    back.addEventListener('click', e => {
      if (e.target === back) return done(false);
      const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1');
    });
    document.addEventListener('keydown', key);
    // listes liées : la 2e liste de champs dépend de la valeur du 1er
    if (opts.fields && opts.fields[0] && opts.fields[0].type === 'select') {
      const s0 = back.querySelector('#pf-0'), s1 = back.querySelector('#pf-1');
      if (s0 && s1 && s1.tagName === 'SELECT') s0.addEventListener('change', () => {
        const sub = s0.value;
        const opts2 = [['', '— Toute la matière —'], ...S.courses.filter(c => !sub || c.subject === sub).map(c => [c.id, c.subject + ' – ' + c.title])];
        s1.innerHTML = opts2.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');
      });
    }
    document.body.appendChild(back);
    back.querySelector('[data-r="1"]').focus();
  });
}
function promptDialog(opts) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(opts.title)}</h3><p>${esc(opts.text || '')}</p>
      <div class="row" style="margin-top:12px">${(opts.fields || []).map((f, i) => f.type === 'color'
        ? `<label class="row" style="gap:6px;align-items:center"><input type="color" id="pf-${i}" value="${esc(f.value || '#2f5fd0')}" style="width:46px;height:34px;padding:2px;cursor:pointer"><span class="mut">${esc(f.label)}</span></label>`
        : f.type === 'select'
        ? `<select id="pf-${i}" class="flex1"${f.act ? ' data-act="' + esc(f.act) + '"' : ''}>${(f.options || []).map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(f.value || '') ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
        : f.type === 'text'
        ? `<textarea id="pf-${i}" class="flex1" rows="${f.rows || 10}" placeholder="${esc(f.label)}">${esc(f.value || '')}</textarea>`
        : `<input id="pf-${i}" class="flex1" value="${esc(f.value || '')}" placeholder="${esc(f.label)}" ${f.type === 'date' ? 'type="date"' : ''}>`).join('')}</div>
      <div class="acts"><button class="btn q" data-r="0">${esc(opts.cancel || 'Annuler')}</button><button class="btn" data-r="1">${esc(opts.ok || 'Valider')}</button></div></div>`;
    const done = v => { back.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(null); };
    back.addEventListener('click', e => {
      if (e.target === back) return done(null);
      const b = e.target.closest('[data-r]'); if (!b) return;
      if (b.dataset.r === '0') return done(null);
      done((opts.fields || []).map((f, i) => $('#pf-' + i).value));
    });
    document.addEventListener('keydown', key);
    // listes liées : la 2e liste de champs dépend de la valeur du 1er
    if (opts.fields && opts.fields[0] && opts.fields[0].type === 'select') {
      const s0 = back.querySelector('#pf-0'), s1 = back.querySelector('#pf-1');
      if (s0 && s1 && s1.tagName === 'SELECT') s0.addEventListener('change', () => {
        const sub = s0.value;
        const opts2 = [['', '— Toute la matière —'], ...S.courses.filter(c => !sub || c.subject === sub).map(c => [c.id, c.subject + ' – ' + c.title])];
        s1.innerHTML = opts2.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');
      });
    }
    document.body.appendChild(back);
    const first = back.querySelector('input'); if (first) first.focus();
  });
}

// ---------- actions ----------
document.addEventListener('click', async e => {
  // clic en dehors des panneaux : on les referme
  if (openThemes && !e.target.closest('#theme-wrap')) { openThemes = false; paintThemes(); }
  if (openProf && !e.target.closest('#prof-wrap') && !e.target.closest('#prof-pop')) { openProf = false; paintProf(); }
  // pause bloquante : on ne laisse passer que les actions du Pomodoro
  if (pomo.phase === 'break') {
    const sb = e.target.closest('[data-act="pomoStop"], [data-act="pomoResume"], [data-act="pomoSkip"], [data-act="pomoOpen"]');
    if (!sb) { e.preventDefault(); e.stopPropagation(); return; }
  }
  const b = e.target.closest('[data-act]');
  if (typeof testMenu !== 'undefined' && testMenu && !e.target.closest('.tmenu') && !(b && ['addMenu', 'moreMenu'].includes(b.dataset.act))) {
    testMenu = null; render();
  }
  if (!b || ['SELECT', 'INPUT', 'TEXTAREA'].includes(b.tagName)) return;
  if (typeof handleAct === 'function') await handleAct(b, e);
});

document.addEventListener('input', e => {
  const t = e.target, a = t.dataset.act;
  if (a === 'mName') { mName = t.value; const p = $('#m-prev'); if (p) p.textContent = t.value || 'Aperçu'; }
  else if (a === 'customColor') { newColor = t.value; const p = $('#m-prev'); if (p) p.style.background = t.value; }
  else if (a === 'customCourseColor') courseColor = t.value;
});

document.addEventListener('input', e => {
  const id = e.target.id;
  if (form === 'course') {
    if (id === 'c-sub') draft.cSub = e.target.value;
    else if (id === 'c-sem') draft.cSem = e.target.value;
    else if (id === 'c-title') draft.cTitle = e.target.value;
    else if (id === 'c-notes') draft.cNotes = e.target.value;
  }
});

document.addEventListener('change', async e => {
  const t = e.target, a = t.dataset.act;
  if (!a) return;
  if (a === 'profPhoto') {
    const f = (t.files || [])[0]; t.value = '';
    if (!f) return;
    toast('Préparation de la photo…');
    const src = await compressImage(f, 320, 0.85);
    if (!src) { toast('Photo illisible.'); return; }
    S.set.profile = Object.assign({}, S.set.profile || {}, {photo:src});
    paintProf(); save(); toast('Photo enregistrée.');
    return;
  }
  if (a === 'backupFile') {
    const f = (t.files || [])[0]; t.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { toast('Ce fichier n’est pas une sauvegarde StudyTracker.'); return; }
    if (!data || !Array.isArray(data.courses)) { toast('Ce fichier n’est pas une sauvegarde StudyTracker.'); return; }
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir charger cette sauvegarde ?', text:`Les données actuelles seront remplacées par ${data.courses.length} cours et ${(data.tests||[]).length} QCM.`})) return;
    S = Object.assign({courses:[], tests:[], attempts:[], events:[], exams:[], set:{}}, data);
    delete S._app; delete S._savedAt;
    S.set = Object.assign({theme:'auto', rank:true, colors:{}, done:{}, focus:{}, help:'', recPreset:null, autoEvents:true}, S.set);
    const sel = $('#theme'); if (sel) sel.innerHTML = THEMES.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('');
    openProf = false; applyTheme(); save(); render(); paintProf(); toast('Sauvegarde chargée.');
    return;
  }
  if (a === 'enImage') {
    const files = [...(t.files || [])]; t.value = '';
    if (!files.length) return;
    const ta = $('#en-text'); if (!ta) return;
    toast('Préparation des images…');
    for (const f of files) {
      const src = await compressImage(f);
      if (!src) continue;
      ta.value = ta.value + '\n<figure class="img"><img src="' + src + '" alt=""></figure>\n';
    }
    toast(files.length + ' image(s) insérée(s) à la fin du texte.');
    return;
  }
  if (a === 'task') { toggleTask(t.dataset.id, t.dataset.d); return; }
  if (a === 'subInput') { draft.cSub = t.value; if (!courseColor) { const inp = $('#c-color'); if (inp) inp.value = colorOf(t.value.trim()); } return; }
  if (a === 'fsem') { filt.sem = t.value; render(); }
  else if (a === 'fsub') { filt.sub = t.value; render(); }
  else if (a === 'scope') { const c = t.value === 'course'; $('#t-course').style.display = c ? '' : 'none'; $('#t-subject').style.display = c ? 'none' : ''; }
  else if (a === 'theme') { S.set.theme = t.value; applyTheme(); save(); }
  else if (a === 'rank') { S.set.rank = t.checked; save(); render(); }
  else if (a === 'enImage') { /* géré par le change */ }

  else if (a === 'delImages') {
    const c = S.courses.find(x => x.id === id);
    if (!c) return;
    const n = (String(c.notes || '').match(/<img/gi) || []).length;
    if (!n) { toast('Aucune image dans ce cours.'); return; }
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer les images ?', text:'Les ' + n + ' image(s) de ce cours seront supprimées. Le texte et sa mise en forme sont conservés.'})) return;
    c.notes = String(c.notes || '')
      .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<p[^>]*>\s*(<br\s*\/?>|&nbsp;|\s)*<\/p>/gi, '');
    save(); render(); toast(n + ' image(s) supprimée(s).');
  }
  else if (['impImages'].includes(a)) {
    const files = [...(t.files || [])]; if (!files.length) return;
    const c = S.courses.find(x => x.id === (t.dataset.id || cid));
    if (!c) return;
    toast('Ajout de ' + files.length + ' image(s)…');
    const srcs = [];
    for (const f of files) { const src = await compressImage(f); if (src) srcs.push(src); }
    const heavy = srcs.filter(x => x.length > 900000).length;
    if (!srcs.length) { toast('Images illisibles.'); t.value = ''; return; }
    const html = srcs.map(src => `<figure class="img"><img src="${src}" alt=""></figure>`).join('');
    if (!c.notes || !String(c.notes).trim().startsWith('<')) c.notes = c.notes ? '<div class="q">' + esc(c.notes) + '</div>' : '';
    c.notes = (c.notes ? c.notes + '\n' : '') + html;
    save(); render();
    flash = {title:srcs.length + ' image(s) ajoutée(s)', body:'Elles sont placées à la fin du cours, sans toucher à la mise en forme existante (compressées automatiquement pour rester légères). Utilise « ✎ Modifier » si tu veux les déplacer dans le texte.' + (heavy ? ` Attention : ${heavy} image(s) très lourde(s), réduis-les si la sauvegarde échoue.` : '')};
    t.value = '';
  }
  else if (['impCourse', 'impNotes', 'impQ'].includes(a)) {
    const f = t.files[0]; if (!f) return;
    try {
      if (a === 'impQ') {
        let qs;
        if (/\.json$/i.test(f.name)) {
          const j = JSON.parse(await f.text());
          qs = (Array.isArray(j) ? j : j.questions).map(x => ({
            q:x.q || x.question, choices:(x.choices || x.options || []).map(String),
            answer:x.answer ?? x.correct ?? -1, expl:x.expl || x.explanation || ''
          })).filter(x => x.q && x.choices && x.choices.length > 1);
        } else {
          let txt;
          if (/\.pdf$/i.test(f.name)) txt = await readDoc(f, true);
          else if (/\.docx$/i.test(f.name)) txt = await docxToHtml(await f.arrayBuffer());
          else txt = await f.text();
          qs = parseQCM(txt);
        }
        if (!qs.length) { toast('Aucune question reconnue dans ce fichier. Vérifie que les questions ont bien des propositions (a, b, c…).'); t.value = ''; return; }
        const test = S.tests.find(x => x.id === t.dataset.id);
        test.questions = (test.questions || []).concat(qs);
        const noAns = qs.filter(q => q.answer < 0).length;
        // si le fichier ne contient aucune réponse, on propose de saisir le corrigé
        if (noAns === qs.length) {
          const res = await promptDialog({title:'Aucune réponse détectée', text:'Le fichier ne contient aucune bonne réponse lisible. Tu peux saisir le corrigé maintenant (ex. « 1b 2a 3c » ou « b, a, c »), ou plus tard avec « Corriger ».', fields:[{label:'Corrigé (facultatif)', value:''}], ok:'Appliquer', danger:false});
          if (res && res[0].trim()) applyKey(qs, res[0]);
        }
        flash = {title:qs.length + ' question(s) importée(s)', body:(noAns ? `${qs.length - noAns} bonne(s) réponse(s) détectée(s) automatiquement, ${noAns} à compléter.` : 'Les questions, les choix et les bonnes réponses ont été détectés automatiquement.') + ' Clique sur « Répondre au QCM » pour t’entraîner ; la correction s’affiche à la fin.'};
        save(); render();
      } else {
        const html = await readDoc(f);
        if (a === 'impCourse') {
          $('#c-notes').value = html;
          if (!val('c-title')) $('#c-title').value = f.name.replace(/\.(docx|html?|doc|txt)$/i, '');
          const fn = $('#c-fn'); if (fn) fn.textContent = '✓ ' + f.name + ' — mise en forme conservée';
        } else {
          const c = S.courses.find(c => c.id === cid);
          if (!c.notes || !String(c.notes).trim().startsWith('<')) c.notes = (c.notes ? '<div class="q">' + esc(c.notes) + '</div>' : '');
          c.notes = (c.notes ? c.notes + '\n' : '') + html;
          save(); render();
          const isPdf = /pdfpage/i.test(html);
          flash = {title:'Document importé', body:isPdf
            ? 'Le PDF est affiché comme dans un lecteur : chaque page est rendue telle quelle, avec sa mise en page d’origine. Utilise « 📖 Lire en plein écran » pour le lire confortablement.'
            : 'Le fichier est affiché avec sa mise en forme d’origine (titres, gras, listes, tableaux, images).'};
        }
      }
    } catch (err) { toast('Import impossible : ' + err.message); }
    t.value = '';
  }
});

// ---------- routage des actions ----------
async function handleAct(b, e) {
  const t = b;   // certains boutons (cases à cocher) utilisent t.checked
  const a = b.dataset.act, id = b.dataset.id, v = b.dataset.v;
  // ouvre le sélecteur de fichiers : appel direct depuis le clic (indispensable sur iPad/Safari)
  if (a === 'pick') {
    const forAct = b.dataset.for;
    const inp = forAct === 'impQ' || forAct === 'pickQcm'
      ? qcmPicker(id)
      : [...document.querySelectorAll('input[type=file][data-act="' + forAct + '"]')]
          .find(x => (x.dataset.id || '') === (id || '') && x.offsetParent !== null) ||
        [...document.querySelectorAll('input[type=file][data-act="' + forAct + '"]')].pop();
    if (inp) inp.click();
    return;
  }
  if (a === 'pickQcm') { testMenu = null; render(); const inp = qcmPicker(id); if (inp) inp.click(); return; }
  if (e.target.closest('.x') && a === 'openCourse') return;
  if (a === 'profMenu') { openProf = !openProf; paintProf(); return; }
  if (a === 'themeOpen') { openThemes = !openThemes; paintThemes(); return; }
  if (a === 'themeClose') { openThemes = false; paintThemes(); return; }
  if (a === 'setTheme') {
    S.set.theme = v; applyTheme(); openThemes = false; paintThemes(); save();
    toast('Thème « ' + ((THEMES.find(x => x[0] === v) || [])[1] || v) + ' » appliqué.');
    return;
  }
  if (a === 'profSave') {
    const n = ($('#pf-name') ? $('#pf-name').value : '').trim();
    S.set.profile = Object.assign({}, S.set.profile || {}, {name:n.slice(0, 40)});
    openProf = false; paintProf(); save(); toast('Profil enregistré.'); return;
  }
  if (a === 'profPhotoDel') {
    S.set.profile = Object.assign({}, S.set.profile || {}); delete S.set.profile.photo;
    paintProf(); save(); return;
  }
  if (a === 'backupSave') { exportBackup(); return; }
  if (a === 'backupLoad') { const f = $('#bk-file'); if (f) f.click(); return; }
  if (a === 'installApp') {
    if (deferredPrompt) { deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; deferredPrompt = null; paintInstall(false); if (r && r.outcome === 'accepted') toast('Installation lancée.'); }
    else toast('Utilise le menu du navigateur → « Installer l’application ».');
    return;
  }
  if (a === 'installNo') { localStorage.setItem('st-noinstall', '1'); paintInstall(false); return; }
  if (a === 'bkSave') { await bkSave(); return; }
  if (a === 'bkRestore') { await bkRestore(); return; }

  if (!['pick', 'pickQcm', 'pickColor', 'pickCourseColor', 'addSubject', 'addCourse', 'cancel', 'form'].includes(a)) snapshot();
  if (a === 'view') { view = v; form = null; cap = null; }
  else if (a === 'form') { form = v; mName = ''; draft = {}; draftRec = null; if (v === 'subject') newColor = PALETTE[0]; if (v === 'course') courseColor = null; }
  else if (a === 'cancel') { form = null; mName = ''; draft = {}; courseColor = null; }
  else if (a === 'toggle') open[id] = !open[id];
  else if (a === 'task') toggleTask(id, b.dataset.d);
  else if (a === 'openCourse') { cid = id; view = 'course'; }
  else if (a === 'recToggle') {
    const r = nextRec(); draftRec = {on: !r.on, days: r.days};
  }
  else if (a === 'recPreset') {
    const r = nextRec(); const p = PRESETS.find(x => x[0] === v);
    draftRec = {on: true, days: p ? p[1].slice() : r.days};
  }
  else if (a === 'recEdit') {
    const r = nextRec();
    const res = await promptDialog({title:'Personnaliser le rythme', text:'Jours après la création, séparés par des virgules (ex. 1,3,7,30).', fields:[{label:'Jours', value:r.days.join(', ')}], ok:'Appliquer', danger:false});
    if (res) {
      const days = res[0].split(/[,;\s]+/).map(x => parseInt(x, 10)).filter(n => n > 0 && n < 400);
      if (days.length) draftRec = {on:true, days:[...new Set(days)].sort((a, b) => a - b)};
      else toast('Aucun jour valide.');
    }
  }
  else if (a === 'recRemember') {
    const r = nextRec();
    S.set.recPreset = {on: r.on, days: r.days.slice(), name: (PRESETS.find(x => x[1].join(',') === r.days.join(',')) || [null])[0]};
    save(); toast(t.checked ? 'Rythme mémorisé pour les prochains cours et QCM.' : 'Rythme non mémorisé.');
    return;
  }
  else if (a === 'itemRec') {
    const kind = b.dataset.kind;
    const item = kind === 'course' ? S.courses.find(x => x.id === id) : S.tests.find(x => x.id === id);
    if (!item) return;
    const r = item.rec || {on:false, days:[1, 3, 7, 30]};
    const res = await promptDialog({
      title:'Récurrence de « ' + item.title + ' »',
      text:'Jours de révision après la création' + (item.createdAt ? ' (' + fmt(item.createdAt) + ')' : '') + '. Vide = pas de rappel automatique.',
      fields:[{label:'Jours (ex. 1,3,7,30)', value:r.on ? r.days.join(', ') : ''}],
      ok:'Mettre à jour', danger:false
    });
    if (res === null) return;
    const days = res[0].split(/[,;\s]+/).map(x => parseInt(x, 10)).filter(n => n > 0 && n < 400);
    item.rec = {on:days.length > 0, days:[...new Set(days)].sort((a, b) => a - b)};
    removeSchedule(kind, id);
    scheduleFor({...item, kind});
    save(); toast(days.length ? 'Révisions mises à jour dans l’agenda.' : 'Révisions automatiques désactivées.');
  }
  else if (a === 'openItem') { cid = id; view = 'course'; }
  else if (a === 'pickColor') { newColor = v; const inp = $('#m-color'); if (inp) inp.value = v; }
  else if (a === 'pickCourseColor') { courseColor = v; const inp = $('#c-color'); if (inp) inp.value = v; }
  else if (a === 'addSubject') {
    const el = $('#m-name'); if (el) mName = el.value;
    const name = mName.trim();
    if (!name) { toast('Donne un nom à la matière.'); return; }
    if (subjects().some(s => s.toLowerCase() === name.toLowerCase())) { toast('Cette matière existe déjà.'); return; }
    if (!S.set.colors) S.set.colors = {};
    S.set.colors[name] = newColor; form = null; mName = ''; save(); toast('Matière « ' + name + ' » créée.');
    view = 'courses';
  }
  else if (a === 'addCourse') {
    const title = val('c-title'), subject = val('c-sub');
    draft = {}; if (!title || !subject) { toast('Titre et matière sont nécessaires.'); return; }
    const col = courseColor || (document.getElementById('c-color') || {}).value || colorOf(subject);
    if (!S.set.colors) S.set.colors = {};
    if (!S.set.colors[subject]) S.set.colors[subject] = col;
    const rec = nextRec();
    const course = {id:uid(), title, subject, semester:val('c-sem') || 'S1', notes:val('c-notes'), color:col, createdAt:today(), rec:{on:rec.on, days:rec.days.slice()}};
    S.courses.push(course);
    if (S.set.autoEvents !== false) scheduleFor({...course, kind:'course'});
    form = null; courseColor = null; draftRec = null; save();
  }
  else if (a === 'pasteQ') {
    const test = S.tests.find(x => x.id === id);
    if (!test) return;
    const res = await promptDialog({title:'Coller un QCM', text:'Colle ici le texte du QCM (copié depuis Word, un PDF, un site…). Questions, propositions et bonnes réponses sont détectées automatiquement.', fields:[{type:'text', rows:12, label:'Colle le QCM ici…'}], ok:'Ajouter les questions', danger:false});
    if (!res || !res[0].trim()) return;
    const qs = parseQCM(res[0]);
    if (!qs.length) { toast('Aucune question reconnue. Vérifie que les propositions (a, b, c…) sont présentes.'); return; }
    test.questions = (test.questions || []).concat(qs);
    let noAns = qs.filter(q => q.answer < 0).length;
    if (noAns === qs.length) {
      const k = await promptDialog({title:'Aucune réponse détectée', text:'Le texte ne contient aucune bonne réponse lisible. Tu peux saisir le corrigé maintenant (ex. « 1b 2a 3c » ou « b, a, c »).', fields:[{label:'Corrigé (facultatif)', value:''}], ok:'Appliquer', danger:false});
      if (k && k[0].trim()) { applyKey(qs, k[0]); noAns = qs.filter(q => q.answer < 0).length; }
    }
    save(); render();
    toast(qs.length + ' question(s) ajoutée(s)' + (noAns ? ' · ' + noAns + ' sans réponse' : ' · toutes corrigées') + '.');
  }
  else if (a === 'pasteTest') {
    // 1) où rattacher le QCM : matière + cours (facultatif)
    const subs = subjects();
    const subjOpts = [['', '— Aucune matière —'], ...subs.map(x => [x, x])];
    let link = null;
    if (subs.length) {
      link = await promptDialog({title:'Rattacher le QCM', text:'Choisis la matière, puis éventuellement un cours précis (ou plusieurs via « Toute la matière »). Laisse vide pour un QCM isolé.', fields:[
        {type:'select', label:'Matière', value:'', options:subjOpts, act:'pickSubj'},
        {type:'select', label:'Cours', value:'', options:[['', '— Toute la matière —'], ...S.courses.map(c => [c.id, c.subject + ' – ' + c.title])]}
      ], ok:'Continuer', danger:false});
      if (link === null) return;
    }
    const chosenSub = (link && link[0]) || '';
    const chosenCourse = (link && link[1]) || '';
    const res = await promptDialog({title:'Coller un QCM', text:'Colle ici le texte du QCM. Il sera ajouté à un nouveau test, avec son corrigé si les bonnes réponses sont indiquées.', fields:[{label:'Titre du QCM', value:''}, {type:'text', rows:11, label:'Colle le QCM ici…'}], ok:'Créer le test', danger:false});
    if (!res || !res[1].trim()) return;
    const qs = parseQCM(res[1]);
    if (!qs.length) { toast('Aucune question reconnue. Vérifie que les propositions (a, b, c…) sont présentes.'); return; }
    let noAns = qs.filter(q => q.answer < 0).length;
    if (noAns === qs.length) {
      const k = await promptDialog({title:'Aucune réponse détectée', text:'Le texte ne contient aucune bonne réponse lisible. Tu peux saisir le corrigé maintenant (ex. « 1b 2a 3c » ou « b, a, c »).', fields:[{label:'Corrigé (facultatif)', value:''}], ok:'Appliquer', danger:false});
      if (k && k[0].trim()) { applyKey(qs, k[0]); noAns = qs.filter(q => q.answer < 0).length; }
    }
    const title = res[0].trim() || 'QCM collé';
    const course = chosenCourse ? S.courses.find(c => c.id === chosenCourse) : null;
    const subj = course ? course.subject : (chosenSub || subjects()[0] || 'Général');
    const t = {id:uid(), title, scope:course ? 'course' : 'subject', subject:subj, questions:qs, createdAt:today(),
      rec:{on:true, days:(S.set.recPreset && S.set.recPreset.days) || [1, 3, 7, 30]}};
    if (course) t.courseId = course.id;
    S.tests.push(t);
    if (S.set.autoEvents !== false) scheduleFor({...t, kind:'test'});
    save(); render();
    toast('Test « ' + title + ' » créé · ' + qs.length + ' question(s)' + (noAns ? ' · ' + noAns + ' sans réponse' : ' · toutes corrigées') + (course ? ' · rattaché à ' + course.title : (chosenSub ? ' · matière ' + chosenSub : '')) + '.');
  }
  else if (a === 'impNewTest') {
    // import de fichier directement dans un nouveau test, avec rattachement matière / cours
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.docx,.pdf,.json,.txt';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      let qs;
      try {
        if (/\.json$/i.test(f.name)) {
          const j = JSON.parse(await f.text());
          qs = (Array.isArray(j) ? j : j.questions).map(x => ({q:x.q || x.question, choices:(x.choices || x.options || []).map(String), answer:x.answer ?? x.correct ?? -1, expl:x.expl || x.explanation || ''})).filter(x => x.q && x.choices && x.choices.length > 1);
        } else {
          const txt = /\.pdf$/i.test(f.name) ? await readDoc(f, true) : (/\.docx$/i.test(f.name) ? await docxToHtml(await f.arrayBuffer()) : await f.text());
          qs = parseQCM(txt);
        }
      } catch (err) { toast('Lecture impossible : ' + err.message); return; }
      if (!qs || !qs.length) { toast('Aucune question reconnue dans ce fichier.'); return; }
      let noAns = qs.filter(q => q.answer < 0).length;
      if (noAns === qs.length) {
        const k = await promptDialog({title:'Aucune réponse détectée', text:'Le fichier ne contient aucune bonne réponse lisible. Tu peux saisir le corrigé maintenant (ex. « 1b 2a 3c » ou « b, a, c »).', fields:[{label:'Corrigé (facultatif)', value:''}], ok:'Appliquer', danger:false});
        if (k && k[0].trim()) { applyKey(qs, k[0]); noAns = qs.filter(q => q.answer < 0).length; }
      }
      const subs = subjects();
      let link = [ '', '' ];
      if (subs.length) {
        const curSub = subs[0];
        const r = await promptDialog({title:'Rattacher le QCM', text:'Choisis la matière, puis éventuellement un cours précis. Laisse vide pour un QCM isolé.', fields:[
          {type:'select', label:'Matière', value:curSub, options:[['', '— Aucune matière —'], ...subs.map(x => [x, x])], act:'pickSubj'},
          {type:'select', label:'Cours', value:'', options:[['', '— Toute la matière —'], ...S.courses.filter(c => c.subject === curSub).map(c => [c.id, c.subject + ' – ' + c.title])]}
        ], ok:'Créer le test', danger:false});
        if (r === null) return;
        link = r;
      }
      const course = link[1] ? S.courses.find(c => c.id === link[1]) : null;
      const subj = course ? course.subject : (link[0] || subjects()[0] || 'Général');
      const t = {id:uid(), title:f.name.replace(/\.(docx|pdf|json|txt)$/i, ''), scope:course ? 'course' : 'subject', subject:subj, questions:qs, createdAt:today(),
        rec:{on:true, days:(S.set.recPreset && S.set.recPreset.days) || [1, 3, 7, 30]}};
      if (course) t.courseId = course.id;
      S.tests.push(t);
      if (S.set.autoEvents !== false) scheduleFor({...t, kind:'test'});
      save(); render();
      toast('Test « ' + t.title + ' » créé · ' + qs.length + ' question(s)' + (course ? ' · ' + course.title : (link[0] ? ' · ' + link[0] : '')) + '.');
    };
    inp.click();
  }
  else if (a === 'qcmHelp') { helpOpen = !helpOpen; render(); }
  else if (a === 'addMenu' || a === 'moreMenu') {
    const kind = a === 'addMenu' ? 'add' : 'more';
    testMenu = (testMenu && testMenu.id === id && testMenu.kind === kind) ? null : {id, kind};
    render();
  }
  else if (a === 'relinkTest') {
    const test = S.tests.find(x => x.id === id);
    if (!test) return;
    const subs = subjects();
    const curSub = test.subject || '';
    const res = await promptDialog({title:'Rattacher « ' + test.title + ' »', text:'Choisis la matière, puis le cours précis. « Toute la matière » rattache le QCM à la matière entière.', fields:[
      {type:'select', label:'Matière', value:curSub, options:subs.map(x => [x, x]), act:'pickSubj'},
      {type:'select', label:'Cours', value:test.courseId || '', options:[['', '— Toute la matière —'], ...S.courses.filter(c => !curSub || c.subject === curSub).map(c => [c.id, c.subject + ' – ' + c.title])]}
    ], ok:'Rattacher', danger:false});
    if (!res) return;
    removeSchedule('test', test.id);
    const course = res[1] ? S.courses.find(c => c.id === res[1]) : null;
    if (course) { test.courseId = course.id; test.scope = 'course'; test.subject = course.subject; }
    else { delete test.courseId; test.scope = 'subject'; test.subject = res[0] || test.subject; }
    if (S.set.autoEvents !== false) scheduleFor({...test, kind:'test'});
    save(); render();
    toast(course ? 'QCM rattaché à « ' + course.title + ' ».' : 'QCM rattaché à la matière ' + test.subject + '.');
  }
  else if (a === 'keyTest') {
    const test = S.tests.find(x => x.id === id);
    if (!test || !(test.questions || []).length) return;
    const res = await promptDialog({title:'Saisir le corrigé', text:'Indique la bonne réponse de chaque question, dans l’ordre : « b, a, c » ou « 1b 2a 3c ». Les questions déjà corrigées sont conservées.', fields:[{label:'Corrigé', value:''}], ok:'Appliquer', danger:false});
    if (!res || !res[0].trim()) return;
    const n = applyKey(test.questions, res[0]);
    if (!n) { toast('Corrigé non reconnu. Utilise des lettres (a, b, c…) dans l’ordre des questions.'); return; }
    save(); render(); toast('Corrigé appliqué à ' + n + ' question(s).');
  }
  else if (a === 'delSubject') {
    const sb = b.dataset.v;
    const nc = S.courses.filter(c => c.subject === sb), nt = S.tests.filter(x => x.subject === sb);
    const ids = nc.map(c => c.id);
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer cette matière ?', text:`« ${sb} » sera supprimée avec ${nc.length} cours, ${nt.length} QCM et leurs notes. Les événements d’agenda liés seront retirés. Cette action est définitive.`})) return;
    nc.forEach(c => { removeSchedule('course', c.id); });
    nt.forEach(x => removeSchedule('test', x.id));
    const tids = nt.map(x => x.id);
    S.courses = S.courses.filter(c => c.subject !== sb);
    S.tests = S.tests.filter(x => x.subject !== sb);
    S.attempts = S.attempts.filter(x => !tids.includes(x.testId));
    S.exams = S.exams.filter(x => x.subject !== sb);
    S.events = S.events.filter(ev => ev.subject !== sb);
    if (S.set.colors) delete S.set.colors[sb];
    if (filt.sub === sb) filt.sub = '';
    save(); render(); toast('Matière supprimée.');
  }
  else if (a === 'delCourse') {
    e.stopPropagation();
    const c = S.courses.find(c => c.id === id);
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer ce cours ?', text:`« ${c ? c.title : ''} » et ses tests seront supprimés. Cette action est définitive.`})) return;
    const ts = S.tests.filter(t => t.courseId === id).map(t => t.id);
    removeSchedule('course', id);
    S.tests.filter(t => t.courseId === id).forEach(t => removeSchedule('test', t.id));
    S.courses = S.courses.filter(c => c.id !== id); S.tests = S.tests.filter(t => t.courseId !== id);
    S.attempts = S.attempts.filter(x => !ts.includes(x.testId)); save();
  }
  else if (a === 'addTest') {
    const title = val('t-title'), scope = val('t-scope'); if (!title) { toast('Donne un titre au test.'); return; }
    const t = {id:uid(), title, scope, round:0, questions:[]};
    if (scope === 'course') { t.courseId = val('t-course'); if (!t.courseId) return; t.subject = S.courses.find(c => c.id === t.courseId).subject; }
    else { t.subject = val('t-subject'); if (!t.subject) { toast('Indique la matière.'); return; } }
    t.createdAt = today();
    const rec = nextRec();
    t.rec = {on:rec.on, days:rec.days.slice()};
    S.tests.push(t);
    if (S.set.autoEvents !== false) scheduleFor({...t, kind:'test'});
    form = null; draftRec = null; save();
  }
  else if (a === 'delTest') {
    const t = S.tests.find(t => t.id === id);
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer ce test ?', text:`« ${t ? t.title : ''} », ses questions et son historique seront supprimés.`})) return;
    removeSchedule('test', id);
    S.tests = S.tests.filter(t => t.id !== id); S.attempts = S.attempts.filter(x => x.testId !== id); save();
  }
  else if (a === 'reset') {
    if (await confirmDialog({title:'Nouveau cycle ?', text:'Les résultats actuels sont conservés pour comparaison, mais les statistiques repartent de zéro.', ok:'Nouveau cycle', danger:false})) {
      const t = S.tests.find(t => t.id === id); t.round = rd(t) + 1; save();
    }
  }
  else if (a === 'resetAll') {
    if (await confirmDialog({title:'Êtes-vous sûr de réinitialiser tous les tests ?', text:'Un nouveau cycle démarre pour chaque test. Les anciens résultats restent disponibles pour comparaison.', ok:'Réinitialiser', danger:false})) {
      S.tests.forEach(t => t.round = rd(t) + 1); save();
    }
  }
  else if (a === 'addAttempt') {
    const score = parseFloat(val('s-' + id)), max = parseFloat(val('m-' + id));
    if (isNaN(score) || isNaN(max) || max <= 0 || score < 0 || score > max) { toast('Note invalide.'); return; }
    S.attempts.push({id:uid(), testId:id, score, max, date:val('d-' + id) || today(), round:rd(S.tests.find(t => t.id === id))}); open[id] = true; save();
  }
  else if (a === 'editAttempt') {
    const at = S.attempts.find(x => x.id === id);
    if (!at) return;
    const tt = S.tests.find(t => t.id === at.testId);
    const r = await promptDialog({
      title:'Modifier la note',
      text:`${tt ? tt.title : 'QCM'} — corrige le score, le barème ou la date.`,
      fields:[
        {label:'Note obtenue', value:String(at.score)},
        {label:'Barème (total)', value:String(at.max)},
        {label:'Date', value:at.date, type:'date'}
      ],
      ok:'Enregistrer', danger:false
    });
    if (!r) return;
    const sc = parseFloat(String(r[0]).replace(',', '.')), mx = parseFloat(String(r[1]).replace(',', '.'));
    if (isNaN(sc) || isNaN(mx) || mx <= 0 || sc < 0 || sc > mx) { toast('Note invalide : elle doit être comprise entre 0 et le barème.'); return; }
    at.score = sc; at.max = mx; at.date = r[2] || at.date;
    save(); toast('Note modifiée.');
  }
  else if (a === 'delAttempt') {
    const at = S.attempts.find(x => x.id === id);
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer ce résultat ?', text:at ? `${at.score}/${at.max} du ${fmt(at.date)} sera définitivement supprimé.` : ''})) return;
    S.attempts = S.attempts.filter(x => x.id !== id); save();
  }
  else if (a === 'quiz') {
    const tq = S.tests.find(t => t.id === id) || {questions:[]};
    const withChrono = b.dataset.chrono === '1';
    Q = {id, i:0, answers:[], revealed:[], score:0, wrong:[], attemptId:uid(), timeUpDone:false};
    for (let i = 0; i < tq.questions.length; i++) { Q.answers[i] = null; Q.revealed[i] = false; }
    chrono = {on:false, t0:0, elapsed:0, limit:0};
    openCorr = {};
    if (withChrono) {
      const n = tq.questions.length || 1;
      const r = await promptDialog({
        title:'Chronomètre du QCM',
        text:'Temps limite pour ' + n + ' question(s) — laisse vide pour un simple chronomètre.',
        fields:[{label:'Minutes (ex. 10)', value:String(Math.max(1, Math.round(n * 0.5)))}],
        ok:'Démarrer', danger:false
      });
      if (r === null) return;
      const min = parseFloat((r[0] || '').replace(',', '.'));
      chrono.limit = min > 0 ? min * 60 : 0;
    }
    if (withChrono) chronoStart();
    view = 'quiz'; cap = null; window.scrollTo({top:0});
  }
  else if (a === 'endQuiz') {
    const t = S.tests.find(t => t.id === Q.id);
    chronoStop(); Q.elapsed = Math.round(chrono.elapsed); Q.limit = chrono.limit;
    const done = Q.revealed.filter(Boolean).length;
    S.attempts.push({id:Q.attemptId, testId:t.id, score:Q.score, max:t.questions.length, date:today(), round:rd(t), wrong:Q.wrong});
    Q.i = t.questions.length; save();
    toast('Temps écoulé : ' + done + '/' + t.questions.length + ' question(s) traitée(s).');
  }
  else if (a === 'pomoOpen') pomo.preset = true;
  else if (a === 'pomoClose') pomo.preset = false;
  else if (a === 'pomoWork') pomo.work = +v;
  else if (a === 'pomoBreak') pomo.brk = +v;
  else if (a === 'pomoStart') pomoStart();
  else if (a === 'pomoStop') {
    if (await confirmDialog({title:'Arrêter le mode focus ?', text:'Le pomodoro en cours sera interrompu.', ok:'Arrêter', danger:false})) pomoStop();
  }
  else if (a === 'quitQuiz') {
    if (await confirmDialog({title:'Quitter ce QCM ?', text:'Ta progression dans ce QCM ne sera pas enregistrée.', ok:'Quitter', danger:false})) { chronoStop(); view = 'tests'; Q = null; }
  }
  else if (a === 'pick') {
    const t = S.tests.find(t => t.id === Q.id), q = t.questions[Q.i];
    if (Q.revealed[Q.i]) return;
    Q.answers[Q.i] = +b.dataset.i;
  }
  else if (a === 'revealQ') { /* supprimé : la correction n'apparaît qu'à la fin */ }
  else if (a === 'toggleAllCorr') {
    const openAll = !allCorrOpen();
    const tq = (S.tests.find(t => t.id === id) || {questions:[]}).questions;
    for (let i = 0; i < tq.length; i++) openCorr[Q.attemptId + '|' + i] = openAll;
  }
  else if (a === 'corrToggle') {
    const k = id;
    if (openCorr[k]) delete openCorr[k]; else openCorr[k] = true;
    const det = b.closest('details');
    if (det) { if (openCorr[k]) det.setAttribute('open', ''); else det.removeAttribute('open'); }
    return;
  }
  else if (a === 'nextQ') {
    const t = S.tests.find(t => t.id === Q.id);
    const qq = t.questions[Q.i];
    if (Q.answers[Q.i] == null) return;
    if (!Q.revealed[Q.i]) {
      Q.revealed[Q.i] = true;
      if (Q.answers[Q.i] === qq.answer) Q.score++; else Q.wrong.push(Q.i);
    }
    Q.i++;
    if (Q.i >= t.questions.length) {
      chronoStop(); Q.elapsed = Math.round(chrono.elapsed); Q.limit = chrono.limit;
      S.attempts.push({id:Q.attemptId, testId:t.id, score:Q.score, max:t.questions.length, date:today(), round:rd(t), wrong:Q.wrong}); save();
    }
    window.scrollTo({top:0});
  }
  else if (a === 'prevQ') { Q.i = Math.max(0, Q.i - 1); window.scrollTo({top:0}); }
  else if (a === 'subj') subj = v;
  else if (a === 'sSem') sSem = v;
  else if (a === 'calMode') { cal.mode = v; if (v !== 'month') { const d = new Date((cal.sel || today()) + 'T12:00:00'); cal.y = d.getFullYear(); cal.m = d.getMonth(); } }
  else if (a === 'calToday') { const d = new Date(); cal.y = d.getFullYear(); cal.m = d.getMonth(); cal.sel = today(); }
  else if (a === 'calStep') {
    const base = cal.sel || today();
    cal.sel = addDays(base, +v);
    const d = new Date(cal.sel + 'T12:00:00'); cal.y = d.getFullYear(); cal.m = d.getMonth();
  }
  else if (a === 'mon') {
    if (cal.mode === 'day') { const base = cal.sel || today(); cal.sel = addDays(base, +v * 1); const d = new Date(cal.sel + 'T12:00:00'); cal.y = d.getFullYear(); cal.m = d.getMonth(); }
    else if (cal.mode === 'week') { cal.sel = addDays(cal.sel || today(), +v * 7); const d = new Date(cal.sel + 'T12:00:00'); cal.y = d.getFullYear(); cal.m = d.getMonth(); }
    else { cal.m += +v; if (cal.m < 0) { cal.m = 11; cal.y--; } if (cal.m > 11) { cal.m = 0; cal.y++; } cal.sel = null; }
  }
  else if (a === 'day') {
    cal.sel = v;
    if (cal.mode === 'month') { const d = new Date(v + 'T12:00:00'); cal.y = d.getFullYear(); cal.m = d.getMonth(); }
  }
  else if (a === 'addEvent') {
    const title = val('e-title'); if (!title) { toast('Donne un titre à l’événement.'); return; }
    const until = val('e-until');
    S.events.push({id:uid(), date:cal.sel, title, type:val('e-type'), subject:val('e-subject') || '', until: until && until > cal.sel ? until : ''});
    save();
  }
  else if (a === 'editEvent') {
    const ev = S.events.find(x => x.id === id);
    const r = await promptDialog({title:'Modifier l’événement', fields:[{label:'Titre', value:ev.title}, {label:'Jusqu’au (facultatif)', value:ev.until || '', type:'date'}], ok:'Enregistrer', danger:false});
    if (!r) return;
    if (r[0].trim()) ev.title = r[0].trim();
    ev.until = r[1] && r[1] > ev.date ? r[1] : '';
    save();
  }
  else if (a === 'delEvent') {
    const ev = S.events.find(x => x.id === id);
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer cet événement ?', text:`« ${ev ? ev.title : ''} » du ${ev ? fmt(ev.date) : ''} sera supprimé de ton agenda.`})) return;
    S.events = S.events.filter(x => x.id !== id); save();
  }
  else if (a === 'addExam') {
    const grade = parseFloat(val('x-g')), max = parseFloat(val('x-m')), coef = parseFloat(val('x-c')) || 1, subject = val('x-sub'), semester = val('x-sem');
    if (isNaN(grade) || isNaN(max) || max <= 0 || !subject || !semester) { toast('Complète semestre, matière et note.'); return; }
    S.exams.push({id:uid(), semester, subject, grade, max, coef}); sSem = semester; save();
  }
  else if (a === 'delExam') {
    const x = S.exams.find(x => x.id === id);
    if (!await confirmDialog({title:'Êtes-vous sûr de vouloir supprimer cette note ?', text:x ? `${x.subject} : ${x.grade}/${x.max}` : ''})) return;
    S.exams = S.exams.filter(x => x.id !== id); save();
  }
  else if (a === 'color') {
    const r = await promptDialog({title:'Couleur de la matière « ' + v + ' »', text:'Choisis une couleur : elle sera utilisée partout dans l’application.', fields:[{label:'Couleur', value:colorOf(v), type:'color'}], ok:'Appliquer', danger:false});
    if (r) setColor(v, r[0]);
    return;
  }
  else if (a === 'readPdf') { openPdf = id; render(); return; }
  else if (a === 'readPdfClose') { openPdf = null; render(); return; }
  else if (a === 'editNotes') {
    const c = S.courses.find(c => c.id === id);
    cap = `<div class="backdrop" style="z-index:40"><div class="modal" style="max-width:720px">
      <h3>Contenu du cours</h3><p>Texte simple ou HTML (gras, titres, listes, tableaux).</p>
      <div class="row" style="margin-top:10px"><span class="btn g s" role="button" tabindex="0" data-act="pick" data-for="enImage">🖼 Insérer une image</span><input type="file" accept="image/*" multiple data-act="enImage" hidden><span class="mut">l’image est insérée à la fin du texte, tu peux la déplacer</span></div>
      <textarea id="en-text" style="min-height:280px;margin-top:8px;font-family:ui-monospace,monospace;font-size:13px">${esc(c.notes || '')}</textarea>
      <div class="acts"><button class="btn q" data-act="closeCap">Annuler</button><button class="btn" data-act="saveNotes" data-id="${id}">Enregistrer</button></div></div></div>`;
    render(); return;
  }
  else if (a === 'saveNotes') {
    const c = S.courses.find(c => c.id === id); c.notes = $('#en-text').value; cap = null; save();
  }
  else if (a === 'closeCap') cap = null;
  else if (a === 'helpEdit') {
    cap = `<div class="backdrop" style="z-index:40"><div class="modal" style="max-width:720px">
      <h3>Contenu de l’aide</h3><p>Texte simple, ou HTML si tu veux des titres, listes et tableaux.</p>
      <textarea id="help-text" style="min-height:280px;margin-top:10px;font-size:13px">${esc(S.set.help || '')}</textarea>
      <div class="acts"><button class="btn q" data-act="closeCap">Annuler</button><button class="btn" data-act="saveHelp">Enregistrer</button></div></div></div>`;
    render(); return;
  }
  else if (a === 'saveHelp') { S.set.help = $('#help-text').value; cap = null; save(); toast('Aide enregistrée.'); }
  else if (a === 'closeFlash') flash = null;
  render();
}

init();
