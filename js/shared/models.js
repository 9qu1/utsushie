// ウツシエ: お手本の絵を作る（種 seed から毎回同じ絵ができる）
//   サーバーは「種類・どの絵・種」だけ決めて送る。絵を描くのは画面（renderModel）
//   色はキャンバスのパレットと同じ16色だけを使う（同じ色で描けるように）
//   座標は 0〜100 の正方形。全体を少しずらす・大きさを変える・左右反転で、同じ絵でも毎回ちがう見た目に
//   リアル（k: 'photo'）は形ではなく画像ファイル（shared/photos.js）。描くのは画面の model-view.js
import { photoName } from './photos.js?v=0.6.2';

export const PALETTE = [
  { hex: '#222222', name: '黒' },
  { hex: '#9E9E9E', name: '灰色' },
  { hex: '#FFFFFF', name: '白' },
  { hex: '#E53935', name: '赤' },
  { hex: '#F48FB1', name: 'ピンク' },
  { hex: '#FB8C00', name: 'オレンジ' },
  { hex: '#FDD835', name: '黄色' },
  { hex: '#FFCC99', name: 'はだ色' },
  { hex: '#8D5524', name: '茶色' },
  { hex: '#9CCC65', name: '黄緑' },
  { hex: '#2E7D32', name: '緑' },
  { hex: '#81D4FA', name: '水色' },
  { hex: '#1E88E5', name: '青' },
  { hex: '#1A237E', name: '紺' },
  { hex: '#8E24AA', name: '紫' },
  { hex: '#4E342E', name: 'こげ茶' },
];
const [K, GY, W, RD, PK, OR, YL, SK, BR, LG, GR, LB, BL, NV, PU, DB] = PALETTE.map((_, i) => i);

// ---------- 乱数（種から決まる） ----------
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const R = {
    f,
    num: (a0, b0) => a0 + f() * (b0 - a0),
    int: (a0, b0) => a0 + Math.floor(f() * (b0 - a0 + 1)),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    chance: (p) => f() < p,
    // ちがう色を選ぶ
    other: (arr, ...not) => {
      const list = arr.filter((c) => !not.includes(c));
      return list.length ? list[Math.floor(f() * list.length)] : arr[0];
    },
  };
  return R;
}

