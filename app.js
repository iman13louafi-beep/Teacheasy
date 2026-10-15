/* Teacheasy: lesson plans, tests, worksheets, presentations and meetings for Algerian middle school teachers.
   Everything is stored on the device (localStorage for records, IndexedDB for attached files). */
(function () {
'use strict';
const I = window.I18N, KEY = 'teacheasy.v1', UIKEY = 'teacheasy.ui';
const COLLS = ['lessons', 'papers', 'worksheets', 'decks', 'docs', 'meetings'];

/* ---------- Storage ---------- */
function emptyDB() { return { version: 1, profile: null, lessons: [], papers: [], worksheets: [], decks: [], docs: [], meetings: [] }; }
let DB = emptyDB();
try { const raw = localStorage.getItem(KEY); if (raw) DB = Object.assign(emptyDB(), JSON.parse(raw)); } catch (e) {}
let UI = { view: 'home', id: null, step: 'lang', wsMode: 'std', wsTwo: false };
try { Object.assign(UI, JSON.parse(localStorage.getItem(UIKEY) || '{}')); } catch (e) {}
let saveTimer;
function save(now) {
  clearTimeout(saveTimer);
  const go = () => {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); flash(t('saved')); }
    catch (e) { toast('Storage is full. Download a backup and remove large items.'); }
  };
  now ? go() : (saveTimer = setTimeout(go, 400));
}
function saveUI() { try { localStorage.setItem(UIKEY, JSON.stringify({ view: UI.view, id: UI.id, step: UI.step, wsMode: UI.wsMode, wsTwo: UI.wsTwo })); } catch (e) {} }

/* Files in IndexedDB */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('teacheasy-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const s = db.transaction('files', mode).objectStore('files'); const r = fn(s);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  return { put: (k, v) => tx('readwrite', s => s.put(v, k)), get: k => tx('readonly', s => s.get(k)), del: k => tx('readwrite', s => s.delete(k)), clear: () => tx('readwrite', s => s.clear()) };
})();

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const P = () => DB.profile;
const L = () => (P() && P().lang) || UI.lang || 'ar';
function t(k, vars) { let s = (I[L()] && I[L()][k]) || I.en[k] || k; if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]); return s; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = s => esc(s).replace(/\n/g, '<br>');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const subj = id => SUBJECTS.find(s => s[0] === id);
const subjName = id => (subj(id) ? subj(id)[1][L()] : '');
function clang(id) { const l = subj(id) ? subj(id)[2] : 'ar'; return l === 'tam' ? (L() === 'ar' ? 'ar' : 'fr') : l; }
const cdir = id => (clang(id) === 'ar' ? 'rtl' : 'ltr');
const tpl = id => TPL[clang(id)];
const lvlName = i => (i === '' || i == null ? '' : LEVELS[L()][i]);
function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
function isoToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function schoolYear() { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 7 ? y + '/' + (y + 1) : (y - 1) + '/' + y; }
const active = () => P().active;
const find = (coll, id) => DB[coll].find(r => r.id === id);
const mine = coll => DB[coll].filter(r => !r.subject || r.subject === active()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
function touch(rec) { rec.updated = Date.now(); save(); }
let tt; function toast(m) { const el = $('#toast'); el.textContent = m; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 2600); }
let ft; function flash(m) { const el = $('#savedflag'); if (!el) return; el.textContent = m; el.classList.add('on'); clearTimeout(ft); ft = setTimeout(() => el.classList.remove('on'), 1200); }
function go(view, id) { UI.view = view; UI.id = id || null; saveUI(); render(); window.scrollTo(0, 0); }
const sumPts = parts => parts.filter(p => p.type === 'q').reduce((a, p) => a + (+p.pts || 0), 0);
const fmtN = n => (Math.round(n * 100) / 100).toString();

function setDir() { const lang = L(); document.documentElement.lang = lang; document.documentElement.dir = I[lang].dir; }

/* ---------- Record factories ---------- */
function newLesson(fromExample) {
  const s = active(), T = tpl(s), ex = fromExample ? EXAMPLES[clang(s)].lesson : null;
  const r = { id: uid(), subject: s, level: P().levels[0] ?? '', cls: '', date: isoToday(), dur: ex ? ex.dur : 60,
    domain: ex ? ex.domain : '', title: ex ? ex.title : '', comp: ex ? ex.comp : '', obj: ex ? ex.obj : '', mat: ex ? ex.mat : '',
    stages: ex ? ex.stages.map(x => ({ name: x[0], min: x[1], act: x[2], eval: x[3] })) : T.stages.map((n, i) => ({ name: n, min: [10, 30, 15, 5][i] || 5, act: '', eval: '' })),
    hw: ex ? ex.hw : '', notes: '', updated: Date.now() };
  DB.lessons.push(r); save(); return r;
}
function newPaper(kind, fromExample) {
  const s = active(), T = tpl(s), src = fromExample ? EXAMPLES[clang(s)].paper : T.paper;
  const r = { id: uid(), subject: s, kind, level: kind === 'bem' ? 3 : (P().levels[0] ?? ''), cls: '', dur: { ar: ['ساعة واحدة', 'ساعتان'], fr: ['1 h', '2 h'], en: ['1 hour', '2 hours'] }[clang(s)][kind === 'bem' ? 1 : 0], year: schoolYear(),
    title: T.title[kind] + (kind !== 'bem' ? ' · ' + subjName(s) : ''),
    parts: src.map(x => x[0] === 's' ? { type: 's', text: x[1] } : { type: 'q', text: x[1], pts: x[2] }),
    crit: T.crit.map(c => ({ label: c[0], pts: c[1] })), key: '', updated: Date.now() };
  DB.papers.push(r); save(); return r;
}
function newWorksheet(lesson) {
  const r = { id: uid(), subject: active(), lessonId: lesson ? lesson.id : '', level: lesson ? lesson.level : (P().levels[0] ?? ''),
    title: lesson ? lesson.title : '', items: [0, 1, 2].map(() => ({ instr: '', body: '', ans: '' })), help: '', updated: Date.now() };
  DB.worksheets.push(r); save(); return r;
}
function slidesFromLesson(l) {
  return [{ title: l.title || t('untitled'), body: [l.domain, l.obj].filter(Boolean).join('\n') }].concat(l.stages.map(s => ({ title: s.name, body: s.act })));
}
function newDeck(lesson) {
  const r = { id: uid(), subject: active(), lessonId: lesson ? lesson.id : '', title: lesson ? lesson.title : '',
    slides: lesson ? slidesFromLesson(lesson) : [{ title: '', body: '' }], updated: Date.now() };
  DB.decks.push(r); save(); return r;
}
function newDoc() { const r = { id: uid(), subject: active(), kind: 'curr', level: '', title: '', fileName: '', fileType: '', excerpts: [], updated: Date.now() }; DB.docs.push(r); save(); return r; }
function newMeeting() {
  const r = { id: uid(), subject: active(), title: t('meetingTitle') + ' · ' + subjName(active()), date: isoToday(), place: '', attendees: P().name || '', agenda: '', minutes: '', decisions: [], updated: Date.now() };
  DB.meetings.push(r); save(); return r;
}

