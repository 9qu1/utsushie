// ウツシエ: 画面
//   画面は「いまの state（サーバーから届く）」をそのまま描く。描きかけのキャンバスだけは手元で持つ
//   書きかけ・押しかけを消さないよう、中身が変わったときだけ作り直す（毎回 innerHTML しない）
import { NET, VERSION } from './net.js?v=0.3.0';
import { Pad, SIZES, INK_MAX } from './pad.js?v=0.3.0';
import { PALETTE, makeModel, renderModel, modelName } from './shared/models.js?v=0.3.0';
import {
  RULES, ruleOf, compatible, TIME_MIN, TIME_MAX, TIME_STEP, TIME_MARKS, cleanSec, fmtSec, MATCH_CHOICES, KINDS, PICKS, MIN_PLAYERS,
  maxJudges, clampJudges, PEEK_SEC, GLANCE_TIMES, GLANCE_MS, MOVES_MAX,
} from './shared/rules.js?v=0.3.0';
import { sfx, isMute, setMute } from './sound.js?v=0.3.0';

const $ = (s) => document.querySelector(s);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
  keys() { try { return Object.keys(sessionStorage); } catch { return []; } },
};

// ---------- じぶん ----------
function makePid() {
  const ok = (p) => typeof p === 'string' && /^[a-z0-9]{6,40}$/.test(p);
  let p = ss.get('us-pid');
  if (!ok(p)) p = ls.get('us-pid');
  if (!ok(p)) {
    p = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 24).toLowerCase();
  }
  ss.set('us-pid', p);
  ls.set('us-pid', p);
  return p;
}
const PID = makePid();
const myName = () => ($('#t-name').value || ls.get('us-name') || '').trim().slice(0, 10);

