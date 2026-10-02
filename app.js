/* 时间块：月视图 + 待办 + 日程 + 分类 + 重复。数据只在本机 localStorage。 */
(() => {
'use strict';

const VERSION = '1.0.0';
const KEY = 'timeblock.v1';
const PALETTE = ['#e5484d', '#3e8ef7', '#8e5cf6', '#2ba84a', '#f59e0b', '#06b6d4', '#ec4899', '#64748b'];
const DEFAULT_CATS = [
  { id: 'c1', name: '工作', color: '#e5484d' },
  { id: 'c2', name: '学习', color: '#3e8ef7' },
  { id: 'c3', name: '生活', color: '#8e5cf6' },
  { id: 'c4', name: '健康', color: '#2ba84a' },
];

// ---------- 数据 ----------
let state = load();
function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const d = JSON.parse(s); if (d && Array.isArray(d.items) && Array.isArray(d.categories)) return d; }
  } catch (e) { /* 坏数据当没有 */ }
  return { version: 1, categories: DEFAULT_CATS.map(c => ({ ...c })), items: [] };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function cat(id) { return state.categories.find(c => c.id === id) || state.categories[0]; }

// ---------- 日期 ----------
const pad = n => (n < 10 ? '0' : '') + n;
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
function today() { return ymd(new Date()); }
function weekday(s) { return (parse(s).getDay() + 6) % 7 + 1; } // 一=1 … 日=7
const WD = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ---------- 重复展开 ----------
function matches(it, d) {
  const r = it.repeat;
  if (!r) return it.date === d;
  if (d < it.date) return false;
  if (r.until && d > r.until) return false;
  if ((it.exDates || []).includes(d)) return false;
  if (r.freq === 'daily') return true;
  if (r.freq === 'weekly') return (r.days || []).includes(weekday(d));
  return false;
}
// 返回 { 'YYYY-MM-DD': [occ…] }，occ = { item, date, done }
function occurrences(start, end) {
  const out = {};
  const push = (d, o) => { (out[d] = out[d] || []).push(o); };
  for (const it of state.items) {
    if (!it.repeat) {
      if (it.date >= start && it.date <= end) push(it.date, { item: it, date: it.date, done: !!it.done });
      continue;
    }
    let d = it.date > start ? it.date : start;
    const stop = it.repeat.until && it.repeat.until < end ? it.repeat.until : end;
    for (; d <= stop; d = addDays(d, 1)) {
      if (matches(it, d)) push(d, { item: it, date: d, done: (it.doneDates || []).includes(d) });
    }
  }
  const rank = o => (o.item.type === 'event' ? 0 : 1);
  for (const d in out) out[d].sort((a, b) => rank(a) - rank(b) || (a.item.time || '').localeCompare(b.item.time || '') || (a.item.order || 0) - (b.item.order || 0));
  return out;
}

// 没勾的待办过了当天，自动挪到今天（重复的不挪，免得越攒越多）
function rollover() {
  const t = today(); let changed = false;
  for (const it of state.items) {
    if (it.type === 'todo' && !it.repeat && !it.done && it.date < t) { it.date = t; changed = true; }
  }
  if (changed) save();
  return changed;
}

// ---------- 月视图 ----------
const $ = id => document.getElementById(id);
const grid = $('grid');
let view = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })();

function render() {
  const first = `${view.y}-${pad(view.m)}-01`;
  const lead = weekday(first) - 1;
  const start = addDays(first, -lead);
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const rows = Math.ceil((lead + daysInMonth) / 7);
  const end = addDays(start, rows * 7 - 1);
  const occ = occurrences(start, end);
  const t = today();
  $('monthTitle').textContent = `${view.y}年${view.m}月`;

  const frag = document.createDocumentFragment();
  for (let d = start, i = 0; i < rows * 7; i++, d = addDays(d, 1)) {
    const cell = document.createElement('div');
    const dt = parse(d);
    cell.className = 'cell' + (dt.getMonth() + 1 !== view.m ? ' other' : '') + (weekday(d) === 7 ? ' sun' : '') + (d === t ? ' today' : '');
    cell.dataset.date = d;
    cell.innerHTML = `<div class="d"><span>${dt.getDate()}</span></div><div class="items"></div>`;
    const box = cell.querySelector('.items');
    for (const o of occ[d] || []) box.appendChild(itemEl(o));
    frag.appendChild(cell);
  }
  grid.replaceChildren(frag);
}
function itemEl(o) {
  const el = document.createElement('div');
  const c = cat(o.item.catId);
  el.dataset.id = o.item.id; el.dataset.date = o.date;
  if (o.item.type === 'event') {
    el.className = 'it ev'; el.style.background = c.color; el.textContent = o.item.title;
  } else {
    el.className = 'it todo' + (o.done ? ' done' : ''); el.style.color = c.color;
    el.innerHTML = `<span class="box"></span><span class="t"></span>`;
    el.querySelector('.t').textContent = o.item.title;
  }
  return el;
}
function findOcc(id, date) {
  const it = state.items.find(x => x.id === id);
  if (!it) return null;
  return { item: it, date, done: it.repeat ? (it.doneDates || []).includes(date) : !!it.done };
}

