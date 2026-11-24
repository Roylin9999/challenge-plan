// 蘇打餅小工具 — iPhone 桌面小工具（Scriptable）
// 顯示今天的任務、完成幾件、兩個挑戰獎的 BV 進度。點小工具會打開網站。
//
// 安裝方式：
// 1. App Store 安裝 Scriptable
// 2. Scriptable 右上角 ＋，把這整份貼進去，名稱改成「蘇打餅」
// 3. 先在 Scriptable 裡按一次 ▶ 執行，輸入網站的通關碼（只會存在這支手機的鑰匙圈）
// 4. 回桌面長按 → 左上角 ＋ → 找 Scriptable → 選中尺寸或大尺寸 → 加入
// 5. 長按小工具 → 編輯小工具 → Script 選「蘇打餅」
//
// ↓↓↓ 可調整設定 ↓↓↓
const SITE_URL = 'https://challenge-plan.joy23419.workers.dev';  // ← 你的網站網址（最後不要加斜線）
const MAX_TASKS = 6;            // 大尺寸最多列幾件任務（中尺寸自動減半）
const COLORS = {
  bg:    '#FFF4D6',   // 底色
  ink:   '#5A3A1E',   // 文字
  soft:  '#8A6A4A',   // 次要文字
  done:  '#7FAE4C',   // 完成
  honey: '#E8961E',   // 強調
  bar:   '#F3E3C0',   // 進度條底
};
// ↑↑↑ 可調整設定 ↑↑↑

const KEY = 'soda-plan-code';
const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, new Color(v)]));

async function askCode() {
  const a = new Alert();
  a.title = '蘇打餅小工具';
  a.message = '輸入網站的通關碼';
  a.addSecureTextField('通關碼', '');
  a.addAction('儲存');
  a.addCancelAction('取消');
  if (await a.present() === -1) return '';
  const v = a.textFieldValue(0).trim();
  if (v) Keychain.set(KEY, v);
  return v;
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);

async function loadState(code) {
  const r = new Request(SITE_URL + '/api/state');
  r.headers = { 'x-code': code };
  r.timeoutInterval = 15;
  const j = await r.loadJSON();
  if (r.response.statusCode === 401) throw new Error('通關碼不對，請在 Scriptable 裡重新執行一次');
  return j.data;
}

// 蘇打餅的圖：第一次下載後存在手機裡
async function sodaImage(name) {
  const fm = FileManager.local(), path = fm.joinPath(fm.cacheDirectory(), 'soda-' + name + '.png');
  if (fm.fileExists(path)) return fm.readImage(path);
  try { const img = await new Request(SITE_URL + '/img/soda-' + name + '.png').loadImage(); fm.writeImage(path, img); return img; }
  catch (e) { return null; }
}

function bar(stack, pct, w, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, 8); ctx.opaque = false; ctx.respectScreenScale = true;
  const p = new Path(); p.addRoundedRect(new Rect(0, 0, w, 8), 4, 4); ctx.addPath(p); ctx.setFillColor(C.bar); ctx.fillPath();
  if (pct > 0) { const q = new Path(); q.addRoundedRect(new Rect(0, 0, Math.max(8, w * Math.min(1, pct)), 8), 4, 4); ctx.addPath(q); ctx.setFillColor(color); ctx.fillPath(); }
  stack.addImage(ctx.getImage()).imageSize = new Size(w, 8);
}

function text(stack, t, size, color, bold) {
  const x = stack.addText(t);
  x.font = bold ? Font.boldRoundedSystemFont(size) : Font.regularRoundedSystemFont(size);
  x.textColor = color || C.ink;
  x.lineLimit = 1;
  return x;
}

async function build() {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = SITE_URL;
  w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60e3);
  const family = config.widgetFamily || 'large';

  let code = Keychain.contains(KEY) ? Keychain.get(KEY) : '';
  if (!code && config.runsInApp) code = await askCode();
  if (!code) { text(w, '請先在 Scriptable 裡執行一次，輸入通關碼', 13, C.ink, true); return w; }

  let S;
  try { S = await loadState(code); }
  catch (e) { text(w, '🐢 連不上網站', 14, C.ink, true); w.addSpacer(4); text(w, String(e.message || e), 11, C.soft); return w; }
  if (!S) { text(w, '🐢 還沒有紀錄，先打開網站一次', 13, C.ink, true); return w; }

  const meta = S.meta || {}, k = todayKey();
  const tasks = ((S.days && S.days[k] && S.days[k].tasks) || []).map(t => ({ t: String(t.t).replace('{夥伴}', '一位夥伴'), d: !!t.d }));
  const done = tasks.filter(t => t.d).length;
  const wk = (meta.weeks || []).find(x => k >= x.s && k <= x.e);
  const left = meta.deadline ? Math.max(0, dayDiff(k, meta.deadline)) : null;
  const allDone = tasks.length && done === tasks.length;

  /* 上方：蘇打餅＋今天完成幾件 */
  const top = w.addStack(); top.centerAlignContent();
  const img = await sodaImage(!tasks.length ? 'sleep' : allDone ? 'cheer' : done ? 'wave' : 'stand');
  if (img) { const i = top.addImage(img); i.imageSize = new Size(family === 'small' ? 40 : 48, family === 'small' ? 40 : 48); top.addSpacer(8); }
  const head = top.addStack(); head.layoutVertically();
  text(head, allDone ? '今天全部完成！' : `今天 ${done} / ${tasks.length} 件`, family === 'small' ? 14 : 17, allDone ? C.done : C.ink, true);
  const sub = [wk ? `第 ${wk.n} 週・${wk.phase}` : '', left !== null ? `距 3/31 ${left} 天` : ''].filter(Boolean).join('　');
  if (family !== 'small') text(head, sub, 11, C.soft);
  w.addSpacer(8);

  /* 任務清單 */
  const max = family === 'large' ? MAX_TASKS : family === 'medium' ? Math.ceil(MAX_TASKS / 2) : 2;
  const list = tasks.filter(t => !t.d).concat(tasks.filter(t => t.d)).slice(0, max);  // 沒做完的排前面
  if (!tasks.length) text(w, '今天還沒有任務，打開網站填一件吧', 12, C.soft);
  for (const t of list) {
    const row = w.addStack(); row.centerAlignContent();
    text(row, t.d ? '✓' : '○', 13, t.d ? C.done : C.honey, true);
    row.addSpacer(6);
    const x = text(row, t.t, family === 'small' ? 11 : 13, t.d ? C.soft : C.ink);
    w.addSpacer(3);
  }
  const more = tasks.filter(t => !t.d).length - list.filter(t => !t.d).length;
  if (more > 0) text(w, `還有 ${more} 件沒做`, 11, C.soft);

  /* 大尺寸：兩個挑戰獎的 BV 進度 */
  if (family === 'large' && meta.bv) {
    w.addSpacer();
    for (const b of meta.bv) {
      const r = w.addStack(); r.centerAlignContent();
      text(r, b.id === 'gt' ? '全新生活' : '營養保健', 12, C.ink, true); r.addSpacer();
      text(r, `${Math.round(b.now).toLocaleString()} / ${b.target.toLocaleString()} BV`, 12, C.soft);
      w.addSpacer(3);
      bar(w, b.now / b.target, 290, b.id === 'gt' ? C.honey : C.done);
      w.addSpacer(6);
    }
  } else w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