// ---------- 形 ----------
const bg = (c) => ({ t: 'bg', c });
const rect = (x, y, w, h, c, r = 0) => ({ t: 'rect', x, y, w, h, c, r });
const circ = (x, y, r, c) => ({ t: 'circ', x, y, r, c });
const ell = (x, y, rx, ry, c, rot = 0) => ({ t: 'ell', x, y, rx, ry, c, rot });
const poly = (p, c) => ({ t: 'poly', p, c });
const line = (p, w, c) => ({ t: 'line', p, w, c });
const arc = (x, y, r, a0, a1, w, c) => ({ t: 'arc', x, y, r, a0, a1, w, c });
const pie = (x, y, r, a0, a1, c) => ({ t: 'pie', x, y, r, a0, a1, c });
function star(x, y, r, c, n = 5, inner = 0.45, rot = -90) {
  const p = [];
  for (let k = 0; k < n * 2; k++) {
    const rr = k % 2 ? r * inner : r;
    const a = ((rot + (k * 180) / n) * Math.PI) / 180;
    p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  return poly(p, c);
}

// ---------- イラスト（1つ5〜12個の形・30秒で描ける程度） ----------
const SKY = [LB, LB, W, YL, PK];
const ILLUST = [
  ['house', '家', (R) => {
    const sky = R.pick([LB, LB, W, YL]);
    const wall = R.other([W, YL, SK, PK, OR], sky);
    const roof = R.other([RD, BL, BR, NV, PU, GR], wall);
    const x = R.int(22, 30), w = R.int(42, 50), y = R.int(44, 50), h = 84 - y;
    const out = [bg(sky), rect(0, 84, 100, 16, R.pick([LG, GR])), rect(x, y, w, h, wall),
      poly([x - 7, y, x + w / 2, y - R.int(22, 30), x + w + 7, y], roof),
      rect(x + w * 0.14, y + h * 0.42, w * 0.24, h * 0.58, R.other([BR, DB, RD, BL], wall, roof)),
      rect(x + w * 0.54, y + h * 0.18, w * 0.3, h * 0.3, sky === LB ? W : LB)];
    if (sky !== YL && R.chance(0.6)) out.push(circ(84, 14, 8, R.pick([YL, OR])));
    return out;
  }],
  ['tree', '木', (R) => {
    const sky = R.pick(SKY);
    const leaf = R.other([GR, LG, GR, OR, PK], sky);
    const out = [bg(sky), rect(0, 82, 100, 18, R.other([LG, GR, BR], leaf)), rect(44, 50, 12, 34, R.pick([BR, DB])),
      circ(50, 36, 21, leaf), circ(35, 47, 14, leaf), circ(65, 47, 14, leaf)];
    if (R.chance(0.6)) {
      const fruit = R.other([RD, OR, YL, PU], leaf);
      out.push(circ(42, 32, 3.5, fruit), circ(58, 40, 3.5, fruit), circ(36, 50, 3.5, fruit), circ(62, 26, 3.5, fruit));
    }
    return out;
  }],
  ['mountain', '山と太陽', (R) => {
    const sky = R.pick([LB, YL, PK, W]);
    const m1 = R.other([GR, BR, GY, PU, BL], sky);
    const m2 = R.other([GR, BR, GY, PU, BL, LG], sky, m1);
    const sx = R.int(20, 80);
    return [bg(sky), circ(sx, R.int(14, 24), 9, R.other([YL, OR, RD], sky)),
      poly([-5, 86, 34, R.int(26, 34), 74, 86], m1), poly([30, 86, 68, R.int(36, 44), 106, 86], m2),
      poly([27, 40, 34, 30, 41, 40], W), rect(0, 85, 100, 15, R.pick([LG, GR, BL]))];
  }],
  ['flower', '花', (R) => {
    const back = R.pick([LB, YL, W, LG, PK]);
    const petal = R.other([RD, PK, OR, PU, BL, YL, W], back);
    const mid = R.other([YL, OR, BR], petal);
    const n = R.int(5, 6);
    const out = [bg(back), line([50, 52, 50, 96], 3, GR), ell(41, 78, 9, 4, GR, -30), ell(59, 70, 9, 4, GR, 30)];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 - Math.PI / 2;
      out.push(circ(50 + Math.cos(a) * 14, 36 + Math.sin(a) * 14, 11, petal));
    }
    out.push(circ(50, 36, 9, mid));
    return out;
  }],
  ['fish', '魚', (R) => {
    const sea = R.pick([BL, LB, NV]);
    const body = R.other([OR, RD, YL, PK, LG], sea);
    const fin = R.other([OR, RD, YL, PK, PU, W], sea, body);
    return [bg(sea), poly([70, 50, 92, 32, 92, 68], fin), ell(46, 50, 28, 17, body), poly([40, 35, 52, 24, 58, 36], fin),
      circ(30, 45, 4.5, W), circ(30, 45, 2, K), circ(18, 26, 3, W), circ(24, 16, 2, W), circ(14, 12, 2.5, W)];
  }],
  ['cat', 'ねこ', (R) => {
    const back = R.pick([PK, LB, YL, LG]);
    const fur = R.other([OR, GY, K, W, BR, YL], back);
    const ink = fur === K ? W : K;
    const eye = fur === K ? YL : K;
    return [bg(back), poly([25, 40, 29, 12, 47, 30], fur), poly([75, 40, 71, 12, 53, 30], fur), circ(50, 54, 27, fur),
      ell(40, 50, 3.5, 5.5, eye), ell(60, 50, 3.5, 5.5, eye), poly([46, 58, 54, 58, 50, 62], PK),
      line([20, 58, 36, 61], 1.5, ink), line([20, 66, 36, 65], 1.5, ink), line([80, 58, 64, 61], 1.5, ink), line([80, 66, 64, 65], 1.5, ink)];
  }],
  ['car', '車', (R) => {
    const sky = R.pick([LB, W, YL]);
    const body = R.other([RD, BL, YL, GR, OR, PU, PK], sky);
    return [bg(sky), rect(0, 76, 100, 24, GY), rect(10, 86, 14, 3, W), rect(44, 86, 14, 3, W), rect(78, 86, 14, 3, W),
      rect(14, 50, 72, 20, body, 4), rect(30, 36, 38, 18, body, 5), rect(34, 40, 14, 10, LB), rect(52, 40, 12, 10, LB),
      circ(31, 72, 8, K), circ(69, 72, 8, K), circ(31, 72, 3, GY), circ(69, 72, 3, GY)];
  }],
  ['rocket', 'ロケット', (R) => {
    const sky = R.pick([NV, K, PU]);
    const body = R.pick([W, GY, W]);
    const accent = R.pick([RD, BL, OR, PK]);
    const out = [bg(sky)];
    for (let k = 0; k < 6; k++) out.push(circ(R.int(5, 95), R.int(5, 95), 1.6, R.pick([W, YL])));
    out.push(poly([42, 70, 50, 92, 58, 70], R.pick([OR, YL])), poly([40, 56, 29, 74, 40, 70], accent), poly([60, 56, 71, 74, 60, 70], accent),
      rect(40, 26, 20, 46, body, 3), poly([40, 27, 50, 8, 60, 27], accent), circ(50, 42, 6, accent), circ(50, 42, 4, LB));
    return out;
  }],
  ['snowman', '雪だるま', (R) => {
    const sky = R.pick([LB, NV, BL, PU]);
    const scarf = R.pick([RD, GR, BL === sky ? OR : BL, PK]);
    return [bg(sky), rect(0, 84, 100, 16, W), circ(50, 67, 21, W), circ(50, 37, 14, W),
      rect(40, 14, 20, 12, K), rect(35, 25, 30, 3, K), circ(45, 34, 1.8, K), circ(55, 34, 1.8, K),
      poly([49, 38, 62, 40, 49, 42], OR), rect(38, 48, 24, 5, scarf), circ(50, 62, 2, K), circ(50, 72, 2, K)];
  }],
  ['umbrella', '傘', (R) => {
    const back = R.pick([LB, GY, YL, W]);
    const top = R.other([RD, BL, PU, PK, YL, GR], back);
    const out = [bg(back)];
    for (let k = 0; k < 7; k++) {
      const x = R.int(6, 94), y = R.int(6, 90);
      out.push(line([x, y, x - 3, y + 7], 1.5, BL === back ? NV : BL));
    }
    out.push(pie(50, 46, 34, 180, 360, top), line([50, 46, 50, 80], 3, K), arc(45, 80, 5, 0, 180, 3, K));
    return out;
  }],
  ['yacht', 'ヨット', (R) => {
    const sky = R.pick([LB, YL, PK]);
    const sail = R.pick([W, W, RD, YL]);
    return [bg(sky), circ(R.pick([18, 82]), 18, 8, R.other([YL, OR, RD], sky)), rect(0, 66, 100, 34, R.pick([BL, NV])),
      line([50, 18, 50, 66], 2.5, BR), poly([53, 20, 53, 60, 78, 60], sail), poly([47, 28, 47, 60, 28, 60], R.other([W, RD, YL, OR], sky, sail)),
      poly([24, 64, 76, 64, 68, 76, 32, 76], R.pick([BR, RD, W]))];
  }],
  ['apple', 'りんご', (R) => {
    const back = R.pick([YL, LB, W, PK]);
    const c = R.other([RD, LG, YL, RD], back);
    return [bg(back), circ(41, 57, 22, c), circ(59, 57, 22, c), line([50, 38, 53, 22], 3, BR), ell(62, 26, 9, 4, GR, -20), circ(37, 50, 4, W)];
  }],
  ['icecream', 'アイス', (R) => {
    const back = R.pick([PK, LB, YL, LG]);
    const s1 = R.other([PK, W, BR, LG, YL, PU], back);
    const s2 = R.other([PK, W, BR, LG, YL, OR], back, s1);
    return [bg(back), poly([35, 55, 65, 55, 50, 93], R.pick([OR, SK])), circ(50, 50, 16, s1), circ(50, 31, 14, s2),
      line([50, 18, 54, 9], 1.5, BR), circ(50, 18, 5, RD)];
  }],
  ['cake', 'ケーキ', (R) => {
    const back = R.pick([PK, LB, YL, LG]);
    const sponge = R.other([SK, BR, PK, W], back);
    const cream = R.other([W, PK], sponge);
    const cand = R.pick([BL, YL, PK, LG]);
    return [bg(back), ell(50, 85, 40, 6, W === back ? GY : W), rect(20, 56, 60, 28, sponge), rect(20, 50, 60, 9, cream),
      circ(30, 50, 4, RD), circ(50, 50, 4, RD), circ(70, 50, 4, RD), rect(37, 34, 4, 14, cand), rect(59, 34, 4, 14, cand),
      ell(39, 30, 2.4, 4, OR), ell(61, 30, 2.4, 4, OR)];
  }],
  ['night', '夜空', (R) => {
    const sky = R.pick([NV, K, PU]);
    const out = [bg(sky), circ(38, 38, 20, YL), circ(47, 31, 18, sky)];
    const n = R.int(3, 5);
    for (let k = 0; k < n; k++) out.push(star(R.int(55, 90), R.int(10, 60), R.int(4, 7), R.pick([YL, W])));
    out.push(ell(50, 108, 72, 26, R.pick([GR, DB, K === sky ? NV : K])));
    return out;
  }],
  ['mushroom', 'きのこ', (R) => {
    const back = R.pick([LG, LB, YL]);
    const cap = R.other([RD, BR, OR, PU], back);
    return [bg(back), rect(0, 82, 100, 18, R.other([GR, BR], cap)), rect(41, 52, 18, 32, R.pick([SK, W]), 5),
      pie(50, 55, 30, 180, 360, cap), circ(38, 42, 4, W), circ(54, 36, 5, W), circ(66, 47, 3.5, W)];
  }],
  ['signal', '信号', (R) => {
    const back = R.pick([LB, W, YL, PK]);
    const on = R.int(0, 2);
    const lit = [LB, YL, RD];
    const out = [bg(back), rect(47, 54, 6, 46, GY), rect(17, 30, 66, 26, R.pick([K, GY, NV]), 7)];
    [30, 50, 70].forEach((x, k) => out.push(circ(x, 43, 8, k === on ? lit[k] : DB)));
    return out;
  }],
  ['heart', 'ハート', (R) => {
    const back = R.pick([PK, W, YL, LB]);
    const c = R.other([RD, PK, PU, OR], back);
    const out = [bg(back), circ(36, 40, 17, c), circ(64, 40, 17, c), poly([20, 46, 80, 46, 50, 82], c)];
    if (R.chance(0.6)) {
      const c2 = R.other([RD, PK, PU, OR, W], back, c);
      out.push(circ(78, 16, 5, c2), circ(87, 16, 5, c2), poly([73, 18, 92, 18, 82.5, 30], c2));
    }
    return out;
  }],
  ['onigiri', 'おにぎり', (R) => {
    const back = R.pick([YL, LB, LG, PK]);
    const out = [bg(back), ell(50, 82, 38, 7, R.other([W, GY, BR], back)), line([50, 24, 78, 70, 22, 70, 50, 24], 14, W), poly([50, 24, 78, 70, 22, 70], W),
      rect(38, 56, 24, 21, K)];
    if (R.chance(0.5)) out.push(circ(50, 40, 5, RD));
    return out;
  }],
  ['clock', '時計', (R) => {
    const back = R.pick([LB, YL, PK, LG, PU]);
    const rim = R.other([RD, BL, K, BR, PU, OR], back);
    const h = R.int(0, 11), m = R.int(0, 11);
    const ah = ((h / 12) * 360 - 90) * Math.PI / 180, am = ((m / 12) * 360 - 90) * Math.PI / 180;
    return [bg(back), circ(50, 50, 33, W), arc(50, 50, 33, 0, 360, 5, rim),
      rect(48.5, 21, 3, 7, K), rect(48.5, 72, 3, 7, K), rect(21, 48.5, 7, 3, K), rect(72, 48.5, 7, 3, K),
      line([50, 50, 50 + Math.cos(ah) * 15, 50 + Math.sin(ah) * 15], 4, K), line([50, 50, 50 + Math.cos(am) * 23, 50 + Math.sin(am) * 23], 2.5, K), circ(50, 50, 3, RD)];
  }],
  ['tv', 'テレビ', (R) => {
    const back = R.pick([YL, PK, LG, LB]);
    const body = R.other([BR, RD, OR, GY, PU], back);
    const scr = R.other([LB, GR, BL, NV], body, back);
    return [bg(back), line([50, 30, 37, 12], 2, K), line([50, 30, 63, 12], 2, K), line([28, 76, 24, 86], 3, K), line([72, 76, 76, 86], 3, K),
      rect(18, 30, 64, 46, body, 6), rect(24, 36, 42, 34, scr, 4), circ(74, 45, 3.5, K), circ(74, 58, 3.5, K)];
  }],
  ['balloon', '気球', (R) => {
    const sky = R.pick([LB, YL, PK]);
    const c1 = R.other([RD, OR, PU, YL, BL], sky);
    const c2 = R.other([W, YL, BL, RD, LG], sky, c1);
    return [bg(sky), ell(20, 70, 13, 6, W), ell(82, 22, 11, 5, W), line([31, 52, 44, 72], 1.5, K), line([69, 52, 56, 72], 1.5, K),
      circ(50, 37, 24, c1), ell(50, 37, 10, 24, c2), rect(43, 72, 14, 10, BR)];
  }],
  ['penguin', 'ペンギン', (R) => {
    const back = R.pick([LB, BL, PU]);
    const body = R.pick([K, NV]);
    return [bg(back), rect(0, 86, 100, 14, W), ell(30, 58, 5, 15, body, 15), ell(70, 58, 5, 15, body, -15), ell(50, 55, 21, 31, body),
      ell(50, 61, 14, 22, W), circ(43, 39, 3, W), circ(57, 39, 3, W), circ(43, 39, 1.4, K), circ(57, 39, 1.4, K),
      poly([45, 45, 55, 45, 50, 51], OR), ell(42, 87, 6, 3, OR), ell(58, 87, 6, 3, OR)];
  }],
  ['bear', 'くま', (R) => {
    const back = R.pick([LG, LB, YL, PK]);
    const fur = R.pick([BR, OR, DB, GY]);
    return [bg(back), circ(29, 30, 11, fur), circ(71, 30, 11, fur), circ(29, 30, 6, SK), circ(71, 30, 6, SK), circ(50, 54, 28, fur),
      ell(50, 64, 13, 10, SK), ell(50, 59, 4.5, 3.2, K), circ(40, 47, 3, K), circ(60, 47, 3, K), line([50, 62, 50, 68], 1.5, K)];
  }],
  ['turtle', 'かめ', (R) => {
    const back = R.pick([LB, YL, PK]);
    const skin = R.pick([LG, GR]);
    const shell = R.other([GR, BR, OR, DB], skin, back);
    return [bg(back), rect(0, 76, 100, 24, R.pick([YL === back ? SK : YL, LG === skin ? GR : LG])), ell(30, 74, 6, 4, skin), ell(66, 74, 6, 4, skin), circ(82, 58, 9, skin),
      pie(48, 66, 30, 180, 360, shell), circ(38, 54, 5, R.other([YL, LG, OR, SK], shell)), circ(56, 50, 5, R.other([YL, LG, OR, SK], shell)), circ(84, 56, 1.8, K)];
  }],
  ['mug', 'マグカップ', (R) => {
    const back = R.pick([YL, PK, LB, LG]);
    const mug = R.other([W, RD, BL, YL, OR], back);
    const mark = R.other([RD, PK, BL, K], mug);
    return [bg(back), line([40, 32, 36, 25, 41, 19, 37, 12], 2.5, W === back ? GY : W), line([54, 32, 50, 25, 55, 19, 51, 12], 2.5, W === back ? GY : W),
      arc(66, 60, 11, -90, 90, 5, mug), rect(27, 38, 40, 44, mug, 4), circ(42, 58, 4, mark), circ(50, 58, 4, mark), poly([38.5, 60, 53.5, 60, 46, 68], mark)];
  }],
  ['robot', 'ロボット', (R) => {
    const back = R.pick([LB, YL, LG, PK]);
    const metal = R.other([GY, LB, W, OR], back);
    const eye = R.pick([YL, RD, LB]);
    return [bg(back), line([50, 10, 50, 22], 2, K), circ(50, 10, 4, RD), rect(32, 22, 36, 26, metal, 4), circ(42, 34, 4, eye), circ(58, 34, 4, eye),
      rect(42, 41, 16, 3, K), line([28, 56, 16, 70], 4, metal), line([72, 56, 84, 70], 4, metal), rect(28, 50, 44, 32, metal, 4),
      rect(40, 58, 20, 12, R.other([YL, RD, BL], metal)), rect(34, 82, 10, 12, K), rect(56, 82, 10, 12, K)];
  }],
  ['castle', 'お城', (R) => {
    const sky = R.pick([LB, PK, YL]);
    const wall = R.other([W, GY, SK], sky);
    const roof = R.other([RD, BL, PU, NV], sky);
    return [bg(sky), rect(0, 86, 100, 14, GR), rect(16, 38, 18, 48, wall), rect(66, 38, 18, 48, wall), rect(30, 50, 40, 36, wall),
      poly([13, 38, 25, 14, 37, 38], roof), poly([63, 38, 75, 14, 87, 38], roof),
      rect(32, 45, 6, 6, wall), rect(43, 45, 6, 6, wall), rect(54, 45, 6, 6, wall), rect(62, 45, 6, 6, wall),
      rect(43, 68, 14, 18, BR), circ(50, 68, 7, BR)];
  }],
  ['ghost', 'おばけ', (R) => {
    const sky = R.pick([NV, PU, K, BL]);
    const out = [bg(sky)];
    if (R.chance(0.6)) out.push(circ(82, 16, 8, YL));
    out.push(circ(50, 42, 22, W), rect(28, 42, 44, 30, W), circ(33, 72, 6, W), circ(50, 72, 6, W), circ(67, 72, 6, W),
      ell(42, 42, 3, 5, K), ell(58, 42, 3, 5, K), ell(50, 54, 4, 5, K));
    return out;
  }],
  ['whale', 'くじら', (R) => {
    const sea = R.pick([LB, BL]);
    const body = R.other([BL, NV, GY, LB, PU], sea);
    return [bg(sea), line([40, 34, 34, 22], 3, W), line([40, 34, 40, 20], 3, W), line([40, 34, 46, 22], 3, W),
      poly([70, 54, 92, 38, 88, 62], body), ell(44, 58, 32, 18, body), ell(40, 66, 22, 7, W), circ(26, 54, 2.5, K),
      rect(0, 86, 100, 14, sea === BL ? NV : BL)];
  }],
  ['watermelon', 'すいか', (R) => {
    const back = R.pick([YL, LB, PK, W]);
    const out = [bg(back), pie(50, 38, 38, 0, 180, GR), pie(50, 38, 33, 0, 180, LG), pie(50, 38, 29, 0, 180, RD)];
    [[38, 48], [50, 56], [62, 48], [44, 44], [56, 44]].forEach(([x, y]) => out.push(ell(x, y, 1.6, 2.6, K)));
    return out;
  }],
  ['chick', 'ひよこ', (R) => {
    const back = R.pick([LB, LG, PK]);
    return [bg(back), rect(0, 84, 100, 16, R.pick([GR, LG === back ? GR : LG])), line([44, 76, 44, 86], 2.5, OR), line([56, 76, 56, 86], 2.5, OR),
      circ(50, 60, 21, YL), circ(52, 35, 15, YL), ell(42, 62, 9, 6, OR), circ(57, 32, 2.5, K), poly([65, 33, 74, 37, 65, 41], OR)];
  }],
  ['gift', 'プレゼント', (R) => {
    const back = R.pick([LB, YL, PK, LG]);
    const box = R.other([RD, BL, GR, PU, PK], back);
    const rib = R.other([YL, W, PK], box, back);
    return [bg(back), rect(25, 46, 50, 40, box), rect(21, 38, 58, 10, box), rect(46, 38, 8, 48, rib),
      ell(40, 32, 10, 6, rib, -25), ell(60, 32, 10, 6, rib, 25), circ(50, 35, 4, rib)];
  }],
  ['butterfly', 'ちょうちょ', (R) => {
    const back = R.pick([LB, LG, YL, W]);
    const c1 = R.other([OR, PK, PU, BL, YL], back);
    const c2 = R.other([OR, PK, PU, BL, YL, RD], back, c1);
    return [bg(back), line([50, 30, 42, 16], 1.5, K), line([50, 30, 58, 16], 1.5, K), ell(34, 38, 16, 14, c1), ell(66, 38, 16, 14, c1),
      ell(37, 63, 11, 10, c2), ell(63, 63, 11, 10, c2), circ(32, 37, 4, W), circ(68, 37, 4, W), ell(50, 50, 3.5, 22, K)];
  }],
  ['pencil', 'えんぴつ', (R) => {
    const back = R.pick([LB, PK, LG, W]);
    const body = R.other([YL, RD, BL, GR, OR], back);
    return [bg(back), rect(10, 42, 8, 16, PK), rect(17, 42, 5, 16, GY), rect(22, 42, 50, 16, body), line([22, 50, 72, 50], 1.5, K),
      poly([72, 42, 90, 50, 72, 58], SK), poly([84, 47.3, 90, 50, 84, 52.7], K)];
  }],
  ['bus', 'バス', (R) => {
    const sky = R.pick([LB, W, PK]);
    const body = R.other([YL, RD, LG, BL, OR], sky);
    return [bg(sky), rect(0, 78, 100, 22, GY), rect(10, 38, 80, 36, body, 6),
      rect(16, 44, 13, 12, LB), rect(33, 44, 13, 12, LB), rect(50, 44, 13, 12, LB), rect(70, 44, 14, 26, LB),
      rect(10, 60, 56, 3, W), circ(28, 75, 8, K), circ(72, 75, 8, K), circ(28, 75, 3, GY), circ(72, 75, 3, GY)];
  }],
];
export const ILLUST_COUNT = ILLUST.length;
export const illustName = (k) => (ILLUST[k] ? ILLUST[k][1] : '？');