// ---------- 知らせ ----------
let toastT = 0;
function toast(msg, ms = 2600) {
  if (!msg) return;
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- 通信 ----------
const sock = NET.create();
let S = null;          // いまの state
let lastPhase = 'top';

sock.on('connect', () => {
  const code = sock.room;
  sock.emit('rejoin', { pid: PID }, (res) => {
    if (res && res.ok) return joined(code);
    sock.emit('join', { name: myName(), pid: PID }, (r2) => {
      if (r2 && r2.ok) return joined(code);
      toast((r2 && r2.err) || '部屋に入れなかったよ', 3500);
      goTop();
    });
  });
});
sock.on('state', (st) => onState(st));
sock.on('roomGone', () => { toast('部屋がなくなりました', 3500); goTop(); });
sock.on('kicked', () => { $('#kicked').hidden = false; });
sock.on('offline', (m) => toast(m));
let bandT = 0;
sock.on('status', (s) => {
  const b = $('#band');
  clearTimeout(bandT);
  if (s === 'down') { b.textContent = '📡 通信が切れました。つなぎ直し中…'; b.className = 'band'; b.hidden = false; }
  else if (s === 'back') {
    b.textContent = '✅ つながりました！';
    b.className = 'band back';
    b.hidden = false;
    bandT = setTimeout(() => { b.hidden = true; }, 1500);
  } else b.hidden = true;
});
$('#k-resume').onclick = () => { $('#kicked').hidden = true; sock.resume(); };

function joined(code) {
  ss.set('us-room', code);
  const u = new URL(location.href);
  if (u.searchParams.get('r') !== code) {
    u.searchParams.set('r', code);
    history.replaceState(null, '', u.pathname + u.search);
  }
}

function goTop() {
  sock.close();
  ss.del('us-room');
  S = null;
  const u = new URL(location.href);
  u.searchParams.delete('r');
  history.replaceState(null, '', u.pathname + u.search);
  setPhase('top');
  showInvite(null);
}

function setPhase(ph) {
  document.body.dataset.phase = ph;
  if (ph !== lastPhase) {
    window.scrollTo(0, 0);
    lastPhase = ph;
  }
}

// ---------- トップ ----------
$('#t-name').value = ls.get('us-name') || '';
function needName() {
  const n = myName();
  if (!n) { toast('名前を入れてね'); $('#t-name').focus(); return ''; }
  ls.set('us-name', n);
  return n;
}
$('#t-create').onclick = async () => {
  const name = needName();
  if (!name) return;
  const btn = $('#t-create');
  btn.disabled = true;
  const r = await sock.createRoom({ name, pid: PID });
  btn.disabled = false;
  if (!r.ok) { toast(r.err, 3500); return; }
  sock.open(r.code);
};
function joinCode(code) {
  if (!needName()) return;
  if (!/^\d{4}$/.test(code)) { toast('4けたのコードを入れてね'); return; }
  sock.open(code);
}
$('#t-join').onclick = () => joinCode($('#t-code').value.trim());
$('#t-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode($('#t-code').value.trim()); });
let inviteCode = null;
function showInvite(code) {
  inviteCode = code;
  $('#t-invite').hidden = !code;
  $('#t-join-invite').hidden = !code;
  $('#t-invite-code').textContent = code || '';
  $('#t-create').classList.toggle('primary', !code);
}
$('#t-join-invite').onclick = () => joinCode(inviteCode);

// 開いたとき: 部屋の中にいた（読み込み直し）ならつなぎ直す・招待リンクなら入口を出す
{
  const r = new URL(location.href).searchParams.get('r');
  if (r && /^\d{4}$/.test(r)) {
    if (ss.get('us-room') === r) sock.open(r);
    else showInvite(r);
  }
}

// ---------- 上の帯 ----------
function inviteUrl() { return `${sock.pageUrl}?r=${S ? S.code : ''}`; }
async function copyInvite() {
  const url = inviteUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast('招待リンクをコピーしました');
  } catch {
    window.prompt('このリンクを送ってね', url);
  }
}
$('#b-code').onclick = copyInvite;
$('#l-copy').onclick = copyInvite;
function soundIcon() { $('#b-sound').textContent = isMute() ? '🔇' : '🔊'; }
soundIcon();
$('#b-sound').onclick = () => { setMute(!isMute()); soundIcon(); };
function leave() {
  if (!window.confirm('部屋を出ますか？')) return;
  sock.leave();
  goTop();
}
$('#b-leave').onclick = leave;
$('#f-leave').onclick = leave;

function renderBar() {
  $('#b-code-num').textContent = S.code;
  let t = '';
  if (S.phase === 'lobby') t = '待合室';
  else if (S.phase === 'setup') t = `第${S.matchNo + 1}試合の準備`;
  else if (S.phase === 'final') t = '最終結果';
  else if (S.g) t = `第${S.g.no}試合（全${S.matchCount}）`;
  $('#b-match').textContent = t;
}

// ---------- state が届いたら ----------
function onState(st) {
  const prev = S ? S.phase : 'top';
  S = st;
  document.body.classList.toggle('is-host', !!st.you.isHost);
  setPhase(st.phase);
  renderBar();
  switch (st.phase) {
    case 'lobby':
    case 'setup': renderLobby(); break;
    case 'intro': renderIntro(prev !== 'intro'); break;
    case 'draw': renderDraw(); break;
    case 'judge': renderJudge(); break;
    case 'reveal': renderReveal(); break;
    case 'score': renderScore(prev !== 'score'); break;
    case 'final': renderFinal(prev !== 'final'); break;
    default:
  }
  if (st.phase !== 'draw') { hideZoomIf('draw'); stopSlot(); $('#d-slot').hidden = true; }
  if (st.phase !== 'judge') hideZoomIf('judge');
}

// 人の一覧（中身が変わったときだけ作り直す）
const MARK = { done: '✅', busy: '✏️', rest: '☕' };
function renderPlayers(ul, { score = false, marks = false } = {}) {
  const list = S.players;
  const sig = JSON.stringify(list.map((p) => [p.name, p.connected, p.isHost, p.you, score ? p.score : 0, marks ? p.mark : '']));
  if (ul.dataset.sig === sig) return;
  ul.dataset.sig = sig;
  ul.textContent = '';
  for (const p of list) {
    if (marks && !p.mark) continue;
    const li = el('li');
    if (p.you) li.classList.add('you');
    if (!p.connected) li.classList.add('off');
    if (marks && p.mark) li.classList.add(`m-${p.mark}`);
    li.append(`${p.isHost ? '👑 ' : ''}${marks && p.mark ? MARK[p.mark] + ' ' : ''}${p.name}${p.you ? '（あなた）' : ''}`);
    if (score) li.append(el('span', 'sc', `${p.score}点`));
    ul.append(li);
  }
}

// ---------- 待合室・試合の準備 ----------
function renderLobby() {
  const setup = S.phase === 'setup';
  const N = S.players.filter((p) => p.connected).length;
  $('#l-title').textContent = setup ? `第${S.matchNo + 1}試合の準備` : 'メンバーを待っています';
  $('#l-code').textContent = S.code;
  $('#l-count').textContent = `${N}人`;
  renderPlayers($('#l-players'), { score: setup });
  renderSettings(N);
  const start = $('#l-start');
  start.textContent = setup ? `第${S.matchNo + 1}試合をはじめる` : 'ゲームをはじめる';
  start.disabled = N < MIN_PLAYERS;
  const note = $('#l-start-note');
  if (N < MIN_PLAYERS) note.textContent = `あと${MIN_PLAYERS - N}人で始められます（${MIN_PLAYERS}〜12人）`;
  else note.textContent = S.you.isHost ? '' : 'ホストが はじめるのを待っています';
  $('#l-end').hidden = !setup;
}

function chip(label, on, onClick, disabled) {
  const b = el('button', `chip${on ? ' on' : ''}`, label);
  b.type = 'button';
  if (disabled) b.disabled = true;
  b.onclick = onClick;
  return b;
}

function setSetup(d) { sock.emit('setSetup', d); }

function renderSettings(N) {
  const box = $('#l-settings');
  const host = S.you.isHost;
  const s = S.setup;
  // 時間は作り直しの合図に入れない（つまみを動かしている最中に作り直すと指が外れる）。値はその場で書き換える
  const sig = JSON.stringify([{ ...s, sec: 0 }, N, host, S.matchCount, S.phase, S.matchNo]);
  if (box.dataset.sig === sig) { syncTime(s.sec); return; }
  box.dataset.sig = sig;
  box.textContent = '';
  box.classList.toggle('ro', !host);
  const h = (t) => box.append(el('h3', '', t));

  h('試合の数');
  const mc = el('div', 'chips');
  const minM = S.phase === 'setup' ? S.matchNo + 1 : 1;
  for (const n of MATCH_CHOICES) mc.append(chip(`${n}試合`, S.matchCount === n, () => sock.emit('setMatches', { n }), n < minM));
  box.append(mc);

  h('1枚を判定する人の数');
  const nn = Math.max(N, MIN_PLAYERS);
  const J = clampJudges(s.judges, nn);
  const step = el('div', 'step');
  const minus = el('button', '', '−');
  const plus = el('button', '', '＋');
  minus.type = plus.type = 'button';
  minus.disabled = J <= 1;
  plus.disabled = J >= maxJudges(nn);
  minus.onclick = () => setSetup({ judges: J - 1 });
  plus.onclick = () => setSetup({ judges: J + 1 });
  step.append(minus, el('b', '', String(J)), el('span', '', '人'), plus);
  box.append(step);
  const calc = el('div', 'calc');
  if (N >= MIN_PLAYERS) calc.innerHTML = `${N}人なら → お手本 <b>${N}枚</b>。みんな「<b>描く ${N - J}枚・判定 ${J}枚</b>」`;
  else calc.textContent = `${MIN_PLAYERS}人そろうと、描く枚数と判定する枚数が決まります`;
  box.append(calc);

  h('縛り');
  const pc = el('div', 'chips');
  for (const p of PICKS) pc.append(chip(p.name, s.pick === p.id, () => setSetup({ pick: p.id })));
  box.append(pc);
  if (s.pick === 'manual') {
    const grid = el('div', 'rule-grid');
    for (const r of RULES) {
      const on = s.rules.includes(r.id);
      const b = el('button', `rule-chip${on ? ' on' : ''}`);
      b.type = 'button';
      b.append(el('span', '', r.icon), el('span', '', r.name));
      b.title = r.desc;
      const canAdd = s.rules.length < 2 && s.rules.every((x) => compatible(x, r.id));
      if (!on && !canAdd) b.disabled = true;
      b.onclick = () => setSetup({ rules: on ? s.rules.filter((x) => x !== r.id) : s.rules.concat(r.id) });
      grid.append(b);
    }
    box.append(grid);
    box.append(el('div', 'calc', '2つまで選べます（似た種類どうしは一緒に選べません）'));
    box.append(el('div', 'calc', 'この試合のあいだ、ずっと同じ縛りで描きます'));
  } else if (s.pick === 'roulette') {
    box.append(el('div', 'calc', 'お題1枚ごとに、スロットがくるくる回って縛りが1〜2個決まる！'));
  }

  h('1枚の時間');
  box.append(timeSlider(s, host));

  h('お手本の絵');
  const kc = el('div', 'chips');
  for (const k of KINDS) kc.append(chip(k.name, s.kind === k.id, () => setSetup({ kind: k.id })));
  box.append(kc);
  if (!host) box.append(el('div', 'calc', '設定を変えられるのはホスト（👑）だけです'));
}

// 1枚の時間の目盛り（10〜300秒・5秒きざみ）
let timeDragging = false;
function timeSlider(s, host) {
  const wrap = el('div', 'time-box');
  const val = el('div', 'time-val', fmtSec(s.sec));
  val.id = 'l-time-val';
  const row = el('div', 'time-row');
  const minus = el('button', 'time-step', '−');
  const plus = el('button', 'time-step', '＋');
  minus.type = plus.type = 'button';
  minus.title = '5秒みじかく';
  plus.title = '5秒ながく';
  const rng = el('input', 'time-range');
  rng.type = 'range';
  rng.id = 'l-time';
  rng.min = String(TIME_MIN);
  rng.max = String(TIME_MAX);
  rng.step = String(TIME_STEP);
  rng.value = String(s.sec);
  rng.disabled = !host;
  rng.setAttribute('aria-label', '1枚の時間');
  const show = (v) => { val.textContent = fmtSec(v); paintRange(rng); };
  rng.addEventListener('pointerdown', () => { timeDragging = true; });
  rng.addEventListener('input', () => { timeDragging = true; show(Number(rng.value)); });
  rng.addEventListener('change', () => { timeDragging = false; setSetup({ sec: Number(rng.value) }); });
  rng.addEventListener('blur', () => { timeDragging = false; });
  const nudge = (d) => {
    const v = cleanSec(Number(rng.value) + d);
    rng.value = String(v);
    show(v);
    setSetup({ sec: v });
  };
  minus.onclick = () => nudge(-TIME_STEP);
  plus.onclick = () => nudge(TIME_STEP);
  const track = el('div', 'time-track');
  const marks = el('div', 'time-marks');
  for (const m of TIME_MARKS) {
    const t = el('span', 'time-mark', m < 60 ? `${m}秒` : `${m / 60}分`);
    t.style.setProperty('--f', String((m - TIME_MIN) / (TIME_MAX - TIME_MIN)));
    marks.append(t);
  }
  track.append(rng, marks);
  row.append(minus, track, plus);
  wrap.append(val, row);
  if ((s.rules || []).includes('speed') && s.pick === 'manual') wrap.append(el('div', 'calc', '縛り「8秒勝負」の試合は 8秒になります'));
  if (s.pick === 'roulette') wrap.append(el('div', 'calc', 'ルーレットで「8秒勝負」が出たお題は 8秒になります'));
  paintRange(rng);
  return wrap;
}
// つまみより左を色でぬる
function paintRange(rng) {
  const f = (Number(rng.value) - TIME_MIN) / (TIME_MAX - TIME_MIN);
  rng.style.setProperty('--fill', `${(f * 100).toFixed(1)}%`);
}
// サーバーから届いた時間を目盛りに出す（自分で動かしている最中は上書きしない）
function syncTime(sec) {
  const rng = document.getElementById('l-time');
  if (!rng || timeDragging || document.activeElement === rng && rng.matches(':active')) return;
  if (rng.value !== String(sec)) {
    rng.value = String(sec);
    paintRange(rng);
  }
  const val = document.getElementById('l-time-val');
  if (val) val.textContent = fmtSec(sec);
}

$('#l-start').onclick = () => {
  const b = $('#l-start');
  b.disabled = true;
  sock.emit('startMatch', {}, (res) => {
    b.disabled = false;
    if (res && res.ok === false && res.err) toast(res.err, 3500);
  });
};
$('#l-end').onclick = () => { if (window.confirm('ここで終わって最終結果を出しますか？')) sock.emit('endGame'); };

// ---------- 前ふり ----------
function renderIntro(enter) {
  const g = S.g;
  $('#i-no').textContent = `第${g.no}試合`;
  const box = $('#i-rules');
  const sig = g.id;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.textContent = '';
    if (g.mode === 'roulette') {
      const c = el('div', 'intro-rule');
      c.append(el('div', 'ir-n', '🎰 縛りはルーレット！'), el('div', 'ir-d', 'お題1枚ごとに、スロットがくるくる回って縛りが1〜2個決まる'));
      box.append(c);
    } else if (!g.rules.length) {
      const c = el('div', 'intro-rule');
      c.append(el('div', 'ir-n', '🆓 縛りなし！'), el('div', 'ir-d', 'ふつうに、そっくりに描こう'));
      box.append(c);
    }
    for (const id of g.rules) {
      const r = ruleOf(id);
      const c = el('div', 'intro-rule');
      c.append(el('div', 'ir-n', `${r.icon} ${r.name}`), el('div', 'ir-d', r.desc));
      box.append(c);
    }
  }
  const info = $('#i-info');
  info.innerHTML = '';
  info.append(`お手本 ${g.N}枚・1枚 ${fmtSec(g.sec)}・1枚を判定する人 ${g.J}人`, el('br'));
  info.append(S.you.inGame ? `あなたは「描く ${g.D}枚・判定 ${g.J}枚」` : '👀 観戦中（次の試合から参加できます）');
  if (enter) {
    sfx.intro();
    const bar = $('#i-bar');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;
    bar.style.transition = `transform ${g.introMs}ms linear`;
    bar.style.transform = 'scaleX(0)';
  }
}