$('prevBtn').onclick = () => { view.m--; if (view.m < 1) { view.m = 12; view.y--; } render(); };
$('nextBtn').onclick = () => { view.m++; if (view.m > 12) { view.m = 1; view.y++; } render(); };
$('todayBtn').onclick = () => { const d = new Date(); view = { y: d.getFullYear(), m: d.getMonth() + 1 }; render(); };
$('settingsBtn').onclick = openSettings;

// ---------- 手势：点格子 / 左右滑换月 / 长按拖动改日期 ----------
let press = null, drag = null, swipe = null;
grid.addEventListener('pointerdown', e => {
  if (e.button && e.button !== 0) return;
  const itEl = e.target.closest('.it');
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  if (itEl) {
    press = { el: itEl, x: e.clientX, y: e.clientY, timer: setTimeout(() => startDrag(itEl, e.clientX, e.clientY), 420) };
  }
});
grid.addEventListener('pointermove', e => {
  if (drag) { moveDrag(e.clientX, e.clientY); return; }
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
});
const endPointer = e => {
  if (press) { clearTimeout(press.timer); press = null; }
  if (drag) { endDrag(e.clientX, e.clientY); swipe = null; return; }
  if (swipe && e.type === 'pointerup') {
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { (dx < 0 ? $('nextBtn') : $('prevBtn')).click(); swipe = null; return; }
  }
  swipe = null;
};
grid.addEventListener('pointerup', endPointer);
grid.addEventListener('pointercancel', endPointer);
grid.addEventListener('click', e => {
  if (drag || dragJustEnded) return;
  const cell = e.target.closest('.cell');
  if (cell) openDay(cell.dataset.date);
});
grid.addEventListener('contextmenu', e => e.preventDefault());
grid.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

let dragJustEnded = false;
function startDrag(el, x, y) {
  press = null;
  const occ = findOcc(el.dataset.id, el.dataset.date);
  if (!occ) return;
  const ghost = document.createElement('div');
  ghost.className = 'ghost'; ghost.textContent = occ.item.title;
  document.body.appendChild(ghost);
  drag = { occ, el, ghost, over: null };
  el.classList.add('dragging');
  moveDrag(x, y);
  if (navigator.vibrate) navigator.vibrate(10);
}
function moveDrag(x, y) {
  drag.ghost.style.left = (x + 12) + 'px'; drag.ghost.style.top = (y - 14) + 'px';
  const cell = document.elementFromPoint(x, y)?.closest?.('.cell') || null;
  if (cell !== drag.over) { drag.over?.classList.remove('drop'); cell?.classList.add('drop'); drag.over = cell; }
}
function endDrag(x, y) {
  const { occ, el, ghost, over } = drag;
  ghost.remove(); el.classList.remove('dragging'); over?.classList.remove('drop');
  drag = null; dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 300);
  if (over && over.dataset.date !== occ.date) moveOcc(occ, over.dataset.date);
}
function moveOcc(occ, newDate) {
  const it = occ.item;
  if (!it.repeat) { it.date = newDate; }
  else {
    it.exDates = it.exDates || []; it.exDates.push(occ.date);
    const copy = { ...it, id: uid(), date: newDate, repeat: null, exDates: undefined, doneDates: undefined, done: occ.done };
    state.items.push(copy);
  }
  save(); render(); toast(`已挪到 ${fmtDate(newDate)}`);
}

