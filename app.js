/* Pastoral Planner — offline iPad planner. All data stays on the device (IndexedDB). */

// ============================================================ utilities
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const startOfWeek = d => addDays(d, -((d.getDay() + 6) % 7));
const dayDiff = (a, b) => Math.round((b - a) / 864e5);
const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TAGS = ['', 'P', 'B', 'S'];
const TAGNAME = { P: 'Personal', B: 'Business', S: 'Pastoral', '': 'None' };
const desk = $('#desk');

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }

// ============================================================ storage (IndexedDB, local only)
const store = { map: new Map(), db: null };
const idb = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const memFiles = new Map();

async function openStore() {
  try {
    const req = indexedDB.open('pastoral-planner', 1);
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('kv'); db.createObjectStore('files'); };
    store.db = await idb(req);
    const os = store.db.transaction('kv').objectStore('kv');
    const [keys, vals] = await Promise.all([idb(os.getAllKeys()), idb(os.getAll())]);
    keys.forEach((k, i) => store.map.set(k, vals[i]));
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch (e) { console.warn('Local storage unavailable', e); store.db = null; }
}
const get = (k, def) => (store.map.has(k) ? store.map.get(k) : def);
function put(k, v) {
  store.map.set(k, v);
  if (store.db) try { store.db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { console.warn(e); }
}
function remove(k) {
  store.map.delete(k);
  if (store.db) try { store.db.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch (e) { console.warn(e); }
}
const timers = {};
function putLater(k, v, ms = 350) { store.map.set(k, v); clearTimeout(timers[k]); timers[k] = setTimeout(() => put(k, store.map.get(k)), ms); }
async function putFile(k, buf) {
  if (!store.db) { memFiles.set(k, buf); return; }
  const tx = store.db.transaction('files', 'readwrite'); tx.objectStore('files').put(buf, k);
  await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
}
async function getFile(k) { return store.db ? idb(store.db.transaction('files').objectStore('files').get(k)) : memFiles.get(k); }
async function delFile(k) { if (store.db) store.db.transaction('files', 'readwrite').objectStore('files').delete(k); else memFiles.delete(k); }
async function allFiles() {
  if (!store.db) return [...memFiles.entries()];
  const os = store.db.transaction('files').objectStore('files');
  const [keys, vals] = await Promise.all([idb(os.getAllKeys()), idb(os.getAll())]);
  return keys.map((k, i) => [k, vals[i]]);
}

// ============================================================ settings & seed data
const DEF = { name: 'Chadrac', pencilOnly: true, dayStart: 5, dayEnd: 23, yearStart: 9,
  day: { priorities: true, schedule: true, tasks: true, goals: true, birthdays: true, notes: true, summary: true } };
function S() { const s = get('settings', {}); return { ...DEF, ...s, day: { ...DEF.day, ...(s.day || {}) } }; }
function setSetting(path, val) {
  const s = get('settings', {}); const parts = path.split('.');
  if (parts.length === 2) { s[parts[0]] = { ...(s[parts[0]] || {}), [parts[1]]: val }; } else s[path] = val;
  put('settings', s);
}
function seed() {
  if (get('seeded')) return;
  const base = { allDay: false, interval: 1, until: '2027-08-31', exdates: [], cal: 'local', notes: '', location: '' };
  put('events', [
    { ...base, id: uid(), title: 'Devotion', date: '2026-09-16', start: '07:00', end: '08:00', repeat: 'weekdays', days: [], tag: 'P' },
    { ...base, id: uid(), title: 'Personal Development', date: '2026-09-16', start: '14:30', end: '15:30', repeat: 'weekdays', days: [], tag: 'P' },
    { ...base, id: uid(), title: 'Meeting Prep', date: '2026-09-16', start: '17:30', end: '18:00', repeat: 'weekly', days: [1, 2, 3, 5], tag: 'S' },
  ]);
  put('checklists', [{ id: uid(), name: 'Pastoral follow-up' }, { id: uid(), name: 'MEISTAD Europe actions' }]);
  put('seeded', true);
}

// ============================================================ events & birthdays
function occurs(ev, d) {
  const ds = ymd(d);
  if (ds < ev.date || (ev.until && ds > ev.until) || ev.exdates?.includes(ds)) return false;
  const s = parseYmd(ev.date), iv = Math.max(1, ev.interval || 1);
  switch (ev.repeat) {
    case 'daily': return dayDiff(s, d) % iv === 0;
    case 'weekdays': return d.getDay() >= 1 && d.getDay() <= 5;
    case 'weekly': {
      const days = ev.days?.length ? ev.days : [s.getDay()];
      return days.includes(d.getDay()) && Math.round(dayDiff(startOfWeek(s), startOfWeek(d)) / 7) % iv === 0;
    }
    case 'monthly': return d.getDate() === s.getDate() && ((d.getFullYear() * 12 + d.getMonth()) - (s.getFullYear() * 12 + s.getMonth())) % iv === 0;
    case 'yearly': return d.getDate() === s.getDate() && d.getMonth() === s.getMonth();
    default: return ds === ev.date;
  }
}
const eventsOn = d => get('events', []).filter(e => occurs(e, d)).sort((a, b) => (a.allDay ? '00' : a.start).localeCompare(b.allDay ? '00' : b.start));
const bdaysOn = d => get('birthdays', []).filter(b => +b.month === d.getMonth() + 1 && +b.day === d.getDate());
const evTime = e => (e.allDay ? 'All day' : `${e.start}–${e.end}`);

// ============================================================ icons
const I = {
  today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><circle cx="12" cy="15" r="2"/>',
  hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  day: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  week: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  month: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M3 15.5h18M9 10v11M15 10v11"/>',
  year: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  devotion: '<path d="M2 5c3-1.5 6.5-1.5 10 1 3.5-2.5 7-2.5 10-1v14c-3-1.5-6.5-1.5-10 1-3.5-2.5-7-2.5-10-1z"/><path d="M12 6v14"/>',
  tasks: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  birthdays: '<path d="M4 21v-9h16v9M2 21h20M4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1.5 4 0M12 12V8M12 3.5c1 1 1 2.5 0 3-1-.5-1-2 0-3z"/>',
  notes: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18M4 7h4M4 12h4M4 17h4M11 8h5M11 12h5"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  templates: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  hand: '<path d="M6 3l13 7-6 2-2 7z"/>',
  pen: '<path d="M16 3l5 5L8 21H3v-5z"/><path d="m13 6 5 5"/>',
  highlighter: '<path d="m9 11 6-6 4 4-6 6"/><path d="M9 11 6 17l1 1 6-3"/><path d="M3 21h7"/>',
  eraser: '<path d="m7 21-4-4 10-10 7 7-7 7z"/><path d="M7 21h13M9 11l6 6"/>',
  lasso: '<path d="M6 14c-3-3 0-9 6-9s9 3.5 7 7-7 4-11 2.5"/><circle cx="7" cy="17" r="2"/><path d="M7 19v2"/>',
  text: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h8M12 9v7"/>',
  sticker: '<path d="M15 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l8-8V9z"/><path d="M13 21v-5a3 3 0 0 1 3-3h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
};
const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

// ============================================================ app state & routing
const state = { view: 'day', date: today(), id: null };
const PLANNER = ['hours', 'day', 'week', 'month', 'year', 'devotion'];

function go(view, opts = {}) {
  Object.assign(state, { view }, opts);
  const h = PLANNER.includes(view) ? `#/${view}/${ymd(state.date)}` : state.id && ['note', 'pdf'].includes(view) ? `#/${view}/${state.id}` : `#/${view}`;
  if (location.hash !== h) history.replaceState(null, '', h);
  render(); desk.scrollTop = 0;
}
function readHash() {
  const [, v, arg] = location.hash.split('/');
  if (!v) return;
  if (PLANNER.includes(v)) { state.view = v; if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) state.date = parseYmd(arg); }
  else if (['note', 'pdf'].includes(v)) { state.view = v; state.id = arg; }
  else state.view = v;
}

// ============================================================ shared components
function checklist(key, o = {}) {
  const items = get(key, []);
  return `<div class="cl" data-key="${esc(key)}">${items.map(it => `
    <div class="row ${it.done ? 'done' : ''} ${o.prayer ? 'prayer' : ''} ${o.prayer && it.done ? 'answered' : ''}" data-id="${it.id}">
      ${o.prayer ? '<span style="width:22px;text-align:center;color:#8E98A2">🙏</span>' : `<input type="checkbox" class="chk" data-act="cl-toggle" ${it.done ? 'checked' : ''} aria-label="Mark done">`}
      <input type="text" value="${esc(it.text)}" data-act="cl-edit" aria-label="Item">
      ${o.tags ? `<button class="tag ${it.tag || ''}" data-act="cl-tag" aria-label="Pillar: ${TAGNAME[it.tag || '']}">${it.tag || '·'}</button>` : ''}
      ${o.prayer ? `<button class="ans ${it.done ? 'on' : ''}" data-act="cl-toggle">${it.done ? 'Answered' : 'Mark answered'}</button>` : ''}
      <button class="x" data-act="cl-del" aria-label="Delete">×</button>
    </div>`).join('')}
    <div class="row addrow"><span style="width:22px;text-align:center;color:#A4AEB8">+</span><input type="text" placeholder="${esc(o.placeholder || 'Add item')}" data-act="cl-add" enterkeyhint="done" data-opts='${esc(JSON.stringify(o))}'></div>
  </div>`;
}
function refreshCl(key, focusAdd) {
  const el = $(`.cl[data-key="${CSS.escape(key)}"]`); if (!el) return;
  const o = JSON.parse($('[data-act=cl-add]', el).dataset.opts || '{}');
  el.outerHTML = checklist(key, o);
  if (focusAdd) $(`.cl[data-key="${CSS.escape(key)}"] [data-act=cl-add]`)?.focus({ preventScroll: true });
}
const bindText = (k, cls = 'lined', ph = '') => `<textarea class="${cls}" data-bind="${esc(k)}" placeholder="${esc(ph)}">${esc(get(k, ''))}</textarea>`;
const bindInput = (k, ph = '', cls = 'plain') => `<input type="text" class="${cls}" data-bind="${esc(k)}" value="${esc(get(k, ''))}" placeholder="${esc(ph)}">`;
function datehead(d, acts = '', sub = '') {
  return `<header class="datehead"><div class="bignum">${d.getDate()}</div><div><div class="dow">${DOW[d.getDay()]}</div>
    <div class="my">${sub || `${MONTHS[d.getMonth()]} ${d.getFullYear()}, week ${isoWeek(d)}`}</div></div><div class="headacts">${acts}</div></header>`;
}
const evBtn = (e, d) => `<button class="ev ${e.tag || ''}" data-act="ev-open" data-id="${e.id}" data-date="${ymd(d)}"><time>${evTime(e)}</time><span>${esc(e.title)}</span></button>`;

// ============================================================ views
const V = {};

V.day = () => {
  const d = state.date, ds = ymd(d), sec = S().day, evs = eventsOn(d), bds = bdaysOn(d);
  const prio = get(`prio:${ds}`, [{}, {}, {}]);
  const blocks = [];
  if (sec.priorities) blocks.push(`<section class="block"><h3>Top priorities</h3>${[0, 1, 2].map(i => `
    <div class="row"><span class="num">${i + 1}</span><input type="text" value="${esc(prio[i]?.text)}" data-act="prio-edit" data-i="${i}" aria-label="Priority ${i + 1}">
    <button class="tag ${prio[i]?.tag || ''}" data-act="prio-tag" data-i="${i}">${prio[i]?.tag || '·'}</button></div>`).join('')}</section>`);
  if (sec.schedule) blocks.push(`<section class="block"><h3>Schedule <span class="cnt">${evs.length || ''}</span><span class="act"><button class="linkish" data-act="ev-new" data-date="${ds}">Add event</button></span></h3>
    ${evs.length ? evs.map(e => evBtn(e, d)).join('') : '<div class="empty">No events. Add one or write it in.</div>'}</section>`);
  if (sec.tasks) blocks.push(`<section class="block"><h3>Tasks<span class="act"><button class="linkish" data-act="carry" data-date="${ds}">Move unfinished to tomorrow</button></span></h3>${checklist(`tasks:${ds}`, { tags: true, placeholder: 'Add a task' })}</section>`);
  if (sec.goals) blocks.push(`<section class="block"><h3>Goals for today</h3>${checklist(`goals:day:${ds}`, { placeholder: 'Add a goal' })}</section>`);
  if (sec.birthdays && bds.length) blocks.push(`<section class="block"><h3>Birthdays</h3>${bds.map(b => `<div class="bday">🎂 <b>${esc(b.name)}</b>${b.year ? `<span class="pill">turns ${d.getFullYear() - b.year}</span>` : ''}</div>`).join('')}</section>`);
  if (sec.notes) blocks.push(`<section class="block wide"><h3>Notes</h3>${bindText(`f:day:${ds}:notes`, 'lined', 'Type, dictate, or write with Apple Pencil')}</section>`);
  if (sec.summary) blocks.push(`<section class="block wide"><h3>Summary of the day</h3>${bindText(`f:day:${ds}:summary`, 'lined', 'Wins, lessons, what carries forward')}</section>`);
  return {
    title: `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
    html: `<div class="sheet" data-ink="day:${ds}">${datehead(d, `<button class="btn small" data-act="go" data-v="devotion">Devotion</button><button class="btn small" data-act="go" data-v="hours">Hourly</button>`)}
      <div class="grid2">${blocks.join('')}</div></div>`,
  };
};

V.hours = () => {
  const d = state.date, ds = ymd(d), s = S(), evs = eventsOn(d), now = new Date();
  const allDay = evs.filter(e => e.allDay);
  let rows = '';
  for (let h = s.dayStart; h <= s.dayEnd; h++) {
    const hh = pad(h), inHour = evs.filter(e => !e.allDay && e.start.slice(0, 2) === hh);
    const isNow = ymd(now) === ds && now.getHours() === h;
    rows += `<div class="hr ${isNow ? 'now' : ''}"><div class="t">${hh}:00</div><div class="c">${inHour.map(e => evBtn(e, d)).join('')}${bindInput(`h:${ds}:${hh}`, '')}${bindInput(`h:${ds}:${hh}:30`, '')}</div></div>`;
  }
  return {
    title: `Hourly · ${d.getDate()} ${MONTHS[d.getMonth()]}`,
    html: `<div class="sheet" data-ink="hours:${ds}">${datehead(d, `<button class="btn small" data-act="ev-new" data-date="${ds}">Add event</button><button class="btn small" data-act="go" data-v="day">Daily page</button>`)}
      ${allDay.length ? `<div style="margin-bottom:14px">${allDay.map(e => evBtn(e, d)).join('')}</div>` : ''}
      <div class="hours">${rows}</div></div>`,
  };
};

V.week = () => {
  const mon = startOfWeek(state.date), sun = addDays(mon, 6), mk = ymd(mon), td = ymd(today());
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), ds = ymd(d), evs = eventsOn(d), tasks = get(`tasks:${ds}`, []), bds = bdaysOn(d);
    cells += `<div class="wcell ${ds === td ? 'today' : ''}"><div class="wd"><button data-act="goday" data-date="${ds}">${d.getDate()}</button><small>${DOW[d.getDay()]}</small></div>
      ${bds.map(b => `<div class="bday">🎂 ${esc(b.name)}</div>`).join('')}
      ${evs.slice(0, 4).map(e => evBtn(e, d)).join('')}${evs.length > 4 ? `<div class="empty">+${evs.length - 4} more</div>` : ''}
      ${tasks.slice(0, 6).map(t => `<label class="wtask"><input type="checkbox" class="chk" data-act="wt-toggle" data-date="${ds}" data-id="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span></label>`).join('')}
      ${tasks.length > 6 ? `<div class="empty">+${tasks.length - 6} more tasks</div>` : ''}</div>`;
  }
  cells += `<div class="wcell"><div class="wd"><small style="font-size:15px;font-weight:600;color:var(--ink)">Week goals</small></div>${checklist(`goals:week:${mk}`, { tags: true, placeholder: 'Add a goal' })}</div>`;
  const range = mon.getMonth() === sun.getMonth() ? `${mon.getDate()}–${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}` : `${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0, 3)} – ${sun.getDate()} ${MONTHS[sun.getMonth()].slice(0, 3)} ${sun.getFullYear()}`;
  return {
    title: `Week ${isoWeek(mon)}`,
    html: `<div class="sheet" data-ink="week:${mk}"><h2 class="title">Week ${isoWeek(mon)}</h2><div class="sub" style="margin-bottom:18px">${range}</div>
      <div class="weekgrid">${cells}</div>
      <section class="block" style="margin-top:22px"><h3>Week notes</h3>${bindText(`f:week:${mk}:notes`, 'lined', 'Reflections, visits planned, follow-ups due')}</section></div>`,
  };
};

V.month = () => {
  const y = state.date.getFullYear(), m = state.date.getMonth(), mk = `${y}-${pad(m + 1)}`, td = ymd(today());
  const first = new Date(y, m, 1), start = startOfWeek(first);
  const weeks = Math.ceil((dayDiff(start, new Date(y, m + 1, 0)) + 1) / 7);
  let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(n => `<div class="dn">${n}</div>`).join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), ds = ymd(d), out = d.getMonth() !== m;
    if (out) { cells += '<div class="mcell out"></div>'; continue; }
    const evs = eventsOn(d), tasks = get(`tasks:${ds}`, []), bds = bdaysOn(d);
    cells += `<div class="mcell ${ds === td ? 'today' : ''}"><button class="d" data-act="goday" data-date="${ds}">${d.getDate()}</button>
      <span class="meta">${bds.length ? '🎂 ' : ''}${tasks.length ? `${tasks.filter(t => t.done).length}/${tasks.length}` : ''}</span>
      ${evs.slice(0, 3).map(e => `<div class="mev ${e.tag || ''}">${e.allDay ? '' : e.start + ' '}${esc(e.title)}</div>`).join('')}
      ${evs.length > 3 ? `<div class="mev" style="background:none">+${evs.length - 3}</div>` : ''}</div>`;
  }
  return {
    title: `${MONTHS[m]} ${y}`,
    html: `<div class="sheet" data-ink="month:${mk}"><h2 class="title">${MONTHS[m]}</h2><div class="sub" style="margin-bottom:18px">${y}</div>
      <div class="mgrid">${cells}</div>
      <div class="grid2" style="margin-top:26px"><section class="block"><h3>Month goals</h3>${checklist(`goals:month:${mk}`, { tags: true, placeholder: 'Add a goal' })}</section>
      <section class="block"><h3>Key dates & notes</h3>${bindText(`f:month:${mk}:notes`, 'lined')}</section></div></div>`,
  };
};

function planYear(d) { const ys = S().yearStart; const y = d.getMonth() + 1 >= ys ? d.getFullYear() : d.getFullYear() - 1; return { y, ys }; }
V.year = () => {
  const { y, ys } = planYear(state.date), td = ymd(today()), key = `${y}-${pad(ys)}`;
  const evAll = get('events', []);
  let mons = '';
  for (let i = 0; i < 12; i++) {
    const first = new Date(y, ys - 1 + i, 1), mm = first.getMonth(), yy = first.getFullYear(), start = startOfWeek(first);
    let days = 'MTWTFSS'.split('').map(c => `<div class="h">${c}</div>`).join('');
    const n = new Date(yy, mm + 1, 0).getDate(), lead = dayDiff(start, first);
    days += '<div></div>'.repeat(lead);
    for (let dd = 1; dd <= n; dd++) {
      const d = new Date(yy, mm, dd), ds = ymd(d);
      const bd = bdaysOn(d).length, has = evAll.some(e => e.repeat === 'none' && occurs(e, d)) || get(`tasks:${ds}`, []).length;
      days += `<button class="${ds === td ? 'today' : ''} ${bd ? 'has bd' : has ? 'has' : ''}" data-act="goday" data-date="${ds}">${dd}</button>`;
    }
    mons += `<div class="ymon"><h4><button data-act="gomonth" data-date="${ymd(first)}">${MONTHS[mm]} <span style="color:var(--faint);font-weight:400">${yy}</span></button></h4><div class="ymini">${days}</div></div>`;
  }
  const endY = new Date(y, ys - 1 + 11, 1);
  const title = ys === 1 ? `${y}` : `${MONTHS[ys - 1].slice(0, 3)} ${y} – ${MONTHS[endY.getMonth()].slice(0, 3)} ${endY.getFullYear()}`;
  const pill = (t, n, c) => `<section class="block pillarh" style="border-color:var(--${c})"><h3>${n} goals</h3>${checklist(`goals:year:${key}:${t}`, { placeholder: 'Add a goal' })}</section>`;
  return {
    title,
    html: `<div class="sheet" data-ink="year:${key}"><h2 class="title">${title}</h2><div class="sub" style="margin-bottom:22px">Dots mark one-off events, tasks and birthdays. Tap a date to open its page.</div>
      <div class="ygrid">${mons}</div><div class="pillars3">${pill('P', 'Personal', 'personal')}${pill('B', 'Business', 'business')}${pill('S', 'Pastoral', 'pastoral')}</div>
      <section class="block" style="margin-top:26px"><h3>Vision for the year</h3>${bindText(`f:year:${key}:vision`, 'lined')}</section></div>`,
  };
};

V.devotion = () => {
  const d = state.date, ds = ymd(d), mood = get(`f:dev:${ds}:mood`, '');
  const moods = [['😊', 'good'], ['😐', 'okay'], ['😔', 'low']].map(([e, v]) => `<button class="${mood === v ? 'on' : ''}" data-act="mood" data-v="${v}" aria-label="Mood ${v}">${e}</button>`).join('');
  return {
    title: `Devotion · ${d.getDate()} ${MONTHS[d.getMonth()]}`,
    html: `<div class="sheet" data-ink="dev:${ds}">${datehead(d, `<div class="moods">${moods}</div>`, `Devotion, ${MONTHS[d.getMonth()]} ${d.getFullYear()}`)}
      <section class="block" style="margin-bottom:22px"><h3>Scripture</h3>
        <div class="row">${bindInput(`f:dev:${ds}:ref`, 'Reference, e.g. Psalm 126:5–6')}</div>
        ${bindText(`f:dev:${ds}:passage`, 'lined serif', 'Write or paste the passage')}</section>
      <div class="grid2">
        <section class="block"><h3>Reflection</h3>${bindText(`f:dev:${ds}:reflection`)}</section>
        <section class="block"><h3>Gratitude</h3>${bindText(`f:dev:${ds}:gratitude`)}</section>
        <section class="block wide"><h3>Prayers</h3>${checklist(`prayers:${ds}`, { prayer: true, placeholder: 'Add a prayer' })}</section>
        <section class="block wide"><h3>Today I will</h3>${bindText(`f:dev:${ds}:apply`, 'lined', 'One practical step from today\u2019s reading')}</section>
      </div></div>`,
  };
};

V.tasks = () => {
  const td = ymd(today()), lists = get('checklists', []);
  const open = [];
  for (const [k, v] of store.map) if (k.startsWith('tasks:') && k.slice(6) < td && Array.isArray(v)) v.forEach(t => { if (!t.done) open.push({ ...t, date: k.slice(6) }); });
  open.sort((a, b) => a.date.localeCompare(b.date));
  return {
    title: 'Tasks & checklists', actions: `<button class="btn primary" data-act="cl-new">New checklist</button>`,
    html: `<div class="panel"><h3>Today</h3>${checklist(`tasks:${td}`, { tags: true, placeholder: 'Add a task for today' })}</div>
      <div class="panel"><h3>Unfinished from earlier days <span class="pill">${open.length}</span></h3>
        ${open.length ? open.map(t => `<div class="listrow"><input type="checkbox" class="chk" data-act="ot-toggle" data-date="${t.date}" data-id="${t.id}"><div class="grow">${esc(t.text)}<small>${parseYmd(t.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</small></div>${t.tag ? `<span class="tag ${t.tag}">${t.tag}</span>` : ''}<button class="btn small" data-act="ot-move" data-date="${t.date}" data-id="${t.id}">Move to today</button></div>`).join('') : '<p>Nothing left behind. Well done.</p>'}</div>
      ${lists.map(l => `<div class="panel"><div class="frow" style="margin-bottom:6px"><input class="notetitle" style="font-size:18px;flex:1" value="${esc(l.name)}" data-act="cl-rename" data-id="${l.id}" aria-label="Checklist name"><button class="btn small danger" data-act="cl-remove" data-id="${l.id}">Delete</button></div>${checklist(`cl:${l.id}`, { tags: true })}</div>`).join('')}`,
  };
};

function nextBday(b) {
  const t = today(); let n = new Date(t.getFullYear(), b.month - 1, b.day);
  if (n < t) n = new Date(t.getFullYear() + 1, b.month - 1, b.day);
  return n;
}
V.birthdays = () => {
  const list = get('birthdays', []).map(b => ({ ...b, next: nextBday(b) })).sort((a, b) => a.next - b.next);
  const dayOpts = Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('');
  const monOpts = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  return {
    title: 'Birthdays', actions: list.length ? `<button class="btn" data-act="bd-ics">Add all to Apple Calendar</button>` : '',
    html: `<div class="panel"><h3>Add a birthday</h3>
      <div class="frow"><label style="flex:2 1 200px">Name<input class="field" id="bdName" placeholder="Name"></label>
      <label>Day<select class="field" id="bdDay">${dayOpts}</select></label><label>Month<select class="field" id="bdMonth">${monOpts}</select></label>
      <label>Year (optional)<input class="field" id="bdYear" inputmode="numeric" placeholder="1980" style="width:110px"></label></div>
      <div class="frow"><label style="flex:1">Note<input class="field" id="bdNote" placeholder="Church member, family, colleague…"></label><button class="btn primary" data-act="bd-add" style="align-self:flex-end">Add birthday</button></div></div>
      <div class="panel"><h3>Coming up</h3>${list.length ? list.map(b => {
        const days = dayDiff(today(), b.next);
        return `<div class="listrow"><span style="font-size:22px">🎂</span><div class="grow"><b style="font-weight:500">${esc(b.name)}</b><small>${b.day} ${MONTHS[b.month - 1]}${b.year ? `, turns ${b.next.getFullYear() - b.year}` : ''}${b.note ? ` · ${esc(b.note)}` : ''}</small></div>
          <span class="pill ${days <= 7 ? 'soon' : ''}">${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`}</span><button class="x" data-act="bd-del" data-id="${b.id}" aria-label="Delete">×</button></div>`;
      }).join('') : '<p>No birthdays yet. Add family, friends and church members above; they appear on your day, week, month and year pages.</p>'}</div>`,
  };
};

// ----- templates
const BUILTIN = [
  { id: 'blank', name: 'Blank', bg: 'none', sections: [] },
  { id: 'lined', name: 'Lined', bg: 'lined', sections: [] },
  { id: 'dots', name: 'Dot grid', bg: 'dots', sections: [] },
  { id: 'grid', name: 'Squared', bg: 'grid', sections: [] },
  { id: 'devotion', name: 'Devotion', bg: 'none', sections: [['Scripture', 5], ['Reflection', 8], ['Gratitude', 4], ['Prayers', 6], ['Application', 3]] },
  { id: 'visit', name: 'Pastoral visit', bg: 'none', sections: [['Name, phone & address', 3], ['Situation & notes', 9], ['Prayer need', 4], ['Scripture shared', 2], ['Next step & follow-up date', 4]] },
  { id: 'minutes', name: 'Meeting minutes', bg: 'none', sections: [['Organisation, date & venue', 2], ['Present & apologies', 3], ['Agenda', 5], ['Minutes', 10], ['Resolutions', 3], ['Action points', 5]] },
  { id: 'study', name: 'Bible study', bg: 'none', sections: [['Passage & topic', 2], ['Observation', 7], ['Interpretation', 6], ['Application', 4], ['Illustrations & sources', 4]] },
  { id: 'sermon', name: 'Sermon outline', bg: 'none', sections: [['Title & text', 2], ['Big idea', 2], ['Introduction', 4], ['Point 1', 5], ['Point 2', 5], ['Point 3', 5], ['Conclusion & appeal', 4]] },
];
const allTemplates = () => [...BUILTIN, ...get('templates', [])];
const tplById = id => allTemplates().find(t => t.id === id) || BUILTIN[1];
const bgClass = bg => (bg && bg !== 'none' ? `bg-${bg}` : '');
const thumb = t => `<div class="thumb ${bgClass(t.bg)}" style="${t.sections.length ? 'background-image:repeating-linear-gradient(to bottom,transparent 0 13px,#1F2B3A 13px 14px,transparent 14px 22px);background-size:100% 22px;opacity:.35' : ''}"></div>`;

V.templates = () => {
  const custom = get('templates', []);
  return {
    title: 'Templates', actions: `<button class="btn primary" data-act="tpl-new">Create template</button>`,
    html: `<div class="toolbar-row"><p class="sub" style="margin:0">Templates set the paper and sections of a new note. Tap one to start a note with it.</p></div>
      <div class="toolbar-row" style="display:block"><div class="cards">${custom.map(t => `<button class="card" data-act="note-create" data-tpl="${t.id}">${thumb(t)}<b>${esc(t.name)}</b><small>${t.sections.length} sections</small><span class="linkish" data-act="tpl-edit" data-id="${t.id}">Edit template</span></button>`).join('')}
      <button class="card new" data-act="tpl-new">+ Create template</button>
      ${BUILTIN.map(t => `<button class="card" data-act="note-create" data-tpl="${t.id}">${thumb(t)}<b>${t.name}</b><small>${t.sections.length ? `${t.sections.length} sections` : 'Paper'}</small></button>`).join('')}</div></div>`,
  };
};

// ----- notes
V.notes = () => {
  const notes = [...get('notes', [])].sort((a, b) => b.updated - a.updated);
  return {
    title: 'Notes', actions: `<button class="btn primary" data-act="note-new">New note</button>`,
    html: `<div class="toolbar-row" style="display:block"><div class="cards"><button class="card new" data-act="note-new">+ New note</button>
      ${notes.map(n => { const t = tplById(n.tpl); return `<button class="card" data-act="note-open" data-id="${n.id}">${thumb(t)}<b>${esc(n.title)}</b><small>${t.name} · ${n.pages} page${n.pages > 1 ? 's' : ''}</small><small>${new Date(n.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small></button>`; }).join('')}</div></div>`,
  };
};
V.note = () => {
  const n = get('notes', []).find(x => x.id === state.id);
  if (!n) return { title: 'Note not found', html: `<div class="panel"><p>This note no longer exists.</p><button class="btn" data-act="nav" data-v="notes">Back to notes</button></div>` };
  const t = tplById(n.tpl);
  let pages = '';
  for (let p = 1; p <= n.pages; p++) {
    const secs = p === 1 ? t.sections.map(([title, lines]) => `<div class="tsec"><h3>${esc(title)}</h3><div class="area" style="height:${lines * 32 + 6}px"></div></div>`).join('') : '';
    pages += `<div class="sheet note ${bgClass(t.bg)}" data-ink="note:${n.id}:${p}">${p === 1 ? `<input class="notetitle" value="${esc(n.title)}" data-act="note-title" aria-label="Note title" style="margin-bottom:18px">` : ''}${secs}</div>
      <div class="pagehint">Page ${p} of ${n.pages}${n.pages > 1 ? ` · <button class="linkish" data-act="note-delpage" data-p="${p}">Remove page</button>` : ''}</div>`;
  }
  return {
    title: n.title, back: 'notes',
    actions: `<button class="btn" data-act="note-addpage">Add page</button><button class="btn danger" data-act="note-delete">Delete</button>`,
    html: pages,
  };
};

// ----- PDFs
V.pdfs = () => {
  const list = get('pdfs', []);
  return {
    title: 'PDFs', actions: `<button class="btn primary" data-act="pdf-import">Import PDF</button>`,
    html: `<div class="toolbar-row" style="display:block"><div class="cards"><button class="card new" data-act="pdf-import">+ Import PDF</button>
      ${list.map(p => `<button class="card" data-act="pdf-open" data-id="${p.id}"><div class="thumb" style="display:grid;place-items:center;font-size:26px">📄</div><b>${esc(p.name)}</b><small>${p.pages} page${p.pages > 1 ? 's' : ''} · ${new Date(p.added).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></button>`).join('')}</div></div>`,
  };
};
V.pdf = () => {
  const p = get('pdfs', []).find(x => x.id === state.id);
  if (!p) return { title: 'PDF not found', html: `<div class="panel"><p>This PDF no longer exists.</p></div>` };
  return {
    title: p.name, back: 'pdfs',
    actions: `<button class="btn" data-act="pdf-export">Export annotated PDF</button><button class="btn danger" data-act="pdf-delete">Delete</button>`,
    html: p.sizes.map(([w, h], i) => `<div class="sheet pdfpage" style="aspect-ratio:${w}/${h}" data-ink="pdf:${p.id}:${i + 1}" data-page="${i + 1}"></div><div class="pagehint">Page ${i + 1} of ${p.pages}</div>`).join(''),
    after: () => renderPdfPages(p),
  };
};

// ----- settings & backup
V.settings = () => {
  const s = S(), cals = [...new Set(get('events', []).filter(e => e.cal && e.cal !== 'local').map(e => e.cal))];
  const hourOpts = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map(h => `<option value="${h}" ${h === sel ? 'selected' : ''}>${pad(h)}:00</option>`).join('');
  const tg = (k, label, sub, on) => `<label class="switch"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" class="tgl" data-act="set-toggle" data-k="${k}" ${on ? 'checked' : ''}></label>`;
  const lb = get('lastBackup');
  const evs = get('events', []).filter(e => e.cal === 'local');
  return {
    title: 'Backup & settings',
    html: `<div class="panel"><h3>Your data</h3>
      <p>${store.db ? 'Everything is saved on this iPad only. Nothing is sent to the internet.' : 'Storage is not available here, so changes are temporary.'} ${lb ? `Last backup: ${new Date(lb).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'You have not made a backup yet.'}</p>
      <div class="frow"><button class="btn primary" data-act="backup">Back up to Files</button><button class="btn" data-act="restore">Restore from backup</button></div></div>

      <div class="panel"><h3>Apple Calendar</h3>
      <p>Bring events in by exporting a calendar as an .ics file and importing it here. Send events out with Export; iPadOS then offers to add them to Calendar.</p>
      <div class="frow"><button class="btn" data-act="ics-import">Import .ics file</button><button class="btn" data-act="ics-export">Export my events</button><button class="btn" data-act="ev-new" data-date="${ymd(today())}">Add event</button></div>
      ${cals.map(c => `<div class="listrow"><div class="grow">${esc(c)}<small>${get('events', []).filter(e => e.cal === c).length} imported events</small></div><button class="btn small danger" data-act="cal-remove" data-cal="${esc(c)}">Remove</button></div>`).join('')}
      ${evs.length ? `<h3 style="margin-top:18px;font-size:15px">My events</h3>${evs.map(e => `<div class="listrow"><div class="grow">${esc(e.title)}<small>${evTime(e)} · ${e.repeat === 'none' ? parseYmd(e.date).toLocaleDateString('en-GB') : { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[e.repeat]}${e.until ? ` until ${parseYmd(e.until).toLocaleDateString('en-GB')}` : ''}</small></div><button class="btn small" data-act="ev-open" data-id="${e.id}" data-date="${e.date}">Edit</button></div>`).join('')}` : ''}
      </div>

      <div class="panel"><h3>Writing</h3>
      ${tg('pencilOnly', 'Draw with Apple Pencil only', 'Fingers scroll and tap buttons; only the Pencil writes.', s.pencilOnly)}
      <p style="margin-top:12px">To turn handwriting into text, choose the Type tool in the dock and write with Apple Pencil in any text field — iPadOS Scribble converts it on the device. To dictate, tap a field and use the microphone button at the top or on the keyboard.</p></div>

      <div class="panel"><h3>Planner</h3>
      <div class="frow"><label>Your name<input class="field" data-act="set-text" data-k="name" value="${esc(s.name)}"></label>
      <label>Hourly planner starts<select class="field" data-act="set-num" data-k="dayStart">${hourOpts(s.dayStart, 0, 12)}</select></label>
      <label>Hourly planner ends<select class="field" data-act="set-num" data-k="dayEnd">${hourOpts(s.dayEnd, 13, 23)}</select></label>
      <label>Planning year starts in<select class="field" data-act="set-num" data-k="yearStart">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === s.yearStart ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <h3 style="margin-top:10px;font-size:15px">Daily page sections</h3>
      ${tg('day.priorities', 'Top priorities', '', s.day.priorities)}${tg('day.schedule', 'Schedule', '', s.day.schedule)}${tg('day.tasks', 'Tasks', '', s.day.tasks)}
      ${tg('day.goals', 'Goals for today', '', s.day.goals)}${tg('day.birthdays', 'Birthdays', '', s.day.birthdays)}${tg('day.notes', 'Notes', '', s.day.notes)}${tg('day.summary', 'Summary of the day', '', s.day.summary)}</div>`,
  };
};

// ============================================================ chrome: sidebar, top bar, dock
const NAV = [
  ['today', 'Today', 'today'], ['g', 'Planner'], ['hours', 'Hourly', 'hours'], ['day', 'Daily', 'day'], ['week', 'Weekly', 'week'], ['month', 'Monthly', 'month'], ['year', 'Yearly', 'year'],
  ['devotion', 'Devotion', 'devotion'], ['g', 'Organise'], ['tasks', 'Tasks & checklists', 'tasks'], ['birthdays', 'Birthdays', 'birthdays'], ['notes', 'Notes', 'notes'], ['pdfs', 'PDFs', 'pdf'], ['templates', 'Templates', 'templates'],
  ['g', ''], ['settings', 'Backup & settings', 'settings'],
];
function renderSide() {
  const td = ymd(today());
  $('#side').innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt=""><b>Pastoral Planner<small>${esc(S().name)}</small></b></div>
    ${NAV.map(([v, label, icon]) => v === 'g' ? `<div class="navgroup">${label}</div>` : `<button class="navbtn ${v === state.view || (v === 'today' && state.view === 'day' && ymd(state.date) === td) || (v === 'notes' && state.view === 'note') || (v === 'pdfs' && state.view === 'pdf') ? 'on' : ''} ${v === 'day' && ymd(state.date) === td && state.view === 'day' ? '' : ''}" data-act="nav" data-v="${v}" title="${label}">${svg(icon)}<span>${label}</span></button>`).join('')}
    <div class="side-foot"><i class="dot ${store.db ? '' : 'warn'}"></i><span>${store.db ? 'Saved on this iPad' : 'Temporary storage'}</span></div>`;
  $$('#side .navbtn').forEach(b => { if (b.dataset.v === 'day' && state.view === 'day' && ymd(state.date) === td) b.classList.remove('on'); });
}
function renderTop(v) {
  const planner = PLANNER.includes(state.view);
  const seg = ['hours', 'day', 'week', 'month', 'year'];
  $('#top').innerHTML = `
    ${v.back ? `<button class="iconbtn" data-act="nav" data-v="${v.back}" aria-label="Back">${svg('left')}</button>` : ''}
    ${planner ? `<div class="tnav"><button class="iconbtn" data-act="prev" aria-label="Previous">${svg('left')}</button><button class="btn small" data-act="today">Today</button><button class="iconbtn" data-act="next" aria-label="Next">${svg('right')}</button></div>` : ''}
    <h1>${esc(v.title)}</h1>
    ${planner ? `<div class="seg">${seg.map(s => `<button class="${state.view === s ? 'on' : ''}" data-act="go" data-v="${s}">${{ hours: 'Hour', day: 'Day', week: 'Week', month: 'Month', year: 'Year' }[s]}</button>`).join('')}</div>` : `<div style="margin-left:auto;display:flex;gap:8px">${v.actions || ''}</div>`}
    <button class="iconbtn" data-act="dictate" aria-label="Dictate into the selected field">${svg('mic')}</button>`;
}

const PEN_COLORS = ['#1F2B3A', '#3C6DB4', '#3D8B67', '#C8872F', '#B4443C', '#6B4FA0'];
const HL_COLORS = ['#F5D547', '#9BE3B0', '#A9CBF5', '#F5A9C8'];
const PEN_W = [1.6, 2.8, 5], HL_W = [14, 22, 32];
function tool() { return { t: 'pen', pen: { c: PEN_COLORS[0], w: PEN_W[1] }, hl: { c: HL_COLORS[0], w: HL_W[1] }, ...get('tool', {}) }; }
function setTool(patch) { put('tool', { ...tool(), ...patch }); applyTool(); renderDock(); }
function applyTool() {
  const t = tool().t; document.body.className = document.body.className.replace(/\btool-\S+/g, '').trim();
  document.body.classList.add(`tool-${t}`);
  if (t !== 'lasso') surfaces.forEach(s => s.clearSel());
}
function renderDock() {
  const dock = $('#dock');
  if (!surfaces.length) { dock.hidden = true; return; }
  dock.hidden = false;
  const T = tool(), hl = T.t === 'highlighter', cfg = hl ? T.hl : T.pen, colors = hl ? HL_COLORS : PEN_COLORS, widths = hl ? HL_W : PEN_W;
  const a = activeSurface;
  const tb = (t, label) => `<button class="tb ${T.t === t ? 'on' : ''}" data-act="tool" data-t="${t}" aria-label="${label}" title="${label}">${svg(t)}</button>`;
  dock.innerHTML = `${tb('hand', 'Type & tap')}${tb('pen', 'Pen')}${tb('highlighter', 'Highlighter')}${tb('eraser', 'Eraser')}${tb('lasso', 'Lasso: select and move')}${tb('text', 'Text box')}
    <span class="sep"></span>${['pen', 'highlighter', 'text'].includes(T.t) ? colors.map(c => `<button class="sw ${cfg.c === c ? 'on' : ''}" style="background:${c}" data-act="color" data-c="${c}" aria-label="Colour"></button>`).join('')
      + (T.t !== 'text' ? `<span class="sep"></span>${widths.map((w, i) => `<button class="wd ${cfg.w === w ? 'on' : ''}" data-act="width" data-w="${w}" aria-label="Thickness ${i + 1}"><i style="width:${6 + i * 5}px;height:${6 + i * 5}px"></i></button>`).join('')}` : '') + '<span class="sep"></span>' : ''}
    <button class="tb" data-act="stickers" aria-label="Stickers" title="Stickers">${svg('sticker')}</button>
    <button class="tb" data-act="image" aria-label="Insert image" title="Insert image">${svg('image')}</button>
    <span class="sep"></span>
    <button class="tb" data-act="undo" aria-label="Undo" ${a?.hist.length ? '' : 'disabled'}>${svg('undo')}</button>
    <button class="tb" data-act="redo" aria-label="Redo" ${a?.fut.length ? '' : 'disabled'}>${svg('redo')}</button>
    <button class="pencil ${S().pencilOnly ? 'on' : ''}" data-act="pencil" title="Draw with Apple Pencil only">Pencil<span class="long"> only</span></button>`;
}

// ============================================================ ink engine
const LW = 1000; // logical page width
let surfaces = [], activeSurface = null;

function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
function drawStroke(ctx, s, k) {
  const p = s.p; if (!p?.length) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  if (s.t === 'h') {
    ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = 'multiply'; ctx.lineWidth = s.w * k;
    ctx.beginPath(); ctx.moveTo(p[0][0] * k, p[0][1] * k);
    for (let i = 1; i < p.length - 1; i++) { const m = mid(p[i], p[i + 1]); ctx.quadraticCurveTo(p[i][0] * k, p[i][1] * k, m[0] * k, m[1] * k); }
    const l = p[p.length - 1]; ctx.lineTo(l[0] * k + 0.01, l[1] * k); ctx.stroke();
  } else if (p.length < 3) {
    ctx.beginPath(); ctx.arc(p[0][0] * k, p[0][1] * k, Math.max(0.8, s.w * k * 0.55), 0, Math.PI * 2); ctx.fill();
    if (p.length === 2) { ctx.lineWidth = s.w * k; ctx.beginPath(); ctx.moveTo(p[0][0] * k, p[0][1] * k); ctx.lineTo(p[1][0] * k, p[1][1] * k); ctx.stroke(); }
  } else {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], m0 = i > 1 ? mid(p[i - 2], a) : a, m1 = i === p.length - 1 ? b : mid(a, b);
      ctx.lineWidth = Math.max(0.7, s.w * k * (0.45 + 0.85 * a[2]));
      ctx.beginPath(); ctx.moveTo(m0[0] * k, m0[1] * k); ctx.quadraticCurveTo(a[0] * k, a[1] * k, m1[0] * k, m1[1] * k); ctx.stroke();
    }
  }
  ctx.restore();
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const STICKERS = ['🙏', '✝️', '📖', '🕊️', '⛪', '❤️', '⭐', '✅', '📌', '💡', '🔥', '⚠️', '🎂', '🎉', '📞', '✉️', '🚗', '🏥', '👨‍👩‍👧', '🤝', '🎤', '🎵', '☀️', '🌙', '📅', '⏰', '💰', '✈️', '🌱', '👑'];

class Surface {
  constructor(sheet) {
    this.sheet = sheet; this.key = sheet.dataset.ink;
    const saved = get('ink:' + this.key);
    this.data = saved ? JSON.parse(JSON.stringify(saved)) : { s: [], o: [] };
    this.hist = []; this.fut = []; this.sel = null; this.cur = null;
    this.cv = document.createElement('canvas'); this.cv.className = 'ink';
    this.ctx = this.cv.getContext('2d');
    this.objs = document.createElement('div'); this.objs.className = 'objs';
    sheet.append(this.cv, this.objs);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(sheet);
    this.cv.addEventListener('pointerdown', e => this.down(e));
    this.cv.addEventListener('pointermove', e => this.move(e));
    this.cv.addEventListener('pointerup', e => this.up(e));
    this.cv.addEventListener('pointercancel', e => this.up(e, true));
    this.resize();
  }
  get k() { return (this.w / LW) * this.dpr; }
  get scale() { return this.w / LW; }
  dispose() { this.ro.disconnect(); }
  resize() {
    const w = this.sheet.clientWidth, h = this.sheet.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; }
    this.redraw(); this.renderObjs();
  }
  redraw(extra) {
    const { ctx } = this; ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    for (const s of this.data.s) drawStroke(ctx, s, this.k);
    if (extra) extra(ctx);
  }
  pt(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) / this.scale, (e.clientY - r.top) / this.scale, e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5]; }
  snap() { this.hist.push(JSON.stringify(this.data)); if (this.hist.length > 60) this.hist.shift(); this.fut = []; }
  save() {
    if (!this.data.s.length && !this.data.o.length) remove('ink:' + this.key); else put('ink:' + this.key, this.data);
    if (this.key.startsWith('note:')) touchNote(this.key.split(':')[1]);
    renderDock();
  }
  undo() { if (!this.hist.length) return; this.fut.push(JSON.stringify(this.data)); this.data = JSON.parse(this.hist.pop()); this.after(); }
  redo() { if (!this.fut.length) return; this.hist.push(JSON.stringify(this.data)); this.data = JSON.parse(this.fut.pop()); this.after(); }
  after() { this.clearSel(); this.redraw(); this.renderObjs(); this.save(); }

  down(e) {
    activeSurface = this;
    const T = tool();
    if (T.t === 'hand') return;
    if (S().pencilOnly && e.pointerType === 'touch') {
      this.finger = { id: e.pointerId, x: e.clientX, y: e.clientY, st: desk.scrollTop, moved: false };
      this.cv.setPointerCapture(e.pointerId); return;
    }
    if (this.pid != null) return; // ignore extra contacts while writing
    e.preventDefault(); this.cv.setPointerCapture(e.pointerId); this.pid = e.pointerId;
    const p = this.pt(e);
    if (T.t === 'text') { this.pid = null; this.addText(p); return; }
    if (T.t === 'lasso') { this.clearSel(); this.lasso = [p]; return; }
    this.base = document.createElement('canvas'); this.base.width = this.cv.width; this.base.height = this.cv.height;
    this.base.getContext('2d').drawImage(this.cv, 0, 0);
    this.snap();
    if (T.t === 'eraser') { this.erased = false; this.eraseAt(p); return; }
    const hl = T.t === 'highlighter';
    this.cur = { t: hl ? 'h' : 'p', c: hl ? T.hl.c : T.pen.c, w: hl ? T.hl.w : T.pen.w, p: [p] };
    this.drawLive();
  }
  move(e) {
    if (this.finger && e.pointerId === this.finger.id) {
      const dy = e.clientY - this.finger.y, dx = e.clientX - this.finger.x;
      if (Math.abs(dy) + Math.abs(dx) > 8) this.finger.moved = true;
      desk.scrollTop = this.finger.st - dy; return;
    }
    if (e.pointerId !== this.pid) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const T = tool().t;
    if (this.lasso) { for (const ce of evs) this.lasso.push(this.pt(ce)); this.redraw(ctx => this.drawLasso(ctx)); return; }
    if (T === 'eraser') { for (const ce of evs) this.eraseAt(this.pt(ce)); return; }
    if (this.cur) { for (const ce of (evs.length ? evs : [e])) this.cur.p.push(this.pt(ce)); this.drawLive(); }
  }
  up(e, cancelled) {
    if (this.finger && e.pointerId === this.finger.id) {
      const f = this.finger; this.finger = null;
      if (!f.moved && !cancelled) forwardTap(e.clientX, e.clientY);
      return;
    }
    if (e.pointerId !== this.pid) return;
    this.pid = null;
    if (this.lasso) { const poly = this.lasso; this.lasso = null; this.redraw(); if (poly.length > 4) this.selectPoly(poly); return; }
    if (tool().t === 'eraser') { if (this.erased) this.save(); else this.hist.pop(); this.base = null; renderDock(); return; }
    if (this.cur) {
      if (!cancelled) this.data.s.push(this.cur);
      else this.hist.pop();
      this.cur = null; this.base = null; this.redraw(); this.save();
    }
  }
  drawLive() {
    const { ctx } = this; ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.drawImage(this.base, 0, 0); drawStroke(ctx, this.cur, this.k);
  }
  drawLasso(ctx) {
    const k = this.k; ctx.save(); ctx.setLineDash([6 * this.dpr, 5 * this.dpr]); ctx.strokeStyle = '#3C6DB4'; ctx.lineWidth = 1.5 * this.dpr;
    ctx.beginPath(); this.lasso.forEach((p, i) => (i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k))); ctx.stroke(); ctx.restore();
  }
  eraseAt(p) {
    const r = 10 / Math.min(1, this.scale);
    const before = this.data.s.length;
    this.data.s = this.data.s.filter(s => !s.p.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < r + s.w / 2));
    if (this.data.s.length !== before) { this.erased = true; this.redraw(); }
  }

  // ----- objects: text boxes, images, stickers
  addText(p) {
    this.snap();
    const o = { id: uid(), type: 'text', x: p[0], y: p[1] - 14, w: 380, size: 20, c: tool().pen.c, text: '' };
    this.data.o.push(o); this.renderObjs();
    setTimeout(() => $(`[data-oid="${o.id}"] textarea`, this.objs)?.focus(), 30);
  }
  addObject(o) { this.snap(); this.data.o.push(o); this.renderObjs(); this.save(); setTool({ t: 'lasso' }); this.select({ s: [], o: [o] }); }
  objHeight(o) { if (o.type !== 'text') return o.h; const el = $(`[data-oid="${o.id}"]`, this.objs); return el ? el.offsetHeight / this.scale : o.size * 1.4; }
  renderObjs() {
    const sc = this.scale || 1;
    this.objs.innerHTML = this.data.o.map(o => {
      const base = `left:${o.x * sc}px;top:${o.y * sc}px;width:${o.w * sc}px;`;
      if (o.type === 'text') return `<div class="obj text" data-oid="${o.id}" style="${base}"><textarea rows="1" style="font-size:${o.size * sc}px;color:${o.c}" aria-label="Text box">${esc(o.text)}</textarea></div>`;
      if (o.type === 'img') return `<div class="obj img" data-oid="${o.id}" style="${base}height:${o.h * sc}px"><img src="${o.src}" alt=""></div>`;
      return `<div class="obj sticker" data-oid="${o.id}" style="${base}height:${o.h * sc}px;font-size:${o.h * sc * 0.82}px">${o.e}</div>`;
    }).join('');
    $$('.obj', this.objs).forEach(el => {
      const o = this.data.o.find(x => x.id === el.dataset.oid);
      const ta = $('textarea', el);
      if (ta) {
        const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
        requestAnimationFrame(grow);
        ta.addEventListener('input', () => { o.text = ta.value; grow(); clearTimeout(this._tt); this._tt = setTimeout(() => this.save(), 400); });
        ta.addEventListener('blur', () => { if (!o.text.trim()) { this.data.o = this.data.o.filter(x => x !== o); this.renderObjs(); } this.save(); });
      }
      el.addEventListener('pointerdown', e => {
        activeSurface = this;
        if (tool().t !== 'lasso') return;
        e.preventDefault(); e.stopPropagation(); this.select({ s: [], o: [o] }); this.startDrag(e);
      });
    });
    if (this.sel) this.renderSel();
  }

  // ----- selection
  selectPoly(poly) {
    const s = this.data.s.filter(st => st.p.filter(q => pointInPoly(q[0], q[1], poly)).length >= st.p.length * 0.5);
    const o = this.data.o.filter(ob => pointInPoly(ob.x + ob.w / 2, ob.y + this.objHeight(ob) / 2, poly));
    if (s.length || o.length) this.select({ s, o });
  }
  select(sel) { this.sel = sel; this.renderSel(); }
  clearSel() { this.sel = null; $('.selbox', this.objs)?.remove(); }
  bbox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of this.sel.s) for (const q of st.p) { x0 = Math.min(x0, q[0] - st.w); y0 = Math.min(y0, q[1] - st.w); x1 = Math.max(x1, q[0] + st.w); y1 = Math.max(y1, q[1] + st.w); }
    for (const o of this.sel.o) { const h = this.objHeight(o); x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + h); }
    return { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
  }
  renderSel() {
    $('.selbox', this.objs)?.remove();
    if (!this.sel) return;
    const b = this.bbox(), sc = this.scale, box = document.createElement('div');
    box.className = 'selbox';
    Object.assign(box.style, { left: b.x * sc + 'px', top: b.y * sc + 'px', width: b.w * sc + 'px', height: b.h * sc + 'px' });
    box.innerHTML = `<div class="selbar"><button class="del" data-sel="delete">Delete</button><button data-sel="dup">Duplicate</button></div><div class="selhandle" aria-label="Resize"></div>`;
    this.objs.append(box);
    box.addEventListener('pointerdown', e => {
      const btn = e.target.closest('[data-sel]');
      if (btn) return;
      e.preventDefault(); e.stopPropagation();
      if (e.target.classList.contains('selhandle')) this.startResize(e, b); else this.startDrag(e);
    });
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-sel]')?.dataset.sel; if (!a) return;
      this.snap();
      if (a === 'delete') { this.data.s = this.data.s.filter(s => !this.sel.s.includes(s)); this.data.o = this.data.o.filter(o => !this.sel.o.includes(o)); this.clearSel(); }
      else {
        const s = this.sel.s.map(st => ({ ...st, p: st.p.map(q => [q[0] + 24, q[1] + 24, q[2]]) }));
        const o = this.sel.o.map(ob => ({ ...ob, id: uid(), x: ob.x + 24, y: ob.y + 24 }));
        this.data.s.push(...s); this.data.o.push(...o); this.sel = { s, o };
      }
      this.redraw(); this.renderObjs(); this.save();
    });
  }
  startDrag(e) {
    this.snap();
    let lx = e.clientX, ly = e.clientY; const id = e.pointerId, tgt = e.target;
    tgt.setPointerCapture?.(id);
    const mv = ev => {
      if (ev.pointerId !== id) return;
      const dx = (ev.clientX - lx) / this.scale, dy = (ev.clientY - ly) / this.scale; lx = ev.clientX; ly = ev.clientY;
      for (const st of this.sel.s) for (const q of st.p) { q[0] += dx; q[1] += dy; }
      for (const o of this.sel.o) { o.x += dx; o.y += dy; }
      this.redraw(); this.positionObjs(); this.renderSel();
    };
    const end = ev => { if (ev.pointerId !== id) return; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); this.save(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
  startResize(e, b) {
    this.snap();
    const sx = e.clientX, id = e.pointerId;
    const orig = { s: this.sel.s.map(st => ({ w: st.w, p: st.p.map(q => [...q]) })), o: this.sel.o.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, size: o.size })) };
    const mv = ev => {
      if (ev.pointerId !== id) return;
      const f = Math.max(0.2, (b.w + (ev.clientX - sx) / this.scale) / b.w);
      this.sel.s.forEach((st, i) => { st.w = orig.s[i].w * f; st.p = orig.s[i].p.map(q => [b.x + (q[0] - b.x) * f, b.y + (q[1] - b.y) * f, q[2]]); });
      this.sel.o.forEach((o, i) => { const g = orig.o[i]; o.x = b.x + (g.x - b.x) * f; o.y = b.y + (g.y - b.y) * f; o.w = g.w * f; if (g.h) o.h = g.h * f; if (g.size) o.size = g.size * f; });
      this.redraw(); this.renderObjs();
    };
    const end = ev => { if (ev.pointerId !== id) return; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); this.save(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
  positionObjs() {
    const sc = this.scale;
    for (const o of this.sel?.o || []) { const el = $(`[data-oid="${o.id}"]`, this.objs); if (el) { el.style.left = o.x * sc + 'px'; el.style.top = o.y * sc + 'px'; } }
  }
}