// 縛りの小さな札を並べる
function ruleTags(box, rules) {
  box.textContent = '';
  if (!rules || !rules.length) { box.append(el('span', '', '縛りなし')); return; }
  for (const id of rules) {
    const r = ruleOf(id);
    if (!r) continue;
    const t = el('span', '', `${r.icon}${r.name}`);
    t.title = r.desc;
    box.append(t);
  }
}

// ---------- 描く ----------
const pad = new Pad($('#d-canvas'), $('#d-over'), { onChange: onPadChange });
let cur = null; // いまの1枚 { key, gid, slot, image, model, localStart, localEnd, ... }
const TOOLS = [['pen', '✏️', 'ペン'], ['line', '📏', '直線'], ['fill', '🪣', '塗る'], ['eraser', '🧽', '消す']];

// 道具の部品を作る（1回だけ）
{
  const pal = $('#d-palette');
  PALETTE.forEach((c, i) => {
    const b = el('button', 'sw');
    b.type = 'button';
    b.style.background = c.hex;
    b.title = c.name;
    b.dataset.i = i;
    b.onclick = () => { pad.setColor(i); if (!pad.colorOk(i)) toast(pad.has('mono') ? '黒一色の試合だよ' : 'この色はもう使えないよ（2色まで）'); };
    pal.append(b);
  });
  const sz = $('#d-sizes');
  SIZES.forEach((d, i) => {
    const b = el('button', 'sz');
    b.type = 'button';
    b.dataset.i = i;
    const dot = el('i');
    const px = [4, 8, 14, 22][i];
    dot.style.width = dot.style.height = `${px}px`;
    b.append(dot);
    b.title = ['細い', 'ふつう', '太い', 'すごく太い'][i];
    b.onclick = () => pad.setSize(i);
    sz.append(b);
  });
  const tl = $('#d-tools');
  for (const [id, ic, name] of TOOLS) {
    const b = el('button', 'tbtn');
    b.type = 'button';
    b.dataset.t = id;
    b.append(ic, el('small', '', name));
    b.onclick = () => pad.setTool(id);
    tl.append(b);
  }
  $('#d-undo').onclick = () => pad.undo();
  $('#d-clear').onclick = () => { if (window.confirm('ぜんぶ消しますか？')) pad.clearAll(); };
  $('#d-done').onclick = () => submitDrawing('done');
  $('#d-glance').onclick = () => {
    if (!cur || cur.glanceLeft <= 0 || Date.now() < cur.glanceUntil) return;
    cur.glanceLeft--;
    cur.glanceUntil = Date.now() + GLANCE_MS;
    savePad();
    drawTick(Date.now());
  };
}

