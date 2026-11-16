// ウツシエ: 描くキャンバス（自前で点を塗る・ふちをぼかさない）
//   ・ふちをぼかさないので、塗りつぶしがぴったり効く／「何ピクセル塗ったか」がそのままインクの量になる
//   ・縛り（rules.js の RULES）はここで効かせる: インク・色の数・筆・直線だけ・ドット絵・手数・一筆書き・手ぶれ・鏡
//   ・できた絵は PNG（SIZE×SIZE）でサーバーに送る
import { PALETTE } from './shared/models.js?v=0.5.0';
import { INK_RATE, MOVES_MAX } from './shared/rules.js?v=0.5.0';

export const SIZE = 480;
export const SIZES = [4, 10, 20, 40];   // 筆の太さ（直径ピクセル）
export const WHITE = 2;                 // パレットの白
const ERASER_SIZE = 2;                  // 消しゴムは「太い」と同じ太さから
export const INK_MAX = Math.round(SIZE * SIZE * INK_RATE);
export const GRID = 16;                 // ドット絵のマスの数
const CELL = SIZE / GRID;
const UNDO_MAX = 24;

const toU32 = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};
const COLORS = PALETTE.map((p) => toU32(p.hex));
const WHITE32 = COLORS[WHITE];

// 円の筆の形（中心からのずれの一覧）
const discs = new Map();
function disc(d) {
  if (discs.has(d)) return discs.get(d);
  const r = d / 2;
  const out = [];
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r + 0.25) out.push(x, y);
  if (!out.length) out.push(0, 0);
  const a = Int16Array.from(out);
  discs.set(d, a);
  return a;
}