function forwardTap(x, y) {
  document.body.classList.add('passthru');
  $$('.sheet .ink').forEach(c => (c.style.pointerEvents = 'none'));
  const el = document.elementFromPoint(x, y);
  $$('.sheet .ink').forEach(c => (c.style.pointerEvents = ''));
  document.body.classList.remove('passthru');
  const f = el?.closest('input,textarea,select,button,label,a,[data-act]');
  if (!f) { document.activeElement?.blur?.(); return; }
  if (f.matches('input[type=checkbox]')) f.click();
  else if (f.matches('input,textarea,select')) f.focus();
  else if (f.matches('label')) { const inp = $('input', f); inp ? inp.click() : f.click(); }
  else f.click();
}
function visibleSurface() {
  const mid = desk.getBoundingClientRect().top + desk.clientHeight / 2;
  return surfaces.find(s => { const r = s.sheet.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }) || activeSurface || surfaces[0];
}
function visibleCenter(s) {
  const r = s.sheet.getBoundingClientRect(), dr = desk.getBoundingClientRect();
  const top = Math.max(r.top, dr.top), bottom = Math.min(r.bottom, dr.bottom);
  return [LW / 2, ((top + bottom) / 2 - r.top) / s.scale];
}

// ============================================================ render
function disposeSurfaces() { surfaces.forEach(s => s.dispose()); surfaces = []; activeSurface = null; }
function autosize(ta) { if (!ta.classList.contains('lined')) return; ta.style.height = 'auto'; ta.style.height = Math.max(160, Math.ceil(ta.scrollHeight / 32) * 32 + 2) + 'px'; }
function render() {
  disposeSurfaces(); closePop();
  const v = (V[state.view] || V.day)();
  renderSide(); renderTop(v);
  desk.innerHTML = (store.db ? '' : `<div class="banner">Local storage isn't available in this window, so changes last only until you close it. Open the installed app on your iPad to keep your data.</div>`) + v.html;
  $$('textarea.lined', desk).forEach(autosize);
  $$('.sheet[data-ink]', desk).forEach(sh => surfaces.push(new Surface(sh)));
  activeSurface = surfaces[0] || null;
  applyTool(); renderDock();
  v.after?.();
}
function rerender() { const st = desk.scrollTop; render(); desk.scrollTop = st; }