/* ---------- Onboarding ---------- */
function renderOnb() {
  const root = $('#root');
  if (UI.step !== 'subj' || !UI.lang) {
    document.documentElement.dir = 'ltr';
    root.innerHTML = `<div class="onb"><div class="onb-card">
      <div class="logo"><img src="icons/icon-192.png" alt="" width="34" height="34">Teacheasy</div>
      <h1>اختر لغتك · Choisissez votre langue · Choose your language</h1>
      <div class="langs">${['ar', 'fr', 'en'].map(l => `<button class="lang" data-act="pickLang" data-arg="${l}" dir="${I[l].dir}"><b>${I[l].name}</b><small>${I[l].tagline}</small></button>`).join('')}</div>
    </div></div>`;
    return;
  }
  const lang = UI.lang, d = UI.draft || (UI.draft = { subjects: [], levels: [], name: '', school: '' });
  document.documentElement.dir = I[lang].dir; document.documentElement.lang = lang;
  const tt2 = k => I[lang][k];
  root.innerHTML = `<div class="onb"><div class="onb-card">
    <div class="row between"><div class="logo"><img src="icons/icon-192.png" alt="" width="34" height="34">Teacheasy</div><button class="btn" data-act="onbBack">${tt2('back')}</button></div>
    <div class="stack s6"><h1>${tt2('pickSubject')}</h1><p class="lede">${tt2('pickSubjectSub')}</p></div>
    <div class="subjects">${SUBJECTS.map(([id, n, l]) => `<button class="subj" data-act="onbSubj" data-arg="${id}" aria-pressed="${d.subjects.includes(id)}"><span>${n[lang]}</span><small>${tt2('contentIn')} ${LANGNAME[l][lang]}</small></button>`).join('')}</div>
    <div class="stack s8"><h2>${tt2('pickLevel')}</h2><div class="row">${LEVELS[lang].map((lv, i) => `<button class="pill" data-act="onbLvl" data-arg="${i}" aria-pressed="${d.levels.includes(i)}">${lv}</button>`).join('')}</div></div>
    <div class="grid2"><div class="field"><label for="onb-name">${tt2('yourName')}</label><input id="onb-name" value="${esc(d.name)}" data-draft="name"></div>
    <div class="field"><label for="onb-school">${tt2('yourSchool')}</label><input id="onb-school" value="${esc(d.school)}" data-draft="school"></div></div>
    <div><button class="btn primary big" data-act="onbDone" ${d.subjects.length && d.levels.length ? '' : 'disabled'}>${tt2('enter')}</button></div>
  </div></div>`;
}

/* ---------- Shell ---------- */
const NAV = [['home'], ['sep', 'sepSubject'], ['lessons'], ['papers'], ['worksheets'], ['decks'], ['docs'], ['sep', 'sepSchool'], ['school'], ['settings']];
const LISTOF = { lesson: 'lessons', paper: 'papers', worksheet: 'worksheets', deck: 'decks', doc: 'docs', meeting: 'school' };
function render() {
  if (!P()) { renderOnb(); return; }
  setDir();
  const cur = LISTOF[UI.view] || UI.view;
  $('#root').innerHTML = `<div class="shell">
   <nav class="rail" aria-label="Teacheasy">
     <div class="logo"><img src="icons/icon-192.png" alt="" width="28" height="28">Teacheasy</div>
     <select id="subjSel" aria-label="${t('subject')}">${P().subjects.map(id => `<option value="${id}" ${id === active() ? 'selected' : ''}>${esc(subjName(id))}</option>`).join('')}</select>
     ${NAV.map(([k, s]) => k === 'sep' ? `<div class="sep">${t(s)}</div>` : `<button class="nav" data-act="nav" data-arg="${k}" aria-current="${k === cur}">${t('nav_' + k)}</button>`).join('')}
   </nav>
   <main class="main"><div class="wrap" id="view"></div></main>
   <span id="savedflag" class="savedflag" aria-live="polite"></span>
  </div>`;
  const V = { home: vHome, lessons: vLessons, lesson: vLesson, papers: vPapers, paper: vPaper, worksheets: vWorksheets, worksheet: vWorksheet, decks: vDecks, deck: vDeck, docs: vDocs, doc: vDoc, school: vMeetings, meeting: vMeeting, settings: vSettings };
  (V[UI.view] || vHome)();
}
const view = html => { $('#view').innerHTML = html; };

