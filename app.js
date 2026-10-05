/* =========================================================
   Caudal · Finanzas personales  ·  núcleo de datos y cálculo
   ========================================================= */
'use strict';
const KEY = 'caudal.v1';
const PALETTE = ['#1F3A68','#B08D57','#3F7A78','#7A8BA6','#8E3B46','#6B7A3A','#C2A878','#4E5D78','#7D5A7A','#2F5D50','#A06A3A','#5B6F8F','#9AA3AF','#3B4A63','#B5654A'];
const FREQS = {1:'Mensual',2:'Bimestral',3:'Trimestral',6:'Semestral',12:'Anual'};
const GROUPS = {necesidad:'Necesidad', deseo:'Deseo', ahorro:'Ahorro / inversión'};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const round2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;

/* ---------- Fechas ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const ymOf = s => s.slice(0, 7);
const curYM = () => ymOf(todayISO());
const ymParts = ym => ym.split('-').map(Number);
const daysIn = ym => { const [y, m] = ymParts(ym); return new Date(y, m, 0).getDate(); };
const addMonths = (ym, n) => { const [y, m] = ymParts(ym); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthDiff = (a, b) => { const [y1, m1] = ymParts(a), [y2, m2] = ymParts(b); return (y2 - y1) * 12 + (m2 - m1); };
const monthEnd = ym => `${ym}-${pad(daysIn(ym))}`;
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTHS_S = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const WD = ['L','M','X','J','V','S','D'];
const WDL = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const monthName = ym => { const [y, m] = ymParts(ym); return `${MONTHS[m - 1]} ${y}`; };
const monthShort = ym => { const [y, m] = ymParts(ym); return `${MONTHS_S[m - 1]} ${String(y).slice(2)}`; };
const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS_S[m - 1]}`; };
const fmtDateLong = s => { const dt = new Date(s + 'T12:00'); const w = WDL[(dt.getDay() + 6) % 7]; return `${w[0].toUpperCase() + w.slice(1)}, ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`; };
const weekday = s => (new Date(s + 'T12:00').getDay() + 6) % 7; // 0 = lunes

/* ---------- Moneda ---------- */
let _nf, _nf0;
function nf() { const c = S.settings.currency || 'EUR'; if (!_nf || _nf.c !== c) { _nf = new Intl.NumberFormat('es-ES', {style:'currency', currency:c}); _nf.c = c; _nf0 = new Intl.NumberFormat('es-ES', {style:'currency', currency:c, maximumFractionDigits:0}); } return _nf; }
const money = n => nf().format(round2(n || 0));
const money0 = n => { nf(); return _nf0.format(Math.round(n || 0)); };
const signed = (n, type) => (type === 'gasto' ? '−' : '+') + money(Math.abs(n));
const pct = (n, d = 0) => isFinite(n) ? `${(n * 100).toFixed(d).replace('.', ',')} %` : '—';
const parseAmount = v => { if (typeof v === 'number') return v; v = String(v || '').trim().replace(/\s|€/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return round2(parseFloat(v) || 0); };

/* ---------- Estado y almacenamiento ---------- */
function defaultCategories() {
  const g = [
    ['Vivienda','necesidad'],['Suministros','necesidad'],['Supermercado','necesidad'],['Transporte','necesidad'],
    ['Salud','necesidad'],['Seguros','necesidad'],['Restauración','deseo'],['Ocio','deseo'],['Compras','deseo'],
    ['Suscripciones','deseo'],['Viajes','deseo'],['Formación','necesidad'],['Regalos','deseo'],['Otros gastos','deseo']
  ].map(([name, group], i) => ({id: uid() + i, name, type:'gasto', color: PALETTE[i % PALETTE.length], group, budget: null}));
  const inc = [['Nómina'],['Extras'],['Inversiones'],['Otros ingresos']].map(([name], i) => ({id: uid() + 'i' + i, name, type:'ingreso', color: ['#2F7A5B','#3F7A78','#6B7A3A','#7A8BA6'][i], group: null, budget: null}));
  return [...g, ...inc];
}
function blankState() {
  return {version:1, settings:{name:'', currency:'EUR', initialBalance:0, initialDate: curYM() + '-01', lastBackup:null, theme:'auto', onboarded:false, created: todayISO()},
    categories: defaultCategories(), tx: [], recurring: [], savings: [], goals: []};
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { console.warn(e); }
  return blankState();
}
function migrate(s) {
  const b = blankState();
  s.settings = Object.assign(b.settings, s.settings || {});
  for (const k of ['categories','tx','recurring','savings','goals']) if (!Array.isArray(s[k])) s[k] = b[k];
  s.recurring.forEach(r => { r.skips = r.skips || []; if (r.active === undefined) r.active = true; });
  s.version = 1; return s;
}
let S = load();
let _saveT;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('No se pudo guardar: almacenamiento lleno'); }
  clearTimeout(_saveT);
  _saveT = setTimeout(() => { try { const t = todayISO(); if (localStorage.getItem(KEY + '.snapDate') !== t) { localStorage.setItem(KEY + '.snap', JSON.stringify(S)); localStorage.setItem(KEY + '.snapDate', t); } } catch (e) {} }, 800);
}

const catById = id => S.categories.find(c => c.id === id) || {id, name:'Sin categoría', color:'#9AA3AF', type:'gasto'};
const catsOf = type => S.categories.filter(c => c.type === type);