// ---------- 図形（色と形をならべただけの絵） ----------
function shapes(R) {
  const back = R.pick([W, W, YL, LB, PK, LG, K, NV]);
  const out = [bg(back)];
  const n = R.int(3, 5);
  const used = [back];
  for (let k = 0; k < n; k++) {
    const c = R.other(PALETTE.map((_, i) => i).filter((i) => i !== GY && i !== SK && i !== DB), ...used.slice(-2));
    used.push(c);
    const kind = R.pick(['circ', 'rect', 'tri', 'ring', 'bar', 'half', 'star']);
    const x = R.int(18, 82), y = R.int(18, 82);
    if (kind === 'circ') out.push(circ(x, y, R.int(9, 22), c));
    else if (kind === 'rect') { const w = R.int(14, 44), h = R.int(14, 44); out.push(rect(x - w / 2, y - h / 2, w, h, c)); }
    else if (kind === 'tri') { const s = R.int(14, 26); out.push(poly([x, y - s, x + s, y + s * 0.8, x - s, y + s * 0.8], c)); }
    else if (kind === 'ring') out.push(arc(x, y, R.int(10, 18), 0, 360, R.int(4, 7), c));
    else if (kind === 'bar') {
      const horiz = R.chance(0.5), len = R.int(20, 34);
      out.push(line(horiz ? [x - len, y, x + len, y] : [x, y - len, x, y + len], R.int(5, 9), c));
    } else if (kind === 'half') { const a = R.pick([0, 90, 180, 270]); out.push(pie(x, y, R.int(12, 20), a, a + 180, c)); }
    else out.push(star(x, y, R.int(11, 17), c));
  }
  return out;
}

