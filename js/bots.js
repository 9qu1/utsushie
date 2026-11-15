// ウツシエ: テスト用ボット（2026-11-16 ユーザー「BOTで部屋を埋めれる方法ある？テストプレイしたいから」）
//   ・ホストの画面の中で動く（ボット1人＝WebSocket 1本）。ホストがこの画面を開いている間だけ動く
//   ・描く: お手本の形を少しずらす・描き忘れる・色をまちがえる・粗いマスで描く（うまさ skill はボットごとにちがう）
//   ・判定: 絵を小さくしてお手本と色の差をくらべ、似ている順に並べる（うまくないボットほど迷う）
//   ・サーバーには join のときに bot: true を送る（名前の横に🤖・ホストは渡さない）
//   ・読み込み直しても続くよう、ボットの pid と名前を sessionStorage に控える
import { NET } from './net.js?v=0.4.0';
import { PALETTE, makeModel, renderModel } from './shared/models.js?v=0.4.0';

const SIZE = 480;
const BASE_NAME = 'ボット';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newPid = () => `bot${crypto.getRandomValues(new Uint32Array(3)).join('').slice(0, 20)}`;
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}

// ボットの絵（うまさ skill 0〜1）。縛り rules にもだいたい合わせる
//   黒一色 → 黒と白だけ／2色まで → はじめの2色にまとめる／インク少なめ → 背景をぬらない／ドット絵 → 16マス
//   見えない系・手もと系・時間・手数の縛り → そのぶん下手になる
const BLACK = 0, WHITE = 2;
export function botPicture(image, skill, rules = []) {
  const has = (id) => rules.includes(id);
  const m = makeModel(image);
  let k = 1 - skill;
  if (has('peek') || has('glance') || has('blind')) k += 0.3;
  if (['speed', 'shake', 'mirror', 'one', 'moves', 'line', 'fat'].some(has)) k += 0.15;
  k = Math.min(1, k);
  const j = (a) => (Math.random() - 0.5) * 2 * k * a;
  const prims = [];
  for (const p of m.prims) {
    if (p.t === 'bg' ? Math.random() < k * 0.45 : Math.random() < k * 0.3) continue; // 描き忘れ
    const q = JSON.parse(JSON.stringify(p));
    for (const key of ['x', 'y']) if (typeof q[key] === 'number') q[key] += j(9);
    if (Array.isArray(q.p)) q.p = q.p.map((v) => v + j(9));
    for (const key of ['w', 'h', 'r', 'rx', 'ry']) if (typeof q[key] === 'number') q[key] *= 1 + j(0.35);
    if (Math.random() < k * 0.25) q.c = Math.floor(Math.random() * PALETTE.length); // 色をまちがえる
    if (has('ink') && q.t === 'bg') continue; // インクが足りないので背景はぬらない
    prims.push(q);
  }
  if (has('mono')) for (const q of prims) q.c = q.c === WHITE ? WHITE : BLACK;
  if (has('col2')) {
    const two = [...new Set(prims.map((q) => q.c).filter((c) => c !== WHITE))].slice(0, 2);
    for (const q of prims) if (q.c !== WHITE && !two.includes(q.c)) q.c = two[q.c % two.length] ?? BLACK;
  }
  const tf = { ...m.tf, dx: m.tf.dx + j(6), dy: m.tf.dy + j(6), s: m.tf.s * (1 + j(0.15)) };
  // 粗いマスで描いて引きのばす（手描きっぽいガタガタ）
  const lo = has('pixel') ? 16 : Math.round(56 + skill * 150);
  const small = canvas(lo);
  const sx = small.getContext('2d');
  sx.fillStyle = '#fff';
  sx.fillRect(0, 0, lo, lo);
  renderModel(sx, { prims, tf }, lo);
  const big = canvas(SIZE);
  const bx = big.getContext('2d');
  bx.imageSmoothingEnabled = false;
  bx.drawImage(small, 0, 0, SIZE, SIZE);
  return new Promise((res) => big.toBlob((b) => res(b), 'image/png'));
}

// 小さくした絵の色の並び
function pixels(draw, n = 40) {
  const c = canvas(n);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff';
  x.fillRect(0, 0, n, n);
  draw(x, n);
  return x.getImageData(0, 0, n, n).data;
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image'));
    im.src = url;
  });
}

// 似ている順（色の差の小さい順）。うまくないボットほどゆらぐ
async function rankBySimilarity(task, skill, artUrl) {
  const model = pixels((x, n) => renderModel(x, makeModel(task.image), n));
  const scored = await Promise.all(task.arts.map(async (id) => {
    try {
      const im = await loadImage(artUrl(id));
      const d = pixels((x, n) => x.drawImage(im, 0, 0, n, n));
      let diff = 0;
      for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - model[i]) + Math.abs(d[i + 1] - model[i + 1]) + Math.abs(d[i + 2] - model[i + 2]);
      return { id, v: diff * (1 + (Math.random() - 0.5) * (1 - skill) * 0.9) };
    } catch {
      return { id, v: Math.random() * 1e9 };
    }
  }));
  return scored.sort((a, b) => a.v - b.v).map((x) => x.id);
}