/* ---------- Recibos domiciliados ---------- */
function recDateIn(r, ym) {
  if (!r.active) return null;
  const off = monthDiff(r.start, ym);
  if (off < 0 || off % (+r.freq || 1) !== 0) return null;
  if (r.end && ym > r.end) return null;
  return `${ym}-${pad(Math.min(+r.day || 1, daysIn(ym)))}`;
}
/** Contabiliza automáticamente los recibos cuya fecha de cargo ya ha llegado */
function postDueRecurring() {
  const t = todayISO(), cym = curYM(); let n = 0;
  for (const r of S.recurring) {
    if (!r.active) continue;
    for (let ym = r.start; ym <= cym; ym = addMonths(ym, 1)) {
      const d = recDateIn(r, ym); if (!d || d > t) continue;
      const key = `${r.id}:${ym}`;
      if (r.skips.includes(ym) || S.tx.some(x => x.recKey === key)) continue;
      S.tx.push({id: uid(), type: r.type, cat: r.cat, amount: r.amount, concept: r.concept, date: d, note: 'Cargo automático', rec: r.id, recKey: key});
      n++;
    }
  }
  if (n) save();
  return n;
}
/** Recibos aún no cargados en un mes (comprometidos) */
function pendingRecurring(ym, after = todayISO()) {
  const out = [];
  for (const r of S.recurring) {
    const d = recDateIn(r, ym); if (!d || d <= after) continue;
    if (r.skips.includes(ym) || S.tx.some(x => x.recKey === `${r.id}:${ym}`)) continue;
    out.push({r, date: d, amount: r.amount, type: r.type});
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const monthlyEquiv = r => r.amount / (+r.freq || 1);
function nextCharge(r) {
  const t = todayISO();
  for (let i = 0, ym = curYM(); i < 26; i++, ym = addMonths(ym, 1)) {
    const d = recDateIn(r, ym);
    if (d && d >= t && !S.tx.some(x => x.recKey === `${r.id}:${ym}`) && !r.skips.includes(ym)) return d;
  }
  return null;
}

/* ---------- Saldos ---------- */
function balanceAt(d) {
  const from = S.settings.initialDate;
  let b = +S.settings.initialBalance || 0;
  for (const x of S.tx) if (x.date >= from && x.date <= d) b += x.type === 'ingreso' ? x.amount : -x.amount;
  return round2(b);
}
const savingsAt = d => round2(sum(S.savings.filter(s => s.date <= d), s => s.amount));
const goalSaved = (gid, d = '9999') => round2(sum(S.savings.filter(s => s.goal === gid && s.date <= d), s => s.amount));
/** Foto financiera a una fecha de referencia (hoy, o fin de un mes pasado) */
function snapshot(ym) {
  const isCur = ym === curYM();
  const ref = isCur ? todayISO() : monthEnd(ym);
  const bank = balanceAt(ref), saved = savingsAt(ref);
  const pend = isCur ? pendingRecurring(ym) : [];
  const futureManual = isCur ? S.tx.filter(x => ymOf(x.date) === ym && x.date > ref) : [];
  const committed = round2(sum(pend.filter(p => p.type === 'gasto'), p => p.amount) + sum(futureManual.filter(x => x.type === 'gasto'), x => x.amount));
  const expectedIn = round2(sum(pend.filter(p => p.type === 'ingreso'), p => p.amount));
  return {ref, isCur, bank, saved, committed, expectedIn, pend, liquid: round2(bank - saved - committed)};
}

/* ---------- Estadísticas mensuales ---------- */
const txIn = ym => S.tx.filter(x => ymOf(x.date) === ym);
function monthStats(ym, uptoRef = true) {
  let list = txIn(ym);
  if (uptoRef && ym === curYM()) list = list.filter(x => x.date <= todayISO());
  const inc = list.filter(x => x.type === 'ingreso'), exp = list.filter(x => x.type === 'gasto');
  const byCat = {};
  for (const x of exp) { (byCat[x.cat] ||= {cat: x.cat, total: 0, items: []}); byCat[x.cat].total += x.amount; byCat[x.cat].items.push(x); }
  Object.values(byCat).forEach(c => { c.total = round2(c.total); c.items.sort((a, b) => b.date.localeCompare(a.date)); });
  const income = round2(sum(inc, x => x.amount)), expense = round2(sum(exp, x => x.amount));
  const fixed = round2(sum(exp.filter(x => x.rec), x => x.amount));
  const saveMoves = round2(sum(S.savings.filter(s => ymOf(s.date) === ym), s => s.amount));
  const groups = {necesidad: 0, deseo: 0, ahorro: 0};
  for (const x of exp) { const g = catById(x.cat).group; if (groups[g] !== undefined) groups[g] += x.amount; }
  return {ym, income, expense, net: round2(income - expense), rate: income > 0 ? (income - expense) / income : NaN,
    byCat, cats: Object.values(byCat).sort((a, b) => b.total - a.total), fixed, variable: round2(expense - fixed), count: list.length, saveMoves, groups, list};
}
function firstDataYM() {
  let m = ymOf(S.settings.initialDate || todayISO());
  for (const x of S.tx) if (ymOf(x.date) < m) m = ymOf(x.date);
  return m;
}
/** Meses completos anteriores con datos (más reciente primero) */
function historyMonths(ym, n = 6) {
  const first = firstDataYM(), out = [];
  for (let i = 1; i <= n; i++) { const m = addMonths(ym, -i); if (m < first) break; if (txIn(m).length) out.push(m); }
  return out;
}

/* ---------- Previsión de cierre de mes ---------- */
function forecast(ym = curYM()) {
  const D = daysIn(ym), t = todayISO(), d = ym === curYM() ? +t.slice(8) : D;
  const hist = historyMonths(ym, 6);
  const W = hist.map((_, i) => Math.pow(0.65, i)); const Ws = sum(W) || 1;
  const isVar = x => x.type === 'gasto' && !x.rec, isIncNR = x => x.type === 'ingreso' && !x.rec;
  const H = {varTot: 0, varFrac: 0, incTot: 0, incFrac: 0, vars: []};
  hist.forEach((m, i) => {
    const L = txIn(m), Dm = daysIn(m), cut = Math.round(d / D * Dm);
    const vt = sum(L.filter(isVar), x => x.amount), vc = sum(L.filter(x => isVar(x) && +x.date.slice(8) <= cut), x => x.amount);
    const it = sum(L.filter(isIncNR), x => x.amount), ic = sum(L.filter(x => isIncNR(x) && +x.date.slice(8) <= cut), x => x.amount);
    const w = W[i] / Ws;
    H.varTot += w * vt; H.varFrac += w * (vt ? vc / vt : d / D); H.incTot += w * it; H.incFrac += w * (it ? ic / it : 1);
    H.vars.push(vt);
  });
  const cur = txIn(ym).filter(x => x.date <= t);
  const curVar = sum(cur.filter(isVar), x => x.amount), curIncNR = sum(cur.filter(isIncNR), x => x.amount);
  const runRate = d ? curVar / d * D : 0;
  let projVar, method;
  if (!hist.length) { projVar = runRate; method = 'ritmo del mes'; }
  else {
    const pace = H.varFrac > 0.08 ? curVar / H.varFrac : runRate;
    const alpha = clamp(d / D, 0.15, 1);
    projVar = alpha * (0.5 * pace + 0.5 * runRate) + (1 - alpha) * H.varTot;
    method = `ponderación de ${hist.length} mes${hist.length > 1 ? 'es' : ''} + tendencia actual`;
  }
  projVar = Math.max(projVar, curVar);
  const remVar = d >= D ? 0 : projVar - curVar;
  const remInc = hist.length && d < D ? Math.max(0, Math.min(H.incTot * (1 - H.incFrac), H.incTot - curIncNR)) : 0;
  const snap = snapshot(ym);
  const pendExp = sum(snap.pend.filter(p => p.type === 'gasto'), p => p.amount) + sum(S.tx.filter(x => ymOf(x.date) === ym && x.date > t && x.type === 'gasto'), x => x.amount);
  const pendInc = snap.expectedIn + sum(S.tx.filter(x => ymOf(x.date) === ym && x.date > t && x.type === 'ingreso'), x => x.amount);
  const end = snap.bank + remInc + pendInc - remVar - pendExp;
  const mean = H.vars.length ? sum(H.vars) / H.vars.length : projVar;
  const sd = H.vars.length > 1 ? Math.sqrt(sum(H.vars, v => (v - mean) ** 2) / (H.vars.length - 1)) : projVar * 0.25;
  const band = d >= D ? 0 : Math.max(sd * (1 - d / D) * 0.9, projVar * 0.06);
  const conf = hist.length >= 3 && d >= 8 ? 'alta' : hist.length >= 1 ? 'media' : 'baja';
  const ms = monthStats(ym);
  const projExpense = ms.expense + remVar + pendExp;
  const projIncome = ms.income + remInc + pendInc;
  // Serie diaria para el gráfico
  const series = [];
  let b = balanceAt(monthEnd(addMonths(ym, -1)));
  const start = b;
  for (let i = 1; i <= d; i++) {
    const ds = `${ym}-${pad(i)}`;
    if (ds >= S.settings.initialDate) b += sum(txIn(ym).filter(x => x.date === ds), x => x.type === 'ingreso' ? x.amount : -x.amount);
    series.push({day: i, v: round2(b), real: true});
  }
  let pb = b;
  for (let i = d + 1; i <= D; i++) {
    const ds = `${ym}-${pad(i)}`;
    pb -= remVar / (D - d);
    pb += remInc / (D - d);
    pb += sum(snap.pend.filter(p => p.date === ds), p => p.type === 'ingreso' ? p.amount : -p.amount);
    pb += sum(S.tx.filter(x => x.date === ds), x => x.type === 'ingreso' ? x.amount : -x.amount);
    series.push({day: i, v: round2(pb), real: false, band: band * (i - d) / (D - d)});
  }
  return {D, d, hist, end: round2(end), endLiquid: round2(end - snap.saved), band: round2(band), conf, method, projVar: round2(projVar), curVar: round2(curVar),
    remVar: round2(remVar), remInc: round2(remInc), pendExp: round2(pendExp), pendInc: round2(pendInc), histVar: round2(H.varTot), histFrac: H.varFrac,
    projExpense: round2(projExpense), projIncome: round2(projIncome), series, start: round2(start), runRate: round2(runRate)};
}
/** Proyección de gasto de una categoría al cierre del mes en curso */
function catProjection(catId, ym) {
  const spent = monthStats(ym).byCat[catId]?.total || 0;
  if (ym !== curYM()) return spent;
  const D = daysIn(ym), d = +todayISO().slice(8);
  const hist = historyMonths(ym, 4);
  const pendRec = sum(pendingRecurring(ym).filter(p => p.r.cat === catId && p.type === 'gasto'), p => p.amount);
  const varSpent = sum(txIn(ym).filter(x => x.cat === catId && x.type === 'gasto' && !x.rec && x.date <= todayISO()), x => x.amount);
  const fixedSpent = spent - varSpent;
  const histAvg = hist.length ? sum(hist, m => sum(txIn(m).filter(x => x.cat === catId && x.type === 'gasto' && !x.rec), x => x.amount)) / hist.length : 0;
  const a = hist.length ? Math.pow(d / D, 1.5) : clamp(d / D, 0.3, 1);
  const projVarCat = Math.max(varSpent, a * (varSpent / Math.max(d, 1) * D) + (1 - a) * Math.max(histAvg, varSpent));
  return round2(fixedSpent + pendRec + projVarCat);
}

/* ---------- Suscripciones ---------- */
const SUB_WORDS = ['netflix','hbo','max','disney','prime','amazon prime','spotify','apple','icloud','youtube','dazn','movistar','filmin','skyshowtime','audible','kindle','xbox','playstation','nintendo','gym','gimnasio','basic fit','adobe','microsoft','office','google one','chatgpt','claude','dropbox','tidal','deezer','crunchyroll','atresplayer','rakuten','linkedin','patreon','twitch','onlyfans','tinder','bumble','duolingo','headspace','strava','revista','periódico','newspaper'];
const STREAM = ['netflix','hbo','max','disney','prime','dazn','movistar','filmin','skyshowtime','atresplayer','rakuten','crunchyroll','youtube'];
const normConcept = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[0-9*#/\\.,:;_-]+/g, ' ').replace(/\s+/g, ' ').trim();
function subscriptionsAnalysis() {
  const subCat = S.categories.find(c => /suscrip/i.test(c.name))?.id;
  const income = avgMonthly('income', 3) || 0;
  const items = [];
  // 1) Declaradas como recibo
  for (const r of S.recurring.filter(r => r.active && r.type === 'gasto')) {
    const n = normConcept(r.concept);
    const isSub = r.sub || r.cat === subCat || SUB_WORDS.some(w => n.includes(w));
    if (!isSub) continue;
    const past = S.tx.filter(x => x.rec === r.id).sort((a, b) => a.date.localeCompare(b.date));
    const first = past[0]?.amount, increase = first && r.amount > first * 1.04 ? (r.amount - first) / first : 0;
    items.push({src: 'recibo', id: r.id, concept: r.concept, cat: r.cat, monthly: monthlyEquiv(r), annual: monthlyEquiv(r) * 12, freq: r.freq, increase, n});
  }
  // 2) Detectadas en tus movimientos (cargos repetidos no registrados como recibo)
  const cym = curYM(), from = addMonths(cym, -6), groups = {};
  for (const x of S.tx) {
    if (x.type !== 'gasto' || x.rec || ymOf(x.date) < from) continue;
    const n = normConcept(x.concept); if (!n) continue;
    (groups[n] ||= []).push(x);
  }
  for (const [n, L] of Object.entries(groups)) {
    const months = new Set(L.map(x => ymOf(x.date)));
    if (months.size < 3) continue;
    const am = L.map(x => x.amount), mean = sum(am) / am.length;
    const cv = Math.sqrt(sum(am, a => (a - mean) ** 2) / am.length) / (mean || 1);
    const looksSub = SUB_WORDS.some(w => n.includes(w)) || L[0].cat === subCat;
    if (cv > 0.2 && !looksSub) continue;
    if (L.length > months.size * 1.6 && !looksSub) continue; // compras frecuentes, no suscripción
    const sorted = L.slice().sort((a, b) => a.date.localeCompare(b.date));
    const increase = sorted.at(-1).amount > sorted[0].amount * 1.04 ? (sorted.at(-1).amount - sorted[0].amount) / sorted[0].amount : 0;
    items.push({src: 'detectada', concept: sorted.at(-1).concept, cat: sorted.at(-1).cat, monthly: mean * L.length / months.size, annual: mean * L.length / months.size * 12, increase, n, count: L.length});
  }
  const total = sum(items, i => i.monthly);
  const streaming = items.filter(i => STREAM.some(w => i.n.includes(w)));
  for (const it of items) {
    let score = 0; const why = [];
    if (it.annual >= 300) { score += 2; why.push(`${money0(it.annual)} al año`); }
    else if (it.annual >= 120) { score += 1; why.push(`${money0(it.annual)} al año`); }
    if (it.increase > 0) { score += 2; why.push(`subida del ${pct(it.increase)}`); }
    if (it.src === 'detectada') { score += 1; why.push('no registrada como recibo'); }
    if (streaming.length >= 3 && streaming.includes(it)) { score += 1; why.push(`solapada con ${streaming.length - 1} plataformas más`); }
    if (income && it.monthly / income > 0.03) { score += 1; why.push(`${pct(it.monthly / income, 1)} de tus ingresos`); }
    it.score = score; it.level = score >= 3 ? 'alto' : score >= 2 ? 'medio' : 'bajo'; it.why = why;
  }
  items.sort((a, b) => b.score - a.score || b.annual - a.annual);
  return {items, total, annual: total * 12, share: income ? total / income : NaN, streaming: streaming.length, income};
}

/* ---------- Agregados ---------- */
function avgMonthly(field, n = 3, ym = curYM()) {
  const ms = historyMonths(ym, n); if (!ms.length) return 0;
  return sum(ms, m => monthStats(m)[field]) / ms.length;
}
function rangeMonths(n, endYM = curYM()) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addMonths(endYM, -i)); return out.filter(m => m >= firstDataYM()); }
/* =========================================================
   Consejos dinámicos: reglas sobre tu comportamiento real
   ========================================================= */
function insights(ym, opts = {}) {
  const out = [];
  const add = (level, title, text, w = 0) => out.push({level, title, text, w});
  const ms = monthStats(ym), isCur = ym === curYM();
  const hist = historyMonths(ym, 6);
  const avgExp = hist.length ? sum(hist, m => monthStats(m).expense) / hist.length : 0;
  const avgInc = hist.length ? sum(hist, m => monthStats(m).income) / hist.length : 0;
  const snap = snapshot(ym);

  if (!S.tx.length) { add('info', 'Empieza registrando tus movimientos', 'Añade tu nómina y los recibos fijos en Planificar → Recibos. Con 2-3 semanas de datos los consejos y la previsión empezarán a ser precisos.'); return out; }

  // 1. Previsión de cierre
  if (isCur) {
    const f = forecast(ym);
    if (f.endLiquid < 0) add('alert', 'Riesgo de cerrar el mes en negativo', `Al ritmo actual tu liquidez disponible a fin de mes sería de ${money(f.endLiquid)}. Necesitas recortar unos ${money0(-f.endLiquid / Math.max(1, f.D - f.d))} al día en gasto variable lo que queda de mes, o retirar parte del ahorro apartado.`, 100);
    else if (f.hist.length && f.curVar > f.histVar * f.histFrac * 1.15 && f.d >= 5) {
      const exceso = f.curVar - f.histVar * f.histFrac;
      add('warn', 'Vas más rápido que de costumbre', `Llevas ${money0(exceso)} más de gasto variable que a estas alturas en tus meses anteriores (+${pct(exceso / (f.histVar * f.histFrac))}). Si mantienes el ritmo, cerrarás con ${money0(f.projVar - f.histVar)} más de gasto que tu media.`, 70);
    } else if (f.hist.length && f.d >= 7 && f.curVar < f.histVar * f.histFrac * 0.85) {
      add('good', 'Gasto por debajo de tu media', `Llevas un ${pct(1 - f.curVar / (f.histVar * f.histFrac))} menos de gasto variable que en meses anteriores a estas alturas. Si lo mantienes, podrías apartar ${money0(f.histVar - f.projVar)} extra al ahorro este mes.`, 40);
    }
  }

  // 2. Topes de gasto
  for (const c of catsOf('gasto').filter(c => c.budget > 0)) {
    const spent = ms.byCat[c.id]?.total || 0, proj = catProjection(c.id, ym), r = spent / c.budget;
    if (r >= 1) add('alert', `Tope superado en ${c.name}`, `Has gastado ${money(spent)} de ${money(c.budget)} (${pct(r)}). Cada euro adicional aquí sale directamente de tu capacidad de ahorro.`, 90);
    else if (isCur && +todayISO().slice(8) >= 7 && proj > c.budget * 1.02) add('warn', `${c.name} va camino de pasarse`, `Llevas ${money(spent)} (${pct(r)} del tope). La proyección al cierre es ${money(proj)}, ${money0(proj - c.budget)} por encima. Margen diario recomendado: ${money(Math.max(0, (c.budget - spent) / Math.max(1, daysIn(ym) - +todayISO().slice(8))))}.`, 75);
    else if (r >= 0.8) add('warn', `${c.name} al ${pct(r)} del tope`, `Te quedan ${money(c.budget - spent)} para el resto del mes.`, 60);
  }

  // 3. Tasa de ahorro
  if (ms.income > 0 && (!isCur || +todayISO().slice(8) >= 20)) {
    if (ms.rate < 0) add('alert', 'Gastas más de lo que ingresas', `Este mes el gasto supera a los ingresos en ${money(-ms.net)}. Si se repite, en 12 meses habrás consumido ${money0(-ms.net * 12)} de tus reservas.`, 85);
    else if (ms.rate < 0.10) add('warn', `Tasa de ahorro del ${pct(ms.rate)}`, `Lo recomendable es al menos un 10-20 %. Subir solo 5 puntos supondría ${money0(ms.income * 0.05 * 12)} más al año.`, 55);
    else if (ms.rate >= 0.2) add('good', `Excelente tasa de ahorro: ${pct(ms.rate)}`, `A este ritmo acumularías ${money0(ms.net * 12)} en un año. Considera automatizar parte en un objetivo de ahorro o inversión.`, 30);
  }

  // 4. Fondo de emergencia
  const fixedAvg = avgExp || ms.expense;
  if (fixedAvg > 0) {
    const cushion = (snap.bank) / fixedAvg;
    if (cushion < 3) add('warn', `Colchón de ${cushion.toFixed(1).replace('.', ',')} meses`, `Tu saldo cubre ${cushion.toFixed(1).replace('.', ',')} meses de gastos. El objetivo prudente son 3-6 meses (${money0(fixedAvg * 3)}–${money0(fixedAvg * 6)}). Crea un objetivo "Fondo de emergencia".`, 50);
    else if (cushion >= 6 && !opts.short) add('info', `Colchón sólido: ${cushion.toFixed(1).replace('.', ',')} meses`, `Tienes más de 6 meses de gastos cubiertos. El exceso sobre ${money0(fixedAvg * 6)} podría rendir más en un depósito o inversión.`, 20);
  }

  // 5. Categorías disparadas
  if (hist.length >= 2) {
    for (const c of ms.cats.slice(0, 6)) {
      const avg = sum(hist, m => monthStats(m).byCat[c.cat]?.total || 0) / hist.length;
      const val = isCur ? catProjection(c.cat, ym) : c.total;
      if ((!isCur || +todayISO().slice(8) >= 10) && avg > 30 && val > avg * 1.3 && val - avg > 40) add('warn', `${catById(c.cat).name}: +${pct(val / avg - 1)} vs. tu media`, `${isCur ? 'Proyectas' : 'Gastaste'} ${money0(val)} frente a ${money0(avg)} habituales. Mantenido 12 meses serían ${money0((val - avg) * 12)} extra.`, 58);
    }
  }

  // 6. Gastos hormiga
  const small = ms.list.filter(x => x.type === 'gasto' && x.amount < 10 && !x.rec);
  if (small.length >= 8) add('info', `${small.length} gastos pequeños este mes`, `Suman ${money(sum(small, x => x.amount))}. Proyectado a un año son ${money0(sum(small, x => x.amount) * 12)}: los "gastos hormiga" suelen ser el ajuste más fácil.`, 35);

  // 7. Fin de semana
  const exp = ms.list.filter(x => x.type === 'gasto' && !x.rec);
  if (exp.length >= 12) {
    const we = sum(exp.filter(x => weekday(x.date) >= 5), x => x.amount), all = sum(exp, x => x.amount);
    if (all && we / all > 0.45) add('info', `El ${pct(we / all)} del gasto variable es en fin de semana`, 'Planificar el ocio del fin de semana con un importe cerrado suele recortar entre un 15 y un 25 % de esta partida.', 25);
  }

  // 8. Suscripciones
  const sa = subscriptionsAnalysis();
  if (sa.items.length) {
    const hi = sa.items.filter(i => i.level === 'alto');
    if (hi.length) add('warn', `${hi.length} suscripción${hi.length > 1 ? 'es' : ''} de riesgo`, `${hi.slice(0, 3).map(i => i.concept).join(', ')}. En total pagas ${money(sa.total)}/mes en suscripciones (${money0(sa.annual)} al año). Revísalas en Planificar → Suscripciones.`, 65);
    else if (sa.share > 0.05) add('info', 'Suscripciones por encima del 5 % de tus ingresos', `${money(sa.total)}/mes (${pct(sa.share, 1)}). Cancelar la menos usada es dinero recurrente recuperado.`, 40);
  }

  // 9. Objetivos
  const avgSave = Math.max(0, avgInc - avgExp);
  for (const g of S.goals) {
    const saved = goalSaved(g.id), left = g.target - saved; if (left <= 0) continue;
    const months = Math.max(1, monthDiff(curYM(), ymOf(g.deadline)) + 1), need = left / months;
    if (avgSave && need > avgSave * 0.9) add('warn', `Objetivo "${g.name}" en riesgo`, `Necesitas ${money0(need)}/mes hasta ${fmtDate(g.deadline)} y tu capacidad media de ahorro es ${money0(avgSave)}/mes. Amplía el plazo o reduce gasto variable.`, 62);
    else if (avgSave && !opts.short) add('good', `"${g.name}" va en plazo`, `Aportando ${money0(need)}/mes lo alcanzarás antes de ${fmtDate(g.deadline)}.`, 15);
  }

  // 10. Recibos y comprometido
  if (isCur && snap.committed > 0 && snap.liquid < snap.committed) add('warn', 'Los recibos pendientes tensan tu liquidez', `Quedan ${money(snap.committed)} en cargos este mes y tu liquidez libre tras ellos es ${money(snap.liquid)}.`, 72);
  const fixedShare = ms.income ? sum(S.recurring.filter(r => r.active && r.type === 'gasto'), monthlyEquiv) / (avgInc || ms.income) : 0;
  if (fixedShare > 0.6) add('warn', `Tus gastos fijos son el ${pct(fixedShare)} de tus ingresos`, 'Por encima del 50-60 % queda poco margen ante imprevistos. Renegociar seguros, tarifas o suministros tiene efecto todos los meses.', 45);

  // 11. 50/30/20
  if (ms.income > 0 && ms.expense > 0 && !opts.short && (!isCur || +todayISO().slice(8) >= 25)) {
    const n = ms.groups.necesidad / ms.income, w = ms.groups.deseo / ms.income;
    if (w > 0.35) add('info', `Deseos: ${pct(w)} de tus ingresos`, `La regla 50/30/20 sugiere ≈30 %. Bajar al 30 % liberaría ${money0((w - 0.3) * ms.income)} al mes.`, 30);
    if (n > 0.6) add('info', `Necesidades: ${pct(n)} de tus ingresos`, 'Por encima del 50-60 %: revisa vivienda, suministros y seguros, que son los costes con más impacto a largo plazo.', 28);
  }

  // 12. Copia de seguridad
  const lb = S.settings.lastBackup;
  if (S.tx.length > 15 && (!lb || (Date.now() - new Date(lb).getTime()) / 864e5 > 14)) add('gold', 'Haz una copia de seguridad', lb ? `La última fue el ${fmtDate(lb.slice(0, 10))}. Guarda una en Archivos o iCloud desde Ajustes.` : 'Aún no tienes ninguna. Tus datos viven solo en este iPhone: exporta una copia desde Ajustes → Copia de seguridad.', 66);

  return out.sort((a, b) => b.w - a.w);
}

/* =========================================================
   Gráficos SVG
   ========================================================= */
function donutSVG(parts, total, label) {
  const R = 60, C = 2 * Math.PI * R; let acc = 0;
  const gap = parts.length > 1 ? 2 : 0;
  const arcs = parts.map(p => {
    const len = total ? p.value / total * C : 0, seg = Math.max(0, len - gap);
    const s = `<circle data-cat="${p.id}" r="${R}" cx="75" cy="75" fill="none" stroke="${p.color}" stroke-width="18" stroke-dasharray="${seg} ${C - seg}" stroke-dashoffset="${-acc}"/>`;
    acc += len; return s;
  }).join('');
  return `<div class="donut"><svg viewBox="0 0 150 150"><circle r="${R}" cx="75" cy="75" fill="none" stroke="var(--card2)" stroke-width="18"/>${arcs}</svg>
    <div class="center"><span>${esc(label)}</span><b class="num">${money0(total)}</b></div></div>`;
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p * 2) / 2 * p; }
const kfmt = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace('.', ',') + 'k' : Math.round(v);
function barsSVG(months, opt = {}) {
  const W = 360, H = 190, L = 34, B = 22, T = 10, iw = W - L - 6, ih = H - B - T;
  const data = months.map(m => monthStats(m, false));
  const max = niceMax(Math.max(1, ...data.map(d => Math.max(d.income, d.expense))));
  const bw = iw / data.length;
  const y = v => T + ih - v / max * ih;
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = max * i / 4; g += `<line x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${kfmt(v)}</text>`; }
  data.forEach((d, i) => {
    const x = L + i * bw, w = Math.min(14, bw * 0.3);
    g += `<rect x="${x + bw / 2 - w - 1}" y="${y(d.income)}" width="${w}" height="${ih + T - y(d.income)}" rx="3" fill="var(--pos)" opacity=".85"/>`;
    g += `<rect x="${x + bw / 2 + 1}" y="${y(d.expense)}" width="${w}" height="${ih + T - y(d.expense)}" rx="3" fill="var(--navy)"/>`;
    g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${MONTHS_S[ymParts(d.ym)[1] - 1]}</text>`;
  });
  const pts = data.map((d, i) => `${L + i * bw + bw / 2},${y(Math.max(0, d.net))}`).join(' ');
  g += `<polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-dasharray="4 3"/>`;
  data.forEach((d, i) => g += `<circle cx="${L + i * bw + bw / 2}" cy="${y(Math.max(0, d.net))}" r="3" fill="var(--gold)"/>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>
  <div class="row" style="gap:14px;font-size:12px;color:var(--ink2);margin-top:6px"><span class="row" style="gap:5px"><i class="dot" style="background:var(--pos)"></i>Ingresos</span><span class="row" style="gap:5px"><i class="dot" style="background:var(--navy)"></i>Gastos</span><span class="row" style="gap:5px"><i class="dot" style="background:var(--gold)"></i>Ahorro neto</span></div>`;
}
function forecastSVG(f) {
  const W = 360, H = 150, L = 38, B = 20, T = 10, iw = W - L - 8, ih = H - B - T;
  const vals = f.series.flatMap(p => [p.v + (p.band || 0), p.v - (p.band || 0)]).concat([f.start]);
  let mn = Math.min(...vals), mx = Math.max(...vals); if (mx - mn < 1) { mx += 50; mn -= 50; }
  const pad_ = (mx - mn) * 0.1; mn -= pad_; mx += pad_;
  const x = d => L + (d / f.D) * iw, y = v => T + ih - (v - mn) / (mx - mn) * ih;
  let g = '';
  for (let i = 0; i <= 3; i++) { const v = mn + (mx - mn) * i / 3; g += `<line x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${kfmt(v)}</text>`; }
  if (mn < 0 && mx > 0) g += `<line x1="${L}" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}" stroke="var(--neg)" stroke-dasharray="2 3" opacity=".6"/>`;
  const real = [{day: 0, v: f.start}, ...f.series.filter(p => p.real)];
  const proj = f.series.filter(p => !p.real);
  g += `<polyline points="${real.map(p => `${x(p.day)},${y(p.v)}`).join(' ')}" fill="none" stroke="var(--navy)" stroke-width="2.4" stroke-linejoin="round"/>`;
  if (proj.length) {
    const last = real.at(-1);
    const up = [last, ...proj].map(p => `${x(p.day)},${y(p.v + (p.band || 0))}`), dn = [last, ...proj].reverse().map(p => `${x(p.day)},${y(p.v - (p.band || 0))}`);
    g += `<polygon points="${up.concat(dn).join(' ')}" fill="var(--gold)" opacity=".16"/>`;
    g += `<polyline points="${[last, ...proj].map(p => `${x(p.day)},${y(p.v)}`).join(' ')}" fill="none" stroke="var(--gold)" stroke-width="2.2" stroke-dasharray="5 4"/>`;
    g += `<circle cx="${x(last.day)}" cy="${y(last.v)}" r="4" fill="var(--navy)" stroke="var(--card)" stroke-width="2"/>`;
    g += `<circle cx="${x(proj.at(-1).day)}" cy="${y(proj.at(-1).v)}" r="4" fill="var(--gold)"/>`;
  }
  [1, 10, 20, f.D].forEach(d => g += `<text x="${x(d)}" y="${H - 5}" text-anchor="middle">${d}</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
function ringSVG(p, color) {
  const R = 27, C = 2 * Math.PI * R, l = clamp(p, 0, 1) * C;
  return `<div class="ring"><svg viewBox="0 0 64 64"><circle r="${R}" cx="32" cy="32" fill="none" stroke="var(--card2)" stroke-width="6"/><circle r="${R}" cx="32" cy="32" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${l} ${C}"/></svg><b>${Math.round(clamp(p, 0, 9.99) * 100)}%</b></div>`;
}
/* =========================================================
   Vistas
   ========================================================= */
const ui = {tab: 'home', month: curYM(), open: new Set(), q: '', ftype: 'all', fcat: 'all', fscope: 'month', calDay: null, plan: 'budgets', period: 6};
const IC = {
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>',
};
const initials = s => (s || '?').trim().slice(0, 1).toUpperCase();

function header(title, kicker, right = '') {
  return `<div class="top"><div><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1></div>${right}</div>`;
}
function monthBar() {
  const isCur = ui.month === curYM(), canBack = ui.month > addMonths(firstDataYM(), -1);
  return `<div class="monthbar"><button data-act="mprev" ${canBack ? '' : 'disabled'} aria-label="Mes anterior">${IC.left}</button>
    <div class="lbl">${monthName(ui.month)}<small>${isCur ? 'Mes en curso' : 'Histórico · toca para volver a hoy'}</small></div>
    <button data-act="mnext" ${isCur ? 'disabled' : ''} aria-label="Mes siguiente">${IC.right}</button></div>`;
}
const gearBtn = '<button class="iconbtn" data-act="settings" aria-label="Ajustes">' + IC.gear + '</button>';
function txRow(x) {
  const c = catById(x.cat);
  return `<button class="item" data-edit="${x.id}"><div class="avatar" style="background:${c.color}">${esc(initials(c.name))}</div>
    <div class="grow"><div class="t ell">${esc(x.concept || c.name)}</div><div class="s ell">${esc(c.name)} · ${fmtDate(x.date)}${x.rec ? ' · <span class="pill gold">Recibo</span>' : ''}</div></div>
    <div class="a num ${x.type === 'ingreso' ? 'pos' : ''}">${signed(x.amount, x.type)}</div></button>`;
}
function bigMoney(n) {
  const s = money(n), m = s.match(/^(.*?)([,]\d\d)(\s?\D*)$/);
  return m ? `${esc(m[1])}<span class="cents">${m[2]}</span>${esc(m[3])}` : esc(s);
}

/* ---------- Resumen ---------- */
function viewHome() {
  const ym = ui.month, ms = monthStats(ym), snap = snapshot(ym), isCur = ym === curYM();
  const hello = S.settings.name ? `Hola, ${S.settings.name}` : 'Tus finanzas';
  let h = header('Resumen', hello, gearBtn) + monthBar();
  h += `<section class="hero"><div class="lab">${isCur ? 'Liquidez disponible' : 'Liquidez al cierre de ' + MONTHS[ymParts(ym)[1] - 1]}</div>
    <div class="big num">${bigMoney(snap.liquid)}</div>
    <div class="note">${isCur ? 'Descontados ahorro apartado y recibos pendientes del mes' : 'Saldo al cierre menos ahorro apartado'}</div>
    <div class="split"><div><span>Saldo en cuenta</span><b class="num">${money0(snap.bank)}</b></div>
    <div><span>Ahorro apartado</span><b class="num">${money0(snap.saved)}</b></div>
    <div><span>${isCur ? 'Comprometido' : 'Neto del mes'}</span><b class="num">${isCur ? money0(snap.committed) : money0(ms.net)}</b></div></div></section>`;
  h += `<div class="kpis"><div class="kpi"><span>Ingresos</span><b class="num pos">${money0(ms.income)}</b></div>
    <div class="kpi"><span>Gastos</span><b class="num">${money0(ms.expense)}</b></div>
    <div class="kpi"><span>Balance del mes</span><b class="num ${ms.net < 0 ? 'neg' : ''}">${money0(ms.net)}</b></div>
    <div class="kpi"><span>Tasa de ahorro</span><b class="num">${ms.income ? pct(ms.rate) : '—'}</b></div></div>`;

  // Previsión
  if (isCur) {
    const f = forecast(ym);
    h += `<div class="card"><div class="row between"><h2 style="margin:0">Previsión de cierre</h2><span class="pill ${f.conf === 'alta' ? 'pos' : f.conf === 'media' ? 'gold' : ''}">Precisión ${f.conf}</span></div>
      <div class="row between" style="margin:12px 0 4px;align-items:flex-end"><div><div class="sub">Saldo estimado a ${daysIn(ym)} de ${MONTHS[ymParts(ym)[1] - 1]}</div>
      <div class="forecast-num num ${f.end < 0 ? 'neg' : ''}">${money0(f.end)}</div><div class="sub num">± ${money0(f.band)} · liquidez ${money0(f.endLiquid)}</div></div>
      <div style="text-align:right" class="sub num">Gasto previsto<br><b style="color:var(--ink);font-size:16px">${money0(f.projExpense)}</b></div></div>
      ${forecastSVG(f)}
      <p class="sub" style="margin:8px 0 0;line-height:1.45">Gasto variable: ${money0(f.curVar)} hasta hoy → ${money0(f.projVar)} estimados. Recibos pendientes ${money0(f.pendExp)}${f.pendInc + f.remInc > 0 ? ` · ingresos esperados ${money0(f.pendInc + f.remInc)}` : ''}. Método: ${esc(f.method)}.</p></div>`;
  }

  // Quesito
  const cats = ms.cats;
  h += `<div class="card"><h2>Gasto por categoría</h2>`;
  if (!cats.length) h += `<div class="empty"><b>Sin gastos este mes</b>Pulsa el botón dorado para añadir el primero.</div>`;
  else {
    const top = cats.slice(0, 7), rest = cats.slice(7);
    const parts = top.map(c => ({id: c.cat, value: c.total, color: catById(c.cat).color}));
    if (rest.length) parts.push({id: '_rest', value: sum(rest, c => c.total), color: '#9AA3AF'});
    h += `<div class="donut-wrap">${donutSVG(parts, ms.expense, 'Gastado')}<div class="legend">${top.map(c => { const k = catById(c.cat); return `<button data-jump="${c.cat}"><i class="dot" style="background:${k.color}"></i><span class="ell">${esc(k.name)}</span><b class="num">${pct(c.total / ms.expense)}</b></button>`; }).join('')}
      ${rest.length ? `<button><i class="dot" style="background:#9AA3AF"></i><span class="ell">Otras (${rest.length})</span><b class="num">${pct(sum(rest, c => c.total) / ms.expense)}</b></button>` : ''}</div></div>`;
  }
  h += `</div>`;

  // Acordeón por categoría
  if (cats.length) {
    h += `<div class="sec-title">Detalle mensual<small>${ms.list.filter(x => x.type === 'gasto').length} gastos</small></div><div class="card" style="padding:4px 16px">`;
    for (const c of cats) {
      const k = catById(c.cat), open = ui.open.has(c.cat), b = k.budget;
      const r = b ? c.total / b : 0;
      h += `<div class="acc ${open ? 'open' : ''}" id="acc-${c.cat}"><button class="acc-h" data-acc="${c.cat}">${IC.chev}<i class="dot" style="background:${k.color}"></i>
        <div class="grow"><div class="row between"><span class="ell" style="font-weight:500">${esc(k.name)}</span><b class="num">${money(c.total)}</b></div>
        <div class="row between sub" style="font-size:12px;margin-top:1px"><span>${c.items.length} mov. · ${pct(c.total / ms.expense)}</span>${b ? `<span class="${r >= 1 ? 'neg' : r >= .8 ? 'warn' : ''}">tope ${money0(b)}</span>` : ''}</div>
        ${b ? `<div class="bar"><i class="${r >= 1 ? 'neg' : r >= .8 ? 'warn' : ''}" style="width:${clamp(r, 0, 1) * 100}%"></i></div>` : ''}</div></button>
        <div class="acc-b">${c.items.map(x => `<div class="mini-row" data-edit="${x.id}"><span class="d">${fmtDate(x.date)}</span><span class="grow ell">${esc(x.concept || '—')}${x.rec ? ' <span class="pill gold">Recibo</span>' : ''}</span><b class="num">${money(x.amount)}</b></div>`).join('')}</div></div>`;
    }
    h += `</div>`;
  }

  // Consejos
  const tips = insights(ym, {short: true}).slice(0, 5);
  if (tips.length) h += `<div class="sec-title">Consejos para ti<small>según tu comportamiento</small></div><div class="tips">${tips.map(t => `<div class="tip ${t.level}"><div><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div></div>`).join('')}</div>`;

  // Últimos
  const last = txIn(ym).sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 5);
  if (last.length) h += `<div class="sec-title">Últimos movimientos<button class="link" data-tabgo="moves">Ver todos</button></div><div class="list">${last.map(txRow).join('')}</div>`;
  return h;
}