export class Pad {
  /**
   * @param {HTMLCanvasElement} canvas 描くキャンバス（中身は SIZE×SIZE）
   * @param {HTMLCanvasElement} over   上に重ねるキャンバス（直線の下書き・ドット絵のマス目）
   */
  constructor(canvas, over, { onChange } = {}) {
    this.canvas = canvas;
    this.over = over;
    canvas.width = canvas.height = SIZE;
    over.width = over.height = SIZE;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.octx = over.getContext('2d');
    this.img = this.ctx.createImageData(SIZE, SIZE);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.onChange = onChange || (() => {});
    this.rules = [];
    this.tool = 'pen';   // pen | line | fill | eraser
    this.color = 0;
    this.size = 1;
    this.enabled = false;
    this.undoStack = [];
    this.ptr = null;
    this.jit = { x: 0, y: 0 };
    this.reset();
    over.addEventListener('pointerdown', (e) => this.down(e));
    over.addEventListener('pointermove', (e) => this.move(e));
    over.addEventListener('pointerup', (e) => this.up(e));
    over.addEventListener('pointercancel', (e) => this.up(e));
    over.addEventListener('lostpointercapture', (e) => this.up(e));
    over.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- 状態 ----------
  reset() {
    this.buf.fill(WHITE32);
    this.ink = 0;
    this.moves = 0;
    this.used = [];        // 使った色（消しゴムは数えない）
    this.undoStack = [];
    this.ptr = null;
    this.flush();
    this.drawOver();
    this.onChange(this);
  }

  // 筆・太さ・色をはじめの状態（ペン・ふつう・黒）に戻す。お題1枚ごとに呼ぶ
  //   2026-11-16 ユーザー「直線縛りのあとって直線の状態のまま？元に戻したほうが良い」
  //   （縛りで変わった道具が次のお題まで残らないように。縛りはこのあと setRules で当てる）
  resetTools() {
    this.tool = 'pen';
    this.size = 1;
    this.color = 0;
  }

  setRules(rules) {
    this.rules = Array.isArray(rules) ? rules.slice() : [];
    const has = (id) => this.rules.includes(id);
    if (has('thin')) this.size = 0;
    if (has('fat')) this.size = 3;
    if (has('mono')) this.color = 0;
    if (has('line') && this.tool === 'pen') this.tool = 'line';
    if (!this.toolOk(this.tool)) this.tool = has('line') ? 'line' : 'pen';
    this.drawOver();
    this.onChange(this);
  }

  has(id) { return this.rules.includes(id); }

  // その道具を使えるか
  toolOk(t) {
    if (t === 'pen') return !this.has('line');
    if (t === 'line') return !this.has('one');
    if (t === 'fill') return !this.has('thin') && !this.has('fat') && !this.has('one');
    if (t === 'eraser') return true;
    return false;
  }

  sizeOk(i) {
    if (this.has('pixel')) return false;
    if (this.has('thin')) return i === 0;
    if (this.has('fat')) return i === 3;
    return true;
  }

  // その色を使えるか
  colorOk(i) {
    if (this.has('mono')) return i === 0;
    if (this.has('col2')) return this.used.length < 2 || this.used.includes(i);
    return true;
  }

  movesLeft() {
    if (this.has('one')) return Math.max(0, 1 - this.moves);
    if (this.has('moves')) return Math.max(0, MOVES_MAX - this.moves);
    return Infinity;
  }

  inkLeft() { return this.has('ink') ? Math.max(0, INK_MAX - this.ink) : Infinity; }

  setTool(t) { if (this.toolOk(t)) { this.tool = t; this.onChange(this); } }
  setColor(i) {
    if (!this.colorOk(i)) return;
    this.color = i;
    if (this.tool === 'eraser') this.tool = this.has('line') ? 'line' : 'pen';
    this.onChange(this);
  }
  setSize(i) { if (this.sizeOk(i)) { this.size = i; this.onChange(this); } }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled && this.ptr) this.finish();
  }

  // ---------- 取り消し ----------
  snapshot() {
    this.undoStack.push({ buf: this.buf.slice(), ink: this.ink, moves: this.moves, used: this.used.slice() });
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
  }

  undo() {
    if (!this.enabled) return;
    const s = this.undoStack.pop();
    if (!s) return;
    this.buf.set(s.buf);
    this.ink = s.ink;
    this.moves = s.moves;
    this.used = s.used;
    this.flush();
    this.onChange(this, 'undo');
  }

  clearAll() {
    if (!this.enabled) return;
    this.snapshot();
    this.buf.fill(WHITE32);
    this.ink = 0;
    this.moves = 0;
    this.used = [];
    this.flush();
    this.onChange(this, 'clear');
  }

  // ---------- 画面へ ----------
  flush(x0 = 0, y0 = 0, x1 = SIZE, y1 = SIZE) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(SIZE, Math.ceil(x1)); y1 = Math.min(SIZE, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

  drawOver(preview) {
    const o = this.octx;
    o.clearRect(0, 0, SIZE, SIZE);
    if (this.has('pixel')) {
      o.strokeStyle = 'rgba(0,0,0,0.12)';
      o.lineWidth = 1;
      o.beginPath();
      for (let k = 1; k < GRID; k++) {
        o.moveTo(k * CELL + 0.5, 0); o.lineTo(k * CELL + 0.5, SIZE);
        o.moveTo(0, k * CELL + 0.5); o.lineTo(SIZE, k * CELL + 0.5);
      }
      o.stroke();
    }
    if (preview) {
      o.strokeStyle = this.tool === 'eraser' ? '#bbbbbb' : PALETTE[this.color].hex;
      o.lineWidth = this.diameter();
      o.lineCap = 'round';
      o.globalAlpha = 0.7;
      o.beginPath();
      o.moveTo(preview[0], preview[1]);
      o.lineTo(preview[2], preview[3]);
      o.stroke();
      o.globalAlpha = 1;
    }
  }

  // ---------- 塗る ----------
  diameter() {
    if (this.tool === 'eraser') return SIZES[Math.max(ERASER_SIZE, this.has('thin') ? 0 : this.size)] * (this.has('thin') ? 2 : 1);
    return SIZES[this.size];
  }

  paintColor() { return this.tool === 'eraser' ? WHITE32 : COLORS[this.color]; }

  // 1ピクセル塗る。インクが尽きたら false
  put(i, col, free) {
    if (this.buf[i] === col) return true;
    if (!free && this.has('ink')) {
      if (this.ink >= INK_MAX) { this.inkOut = true; return false; }
      this.ink++;
    }
    this.buf[i] = col;
    return true;
  }

  stamp(cx, cy) {
    const col = this.paintColor();
    const free = this.tool === 'eraser';
    if (this.has('pixel')) {
      const gx = Math.floor(cx / CELL), gy = Math.floor(cy / CELL);
      if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return;
      const x0 = gx * CELL, y0 = gy * CELL;
      for (let y = y0; y < y0 + CELL; y++) for (let x = x0; x < x0 + CELL; x++) if (!this.put(y * SIZE + x, col, free)) return;
      this.dirty(x0, y0, x0 + CELL, y0 + CELL);
      return;
    }
    const d = disc(this.diameter());
    const x = Math.round(cx), y = Math.round(cy);
    for (let k = 0; k < d.length; k += 2) {
      const px = x + d[k], py = y + d[k + 1];
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
      if (!this.put(py * SIZE + px, col, free)) break;
    }
    const r = this.diameter() / 2 + 1;
    this.dirty(x - r, y - r, x + r, y + r);
  }

  segment(x0, y0, x1, y1) {
    const step = this.has('pixel') ? CELL / 3 : Math.max(1, this.diameter() / 5);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      if (this.inkOut) return;
      this.stamp(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    }
  }

  dirty(x0, y0, x1, y1) {
    const d = this.dirtyBox;
    if (!d) { this.dirtyBox = [x0, y0, x1, y1]; this.queueFlush(); return; }
    d[0] = Math.min(d[0], x0); d[1] = Math.min(d[1], y0); d[2] = Math.max(d[2], x1); d[3] = Math.max(d[3], y1);
  }

  queueFlush() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const d = this.dirtyBox;
      this.dirtyBox = null;
      if (d) this.flush(d[0], d[1], d[2], d[3]);
    });
  }

  // 塗りつぶし（同じ色のつながったところ）
  fill(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const col = this.paintColor();
    const target = this.buf[y * SIZE + x];
    if (target === col) return;
    const stack = [x, y];
    let minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const sy = stack.pop(), sx0 = stack.pop();
      let sx = sx0;
      while (sx > 0 && this.buf[sy * SIZE + sx - 1] === target) sx--;
      let upOpen = false, downOpen = false;
      for (; sx < SIZE && this.buf[sy * SIZE + sx] === target; sx++) {
        if (!this.put(sy * SIZE + sx, col, false)) { stack.length = 0; break; }
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy > 0) {
          const up = this.buf[(sy - 1) * SIZE + sx] === target;
          if (up && !upOpen) { stack.push(sx, sy - 1); upOpen = true; } else if (!up) upOpen = false;
        }
        if (sy < SIZE - 1) {
          const dn = this.buf[(sy + 1) * SIZE + sx] === target;
          if (dn && !downOpen) { stack.push(sx, sy + 1); downOpen = true; } else if (!dn) downOpen = false;
        }
      }
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
    this.flush(minX, minY, maxX + 1, maxY + 1);
  }

  // ---------- 指・マウス ----------
  pos(e) {
    const r = this.over.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * SIZE;
    const y = ((e.clientY - r.top) / r.height) * SIZE;
    if (this.has('mirror')) x = SIZE - x;
    return [Math.max(-20, Math.min(SIZE + 20, x)), Math.max(-20, Math.min(SIZE + 20, y))];
  }

  // 手ぶれ（ゆっくり動くずれ）
  shake(p) {
    if (!this.has('shake')) return p;
    const j = this.jit;
    j.x = j.x * 0.88 + (Math.random() - 0.5) * 18;
    j.y = j.y * 0.88 + (Math.random() - 0.5) * 18;
    return [p[0] + j.x, p[1] + j.y];
  }

  // 色の数の縛り: いまの色を「使った」に入れる
  markColor() {
    if (this.tool === 'eraser') return;
    if (!this.used.includes(this.color)) this.used.push(this.color);
  }

  down(e) {
    if (!this.enabled || this.ptr) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (this.tool !== 'eraser') {
      if (this.movesLeft() <= 0) { this.onChange(this, 'nomoves'); return; }
      if (!this.colorOk(this.color)) { this.onChange(this, 'nocolor'); return; }
      if (this.has('ink') && this.ink >= INK_MAX) { this.onChange(this, 'noink'); return; }
    }
    try { this.over.setPointerCapture(e.pointerId); } catch {}
    const p = this.pos(e);
    this.inkOut = false;
    if (this.tool === 'fill') {
      this.snapshot();
      this.markColor();
      this.moves++;
      this.fill(p[0], p[1]);
      this.onChange(this, this.inkOut ? 'noink' : 'stroke');
      return;
    }
    this.snapshot();
    this.ptr = { id: e.pointerId, start: p, last: this.shake(p), moved: false };
    this.jit = { x: 0, y: 0 };
    if (this.tool === 'line') { this.drawOver([p[0], p[1], p[0], p[1]]); return; }
    this.stamp(this.ptr.last[0], this.ptr.last[1]);
  }

  move(e) {
    const t = this.ptr;
    if (!t || e.pointerId !== t.id) return;
    e.preventDefault();
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    if (this.tool === 'line') {
      const p = this.pos(list[list.length - 1]);
      t.end = p;
      t.moved = true;
      this.drawOver([t.start[0], t.start[1], p[0], p[1]]);
      return;
    }
    for (const ev of list) {
      if (this.inkOut) break;
      const p = this.shake(this.pos(ev));
      this.segment(t.last[0], t.last[1], p[0], p[1]);
      t.last = p;
      t.moved = true;
    }
  }

  up(e) {
    const t = this.ptr;
    if (!t || e.pointerId !== t.id) return;
    try { this.over.releasePointerCapture(e.pointerId); } catch {}
    this.finish();
  }

  // 描いている途中の線を確定（時間切れのときも呼ぶ）
  finish() {
    const t = this.ptr;
    this.ptr = null;
    if (!t) return;
    if (this.tool === 'line') {
      const end = t.end || t.start;
      this.drawOver();
      this.stamp(t.start[0], t.start[1]);
      this.segment(t.start[0], t.start[1], end[0], end[1]);
    }
    if (this.tool !== 'eraser') { this.markColor(); this.moves++; }
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    const d = this.dirtyBox;
    this.dirtyBox = null;
    if (d) this.flush(d[0], d[1], d[2], d[3]);
    this.onChange(this, this.inkOut ? 'noink' : 'stroke');
  }

  // ---------- 書き出し・控え ----------
  isBlank() {
    for (let i = 0; i < this.buf.length; i++) if (this.buf[i] !== WHITE32) return false;
    return true;
  }

  toBlob() {
    this.flush();
    return new Promise((res) => this.canvas.toBlob((b) => res(b), 'image/png'));
  }

  // 読み込み直しに備えた控え（sessionStorage へ）
  save() {
    this.flush();
    return { png: this.canvas.toDataURL('image/png'), ink: this.ink, moves: this.moves, used: this.used };
  }

  async restore(s) {
    if (!s || typeof s.png !== 'string') return false;
    const im = new Image();
    await new Promise((res) => { im.onload = res; im.onerror = res; im.src = s.png; });
    if (!im.naturalWidth) return false;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0, SIZE, SIZE);
    const d = new Uint32Array(x.getImageData(0, 0, SIZE, SIZE).data.buffer);
    this.buf.set(d);
    this.ink = Number(s.ink) || 0;
    this.moves = Number(s.moves) || 0;
    this.used = Array.isArray(s.used) ? s.used.filter((n) => Number.isInteger(n)) : [];
    this.undoStack = [];
    this.flush();
    this.onChange(this);
    return true;
  }
}