// ============================================================ modals & popovers
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });
function closePop() { const p = $('#pop'); p.hidden = true; p.innerHTML = ''; }

function eventModal(ev, occDate) {
  const isNew = !ev;
  ev = ev || { id: uid(), title: '', date: occDate, allDay: false, start: '09:00', end: '10:00', repeat: 'none', days: [], interval: 1, until: '', exdates: [], tag: 'B', notes: '', location: '', cal: 'local' };
  const rep = { none: 'Does not repeat', daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };
  const daysSel = ev.days?.length ? ev.days : [parseYmd(ev.date).getDay()];
  openModal(`<h3>${isNew ? 'New event' : 'Edit event'}</h3>
    <div class="frow"><label style="flex:1 1 100%">Title<input class="field" id="evTitle" value="${esc(ev.title)}" placeholder="Title"></label></div>
    <div class="frow"><label>Date<input class="field" type="date" id="evDate" value="${ev.date}"></label>
      <label>Starts<input class="field" type="time" id="evStart" value="${ev.start}" ${ev.allDay ? 'disabled' : ''}></label>
      <label>Ends<input class="field" type="time" id="evEnd" value="${ev.end}" ${ev.allDay ? 'disabled' : ''}></label></div>
    <label class="switch"><span>All day</span><input type="checkbox" class="tgl" id="evAllDay" ${ev.allDay ? 'checked' : ''}></label>
    <div class="frow" style="margin-top:12px"><label>Repeat<select class="field" id="evRepeat">${Object.entries(rep).map(([k, l]) => `<option value="${k}" ${ev.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Until (optional)<input class="field" type="date" id="evUntil" value="${ev.until || ''}"></label>
      <label>Pillar<select class="field" id="evTag">${['P', 'B', 'S'].map(t => `<option value="${t}" ${ev.tag === t ? 'selected' : ''}>${TAGNAME[t]}</option>`).join('')}</select></label></div>
    <div class="frow" id="evDays" style="${ev.repeat === 'weekly' ? '' : 'display:none'}">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => `<button class="btn small ${daysSel.includes(i) ? 'primary' : ''}" data-day="${i}" type="button">${n}</button>`).join('')}</div>
    <div class="frow"><label style="flex:1 1 100%">Location<input class="field" id="evLoc" value="${esc(ev.location)}"></label></div>
    <div class="frow"><label style="flex:1 1 100%">Notes<textarea class="field" id="evNotes" rows="3">${esc(ev.notes)}</textarea></label></div>
    <div class="acts">${isNew ? '' : `<button class="btn danger left" id="evDel">${ev.repeat !== 'none' ? 'Delete series' : 'Delete'}</button>${ev.repeat !== 'none' ? `<button class="btn danger" id="evDelOne">Delete this day</button>` : ''}`}
      <button class="btn" id="evIcs">Add to Apple Calendar</button><button class="btn" id="evCancel">Cancel</button><button class="btn primary" id="evSave">Save</button></div>`);
  const m = $('#modal');
  $('#evAllDay', m).onchange = e => { $('#evStart', m).disabled = $('#evEnd', m).disabled = e.target.checked; };
  $('#evRepeat', m).onchange = e => { $('#evDays', m).style.display = e.target.value === 'weekly' ? '' : 'none'; };
  $$('#evDays [data-day]', m).forEach(b => (b.onclick = () => b.classList.toggle('primary')));
  const read = () => ({
    ...ev, title: $('#evTitle', m).value.trim() || 'Untitled event', date: $('#evDate', m).value || ev.date, allDay: $('#evAllDay', m).checked,
    start: $('#evStart', m).value || '09:00', end: $('#evEnd', m).value || '10:00', repeat: $('#evRepeat', m).value, until: $('#evUntil', m).value,
    days: $$('#evDays .primary', m).map(b => +b.dataset.day), tag: $('#evTag', m).value, location: $('#evLoc', m).value, notes: $('#evNotes', m).value,
  });
  $('#evCancel', m).onclick = closeModal;
  $('#evSave', m).onclick = () => {
    const e = read(); if (e.end < e.start) e.end = e.start;
    const list = get('events', []).filter(x => x.id !== e.id); list.push(e); put('events', list); closeModal(); rerender(); toast('Event saved');
  };
  $('#evIcs', m).onclick = () => saveFile(`${read().title}.ics`, new Blob([buildIcs([read()])], { type: 'text/calendar' }), false);
  if (!isNew) {
    $('#evDel', m).onclick = () => { if (!confirm(`Delete “${ev.title}”${ev.repeat !== 'none' ? ' and all its repeats' : ''}?`)) return; put('events', get('events', []).filter(x => x.id !== ev.id)); closeModal(); rerender(); toast('Event deleted'); };
    const one = $('#evDelOne', m);
    if (one) one.onclick = () => { const list = get('events', []); const x = list.find(y => y.id === ev.id); x.exdates = [...(x.exdates || []), occDate]; put('events', list); closeModal(); rerender(); toast('Removed from this day'); };
  }
  if (isNew) setTimeout(() => $('#evTitle', m).focus(), 50);
}

let tplEdit = null;
function templateModal(t) {
  tplEdit = t ? JSON.parse(JSON.stringify(t)) : { id: uid(), name: 'My template', bg: 'lined', sections: [['Section', 4]], isNew: true };
  drawTplModal();
}
function drawTplModal() {
  const t = tplEdit;
  openModal(`<h3>${t.isNew ? 'Create template' : 'Edit template'}</h3>
    <div class="frow"><label style="flex:2">Name<input class="field" data-tpl="name" value="${esc(t.name)}"></label>
      <label>Paper<select class="field" data-tpl="bg">${[['none', 'Blank'], ['lined', 'Lined'], ['dots', 'Dot grid'], ['grid', 'Squared']].map(([v, l]) => `<option value="${v}" ${t.bg === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <p class="sub" style="margin:4px 0 10px">Sections appear at the top of a new note, each with space to write.</p>
    ${t.sections.map(([title, lines], i) => `<div class="frow" style="margin-bottom:8px"><input class="field" style="flex:1" data-tpl="st" data-i="${i}" value="${esc(title)}" aria-label="Section title">
      <select class="field" data-tpl="sl" data-i="${i}" aria-label="Lines">${[1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map(n => `<option ${n === lines ? 'selected' : ''} value="${n}">${n} lines</option>`).join('')}</select>
      <button class="iconbtn" data-tplact="up" data-i="${i}" aria-label="Move up">↑</button><button class="iconbtn" data-tplact="down" data-i="${i}" aria-label="Move down">↓</button><button class="x" data-tplact="del" data-i="${i}" aria-label="Remove">×</button></div>`).join('')}
    <button class="btn small" data-tplact="add">Add section</button>
    <div class="acts">${t.isNew ? '' : '<button class="btn danger left" data-tplact="remove">Delete template</button>'}<button class="btn" data-tplact="cancel">Cancel</button><button class="btn primary" data-tplact="save">Save template</button></div>`);
  const m = $('#modal');
  m.oninput = m.onchange = e => {
    const el = e.target, k = el.dataset.tpl; if (!k) return;
    if (k === 'name') t.name = el.value; if (k === 'bg') t.bg = el.value;
    if (k === 'st') t.sections[+el.dataset.i][0] = el.value; if (k === 'sl') t.sections[+el.dataset.i][1] = +el.value;
  };
  m.onclick = e => {
    const b = e.target.closest('[data-tplact]'); if (!b) return;
    const a = b.dataset.tplact, i = +b.dataset.i, sec = t.sections;
    if (a === 'add') sec.push(['Section', 4]);
    if (a === 'del') sec.splice(i, 1);
    if (a === 'up' && i > 0) [sec[i - 1], sec[i]] = [sec[i], sec[i - 1]];
    if (a === 'down' && i < sec.length - 1) [sec[i + 1], sec[i]] = [sec[i], sec[i + 1]];
    if (a === 'cancel') { m.onclick = m.oninput = m.onchange = null; return closeModal(); }
    if (a === 'remove') { if (!confirm('Delete this template? Notes made with it keep their layout as lined paper.')) return; put('templates', get('templates', []).filter(x => x.id !== t.id)); m.onclick = null; closeModal(); return rerender(); }
    if (a === 'save') { const { isNew, ...clean } = t; const list = get('templates', []).filter(x => x.id !== t.id); list.push(clean); put('templates', list); m.onclick = m.oninput = m.onchange = null; closeModal(); toast('Template saved'); return rerender(); }
    drawTplModal();
  };
}

// ============================================================ notes
function touchNote(id) { const list = get('notes', []); const n = list.find(x => x.id === id); if (n) { n.updated = Date.now(); putLater('notes', list, 800); } }
function createNote(tpl) {
  const t = tplById(tpl), list = get('notes', []);
  const n = { id: uid(), title: t.sections.length ? `${t.name} – ${today().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Untitled note', tpl: t.id, pages: 1, created: Date.now(), updated: Date.now() };
  list.push(n); put('notes', list); closeModal(); go('note', { id: n.id });
}
function noteModal() {
  openModal(`<h3>New note</h3><div class="tplpick">${allTemplates().map(t => `<button data-act="note-create" data-tpl="${t.id}">${thumb(t)}${esc(t.name)}</button>`).join('')}</div>
    <div class="acts"><button class="btn" data-act="modal-close">Cancel</button></div>`);
}

// ============================================================ PDFs
let pdfjsMod = null;
async function pdfjs() {
  if (pdfjsMod) return pdfjsMod;
  const m = await import('./lib/pdf.min.mjs');
  m.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;
  return (pdfjsMod = m);
}
async function importPdf(file) {
  try {
    toast('Importing PDF…');
    const buf = await file.arrayBuffer(), lib = await pdfjs();
    const doc = await lib.getDocument({ data: buf.slice(0) }).promise, sizes = [];
    for (let i = 1; i <= doc.numPages; i++) { const vp = (await doc.getPage(i)).getViewport({ scale: 1 }); sizes.push([Math.round(vp.width), Math.round(vp.height)]); }
    const id = uid(); await putFile('pdf:' + id, buf);
    const list = get('pdfs', []); list.unshift({ id, name: file.name.replace(/\.pdf$/i, ''), pages: doc.numPages, sizes, added: Date.now() }); put('pdfs', list);
    go('pdf', { id });
  } catch (e) { console.error(e); toast('This file could not be opened as a PDF.'); }
}
let pdfObserver = null;
async function renderPdfPages(meta) {
  pdfObserver?.disconnect();
  let doc;
  try { const buf = await getFile('pdf:' + meta.id); doc = await (await pdfjs()).getDocument({ data: buf.slice(0) }).promise; }
  catch (e) { console.error(e); toast('The PDF viewer could not load. Open the installed app to view PDFs.'); return; }
  pdfObserver = new IntersectionObserver(entries => entries.forEach(async en => {
    const sh = en.target;
    if (!en.isIntersecting || sh.dataset.done) return;
    sh.dataset.done = '1';
    const page = await doc.getPage(+sh.dataset.page), vp1 = page.getViewport({ scale: 1 });
    const scale = (sh.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) / vp1.width, vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.className = 'pdfimg'; cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    sh.prepend(cv);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  }), { root: desk, rootMargin: '800px 0px' });
  $$('.pdfpage', desk).forEach(s => pdfObserver.observe(s));
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
async function inkToCanvas(ink, W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'), k = W / LW;
  for (const s of ink.s || []) drawStroke(ctx, s, k);
  for (const o of ink.o || []) {
    if (o.type === 'text') {
      ctx.fillStyle = o.c; ctx.font = `${o.size * k}px Poppins, sans-serif`; ctx.textBaseline = 'top';
      wrapLines(ctx, o.text, o.w * k).forEach((l, i) => ctx.fillText(l, (o.x + 4) * k, (o.y + 2) * k + i * o.size * 1.35 * k));
    } else if (o.type === 'img') {
      const img = new Image(); img.src = o.src; await img.decode().catch(() => {});
      const r = Math.min(o.w / img.naturalWidth, o.h / img.naturalHeight), iw = img.naturalWidth * r, ih = img.naturalHeight * r;
      ctx.drawImage(img, (o.x + (o.w - iw) / 2) * k, (o.y + (o.h - ih) / 2) * k, iw * k, ih * k);
    } else { ctx.font = `${o.h * 0.82 * k}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.e, (o.x + o.w / 2) * k, (o.y + o.h / 2) * k); ctx.textAlign = 'left'; }
  }
  return cv;
}
async function exportPdf(meta) {
  try {
    toast('Preparing PDF…');
    const { PDFDocument } = await import('./lib/pdf-lib.esm.min.js');
    const doc = await PDFDocument.load(await getFile('pdf:' + meta.id), { ignoreEncryption: true });
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const ink = get(`ink:pdf:${meta.id}:${i + 1}`); if (!ink) continue;
      const { width, height } = pages[i].getSize();
      const cv = await inkToCanvas(ink, Math.round(width * 2), Math.round(width * 2 * (meta.sizes[i][1] / meta.sizes[i][0])));
      const png = await doc.embedPng(await (await fetch(cv.toDataURL('image/png'))).arrayBuffer());
      pages[i].drawImage(png, { x: 0, y: 0, width, height });
    }
    await saveFile(`${meta.name} (annotated).pdf`, new Blob([await doc.save()], { type: 'application/pdf' }), true);
  } catch (e) { console.error(e); toast('Export failed. Try again from the installed app.'); }
}