/* ---------- Movimientos ---------- */
function viewMoves() {
  let h = header('Movimientos', 'Registro', gearBtn);
  h += `<div class="search">${IC.search}<input id="q" type="search" placeholder="Buscar concepto, categoría o importe" value="${esc(ui.q)}" autocomplete="off"></div>`;
  const chip = (k, v, l) => `<button class="chip ${ui[k] === v ? 'on' : ''}" data-f="${k}" data-v="${v}">${l}</button>`;
  h += `<div class="chips">${chip('fscope', 'month', 'Mes visible')}${chip('fscope', 'all', 'Todo el historial')}${chip('ftype', 'all', 'Todos')}${chip('ftype', 'gasto', 'Gastos')}${chip('ftype', 'ingreso', 'Ingresos')}${chip('ftype', 'rec', 'Recibos')}</div>`;
  h += `<div class="chips"><button class="chip ${ui.fcat === 'all' ? 'on' : ''}" data-f="fcat" data-v="all">Todas las categorías</button>${S.categories.map(c => `<button class="chip ${ui.fcat === c.id ? 'on' : ''}" data-f="fcat" data-v="${c.id}"><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</button>`).join('')}</div>`;
  if (ui.fscope === 'month') h += monthBar();
  let L = ui.fscope === 'month' ? txIn(ui.month) : S.tx.slice();
  if (ui.ftype === 'rec') L = L.filter(x => x.rec); else if (ui.ftype !== 'all') L = L.filter(x => x.type === ui.ftype);
  if (ui.fcat !== 'all') L = L.filter(x => x.cat === ui.fcat);
  const q = normConcept(ui.q);
  if (q) { const qa = parseAmount(ui.q); L = L.filter(x => normConcept(x.concept + ' ' + (x.note || '') + ' ' + catById(x.cat).name).includes(q) || (qa && Math.abs(x.amount - qa) < 0.01)); }
  L.sort((a, b) => b.date.localeCompare(a.date));
  const inc = sum(L.filter(x => x.type === 'ingreso'), x => x.amount), exp = sum(L.filter(x => x.type === 'gasto'), x => x.amount);
  h += `<div class="kpis"><div class="kpi"><span>Ingresos (${L.filter(x => x.type === 'ingreso').length})</span><b class="num pos">${money(inc)}</b></div><div class="kpi"><span>Gastos (${L.filter(x => x.type === 'gasto').length})</span><b class="num">${money(exp)}</b></div></div>`;
  if (!L.length) return h + `<div class="list"><div class="empty"><b>Nada por aquí</b>${q || ui.fcat !== 'all' || ui.ftype !== 'all' ? 'Prueba a cambiar la búsqueda o los filtros.' : 'Añade un movimiento con el botón dorado.'}</div></div>`;
  const days = {}; L.slice(0, 400).forEach(x => (days[x.date] ||= []).push(x));
  for (const [d, xs] of Object.entries(days)) {
    const net = sum(xs, x => x.type === 'ingreso' ? x.amount : -x.amount);
    h += `<div class="day-h"><span>${fmtDateLong(d)}${ui.fscope === 'all' ? ' ' + d.slice(0, 4) : ''}</span><span class="num">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></div><div class="list">${xs.map(txRow).join('')}</div>`;
  }
  if (L.length > 400) h += `<p class="sub" style="text-align:center">Mostrando 400 de ${L.length}. Afina con la búsqueda.</p>`;
  return h;
}