/* ---------- Generic list ---------- */
function listPage(title, coll, actions, rowMeta, openView, extra) {
  const rows = mine(coll);
  view(`<div class="row between"><h1>${title}</h1><div class="row">${actions}</div></div>
   ${extra || ''}
   ${rows.length ? `<div class="list">${rows.map(r => `<button class="li" data-act="open" data-view="${openView}" data-arg="${r.id}">
     <span class="li-t" dir="auto">${esc(r.title) || `<i class="muted">${t('untitled')}</i>`}</span><span class="li-m">${rowMeta(r)}</span><span class="li-d mono">${fmtDate(r.updated)}</span></button>`).join('')}</div>`
    : `<div class="empty"><p>${t('emptyList')}</p></div>`}`);
}
function vHome() {
  const all = [].concat(...['lessons', 'papers', 'worksheets', 'decks'].map(c => mine(c).map(r => ({ r, c })))).sort((a, b) => b.r.updated - a.r.updated).slice(0, 8);
  const label = { lessons: t('nav_lessons'), papers: t('nav_papers'), worksheets: t('nav_worksheets'), decks: t('nav_decks') };
  const vw = { lessons: 'lesson', papers: 'paper', worksheets: 'worksheet', decks: 'deck' };
  view(`<div><p class="eyebrow">${esc(subjName(active()))} · ${P().levels.map(lvlName).join(' · ')}</p><h1>${t('hello')}${P().name ? ', ' + esc(P().name) : ''}</h1><p class="lede">${t('homeLede')}</p></div>
   <div class="stack s8"><h2>${t('quick')}</h2><div class="quick">
     <button class="qa" data-act="newLesson">${t('newLesson')}</button><button class="qa" data-act="newPaper" data-arg="test">${t('newTest')}</button>
     <button class="qa" data-act="newPaper" data-arg="exam">${t('newExam')}</button><button class="qa" data-act="newPaper" data-arg="bem">${t('newBem')}</button>
     <button class="qa" data-act="newWorksheet">${t('newWorksheet')}</button><button class="qa" data-act="newDeck">${t('newDeck')}</button></div></div>
   <div class="stack s8"><h2>${t('recent')}</h2>${all.length ? `<div class="list">${all.map(({ r, c }) => `<button class="li" data-act="open" data-view="${vw[c]}" data-arg="${r.id}"><span class="li-t" dir="auto">${esc(r.title) || `<i class="muted">${t('untitled')}</i>`}</span><span class="li-m"><span class="chip">${label[c]}</span></span><span class="li-d mono">${fmtDate(r.updated)}</span></button>`).join('')}</div>`
     : `<div class="empty"><p>${t('emptyList')}</p><div class="row"><button class="btn" data-act="exampleLesson">${t('example')}</button></div></div>`}</div>`);
}
const vLessons = () => listPage(t('nav_lessons'), 'lessons', `<button class="btn" data-act="exampleLesson">${t('example')}</button><button class="btn primary" data-act="newLesson">${t('newLesson')}</button>`,
  r => [lvlName(r.level), r.cls, r.date && fmtDate(new Date(r.date))].filter(Boolean).map(esc).join(' · '), 'lesson');
const vPapers = () => listPage(t('nav_papers'), 'papers', `<button class="btn" data-act="examplePaper">${t('example')}</button><button class="btn primary" data-act="newPaper" data-arg="test">${t('newTest')}</button><button class="btn primary" data-act="newPaper" data-arg="exam">${t('newExam')}</button><button class="btn primary" data-act="newPaper" data-arg="bem">${t('newBem')}</button>`,
  r => `<span class="chip ${r.kind === 'bem' ? 'warn' : ''}">${t('kind_' + r.kind)}</span> ${esc(lvlName(r.level))}`, 'paper');
const vWorksheets = () => listPage(t('nav_worksheets'), 'worksheets', `<button class="btn primary" data-act="newWorksheet">${t('newWorksheet')}</button>`, r => esc(lvlName(r.level)), 'worksheet');
const vDecks = () => listPage(t('nav_decks'), 'decks', `<button class="btn primary" data-act="newDeck">${t('newDeck')}</button>`, r => r.slides.length + ' ▭', 'deck');
const vDocs = () => listPage(t('nav_docs'), 'docs', `<button class="btn primary" data-act="newDoc">${t('newDoc')}</button>`, r => `<span class="chip">${t('kind_' + r.kind)}</span> ${esc(lvlName(r.level))}`, 'doc', `<p class="note">${t('docNote')}</p>`);
const vMeetings = () => listPage(t('nav_school'), 'meetings', `<button class="btn primary" data-act="newMeeting">${t('newMeeting')}</button>`, r => esc([r.date && fmtDate(new Date(r.date)), r.place].filter(Boolean).join(' · ')), 'meeting');

