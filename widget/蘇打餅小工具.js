// 蘇打餅小工具 — iPhone 桌面／鎖定畫面小工具（Scriptable）
// 每種大小顯示的內容不一樣，點小工具會打開網站。
//
//   小：蘇打餅＋今天完成幾件＋下一件要做的事
//   中：蘇打餅＋今天還沒做的 3 件事＋兩個獎的 BV
//   大：今天的任務＋本週目標＋這週四要打給誰＋兩個獎的 BV 進度條
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
  honey: '#E8961E',   // 強調
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
  text(row, done ? '✓' : '○', size, done ? C.done : C.honey, true);
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

/* ---------- 小 ---------- */
async function smallWidget(w, D) {
  const top = w.addStack(); top.centerAlignContent();
  const img = await sodaImage(mood(D));
  if (img) top.addImage(img).imageSize = new Size(46, 46);
  top.addSpacer();
  const n = top.addStack(); n.layoutVertically();
  text(n, D.tasks.length ? `${D.done}/${D.tasks.length}` : '0', 24, D.allDone ? C.done : C.ink, true);
  text(n, '今天', 11, C.soft);
  w.addSpacer();
  if (D.allDone) text(w, '全部完成！', 14, C.done, true);
  else if (D.todo[0]) { text(w, '下一件', 10, C.soft); w.addSpacer(2); text(w, D.todo[0].t, 13, C.ink, true, 2); }
  else text(w, '打開網站填一件', 12, C.soft);
  if (D.left !== null) { w.addSpacer(4); text(w, `距 ${D.deadline} 還有 ${D.left} 天`, 10, C.soft); }
}

/* ---------- 中 ---------- */
async function mediumWidget(w, D) {
  const row = w.addStack(); row.topAlignContent();
  const leftCol = row.addStack(); leftCol.layoutVertically(); leftCol.size = new Size(84, 0);
  const img = await sodaImage(mood(D));
  if (img) leftCol.addImage(img).imageSize = new Size(68, 68);
  leftCol.addSpacer(4);
  text(leftCol, headline(D), 12, D.allDone ? C.done : C.ink, true, 2);
  row.addSpacer(10);
  const rightCol = row.addStack(); rightCol.layoutVertically();
  const list = D.todo.length ? D.todo.slice(0, MEDIUM_TASKS) : D.tasks.slice(0, MEDIUM_TASKS);
  if (!D.tasks.length) text(rightCol, '今天還沒有任務，打開網站填一件吧', 12, C.soft, false, 2);
  for (const t of list) checkRow(rightCol, t.t, t.d, 13);
  const more = D.todo.length - Math.min(D.todo.length, MEDIUM_TASKS);
  if (more > 0) text(rightCol, `還有 ${more} 件`, 10, C.soft);
  rightCol.addSpacer();
  if (D.bv.length) {
    const b = rightCol.addStack();
    D.bv.forEach((x, i) => {
      if (i) b.addSpacer(10);
      text(b, `${x.id === 'gt' ? '全新生活' : '營養'} ${Math.round(x.now).toLocaleString()}/${x.target.toLocaleString()}`, 11, x.id === 'gt' ? C.honey : C.done, true);
    });
  }
}

/* ---------- 大 ---------- */
async function largeWidget(w, D) {
  const top = w.addStack(); top.centerAlignContent();
  const img = await sodaImage(mood(D));
  if (img) { top.addImage(img).imageSize = new Size(50, 50); top.addSpacer(8); }
  const head = top.addStack(); head.layoutVertically();
  text(head, headline(D), 17, D.allDone ? C.done : C.ink, true);
  text(head, [D.wk ? `第 ${D.wk.n} 週・${D.wk.phase}` : '', D.left !== null ? `距 ${D.deadline} 還有 ${D.left} 天` : ''].filter(Boolean).join('　'), 11, C.soft);
  w.addSpacer(8);

  // 今天：沒做完的排前面
  const list = D.todo.concat(D.tasks.filter(t => t.d)).slice(0, LARGE_TASKS);
  if (!D.tasks.length) text(w, '今天還沒有任務，打開網站填一件吧', 12, C.soft);
  for (const t of list) checkRow(w, t.t, t.d, 13);
  const more = D.tasks.length - list.length;
  if (more > 0) text(w, `還有 ${more} 件`, 10, C.soft);

  // 本週目標
  if (D.weekActs.length) {
    w.addSpacer(8);
    const wd = D.weekActs.filter(a => a.d).length;
    text(w, `本週目標 ${wd} / ${D.weekActs.length}`, 12, C.honey, true);
    w.addSpacer(3);
    for (const a of D.weekActs.slice(0, 3)) checkRow(w, a.t, a.d, 12);
  }
  if (D.call) { w.addSpacer(2); text(w, '📞 ' + D.call, 12, C.ink, true); }

  // 兩個獎的 BV
  w.addSpacer();
  for (const b of D.bv) {
    const r = w.addStack(); r.centerAlignContent();
    text(r, b.id === 'gt' ? '全新生活' : '營養保健', 11, C.ink, true); r.addSpacer();
    text(r, `${Math.round(b.now).toLocaleString()} / ${b.target.toLocaleString()} BV`, 11, C.soft);
    w.addSpacer(2);
    bar(w, b.now / b.target, 290, 7, b.id === 'gt' ? C.honey : C.done);
    w.addSpacer(4);
  }
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