/* ---------- Calendario (mapa de calor) ---------- */
function viewCalendar() {
  const ym = ui.month, D = daysIn(ym), first = weekday(ym + '-01'), t = todayISO();
  let h = header('Calendario', 'Mapa de calor del gasto', gearBtn) + monthBar();
  const daily = {}, incDay = {}, recDay = {};
  for (const x of txIn(ym)) { if (x.type === 'gasto') daily[x.date] = (daily[x.date] || 0) + x.amount; else incDay[x.date] = 1; }
  if (ym === curYM()) for (const p of pendingRecurring(ym)) recDay[p.date] = 1;
  // Umbrales: cuantiles del gasto diario variable de los últimos 4 meses + mes visible
  const ref = [];
  for (let i = 0; i < 4; i++) { const m = addMonths(ym, -i); const dd = {}; txIn(m).filter(x => x.type === 'gasto').forEach(x => dd[x.date] = (dd[x.date] || 0) + x.amount); ref.push(...Object.values(dd)); }
  ref.sort((a, b) => a - b);
  const q = p => ref.length ? ref[Math.min(ref.length - 1, Math.floor(p * ref.length))] : 0;
  const th = [q(.2), q(.45), q(.7), q(.9)];
  const lvl = v => !v ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : v <= th[3] ? 4 : 5;
  h += `<div class="card"><div class="cal">${WD.map(w => `<div class="wd">${w}</div>`).join('')}${'<div></div>'.repeat(first)}`;
  for (let i = 1; i <= D; i++) {
    const ds = `${ym}-${pad(i)}`, v = daily[ds] || 0;
    h += `<button class="c l${lvl(v)} ${ds === t ? 'today' : ''} ${ui.calDay === ds ? 'sel' : ''} ${ds > t ? 'future' : ''}" data-day="${ds}">${i}${v ? `<em class="num">${kfmt(v)}</em>` : ''}${incDay[ds] ? '<i></i>' : ''}${recDay[ds] ? '<i class="r"></i>' : ''}</button>`;
  }
  h += `</div><div class="heat-legend"><span>Menos</span>${[0, 1, 2, 3, 4, 5].map(i => `<i style="background:var(--h${i})"></i>`).join('')}<span>Más</span></div>
    <div class="row sub" style="gap:14px;font-size:12px;margin-top:8px"><span class="row" style="gap:5px"><i class="dot" style="background:var(--pos);width:6px;height:6px"></i>Ingreso</span><span class="row" style="gap:5px"><i class="dot" style="background:var(--gold);width:6px;height:6px"></i>Recibo pendiente</span></div></div>`;
  // Estadísticas del mes
  const vals = Object.values(daily), spentDays = vals.length, total = sum(vals);
  const elapsed = ym === curYM() ? +t.slice(8) : D;
  const byWd = Array(7).fill(0); Object.entries(daily).forEach(([d, v]) => byWd[weekday(d)] += v);
  const maxWd = byWd.indexOf(Math.max(...byWd));
  const peak = Object.entries(daily).sort((a, b) => b[1] - a[1])[0];
  h += `<div class="kpis"><div class="kpi"><span>Media diaria</span><b class="num">${money(total / Math.max(1, elapsed))}</b></div>
    <div class="kpi"><span>Días sin gasto</span><b class="num">${Math.max(0, elapsed - Object.keys(daily).filter(d => d <= t).length)}</b><small>de ${elapsed} días</small></div>
    <div class="kpi"><span>Día más caro</span><b class="num">${peak ? money0(peak[1]) : '—'}</b><small>${peak ? fmtDate(peak[0]) : ''}</small></div>
    <div class="kpi"><span>Día de la semana</span><b style="text-transform:capitalize">${total ? WDL[maxWd] : '—'}</b><small>${total ? pct(byWd[maxWd] / total) + ' del gasto' : ''}</small></div></div>`;
  // Detalle del día
  if (ui.calDay && ymOf(ui.calDay) === ym) {
    const xs = S.tx.filter(x => x.date === ui.calDay).sort((a, b) => a.type.localeCompare(b.type));
    const pend = pendingRecurring(ym).filter(p => p.date === ui.calDay);
    h += `<div class="sec-title">${fmtDateLong(ui.calDay)}<button class="link" data-addday="${ui.calDay}">Añadir</button></div>`;
    h += `<div class="list">${xs.map(txRow).join('')}${pend.map(p => `<div class="item"><div class="avatar" style="background:var(--gold)">R</div><div class="grow"><div class="t">${esc(p.r.concept)}</div><div class="s">Recibo programado · ${esc(catById(p.r.cat).name)}</div></div><div class="a num">${signed(p.amount, p.type)}</div></div>`).join('')}
      ${!xs.length && !pend.length ? '<div class="empty">Sin movimientos este día</div>' : ''}</div>`;
  } else h += `<p class="sub" style="text-align:center">Toca un día para ver su detalle</p>`;
  return h;
}

/* ---------- Planificar ---------- */
function viewPlan() {
  let h = header('Planificar', 'Control y objetivos', gearBtn);
  const segs = [['budgets', 'Topes'], ['savings', 'Ahorro'], ['bills', 'Recibos'], ['subs', 'Suscripciones']];
  h += `<div class="seg">${segs.map(([k, l]) => `<button class="${ui.plan === k ? 'on' : ''}" data-plan="${k}">${l}</button>`).join('')}</div>`;
  if (ui.plan === 'budgets') h += planBudgets();
  if (ui.plan === 'savings') h += planSavings();
  if (ui.plan === 'bills') h += planBills();
  if (ui.plan === 'subs') h += planSubs();
  return h;
}
function planBudgets() {
  const ym = ui.month, ms = monthStats(ym);
  const cs = catsOf('gasto');
  const totB = sum(cs, c => c.budget || 0), totS = sum(cs.filter(c => c.budget), c => ms.byCat[c.id]?.total || 0);
  let h = monthBar();
  h += `<div class="card"><div class="row between"><div><div class="sub">Topes definidos</div><div class="forecast-num num">${money0(totS)} <span class="sub" style="font-size:16px">/ ${money0(totB)}</span></div></div>${ringSVG(totB ? totS / totB : 0, totS > totB ? 'var(--neg)' : 'var(--gold)')}</div>
    <p class="sub" style="margin:8px 0 0">Toca una categoría para fijar o cambiar su tope mensual. La proyección estima cómo cerrará el mes al ritmo actual.</p></div>`;
  h += `<div class="list">`;
  for (const c of cs) {
    const spent = ms.byCat[c.id]?.total || 0, b = c.budget, proj = b ? catProjection(c.id, ym) : 0, r = b ? spent / b : 0;
    const cls = r >= 1 ? 'neg' : (proj > b && ym === curYM()) || r >= .8 ? 'warn' : 'pos';
    h += `<button class="item" data-budget="${c.id}" style="display:block"><div class="row"><i class="dot" style="background:${c.color}"></i><span class="grow ell" style="font-weight:500">${esc(c.name)}</span>
      <span class="num">${money0(spent)}${b ? ` <span class="muted">/ ${money0(b)}</span>` : ''}</span></div>
      ${b ? `<div class="bar"><i class="${cls}" style="width:${clamp(r, 0, 1) * 100}%"></i></div><div class="row between sub" style="font-size:12px;margin-top:5px"><span>${r >= 1 ? 'Superado en ' + money0(spent - b) : 'Quedan ' + money0(b - spent)}</span>${ym === curYM() ? `<span class="${proj > b ? 'warn' : ''}">Proyección ${money0(proj)}</span>` : `<span>${pct(r)}</span>`}</div>` : `<div class="sub" style="font-size:12px;margin-top:4px">Sin tope · toca para definirlo</div>`}</button>`;
  }
  return h + `</div>`;
}
function planSavings() {
  const t = todayISO(), saved = savingsAt(t), free = round2(saved - sum(S.goals, g => goalSaved(g.id)));
  let h = `<section class="hero"><div class="lab">Ahorro apartado</div><div class="big num">${bigMoney(saved)}</div><div class="note">Sigue en tu cuenta pero no cuenta como liquidez disponible</div>
    <div class="split"><div><span>En objetivos</span><b class="num">${money0(saved - free)}</b></div><div><span>Libre</span><b class="num">${money0(free)}</b></div><div><span>Este mes</span><b class="num">${money0(sum(S.savings.filter(s => ymOf(s.date) === curYM()), s => s.amount))}</b></div></div></section>`;
  h += `<div class="btns" style="margin-bottom:14px"><button class="btn gold" data-act="saveIn">${IC.plus}Apartar</button><button class="btn ghost" data-act="saveOut">Retirar</button></div>`;
  h += `<div class="sec-title">Objetivos de ahorro<button class="link" data-act="goalNew">Nuevo</button></div>`;
  if (!S.goals.length) h += `<div class="card"><div class="empty"><b>Define tu primer objetivo</b>Fondo de emergencia, viaje, entrada de un piso… con importe y fecha límite. Te diré cuánto apartar cada mes.</div></div>`;
  const avgSave = Math.max(0, avgMonthly('income', 3) - avgMonthly('expense', 3));
  for (const g of S.goals) {
    const s = goalSaved(g.id), p = g.target ? s / g.target : 0, left = Math.max(0, g.target - s);
    const months = Math.max(1, monthDiff(curYM(), ymOf(g.deadline)) + 1), need = left / months;
    const overdue = g.deadline < t && left > 0;
    const status = left <= 0 ? ['pos', 'Conseguido'] : overdue ? ['neg', 'Vencido'] : avgSave && need > avgSave * .9 ? ['neg', 'En riesgo'] : avgSave && need > avgSave * .5 ? ['warn', 'Ajustado'] : ['pos', 'En camino'];
    h += `<div class="card"><div class="goal">${ringSVG(p, g.color || 'var(--gold)')}<div class="grow"><div class="row between"><b class="ell" style="font-size:16px">${esc(g.name)}</b><span class="pill ${status[0]}">${status[1]}</span></div>
      <div class="num" style="margin:3px 0">${money0(s)} <span class="muted">de ${money0(g.target)}</span></div>
      <div class="sub" style="font-size:12px">Límite ${fmtDate(g.deadline)} ${g.deadline.slice(0, 4)}${left > 0 ? ` · ${money0(need)}/mes durante ${months} mes${months > 1 ? 'es' : ''}` : ''}</div></div></div>
      <div class="row" style="margin-top:12px;gap:8px"><button class="btn sm gold" data-goalin="${g.id}">Aportar</button><button class="btn sm ghost" data-goalout="${g.id}">Retirar</button><span class="grow"></span><button class="link" data-goaledit="${g.id}">Editar</button></div></div>`;
  }
  const mv = S.savings.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  if (mv.length) h += `<div class="sec-title">Historial de ahorro</div><div class="list">${mv.map(s => `<button class="item" data-sedit="${s.id}"><div class="avatar" style="background:${s.amount >= 0 ? 'var(--gold)' : '#7A8BA6'}">${s.amount >= 0 ? '↑' : '↓'}</div><div class="grow"><div class="t ell">${esc(s.concept || (s.amount >= 0 ? 'Apartado' : 'Retirada'))}</div><div class="s">${fmtDate(s.date)} ${s.date.slice(0, 4)}${s.goal ? ' · ' + esc(S.goals.find(g => g.id === s.goal)?.name || '') : ''}</div></div><div class="a num">${s.amount >= 0 ? '+' : '−'}${money(Math.abs(s.amount))}</div></button>`).join('')}</div>`;
  return h;
}
function planBills() {
  const act = S.recurring.filter(r => r.active), exp = act.filter(r => r.type === 'gasto');
  const monthly = sum(exp, monthlyEquiv), pend = pendingRecurring(curYM());
  let h = `<div class="card"><div class="row between"><div><div class="sub">Compromiso mensual medio</div><div class="forecast-num num">${money0(monthly)}</div><div class="sub">${money0(monthly * 12)} al año · ${exp.length} recibos activos</div></div>
    <div style="text-align:right"><div class="sub">Pendiente este mes</div><b class="num" style="font-size:18px">${money0(sum(pend.filter(p => p.type === 'gasto'), p => p.amount))}</b></div></div>
    <p class="sub" style="margin:10px 0 0">Los recibos se registran solos en su fecha de cargo. Hasta entonces, su importe se descuenta de tu liquidez disponible como dinero comprometido.</p></div>`;
  h += `<button class="btn" data-act="recNew" style="margin-bottom:14px">${IC.plus}Nuevo recibo o pago domiciliado</button>`;
  if (pend.length) h += `<div class="sec-title">Próximos cargos de ${MONTHS[ymParts(curYM())[1] - 1]}</div><div class="list">${pend.map(p => `<button class="item" data-recedit="${p.r.id}"><div class="avatar" style="background:${catById(p.r.cat).color}">${pad(+p.date.slice(8))}</div><div class="grow"><div class="t ell">${esc(p.r.concept)}</div><div class="s">${fmtDateLong(p.date)}</div></div><div class="a num ${p.type === 'ingreso' ? 'pos' : ''}">${signed(p.amount, p.type)}</div></button>`).join('')}</div>`;
  h += `<div class="sec-title">Todos los recibos</div>`;
  if (!S.recurring.length) return h + `<div class="card"><div class="empty"><b>Sin recibos</b>Añade alquiler, luz, móvil, seguros, gimnasio… y también tu nómina como ingreso periódico.</div></div>`;
  h += `<div class="list">${S.recurring.slice().sort((a, b) => (b.active - a.active) || a.day - b.day).map(r => { const n = nextCharge(r); return `<button class="item" data-recedit="${r.id}" style="${r.active ? '' : 'opacity:.5'}"><div class="avatar" style="background:${catById(r.cat).color}">${esc(initials(r.concept))}</div>
    <div class="grow"><div class="t ell">${esc(r.concept)}${r.sub ? ' <span class="pill gold">Suscripción</span>' : ''}</div><div class="s ell">${FREQS[r.freq]} · día ${r.day} · ${r.active ? (n ? 'próximo ' + fmtDate(n) : 'finalizado') : 'pausado'}</div></div>
    <div class="a num ${r.type === 'ingreso' ? 'pos' : ''}">${signed(r.amount, r.type)}</div></button>`; }).join('')}</div>`;
  return h;
}
function planSubs() {
  const a = subscriptionsAnalysis();
  let h = `<div class="card"><div class="row between"><div><div class="sub">Gasto en suscripciones</div><div class="forecast-num num">${money(a.total)}<span class="sub" style="font-size:15px"> /mes</span></div><div class="sub">${money0(a.annual)} al año${isFinite(a.share) ? ` · ${pct(a.share, 1)} de tus ingresos` : ''}</div></div>
    ${ringSVG(isFinite(a.share) ? a.share / 0.1 : 0, a.share > .1 ? 'var(--neg)' : a.share > .05 ? 'var(--warn)' : 'var(--pos)')}</div>
    <p class="sub" style="margin:10px 0 0">El anillo compara con un máximo prudente del 10 % de los ingresos. Analizo tus recibos y busco cargos repetidos de importe similar en los últimos 6 meses aunque no los hayas registrado como recibo.</p></div>`;
  if (!a.items.length) return h + `<div class="card"><div class="empty"><b>No se detectan suscripciones</b>Marca un recibo como "suscripción" o usa la categoría Suscripciones.</div></div>`;
  const lv = {alto: 'neg', medio: 'warn', bajo: 'pos'};
  h += `<div class="list">${a.items.map(i => `<div class="item" ${i.id ? `data-recedit="${i.id}"` : ''} style="display:block"><div class="row"><div class="avatar" style="background:${catById(i.cat).color}">${esc(initials(i.concept))}</div>
    <div class="grow"><div class="t ell">${esc(i.concept)}</div><div class="s">${i.src === 'detectada' ? `Detectada · ${i.count} cargos` : 'Recibo registrado'} · ${FREQS[i.freq] || 'Mensual'}</div></div>
    <div style="text-align:right"><div class="a num">${money(i.monthly)}</div><span class="pill ${lv[i.level]}">Riesgo ${i.level}</span></div></div>
    ${i.why.length ? `<div class="sub" style="font-size:12px;margin:8px 0 0 48px">${esc(i.why.join(' · '))}</div>` : ''}
    ${i.src === 'detectada' ? `<div style="margin:8px 0 0 48px"><button class="link" data-subtorec="${esc(i.n)}">Registrar como recibo</button></div>` : ''}</div>`).join('')}</div>`;
  if (a.streaming >= 3) h += `<div class="tip warn"><div><b>${a.streaming} plataformas de vídeo a la vez</b><p>Rotar plataformas (una o dos cada mes) mantiene el catálogo y recorta este gasto a la mitad.</p></div></div>`;
  return h;
}
/* =========================================================
   Informes, Excel e informe PDF
   ========================================================= */