let saveT = 0;
function padKey() { return cur ? `us-pad:${S ? S.code : ''}:${cur.gid}:${cur.slot}` : ''; }
function savePad() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!cur || cur.sent) return;
    ss.set(padKey(), JSON.stringify({ pad: pad.save(), glanceLeft: cur.glanceLeft }));
  }, 350);
}

function onPadChange(p, why) {
  document.querySelectorAll('#d-palette .sw').forEach((b) => {
    const i = Number(b.dataset.i);
    b.disabled = !p.colorOk(i);
    b.classList.toggle('on', p.tool !== 'eraser' && p.color === i);
    b.classList.toggle('used', p.has('col2') && p.used.includes(i));
  });
  document.querySelectorAll('#d-sizes .sz').forEach((b) => {
    const i = Number(b.dataset.i);
    b.disabled = !p.sizeOk(i);
    b.classList.toggle('on', p.size === i && p.sizeOk(i));
  });
  document.querySelectorAll('#d-tools .tbtn').forEach((b) => {
    b.disabled = !p.toolOk(b.dataset.t);
    b.classList.toggle('on', p.tool === b.dataset.t);
  });
  const g = $('#d-gauge');
  g.textContent = '';
  if (p.has('ink')) {
    const left = Math.max(0, 1 - p.ink / INK_MAX);
    g.append(`インク のこり ${Math.round(left * 100)}%`);
    const bar = el('div', 'bar');
    const fill = el('i', left < 0.2 ? 'low' : '');
    fill.style.width = `${left * 100}%`;
    bar.append(fill);
    g.append(bar);
  }
  if (p.has('one')) g.append(el('div', '', p.movesLeft() ? '線は1本だけ！' : '1本描いたよ（戻すでやり直せる）'));
  else if (p.has('moves')) g.append(el('div', '', `のこり ${p.movesLeft()}手（${MOVES_MAX}手まで）`));
  if (p.has('col2')) g.append(el('div', '', `使った色 ${p.used.length}/2`));
  if (!g.childNodes.length) g.append(el('div', 'muted', 'お手本そっくりに！'));
  if (why === 'noink') toast('インクがなくなった！');
  if (why === 'nomoves') toast(p.has('one') ? '一筆書きだよ。戻すでやり直せる' : 'もう描けないよ（手数おわり）');
  if (why === 'nocolor') toast('この色はもう使えないよ（2色まで）');
  if (why === 'stroke' || why === 'undo' || why === 'clear') savePad();
}

// 画面の大きさに合わせて並べ方を決める
function layoutDraw() {
  const grid = $('#d-grid');
  const W = Math.min(document.documentElement.clientWidth, 1280);
  const H = window.innerHeight;
  const top = 52 + 12 + 54;
  const wide = W >= 760 && W >= H * 0.95;
  let cs, ms, sw, pw = 0;
  if (wide) {
    const avail = W - 24 - 236 - 20;
    cs = Math.min(H - top - 26, avail * 0.6);
    ms = Math.min(cs * 0.8, avail - cs);
    sw = 44;
  } else {
    const inner = W - 24;
    ms = Math.round(Math.min(inner * 0.4, 190));
    sw = Math.max(24, Math.floor((ms - 15) / 4));
    cs = Math.min(inner, H - top - ms - 150);
    cs = Math.max(cs, Math.min(inner, 250));
    pw = inner - ms - 10;
  }
  grid.classList.toggle('wide', wide);
  grid.classList.toggle('portrait', !wide);
  grid.style.setProperty('--cs', `${Math.floor(cs)}px`);
  grid.style.setProperty('--ms', `${Math.floor(ms)}px`);
  grid.style.setProperty('--sw', `${sw}px`);
  grid.style.setProperty('--pw', `${pw}px`);
}
window.addEventListener('resize', () => { if (S && S.phase === 'draw') layoutDraw(); });

const MODEL_PX = 600;
function paintModel(canvas, image) {
  if (canvas.width !== MODEL_PX) { canvas.width = MODEL_PX; canvas.height = MODEL_PX; }
  renderModel(canvas.getContext('2d'), makeModel(image), MODEL_PX);
}

