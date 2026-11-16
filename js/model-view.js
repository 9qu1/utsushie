// ウツシエ: お手本をキャンバスに描く（イラスト・図形は形から／リアルは画像ファイルから）
//   リアルの画像は読み込みに少しかかるので、一度読んだものは取っておく
import { makeModel, renderModel } from './shared/models.js?v=0.5.0';
import { photoPath } from './shared/photos.js?v=0.5.0';

const photos = new Map(); // 番号 → Promise<HTMLImageElement>

export function loadPhoto(i) {
  if (!photos.has(i)) {
    const p = new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => { photos.delete(i); rej(new Error(`photo ${i}`)); };
      im.src = photoPath(i);
    });
    photos.set(i, p);
  }
  return photos.get(i);
}

// ctx に size×size でお手本を描く（リアルは読みおわってから）
export async function drawModel(ctx, image, size) {
  if (image && image.k === 'photo') {
    const im = await loadPhoto(image.i);
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
  if (!image || image.k !== 'photo') { renderModel(ctx, makeModel(image), px); return Promise.resolve(); }
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  return loadPhoto(image.i).then((im) => {
    if (canvas.dataset.model === key) ctx.drawImage(im, 0, 0, px, px);
  }, () => {
    // 読めなかったら、少しおいてもう一度
    setTimeout(() => { if (canvas.dataset.model === key) paintModel(canvas, image, px); }, 1500);
  });
}