// ============================================================ images
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 1400, r = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      res({ src: cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86), w: cv.width, h: cv.height });
    };
    img.onerror = rej; img.src = url;
  });
}

// ============================================================ files, ICS, backup
async function saveFile(name, blob, preferShare) {
  const file = new File([blob], name, { type: blob.type });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsUnesc = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pastoral Planner//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:${e.id}@pastoral-planner`, `DTSTAMP:${stamp}`);
    if (e.allDay) { L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${ymd(addDays(parseYmd(e.date), 1)).replace(/-/g, '')}`); }
    else { L.push(`DTSTART:${d}T${e.start.replace(':', '')}00`, `DTEND:${d}T${e.end.replace(':', '')}00`); }
    L.push(`SUMMARY:${icsEsc(e.title)}`);
    if (e.location) L.push(`LOCATION:${icsEsc(e.location)}`);
    if (e.notes) L.push(`DESCRIPTION:${icsEsc(e.notes)}`);
    if (e.repeat && e.repeat !== 'none') {
      const until = e.until ? `;UNTIL=${e.until.replace(/-/g, '')}T235959` : '';
      const iv = e.interval > 1 ? `;INTERVAL=${e.interval}` : '';
      const r = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: `FREQ=WEEKLY;BYDAY=${(e.days?.length ? e.days : [parseYmd(e.date).getDay()]).map(i => BYDAY[i]).join(',')}`, monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }[e.repeat];
      L.push(`RRULE:${r}${iv}${until}`);
      for (const x of e.exdates || []) L.push(e.allDay ? `EXDATE;VALUE=DATE:${x.replace(/-/g, '')}` : `EXDATE:${x.replace(/-/g, '')}T${e.start.replace(':', '')}00`);
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
function icsDate(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/); if (!m) return null;
  if (!m[4]) return { d: new Date(+m[1], m[2] - 1, +m[3]), allDay: true };
  const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  return { d, allDay: false };
}
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let cal = 'Imported calendar', cur = null; const raw = [];
  for (const ln of lines) {
    if (ln === 'BEGIN:VEVENT') { cur = { ex: [] }; continue; }
    if (ln === 'END:VEVENT') { if (cur?.ds) raw.push(cur); cur = null; continue; }
    const i = ln.indexOf(':'); if (i < 0) continue;
    const name = ln.slice(0, i).split(';')[0].toUpperCase(), val = ln.slice(i + 1);
    if (name === 'X-WR-CALNAME' && !cur) cal = val.trim() || cal;
    if (!cur) continue;
    if (name === 'SUMMARY') cur.title = icsUnesc(val);
    else if (name === 'DTSTART') cur.ds = icsDate(val);
    else if (name === 'DTEND') cur.de = icsDate(val);
    else if (name === 'RRULE') cur.rrule = Object.fromEntries(val.split(';').map(p => p.split('=')));
    else if (name === 'LOCATION') cur.location = icsUnesc(val);
    else if (name === 'DESCRIPTION') cur.notes = icsUnesc(val);
    else if (name === 'EXDATE') val.split(',').forEach(v => { const x = icsDate(v); if (x) cur.ex.push(ymd(x.d)); });
  }
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const events = raw.map(r => {
    const s = r.ds.d, e = r.de?.d || new Date(s.getTime() + 3600e3);
    const ev = { id: uid(), title: r.title || 'Event', date: ymd(s), allDay: r.ds.allDay, start: r.ds.allDay ? '00:00' : hm(s), end: r.ds.allDay ? '23:59' : (ymd(e) === ymd(s) ? hm(e) : '23:59'),
      repeat: 'none', days: [], interval: 1, until: '', exdates: r.ex, tag: 'B', notes: r.notes || '', location: r.location || '', cal };
    const rr = r.rrule;
    if (rr) {
      ev.interval = +rr.INTERVAL || 1;
      const days = (rr.BYDAY || '').split(',').map(x => BYDAY.indexOf(x.replace(/^[-+]?\d+/, ''))).filter(x => x >= 0);
      ev.repeat = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[rr.FREQ] || 'none';
      if (ev.repeat === 'weekly') { ev.days = days; if (days.length === 5 && [1, 2, 3, 4, 5].every(x => days.includes(x)) && ev.interval === 1) ev.repeat = 'weekdays'; }
      if (rr.UNTIL) { const u = icsDate(rr.UNTIL); if (u) ev.until = ymd(u.d); }
      else if (rr.COUNT) {
        const c = +rr.COUNT, iv = ev.interval;
        const u = ev.repeat === 'daily' ? addDays(s, (c - 1) * iv) : ev.repeat === 'weekly' || ev.repeat === 'weekdays' ? addDays(s, Math.ceil(c / Math.max(1, days.length || 1)) * 7 * iv - 1)
          : ev.repeat === 'monthly' ? new Date(s.getFullYear(), s.getMonth() + (c - 1) * iv, s.getDate()) : new Date(s.getFullYear() + (c - 1) * iv, s.getMonth(), s.getDate());
        ev.until = ymd(u);
      }
    }
    return ev;
  });
  return { cal, events };
}
function ab2b64(buf) { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b642ab(b64) { const s = atob(b64), bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); return bytes.buffer; }
async function backup() {
  toast('Preparing backup…');
  const files = {}; for (const [k, v] of await allFiles()) files[k] = ab2b64(v);
  put('lastBackup', Date.now());
  const payload = JSON.stringify({ app: 'pastoral-planner', version: 1, created: new Date().toISOString(), kv: Object.fromEntries(store.map), files });
  const ok = await saveFile(`Pastoral Planner backup ${ymd(today())}.json`, new Blob([payload], { type: 'application/json' }), true);
  if (ok) toast('Backup ready'); rerender();
}
async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'pastoral-planner') throw new Error('Not a Pastoral Planner backup');
    if (!confirm(`Restore the backup from ${new Date(data.created).toLocaleString('en-GB')}? This replaces everything currently in the app.`)) return;
    if (store.db) {
      const tx = store.db.transaction(['kv', 'files'], 'readwrite');
      tx.objectStore('kv').clear(); tx.objectStore('files').clear();
      for (const [k, v] of Object.entries(data.kv)) tx.objectStore('kv').put(v, k);
      for (const [k, v] of Object.entries(data.files || {})) tx.objectStore('files').put(b642ab(v), k);
      await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
    } else { memFiles.clear(); for (const [k, v] of Object.entries(data.files || {})) memFiles.set(k, b642ab(v)); }
    store.map = new Map(Object.entries(data.kv));
    toast('Backup restored'); go('day', { date: today() });
  } catch (e) { console.error(e); toast('That file is not a Pastoral Planner backup.'); }
}

// ============================================================ dictation
let lastField = null;
document.addEventListener('focusin', e => { if (e.target.matches('input[type=text], input:not([type]), textarea')) lastField = e.target; });
function dictate() {
  const f = lastField && document.contains(lastField) ? lastField : null;
  if (!f) { toast('Tap a text field first, then tap the microphone.'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { f.focus(); toast('Use the microphone key on the iPad keyboard to dictate.'); return; }
  const r = new SR(); r.lang = 'en-GB'; r.interimResults = false;
  r.onresult = e => { const t = e.results[0][0].transcript; f.value = (f.value ? f.value.replace(/\s*$/, ' ') : '') + t; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); };
  r.onerror = () => { f.focus(); toast('Dictation isn’t available here. Use the microphone key on the keyboard.'); };
  try { r.start(); toast('Listening…'); } catch { f.focus(); }
}

// ============================================================ actions
function clItems(el) { const key = el.closest('.cl').dataset.key; return { key, items: get(key, []), id: el.closest('.row')?.dataset.id }; }
function stickerPop(anchor) {
  const p = $('#pop'), r = anchor.getBoundingClientRect();
  p.innerHTML = `<div class="stickers">${STICKERS.map(s => `<button data-act="sticker" data-e="${s}" aria-label="Sticker ${s}">${s}</button>`).join('')}</div>`;
  p.hidden = false;
  p.style.left = Math.max(12, Math.min(window.innerWidth - 372, r.left - 150)) + 'px';
  p.style.top = r.top - p.offsetHeight - 12 + 'px';
}

const ACT = {
  nav: el => { const v = el.dataset.v; if (v === 'today') return go('day', { date: today() }); go(v); },
  go: el => go(el.dataset.v),
  today: () => go(state.view, { date: today() }),
  prev: () => shiftDate(-1), next: () => shiftDate(1),
  goday: el => go('day', { date: parseYmd(el.dataset.date) }),
  gomonth: el => go('month', { date: parseYmd(el.dataset.date) }),
  'ev-new': el => eventModal(null, el.dataset.date || ymd(state.date)),
  'ev-open': el => { const ev = get('events', []).find(e => e.id === el.dataset.id); if (ev) eventModal(ev, el.dataset.date); },
  'modal-close': closeModal,
  'cl-tag': el => { const { key, items, id } = clItems(el); const it = items.find(x => x.id === id); it.tag = TAGS[(TAGS.indexOf(it.tag || '') + 1) % 4]; put(key, items); el.className = `tag ${it.tag}`; el.textContent = it.tag || '·'; },
  'cl-del': el => { const { key, items, id } = clItems(el); put(key, items.filter(x => x.id !== id)); refreshCl(key); },
  'cl-toggle': el => { if (el.tagName === 'BUTTON') { const { key, items, id } = clItems(el); const it = items.find(x => x.id === id); it.done = !it.done; put(key, items); refreshCl(key); } },
  'prio-tag': el => { const k = `prio:${ymd(state.date)}`, p = get(k, [{}, {}, {}]), i = +el.dataset.i; p[i] = p[i] || {}; p[i].tag = TAGS[(TAGS.indexOf(p[i].tag || '') + 1) % 4]; put(k, p); el.className = `tag ${p[i].tag}`; el.textContent = p[i].tag || '·'; },
  carry: el => {
    const ds = el.dataset.date, items = get(`tasks:${ds}`, []), open = items.filter(t => !t.done);
    if (!open.length) return toast('Every task is done.');
    const tk = `tasks:${ymd(addDays(parseYmd(ds), 1))}`;
    put(tk, [...get(tk, []), ...open.map(t => ({ ...t, id: uid() }))]); put(`tasks:${ds}`, items.filter(t => t.done));
    rerender(); toast(`${open.length} task${open.length > 1 ? 's' : ''} moved to tomorrow`);
  },
  mood: el => { const k = `f:dev:${ymd(state.date)}:mood`, v = get(k) === el.dataset.v ? '' : el.dataset.v; put(k, v); $$('.moods button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); },
  'ot-move': el => { const from = `tasks:${el.dataset.date}`, items = get(from, []), t = items.find(x => x.id === el.dataset.id); put(from, items.filter(x => x !== t)); const tk = `tasks:${ymd(today())}`; put(tk, [...get(tk, []), t]); rerender(); },
  'cl-new': () => { const name = prompt('Checklist name'); if (!name?.trim()) return; put('checklists', [...get('checklists', []), { id: uid(), name: name.trim() }]); rerender(); },
  'cl-remove': el => { if (!confirm('Delete this checklist and its items?')) return; put('checklists', get('checklists', []).filter(l => l.id !== el.dataset.id)); remove(`cl:${el.dataset.id}`); rerender(); },
  'bd-add': () => {
    const name = $('#bdName').value.trim(); if (!name) { $('#bdName').focus(); return toast('Add a name first.'); }
    const y = parseInt($('#bdYear').value, 10);
    put('birthdays', [...get('birthdays', []), { id: uid(), name, day: +$('#bdDay').value, month: +$('#bdMonth').value, year: y > 1900 ? y : null, note: $('#bdNote').value.trim() }]);
    rerender(); toast(`Added ${name}`);
  },
  'bd-del': el => { if (!confirm('Delete this birthday?')) return; put('birthdays', get('birthdays', []).filter(b => b.id !== el.dataset.id)); rerender(); },
  'bd-ics': () => saveFile('Birthdays.ics', new Blob([buildIcs(get('birthdays', []).map(b => ({ id: b.id, title: `🎂 ${b.name}`, date: `${b.year || today().getFullYear()}-${pad(b.month)}-${pad(b.day)}`, allDay: true, repeat: 'yearly', notes: b.note })))], { type: 'text/calendar' })),
  'note-new': noteModal,
  'note-create': (el, e) => { if (e?.target.closest('[data-act="tpl-edit"]')) return; createNote(el.dataset.tpl); },
  'tpl-new': () => templateModal(null),
  'tpl-edit': (el, e) => { e?.stopPropagation(); const t = get('templates', []).find(x => x.id === el.dataset.id); if (t) templateModal(t); },
  'note-open': el => go('note', { id: el.dataset.id }),
  'note-addpage': () => { const list = get('notes', []), n = list.find(x => x.id === state.id); n.pages++; n.updated = Date.now(); put('notes', list); rerender(); setTimeout(() => desk.scrollTo({ top: desk.scrollHeight, behavior: 'smooth' }), 50); },
  'note-delpage': el => {
    const p = +el.dataset.p; if (!confirm(`Remove page ${p} and its writing?`)) return;
    const list = get('notes', []), n = list.find(x => x.id === state.id);
    for (let i = p; i < n.pages; i++) { const nx = get(`ink:note:${n.id}:${i + 1}`); if (nx) put(`ink:note:${n.id}:${i}`, nx); else remove(`ink:note:${n.id}:${i}`); }
    remove(`ink:note:${n.id}:${n.pages}`); n.pages--; put('notes', list); rerender();
  },
  'note-delete': () => {
    const list = get('notes', []), n = list.find(x => x.id === state.id); if (!n || !confirm(`Delete “${n.title}”?`)) return;
    for (let i = 1; i <= n.pages; i++) remove(`ink:note:${n.id}:${i}`);
    put('notes', list.filter(x => x !== n)); go('notes');
  },
  'pdf-import': () => $('#filePdf').click(),
  'pdf-open': el => go('pdf', { id: el.dataset.id }),
  'pdf-export': () => { const p = get('pdfs', []).find(x => x.id === state.id); if (p) exportPdf(p); },
  'pdf-delete': () => {
    const list = get('pdfs', []), p = list.find(x => x.id === state.id); if (!p || !confirm(`Delete “${p.name}” and its annotations?`)) return;
    for (let i = 1; i <= p.pages; i++) remove(`ink:pdf:${p.id}:${i}`);
    delFile('pdf:' + p.id); put('pdfs', list.filter(x => x !== p)); go('pdfs');
  },
  backup, restore: () => $('#fileBackup').click(),
  'ics-import': () => $('#fileIcs').click(),
  'ics-export': () => { const evs = get('events', []).filter(e => e.cal === 'local'); if (!evs.length) return toast('You have no events to export yet.'); saveFile('Pastoral Planner events.ics', new Blob([buildIcs(evs)], { type: 'text/calendar' })); },
  'cal-remove': el => { if (!confirm(`Remove all events imported from “${el.dataset.cal}”?`)) return; put('events', get('events', []).filter(e => e.cal !== el.dataset.cal)); rerender(); },
  tool: el => setTool({ t: el.dataset.t }),
  color: el => { const T = tool(); if (T.t === 'highlighter') setTool({ hl: { ...T.hl, c: el.dataset.c } }); else setTool({ pen: { ...T.pen, c: el.dataset.c } }); },
  width: el => { const T = tool(), w = +el.dataset.w; if (T.t === 'highlighter') setTool({ hl: { ...T.hl, w } }); else setTool({ pen: { ...T.pen, w } }); },
  undo: () => activeSurface?.undo(), redo: () => activeSurface?.redo(),
  pencil: () => { setSetting('pencilOnly', !S().pencilOnly); renderDock(); toast(S().pencilOnly ? 'Only Apple Pencil writes; fingers scroll and tap' : 'Fingers and Pencil both write'); },
  stickers: el => { if (!$('#pop').hidden) return closePop(); stickerPop(el); },
  sticker: el => { closePop(); const s = visibleSurface(); if (!s) return; const [cx, cy] = visibleCenter(s); s.addObject({ id: uid(), type: 'sticker', e: el.dataset.e, x: cx - 40, y: cy - 40, w: 80, h: 80 }); },
  image: () => $('#fileImage').click(),
  dictate,
};
function shiftDate(dir) {
  const d = state.date;
  const nd = { hours: () => addDays(d, dir), day: () => addDays(d, dir), devotion: () => addDays(d, dir), week: () => addDays(d, 7 * dir),
    month: () => new Date(d.getFullYear(), d.getMonth() + dir, 1), year: () => new Date(d.getFullYear() + dir, d.getMonth(), 1) }[state.view]();
  go(state.view, { date: nd });
}

document.addEventListener('pointerdown', e => { if (!$('#pop').hidden && !e.target.closest('#pop, [data-act=stickers]')) closePop(); });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
  const fn = ACT[el.dataset.act]; if (fn) { fn(el, e); }
});
document.addEventListener('change', e => {
  const el = e.target, a = el.dataset.act;
  if (a === 'cl-toggle') { const { key, items, id } = clItems(el); const it = items.find(x => x.id === id); it.done = el.checked; put(key, items); el.closest('.row').classList.toggle('done', el.checked); }
  if (a === 'cl-add' && el.value.trim()) addClItem(el, false);
  if (a === 'wt-toggle' || a === 'ot-toggle') { const k = `tasks:${el.dataset.date}`, items = get(k, []), t = items.find(x => x.id === el.dataset.id); if (t) { t.done = el.checked; put(k, items); } if (a === 'ot-toggle') rerender(); }
  if (a === 'set-toggle') { setSetting(el.dataset.k, el.checked); }
  if (a === 'set-num') { setSetting(el.dataset.k, +el.value); }
});
document.addEventListener('input', e => {
  const el = e.target, a = el.dataset.act;
  if (el.dataset.bind) { putLater(el.dataset.bind, el.value); if (el.tagName === 'TEXTAREA') autosize(el); return; }
  if (a === 'cl-edit') { const { key, items, id } = clItems(el); const it = items.find(x => x.id === id); if (it) { it.text = el.value; putLater(key, items); } }
  if (a === 'prio-edit') { const k = `prio:${ymd(state.date)}`, p = get(k, [{}, {}, {}]), i = +el.dataset.i; p[i] = { ...(p[i] || {}), text: el.value }; putLater(k, p); }
  if (a === 'cl-rename') { const l = get('checklists', []), x = l.find(y => y.id === el.dataset.id); if (x) { x.name = el.value; putLater('checklists', l); } }
  if (a === 'note-title') { const l = get('notes', []), n = l.find(y => y.id === state.id); if (n) { n.title = el.value || 'Untitled note'; n.updated = Date.now(); putLater('notes', l); $('#top h1').textContent = n.title; } }
  if (a === 'set-text') { setSetting(el.dataset.k, el.value); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset.act === 'cl-add') { e.preventDefault(); if (e.target.value.trim()) addClItem(e.target, true); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input,textarea')) { e.preventDefault(); e.shiftKey ? activeSurface?.redo() : activeSurface?.undo(); }
});
function addClItem(el, refocus) {
  const key = el.closest('.cl').dataset.key, items = get(key, []);
  items.push({ id: uid(), text: el.value.trim(), done: false, tag: '' }); el.value = '';
  put(key, items); refreshCl(key, refocus);
}

$('#fileImage').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const s = visibleSurface(); if (!s) return;
  try {
    const img = await loadImage(f), [cx, cy] = visibleCenter(s);
    const w = Math.min(560, img.w), h = (w * img.h) / img.w;
    s.addObject({ id: uid(), type: 'img', src: img.src, x: cx - w / 2, y: cy - h / 2, w, h });
  } catch { toast('That image could not be opened.'); }
});
$('#filePdf').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importPdf(f); });
$('#fileBackup').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); });
$('#fileIcs').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const { cal, events } = parseIcs(await f.text());
    if (!events.length) return toast('No events found in that file.');
    const name = cal === 'local' ? 'Imported calendar' : cal;
    events.forEach(ev => (ev.cal = name));
    put('events', [...get('events', []).filter(x => x.cal !== name), ...events]);
    rerender(); toast(`Imported ${events.length} events from ${name}`);
  } catch (err) { console.error(err); toast('That file is not a calendar (.ics) file.'); }
});
window.addEventListener('hashchange', () => { readHash(); render(); });
window.addEventListener('resize', () => closePop());

// ============================================================ start
(async function start() {
  await openStore();
  seed();
  readHash();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

export { parseIcs, buildIcs, occurs };
