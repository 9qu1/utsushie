// ウツシエ: 通信（Cloudflare の部屋に WebSocket でつなぐ・コトバトの net.js と同じ作り）
//   app.js からは socket.on('state', fn) / socket.emit('submitRank', data, cb) の形で使う
//   本番（予定）: 画面は https://9qu1.com/utsushie/、通信は https://utsushie.nakamido.workers.dev（ほかは同じ場所）
//   絵は WebSocket に載せず HTTP で送る（uploadArt）・取りに行く（artUrl）
//   切れにくくする仕組み（100ピタ・クニトリと同じ一式）
//   ・切れたら 0.5秒から倍にして最大30秒でつなぎ直す（±20% ずらす）。つながったら 'connect'（client.js が rejoin する）
//   ・画面に戻った / focus / online で resync。2.5秒なにも届かなければ張りなおす（凍った接続・8秒に1回まで）
//   ・12秒ごとに ping（部屋を起こさずに自動で返る）。30秒なにも届かなければ張りなおす
//   ・切断が1.5秒続いたら帯を出す（すぐ戻る切断ではちらつかせない）・state が届いたら「つながりました！」
//   ・つながっていないときの操作は送らずに知らせる（送信待ちのまま入り直す前に届いて、黙って無視されるため）
//   ・別のタブ・別の端末に席を取られたら、自動で取り返さずに選んでもらう（2画面が取り合わないように）
export const VERSION = '0.6.0'; // src/version.js と同じにする
export const NET = {};
{
  const PROD = ['9qu1.com', '9qu1.github.io'].includes(location.hostname);
  const ORIGIN = PROD ? 'https://utsushie.nakamido.workers.dev' : location.origin;
  const WS_BASE = ORIGIN.replace(/^http/, 'ws') + '/ws';
  // このページの住所（招待リンクに使う。/utsushie/ の下でも、手元の / でも）
  const PAGE_URL = location.origin + location.pathname.replace(/[^/]*$/, '');
  const OFFLINE = '📡 つながってから、もう一度押してね';

  function create() {
    const h = {};
    const once = {};
    let ws = null;
    let code = null;
    let retry = 0;
    let rt = null;
    let lastRx = 0;
    let downSince = 0;
    let bandT = null;
    let kicked = false;
    let wdT = null;
    let wdAt = 0;
    let seq = 0;
    const acks = new Map();

    const fire = (ev, ...a) => {
      (h[ev] || []).forEach(f => f(...a));
      const o = once[ev];
      if (o) { delete once[ev]; o.forEach(f => f(...a)); }
    };

    function connect() {
      clearTimeout(rt);
      if (!code || kicked) return;
      if (ws && ws.readyState <= 1) return;
      let s;
      try {
        s = new WebSocket(`${WS_BASE}?r=${encodeURIComponent(code)}&v=${VERSION}`);
      } catch (e) {
        lost(null);
        return;
      }
      ws = s;
      s.onopen = () => {
        if (ws !== s) return;
        retry = 0;
        lastRx = Date.now();
        fire('connect');
      };
      s.onmessage = (e) => {
        if (ws !== s) return;
        lastRx = Date.now();
        onMessage(e.data);
      };
      s.onclose = s.onerror = () => lost(s);
    }

    function lost(s) {
      if (s && ws !== s) return;
      ws = null;
      down();
      clearTimeout(rt);
      if (!code || kicked) return;
      // 画面がうしろのあいだはつなぎ直さない（前に戻ったときの wake でつなぐ）
      if (document.hidden) return;
      const wait = Math.min(30000, 500 * 2 ** Math.min(retry++, 6)) * (0.8 + Math.random() * 0.4);
      rt = setTimeout(connect, wait);
    }

    // 凍った接続を捨てて張りなおす
    function reopen() {
      const s = ws;
      ws = null;
      if (s) {
        s.onclose = s.onerror = s.onmessage = null;
        try { s.close(); } catch (e) { /* もう閉じている */ }
      }
      down();
      connect();
    }

    function down() {
      if (downSince || !code) return;
      downSince = Date.now();
      clearTimeout(bandT);
      bandT = setTimeout(() => fire('status', 'down'), 1500);
    }

    function up() {
      if (!downSince) return;
      clearTimeout(bandT);
      const shown = Date.now() - downSince >= 1500;
      downSince = 0;
      fire('status', shown ? 'back' : 'up');
    }

    function raw(o) {
      if (!ws || ws.readyState !== 1) return false;
      try { ws.send(JSON.stringify(o)); return true; } catch (e) { return false; }
    }

    function onMessage(data) {
      let m;
      try { m = JSON.parse(data); } catch (e) { return; }
      switch (m.t) {
        case 'pong':
          return;
        case 'state':
          up();
          fire('state', m.st);
          return;
        case 'ack': {
          const a = acks.get(m.id);
          if (!a) return;
          acks.delete(m.id);
          clearTimeout(a.t);
          a.cb(m.res);
          return;
        }
        case 'gone':
          close();
          fire('roomGone');
          return;
        case 'kicked':
          kicked = true;
          clearTimeout(rt);
          try { ws.close(); } catch (e) { /* もう閉じている */ }
          ws = null;
          clearTimeout(bandT);
          downSince = 0;
          fire('kicked');
          return;
        case 'reload':
          // 古い画面。1回だけ読み込み直す（くり返さない）
          if (!sessionStorage.getItem('us-reloaded')) {
            sessionStorage.setItem('us-reloaded', '1');
            location.reload();
          }
          return;
        default:
      }
    }

    // 画面に戻ったとき
    function wake() {
      if (!code || kicked) return;
      if (!ws || ws.readyState > 1) { connect(); return; }
      if (ws.readyState !== 1) return;
      const t0 = Date.now();
      raw({ t: 'e', ev: 'resync' });
      if (t0 - wdAt < 8000) return;
      wdAt = t0;
      clearTimeout(wdT);
      wdT = setTimeout(() => { if (lastRx < t0) reopen(); }, 2500);
    }

    function heartbeat() {
      if (!code || kicked || document.hidden) return;
      if (!ws || ws.readyState > 1) { connect(); return; }
      if (ws.readyState !== 1) return;
      if (Date.now() - lastRx > 30000) { reopen(); return; }
      raw({ t: 'ping' });
    }

    function close() {
      code = null;
      kicked = false;
      clearTimeout(rt);
      clearTimeout(bandT);
      clearTimeout(wdT);
      downSince = 0;
      const s = ws;
      ws = null;
      if (s) {
        s.onclose = s.onerror = s.onmessage = null;
        try { s.close(); } catch (e) { /* もう閉じている */ }
      }
      for (const [, a] of acks) { clearTimeout(a.t); a.cb({ ok: false, err: '' }); }
      acks.clear();
      fire('status', 'idle');
    }

    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', (e) => { if (e.persisted) wake(); });
    setInterval(heartbeat, 12000);

    return {
      on(ev, f) { (h[ev] = h[ev] || []).push(f); },
      once(ev, f) { (once[ev] = once[ev] || []).push(f); },
      get connected() { return !!ws && ws.readyState === 1; },
      get room() { return code; },
      pageUrl: PAGE_URL,
      // この部屋につなぐ（同じ部屋ならそのまま）
      open(c) {
        if (code === c && !kicked && ws && ws.readyState <= 1) return;
        if (code !== c) close();
        code = c;
        kicked = false;
        retry = 0;
        connect();
      },
      close,
      // 席を取られたあと、この画面で続ける
      resume() {
        if (!code) return;
        kicked = false;
        retry = 0;
        connect();
      },
      // 部屋の中の操作。つながっていなければ送らずに知らせる（cb があれば err で返す）
      emit(ev, data, cb) {
        if (typeof data === 'function') { cb = data; data = undefined; }
        if (!ws || ws.readyState !== 1) {
          if (cb) cb({ ok: false, err: OFFLINE });
          else fire('offline', OFFLINE);
          return false;
        }
        const msg = { t: 'e', ev, d: data || {} };
        if (cb) {
          const id = ++seq;
          msg.id = id;
          acks.set(id, {
            cb,
            t: setTimeout(() => {
              if (!acks.has(id)) return;
              acks.delete(id);
              cb({ ok: false, err: '📡 返事がなかったよ。もう一度押してね' });
            }, 8000),
          });
        }
        return raw(msg);
      },
      // 部屋を出る（送ってから閉じる）
      leave() {
        raw({ t: 'e', ev: 'leaveRoom' });
        close();
      },
      // 絵を送る（HTTP）。{ ok, id } か { ok:false, err }
      async uploadArt({ blob, pid, tok, game, slot }) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        try {
          const res = await fetch(`${ORIGIN}/api/art?r=${encodeURIComponent(code)}&g=${encodeURIComponent(game)}&slot=${slot}`, {
            method: 'POST',
            headers: { 'content-type': 'image/png', 'x-pid': pid, 'x-tok': tok },
            body: blob,
            signal: ctl.signal,
          });
          let j = {};
          try { j = await res.json(); } catch (e) { /* 中身なし */ }
          if (!res.ok || !j.ok) return { ok: false, err: j.err || `絵を送れなかったよ（${res.status}）`, status: res.status };
          return j;
        } catch (e) {
          return { ok: false, err: '📡 絵を送れなかったよ。もう一度ためすね', net: true };
        } finally {
          clearTimeout(timer);
        }
      },
      artUrl(id) { return `${ORIGIN}/api/art?r=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`; },
      // 持ち込みお手本（ホストだけ送れる）。{ ok, id, n } か { ok:false, err }
      async uploadOwn({ blob, pid, tok, name }) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        try {
          const res = await fetch(`${ORIGIN}/api/own?r=${encodeURIComponent(code)}&name=${encodeURIComponent(name || '')}`, {
            method: 'POST',
            headers: { 'content-type': blob.type || 'image/jpeg', 'x-pid': pid, 'x-tok': tok },
            body: blob,
            signal: ctl.signal,
          });
          let j = {};
          try { j = await res.json(); } catch (e) { /* 中身なし */ }
          if (!res.ok || !j.ok) return { ok: false, err: j.err || `画像を送れなかったよ（${res.status}）`, status: res.status };
          return j;
        } catch (e) {
          return { ok: false, err: '📡 画像を送れなかったよ', net: true };
        } finally {
          clearTimeout(timer);
        }
      },
      ownUrl(id) { return `${ORIGIN}/api/own?r=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`; },
      // 部屋を作る（HTTP。返事のコードの部屋に open する）
      async createRoom(data) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 10000);
        try {
          const res = await fetch(`${ORIGIN}/api/create`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data || {}),
            signal: ctl.signal,
          });
          let j = {};
          try { j = await res.json(); } catch (e) { /* 中身なし */ }
          if (!res.ok || !j.ok) return { ok: false, err: j.err || `部屋を作れなかったよ（${res.status}）` };
          return j;
        } catch (e) {
          return { ok: false, err: '📡 通信できなかったよ。もう一度押してね' };
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }

  NET.create = create;
}