function periodMonths() {
  const end = ui.period === 'ytd' ? curYM() : curYM();
  const n = ui.period === 'ytd' ? ymParts(curYM())[1] : +ui.period;
  return rangeMonths(n, end);
}
function periodAnalysis(months) {
  const st = months.map(m => monthStats(m, false));
  const full = st.filter(s => s.ym !== curYM());
  const base = full.length ? full : st;
  const n = base.length || 1;
  const inc = sum(base, s => s.income) / n, exp = sum(base, s => s.expense) / n;
  const fixed = sum(base, s => s.fixed) / n;
  const bank = balanceAt(todayISO());
  const groups = {necesidad: 0, deseo: 0, ahorro: 0}; base.forEach(s => { for (const k in groups) groups[k] += s.groups[k] / n; });
  const cats = {};
  for (const s of st) for (const c of s.cats) { (cats[c.cat] ||= {cat: c.cat, total: 0, by: {}}); cats[c.cat].total += c.total; cats[c.cat].by[s.ym] = c.total; }
  const catRows = Object.values(cats).map(c => {
    const vals = base.map(s => c.by[s.ym] || 0), avg = sum(vals) / n;
    const lastFull = base.at(-1)?.ym, last = c.by[lastFull] || 0;
    const prevAvg = base.length > 1 ? sum(base.slice(0, -1), s => c.by[s.ym] || 0) / (base.length - 1) : avg;
    return {...c, avg, last, delta: prevAvg ? last / prevAvg - 1 : NaN};
  }).sort((a, b) => b.total - a.total);
  const best = base.slice().sort((a, b) => b.net - a.net)[0], worst = base.slice().sort((a, b) => a.net - b.net)[0];
  return {st, base, n, inc, exp, net: inc - exp, rate: inc ? (inc - exp) / inc : NaN, fixed, fixedShare: exp ? fixed / exp : 0,
    cushion: exp ? bank / exp : 0, bank, saved: savingsAt(todayISO()), groups, catRows, best, worst,
    totalInc: sum(st, s => s.income), totalExp: sum(st, s => s.expense)};
}
function viewReports() {
  let h = header('Informes', 'Análisis y exportación', gearBtn);
  const ps = [['3', '3 meses'], ['6', '6 meses'], ['12', '12 meses'], ['ytd', 'Este año']];
  h += `<div class="seg">${ps.map(([k, l]) => `<button class="${String(ui.period) === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>`;
  const months = periodMonths();
  if (!S.tx.length) return h + `<div class="card"><div class="empty"><b>Aún no hay datos</b>Los informes se construyen a partir de tus movimientos.</div></div>`;
  const A = periodAnalysis(months);
  h += `<div class="btns" style="margin-bottom:14px"><button class="btn" data-act="report">${IC.doc}Informe PDF</button><button class="btn ghost" data-act="excel">${IC.grid}Exportar Excel</button></div>`;
  h += `<div class="kpis">
    <div class="kpi"><span>Ingreso medio</span><b class="num pos">${money0(A.inc)}</b><small>al mes</small></div>
    <div class="kpi"><span>Gasto medio</span><b class="num">${money0(A.exp)}</b><small>al mes</small></div>
    <div class="kpi"><span>Ahorro medio</span><b class="num ${A.net < 0 ? 'neg' : ''}">${money0(A.net)}</b><small>tasa ${pct(A.rate)}</small></div>
    <div class="kpi"><span>Colchón</span><b class="num">${A.cushion.toFixed(1).replace('.', ',')} meses</b><small>de gasto cubiertos</small></div>
    <div class="kpi"><span>Gasto fijo</span><b class="num">${pct(A.fixedShare)}</b><small>${money0(A.fixed)}/mes en recibos</small></div>
    <div class="kpi"><span>Proyección 12 meses</span><b class="num ${A.net < 0 ? 'neg' : ''}">${money0(A.bank + A.net * 12)}</b><small>saldo si mantienes la media</small></div></div>`;
  h += `<div class="card"><h2>Evolución mensual</h2>${barsSVG(months)}</div>`;
  // 50/30/20
  if (A.inc > 0) {
    const g = A.groups, sv = Math.max(0, A.inc - A.exp);
    const rows = [['Necesidades', g.necesidad / A.inc, .5, 'var(--navy)'], ['Deseos', (g.deseo) / A.inc, .3, 'var(--gold)'], ['Ahorro', sv / A.inc, .2, 'var(--pos)']];
    h += `<div class="card"><h2>Regla 50 / 30 / 20</h2>${rows.map(([l, v, tg, c]) => `<div style="margin-bottom:10px"><div class="row between" style="font-size:14px"><span>${l}</span><span class="num"><b>${pct(v)}</b> <span class="muted">· objetivo ${pct(tg)}</span></span></div><div class="bar" style="height:8px;position:relative"><i style="width:${clamp(v, 0, 1) * 100}%;background:${c}"></i></div></div>`).join('')}
      <p class="sub" style="margin:4px 0 0">Asigna cada categoría a Necesidad o Deseo en Ajustes → Categorías para afinar este análisis.</p></div>`;
  }
  // Categorías
  h += `<div class="card"><h2>Categorías</h2><table class="tbl"><thead><tr><th>Categoría</th><th class="r">Media/mes</th><th class="r">Último</th><th class="r">Var.</th></tr></thead><tbody>
    ${A.catRows.slice(0, 12).map(c => { const k = catById(c.cat); return `<tr><td><span class="row" style="gap:7px"><i class="dot" style="background:${k.color}"></i><span class="ell">${esc(k.name)}</span></span></td><td class="r num">${money0(c.avg)}</td><td class="r num">${money0(c.last)}</td><td class="r num ${c.delta > .15 ? 'neg' : c.delta < -.15 ? 'pos' : 'muted'}">${isFinite(c.delta) ? (c.delta > 0 ? '+' : '') + pct(c.delta) : '—'}</td></tr>`; }).join('')}</tbody></table>
    <p class="sub" style="margin:8px 0 0">"Último" = último mes completo; variación frente a la media de los meses anteriores del periodo.</p></div>`;
  // Diagnóstico
  const tips = periodDiagnosis(A);
  h += `<div class="sec-title">Diagnóstico del periodo</div><div class="tips">${tips.map(t => `<div class="tip ${t.level}"><div><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div></div>`).join('')}</div>`;
  return h;
}
function periodDiagnosis(A) {
  const out = [];
  if (A.best && A.worst && A.base.length > 1) out.push({level: 'info', title: `Mejor mes: ${monthName(A.best.ym)}`, text: `Ahorraste ${money0(A.best.net)}. El peor fue ${monthName(A.worst.ym)} (${money0(A.worst.net)}). La diferencia, ${money0(A.best.net - A.worst.net)}, es tu margen de mejora realista.`});
  if (A.rate < 0.1) out.push({level: A.rate < 0 ? 'alert' : 'warn', title: `Tasa de ahorro media: ${pct(A.rate)}`, text: `Con ${money0(A.inc)} de ingresos, llegar al 20 % supondría ahorrar ${money0(A.inc * 0.2)}/mes, ${money0(A.inc * 0.2 - Math.max(0, A.net))} más que ahora.`});
  else out.push({level: 'good', title: `Tasa de ahorro media: ${pct(A.rate)}`, text: `Mantenida, en 5 años acumularías ${money0(A.net * 60)} sin contar rentabilidad. Invertido al 4 % anual serían unos ${money0(fv(A.net, 0.04, 5))}.`});
  if (A.cushion < 3) out.push({level: 'warn', title: 'Fondo de emergencia insuficiente', text: `Cubres ${A.cushion.toFixed(1).replace('.', ',')} meses de gasto. Prioriza llegar a ${money0(A.exp * 3)} (3 meses) antes de invertir o asumir gastos grandes.`});
  const up = A.catRows.filter(c => c.delta > .25 && c.last > 50).slice(0, 2);
  for (const c of up) out.push({level: 'warn', title: `${catById(c.cat).name} al alza`, text: `El último mes subió un ${pct(c.delta)} sobre tu media (${money0(c.avg)}/mes). Si se consolida, son ${money0((c.last - c.avg) * 12)} más al año.`});
  if (A.fixedShare > .55) out.push({level: 'warn', title: 'Estructura de gasto rígida', text: `El ${pct(A.fixedShare)} de tu gasto son recibos fijos. Revisa tarifas de energía, telefonía y seguros: un 10 % menos son ${money0(A.fixed * 0.1 * 12)} al año.`});
  const top = A.catRows[0];
  if (top) out.push({level: 'info', title: `Tu mayor partida: ${catById(top.cat).name}`, text: `${money0(top.avg)}/mes de media (${pct(top.avg / (A.exp || 1))} del gasto). Un recorte del 10 % equivale a ${money0(top.avg * 1.2)} al año.`});
  return out;
}
const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const fv = (pmt, r, years) => { const i = r / 12, n = years * 12; return pmt * ((Math.pow(1 + i, n) - 1) / i); };

/* ---------- Guardar archivos en iOS ---------- */
let _pendingFile = null;
function offerFile(blob, name, title) {
  _pendingFile = {blob, name};
  openSheet(`<div class="sheet-h"><h3>${esc(title)}</h3><button data-close>Cerrar</button></div>
    <div class="card" style="text-align:center"><div style="font-weight:600;margin-bottom:4px">${esc(name)}</div><div class="sub">${(blob.size / 1024).toFixed(0)} KB</div></div>
    <button class="btn gold" data-act="shareFile" style="margin-bottom:10px">${IC.dl}Guardar en Archivos / Compartir</button>
    <button class="btn ghost" data-act="downloadFile">Descargar</button>
    <p class="sub" style="text-align:center;margin-top:12px">En el menú de compartir elige <b>Guardar en Archivos</b> para conservarlo en iCloud Drive o en el iPhone.</p>`);
}
async function shareFile() {
  if (!_pendingFile) return;
  const {blob, name} = _pendingFile;
  const file = new File([blob], name, {type: blob.type});
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file], title: name}); markExported(name); closeSheet(); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  downloadFile();
}
function downloadFile() {
  if (!_pendingFile) return;
  const {blob, name} = _pendingFile, url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); markExported(name); closeSheet();
}
function markExported(name) { if (name.endsWith('.json')) { S.settings.lastBackup = new Date().toISOString(); save(); render(); toast('Copia de seguridad guardada'); } }

/* ---------- Backup ---------- */
function exportBackup() {
  const data = JSON.stringify({app: 'Caudal', exported: new Date().toISOString(), data: S}, null, 1);
  offerFile(new Blob([data], {type: 'application/json'}), `Caudal-backup-${todayISO()}.json`, 'Copia de seguridad');
}
function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result), d = j.data || j;
      if (!Array.isArray(d.tx) || !d.settings) throw new Error('formato');
      const n = d.tx.length;
      if (!confirm(`¿Restaurar la copia${j.exported ? ' del ' + fmtDate(j.exported.slice(0, 10)) + ' ' + j.exported.slice(0, 4) : ''} con ${n} movimientos? Se reemplazarán los datos actuales.`)) return;
      try { localStorage.setItem(KEY + '.before-restore', JSON.stringify(S)); } catch (e) {}
      S = migrate(d); S.settings.onboarded = true; save(); closeSheet(); render(); toast(`Restaurados ${n} movimientos`);
    } catch (e) { toast('El archivo no es una copia válida de Caudal'); }
  };
  rd.readAsText(file);
}

