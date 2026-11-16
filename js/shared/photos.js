// ウツシエ: 「リアル」のお手本（写真のような絵）の一覧（サーバー src/room.js と画面で同じものを使う）
//   2026-11-16 ユーザー「お手本の絵はリアルな絵とかもあるようにしてほしい」
//   ・絵は Codex で作ったオリジナル（実在の作品・キャラクター・ブランドは入れない）
//   ・ファイルは public/photos/<id>.webp（600×600）。作り方は tools/make-photos.mjs
//   ・並びの番号（i）を部屋の状態に持つので、足すときは後ろに足す（途中を消したり並べかえたりしない）
export const PHOTOS = [
  { id: 'apple', name: 'りんご' },
  { id: 'cat', name: 'ねこ' },
  { id: 'fuji', name: '富士山' },
  { id: 'cake', name: 'ショートケーキ' },
  // 食べもの
  { id: 'banana', name: 'バナナ' },
  { id: 'onigiri', name: 'おにぎり' },
  { id: 'donut', name: 'ドーナツ' },
  { id: 'friedegg', name: '目玉焼き' },
  { id: 'softcream', name: 'ソフトクリーム' },
  { id: 'pizza', name: 'ピザ' },
  { id: 'watermelon', name: 'すいか' },
  { id: 'burger', name: 'ハンバーガー' },
  { id: 'sushi', name: 'おすし' },
  // 動物
  { id: 'shiba', name: '柴犬' },
  { id: 'penguin', name: 'ペンギン' },
  { id: 'panda', name: 'パンダ' },
  { id: 'goldfish', name: '金魚' },
  { id: 'chick', name: 'ひよこ' },
  { id: 'frog', name: 'カエル' },
  { id: 'ladybug', name: 'てんとう虫' },
  { id: 'flamingo', name: 'フラミンゴ' },
  { id: 'hedgehog', name: 'ハリネズミ' },
  // もの
  { id: 'mug', name: 'マグカップ' },
  { id: 'sneaker', name: 'スニーカー' },
  { id: 'clock', name: '目覚まし時計' },
  { id: 'guitar', name: 'ギター' },
  { id: 'bicycle', name: '自転車' },
  { id: 'umbrella', name: '傘' },
  { id: 'balloons', name: '風船' },
  // 自然
  { id: 'sunflower', name: 'ひまわり' },
  { id: 'tulip', name: 'チューリップ' },
  { id: 'mushroom', name: 'きのこ' },
  { id: 'cactus', name: 'サボテン' },
  { id: 'sunset', name: '夕日の海' },
  { id: 'maple', name: 'もみじ' },
  { id: 'lighthouse', name: '灯台' },
  // 乗りもの
  { id: 'car', name: '赤い車' },
  { id: 'airplane', name: '飛行機' },
  { id: 'sailboat', name: 'ヨット' },
  { id: 'firetruck', name: '消防車' },
];
export const PHOTO_COUNT = PHOTOS.length;
export const photoName = (i) => (PHOTOS[i] ? PHOTOS[i].name : '？');
export const photoPath = (i) => (PHOTOS[i] ? `photos/${PHOTOS[i].id}.webp` : '');
