// 蘇打餅小工具 — iPhone 桌面／鎖定畫面小工具（Scriptable）
// 每種大小顯示的內容不一樣，點小工具會打開網站。
//
//   小：蘇打餅＋今天的進度圈＋下一件要做的事
//   中：左邊蘇打餅和進度圈，右邊今天的任務，底下兩個獎的 BV
//   大：今天的任務、本週目標和這週四要打給誰、兩個獎的 BV，三區用細線隔開
//   鎖定畫面（長方形）：今天完成幾件＋接下來 2 件
//   鎖定畫面（圓形）：今天完成幾件
//   鎖定畫面（時間上面那一行）：今天幾件、下一件
//
// 安裝方式：
// 1. App Store 安裝 Scriptable
// 2. Scriptable 右上角 ＋，把這整份貼進去，名稱改成「蘇打餅」
// 3. 先在 Scriptable 裡按一次 ▶ 執行，輸入網站的通關碼（只會存在這支手機的鑰匙圈），再選一種大小預覽
// 4. 桌面：長按 → 左上角 ＋ → Scriptable → 選大小 → 加入；長按小工具 → 編輯小工具 → Script 選「蘇打餅」
// 5. 鎖定畫面：長按鎖定畫面 → 自訂 → 鎖定畫面 → 加入小工具 → Scriptable → 點它 → Script 選「蘇打餅」
//
// ↓↓↓ 可調整設定 ↓↓↓
const SITE_URL = 'https://challenge-plan.joy23419.workers.dev';  // ← 你的網站網址（最後不要加斜線）
const LARGE_TASKS = 4;          // 大尺寸列幾件今天的任務
const MEDIUM_TASKS = 3;         // 中尺寸列幾件
const COLORS = {
  bg:    '#FFF4D6',   // 底色
  ink:   '#5A3A1E',   // 文字
  soft:  '#8A6A4A',   // 次要文字
  done:  '#7FAE4C',   // 完成
  accent: '#E8961E',  // 強調
  bar:   '#F3E3C0',   // 進度條底
};
// ↑↑↑ 可調整設定 ↑↑↑

const KEY = 'soda-plan-code';
const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, new Color(v)]));
let family = config.widgetFamily || 'large';

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
const md = k => { const [, m, d] = k.split('-'); return (+m) + '/' + (+d); };

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

function bar(stack, pct, w, h, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const p = new Path(); p.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2); ctx.addPath(p); ctx.setFillColor(C.bar); ctx.fillPath();
  if (pct > 0) { const q = new Path(); q.addRoundedRect(new Rect(0, 0, Math.max(h, w * Math.min(1, pct)), h), h / 2, h / 2); ctx.addPath(q); ctx.setFillColor(color); ctx.fillPath(); }
  stack.addImage(ctx.getImage()).imageSize = new Size(w, h);
}

function text(stack, t, size, color, bold, lines) {
  const x = stack.addText(t);
  x.font = bold ? Font.boldRoundedSystemFont(size) : Font.regularRoundedSystemFont(size);
  if (color) x.textColor = color;
  x.lineLimit = lines || 1;
  return x;
}

function checkRow(stack, label, done, size) {
  const row = stack.addStack(); row.centerAlignContent();
  text(row, done ? '✓' : '○', size, done ? C.done : C.accent, true);
  row.addSpacer(6);
  text(row, label, size, done ? C.soft : C.ink);
  stack.addSpacer(3);
}

/* ---------- 整理資料 ---------- */
function digest(S) {
  const meta = S.meta || {}, k = todayKey();
  const tasks = ((S.days && S.days[k] && S.days[k].tasks) || []).map(t => ({ t: String(t.t).replace('{夥伴}', '一位夥伴'), d: !!t.d }));
  const done = tasks.filter(t => t.d).length;
  const todo = tasks.filter(t => !t.d);
  const wk = (meta.weeks || []).find(x => k >= x.s && k <= x.e);
  const wchk = wk && S.weeks ? (S.weeks[wk.n] || []) : [];
  const weekActs = wk ? wk.acts.map((a, i) => ({ t: a, d: !!wchk[i] })) : [];
  const calls = (S.calls || []).filter(Boolean);
  let call = '';
  if (wk && calls.length) {
    const thu = new Date(wk.s + 'T00:00'); thu.setDate(thu.getDate() + 3);
    call = `${thu.getMonth() + 1}/${thu.getDate()}（四）打給 ${calls[(wk.n - 1) % calls.length]}`;
  }
  return {
    tasks, done, todo, wk, weekActs, call, bv: meta.bv || [],
    left: meta.deadline ? Math.max(0, dayDiff(k, meta.deadline)) : null,
    deadline: meta.deadline ? md(meta.deadline) : '3/31',
    allDone: tasks.length > 0 && done === tasks.length,
  };
}
const mood = D => !D.tasks.length ? 'sleep' : D.allDone ? 'cheer' : D.done ? 'wave' : 'stand';
const headline = D => !D.tasks.length ? '今天還沒有任務' : D.allDone ? '今天全部完成！' : `今天 ${D.done} / ${D.tasks.length} 件`;