function newSlot(g) {
  const key = `${g.id}:${g.slot}`;
  cur = {
    key, gid: g.id, slot: g.slot, image: g.image, rules: g.rules, sec: g.sec,
    localStart: 0, localEnd: 0, glanceLeft: GLANCE_TIMES, glanceUntil: 0,
    sent: false, sending: false, lastCount: null, timeupDone: false, mineUrl: '', lastBeep: null, spinEnd: 0,
  };
  stopSlot();
  // ほかの1枚の控えは消す
  for (const k of ss.keys()) if (k.startsWith('us-pad:') && k !== padKey()) ss.del(k);
  pad.reset();
  pad.setRules(g.rules);
  pad.setEnabled(false);
  const saved = ss.get(padKey());
  if (saved) {
    try {
      const j = JSON.parse(saved);
      cur.glanceLeft = Number.isInteger(j.glanceLeft) ? j.glanceLeft : GLANCE_TIMES;
      pad.restore(j.pad);
    } catch {}
  }
  paintModel($('#d-model'), g.image);
  paintModel($('#d-side-model'), g.image);
  ruleTags($('#d-rules'), g.rules);
  $('#d-glance').hidden = !g.rules.includes('glance');
  $('#d-side-mine').removeAttribute('src');
  layoutDraw();
}

function drawMode(g) {
  if (g.role !== 'draw') return g.role;
  return cur.sent || g.submitted ? 'sent' : 'draw';
}

function renderDraw() {
  const g = S.g;
  if (!cur || cur.key !== `${g.id}:${g.slot}`) newSlot(g);
  if (g.submitted) cur.sent = true;
  // 時計: 終わりの時刻はサーバーの「のこり」から（0.4秒以上ずれたときだけ合わせる）
  const end = Date.now() + g.startInMs + g.remainMs;
  if (!cur.localEnd || Math.abs(cur.localEnd - end) > 400) cur.localEnd = end;
  cur.localStart = cur.localEnd - g.sec * 1000;
  const se = Date.now() + (g.spinMs || 0);
  if (!cur.spinEnd || (g.spinMs > 0 && Math.abs(cur.spinEnd - se) > 400)) cur.spinEnd = se;
  const mode = drawMode(g);
  const sec = $('#s-draw');
  sec.dataset.mode = mode;
  $('#d-no').textContent = g.role === 'draw' || mode === 'sent' ? `${g.myNo}/${g.D}枚目` : `お手本 ${g.slot + 1}/${g.N}`;
  $('#d-prog').textContent = `提出 ${g.subCount}/${g.drawerCount}`;
  const msg = $('#d-side-msg');
  if (mode === 'sent') msg.innerHTML = `✅ 提出しました！<br>みんなを待っています（${g.subCount}/${g.drawerCount}）`;
  else if (mode === 'rest') msg.innerHTML = `☕ この絵は<b>あなたが判定</b>します<br>お手本をよく見ておいてね！`;
  else if (mode === 'watch') msg.innerHTML = '👀 観戦中です<br>次の試合から参加できます';
  if (mode === 'sent' && cur.mineUrl) $('#d-side-mine').src = cur.mineUrl;
  $('#d-side-mine-f').hidden = !(mode === 'sent' && cur.mineUrl);
  renderPlayers($('#d-side-players'), { marks: true });
  // サーバーが「時間切れ」と言ったのにまだ出していない → 出す
  if (g.collecting && mode === 'draw') submitDrawing('timeup');
  drawTick(Date.now());
}

// ---------- ルーレット（スロット） ----------
//   リールは2本。1本目はかならず縛り、2本目は縛りか「なし」（＝1〜2個）。1本目が先に止まる
const REEL_H = 60;
const NONE_ITEM = { id: '', icon: '🚫', name: 'なし', desc: '' };
let slotFx = null; // { key, timers, landed }

function reelItem(r) {
  const d = el('div', 'ri');
  d.append(el('span', 'ic', r.icon), el('span', 'nm', r.name));
  return d;
}

function stopSlot() {
  if (!slotFx) return;
  slotFx.timers.forEach(clearTimeout);
  slotFx = null;
}

function runSlot(g) {
  const key = `${g.id}:${g.slot}`;
  if (slotFx && slotFx.key === key) return;
  stopSlot();
  const results = [g.rules[0] ? ruleOf(g.rules[0]) : NONE_ITEM, g.rules[1] ? ruleOf(g.rules[1]) : NONE_ITEM];
  const spin = Math.max(0, cur.spinEnd - Date.now());
  const fx = { key, timers: [], landed: 0 };
  slotFx = fx;
  $('#d-slot-desc').textContent = '';
  $('#d-slot-count').textContent = '';
  const stops = [Math.max(0, spin - 900), spin];
  [0, 1].forEach((k) => {
    const reel = $(`#d-reel-${k}`);
    const strip = reel.querySelector('.strip');
    reel.classList.remove('hit', 'none');
    strip.textContent = '';
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    const pool = k === 0 ? RULES : RULES.concat([NONE_ITEM, NONE_ITEM, NONE_ITEM, NONE_ITEM]);
    const n = stops[k] > 250 ? 22 + k * 8 : 0;
    for (let i = 0; i < n; i++) strip.append(reelItem(pool[Math.floor(Math.random() * pool.length)]));
    strip.append(reelItem(results[k]));
    void strip.offsetHeight;
    if (n) {
      strip.style.transition = `transform ${stops[k]}ms cubic-bezier(.12,.72,.22,1)`;
      strip.style.transform = `translateY(${-n * REEL_H}px)`;
      fx.timers.push(setTimeout(() => land(fx, k, results, true), stops[k]));
    } else {
      land(fx, k, results, false);
    }
  });
  // くるくるの音（だんだんゆっくり）
  if (spin > 250) {
    const t0 = Date.now();
    const step = () => {
      const e = Date.now() - t0;
      if (slotFx !== fx || e >= spin - 120) return;
      sfx.reel();
      fx.timers.push(setTimeout(step, 45 + (e / spin) * 230));
    };
    step();
  }
}

function land(fx, k, results, sound) {
  if (slotFx !== fx) return;
  const reel = $(`#d-reel-${k}`);
  reel.classList.add('hit');
  if (!results[k].id) reel.classList.add('none');
  if (sound) sfx.ding();
  fx.landed++;
  if (fx.landed < 2) return;
  // 2本とも止まった → 説明
  const box = $('#d-slot-desc');
  box.textContent = '';
  const list = results.filter((r) => r.id);
  for (const r of list) {
    const d = el('div', 'sd');
    d.append(el('b', '', `${r.icon} ${r.name}`), el('span', '', r.desc));
    box.append(d);
  }
  if (sound && list.length === 2) sfx.fanfare();
}