/* ---------- Editor helpers ---------- */
const B = (coll, id, path) => `data-b="${coll}|${id}|${path}"`;
function inp(coll, r, path, label, opts = {}) {
  const v = path.split('.').reduce((o, k) => o == null ? o : o[k], r), idA = `f-${path.replace(/\./g, '-')}`;
  const lab = label ? `<label for="${idA}">${label}</label>` : '';
  const dir = opts.dir ? ` dir="${opts.dir}"` : ' dir="auto"';
  if (opts.area) return `<div class="field ${opts.cls || ''}">${lab}<textarea id="${idA}" ${B(coll, r.id, path)}${dir} rows="${opts.rows || 2}" placeholder="${esc(opts.ph || '')}">${esc(v)}</textarea></div>`;
  return `<div class="field ${opts.cls || ''}">${lab}<input id="${idA}" ${B(coll, r.id, path)}${dir} type="${opts.type || 'text'}" ${opts.type === 'number' ? 'inputmode="decimal" step="any" min="0"' : ''} value="${esc(v)}" placeholder="${esc(opts.ph || '')}"></div>`;
}
function levelSel(coll, r, allowNone) {
  return `<div class="field"><label for="f-level">${t('fLevel')}</label><select id="f-level" ${B(coll, r.id, 'level')}>${allowNone ? `<option value="">—</option>` : ''}${LEVELS[L()].map((n, i) => `<option value="${i}" ${String(r.level) === String(i) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
}
function lessonSel(coll, r) {
  return `<div class="field"><label for="f-lessonId">${t('linkedLesson')}</label><select id="f-lessonId" ${B(coll, r.id, 'lessonId')}><option value="">${t('noneLesson')}</option>${mine('lessons').map(l => `<option value="${l.id}" ${l.id === r.lessonId ? 'selected' : ''}>${esc(l.title || t('untitled'))}</option>`).join('')}</select></div>`;
}
const head = (coll, r, back, actions) => `<div class="edhead"><button class="btn ghost" data-act="nav" data-arg="${back}">← ${t('back')}</button>
  <div class="row">${actions}<button class="btn" data-act="dup" data-arg="${coll}">${t('dup')}</button><button class="btn danger" data-act="del" data-arg="${coll}">${t('del')}</button></div></div>
  <input class="titleinp" ${B(coll, r.id, 'title')} dir="auto" value="${esc(r.title)}" placeholder="${t('fTitle')}" aria-label="${t('fTitle')}">`;
let calc = null;

/* ---------- Lesson ---------- */
function vLesson() {
  const r = find('lessons', UI.id); if (!r) return go('lessons');
  const d = cdir(r.subject), docs = mine('docs').filter(x => x.excerpts.length);
  view(`${head('lessons', r, 'lessons', `<button class="btn" data-act="printLesson">${t('print')}</button><button class="btn primary" data-act="lessonToWs">${t('makeWs')}</button><button class="btn primary" data-act="lessonToDeck">${t('makeDeck')}</button>`)}
   <div class="split">
    <div class="panel stack" dir="${d}">
     <div class="grid5">${inp('lessons', r, 'domain', t('fDomain'), { cls: 'span2' })}${levelSel('lessons', r)}${inp('lessons', r, 'cls', t('fCls'))}${inp('lessons', r, 'date', t('fDate'), { type: 'date' })}${inp('lessons', r, 'dur', t('fDur'), { type: 'number' })}</div>
     ${inp('lessons', r, 'comp', t('fComp'), { area: 1 })}${inp('lessons', r, 'obj', t('fObj'), { area: 1, rows: 3 })}${inp('lessons', r, 'mat', t('fMat'), { area: 1 })}
     <div class="stack s6"><div class="row between"><span class="eyebrow">${t('stagesH')}</span><span class="mono" id="calc-total"></span></div>
      <div class="tablebox"><table class="stages"><thead><tr><th>${t('cStage')}</th><th class="w-min">${t('cMin')}</th><th>${t('cAct')}</th><th>${t('cEval')}</th><th class="w-x"></th></tr></thead><tbody>
      ${r.stages.map((s, i) => `<tr><td><textarea ${B('lessons', r.id, `stages.${i}.name`)} dir="auto" rows="2" aria-label="${t('cStage')}">${esc(s.name)}</textarea></td>
        <td><input ${B('lessons', r.id, `stages.${i}.min`)} type="number" inputmode="numeric" min="0" value="${esc(s.min)}" aria-label="${t('cMin')}"></td>
        <td><textarea ${B('lessons', r.id, `stages.${i}.act`)} dir="auto" rows="3" aria-label="${t('cAct')}">${esc(s.act)}</textarea></td>
        <td><textarea ${B('lessons', r.id, `stages.${i}.eval`)} dir="auto" rows="2" aria-label="${t('cEval')}">${esc(s.eval)}</textarea></td>
        <td><button class="x" data-act="rmRow" data-arg="stages.${i}" aria-label="${t('remove')}">×</button></td></tr>`).join('')}
      </tbody></table></div>
      <div><button class="btn" data-act="addRow" data-arg="stages">+ ${t('addStage')}</button></div></div>
     <div class="grid2">${inp('lessons', r, 'hw', t('fHw'), { area: 1 })}${inp('lessons', r, 'notes', t('fNotes'), { area: 1 })}</div>
     <div class="stack s6"><span class="eyebrow">${t('checks')}</span><div class="row s6" id="calc-checks"></div></div>
    </div>
    <aside class="panel side stack">
     <h3>${t('excerptsH')}</h3>
     ${docs.length ? docs.map(doc => `<div class="stack s6"><p class="src">${t('kind_' + doc.kind)} · <span dir="auto">${esc(doc.title)}</span></p>${doc.excerpts.map((x, i) => `<div class="ex"><p dir="auto">${nl(x)}</p><div class="row s6"><span class="muted small">${t('copyTo')}</span>${['comp', 'obj', 'mat'].map(f => `<button class="mini" data-act="copyEx" data-arg="${doc.id}|${i}|${f}">${t('f' + f[0].toUpperCase() + f.slice(1))}</button>`).join('')}</div></div>`).join('')}</div>`).join('')
      : `<p class="muted">${t('noExcerpts')}</p><div><button class="btn" data-act="nav" data-arg="docs">${t('nav_docs')}</button></div>`}
    </aside>
   </div>`);
  calc = () => {
    const tot = r.stages.reduce((a, s) => a + (+s.min || 0), 0), full = +r.dur || 0, el = $('#calc-total');
    if (el) { el.textContent = t('totalOf', { a: tot, b: full }); el.classList.toggle('bad', tot !== full); }
    const items = [[t('fComp'), r.comp], [t('fObj'), r.obj], [t('fMat'), r.mat], [t('stagesH'), r.stages.every(s => s.act.trim()) && tot === full ? 'y' : ''], [t('cEval'), r.stages.some(s => s.eval.trim()) ? 'y' : '']];
    const c = $('#calc-checks'); if (c) c.innerHTML = items.map(([l, v]) => `<span class="chip ${String(v).trim() ? 'ok' : 'todo'}">${String(v).trim() ? '✓' : '○'} ${l}</span>`).join('');
  };
  calc();
}

/* ---------- Paper ---------- */
function vPaper() {
  const r = find('papers', UI.id); if (!r) return go('papers');
  const d = cdir(r.subject);
  view(`${head('papers', r, 'papers', `<button class="btn" data-act="printPaper">${t('print')}</button><button class="btn" data-act="printKey">${t('printKey')}</button>`)}
   <div class="row"><div class="seg" role="group">${['test', 'exam', 'bem'].map(k => `<button data-act="setKind" data-arg="${k}" aria-pressed="${r.kind === k}">${t('kind_' + k)}</button>`).join('')}</div></div>
   ${r.kind === 'bem' ? `<p class="note">${t('bemNote')}</p>` : ''}
   <div class="split">
    <div class="panel stack" dir="${d}">
     <div class="grid4">${levelSel('papers', r)}${inp('papers', r, 'cls', t('fCls'))}${inp('papers', r, 'dur', t('fDur').replace(/\s*\(.*\)/, ''))}${inp('papers', r, 'year', t('fYear'))}</div>
     <div class="stack s8">${r.parts.map((p, i) => p.type === 's'
        ? `<div class="part s"><input ${B('papers', r.id, `parts.${i}.text`)} dir="auto" value="${esc(p.text)}" placeholder="${t('partPh')}" aria-label="${t('partPh')}"><button class="x" data-act="rmRow" data-arg="parts.${i}" aria-label="${t('remove')}">×</button></div>`
        : `<div class="part q"><textarea ${B('papers', r.id, `parts.${i}.text`)} dir="auto" rows="3" placeholder="${t('qPh')}" aria-label="${t('qPh')}">${esc(p.text)}</textarea><label class="pts"><input ${B('papers', r.id, `parts.${i}.pts`)} type="number" inputmode="decimal" step="0.25" min="0" value="${esc(p.pts)}" aria-label="${t('pts')}"><span>${t('pts')}</span></label><button class="x" data-act="rmRow" data-arg="parts.${i}" aria-label="${t('remove')}">×</button></div>`).join('')}</div>
     <div class="row"><button class="btn" data-act="addPart" data-arg="s">+ ${t('addSection')}</button><button class="btn" data-act="addPart" data-arg="q">+ ${t('addQuestion')}</button><span class="mono" id="calc-total" style="margin-inline-start:auto"></span></div>
    </div>
    <aside class="panel side stack" dir="${d}">
     <h3>${t('critH')}</h3>
     ${r.crit.map((c, i) => `<div class="crit"><input ${B('papers', r.id, `crit.${i}.label`)} dir="auto" value="${esc(c.label)}" placeholder="${t('critPh')}" aria-label="${t('critPh')}"><input ${B('papers', r.id, `crit.${i}.pts`)} type="number" inputmode="decimal" step="0.25" min="0" value="${esc(c.pts)}" aria-label="${t('pts')}"><button class="x" data-act="rmRow" data-arg="crit.${i}" aria-label="${t('remove')}">×</button></div>`).join('')}
     <div><button class="btn" data-act="addRow" data-arg="crit">+ ${t('addCrit')}</button></div>
     ${inp('papers', r, 'key', t('keyH'), { area: 1, rows: 8 })}
    </aside>
   </div>`);
  calc = () => { const tot = sumPts(r.parts), el = $('#calc-total'); if (el) { el.textContent = `${t('total')}: ${fmtN(tot)} / 20`; el.classList.toggle('bad', tot !== 20); el.title = tot !== 20 ? t('totalWarn') : ''; } };
  calc();
}

/* ---------- Worksheet ---------- */
function vWorksheet() {
  const r = find('worksheets', UI.id); if (!r) return go('worksheets');
  view(`${head('worksheets', r, 'worksheets', `<div class="seg">${['std', 'rem'].map(k => `<button data-act="wsMode" data-arg="${k}" aria-pressed="${UI.wsMode === k}">${t(k === 'std' ? 'modeStd' : 'modeRem')}</button>`).join('')}</div>
     <label class="check"><input type="checkbox" id="wsTwo" ${UI.wsTwo ? 'checked' : ''}> ${t('twoPerPage')}</label><button class="btn" data-act="printWs">${t('print')}</button><button class="btn" data-act="printWsKey">${t('printKey')}</button>`)}
   <div class="panel stack" dir="${cdir(r.subject)}">
    <div class="grid2">${lessonSel('worksheets', r)}${levelSel('worksheets', r)}</div>
    <span class="eyebrow">${t('items')}</span>
    ${r.items.map((it, i) => `<div class="item"><span class="num mono">${i + 1}</span><div class="stack s6 grow">
      <input ${B('worksheets', r.id, `items.${i}.instr`)} dir="auto" value="${esc(it.instr)}" placeholder="${t('instrPh')}" aria-label="${t('instrPh')}">
      <textarea ${B('worksheets', r.id, `items.${i}.body`)} dir="auto" rows="3" placeholder="${t('bodyPh')}" aria-label="${t('bodyPh')}">${esc(it.body)}</textarea>
      <input ${B('worksheets', r.id, `items.${i}.ans`)} dir="auto" value="${esc(it.ans)}" placeholder="${t('answerPh')}" aria-label="${t('answerPh')}" class="ans"></div>
      <button class="x" data-act="rmRow" data-arg="items.${i}" aria-label="${t('remove')}">×</button></div>`).join('')}
    <div><button class="btn" data-act="addRow" data-arg="items">+ ${t('addItem')}</button></div>
    ${inp('worksheets', r, 'help', t('helpH'), { area: 1 })}
   </div>`);
  calc = null;
}

/* ---------- Deck ---------- */
function vDeck() {
  const r = find('decks', UI.id); if (!r) return go('decks');
  view(`${head('decks', r, 'decks', `<button class="btn" data-act="printDeck">${t('handout')}</button><button class="btn primary" data-act="present">${t('present')}</button>`)}
   <div class="panel stack" dir="${cdir(r.subject)}">
    <div class="row end">${lessonSel('decks', r)}<button class="btn" data-act="deckFromLesson" ${r.lessonId ? '' : 'disabled'}>${t('genFromLesson')}</button></div>
    <div class="slides">${r.slides.map((s, i) => `<div class="sl"><div class="sl-prev" dir="auto"><b>${esc(s.title)}</b><span>${nl(s.body)}</span><i class="mono">${i + 1}</i></div>
      <div class="stack s6 grow"><input ${B('decks', r.id, `slides.${i}.title`)} dir="auto" value="${esc(s.title)}" placeholder="${t('slideTitle')}" aria-label="${t('slideTitle')}">
      <textarea ${B('decks', r.id, `slides.${i}.body`)} dir="auto" rows="3" placeholder="${t('slideBody')}" aria-label="${t('slideBody')}">${esc(s.body)}</textarea></div>
      <button class="x" data-act="rmRow" data-arg="slides.${i}" aria-label="${t('remove')}">×</button></div>`).join('')}</div>
    <div><button class="btn" data-act="addRow" data-arg="slides">+ ${t('addSlide')}</button></div>
   </div>`);
  calc = () => { $$('.sl').forEach((el, i) => { const s = r.slides[i]; if (!s) return; el.querySelector('.sl-prev b').textContent = s.title; el.querySelector('.sl-prev span').innerHTML = nl(s.body); }); };
}

/* ---------- Document ---------- */
function vDoc() {
  const r = find('docs', UI.id); if (!r) return go('docs');
  const kinds = ['curr', 'acc', 'prog', 'guide', 'book', 'bemPaper', 'other'];
  view(`${head('docs', r, 'docs', '')}
   <div class="panel stack">
    <div class="grid2"><div class="field"><label for="f-kind">${t('docKind')}</label><select id="f-kind" ${B('docs', r.id, 'kind')}>${kinds.map(k => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${t('kind_' + k)}</option>`).join('')}</select></div>${levelSel('docs', r, true)}</div>
    <div class="field"><label>${t('file')}</label><div class="row">
      <label class="btn filebtn">${t('chooseFile')}<input type="file" id="docFile" accept="application/pdf,image/*" hidden></label>
      ${r.fileName ? `<span dir="auto">${esc(r.fileName)}</span><button class="btn" data-act="openFile">${t('openFile')}</button>` : `<span class="muted">${t('noFile')}</span>`}</div>
      <p class="note">${t('docNote')}</p></div>
    <span class="eyebrow">${t('excerpts')}</span>
    ${r.excerpts.map((x, i) => `<div class="part q"><textarea ${B('docs', r.id, `excerpts.${i}`)} dir="auto" rows="2" placeholder="${t('excerptPh')}" aria-label="${t('excerptPh')}">${esc(x)}</textarea><button class="x" data-act="rmRow" data-arg="excerpts.${i}" aria-label="${t('remove')}">×</button></div>`).join('')}
    <div><button class="btn" data-act="addRow" data-arg="excerpts">+ ${t('addExcerpt')}</button></div>
   </div>`);
  calc = null;
}

/* ---------- Meeting ---------- */
function vMeeting() {
  const r = find('meetings', UI.id); if (!r) return go('school');
  view(`${head('meetings', r, 'school', `<button class="btn" data-act="printMeeting">${t('printMinutes')}</button>`)}
   <div class="panel stack">
    <div class="grid2">${inp('meetings', r, 'date', t('fDate'), { type: 'date' })}${inp('meetings', r, 'place', t('fPlace'))}</div>
    ${inp('meetings', r, 'attendees', t('attendees'), { area: 1 })}${inp('meetings', r, 'agenda', t('agenda'), { area: 1, rows: 4 })}${inp('meetings', r, 'minutes', t('minutes'), { area: 1, rows: 6 })}
    <span class="eyebrow">${t('decisions')}</span>
    ${r.decisions.map((x, i) => `<div class="dec"><input type="checkbox" ${B('meetings', r.id, `decisions.${i}.done`)} ${x.done ? 'checked' : ''} aria-label="✓"><input ${B('meetings', r.id, `decisions.${i}.text`)} dir="auto" value="${esc(x.text)}" placeholder="${t('decisionPh')}" aria-label="${t('decisionPh')}"><button class="x" data-act="rmRow" data-arg="decisions.${i}" aria-label="${t('remove')}">×</button></div>`).join('')}
    <div><button class="btn" data-act="addRow" data-arg="decisions">+ ${t('addDecision')}</button></div>
   </div>`);
  calc = null;
}

/* ---------- Settings ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (UI.view === 'settings' && P()) render(); });
function vSettings() {
  const p = P(), standalone = matchMedia('(display-mode: standalone)').matches;
  view(`<h1>${t('nav_settings')}</h1>
   <div class="panel stack"><h2>${t('appLang')}</h2><div class="seg">${['ar', 'fr', 'en'].map(l => `<button data-act="setLang" data-arg="${l}" aria-pressed="${p.lang === l}">${I[l].name}</button>`).join('')}</div></div>
   <div class="panel stack"><h2>${t('profile')}</h2>
    <div class="grid2"><div class="field"><label for="p-name">${t('yourName')}</label><input id="p-name" data-prof="name" dir="auto" value="${esc(p.name)}"></div><div class="field"><label for="p-school">${t('yourSchool')}</label><input id="p-school" data-prof="school" dir="auto" value="${esc(p.school)}"></div></div>
    <span class="eyebrow">${t('mySubjects')}</span><div class="subjects">${SUBJECTS.map(([id, n]) => `<button class="subj" data-act="profSubj" data-arg="${id}" aria-pressed="${p.subjects.includes(id)}"><span>${n[p.lang]}</span></button>`).join('')}</div>
    <span class="eyebrow">${t('myLevels')}</span><div class="row">${LEVELS[p.lang].map((lv, i) => `<button class="pill" data-act="profLvl" data-arg="${i}" aria-pressed="${p.levels.includes(i)}">${lv}</button>`).join('')}</div></div>
   <div class="panel stack"><h2>${t('installH')}</h2><p class="lede">${standalone ? t('installed') : t('installNote')}</p>${installEvt && !standalone ? `<div><button class="btn primary" data-act="install">${t('install')}</button></div>` : ''}</div>
   <div class="panel stack"><h2>${t('dataH')}</h2><p class="lede">${t('dataNote')}</p>
    <div class="row"><button class="btn primary" data-act="backup">${t('backup')}</button><label class="btn filebtn">${t('restore')}<input type="file" id="restoreFile" accept="application/json,.json" hidden></label><button class="btn danger" data-act="resetAll">${t('resetAll')}</button></div></div>`);
  calc = null;
}

/* ---------- Printing ---------- */
function sheetHead(subject, level, extra) {
  const p = P();
  return `<div class="p-head"><div><span>${t('school')}</span>${esc(p.school)}</div><div><span>${t('subject')}</span>${esc(subjName(subject))}</div><div><span>${t('fLevel')}</span>${esc(lvlName(level))}</div>${extra || ''}</div>`;
}
function doPrint(html, dir) {
  const pr = $('#print'); pr.setAttribute('dir', dir); pr.innerHTML = html;
  setTimeout(() => { window.print(); }, 50);
}
function printLesson(r) {
  doPrint(`<div class="sheet">${sheetHead(r.subject, r.level, `<div><span>${t('fCls')}</span>${esc(r.cls)}</div><div><span>${t('fDate')}</span>${r.date ? fmtDate(new Date(r.date)) : ''}</div><div><span>${t('teacher')}</span>${esc(P().name)}</div>`)}
   <h1>${t('sheetTitle')}</h1>
   <table class="p-kv"><tr><th>${t('fDomain')}</th><td>${nl(r.domain)}</td><th>${t('fDur')}</th><td>${esc(r.dur)}</td></tr><tr><th>${t('fLesson')}</th><td colspan="3"><b>${nl(r.title)}</b></td></tr>
   <tr><th>${t('fComp')}</th><td colspan="3">${nl(r.comp)}</td></tr><tr><th>${t('fObj')}</th><td colspan="3">${nl(r.obj)}</td></tr><tr><th>${t('fMat')}</th><td colspan="3">${nl(r.mat)}</td></tr></table>
   <table class="p-tab"><thead><tr><th>${t('cStage')}</th><th>${t('cMin')}</th><th>${t('cAct')}</th><th>${t('cEval')}</th></tr></thead><tbody>${r.stages.map(s => `<tr><td><b>${nl(s.name)}</b></td><td>${esc(s.min)}</td><td>${nl(s.act)}</td><td>${nl(s.eval)}</td></tr>`).join('')}</tbody></table>
   <table class="p-kv"><tr><th>${t('fHw')}</th><td>${nl(r.hw)}</td></tr><tr><th>${t('fNotes')}</th><td class="tall">${nl(r.notes)}</td></tr></table></div>`, cdir(r.subject));
}
function printPaper(r, withKey) {
  const body = r.parts.map(p => p.type === 's' ? `<h3 class="p-part">${nl(p.text)}</h3>` : `<div class="p-q"><div>${nl(p.text)}</div><span class="p-pts">${fmtN(+p.pts || 0)} ${t('pts')}</span></div>`).join('');
  const key = `<h2>${t('keyH')}</h2><div class="p-q"><div>${nl(r.key)}</div></div><h3 class="p-part">${t('critH')}</h3><table class="p-tab"><tbody>${r.crit.map(c => `<tr><td>${nl(c.label)}</td><td>${fmtN(+c.pts || 0)} ${t('pts')}</td></tr>`).join('')}</tbody></table>`;
  doPrint(`<div class="sheet">${sheetHead(r.subject, r.level, `<div><span>${t('fYear')}</span>${esc(r.year)}</div><div><span>${t('fDur').replace(/\s*\(.*\)/, '')}</span>${esc(r.dur)}</div><div><span>${t('fCls')}</span>${esc(r.cls)}</div>`)}
   <h1>${nl(r.title)}</h1>${withKey ? key : `<p class="p-name">${t('name')}: ______________________</p>${body}<p class="p-total">${t('total')}: ${fmtN(sumPts(r.parts))} ${t('pts')}</p>`}</div>`, cdir(r.subject));
}
function printWorksheet(r, withKey) {
  const rem = UI.wsMode === 'rem';
  const one = `<div class="sheet ws ${UI.wsTwo ? 'half' : ''}"><div class="p-wshead"><b>${nl(r.title)}</b><span>${t('name')}: ________________</span></div>
    ${rem && r.help ? `<div class="p-help">${nl(r.help)}</div>` : ''}
    ${r.items.map((it, i) => `<div class="p-item"><b>${i + 1}. ${nl(it.instr)}</b><div>${nl(it.body)}</div>${withKey ? `<div class="p-ans">${nl(it.ans)}</div>` : '<div class="p-lines"><i></i><i></i></div>'}</div>`).join('')}</div>`;
  doPrint(UI.wsTwo && !withKey ? one + one : one, cdir(r.subject));
}
function printDeck(r) {
  doPrint(`<div class="sheet"><h1>${nl(r.title)}</h1><div class="p-slides">${r.slides.map((s, i) => `<div class="p-slide"><i>${i + 1}</i><b>${nl(s.title)}</b><div>${nl(s.body)}</div></div>`).join('')}</div></div>`, cdir(r.subject));
}
function printMeeting(r) {
  doPrint(`<div class="sheet">${sheetHead(r.subject, '', `<div><span>${t('fDate')}</span>${r.date ? fmtDate(new Date(r.date)) : ''}</div><div><span>${t('fPlace')}</span>${esc(r.place)}</div>`)}
   <h1>${t('minutes')}: ${nl(r.title)}</h1>
   <table class="p-kv"><tr><th>${t('attendees')}</th><td>${nl(r.attendees)}</td></tr><tr><th>${t('agenda')}</th><td>${nl(r.agenda)}</td></tr><tr><th>${t('minutes')}</th><td>${nl(r.minutes)}</td></tr>
   <tr><th>${t('decisions')}</th><td>${r.decisions.map(d => `${d.done ? '☑' : '☐'} ${nl(d.text)}`).join('<br>')}</td></tr></table></div>`, cdir(r.subject));
}

/* ---------- Present mode ---------- */
let pres = null;
function present(r) {
  pres = { r, i: 0 };
  const o = $('#present'); o.hidden = false; o.setAttribute('dir', cdir(r.subject));
  try { o.requestFullscreen && o.requestFullscreen().catch(() => {}); } catch (e) {}
  drawSlide();
}
function drawSlide() {
  const { r, i } = pres, s = r.slides[i] || { title: '', body: '' };
  $('#present').innerHTML = `<div class="pslide" dir="auto"><h2>${esc(s.title)}</h2><p>${nl(s.body)}</p></div>
   <div class="pbar"><button data-act="pPrev" aria-label="‹">‹</button><span class="mono">${i + 1} / ${r.slides.length}</span><button data-act="pNext" aria-label="›">›</button><button data-act="pClose">${t('exitPresent')}</button></div>`;
}
function closePresent() { pres = null; $('#present').hidden = true; try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {} }
function step(n) { if (!pres) return; pres.i = Math.max(0, Math.min(pres.r.slides.length - 1, pres.i + n)); drawSlide(); }
document.addEventListener('keydown', e => {
  if (!pres) return;
  const rtl = $('#present').getAttribute('dir') === 'rtl';
  if (e.key === 'Escape') closePresent();
  else if (e.key === 'ArrowRight') step(rtl ? -1 : 1);
  else if (e.key === 'ArrowLeft') step(rtl ? 1 : -1);
  else if (e.key === ' ' || e.key === 'PageDown') step(1);
  else if (e.key === 'PageUp') step(-1);
});

/* ---------- Input binding ---------- */
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val; }
function onField(e) {
  const el = e.target;
  if (el.dataset.draft) { UI.draft[el.dataset.draft] = el.value; return; }
  if (el.dataset.prof) { P()[el.dataset.prof] = el.value; save(); return; }
  if (!el.dataset.b) return;
  const [coll, id, path] = el.dataset.b.split('|'), r = find(coll, id); if (!r) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number') v = el.value === '' ? '' : +el.value;
  if (path === 'level') v = el.value === '' ? '' : +el.value;
  setPath(r, path, v); touch(r);
  if (calc) calc();
}
document.addEventListener('input', onField);
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'subjSel') { P().active = el.value; save(true); go(UI.view.endsWith('s') || ['home', 'school', 'settings'].includes(UI.view) ? UI.view : LISTOF[UI.view]); return; }
  if (el.id === 'wsTwo') { UI.wsTwo = el.checked; saveUI(); return; }
  if (el.id === 'docFile' && el.files[0]) {
    const f = el.files[0], r = find('docs', UI.id);
    idb.put(r.id, f).then(() => { r.fileName = f.name; r.fileType = f.type; if (!r.title) r.title = f.name.replace(/\.[^.]+$/, ''); touch(r); save(true); render(); toast(t('saved')); })
      .catch(() => toast('This file could not be saved on the device.'));
    return;
  }
  if (el.id === 'restoreFile' && el.files[0]) {
    el.files[0].text().then(txt => {
      const data = JSON.parse(txt); if (!data || !data.profile || !COLLS.every(c => Array.isArray(data[c]))) throw 0;
      DB = Object.assign(emptyDB(), data); save(true); UI.view = 'home'; saveUI(); render(); toast(t('restored'));
    }).catch(() => toast(t('badBackup')));
    return;
  }
  if (el.matches('select[data-b]')) { onField(e); if (el.id === 'f-lessonId') render(); }
});

/* ---------- Actions ---------- */
const COLL_OF_VIEW = { lesson: 'lessons', paper: 'papers', worksheet: 'worksheets', deck: 'decks', doc: 'docs', meeting: 'meetings' };
const cur = () => find(COLL_OF_VIEW[UI.view], UI.id);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, arg = b.dataset.arg;
  const A = {
    pickLang() { UI.lang = arg; UI.step = 'subj'; renderOnb(); },
    onbBack() { UI.step = 'lang'; renderOnb(); },
    onbSubj() { const s = UI.draft.subjects, i = s.indexOf(arg); if (i >= 0) s.splice(i, 1); else { if (s.length >= 2) s.shift(); s.push(arg); } renderOnb(); },
    onbLvl() { const s = UI.draft.levels, v = +arg, i = s.indexOf(v); i >= 0 ? s.splice(i, 1) : s.push(v); s.sort(); renderOnb(); },
    onbDone() { const d = UI.draft; DB.profile = { lang: UI.lang, subjects: d.subjects, levels: d.levels, name: d.name.trim(), school: d.school.trim(), active: d.subjects[0] }; save(true); UI.draft = null; go('home'); },
    nav() { go(arg); },
    open() { go(b.dataset.view, arg); },
    newLesson() { go('lesson', newLesson().id); },
    exampleLesson() { go('lesson', newLesson(true).id); },
    newPaper() { go('paper', newPaper(arg).id); },
    examplePaper() { go('paper', newPaper('test', true).id); },
    newWorksheet() { go('worksheet', newWorksheet().id); },
    newDeck() { go('deck', newDeck().id); },
    newDoc() { go('doc', newDoc().id); },
    newMeeting() { go('meeting', newMeeting().id); },
    lessonToWs() { go('worksheet', newWorksheet(cur()).id); },
    lessonToDeck() { go('deck', newDeck(cur()).id); },
    deckFromLesson() { const r = cur(), l = find('lessons', r.lessonId); if (!l) return; r.slides = slidesFromLesson(l); if (!r.title) r.title = l.title; touch(r); render(); },
    dup() { const r = cur(), c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.title = (r.title || t('untitled')) + ' (2)'; c.updated = Date.now(); delete c.fileName; DB[arg].push(c); save(true); go(UI.view, c.id); },
    del() {
      if (!b.dataset.armed) { b.dataset.armed = '1'; const old = b.textContent; b.textContent = t('confirmDel'); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = old; } }, 3000); return; }
      const r = cur(); DB[arg] = DB[arg].filter(x => x.id !== r.id); if (arg === 'docs') idb.del(r.id).catch(() => {}); save(true); go(LISTOF[UI.view]);
    },
    addRow() {
      const r = cur(), blank = { stages: { name: '', min: 5, act: '', eval: '' }, crit: { label: '', pts: 1 }, items: { instr: '', body: '', ans: '' }, slides: { title: '', body: '' }, excerpts: '', decisions: { text: '', done: false } }[arg];
      r[arg].push(typeof blank === 'object' ? Object.assign({}, blank) : blank); touch(r); render();
    },
    rmRow() { const r = cur(), [k, i] = arg.split('.'); r[k].splice(+i, 1); touch(r); render(); },
    addPart() { const r = cur(); r.parts.push(arg === 's' ? { type: 's', text: '' } : { type: 'q', text: '', pts: 1 }); touch(r); render(); },
    setKind() { const r = cur(); r.kind = arg; touch(r); render(); },
    copyEx() { const [docId, i, f] = arg.split('|'), x = find('docs', docId).excerpts[+i], r = cur(); r[f] = (r[f] && r[f].trim() ? r[f].trim() + '\n' : '') + x; touch(r); render(); toast(t('saved')); },
    wsMode() { UI.wsMode = arg; saveUI(); render(); },
    printLesson() { printLesson(cur()); }, printPaper() { printPaper(cur()); }, printKey() { printPaper(cur(), true); },
    printWs() { printWorksheet(cur()); }, printWsKey() { printWorksheet(cur(), true); }, printDeck() { printDeck(cur()); }, printMeeting() { printMeeting(cur()); },
    present() { const r = cur(); if (r.slides.length) present(r); },
    pPrev() { step(-1); }, pNext() { step(1); }, pClose() { closePresent(); },
    openFile() { const r = cur(); idb.get(r.id).then(f => { if (!f) return toast(t('noFile')); const url = URL.createObjectURL(f); const a2 = document.createElement('a'); a2.href = url; a2.target = '_blank'; a2.rel = 'noopener'; document.body.appendChild(a2); a2.click(); a2.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }); },
    setLang() { P().lang = arg; save(true); render(); },
    profSubj() { const s = P().subjects, i = s.indexOf(arg); if (i >= 0) { if (s.length > 1) s.splice(i, 1); } else s.push(arg); if (!s.includes(P().active)) P().active = s[0]; save(true); render(); },
    profLvl() { const s = P().levels, v = +arg, i = s.indexOf(v); if (i >= 0) { if (s.length > 1) s.splice(i, 1); } else s.push(v); s.sort(); save(true); render(); },
    install() { if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); } },
    backup() {
      const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' }), url = URL.createObjectURL(blob), a2 = document.createElement('a');
      a2.href = url; a2.download = 'teacheasy-backup-' + isoToday() + '.json'; document.body.appendChild(a2); a2.click(); a2.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    resetAll() {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = t('confirmDel'); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t('resetAll'); } }, 3000); return; }
      DB = emptyDB(); try { localStorage.removeItem(KEY); localStorage.removeItem(UIKEY); } catch (e2) {} idb.clear().catch(() => {}); UI = { view: 'home', id: null, step: 'lang', wsMode: 'std', wsTwo: false }; render(); toast(t('erased'));
    }
  };
  if (A[a]) { e.preventDefault(); A[a](); }
});

/* Tap left/right half of a slide to move in present mode */
document.addEventListener('click', e => { if (!pres || !e.target.closest('.pslide')) return; const x = e.clientX / innerWidth, rtl = $('#present').getAttribute('dir') === 'rtl'; step((x > 0.5) !== rtl ? 1 : -1); });

window.addEventListener('offline', () => toast(t('offline')));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
})();