/* ---------- 鎖定畫面 ---------- */
function lockWidget(w, D) {
  if (family === 'accessoryInline') {
    text(w, D.allDone ? '🐢 今天全部完成！' : `🐢 ${D.done}/${D.tasks.length}・${D.todo[0] ? D.todo[0].t : '打開網站填任務'}`, 12);
    return;
  }
  if (family === 'accessoryCircular') {
    w.addSpacer();
    const s = w.addStack(); s.addSpacer(); const v = s.addStack(); v.layoutVertically();
    text(v, '🐢', 14).centerAlignText();
    text(v, D.allDone ? '完成' : `${D.done}/${D.tasks.length}`, 15, null, true).centerAlignText();
    s.addSpacer(); w.addSpacer();
    return;
  }
  // accessoryRectangular
  text(w, '🐢 ' + headline(D), 13, null, true);
  for (const t of D.todo.slice(0, 2)) text(w, '・' + t.t, 12);
  if (D.allDone && D.left !== null) text(w, `距 ${D.deadline} 還有 ${D.left} 天`, 12);
}

/* ---------- 共用：進度圈、分隔線、BV 小進度條 ---------- */
function ringImage(done, total, size, allDone) {
  const ctx = new DrawContext(); ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const lw = Math.round(size * 0.13), r = (size - lw) / 2, c = size / 2;
  const arc = (from, to, color) => {
    const p = new Path(), steps = Math.max(2, Math.ceil((to - from) * 60));
    const pts = []; for (let i = 0; i <= steps; i++) { const a = -Math.PI / 2 + 2 * Math.PI * (from + (to - from) * i / steps); pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a))); }
    p.addLines(pts); ctx.addPath(p); ctx.setStrokeColor(color); ctx.setLineWidth(lw); ctx.strokePath();
  };
  arc(0, 1, C.bar);
  const pct = total ? done / total : 0;
  if (pct > 0) arc(0, Math.min(1, pct), allDone ? C.done : C.accent);
  ctx.setTextAlignedCenter(); ctx.setTextColor(C.ink); ctx.setFont(Font.boldRoundedSystemFont(size * 0.26));
  ctx.drawTextInRect(total ? `${done}/${total}` : '0', new Rect(0, size / 2 - size * 0.17, size, size * 0.4));
  return ctx.getImage();
}
function hr(w) { w.addSpacer(7); const l = w.addStack(); l.size = new Size(0, 1); l.backgroundColor = C.bar; l.addSpacer(); w.addSpacer(7); }
function bvPair(stack, bvs, width, withTarget) {
  const row = stack.addStack();
  bvs.forEach((b, i) => {
    if (i) row.addSpacer(10);
    const col = row.addStack(); col.layoutVertically();
    const top = col.addStack();
    text(top, b.id === 'gt' ? '全新生活' : (withTarget ? '營養保健' : '營養'), 10, C.soft, true); top.addSpacer();
    text(top, withTarget ? `${Math.round(b.now).toLocaleString()}/${b.target.toLocaleString()}` : Math.round(b.now).toLocaleString(), 10, C.soft);
    col.addSpacer(3);
    bar(col, b.now / b.target, width, 6, b.id === 'gt' ? C.accent : C.done);
  });
}

/* ---------- 小 ---------- */
async function smallWidget(w, D) {
  const top = w.addStack(); top.topAlignContent();
  const img = await sodaImage(mood(D));
  if (img) top.addImage(img).imageSize = new Size(52, 52);
  top.addSpacer();
  top.addImage(ringImage(D.done, D.tasks.length, 48, D.allDone)).imageSize = new Size(48, 48);
  w.addSpacer();
  if (D.allDone) { text(w, '今天全部完成！', 14, C.done, true); w.addSpacer(2); text(w, D.left !== null ? `距 ${D.deadline} 還有 ${D.left} 天` : '', 10, C.soft); }
  else if (D.todo[0]) { text(w, '下一件', 10, C.soft); w.addSpacer(2); text(w, D.todo[0].t, 13, C.ink, true, 2); }
  else text(w, '打開網站填一件今天要做的事', 12, C.soft, false, 2);
}

