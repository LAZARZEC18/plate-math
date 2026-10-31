/* Plate Math: pure maths, no DOM. Exposed as window.PM (and window.PlateMath for older tests). */
(function () {
  'use strict';

  // Plate geometry in millimetres (diameter d, thickness t), close to calibrated competition plates.
  // lb plates use the colour of their nearest kg equivalent, the way lb competition bumpers are made.
  const PLATES = {
    kg: [
      { w: 25,   d: 450, t: 27, color: '#D7263D', text: '#FFFFFF', name: 'Red' },
      { w: 20,   d: 450, t: 22, color: '#1E5BC6', text: '#FFFFFF', name: 'Blue' },
      { w: 15,   d: 400, t: 20, color: '#F2C230', text: '#1D1D1F', name: 'Yellow' },
      { w: 10,   d: 325, t: 18, color: '#23864A', text: '#FFFFFF', name: 'Green' },
      { w: 5,    d: 228, t: 16, color: '#F4F4F2', text: '#1D1D1F', name: 'White', light: true },
      { w: 2.5,  d: 190, t: 15, color: '#1D1F22', text: '#FFFFFF', name: 'Black', rim: '#D7263D' },
      { w: 1.25, d: 160, t: 13, color: '#C9CED4', text: '#1D1D1F', name: 'Chrome', chrome: true, light: true },
      { w: 0.5,  d: 134, t: 10, color: '#C9CED4', text: '#1D1D1F', name: 'Chrome', chrome: true, light: true },
      { w: 0.25, d: 110, t: 8,  color: '#C9CED4', text: '#1D1D1F', name: 'Chrome', chrome: true, light: true }
    ],
    lb: [
      { w: 45,  d: 450, t: 26, color: '#1E5BC6', text: '#FFFFFF', name: 'Blue' },
      { w: 35,  d: 400, t: 22, color: '#F2C230', text: '#1D1D1F', name: 'Yellow' },
      { w: 25,  d: 330, t: 20, color: '#23864A', text: '#FFFFFF', name: 'Green' },
      { w: 10,  d: 230, t: 16, color: '#F4F4F2', text: '#1D1D1F', name: 'White', light: true },
      { w: 5,   d: 190, t: 15, color: '#1D1F22', text: '#FFFFFF', name: 'Black', rim: '#D7263D' },
      { w: 2.5, d: 160, t: 13, color: '#C9CED4', text: '#1D1D1F', name: 'Chrome', chrome: true, light: true }
    ]
  };

  const DEFAULT_PAIRS = {
    kg: { 25: 4, 20: 2, 15: 2, 10: 2, 5: 2, 2.5: 2, 1.25: 2, 0.5: 0, 0.25: 0 },
    lb: { 45: 6, 35: 2, 25: 2, 10: 2, 5: 2, 2.5: 2 }
  };

  const BARS = {
    kg: [{ v: '20', label: '20 kg' }, { v: '15', label: '15 kg' }, { v: '10', label: '10 kg' }, { v: 'custom', label: 'Custom' }],
    lb: [{ v: '45', label: '45 lb' }, { v: '35', label: '35 lb' }, { v: 'custom', label: 'Custom' }]
  };
  const COLLAR_PAIR = { kg: 2.5, lb: 5 };
  const KG_PER_LB = 0.45359237;
  const SLEEVE_MM = 415;
  const MAX_PAIRS = 20;

  /* ---------- Numbers ---------- */
  const toC = (x) => Math.round(x * 100); // work in hundredths to avoid float drift
  const fromC = (c) => c / 100;
  function fmt(x) { return String(Math.round(x * 100) / 100); }
  function fmt1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function parseNum(str) {
    if (typeof str === 'number') return str;
    if (typeof str !== 'string') return NaN;
    const s = str.trim().replace(',', '.');
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function convert(w, from, to) {
    if (from === to) return w;
    return from === 'kg' ? w / KG_PER_LB : w * KG_PER_LB;
  }

  /* ---------- Plate solver ---------- */
  function sortedPlates(plates) { return plates.slice().sort((a, b) => b.w - a.w); }

  /** Greedy per-side solver that respects how many pairs you own. Weights in hundredths. */
  function greedy(perSideC, plates) {
    let rest = perSideC;
    const list = [];
    for (const p of sortedPlates(plates)) {
      const wc = toC(p.w);
      if (wc <= 0) continue;
      const n = Math.min(p.pairs, Math.floor(rest / wc));
      for (let i = 0; i < n; i++) list.push(p.w);
      rest -= n * wc;
    }
    return { list, sumC: perSideC - rest };
  }

  /** Every per-side total you can build, mapped to the combination with the fewest plates. */
  function reachable(plates) {
    let map = new Map([[0, []]]);
    for (const p of sortedPlates(plates)) {
      const wc = toC(p.w);
      if (!p.pairs || wc <= 0) continue;
      const next = new Map(map);
      for (const [sum, combo] of map) {
        for (let k = 1; k <= p.pairs; k++) {
          const s = sum + k * wc;
          const c = combo.concat(Array(k).fill(p.w));
          const prev = next.get(s);
          if (!prev || c.length < prev.length) next.set(s, c);
        }
      }
      map = next;
    }
    return map;
  }

  function comboFor(perSideC, plates, reach) {
    const g = greedy(perSideC, plates);
    if (g.sumC === perSideC) return g.list;
    return reach.get(perSideC).slice().sort((a, b) => b - a);
  }

  /**
   * Solve a target total. Returns one of
   *  { status: 'exact', total, perSide, perSideWeight }
   *  { status: 'between', target, below: {total, perSide, perSideWeight} | null, above: ... | null }
   *  { status: 'light', base }
   */
  function solve(target, bar, collarPair, platesIn) {
    const plates = sortedPlates(platesIn);
    const baseC = toC(bar) + toC(collarPair);
    const tC = toC(target);
    if (tC < baseC) return { status: 'light', base: fromC(baseC) };
    const plateTotalC = tC - baseC;
    const reach = reachable(plates);
    if (plateTotalC % 2 === 0) {
      const perSideC = plateTotalC / 2;
      const g = greedy(perSideC, plates);
      if (g.sumC === perSideC) return { status: 'exact', total: target, perSide: g.list, perSideWeight: fromC(perSideC) };
      if (reach.has(perSideC)) return { status: 'exact', total: target, perSide: comboFor(perSideC, plates, reach), perSideWeight: fromC(perSideC) };
    }
    let lo = -1, hi = -1;
    for (const s of reach.keys()) {
      const tot = 2 * s;
      if (tot <= plateTotalC && (lo < 0 || s > lo)) lo = s;
      if (tot >= plateTotalC && (hi < 0 || s < hi)) hi = s;
    }
    const opt = (s) => (s < 0 ? null : { total: fromC(baseC + 2 * s), perSide: comboFor(s, plates, reach), perSideWeight: fromC(s) });
    return { status: 'between', target, below: opt(lo), above: opt(hi) };
  }

  /** All loadable totals, ascending. */
  function loadableTotals(bar, collarPair, plates) {
    const baseC = toC(bar) + toC(collarPair);
    const reach = reachable(plates);
    return [...reach.keys()].map((s) => fromC(baseC + 2 * s)).sort((a, b) => a - b);
  }

  function nearestLoadable(x, totals) {
    if (!totals.length) return x;
    let best = totals[0];
    for (const t of totals) if (Math.abs(t - x) < Math.abs(best - x) - 1e-9) best = t;
    return best;
  }

  /** Smallest change you can make to the bar: one pair of the smallest plate you own. */
  function stepFor(plates, units) {
    const owned = plates.filter((p) => p.pairs > 0).map((p) => p.w);
    if (!owned.length) return units === 'lb' ? 5 : 2.5;
    return Math.min(...owned) * 2;
  }

  /** Thickness used on one sleeve in mm, and the fraction of a 415 mm sleeve. */
  function sleeveUse(perSide, units, collars) {
    const spec = (w) => PLATES[units].find((p) => p.w === w);
    let mm = perSide.reduce((a, w) => a + (spec(w) ? spec(w).t : 0), 0);
    if (collars) mm += 42;
    return { mm, frac: mm / SLEEVE_MM };
  }

  /* ---------- One-rep max ---------- */
  function oneRepMax(w, r) {
    if (r === 1) return { epley: w, brzycki: w, lombardi: w, average: w };
    const epley = w * (1 + r / 30);
    const brzycki = (w * 36) / (37 - r);
    const lombardi = w * Math.pow(r, 0.1);
    return { epley, brzycki, lombardi, average: (epley + brzycki + lombardi) / 3 };
  }

  // Standard RPE chart (Tuchscherer / RTS). Each half RPE or each extra rep moves one step down this list.
  const RPE_STEPS = [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4,
    76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.2];
  const RPE_VALUES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
  /** Percentage of 1RM for a set of `reps` at `rpe` (reps 1–12, RPE 6–10). */
  function rpePercent(reps, rpe) {
    if (!(reps >= 1 && reps <= 12) || !(rpe >= 6 && rpe <= 10)) return NaN;
    const idx = Math.round((reps - 1) * 2 + (10 - rpe) * 2);
    return RPE_STEPS[idx];
  }
  function rpeE1rm(w, reps, rpe) {
    const p = rpePercent(reps, rpe);
    return Number.isFinite(p) ? (w * 100) / p : NaN;
  }

  /* ---------- Warm-up ---------- */
  function warmupPlan(working, bar, totals, units) {
    const heavy = units === 'kg' ? 120 : 265;
    const steps = [
      { pct: 0, reps: '10' },
      { pct: 0.4, reps: '5' },
      { pct: 0.6, reps: '3' },
      { pct: 0.8, reps: '1–2' }
    ];
    if (working >= heavy) { steps[3].reps = '2'; steps.push({ pct: 0.9, reps: '1' }); }
    const sets = [];
    let last = -Infinity;
    for (const s of steps) {
      const raw = s.pct === 0 ? bar : working * s.pct;
      const w = s.pct === 0 ? totals[0] : nearestLoadable(raw, totals);
      if (w <= last + 1e-9 || w >= working - 1e-9) continue;
      sets.push({ weight: w, reps: s.reps, pct: s.pct, label: s.pct === 0 ? 'Empty bar' : Math.round(s.pct * 100) + '%' });
      last = w;
    }
    return sets;
  }

  /* ---------- 5/3/1 ---------- */
  const WEEKS_531 = [
    { name: 'Week 1', sub: '5s', sets: [[65, '5'], [75, '5'], [85, '5+']] },
    { name: 'Week 2', sub: '3s', sets: [[70, '3'], [80, '3'], [90, '3+']] },
    { name: 'Week 3', sub: '5/3/1', sets: [[75, '5'], [85, '3'], [95, '1+']] },
    { name: 'Deload', sub: 'Week 4', sets: [[40, '5'], [50, '5'], [60, '5']] }
  ];
  /** Four weeks of sets for one lift. Weights rounded to the nearest loadable total. */
  function program531(oneRm, tmPct, totals) {
    const tm = (oneRm * tmPct) / 100;
    return {
      tm,
      weeks: WEEKS_531.map((wk) => ({
        name: wk.name, sub: wk.sub,
        sets: wk.sets.map(([pct, reps]) => {
          const exact = (tm * pct) / 100;
          return { pct, reps, exact, weight: nearestLoadable(exact, totals) };
        })
      }))
    };
  }

  /* ---------- Log ---------- */
  function e1rm(w, r) { return r <= 1 ? w : oneRepMax(w, r).average; }
  function sortLog(log) {
    return log.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t || 0) - (b.t || 0)));
  }
  /** Ids of sets that beat every earlier set of the same exercise on estimated 1RM. The first set of an exercise sets the baseline. */
  function prIds(log) {
    const best = {};
    const ids = new Set();
    for (const s of sortLog(log)) {
      const v = e1rm(convert(s.w, s.u || 'kg', 'kg'), s.r);
      const k = s.ex.toLowerCase();
      if (k in best) { if (v > best[k] + 1e-9) { ids.add(s.id); best[k] = v; } }
      else best[k] = v;
    }
    return ids;
  }
  /** Best e1RM per date for one exercise, ascending. Values in `units`. */
  function progression(log, ex, units) {
    const byDate = new Map();
    for (const s of log) {
      if (s.ex.toLowerCase() !== ex.toLowerCase()) continue;
      const w = convert(s.w, s.u || 'kg', units);
      const v = e1rm(w, s.r);
      const cur = byDate.get(s.d);
      if (!cur || v > cur.v) byDate.set(s.d, { d: s.d, v, w, r: s.r, id: s.id });
    }
    return [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
  }
  function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(log) {
    const prs = prIds(log);
    const rows = [['date', 'exercise', 'weight', 'unit', 'reps', 'e1rm', 'pr']];
    for (const s of sortLog(log)) rows.push([s.d, s.ex, fmt(s.w), s.u || 'kg', s.r, fmt1(e1rm(s.w, s.r)), prs.has(s.id) ? 'yes' : '']);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  }

  /** ~8 weeks of plausible squat and bench sessions ending on `endIso`, two sessions a week. */
  function exampleLog(endIso, units) {
    const end = new Date(endIso + 'T12:00:00');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = [];
    const r25 = (x) => Math.round(x / 2.5) * 2.5;
    const sessions = 16;
    let id = 1;
    for (let i = 0; i < sessions; i++) {
      const daysBack = Math.round((sessions - 1 - i) * 3.5);
      const dt = new Date(end); dt.setDate(end.getDate() - daysBack);
      const d = isoDate(dt);
      const stall = i === 6 || i === 11 ? -1 : 0;
      const sqTop = r25(110 + i * 1.25 + stall * 2.5 + (rnd() < 0.3 ? 2.5 : 0));
      const bnTop = r25(80 + i * 0.8 + stall * 2.5 + (rnd() < 0.25 ? 2.5 : 0));
      const reps = i % 2 === 0 ? 5 : 3;
      const add = (ex, w, r, k) => out.push({ id: 'ex' + id++, ex, w: units === 'kg' ? w : Math.round(convert(w, 'kg', 'lb') / 5) * 5, u: units, r, d, t: dt.getTime() + k });
      add('Squat', r25(sqTop * 0.85), reps + 2, 1);
      add('Squat', sqTop, reps, 2);
      add('Squat', r25(sqTop * 0.9), reps, 3);
      add('Bench press', r25(bnTop * 0.85), reps + 2, 4);
      add('Bench press', reps === 3 ? r25(bnTop + 5) : bnTop, reps, 5);
      add('Bench press', r25(bnTop * 0.9), reps, 6);
    }
    return out;
  }
  function isoDate(dt) {
    const p = (n) => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  const api = {
    PLATES, DEFAULT_PAIRS, BARS, COLLAR_PAIR, KG_PER_LB, SLEEVE_MM, MAX_PAIRS, RPE_VALUES, WEEKS_531,
    fmt, fmt1, parseNum, convert, greedy, reachable, solve, loadableTotals, nearestLoadable, stepFor, sleeveUse,
    oneRepMax, rpePercent, rpeE1rm, warmupPlan, program531, e1rm, sortLog, prIds, progression, toCsv, exampleLog, isoDate
  };
  window.PM = api;
  window.PlateMath = api;
})();