// ---------- 当天清单 ----------
let curDay = null;
function fmtDate(d) { const dt = parse(d); return `${dt.getMonth() + 1}月${dt.getDate()}日 ${WD[weekday(d)]}`; }
function openDay(d) {
  curDay = d;
  $('dayTitle').textContent = fmtDate(d) + (d === today() ? '（今天）' : '');
  renderDay();
  show('daySheet');
}
function renderDay() {
  const list = $('dayList');
  const occ = occurrences(curDay, curDay)[curDay] || [];
  list.replaceChildren();
  if (!occ.length) { list.innerHTML = '<li class="empty">这天还是空的</li>'; return; }
  for (const o of occ) {
    const li = document.createElement('li');
    const c = cat(o.item.catId);
    li.className = o.done ? 'done' : '';
    li.style.color = c.color;
    const time = o.item.type === 'event' && o.item.time ? (o.item.time + (o.item.endTime ? '–' + o.item.endTime : '')) : '';
    const rep = o.item.repeat ? '↻' : '';
    li.innerHTML = o.item.type === 'todo'
      ? `<button class="chk" aria-label="完成"></button><span class="t"></span><span class="rep">${rep}</span>`
      : `<span class="bar" style="background:${c.color}"></span><span class="t"></span><span class="time">${time}</span><span class="rep">${rep}</span>`;
    li.querySelector('.t').textContent = o.item.title;
    li.querySelector('.t').style.color = o.done ? '' : 'var(--fg)';
    li.querySelector('.chk')?.addEventListener('click', ev => { ev.stopPropagation(); toggleDone(o); });
    li.addEventListener('click', () => openEdit(o));
    list.appendChild(li);
  }
}
function toggleDone(o) {
  const it = o.item;
  if (!it.repeat) it.done = !it.done;
  else {
    it.doneDates = it.doneDates || [];
    const i = it.doneDates.indexOf(o.date);
    i >= 0 ? it.doneDates.splice(i, 1) : it.doneDates.push(o.date);
  }
  save(); renderDay(); render();
}
$('addTodoBtn').onclick = () => openEdit(null, 'todo');
$('addEventBtn').onclick = () => openEdit(null, 'event');

// ---------- 新建 / 编辑 ----------
let editing = null; // { occ } 或 { type }
const form = $('editForm');
function openEdit(occ, type) {
  editing = occ ? { occ } : { type };
  const it = occ ? occ.item : null;
  $('editTitle').textContent = it ? '编辑' : '新建';
  setType(it ? it.type : type);
  $('fTitle').value = it ? it.title : '';
  $('fDate').value = occ ? occ.date : (curDay || today());
  $('fTime').value = it?.time || ''; $('fEnd').value = it?.endTime || '';
  $('fRepeat').value = it?.repeat?.freq || '';
  const days = it?.repeat?.days || [weekday($('fDate').value)];
  for (const b of $('fDays').children) b.classList.toggle('on', days.includes(+b.dataset.d));
  renderCatChips(it ? it.catId : state.categories[0].id);
  updateRepeatUI();
  $('deleteBtn').classList.toggle('hidden', !it);
  show('editSheet');
  if (!it) setTimeout(() => $('fTitle').focus(), 50);
}
function setType(t) {
  for (const b of $('typeSeg').children) b.classList.toggle('on', b.dataset.type === t);
  $('timeRow').classList.toggle('hidden', t !== 'event');
}
function curType() { return $('typeSeg').querySelector('.on').dataset.type; }
$('typeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setType(b.dataset.type); });
function renderCatChips(sel) {
  const box = $('fCats'); box.replaceChildren();
  for (const c of state.categories) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = c.id;
    b.className = c.id === sel ? 'on' : '';
    b.innerHTML = `<span class="dot" style="background:${c.color}"></span>`; b.append(c.name);
    b.onclick = () => { for (const x of box.children) x.classList.toggle('on', x === b); };
    box.appendChild(b);
  }
}
$('fRepeat').onchange = updateRepeatUI;
function updateRepeatUI() { $('fDays').classList.toggle('hidden', $('fRepeat').value !== 'weekly'); }
$('fDays').addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); });
$('fDate').onchange = () => { // 新建每周重复时，默认勾当天
  if ($('fRepeat').value !== 'weekly' || editing?.occ) return;
  const on = [...$('fDays').children].filter(b => b.classList.contains('on'));
  if (on.length <= 1) for (const b of $('fDays').children) b.classList.toggle('on', +b.dataset.d === weekday($('fDate').value));
};

