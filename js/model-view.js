// ウツシエ: お手本をキャンバスに描く（イラスト・図形は形から／リアル・持ち込みは画像ファイルから）
//   画像は読み込みに少しかかるので、一度読んだものは取っておく
//   持ち込み（k: 'own'）は部屋の通信先から取る。どこから取るかは画面が setOwnUrl で教える
import { makeModel, renderModel } from './shared/models.js?v=0.6.1';
import { photoPath } from './shared/photos.js?v=0.6.1';

const cache = new Map(); // 'p:番号' / 'o:id' → Promise<HTMLImageElement>
let ownUrl = (id) => '';
export function setOwnUrl(fn) { ownUrl = fn; }

// 画像のお手本か（リアル・持ち込み）
export const isPicture = (image) => !!image && (image.k === 'photo' || image.k === 'own');

function load(key, url, cors) {
  if (!cache.has(key)) {
    const p = new Promise((res, rej) => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous'; // 通信先は別の住所。ボットが色を読めるように
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => { cache.delete(key); rej(new Error(key)); };
      im.src = url;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}
export const loadPhoto = (i) => load(`p:${i}`, photoPath(i), false);
// お手本の画像（リアル・持ち込み）
export function loadPicture(image) {
  if (image && image.k === 'own') return load(`o:${image.id}`, ownUrl(image.id), true);
  return loadPhoto(image.i);
}

// ctx に size×size でお手本を描く（画像は読みおわってから）
export async function drawModel(ctx, image, size) {
  if (isPicture(image)) {
    const im = await loadPicture(image);
    ctx.drawImage(im, 0, 0, size, size);
    return;
  }
  renderModel(ctx, makeModel(image), size);
}

// キャンバスにお手本を出す。リアルは読みおわるまで白（読んでいる間に別の絵に替わったら、古いほうは描かない）
export function paintModel(canvas, image, px) {
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  const key = JSON.stringify(image);
  canvas.dataset.model = key;
  const ctx = canvas.getContext('2d');
  if (!isPicture(image)) { renderModel(ctx, makeModel(image), px); return Promise.resolve(); }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  return loadPicture(image).then((im) => {
    if (canvas.dataset.model === key) ctx.drawImage(im, 0, 0, px, px);
  }, () => {
    // 読めなかったら、少しおいてもう一度
    setTimeout(() => { if (canvas.dataset.model === key) paintModel(canvas, image, px); }, 1500);
  });
}
