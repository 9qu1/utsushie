// ウツシエ: ルールの決まり（サーバー src/room.js と画面 public/js/app.js で同じものを使う）
//
// 1試合の流れ
//   ・お手本は「試合に出る人数」と同じ枚数（N 枚）。1枚ずつ順番に、みんなで同時に描く
//   ・1枚ごとに判定する人が J 人（試合ごとにホストが決める・1〜N-2）。その絵を判定する人は、その絵を描かない（休けい）
//   ・席の番号で回すので、だれもが「描く N-J 枚・判定する J 枚」になる
//   ・全部描きおわったら、まとめて判定（似ている順に並べる）→ 結果発表 → 点数
//
// 点数: 判定する人1人の並べ方ごとに 1位 3点・2位 2点・3位 1点（最下位はいつも 0点）

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
// ルーレットの1回ぶん（1〜2個・一緒に選べる組・used に出たものは後まわし）
export function rollRules(used, rnd = Math.random) {
  return pickRules(rnd() < ROLL_TWO ? 2 : 1, used, rnd);
}

// 1枚の時間（秒）。目盛りで 10〜300秒を5秒きざみ（2026-11-16 ユーザー「メモリで10秒から300秒で選べるように」）
export const TIME_MIN = 10;
export const TIME_MAX = 300;
export const TIME_STEP = 5;
export const TIME_MARKS = [10, 60, 120, 180, 240, 300]; // 目盛りに書く数字
// 受け取った秒を範囲と5秒きざみにそろえる（数字でなければ null）
export function cleanSec(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n / TIME_STEP) * TIME_STEP;
  return Math.max(TIME_MIN, Math.min(TIME_MAX, r));
}
// 30 → 30秒・60 → 1分・90 → 1分30秒
export function fmtSec(sec) {
  const m = Math.floor(sec / 60), x = sec % 60;
  if (!m) return `${x}秒`;
  return x ? `${m}分${x}秒` : `${m}分`;
}
export const MATCH_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10];
export const KINDS = [
  { id: 'mix', name: 'ミックス' },
  { id: 'illust', name: 'イラスト' },
  { id: 'photo', name: 'リアル' },   // 写真のような絵（2026-11-16 ユーザー「リアルな絵とかもあるように」）
  { id: 'shape', name: '図形' },
];
// 縛りの決め方（2026-11-16 ユーザー「ラウンドごとにランダムで縛りが出る・スロットの演出でくるくるって1〜2個」）
//   roulette … お題1枚ごとにスロットが回って 1〜2個（いちばんはじめ）
//   none     … 縛りなし
//   manual   … ホストが選んだ縛り（3つまで）を試合のあいだずっと
export const PICKS = [
  { id: 'roulette', name: '🎰 ルーレット（1枚ごと）' },
  { id: 'none', name: '縛りなし' },
  { id: 'manual', name: '自分でえらぶ（試合ずっと）' },
];
export const MAX_PICK = 3;      // 「自分でえらぶ」で選べる数（2026-11-16 ユーザー「3つまで」）
export const SPIN_MS = 3000;   // スロットが回っている時間（このあと 3・2・1）
export const ROLL_TWO = 0.45;  // ルーレットで2個になる割合
export const SPEED_SEC = 8;
export const PEEK_SEC = 5;
export const GLANCE_TIMES = 3;
export const GLANCE_MS = 1500;
export const MOVES_MAX = 8;
export const INK_RATE = 0.22; // キャンバスの何割まで塗れるか