class Bot {
  constructor(code, { pid, name, skill }, onChange) {
    this.code = code;
    this.pid = pid;
    this.name = name;
    this.skill = skill;
    this.onChange = onChange;
    this.st = null;
    this.done = new Set();
    this.alive = true;
    this.err = '';
    const s = NET.create();
    this.sock = s;
    s.on('connect', () => {
      s.emit('rejoin', { pid }, (res) => {
        if (res && res.ok) return;
        s.emit('join', { name, pid, bot: true }, (r2) => {
          if (r2 && r2.ok) return;
          this.err = (r2 && r2.err) || '入れなかった';
          this.stop(false);
        });
      });
    });
    s.on('state', (st) => this.onState(st));
    s.on('roomGone', () => this.stop(false));
    s.open(code);
  }

  onState(st) {
    this.st = st;
    const g = st.g;
    if (!this.alive || !g) return;
    if (st.phase === 'draw' && g.role === 'draw' && !g.submitted) {
      const key = `d:${g.id}:${g.slot}`;
      if (!this.done.has(key)) {
        this.done.add(key);
        // 描く時間: 1枚の時間の2〜7割（長くても15秒）。描きはじめの合図（スロット・3・2・1）のあとから数える
        const total = g.sec * 1000;
        const think = Math.min(total * 0.85, Math.max(1500, total * (0.2 + Math.random() * 0.5)), 15000);
        setTimeout(() => this.draw(g.id, g.slot, g.image, g.rules || []), g.startInMs + think);
      }
    }
    if (st.phase === 'judge') {
      for (const t of g.tasks || []) {
        const key = `j:${g.id}:${t.img}`;
        if (t.done || this.done.has(key)) continue;
        this.done.add(key);
        setTimeout(() => this.judge(g.id, t), 1500 + Math.random() * 3500);
      }
    }
  }

  async draw(gid, slot, image, rules) {
    const st = this.st;
    if (!this.alive || !st || st.phase !== 'draw' || st.g.id !== gid || st.g.slot !== slot || st.g.submitted) return;
    const blob = await botPicture(image, this.skill, rules);
    for (let k = 0; k < 3 && this.alive; k++) {
      const r = await this.sock.uploadArt({ blob, pid: this.pid, tok: st.you.tok, game: gid, slot });
      if (r.ok || (!r.net && r.status && r.status < 500)) break;
      await sleep(800 * (k + 1));
    }
  }

  async judge(gid, t) {
    if (!this.alive || !this.st || this.st.phase !== 'judge' || this.st.g.id !== gid) return;
    const order = await rankBySimilarity(t, this.skill, (id) => this.sock.artUrl(id));
    if (this.alive) this.sock.emit('submitRank', { img: t.img, order }, () => {});
  }

  // leave: 部屋から出る（ロビーなら席も消える）。false なら接続を閉じるだけ
  stop(leave = true) {
    if (!this.alive) return;
    this.alive = false;
    if (leave) this.sock.leave();
    else this.sock.close();
    this.onChange();
  }
}

export class Bots {
  constructor({ onChange } = {}) {
    this.list = [];
    this.code = null;
    this.onChange = onChange || (() => {});
  }

  get count() { return this.list.filter((b) => b.alive).length; }
  key() { return `us-bots:${this.code}`; }

  save() {
    if (!this.code) return;
    store.set(this.key(), this.list.filter((b) => b.alive).map(({ pid, name, skill }) => ({ pid, name, skill })));
  }

  changed() {
    this.list = this.list.filter((b) => b.alive);
    this.save();
    this.onChange(this);
  }

  // この部屋のボットを読み込み直しのあとに起こす
  restore(code) {
    if (this.code === code && this.list.length) return;
    this.clear(false);
    this.code = code;
    const saved = store.get(this.key()) || [];
    for (const b of saved) {
      if (b && typeof b.pid === 'string' && typeof b.name === 'string') this.list.push(new Bot(code, b, () => this.changed()));
    }
    this.onChange(this);
  }

  // 1人入れる（taken: 部屋にもういる名前）
  add(code, taken) {
    if (this.code !== code) this.restore(code);
    const used = new Set([...(taken || []), ...this.list.map((b) => b.name)]);
    let n = 1;
    while (used.has(`${BASE_NAME}${n}`)) n++;
    const info = { pid: newPid(), name: `${BASE_NAME}${n}`, skill: 0.25 + Math.random() * 0.65 };
    this.list.push(new Bot(code, info, () => this.changed()));
    this.save();
    this.onChange(this);
  }

  removeOne() {
    const b = this.list[this.list.length - 1];
    if (b) b.stop(true);
  }

  // 全部外す（leave=false なら接続を閉じるだけ＝この画面を離れるとき）
  clear(leave = true) {
    for (const b of this.list) b.stop(leave);
    this.list = [];
    if (this.code && leave) store.set(this.key(), []);
    this.onChange(this);
  }
}