/* ---------- 中 ---------- */
async function mediumWidget(w, D) {
  const row = w.addStack(); row.centerAlignContent();
  const left = row.addStack(); left.layoutVertically(); left.size = new Size(92, 130); left.centerAlignContent();
  const img = await sodaImage(mood(D));
  const imgRow = left.addStack(); imgRow.addSpacer();
  if (img) imgRow.addImage(img).imageSize = new Size(50, 50);
  imgRow.addSpacer();
  left.addSpacer(4);
  const ringRow = left.addStack(); ringRow.addSpacer();
  ringRow.addImage(ringImage(D.done, D.tasks.length, 50, D.allDone)).imageSize = new Size(50, 50);
  ringRow.addSpacer();
  left.addSpacer(4);
  const capRow = left.addStack(); capRow.addSpacer();
  text(capRow, D.left !== null ? `距 ${D.deadline} ${D.left} 天` : '今天', 10, C.soft); capRow.addSpacer();

  const line = row.addStack(); line.size = new Size(1, 120); line.backgroundColor = C.bar;
  row.addSpacer(12);

  const right = row.addStack(); right.layoutVertically(); right.size = new Size(0, 130);
  text(right, D.allDone ? '今天全部完成！' : '今天', 11, D.allDone ? C.done : C.soft, true);
  right.addSpacer(4);
  const list = D.todo.concat(D.tasks.filter(t => t.d)).slice(0, MEDIUM_TASKS);
  if (!D.tasks.length) text(right, '還沒有任務，打開網站填一件吧', 12, C.soft, false, 2);
  for (const t of list) checkRow(right, t.t, t.d, 13);
  right.addSpacer();
  if (D.bv.length) bvPair(right, D.bv, 92, false);
}

/* ---------- 大 ---------- */
async function largeWidget(w, D) {
  const top = w.addStack(); top.centerAlignContent();
  const img = await sodaImage(mood(D));
  if (img) { top.addImage(img).imageSize = new Size(52, 52); top.addSpacer(10); }
  const head = top.addStack(); head.layoutVertically();
  text(head, headline(D), 19, D.allDone ? C.done : C.ink, true);
  text(head, D.wk ? `第 ${D.wk.n} 週・${D.wk.phase}` : '', 11, C.soft);
  top.addSpacer();
  if (D.left !== null) {
    const dl = top.addStack(); dl.layoutVertically();
    const n = text(dl, String(D.left), 20, C.accent, true); n.rightAlignText();
    const l = text(dl, `天到 ${D.deadline}`, 10, C.soft); l.rightAlignText();
  }
  hr(w);

  // 今天
  text(w, '今天', 11, C.soft, true); w.addSpacer(4);
  const list = D.todo.concat(D.tasks.filter(t => t.d)).slice(0, LARGE_TASKS);
  if (!D.tasks.length) text(w, '還沒有任務，打開網站填一件吧', 12, C.soft);
  for (const t of list) checkRow(w, t.t, t.d, 13);
  const more = D.tasks.length - list.length;
  if (more > 0) text(w, `還有 ${more} 件`, 10, C.soft);

  // 本週
  if (D.weekActs.length || D.call) {
    hr(w);
    const h = w.addStack();
    text(h, `本週目標 ${D.weekActs.filter(a => a.d).length} / ${D.weekActs.length}`, 11, C.soft, true); h.addSpacer();
    if (D.call) text(h, '📞 ' + D.call, 10, C.soft);
    w.addSpacer(4);
    for (const a of D.weekActs.slice(0, 3)) checkRow(w, a.t, a.d, 12);
  }

  // 兩個獎的 BV（固定在最下面）
  w.addSpacer();
  if (D.bv.length) { hr(w); bvPair(w, D.bv, 138, true); }
}

/* ---------- 組合 ---------- */
async function build() {
  const w = new ListWidget();
  const lock = family.startsWith('accessory');
  if (!lock) { w.backgroundColor = C.bg; w.setPadding(12, 14, 12, 14); }
  w.url = SITE_URL;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60e3);

  let code = Keychain.contains(KEY) ? Keychain.get(KEY) : '';
  if (!code && config.runsInApp) code = await askCode();
  if (!code) { text(w, '先在 Scriptable 裡執行一次，輸入通關碼', 12, lock ? null : C.ink, true, 3); return w; }

  let S;
  try { S = await loadState(code); }
  catch (e) { text(w, '🐢 連不上網站', 13, lock ? null : C.ink, true); if (!lock) text(w, String(e.message || e), 10, C.soft, false, 3); return w; }
  if (!S) { text(w, '🐢 還沒有紀錄，先打開網站一次', 12, lock ? null : C.ink, true, 2); return w; }

  const D = digest(S);
  if (lock) lockWidget(w, D);
  else if (family === 'small') await smallWidget(w, D);
  else if (family === 'medium') await mediumWidget(w, D);
  else await largeWidget(w, D);
  return w;
}

if (config.runsInWidget) {
  Script.setWidget(await build());
} else {
  // 在 Scriptable 裡按 ▶：先選要預覽哪一種大小
  const a = new Alert(); a.title = '預覽哪一種大小？';
  ['小', '中', '大'].forEach(x => a.addAction(x)); a.addCancelAction('取消');
  const i = await a.present();
  if (i >= 0) {
    family = ['small', 'medium', 'large'][i];
    const w = await build();
    if (i === 0) await w.presentSmall(); else if (i === 1) await w.presentMedium(); else await w.presentLarge();
  }
}
Script.complete();