async function submitDrawing(reason) {
  if (!S || S.phase !== 'draw' || !cur || cur.sent || cur.sending || S.g.role !== 'draw') return;
  const mine = cur;
  mine.sending = true;
  pad.setEnabled(false);
  $('#d-done').disabled = true;
  const blob = await pad.toBlob();
  if (!blob) { mine.sending = false; return; }
  if (mine.mineUrl) URL.revokeObjectURL(mine.mineUrl);
  mine.mineUrl = URL.createObjectURL(blob);
  let ok = false;
  let err = '';
  for (let k = 0; k < 5 && cur === mine; k++) {
    const r = await sock.uploadArt({ blob, pid: PID, tok: S.you.tok, game: mine.gid, slot: mine.slot });
    if (r.ok) { ok = true; break; }
    err = r.err;
    if (!r.net && r.status && r.status < 500 && r.status !== 429) break;
    await sleep(600 * (k + 1));
  }
  mine.sending = false;
  if (ok) {
    mine.sent = true;
    ss.del(`us-pad:${S.code}:${mine.gid}:${mine.slot}`);
    if (reason === 'done') sfx.done();
  } else if (cur === mine) {
    toast(err || '絵を送れなかったよ', 3500);
  }
  $('#d-done').disabled = false;
  if (S && S.phase === 'draw') renderDraw();
}

// 0.1秒ごと: カウントダウン・時計・お手本の見え方・キャンバスを使えるか
function drawTick(now) {
  if (!S || S.phase !== 'draw' || !cur) return;
  const g = S.g;
  const mode = drawMode(g);
  const toStart = cur.localStart - now;
  const left = cur.localEnd - now;
  const started = toStart <= 0;
  // ルーレット（描く前）
  const roulette = g.mode === 'roulette' && toStart > 0;
  $('#d-slot').hidden = !roulette;
  // 止まる前に、上の帯の縛りの札で結果がわからないように
  $('#d-rules').style.visibility = g.mode === 'roulette' && now < cur.spinEnd ? 'hidden' : '';
  if (roulette) {
    runSlot(g);
    const sc = $('#d-slot-count');
    if (now < cur.spinEnd) sc.textContent = '';
    else {
      const n = Math.ceil(toStart / 1000);
      sc.textContent = `${n}`;
      if (cur.lastCount !== n) { cur.lastCount = n; if (mode === 'draw') sfx.count(); }
    }
  }
  // 3・2・1
  const cnt = $('#d-count');
  if (roulette) cnt.hidden = true;
  else if (toStart > 0) {
    const n = Math.ceil(toStart / 1000);
    cnt.hidden = false;
    cnt.className = 'count';
    cnt.textContent = String(n);
    if (cur.lastCount !== n) { cur.lastCount = n; if (mode === 'draw') sfx.count(); }
  } else if (toStart > -700 && mode === 'draw') {
    cnt.hidden = false;
    cnt.className = 'count go';
    cnt.textContent = 'スタート！';
    if (cur.lastCount !== 0) { cur.lastCount = 0; sfx.go(); }
  } else cnt.hidden = true;
  // 時計
  const t = $('#d-timer');
  const secs = started ? Math.max(0, Math.ceil(left / 1000)) : cur.sec;
  // 1分以上は「4:59」の形
  t.textContent = secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : String(secs);
  const hurry = started && left > 0 && left <= 5000;
  t.classList.toggle('hurry', hurry);
  if (hurry && mode === 'draw' && cur.lastBeep !== secs && secs <= 3) { cur.lastBeep = secs; sfx.tick(); }
  // お手本の見え方
  const cover = $('#d-model-cover');
  let hide = !started;
  let coverText = '3・2・1 で見えるよ';
  if (started && mode === 'draw') {
    if (cur.rules.includes('peek') && now - cur.localStart > PEEK_SEC * 1000) { hide = true; coverText = '👀 もう見えないよ。記憶で描こう'; }
    if (cur.rules.includes('glance') && now >= cur.glanceUntil) { hide = true; coverText = cur.glanceLeft > 0 ? '🫣 下のボタンでチラ見' : '🫣 チラ見はおしまい'; }
  }
  cover.hidden = !hide;
  $('#d-model-cover-t').textContent = coverText;
  const gb = $('#d-glance');
  gb.textContent = `🫣 チラ見（のこり${cur.glanceLeft}）`;
  gb.disabled = !started || cur.glanceLeft <= 0 || now < cur.glanceUntil || mode !== 'draw';
  // 自分の絵が見えない
  $('#d-blind').hidden = !(cur.rules.includes('blind') && mode === 'draw');
  // キャンバス
  const can = mode === 'draw' && started && left > 0 && !cur.sending;
  if (pad.enabled !== can) pad.setEnabled(can);
  $('#d-done').disabled = !can;
  // 時間切れ → 送る
  if (mode === 'draw' && started && left <= 0 && !cur.timeupDone) {
    cur.timeupDone = true;
    sfx.timeup();
    submitDrawing('timeup');
  }
}

// ---------- 判定 ----------
let J = { key: null, img: null, orders: {}, done: {}, shown: '', rankT: 0 };
function renderJudge() {
  const g = S.g;
  if (J.key !== g.id) J = { key: g.id, img: null, orders: {}, done: {}, shown: '', rankT: 0 };
  for (const t of g.tasks) {
    if (!J.orders[t.img]) J.orders[t.img] = t.order.slice();
    if (t.done) J.done[t.img] = true;
  }
  const left = g.tasks.filter((t) => !J.done[t.img]);
  const waiting = left.length === 0;
  $('#s-judge').classList.toggle('waiting', waiting);
  $('#j-prog').textContent = `判定 ${g.doneCount}/${g.judgeCount}人`;
  J.end = Date.now() + g.remainMs;
  // 上のタブ（2枚以上判定するとき）
  const tabs = $('#j-tabs');
  const tsig = JSON.stringify(g.tasks.map((t) => [t.img, !!J.done[t.img]])) + J.img;
  if (!waiting && (J.img == null || J.done[J.img] || !g.tasks.some((t) => t.img === J.img))) J.img = left[0].img;
  if (tabs.dataset.sig !== tsig + J.img) {
    tabs.dataset.sig = tsig + J.img;
    tabs.textContent = '';
    if (g.tasks.length > 1) {
      g.tasks.forEach((t, k) => {
        const b = el('button', `j-tab${t.img === J.img ? ' on' : ''}${J.done[t.img] ? ' done' : ''}`, `${k + 1}枚目${J.done[t.img] ? '✓' : ''}`);
        b.type = 'button';
        b.onclick = () => { if (!J.done[t.img]) { J.img = t.img; renderJudge(); } };
        tabs.append(b);
      });
    }
  }
  if (waiting) {
    const msg = $('#j-wait-msg');
    if (!S.you.inGame) msg.innerHTML = '👀 観戦中です<br>みんなが判定しています';
    else if (g.tasks.length) msg.innerHTML = '✅ 判定おわり！<br>みんなを待っています';
    else msg.innerHTML = 'あなたが判定する絵はありません<br>みんなを待っています';
    renderPlayers($('#j-players'), { marks: true });
    return;
  }
  showTask(g.tasks.find((t) => t.img === J.img));
}