/* ---------- Excel ---------- */
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/exceljs.min.js'; s.onload = res; s.onerror = () => { const s2 = document.createElement('script'); s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'; s2.onload = res; s2.onerror = rej; document.head.appendChild(s2); }; document.head.appendChild(s); });
}
async function exportExcel() {
  toast('Preparando Excel…');
  try { await loadExcelJS(); } catch (e) { toast('No se pudo cargar el motor de Excel'); return; }
  const wb = new ExcelJS.Workbook(); wb.creator = 'Caudal'; wb.created = new Date();
  const NAVY = 'FF13294B', GOLD = 'FFB08D57', IVORY = 'FFF6F3EC', EUR = '#,##0.00 €;[Red]-#,##0.00 €', PCT = '0.0%';
  const style = (ws, widths) => {
    ws.columns.forEach((c, i) => c.width = widths[i] || 14);
    const r = ws.getRow(1); r.height = 22;
    r.eachCell(c => { c.font = {bold: true, color: {argb: 'FFFFFFFF'}, name: 'Calibri', size: 11}; c.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: NAVY}}; c.alignment = {vertical: 'middle'}; c.border = {bottom: {style: 'medium', color: {argb: GOLD}}}; });
    ws.views = [{state: 'frozen', ySplit: 1}];
    ws.eachRow((row, i) => { if (i > 1 && i % 2 === 0) row.eachCell({includeEmpty: true}, c => c.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: IVORY}}); });
  };
  const months = rangeMonths(Math.max(1, monthDiff(firstDataYM(), curYM()) + 1));
  // Resumen
  const r = wb.addWorksheet('Resumen', {properties: {tabColor: {argb: NAVY}}});
  r.addRow(['Mes', 'Ingresos', 'Gastos', 'Balance', 'Tasa de ahorro', 'Gasto fijo', 'Gasto variable', 'Apartado a ahorro', 'Saldo a cierre']);
  months.forEach((m, i) => { const s = monthStats(m, false), row = i + 2; r.addRow([monthName(m), s.income, s.expense, {formula: `B${row}-C${row}`}, {formula: `IF(B${row}=0,"",D${row}/B${row})`}, s.fixed, s.variable, s.saveMoves, balanceAt(monthEnd(m) > todayISO() ? todayISO() : monthEnd(m))]); });
  const tr = months.length + 2;
  r.addRow(['TOTAL', {formula: `SUM(B2:B${tr - 1})`}, {formula: `SUM(C2:C${tr - 1})`}, {formula: `B${tr}-C${tr}`}, {formula: `IF(B${tr}=0,"",D${tr}/B${tr})`}, {formula: `SUM(F2:F${tr - 1})`}, {formula: `SUM(G2:G${tr - 1})`}, {formula: `SUM(H2:H${tr - 1})`}, '']);
  r.addRow(['MEDIA', {formula: `AVERAGE(B2:B${tr - 1})`}, {formula: `AVERAGE(C2:C${tr - 1})`}, {formula: `B${tr + 1}-C${tr + 1}`}, {formula: `IF(B${tr + 1}=0,"",D${tr + 1}/B${tr + 1})`}, {formula: `AVERAGE(F2:F${tr - 1})`}, {formula: `AVERAGE(G2:G${tr - 1})`}, {formula: `AVERAGE(H2:H${tr - 1})`}, '']);
  style(r, [18, 14, 14, 14, 14, 14, 15, 17, 15]);
  ['B', 'C', 'D', 'F', 'G', 'H', 'I'].forEach(c => r.getColumn(c).numFmt = EUR); r.getColumn('E').numFmt = PCT;
  [tr, tr + 1].forEach(i => r.getRow(i).eachCell(c => { c.font = {bold: true}; c.border = {top: {style: 'thin', color: {argb: GOLD}}}; }));
  // Movimientos
  const mv = wb.addWorksheet('Movimientos');
  mv.addRow(['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Importe', 'Importe con signo', 'Recibo', 'Nota']);
  S.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(x => mv.addRow([new Date(x.date + 'T12:00'), x.type === 'gasto' ? 'Gasto' : 'Ingreso', catById(x.cat).name, x.concept, x.amount, x.type === 'gasto' ? -x.amount : x.amount, x.rec ? 'Sí' : '', x.note || '']));
  style(mv, [12, 10, 18, 32, 13, 16, 9, 26]); mv.getColumn(1).numFmt = 'dd/mm/yyyy'; mv.getColumn(5).numFmt = EUR; mv.getColumn(6).numFmt = EUR;
  mv.autoFilter = {from: 'A1', to: `H${S.tx.length + 1}`};
  // Categorías × meses
  const cm = wb.addWorksheet('Gasto por categoría');
  cm.addRow(['Categoría', ...months.map(monthShort), 'Total', 'Media', 'Tope mensual']);
  const cats = catsOf('gasto');
  cats.forEach((c, i) => { const row = i + 2, last = colL(months.length + 1); cm.addRow([c.name, ...months.map(m => monthStats(m, false).byCat[c.id]?.total || 0), {formula: `SUM(B${row}:${last}${row})`}, {formula: `AVERAGE(B${row}:${last}${row})`}, c.budget || '']); });
  style(cm, [20, ...months.map(() => 11), 13, 12, 13]);
  for (let i = 2; i <= months.length + 4; i++) cm.getColumn(i).numFmt = EUR;
  // Recibos
  const rc = wb.addWorksheet('Recibos');
  rc.addRow(['Concepto', 'Tipo', 'Categoría', 'Importe', 'Frecuencia', 'Día de cargo', 'Equivalente mensual', 'Coste anual', 'Activo', 'Suscripción', 'Próximo cargo']);
  S.recurring.forEach((x, i) => { const row = i + 2; const n = nextCharge(x); rc.addRow([x.concept, x.type === 'gasto' ? 'Gasto' : 'Ingreso', catById(x.cat).name, x.amount, FREQS[x.freq], x.day, {formula: `D${row}/${x.freq}`}, {formula: `G${row}*12`}, x.active ? 'Sí' : 'No', x.sub ? 'Sí' : '', n ? new Date(n + 'T12:00') : '']); });
  style(rc, [28, 10, 16, 12, 12, 11, 17, 13, 8, 11, 14]); ['D', 'G', 'H'].forEach(c => rc.getColumn(c).numFmt = EUR); rc.getColumn('K').numFmt = 'dd/mm/yyyy';
  // Ahorro y objetivos
  const sv = wb.addWorksheet('Ahorro');
  sv.addRow(['Fecha', 'Concepto', 'Objetivo', 'Importe']);
  S.savings.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(s => sv.addRow([new Date(s.date + 'T12:00'), s.concept || (s.amount >= 0 ? 'Apartado' : 'Retirada'), S.goals.find(g => g.id === s.goal)?.name || '', s.amount]));
  sv.addRow(['', 'TOTAL APARTADO', '', {formula: `SUM(D2:D${S.savings.length + 1})`}]);
  style(sv, [12, 30, 22, 14]); sv.getColumn(1).numFmt = 'dd/mm/yyyy'; sv.getColumn(4).numFmt = EUR;
  const gl = wb.addWorksheet('Objetivos');
  gl.addRow(['Objetivo', 'Importe objetivo', 'Ahorrado', 'Progreso', 'Pendiente', 'Fecha límite', 'Meses restantes', 'Aportación mensual necesaria']);
  S.goals.forEach((g, i) => { const row = i + 2; gl.addRow([g.name, g.target, goalSaved(g.id), {formula: `IF(B${row}=0,0,C${row}/B${row})`}, {formula: `MAX(0,B${row}-C${row})`}, new Date(g.deadline + 'T12:00'), Math.max(1, monthDiff(curYM(), ymOf(g.deadline)) + 1), {formula: `E${row}/G${row}`}]); });
  style(gl, [26, 16, 13, 11, 13, 13, 15, 26]); ['B', 'C', 'E', 'H'].forEach(c => gl.getColumn(c).numFmt = EUR); gl.getColumn('D').numFmt = PCT; gl.getColumn('F').numFmt = 'dd/mm/yyyy';
  // Consejos
  const ad = wb.addWorksheet('Consejos');
  ad.addRow(['Nivel', 'Consejo', 'Detalle']);
  const lv = {alert: 'Alerta', warn: 'Aviso', good: 'Positivo', info: 'Info', gold: 'Recordatorio'};
  [...insights(curYM()), ...periodDiagnosis(periodAnalysis(rangeMonths(6)))].forEach(t => ad.addRow([lv[t.level], t.title, t.text]));
  style(ad, [13, 40, 100]); ad.getColumn(3).alignment = {wrapText: true, vertical: 'top'};
  const buf = await wb.xlsx.writeBuffer();
  offerFile(new Blob([buf], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `Caudal-${todayISO()}.xlsx`, 'Excel listo');
}