// ---------- 外向け ----------
// お手本 { k: 'illust'|'shape', i: イラストの番号, s: 種 } → 形の列と全体のずらし方
export function makeModel(m) {
  const R = rng((m && m.s) || 1);
  const prims = m && m.k === 'illust' && ILLUST[m.i] ? ILLUST[m.i][2](R) : shapes(R);
  // 図形はそのまま。イラストは少しずらす・大きさを変える・左右反転
  const tf = m && m.k === 'illust'
    ? { dx: R.num(-6, 6), dy: R.num(-4, 4), s: R.num(0.9, 1.04), flip: R.chance(0.5) }
    : { dx: 0, dy: 0, s: 1, flip: false };
  return { prims, tf };
}

// お手本の名前（リアル＝写真のような絵は shared/photos.js の一覧から）
export const modelName = (m) => (m && m.k === 'illust' ? illustName(m.i) : m && m.k === 'photo' ? photoName(m.i) : m && m.k === 'own' ? m.name || '持ち込み' : '図形');

const rad = (d) => (d * Math.PI) / 180;

// キャンバスにお手本を描く（size はキャンバスの1辺のピクセル）
export function renderModel(ctx, model, size) {
  const { prims, tf } = model;
  const k = size / 100;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of prims) {
    const col = PALETTE[p.c] ? PALETTE[p.c].hex : '#000';
    if (p.t === 'bg') { ctx.fillStyle = col; ctx.fillRect(0, 0, size, size); continue; }
    ctx.save();
    // 全体の変形（真ん中を中心に）
    ctx.translate(size / 2 + tf.dx * k, size / 2 + tf.dy * k);
    ctx.scale((tf.flip ? -1 : 1) * tf.s * k, tf.s * k);
    ctx.translate(-50, -50);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.beginPath();
    switch (p.t) {
      case 'rect': {
        // 端から端までの帯（地面・海・道）は、ずらしても端まで届くようにのばす
        let { x, y, w, h } = p;
        if (x <= 0 && x + w >= 100) { x = -100; w = 300; }
        if (x <= 0 && x + w >= 100 && y + h >= 100) h += 100;
        if (p.r && ctx.roundRect) ctx.roundRect(x, y, w, h, p.r);
        else ctx.rect(x, y, w, h);
        ctx.fill();
        break;
      }
      case 'circ': ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); break;
      case 'ell': ctx.ellipse(p.x, p.y, p.rx, p.ry, rad(p.rot || 0), 0, Math.PI * 2); ctx.fill(); break;
      case 'poly':
        ctx.moveTo(p.p[0], p.p[1]);
        for (let j = 2; j < p.p.length; j += 2) ctx.lineTo(p.p[j], p.p[j + 1]);
        ctx.closePath();
        ctx.fill();
        break;
      case 'line':
        ctx.lineWidth = p.w;
        ctx.moveTo(p.p[0], p.p[1]);
        for (let j = 2; j < p.p.length; j += 2) ctx.lineTo(p.p[j], p.p[j + 1]);
        ctx.stroke();
        break;
      case 'arc': ctx.lineWidth = p.w; ctx.arc(p.x, p.y, p.r, rad(p.a0), rad(p.a1)); ctx.stroke(); break;
      case 'pie': ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, p.r, rad(p.a0), rad(p.a1)); ctx.closePath(); ctx.fill(); break;
      default:
    }
    ctx.restore();
  }
  ctx.restore();
}