function showTask(t) {
  const sig = `${t.img}:${t.arts.join(',')}`;
  if (J.shown !== sig) {
    J.shown = sig;
    paintModel($('#j-model'), t.image);
    $('#j-model-name').textContent = `（${modelName(t.image)}）`;
    ruleTags($('#j-rules'), t.rules);
    const grid = $('#j-grid');
    grid.textContent = '';
    for (const id of t.arts) {
      const b = el('button', 'jc');
      b.type = 'button';
      b.dataset.id = id;
      const img = el('img');
      img.src = sock.artUrl(id);
      img.alt = '';
      img.draggable = false;
      const rk = el('span', 'rk');
      const zm = el('span', 'zm', '🔍');
      zm.onclick = (e) => { e.stopPropagation(); openZoom('judge', t, id); };
      b.append(img, rk, zm);
      b.onclick = () => toggleRank(t, id);
      grid.append(b);
    }
  }
  updateBadges(t);
}

function toggleRank(t, id) {
  const o = J.orders[t.img];
  const i = o.indexOf(id);
  if (i >= 0) o.splice(i, 1);
  else {
    o.push(id);
    // 残り1枚なら自動で最下位に
    if (o.length === t.arts.length - 1) o.push(t.arts.find((x) => !o.includes(x)));
  }
  sfx.tap();
  updateBadges(t);
  clearTimeout(J.rankT);
  J.rankT = setTimeout(() => sock.emit('rank', { img: t.img, order: o }), 300);
}

function updateBadges(t) {
  const o = J.orders[t.img];
  document.querySelectorAll('#j-grid .jc').forEach((b) => {
    const r = o.indexOf(b.dataset.id) + 1;
    const rk = b.querySelector('.rk');
    rk.textContent = r ? `${r}位` : '';
    rk.hidden = !r;
    rk.className = `rk${r && r <= 3 ? ` r${r}` : ''}`;
    b.classList.toggle('ranked', !!r);
  });
  const sub = $('#j-submit');
  sub.disabled = o.length !== t.arts.length;
  sub.textContent = o.length === t.arts.length ? 'この順位で決定' : `順位をつけてね（${o.length}/${t.arts.length}）`;
  if (zoomCtx && zoomCtx.where === 'judge') refreshZoom();
}

$('#j-reset').onclick = () => {
  const t = S && S.g && S.g.tasks && S.g.tasks.find((x) => x.img === J.img);
  if (!t) return;
  J.orders[t.img] = [];
  updateBadges(t);
  sock.emit('rank', { img: t.img, order: [] });
};
$('#j-submit').onclick = () => {
  const t = S && S.g && S.g.tasks && S.g.tasks.find((x) => x.img === J.img);
  if (!t) return;
  const b = $('#j-submit');
  b.disabled = true;
  sock.emit('submitRank', { img: t.img, order: J.orders[t.img] }, (res) => {
    b.disabled = false;
    if (res && res.ok) {
      J.done[t.img] = true;
      sfx.done();
      if (S && S.phase === 'judge') renderJudge();
    } else toast((res && res.err) || '送れなかったよ');
  });
};
$('#j-close').onclick = () => { if (window.confirm('判定をしめきりますか？（まだの人の分はおまかせで決まります）')) sock.emit('closeJudge'); };

function judgeTick(now) {
  if (!S || S.phase !== 'judge' || !J.end) return;
  const left = Math.max(0, J.end - now);
  const t = $('#j-timer');
  t.textContent = String(Math.ceil(left / 1000));
  t.classList.toggle('hurry', left > 0 && left <= 10000);
}

// ---------- 大きく見る ----------
let zoomCtx = null; // { where, t, ids, i }
function openZoom(where, t, id) {
  const ids = t.arts || t.ids;
  zoomCtx = { where, t, ids, i: Math.max(0, ids.indexOf(id)) };
  paintModel($('#z-model'), t.image);
  $('#zoom').hidden = false;
  refreshZoom();
}
function refreshZoom() {
  const z = zoomCtx;
  if (!z) return;
  const id = z.ids[z.i];
  $('#z-img').src = sock.artUrl(id);
  const rb = $('#z-rank');
  if (z.where === 'judge') {
    const o = J.orders[z.t.img] || [];
    const r = o.indexOf(id) + 1;
    $('#z-cap').textContent = r ? `この絵: ${r}位` : `この絵（${z.i + 1}/${z.ids.length}）`;
    rb.hidden = false;
    rb.textContent = r ? '順位を取り消す' : `この絵を ${o.length + 1}位に`;
  } else {
    rb.hidden = true;
    $('#z-cap').textContent = z.caps ? z.caps[z.i] : '';
  }
}
function hideZoomIf(where) { if (zoomCtx && zoomCtx.where === where) closeZoom(); }
function closeZoom() { zoomCtx = null; $('#zoom').hidden = true; }
$('#z-close').onclick = closeZoom;
$('#zoom').onclick = (e) => { if (e.target.id === 'zoom') closeZoom(); };
$('#z-prev').onclick = () => { if (!zoomCtx) return; zoomCtx.i = (zoomCtx.i - 1 + zoomCtx.ids.length) % zoomCtx.ids.length; refreshZoom(); };
$('#z-next').onclick = () => { if (!zoomCtx) return; zoomCtx.i = (zoomCtx.i + 1) % zoomCtx.ids.length; refreshZoom(); };
$('#z-rank').onclick = () => {
  const z = zoomCtx;
  if (!z || z.where !== 'judge') return;
  const id = z.ids[z.i];
  const o = J.orders[z.t.img];
  const was = o.includes(id);
  toggleRank(z.t, id);
  // 順位をつけたら、まだの絵へ
  if (!was) {
    const nx = z.ids.findIndex((x) => !J.orders[z.t.img].includes(x));
    if (nx >= 0) { z.i = nx; refreshZoom(); } else closeZoom();
  }
};