// 縛り。cat が同じものは同時に選べない
export const RULES = [
  { id: 'ink', cat: 'ink', icon: '🫙', name: 'インク少なめ', desc: '塗れる量に限りがある。ゲージがなくなったら描けない' },
  { id: 'col2', cat: 'color', icon: '🎨', name: '2色まで', desc: '使える色は、さいしょに使った2色だけ（消しゴムは使える）' },
  { id: 'mono', cat: 'color', icon: '⚫', name: '黒一色', desc: '黒だけで描く（消しゴムは使える）' },
  { id: 'thin', cat: 'tool', icon: '✏️', name: '細ペンだけ', desc: 'いちばん細いペンだけ。塗りつぶしも使えない' },
  { id: 'fat', cat: 'tool', icon: '🖌️', name: '極太筆だけ', desc: 'すごく太い筆だけ。塗りつぶしも使えない' },
  { id: 'line', cat: 'tool', icon: '📏', name: '直線だけ', desc: 'まっすぐな線しか引けない（塗りつぶしは使える）' },
  { id: 'pixel', cat: 'tool', icon: '👾', name: 'ドット絵', desc: '16×16 のマス目でしか描けない' },
  { id: 'one', cat: 'count', icon: '➰', name: '一筆書き', desc: '線は1本だけ。ペンを離したらおしまい（塗りつぶしも使えない）' },
  { id: 'moves', cat: 'count', icon: '✋', name: `${MOVES_MAX}手まで`, desc: `線と塗りつぶしは合わせて${MOVES_MAX}回まで` },
  { id: 'peek', cat: 'vision', icon: '👀', name: `${PEEK_SEC}秒だけ見える`, desc: `お手本は さいしょの${PEEK_SEC}秒だけ。あとは記憶で描く` },
  { id: 'glance', cat: 'vision', icon: '🫣', name: `チラ見${GLANCE_TIMES}回`, desc: `お手本はふだん隠れている。ボタンで${GLANCE_MS / 1000}秒だけ見られる（${GLANCE_TIMES}回まで）` },
  { id: 'blind', cat: 'vision', icon: '🙈', name: '自分の絵が見えない', desc: '描いている自分の絵が見えない。時間切れで答え合わせ' },
  { id: 'speed', cat: 'time', icon: '⚡', name: `${SPEED_SEC}秒勝負`, desc: `1枚 ${SPEED_SEC}秒しかない` },
  { id: 'shake', cat: 'motion', icon: '〰️', name: '手がふるえる', desc: '線がぶるぶるふるえる' },
  { id: 'mirror', cat: 'motion', icon: '🪞', name: '鏡のペン', desc: 'ペンが左右反対に動く' },
];
export const RULE_IDS = RULES.map((r) => r.id);
export const ruleOf = (id) => RULES.find((r) => r.id === id) || null;

// 一緒に選べないもの（cat が同じもの＋下の組）
const BAD_PAIRS = [['one', 'line'], ['one', 'pixel']];
export function compatible(a, b) {
  if (a === b) return false;
  const ra = ruleOf(a), rb = ruleOf(b);
  if (!ra || !rb || ra.cat === rb.cat) return false;
  return !BAD_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// 選んだ縛りを整える（知らないもの・ぶつかるものを落として MAX_PICK まで）
export function cleanRules(list) {
  const out = [];
  for (const id of Array.isArray(list) ? list : []) {
    if (typeof id !== 'string' || !RULE_IDS.includes(id)) continue;
    if (out.length >= MAX_PICK) break;
    if (out.every((x) => compatible(x, id))) out.push(id);
  }
  return out;
}

// おまかせ。この部屋でまだ出ていないものから選ぶ（全部出たら一巡）
export function pickRules(n, used, rnd = Math.random) {
  const out = [];
  let pool = RULE_IDS.filter((id) => !(used || []).includes(id));
  if (pool.length < n * 2) pool = RULE_IDS.slice();
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const id = pool[Math.floor(rnd() * pool.length)];
    if (out.every((x) => compatible(x, id))) out.push(id);
  }
  return out;
}

// 1枚の時間（秒）
export const slotSeconds = (sec, rules) => ((rules || []).includes('speed') ? SPEED_SEC : sec);

// 席 seat の人は、お手本 i を判定するか（N 人・判定 J 人）
export const isJudgeOf = (seat, i, N, J) => (((seat - i) % N) + N) % N < J;
// お手本 i を判定する席
export const judgeSeats = (i, N, J) => Array.from({ length: J }, (_, k) => (i + k) % N);
// お手本 i を描く席
export const drawerSeats = (i, N, J) => Array.from({ length: N - J }, (_, k) => (i + J + k) % N);

// 判定者の数として選べる最大
export const maxJudges = (N) => Math.max(1, N - 2);
export const clampJudges = (J, N) => Math.max(1, Math.min(maxJudges(N), Math.floor(Number(J) || 1)));

// 判定1人の並べ方で、r 位（1から）が何点か（D 枚を並べたとき）。最下位は 0点
export const rankPoints = (r, D) => (r >= 1 && r <= 3 && r < D ? [3, 2, 1][r - 1] : 0);

// 判定の時間（ミリ秒）。判定する枚数 J・1枚あたり並べる絵 D
export const judgeTimeMs = (J, D) => (30 + J * (12 + 6 * D)) * 1000;