function readForm() {
  const type = curType();
  const freq = $('fRepeat').value;
  const days = [...$('fDays').children].filter(b => b.classList.contains('on')).map(b => +b.dataset.d);
  let repeat = null;
  if (freq === 'daily') repeat = { freq: 'daily' };
  if (freq === 'weekly') repeat = { freq: 'weekly', days: days.length ? days : [weekday($('fDate').value)] };
  return {
    type, title: $('fTitle').value.trim(),
    catId: $('fCats').querySelector('.on')?.dataset.id || state.categories[0].id,
    date: $('fDate').value || today(),
    time: type === 'event' ? ($('fTime').value || '') : '',
    endTime: type === 'event' ? ($('fEnd').value || '') : '',
    repeat,
  };
}
function newItem(f) {
  return { id: uid(), type: f.type, title: f.title, catId: f.catId, date: f.date, time: f.time, endTime: f.endTime,
    done: false, repeat: f.repeat, exDates: [], doneDates: [], order: Date.now() };
}
form.onsubmit = e => {
  e.preventDefault();
  const f = readForm();
  if (!f.title) return;
  if (!editing.occ) { state.items.push(newItem(f)); done(); return; }
  const { item: it, date } = editing.occ;
  if (!it.repeat) { Object.assign(it, f); if (f.repeat) { it.exDates = []; it.doneDates = it.done ? [f.date] : []; it.done = false; } done(); return; }
  choose('这是重复项，怎么改？', scope => {
    if (scope === 'one') {
      it.exDates = it.exDates || []; it.exDates.push(date);
      const n = newItem({ ...f, repeat: null }); n.done = (it.doneDates || []).includes(date);
      state.items.push(n);
    } else {
      endSeries(it, date);
      state.items.push(newItem(f));
    }
    done();
  });
  function done() { save(); hide('editSheet'); renderDay(); render(); }
};
function endSeries(it, fromDate) { // 这天以后不再出现
  const prev = addDays(fromDate, -1);
  if (prev < it.date) state.items.splice(state.items.indexOf(it), 1);
  else it.repeat.until = prev;
}
$('deleteBtn').onclick = () => {
  const { item: it, date } = editing.occ;
  const finish = () => { save(); hide('editSheet'); renderDay(); render(); };
  if (!it.repeat) { state.items.splice(state.items.indexOf(it), 1); finish(); return; }
  choose('这是重复项，删哪些？', scope => {
    if (scope === 'one') { it.exDates = it.exDates || []; it.exDates.push(date); }
    else endSeries(it, date);
    finish();
  });
};

// ---------- 二选一 ----------
function choose(text, cb) {
  $('choiceText').textContent = text;
  const box = $('choice'); box.classList.remove('hidden');
  box.onclick = e => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    box.classList.add('hidden'); box.onclick = null;
    if (b.dataset.scope !== 'cancel') cb(b.dataset.scope);
  };
}

// ---------- 设置 ----------
function openSettings() { renderCats(); $('verInfo').textContent = `时间块 v${VERSION} · ${state.items.length} 条记录`; show('settingsSheet'); }
function renderCats() {
  const ul = $('catList'); ul.replaceChildren();
  for (const c of state.categories) {
    const li = document.createElement('li');
    li.innerHTML = `<input type="color" value="${c.color}"><input type="text" class="input" value="" maxlength="12"><button class="iconbtn" aria-label="删除">×</button>`;
    const [color, name, del] = li.children;
    name.value = c.name;
    color.oninput = () => { c.color = color.value; save(); render(); };
    name.onchange = () => { c.name = name.value.trim() || c.name; name.value = c.name; save(); };
    del.onclick = () => {
      if (state.categories.length <= 1) { toast('至少留一个分类'); return; }
      const used = state.items.filter(i => i.catId === c.id).length;
      if (used && !confirm(`「${c.name}」下有 ${used} 条，删掉后它们归到第一个分类。继续？`)) return;
      state.categories.splice(state.categories.indexOf(c), 1);
      for (const i of state.items) if (i.catId === c.id) i.catId = state.categories[0].id;
      save(); renderCats(); render();
    };
    ul.appendChild(li);
  }
}
$('addCatBtn').onclick = () => {
  const color = PALETTE[state.categories.length % PALETTE.length];
  state.categories.push({ id: uid(), name: '新分类', color });
  save(); renderCats();
  const last = $('catList').lastElementChild.querySelector('input[type=text]'); last.focus(); last.select();
};
$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `timeblock-${today().replace(/-/g, '')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.items) || !Array.isArray(d.categories)) throw new Error('格式不对');
    if (!confirm(`导入 ${d.items.length} 条记录、${d.categories.length} 个分类，会替换现有全部数据。继续？`)) return;
    state = d; save(); rollover(); renderCats(); render(); toast('已导入');
  } catch (err) { toast('导入失败：' + err.message); }
};

// ---------- 抽屉 / 提示 ----------
function show(id) { $('backdrop').classList.remove('hidden'); $(id).classList.remove('hidden'); }
function hide(id) {
  $(id).classList.add('hidden');
  if (!document.querySelector('.sheet:not(.hidden)')) $('backdrop').classList.add('hidden');
}
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => hide(b.dataset.close));
$('backdrop').onclick = () => document.querySelectorAll('.sheet:not(.hidden)').forEach(s => hide(s.id));
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 1800); }

// ---------- 启动 ----------
rollover(); render();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rollover(); render(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__tb = { get state() { return state; }, save, render, occurrences, rollover }; // 调试用
})();