// ---------- 結果発表 ----------
let revKey = '';
let revTimers = [];
const MEDAL = ['', '🥇', '🥈', '🥉'];
function renderReveal() {
  const g = S.g;
  const c = g.cur;
  if (!c) return;
  $('#r-no').textContent = `お手本 ${g.rev + 1}/${g.N}`;
  $('#r-judges').textContent = c.judges.length ? `判定: ${c.judges.join('・')}` : '';
  $('#r-next').textContent = g.rev + 1 < g.N ? 'つぎへ ▶' : '点数を見る ▶';
  $('#r-prev').disabled = g.rev === 0;
  const key = `${g.id}:${g.rev}`;
  if (revKey === key) return;
  revKey = key;
  revTimers.forEach(clearTimeout);
  revTimers = [];
  paintModel($('#r-model'), c.image);
  $('#r-name').textContent = `（${modelName(c.image)}）`;
  ruleTags($('#r-rules'), c.rules);
  const ol = $('#r-list');
  ol.textContent = '';
  const items = [];
  for (const e of c.entries) {
    const li = el('li', `r-item${e.place === 1 ? ' p1' : ''}`);
    li.append(el('div', 'r-place', e.missing ? '—' : `${MEDAL[e.place] || ''} ${e.place}位`));
    if (e.id) {
      const img = el('img');
      img.src = sock.artUrl(e.id);
      img.alt = `${e.name}の絵`;
      li.append(img);
    } else li.append(el('div', 'blank', '白紙（出せなかった）'));
    li.append(el('div', 'r-who', e.name));
    li.append(el('div', 'r-pts', `+${e.pts}点`));
    const by = e.ranks.map((r) => (r.solo ? '描いたのは1人だけ' : `${r.by}: ${r.r}位${r.auto ? '🎲' : ''}`)).join('　');
    if (by) li.append(el('div', 'r-by', by));
    ol.append(li);
    items.push({ li, e });
  }
  // 下の順位から1枚ずつ出す（1位は少しためる）
  const order = items.slice().reverse();
  let t = 300;
  revShowing = items;
  order.forEach(({ li, e }) => {
    if (e.place === 1) t += 700;
    revTimers.push(setTimeout(() => {
      li.classList.add('show');
      if (e.place === 1) sfx.fanfare(); else sfx.pop();
    }, t));
    t += 650;
  });
  revTimers.push(setTimeout(() => { revShowing = null; }, t));
}
let revShowing = null; // 出している途中の一覧
// 出している途中に「つぎへ」→ 先に全部見せる（早押しで飛ばさない）
function revealAll() {
  if (!revShowing) return false;
  revTimers.forEach(clearTimeout);
  revTimers = [];
  revShowing.forEach(({ li }) => li.classList.add('show'));
  revShowing = null;
  return true;
}
$('#r-prev').onclick = () => { revShowing = null; sock.emit('reveal', { dir: -1 }); };
$('#r-next').onclick = () => { if (!revealAll()) sock.emit('reveal', { dir: 1 }); };

// ---------- 点数 ----------
function standings() {
  const list = S.players.slice().sort((a, b) => b.score - a.score);
  let place = 0;
  return list.map((p, k) => {
    place = k > 0 && list[k - 1].score === p.score ? place : k + 1;
    return { ...p, place };
  });
}
function scoreTable(tbl, gains) {
  tbl.textContent = '';
  const hd = el('tr');
  for (const h of gains ? ['順位', '名前', 'この試合', '合計'] : ['順位', '名前', '合計']) hd.append(el('th', '', h));
  tbl.append(hd);
  for (const p of standings()) {
    const tr = el('tr', p.you ? 'you' : '');
    tr.append(el('td', '', `${MEDAL[p.place] || ''}${p.place}位`));
    tr.append(el('td', '', p.name + (p.connected ? '' : '（切断）')));
    if (gains) {
      const gn = gains.find((x) => x.name === p.name);
      tr.append(el('td', 'num gain', gn ? `+${gn.pts}` : '—'));
    }
    tr.append(el('td', 'num', `${p.score}点`));
    tbl.append(tr);
  }
}
function renderScore(enter) {
  const g = S.g;
  $('#sc-title').textContent = `第${g.no}試合の結果`;
  scoreTable($('#sc-table'), g.gains);
  $('#sc-next').textContent = S.matchNo >= S.matchCount ? '最終結果へ ▶' : `第${S.matchNo + 1}試合へ ▶`;
  $('#sc-end').hidden = S.matchNo >= S.matchCount;
  if (enter) sfx.done();
}
$('#sc-next').onclick = () => sock.emit('next');
$('#sc-end').onclick = () => { if (window.confirm('ここで終わって最終結果を出しますか？')) sock.emit('endGame'); };

// ---------- 最終結果 ----------
function renderFinal(enter) {
  const st = standings();
  const top = st.filter((p) => p.place === 1);
  $('#f-win').textContent = top.length ? `🏆 優勝は ${top.map((p) => p.name).join('・')}！` : '';
  const pod = $('#f-podium');
  pod.textContent = '';
  const byPlace = (n) => st.filter((p) => p.place === n);
  for (const n of [2, 1, 3]) {
    const ps = byPlace(n);
    if (!ps.length) continue;
    const d = el('div', `pod p${n}`);
    d.append(el('div', 'nm', ps.map((p) => p.name).join('・')), el('div', 'st', MEDAL[n]));
    pod.append(d);
  }
  scoreTable($('#f-table'), null);
  if (enter) sfx.fanfare();
}
$('#f-again').onclick = () => sock.emit('again');

// ---------- 時計 ----------
setInterval(() => {
  const now = Date.now();
  drawTick(now);
  judgeTick(now);
}, 100);

window.utsushie = { VERSION, pad, get state() { return S; } };