/* ---------- Informe financiero (PDF vía impresión) ---------- */
function reportHTML() {
  const months = periodMonths(), A = periodAnalysis(months), ym = curYM(), snap = snapshot(ym), f = forecast(ym);
  const sa = subscriptionsAnalysis(), tips = [...insights(ym), ...periodDiagnosis(A)].slice(0, 9);
  const label = ui.period === 'ytd' ? `Año ${ym.slice(0, 4)}` : `Últimos ${ui.period} meses`;
  const parts = A.catRows.slice(0, 7).map(c => ({id: c.cat, value: c.total, color: catById(c.cat).color}));
  const css = `<style>
  .rp{font-family:var(--sans);color:#0F1B2D;background:#fff;max-width:760px;margin:0 auto;padding:28px 26px 40px;border-radius:14px}
  .rp h1{font-family:var(--serif);font-size:30px;margin:0;font-weight:600;letter-spacing:-.3px}
  .rp h2{font-family:var(--serif);font-size:19px;margin:26px 0 10px;font-weight:600;border-bottom:1px solid #E7E1D3;padding-bottom:6px}
  .rp .k{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#A8854E;font-weight:700}
  .rp .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #13294B;padding-bottom:14px}
  .rp .g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .rp .b{background:#F6F3EC;border-radius:10px;padding:11px 12px}.rp .b span{display:block;font-size:11px;color:#6B7486}.rp .b b{font-size:17px}
  .rp p,.rp li{font-size:13px;line-height:1.5;color:#3A4558}
  .rp table{width:100%;border-collapse:collapse;font-size:12.5px}.rp th{text-align:left;color:#6B7486;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #E7E1D3;padding:6px 4px}.rp td{padding:7px 4px;border-bottom:1px solid #F0ECE2}.rp .r{text-align:right}
  .rp .t{border-left:3px solid #3D5F8F;padding:6px 10px;margin:8px 0;background:#FAF8F3}.rp .t.alert{border-color:#A3423C}.rp .t.warn{border-color:#B07A26}.rp .t.good{border-color:#2F7A5B}.rp .t.gold{border-color:#A8854E}
  .rp .t b{font-size:13px}.rp .t p{margin:2px 0 0}
  .rp svg text{fill:#6B7486}.rp{--ink:#0F1B2D;--ink3:#6B7486;--line:#ECE7DC;--card2:#F1EDE4;--navy:#13294B;--gold:#A8854E;--pos:#2F7A5B;--neg:#A3423C;--card:#fff}
  .rp .tw{overflow-x:auto;flex:1 1 300px;min-width:0;-webkit-overflow-scrolling:touch}.rp .tw table{min-width:340px}.rp .tw td,.rp .tw th{white-space:nowrap}
  @media (max-width:520px){.rp{padding:20px 16px 30px}.rp .g{grid-template-columns:1fr 1fr}.rp h1{font-size:26px}}
  .rp .foot{margin-top:28px;font-size:11px;color:#8E96A4;text-align:center}
  @media print{.rp{padding:0;border-radius:0}.rp h2{break-after:avoid}.rp .t,.rp tr{break-inside:avoid}}
  </style>`;
  return css + (`<div class="rp">
  <div class="head"><div><div class="k">Informe financiero personal</div><h1>${esc(S.settings.name || 'Mis finanzas')}</h1><div style="font-size:13px;color:#6B7486;margin-top:4px">${label} · ${monthName(months[0])} – ${monthName(months.at(-1))}</div></div>
  <div style="text-align:right;font-size:12px;color:#6B7486">Generado el<br><b style="color:#0F1B2D">${fmtDateLong(todayISO())}</b></div></div>
  <h2>Resumen ejecutivo</h2>
  <div class="g"><div class="b"><span>Saldo en cuenta</span><b>${money0(snap.bank)}</b></div><div class="b"><span>Liquidez disponible</span><b>${money0(snap.liquid)}</b></div><div class="b"><span>Ahorro apartado</span><b>${money0(snap.saved)}</b></div>
  <div class="b"><span>Ingreso medio/mes</span><b>${money0(A.inc)}</b></div><div class="b"><span>Gasto medio/mes</span><b>${money0(A.exp)}</b></div><div class="b"><span>Tasa de ahorro</span><b>${pct(A.rate)}</b></div>
  <div class="b"><span>Colchón</span><b>${A.cushion.toFixed(1).replace('.', ',')} meses</b></div><div class="b"><span>Gasto fijo</span><b>${pct(A.fixedShare)}</b></div><div class="b"><span>Previsión cierre mes</span><b>${money0(f.end)}</b></div></div>
  <p>En el periodo has ingresado <b>${money(A.totalInc)}</b> y gastado <b>${money(A.totalExp)}</b>, un resultado de <b>${money(A.totalInc - A.totalExp)}</b>. ${A.net >= 0 ? `Si mantienes la media, en 12 meses tu saldo rondaría ${money0(A.bank + A.net * 12)}.` : `Al ritmo medio, tus reservas bajarían ${money0(-A.net * 12)} en un año.`}</p>
  <h2>Evolución de ingresos y gastos</h2>${barsSVG(months)}
  <h2>Distribución del gasto</h2><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:center">${donutSVG(parts, sum(A.catRows, c => c.total), 'Total')}
  <table><thead><tr><th>Categoría</th><th class="r">Total</th><th class="r">Media/mes</th><th class="r">Peso</th></tr></thead><tbody>${A.catRows.slice(0, 10).map(c => `<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${catById(c.cat).color};margin-right:6px"></span>${esc(catById(c.cat).name)}</td><td class="r">${money0(c.total)}</td><td class="r">${money0(c.avg)}</td><td class="r">${pct(c.total / (A.totalExp || 1))}</td></tr>`).join('')}</tbody></table></div>
  <h2>Topes de gasto · ${monthName(ym)}</h2>${(() => { const cs = catsOf('gasto').filter(c => c.budget); if (!cs.length) return '<p>No hay topes definidos.</p>'; const ms = monthStats(ym); return `<table><thead><tr><th>Categoría</th><th class="r">Tope</th><th class="r">Gastado</th><th class="r">Proyección</th><th class="r">Estado</th></tr></thead><tbody>${cs.map(c => { const s = ms.byCat[c.id]?.total || 0, p = catProjection(c.id, ym); return `<tr><td>${esc(c.name)}</td><td class="r">${money0(c.budget)}</td><td class="r">${money0(s)}</td><td class="r">${money0(p)}</td><td class="r" style="color:${s > c.budget ? '#A3423C' : p > c.budget ? '#B07A26' : '#2F7A5B'}">${s > c.budget ? 'Superado' : p > c.budget ? 'En riesgo' : 'Correcto'}</td></tr>`; }).join('')}</tbody></table>`; })()}
  <h2>Ahorro y objetivos</h2>${S.goals.length ? `<table><thead><tr><th>Objetivo</th><th class="r">Objetivo</th><th class="r">Ahorrado</th><th class="r">Progreso</th><th class="r">Necesario/mes</th><th class="r">Límite</th></tr></thead><tbody>${S.goals.map(g => { const s = goalSaved(g.id), left = Math.max(0, g.target - s), mo = Math.max(1, monthDiff(curYM(), ymOf(g.deadline)) + 1); return `<tr><td>${esc(g.name)}</td><td class="r">${money0(g.target)}</td><td class="r">${money0(s)}</td><td class="r">${pct(s / (g.target || 1))}</td><td class="r">${money0(left / mo)}</td><td class="r">${fmtDate(g.deadline)} ${g.deadline.slice(0, 4)}</td></tr>`; }).join('')}</tbody></table>` : '<p>Sin objetivos definidos.</p>'}
  <h2>Recibos y suscripciones</h2><p>Compromiso fijo: <b>${money0(sum(S.recurring.filter(r => r.active && r.type === 'gasto'), monthlyEquiv))}/mes</b>. Suscripciones: <b>${money(sa.total)}/mes</b> (${money0(sa.annual)} al año${isFinite(sa.share) ? ', ' + pct(sa.share, 1) + ' de tus ingresos' : ''}).</p>
  ${sa.items.length ? `<table><thead><tr><th>Suscripción</th><th class="r">Mensual</th><th class="r">Anual</th><th class="r">Riesgo</th></tr></thead><tbody>${sa.items.map(i => `<tr><td>${esc(i.concept)}${i.src === 'detectada' ? ' <i style="color:#8E96A4">(detectada)</i>' : ''}</td><td class="r">${money(i.monthly)}</td><td class="r">${money0(i.annual)}</td><td class="r">${i.level}</td></tr>`).join('')}</tbody></table>` : ''}
  <h2>Diagnóstico y recomendaciones</h2>${tips.map(t => `<div class="t ${t.level}"><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div>`).join('')}
  <div class="foot">Caudal · informe generado en el dispositivo con tus propios datos. Estimaciones orientativas, no constituyen asesoramiento financiero.</div></div>`).replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, '</table></div>');
}
function openReport() {
  const html = reportHTML();
  const v = document.createElement('div'); v.className = 'report-view'; v.id = 'reportView';
  v.innerHTML = `<div class="row between" style="margin-bottom:12px"><button class="link" data-act="closeReport">‹ Volver</button><div class="row" style="gap:8px"><button class="btn sm ghost" data-act="reportFile">Guardar</button><button class="btn sm" data-act="print">Imprimir / PDF</button></div></div>${html}`;
  document.body.appendChild(v);
}
function printReport() { $('#print').innerHTML = reportHTML(); setTimeout(() => window.print(), 60); }
function reportFile() {
  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe Caudal</title><style>:root{--serif:ui-serif,"New York",Georgia,serif;--sans:-apple-system,system-ui,sans-serif}body{margin:0;background:#F3F2EE;padding:16px}.donut{width:150px;height:150px;position:relative;flex:none}.donut svg{transform:rotate(-90deg)}.donut .center{position:absolute;inset:0;display:grid;place-content:center;text-align:center}.donut .center span{font-size:10px;color:#6B7486;text-transform:uppercase}.donut .center b{font-family:var(--serif);font-size:18px}.chart{width:100%;height:auto}.chart text{font-size:10px;font-family:var(--sans)}.row{display:flex;align-items:center}.dot{width:10px;height:10px;border-radius:50%;display:inline-block}</style></head><body>${reportHTML()}</body></html>`;
  offerFile(new Blob([doc], {type: 'text/html'}), `Informe-Caudal-${todayISO()}.html`, 'Informe listo');
}
/* =========================================================
   Formularios, eventos y arranque
   ========================================================= */
function render() {
  const v = $('#view'), y = v.scrollTop;
  const fn = {home: viewHome, moves: viewMoves, calendar: viewCalendar, plan: viewPlan, reports: viewReports}[ui.tab];
  v.innerHTML = fn();
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  v.scrollTop = y;
  applyTheme();
}
function go(tab) { ui.tab = tab; render(); $('#view').scrollTop = 0; }
function toast(msg, action, fn) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`; t.hidden = false;
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, action ? 8000 : 2600);
}
function openSheet(html) { $('#sheet').innerHTML = '<div class="grab"></div>' + html; $('#sheetWrap').hidden = false; $('#sheet').scrollTop = 0; }
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }
function applyTheme() { const t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }

/* ---------- Movimiento: alta / edición ---------- */
let form = null;
function txForm(x, preset = {}) {
  const edit = !!x;
  form = x ? {...x} : {id: null, type: preset.type || 'gasto', cat: null, amount: '', concept: '', date: preset.date || (ui.month === curYM() ? todayISO() : monthEnd(ui.month)), note: '', repeat: false};
  if (!form.cat) form.cat = catsOf(form.type)[0]?.id;
  const concepts = [...new Set(S.tx.slice(-400).map(t => t.concept).filter(Boolean))].slice(-150);
  openSheet(`<div class="sheet-h"><button data-close style="color:var(--ink2);font-weight:500">Cancelar</button><h3>${edit ? 'Editar' : 'Nuevo'} movimiento</h3><button data-act="txSave">Guardar</button></div>
    <div class="seg" id="ttype"><button data-ttype="gasto" class="${form.type === 'gasto' ? 'on' : ''}">Gasto</button><button data-ttype="ingreso" class="${form.type === 'ingreso' ? 'on' : ''}">Ingreso</button></div>
    <div class="amount-in"><input id="fAmount" inputmode="decimal" placeholder="0,00 €" value="${form.amount ? String(form.amount).replace('.', ',') : ''}" autocomplete="off"></div>
    <div class="form"><div class="field"><label>Concepto</label><input id="fConcept" list="concepts" placeholder="p. ej. Mercadona" value="${esc(form.concept)}" autocomplete="off"></div>
      <div class="field"><label>Fecha</label><input id="fDate" type="date" value="${form.date}"></div>
      <div class="field"><label>Nota</label><input id="fNote" placeholder="Opcional" value="${esc(form.note || '')}"></div>
      ${!edit ? `<div class="field"><label style="width:auto;flex:1">Repetir cada mes (recibo)</label><label class="switch" style="width:51px"><input type="checkbox" id="fRepeat"><i></i></label></div>` : ''}</div>
    <datalist id="concepts">${concepts.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="sub" style="margin:0 4px 8px">Categoría</div><div class="catgrid" id="fCats">${catGrid()}</div>
    ${x?.rec ? `<p class="sub" style="text-align:center">Generado automáticamente por el recibo "${esc(S.recurring.find(r => r.id === x.rec)?.concept || '')}". Si lo borras no se volverá a crear este mes.</p>` : ''}
    ${edit ? `<button class="btn danger" data-act="txDel">Eliminar movimiento</button>` : ''}`);
  if (!edit) setTimeout(() => $('#fAmount')?.focus(), 250);
  $('#fConcept').addEventListener('change', e => { const v = normConcept(e.target.value); const prev = S.tx.slice().reverse().find(t => normConcept(t.concept) === v && t.type === form.type); if (prev) { form.cat = prev.cat; $('#fCats').innerHTML = catGrid(); } });
}
function catGrid() { return catsOf(form.type).map(c => `<button data-fcat="${c.id}" class="${form.cat === c.id ? 'on' : ''}"><i class="dot" style="background:${c.color}"></i><span>${esc(c.name)}</span></button>`).join(''); }
function txSave() {
  const amount = parseAmount($('#fAmount').value);
  if (!(amount > 0)) { toast('Introduce un importe'); $('#fAmount').focus(); return; }
  const date = $('#fDate').value || todayISO();
  const data = {type: form.type, cat: form.cat, amount, concept: $('#fConcept').value.trim(), date, note: $('#fNote').value.trim()};
  if (form.id) Object.assign(S.tx.find(t => t.id === form.id), data);
  else if ($('#fRepeat')?.checked) {
    const r = {id: uid(), type: data.type, concept: data.concept || catById(data.cat).name, cat: data.cat, amount, day: +date.slice(8), freq: 1, start: ymOf(date), end: null, active: true, sub: /suscrip/i.test(catById(data.cat).name), skips: []};
    S.recurring.push(r); postDueRecurring();
  } else S.tx.push({id: uid(), ...data});
  save(); closeSheet(); render();
  if (!form.id) checkBudgetAfter(data);
}
function checkBudgetAfter(d) {
  if (d.type !== 'gasto') return toast('Ingreso guardado');
  const c = catById(d.cat); if (!c.budget) return toast('Gasto guardado');
  const s = monthStats(ymOf(d.date)).byCat[c.id]?.total || 0;
  toast(s > c.budget ? `Has superado el tope de ${c.name} (${money0(s)} / ${money0(c.budget)})` : `${c.name}: ${pct(s / c.budget)} del tope usado`);
}
function txDel() {
  const x = S.tx.find(t => t.id === form.id); if (!x) return;
  if (!confirm('¿Eliminar este movimiento?')) return;
  if (x.rec) { const r = S.recurring.find(r => r.id === x.rec); if (r && !r.skips.includes(ymOf(x.date))) r.skips.push(ymOf(x.date)); }
  S.tx = S.tx.filter(t => t.id !== x.id); save(); closeSheet(); render();
  toast('Movimiento eliminado', 'Deshacer', () => { S.tx.push(x); if (x.rec) { const r = S.recurring.find(r => r.id === x.rec); if (r) r.skips = r.skips.filter(s => s !== ymOf(x.date)); } save(); render(); });
}

/* ---------- Tope ---------- */
function budgetForm(id) {
  const c = catById(id), avg = avgMonthly('expense', 1) ? sum(historyMonths(curYM(), 3), m => monthStats(m).byCat[id]?.total || 0) / Math.max(1, historyMonths(curYM(), 3).length) : 0;
  openSheet(`<div class="sheet-h"><button data-close style="color:var(--ink2);font-weight:500">Cancelar</button><h3>Tope · ${esc(c.name)}</h3><button data-act="budgetSave" data-id="${id}">Guardar</button></div>
    <div class="amount-in"><input id="bAmount" inputmode="decimal" placeholder="Sin tope" value="${c.budget ? String(c.budget).replace('.', ',') : ''}"></div>
    ${avg ? `<p class="sub" style="text-align:center;margin-top:-6px">Tu media de los últimos meses: <b>${money0(avg)}</b>. Un tope un 10 % inferior sería ${money0(avg * .9)}.</p><div class="btns" style="margin-bottom:14px"><button class="btn ghost sm" style="width:100%" data-bset="${Math.round(avg * .9)}">${money0(avg * .9)}</button><button class="btn ghost sm" style="width:100%" data-bset="${Math.round(avg)}">${money0(avg)}</button></div>` : ''}
    <button class="btn danger" data-act="budgetClear" data-id="${id}">Quitar tope</button>`);
}

/* ---------- Ahorro ---------- */
function savingForm(dir, goal = null, edit = null) {
  const s = edit || {amount: '', date: todayISO(), concept: '', goal};
  const snap = snapshot(curYM());
  openSheet(`<div class="sheet-h"><button data-close style="color:var(--ink2);font-weight:500">Cancelar</button><h3>${edit ? 'Editar ahorro' : dir > 0 ? 'Apartar ahorro' : 'Retirar ahorro'}</h3><button data-act="saveMove" data-dir="${dir}" data-id="${edit?.id || ''}">Guardar</button></div>
    <div class="amount-in"><input id="sAmount" inputmode="decimal" placeholder="0,00 €" value="${s.amount ? String(Math.abs(s.amount)).replace('.', ',') : ''}"></div>
    <p class="sub" style="text-align:center;margin-top:-6px">${dir > 0 ? `Liquidez disponible ahora: <b>${money(snap.liquid)}</b>` : `Ahorro apartado: <b>${money(snap.saved)}</b>`}</p>
    <div class="form"><div class="field"><label>Concepto</label><input id="sConcept" value="${esc(s.concept || '')}" placeholder="Opcional"></div>
    <div class="field"><label>Fecha</label><input id="sDate" type="date" value="${s.date}"></div>
    <div class="field"><label>Objetivo</label><select id="sGoal"><option value="">Ahorro libre</option>${S.goals.map(g => `<option value="${g.id}" ${s.goal === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div></div>
    ${edit ? '<button class="btn danger" data-act="saveDel" data-id="' + edit.id + '">Eliminar</button>' : ''}`);
  setTimeout(() => $('#sAmount')?.focus(), 250);
}
function goalForm(g) {
  const x = g || {name: '', target: '', deadline: addMonths(curYM(), 12) + '-01', color: PALETTE[S.goals.length % PALETTE.length]};
  openSheet(`<div class="sheet-h"><button data-close style="color:var(--ink2);font-weight:500">Cancelar</button><h3>${g ? 'Editar' : 'Nuevo'} objetivo</h3><button data-act="goalSave" data-id="${g?.id || ''}">Guardar</button></div>
    <div class="form"><div class="field"><label>Nombre</label><input id="gName" value="${esc(x.name)}" placeholder="Fondo de emergencia"></div>
    <div class="field"><label>Importe</label><input id="gTarget" inputmode="decimal" value="${x.target ? String(x.target).replace('.', ',') : ''}" placeholder="0 €"></div>
    <div class="field"><label>Fecha límite</label><input id="gDate" type="date" value="${x.deadline}"></div></div>
    <div class="form"><div class="colors" id="gColors">${PALETTE.slice(0, 10).map(c => `<button data-gcolor="${c}" class="${x.color === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
    ${g ? '<button class="btn danger" data-act="goalDel" data-id="' + g.id + '">Eliminar objetivo</button><p class="sub" style="text-align:center">Lo ahorrado pasará a ahorro libre.</p>' : ''}`);
}

/* ---------- Recibos ---------- */
function recForm(r, preset = {}) {
  const x = r ? {...r} : {type: 'gasto', concept: preset.concept || '', cat: preset.cat || catsOf('gasto')[0].id, amount: preset.amount || '', day: preset.day || +todayISO().slice(8), freq: 1, start: curYM(), end: '', active: true, sub: !!preset.sub};
  form = {type: x.type, cat: x.cat, recId: r?.id};
  openSheet(`<div class="sheet-h"><button data-close style="color:var(--ink2);font-weight:500">Cancelar</button><h3>${r ? 'Editar' : 'Nuevo'} recibo</h3><button data-act="recSave">Guardar</button></div>
    <div class="seg"><button data-ttype="gasto" class="${x.type === 'gasto' ? 'on' : ''}">Cargo</button><button data-ttype="ingreso" class="${x.type === 'ingreso' ? 'on' : ''}">Ingreso periódico</button></div>
    <div class="amount-in"><input id="rAmount" inputmode="decimal" placeholder="0,00 €" value="${x.amount ? String(x.amount).replace('.', ',') : ''}"></div>
    <div class="form"><div class="field"><label>Concepto</label><input id="rConcept" value="${esc(x.concept)}" placeholder="Alquiler, luz, Netflix…"></div>
    <div class="field"><label>Día de cargo</label><input id="rDay" type="number" min="1" max="31" inputmode="numeric" value="${x.day}"></div>
    <div class="field"><label>Frecuencia</label><select id="rFreq">${Object.entries(FREQS).map(([k, v]) => `<option value="${k}" ${+x.freq === +k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>Desde</label><input id="rStart" type="month" value="${x.start}"></div>
    <div class="field"><label>Hasta</label><input id="rEnd" type="month" value="${x.end || ''}" placeholder="Sin fin"></div>
    <div class="field"><label style="width:auto;flex:1">Es una suscripción</label><label class="switch"><input type="checkbox" id="rSub" ${x.sub ? 'checked' : ''}><i></i></label></div>
    <div class="field"><label style="width:auto;flex:1">Activo</label><label class="switch"><input type="checkbox" id="rActive" ${x.active ? 'checked' : ''}><i></i></label></div></div>
    <div class="sub" style="margin:0 4px 8px">Categoría</div><div class="catgrid" id="fCats">${catGrid()}</div>
    <p class="sub" style="text-align:center">Se registrará solo cada ${FREQS[x.freq].toLowerCase()} en su fecha. Los cargos ya pasados desde "Desde" se crearán al guardar.</p>
    ${r ? '<button class="btn danger" data-act="recDel">Eliminar recibo</button>' : ''}`);
}
function recSave() {
  const amount = parseAmount($('#rAmount').value), concept = $('#rConcept').value.trim();
  if (!(amount > 0) || !concept) { toast('Indica concepto e importe'); return; }
  const data = {type: form.type, concept, cat: form.cat, amount, day: clamp(+$('#rDay').value || 1, 1, 31), freq: +$('#rFreq').value, start: $('#rStart').value || curYM(), end: $('#rEnd').value || null, sub: $('#rSub').checked, active: $('#rActive').checked};
  if (form.recId) {
    const r = S.recurring.find(r => r.id === form.recId); Object.assign(r, data);
    // actualiza los cargos futuros ya creados no existen; los pasados se mantienen como histórico
  } else S.recurring.push({id: uid(), skips: [], ...data});
  const n = postDueRecurring(); save(); closeSheet(); render();
  toast(n ? `Recibo guardado · ${n} cargo${n > 1 ? 's' : ''} registrado${n > 1 ? 's' : ''}` : 'Recibo guardado');
}

/* ---------- Ajustes ---------- */
function settingsSheet() {
  const st = S.settings, lb = st.lastBackup;
  openSheet(`<div class="sheet-h"><span></span><h3>Ajustes</h3><button data-act="settingsSave">Hecho</button></div>
    <div class="sub" style="margin:0 4px 6px">PERFIL Y SALDO</div>
    <div class="form"><div class="field"><label>Nombre</label><input id="stName" value="${esc(st.name)}" placeholder="Tu nombre"></div>
    <div class="field"><label>Saldo inicial</label><input id="stBal" inputmode="decimal" value="${String(st.initialBalance).replace('.', ',')}"></div>
    <div class="field"><label>A fecha de</label><input id="stDate" type="date" value="${st.initialDate}"></div>
    <div class="field"><label>Moneda</label><select id="stCur">${['EUR', 'USD', 'GBP', 'CHF', 'MXN'].map(c => `<option ${st.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Apariencia</label><select id="stTheme"><option value="auto" ${st.theme === 'auto' ? 'selected' : ''}>Automática</option><option value="light" ${st.theme === 'light' ? 'selected' : ''}>Clara</option><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>Oscura</option></select></div></div>
    <p class="sub" style="margin:-6px 4px 16px">El saldo inicial es lo que tenías en el banco al comienzo de esa fecha. Desde ahí, la app suma y resta tus movimientos. Tu saldo actual calculado: <b>${money(balanceAt(todayISO()))}</b>.</p>
    <button class="btn ghost" data-act="adjust" style="margin-bottom:18px">Cuadrar con el saldo real del banco</button>
    <div class="sub" style="margin:0 4px 6px">CATEGORÍAS</div>
    <div class="list">${S.categories.map(c => `<button class="item" data-catedit="${c.id}"><i class="dot" style="background:${c.color}"></i><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${c.type === 'gasto' ? 'Gasto' : 'Ingreso'}${c.group ? ' · ' + GROUPS[c.group] : ''}${c.budget ? ' · tope ' + money0(c.budget) : ''}</div></div>${IC.chev}</button>`).join('')}</div>
    <button class="btn ghost" data-act="catNew" style="margin-bottom:18px">${IC.plus}Nueva categoría</button>
    <div class="sub" style="margin:0 4px 6px">COPIA DE SEGURIDAD</div>
    <div class="card"><div class="row between"><div><b>Última copia</b><div class="sub">${lb ? fmtDateLong(lb.slice(0, 10)) + ' ' + lb.slice(0, 4) : 'Nunca'}</div></div><span class="pill ${!lb ? 'neg' : (Date.now() - new Date(lb)) / 864e5 > 14 ? 'warn' : 'pos'}">${!lb ? 'Pendiente' : (Date.now() - new Date(lb)) / 864e5 > 14 ? 'Antigua' : 'Al día'}</span></div>
    <p class="sub">${S.tx.length} movimientos · ${S.recurring.length} recibos · ${S.goals.length} objetivos. Guarda la copia en iCloud Drive para protegerte si borras la app o cambias de iPhone.</p>
    <div class="btns"><button class="btn sm" style="width:100%" data-act="backup">Exportar copia</button><label class="btn sm ghost" style="width:100%;position:relative">Restaurar<input type="file" id="restoreIn" accept=".json,application/json" style="position:absolute;inset:0;opacity:0"></label></div></div>
    <div class="sub" style="margin:0 4px 6px">DATOS</div>
    <div class="btns" style="margin-bottom:10px"><button class="btn ghost sm" style="width:100%" data-act="demo">Cargar datos de ejemplo</button><button class="btn ghost sm" style="width:100%;color:var(--neg)" data-act="wipe">Borrar todo</button></div>
    <p class="sub" style="text-align:center;margin-top:16px">Caudal 1.0 · Tus datos se guardan solo en este dispositivo.</p>`);
  $('#restoreIn').addEventListener('change', e => e.target.files[0] && importBackup(e.target.files[0]));
}
function catForm(c) {
  const x = c || {name: '', type: 'gasto', color: PALETTE[S.categories.length % PALETTE.length], group: 'deseo'};
  openSheet(`<div class="sheet-h"><button data-act="settings" style="color:var(--ink2);font-weight:500">‹ Ajustes</button><h3>${c ? 'Categoría' : 'Nueva categoría'}</h3><button data-act="catSave" data-id="${c?.id || ''}">Guardar</button></div>
    <div class="form"><div class="field"><label>Nombre</label><input id="cName" value="${esc(x.name)}"></div>
    <div class="field"><label>Tipo</label><select id="cType" ${c ? 'disabled' : ''}><option value="gasto" ${x.type === 'gasto' ? 'selected' : ''}>Gasto</option><option value="ingreso" ${x.type === 'ingreso' ? 'selected' : ''}>Ingreso</option></select></div>
    <div class="field"><label>Naturaleza</label><select id="cGroup"><option value="">—</option>${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}" ${x.group === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    <div class="form"><div class="colors">${PALETTE.map(col => `<button data-ccolor="${col}" class="${x.color === col ? 'on' : ''}" style="background:${col}"></button>`).join('')}</div></div>
    ${c ? `<button class="btn danger" data-act="catDel" data-id="${c.id}">Eliminar categoría</button>` : ''}`);
  form = {color: x.color};
}

/* ---------- Bienvenida ---------- */
function onboarding() {
  openSheet(`<div style="text-align:center;padding:10px 0 6px"><img src="icons/icon-192.png" alt="" style="width:76px;height:76px;border-radius:18px;box-shadow:0 8px 20px rgba(8,21,48,.3)">
    <h3 style="font-family:var(--serif);font-size:28px;margin:14px 0 4px;font-weight:600">Bienvenido a Caudal</h3><p class="sub" style="margin:0 10px 18px">Tus finanzas, claras y bajo control. Empecemos con tu punto de partida.</p></div>
    <div class="form"><div class="field"><label>Tu nombre</label><input id="obName" placeholder="Opcional"></div>
    <div class="field"><label>Saldo actual</label><input id="obBal" inputmode="decimal" placeholder="0,00 €"></div></div>
    <p class="sub" style="margin:-6px 4px 16px">Lo que tienes hoy en tu cuenta principal. Después añade tus recibos fijos y tu nómina en Planificar → Recibos.</p>
    <button class="btn gold" data-act="obStart" style="margin-bottom:10px">Empezar</button>
    <button class="btn ghost" data-act="obDemo">Explorar con datos de ejemplo</button>`);
}

/* ---------- Datos de ejemplo ---------- */
function loadDemo() {
  const s = blankState(); s.settings.onboarded = true; s.settings.name = S.settings.name || 'Jose';
  const C = n => s.categories.find(c => c.name === n).id;
  const start = addMonths(curYM(), -6);
  s.settings.initialDate = start + '-01'; s.settings.initialBalance = 4200;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const R = (concept, cat, amount, day, extra = {}) => s.recurring.push({id: uid(), type: 'gasto', concept, cat: C(cat), amount, day, freq: 1, start, end: null, active: true, sub: false, skips: [], ...extra});
  s.recurring.push({id: uid(), type: 'ingreso', concept: 'Nómina', cat: C('Nómina'), amount: 2450, day: 28, freq: 1, start, end: null, active: true, sub: false, skips: []});
  R('Alquiler', 'Vivienda', 850, 1); R('Luz · Iberdrola', 'Suministros', 62, 8); R('Fibra y móvil', 'Suministros', 45, 12);
  R('Netflix', 'Suscripciones', 13.99, 15, {sub: true}); R('Spotify', 'Suscripciones', 11.99, 3, {sub: true}); R('HBO Max', 'Suscripciones', 9.99, 20, {sub: true});
  R('Gimnasio', 'Salud', 39.9, 5, {sub: true}); R('Seguro coche', 'Seguros', 420, 10, {freq: 12, start: addMonths(curYM(), -2)});
  const shops = [['Mercadona', 'Supermercado', 35, 85], ['Lidl', 'Supermercado', 20, 55], ['Gasolina', 'Transporte', 45, 70], ['Metro', 'Transporte', 8, 12], ['Restaurante', 'Restauración', 25, 70], ['Café', 'Restauración', 2, 5], ['Cine', 'Ocio', 9, 22], ['Amazon', 'Compras', 15, 90], ['Zara', 'Compras', 30, 80], ['Farmacia', 'Salud', 6, 25], ['Uber Eats', 'Restauración', 18, 32]];
  const t = todayISO();
  for (let ym = start; ym <= curYM(); ym = addMonths(ym, 1)) {
    const D = daysIn(ym);
    for (let d = 1; d <= D; d++) {
      const ds = `${ym}-${pad(d)}`; if (ds > t) break;
      const n = rnd() < .35 ? 0 : rnd() < .6 ? 1 : 2 + (weekday(ds) >= 5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const sh = shops[Math.floor(rnd() * shops.length)]; s.tx.push({id: uid(), type: 'gasto', cat: C(sh[1]), amount: round2(sh[2] + rnd() * (sh[3] - sh[2])), concept: sh[0], date: ds, note: ''}); }
    }
    if (rnd() < .4) s.tx.push({id: uid(), type: 'ingreso', cat: C('Extras'), amount: round2(80 + rnd() * 250), concept: 'Venta Wallapop', date: `${ym}-${pad(Math.min(D, 6 + Math.floor(rnd() * 15)))}`, note: ''});
    if (ym < curYM()) s.savings.push({id: uid(), amount: 250, date: `${ym}-28`, concept: 'Aportación mensual', goal: null});
  }
  s.tx = s.tx.filter(x => x.date <= t);
  s.goals.push({id: 'g1', name: 'Fondo de emergencia', target: 9000, deadline: addMonths(curYM(), 14) + '-01', color: '#2F5D50'});
  s.goals.push({id: 'g2', name: 'Viaje a Japón', target: 3500, deadline: addMonths(curYM(), 9) + '-01', color: '#B08D57'});
  s.savings.forEach((x, i) => x.goal = i % 2 ? 'g2' : 'g1');
  s.categories.find(c => c.name === 'Supermercado').budget = 380; s.categories.find(c => c.name === 'Restauración').budget = 220;
  s.categories.find(c => c.name === 'Compras').budget = 150; s.categories.find(c => c.name === 'Ocio').budget = 90;
  S = s; postDueRecurring(); save(); closeSheet(); ui.month = curYM(); go('home'); toast('Datos de ejemplo cargados. Bórralos en Ajustes cuando quieras.');
}

/* ---------- Eventos ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act],[data-tab],[data-close],[data-edit],[data-acc],[data-jump],[data-f],[data-day],[data-plan],[data-period],[data-budget],[data-ttype],[data-fcat],[data-goalin],[data-goalout],[data-goaledit],[data-recedit],[data-sedit],[data-gcolor],[data-ccolor],[data-catedit],[data-bset],[data-addday],[data-tabgo],[data-subtorec]');
  if (!el) return;
  const d = el.dataset;
  if ('close' in d) return closeSheet();
  if (d.tab) return go(d.tab);
  if (d.tabgo) return go(d.tabgo);
  if (d.edit) { const x = S.tx.find(t => t.id === d.edit); if (x) txForm(x); return; }
  if (d.acc) { ui.open.has(d.acc) ? ui.open.delete(d.acc) : ui.open.add(d.acc); return render(); }
  if (d.jump) { ui.open.add(d.jump); render(); $('#acc-' + d.jump)?.scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  if (d.f) { ui[d.f] = d.v; return render(); }
  if (d.day) { ui.calDay = ui.calDay === d.day ? null : d.day; render(); return; }
  if (d.addday) return txForm(null, {date: d.addday});
  if (d.plan) { ui.plan = d.plan; return render(); }
  if (d.period) { ui.period = d.period === 'ytd' ? 'ytd' : +d.period; return render(); }
  if (d.budget) return budgetForm(d.budget);
  if (d.bset) { $('#bAmount').value = d.bset; return; }
  if (d.ttype) { form.type = d.ttype; form.cat = catsOf(d.ttype)[0]?.id; $$('[data-ttype]').forEach(b => b.classList.toggle('on', b === el)); $('#fCats').innerHTML = catGrid(); return; }
  if (d.fcat) { form.cat = d.fcat; $('#fCats').innerHTML = catGrid(); return; }
  if (d.goalin) return savingForm(1, d.goalin);
  if (d.goalout) return savingForm(-1, d.goalout);
  if (d.goaledit) return goalForm(S.goals.find(g => g.id === d.goaledit));
  if (d.recedit) return recForm(S.recurring.find(r => r.id === d.recedit));
  if (d.subtorec) { const L = S.tx.filter(x => normConcept(x.concept) === d.subtorec).sort((a, b) => b.date.localeCompare(a.date)); const x = L[0]; return recForm(null, {concept: x.concept, cat: x.cat, amount: x.amount, day: +x.date.slice(8), sub: true}); }
  if (d.sedit) { const s = S.savings.find(s => s.id === d.sedit); return savingForm(s.amount >= 0 ? 1 : -1, s.goal, s); }
  if (d.gcolor) { $$('[data-gcolor]').forEach(b => b.classList.toggle('on', b === el)); return; }
  if (d.ccolor) { form.color = d.ccolor; $$('[data-ccolor]').forEach(b => b.classList.toggle('on', b === el)); return; }
  if (d.catedit) return catForm(S.categories.find(c => c.id === d.catedit));
  const A = {
    mprev: () => { ui.month = addMonths(ui.month, -1); ui.calDay = null; render(); },
    mnext: () => { if (ui.month < curYM()) ui.month = addMonths(ui.month, 1); ui.calDay = null; render(); },
    settings: settingsSheet,
    txSave, txDel,
    budgetSave: () => { const c = catById(d.id); const v = parseAmount($('#bAmount').value); c.budget = v > 0 ? v : null; save(); closeSheet(); render(); },
    budgetClear: () => { catById(d.id).budget = null; save(); closeSheet(); render(); },
    saveIn: () => savingForm(1), saveOut: () => savingForm(-1),
    saveMove: () => {
      const v = parseAmount($('#sAmount').value); if (!(v > 0)) return toast('Introduce un importe');
      const dir = +d.dir, goal = $('#sGoal').value || null;
      if (dir < 0 && v > (goal ? goalSaved(goal) : savingsAt(todayISO())) + 0.001) return toast('No puedes retirar más de lo apartado');
      const data = {amount: dir * v, date: $('#sDate').value || todayISO(), concept: $('#sConcept').value.trim(), goal};
      if (d.id) Object.assign(S.savings.find(s => s.id === d.id), data); else S.savings.push({id: uid(), ...data});
      save(); closeSheet(); render(); toast(dir > 0 ? `${money(v)} apartados · fuera de tu liquidez` : `${money(v)} devueltos a tu liquidez`);
    },
    saveDel: () => { S.savings = S.savings.filter(s => s.id !== d.id); save(); closeSheet(); render(); },
    goalNew: () => goalForm(null),
    goalSave: () => {
      const name = $('#gName').value.trim(), target = parseAmount($('#gTarget').value); if (!name || !(target > 0)) return toast('Indica nombre e importe');
      const color = $('[data-gcolor].on')?.dataset.gcolor || PALETTE[0], deadline = $('#gDate').value || addMonths(curYM(), 12) + '-01';
      if (d.id) Object.assign(S.goals.find(g => g.id === d.id), {name, target, deadline, color}); else S.goals.push({id: uid(), name, target, deadline, color, created: todayISO()});
      save(); closeSheet(); render();
    },
    goalDel: () => { if (!confirm('¿Eliminar el objetivo?')) return; S.goals = S.goals.filter(g => g.id !== d.id); S.savings.forEach(s => { if (s.goal === d.id) s.goal = null; }); save(); closeSheet(); render(); },
    recNew: () => recForm(null), recSave,
    recDel: () => {
      if (!confirm('¿Eliminar el recibo? Los cargos ya registrados se conservan en tu historial.')) return;
      S.recurring = S.recurring.filter(r => r.id !== form.recId); S.tx.forEach(x => { if (x.rec === form.recId) { x.rec = null; x.recKey = null; } }); save(); closeSheet(); render();
    },
    settingsSave: () => {
      const st = S.settings; st.name = $('#stName').value.trim(); st.initialBalance = parseAmount($('#stBal').value); st.initialDate = $('#stDate').value || st.initialDate;
      st.currency = $('#stCur').value; st.theme = $('#stTheme').value; save(); closeSheet(); render();
    },
    adjust: () => {
      const real = prompt('¿Cuál es el saldo real que ves hoy en tu banco?'); if (real === null) return;
      const diff = round2(parseAmount(real) - balanceAt(todayISO())); if (!diff) return toast('Ya está cuadrado');
      S.settings.initialBalance = round2(S.settings.initialBalance + diff); save(); settingsSheet(); render(); toast(`Saldo ajustado en ${diff > 0 ? '+' : ''}${money(diff)}`);
    },
    catNew: () => catForm(null),
    catSave: () => {
      const name = $('#cName').value.trim(); if (!name) return toast('Ponle un nombre');
      const data = {name, group: $('#cGroup').value || null, color: form.color};
      if (d.id) Object.assign(catById(d.id), data); else S.categories.push({id: uid(), type: $('#cType').value, budget: null, ...data});
      save(); settingsSheet(); render();
    },
    catDel: () => {
      const used = S.tx.filter(x => x.cat === d.id).length;
      const c = catById(d.id), alt = catsOf(c.type).find(k => k.id !== d.id);
      if (!alt) return toast('Necesitas al menos una categoría de este tipo');
      if (!confirm(used ? `Tiene ${used} movimientos que pasarán a "${alt.name}". ¿Continuar?` : '¿Eliminar la categoría?')) return;
      S.tx.forEach(x => { if (x.cat === d.id) x.cat = alt.id; }); S.recurring.forEach(r => { if (r.cat === d.id) r.cat = alt.id; });
      S.categories = S.categories.filter(k => k.id !== d.id); save(); settingsSheet(); render();
    },
    backup: exportBackup, shareFile, downloadFile,
    demo: () => { if (S.tx.length && !confirm('Esto reemplaza tus datos actuales por datos de ejemplo. ¿Seguro? (Haz antes una copia)')) return; loadDemo(); },
    wipe: () => { if (!confirm('¿Borrar TODOS los datos de este dispositivo? No se puede deshacer.')) return; if (!confirm('Última confirmación: ¿has hecho copia de seguridad?')) return; S = blankState(); save(); closeSheet(); render(); onboarding(); },
    obStart: () => { S.settings.name = $('#obName').value.trim(); S.settings.initialBalance = parseAmount($('#obBal').value); S.settings.initialDate = todayISO(); S.settings.onboarded = true; save(); closeSheet(); render(); },
    obDemo: loadDemo,
    report: openReport, closeReport: () => $('#reportView')?.remove(), print: printReport, reportFile,
    excel: exportExcel,
  };
  if (A[d.act]) A[d.act]();
});
document.addEventListener('input', e => { if (e.target.id === 'q') { ui.q = e.target.value; clearTimeout(ui._qt); ui._qt = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }, 220); } });
$('#fab').addEventListener('click', () => txForm(null, ui.tab === 'calendar' && ui.calDay ? {date: ui.calDay} : {}));
document.addEventListener('click', e => { if (e.target.closest('.monthbar .lbl') && ui.month !== curYM()) { ui.month = curYM(); render(); } });

/* Deslizar la hoja hacia abajo para cerrarla */
(() => {
  let y0 = null; const sh = $('#sheet');
  sh.addEventListener('touchstart', e => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, {passive: true});
  sh.addEventListener('touchmove', e => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, {passive: true});
  sh.addEventListener('touchend', e => { if (y0 === null) return; const dy = (e.changedTouches[0].clientY - y0); sh.style.transform = ''; if (dy > 120) closeSheet(); y0 = null; });
})();

/* ---------- Arranque ---------- */
function boot() {
  postDueRecurring();
  render();
  if (!S.settings.onboarded) onboarding();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  // Cambio de día con la app abierta: vuelve a contabilizar recibos
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (postDueRecurring()) toast('Recibos del día registrados'); if (ui.month > curYM()) ui.month = curYM(); render(); } });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => { const nw = reg.installing; nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nueva versión disponible', 'Actualizar', () => nw.postMessage('skipWaiting')); }); });
      setInterval(() => reg.update().catch(() => {}), 3600e3);
    }).catch(() => {});
    let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  if (ui.tab === 'reports') loadExcelJS().catch(() => {});
}
boot();
