/* Plate Math: UI. Depends on zl.js (ZL), logic.js (PM), bar.js (PMBar), chart.js (PMChart). */
(function () {
  'use strict';
  const { fmt, fmt1, parseNum } = PM;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const EXERCISES = ['Squat', 'Bench press', 'Deadlift', 'Overhead press', 'Barbell row', 'Front squat', 'Romanian deadlift', 'Incline bench press'];
  const LIFT_EX = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift', press: 'Overhead press' };
  const LIFT_NAME = { squat: 'squat', bench: 'bench', deadlift: 'deadlift', press: 'press' };

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    if (kids) for (const c of kids) if (c != null && c !== false) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }
  const todayIso = () => PM.isoDate(new Date());
  function niceDate(iso) {
    const t = todayIso();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === t) return 'Today';
    if (iso === PM.isoDate(y)) return 'Yesterday';
    const d = new Date(iso + 'T12:00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
  }

  /* ---------- State ---------- */
  function defaults() {
    return {
      units: 'kg', collars: false, target: 100, tab: 'load',
      rm: { w: 100, r: 5, rpe: 8, mode: 'reps' },
      warm: 100, warmDone: { key: '', done: [] },
      prog: { lifts: { squat: 140, bench: 100, deadlift: 180, press: 60 }, tm: 90, lift: 'squat' },
      equip: {
        kg: { bar: '20', custom: 20, pairs: { ...PM.DEFAULT_PAIRS.kg } },
        lb: { bar: '45', custom: 45, pairs: { ...PM.DEFAULT_PAIRS.lb } }
      },
      logEx: 'Bench press', chartEx: '', customEx: []
    };
  }
  function load() {
    const base = defaults();
    const s = ZL.store.get('state', null);
    if (!s || typeof s !== 'object') return base;
    const m = { ...base, ...s };
    m.rm = { ...base.rm, ...(s.rm || {}) };
    m.prog = { ...base.prog, ...(s.prog || {}), lifts: { ...base.prog.lifts, ...((s.prog && s.prog.lifts) || {}) } };
    m.warmDone = { ...base.warmDone, ...(s.warmDone || {}) };
    m.equip = {};
    for (const u of ['kg', 'lb']) {
      const e = (s.equip && s.equip[u]) || {};
      m.equip[u] = { ...base.equip[u], ...e, pairs: { ...PM.DEFAULT_PAIRS[u], ...(e.pairs || {}) } };
      // drop plates that no longer exist in this unit's set
      for (const k of Object.keys(m.equip[u].pairs)) if (!PM.PLATES[u].some((p) => String(p.w) === k)) delete m.equip[u].pairs[k];
    }
    if (m.units !== 'kg' && m.units !== 'lb') m.units = 'kg';
    if (!Array.isArray(m.customEx)) m.customEx = [];
    return m;
  }
  const state = load();
  let log = (() => { const l = ZL.store.get('log', []); return Array.isArray(l) ? l.filter((s) => s && s.id && s.ex && s.w > 0 && s.r > 0 && s.d) : []; })();

  const statusEl = $('#status');
  let statusTimer = 0;
  function save() {
    const ok = ZL.store.set('state', state);
    setStatus(ok);
  }
  function saveLog() {
    const ok = ZL.store.set('log', log);
    setStatus(ok);
    renderCount();
  }
  function setStatus(ok) {
    statusEl.textContent = ok ? 'Saved' : 'Not saved: storage is off';
    statusEl.classList.toggle('is-bad', !ok);
    statusEl.classList.remove('pulse'); void statusEl.offsetWidth; statusEl.classList.add('pulse');
    clearTimeout(statusTimer);
  }
  function renderCount() {
    let b = $('#log-count');
    if (!b) { b = el('span', { class: 'zl-badge pm-logcount', id: 'log-count' }); statusEl.before(b); }
    b.textContent = log.length === 1 ? '1 set logged' : `${log.length} sets logged`;
    b.hidden = !log.length;
  }

  /* ---------- Equipment helpers ---------- */
  const U = () => state.units;
  const eq = () => state.equip[U()];
  const barWeight = () => {
    const e = eq();
    if (e.bar === 'custom') return Number.isFinite(e.custom) && e.custom >= 0 ? e.custom : 0;
    return Number(e.bar);
  };
  const collarWeight = () => (state.collars ? PM.COLLAR_PAIR[U()] : 0);
  const plateList = () => PM.PLATES[U()].map((p) => ({ w: p.w, pairs: eq().pairs[p.w] || 0 }));
  const specFor = (w) => PM.PLATES[U()].find((p) => p.w === w);
  const step = () => PM.stepFor(plateList(), U());
  let totalsKey = '', totalsVal = [];
  function totals() {
    const key = U() + barWeight() + '|' + collarWeight() + '|' + JSON.stringify(eq().pairs);
    if (key !== totalsKey) { totalsKey = key; totalsVal = PM.loadableTotals(barWeight(), collarWeight(), plateList()); }
    return totalsVal;
  }
  const solveNow = (w) => PM.solve(w, barWeight(), collarWeight(), plateList());

  function chip(w, small) {
    const s = specFor(w);
    const c = el('span', { class: 'pm-chip num' + (small ? ' sm' : '') + (s && s.light ? ' lt' : '') + (s && s.rim ? ' rim' : ''), text: fmt(w) });
    if (s) { c.style.setProperty('--c', s.color); c.style.setProperty('--t', s.text); }
    return c;
  }
  function platesText(perSide) {
    if (!perSide.length) return 'Just the bar';
    return perSide.map(fmt).join(' + ') + ' a side';
  }

  /* ---------- Tabs ---------- */
  const tabs = $$('.pm-tabs [role=tab]');
  function selectTab(name, focus) {
    for (const t of tabs) {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    }
    if (state.tab !== name) { state.tab = name; save(); }
    if (name === 'log') renderLog(true);
    if (name === 'load') renderLoad(false);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n >= 0) { e.preventDefault(); selectTab(tabs[n].dataset.tab, true); }
    });
  });

  /** Send a weight to the loader from any tab. */
  function loadWeight(w, label) {
    selectTab('load');
    setTarget(w, true);
    const app = $('#app .zl-app');
    const r = app.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.4) $('#app').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    ZL.toast(`Loaded ${fmt(w)} ${U()}${label ? ', ' + label : ''}`);
  }

  /* ---------- Units ---------- */
  function setUnitLabels() {
    $$('[data-unit]').forEach((n) => (n.textContent = U()));
    $$('#units button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.u === U()));
    $('#target-unit').textContent = U();
    const st = fmt(step());
    $('#minus-amt').textContent = st;
    $('#plus-amt').textContent = st;
    $('#minus').setAttribute('aria-label', `Remove ${st} ${U()}`);
    $('#plus').setAttribute('aria-label', `Add ${st} ${U()}`);
    const smallest = st / 2;
    $('#step-hint').textContent = `Steps of ${st} ${U()}: one pair of ${fmt(smallest)}s, your smallest plate.`;
    $('#collars-hint').textContent = `Adds ${fmt(PM.COLLAR_PAIR[U()])} ${U()} a pair.`;
  }
  $$('#units button').forEach((b) => b.addEventListener('click', () => {
    const to = b.dataset.u;
    if (to === U()) return;
    const from = U();
    const conv = (x) => PM.convert(x, from, to);
    const half = (x) => Math.round(x * 2) / 2;
    state.units = to;
    state.target = PM.nearestLoadable(conv(state.target), totals());
    state.warm = PM.nearestLoadable(conv(state.warm), totals());
    state.rm.w = half(conv(state.rm.w));
    for (const k in state.prog.lifts) if (Number.isFinite(state.prog.lifts[k])) state.prog.lifts[k] = half(conv(state.prog.lifts[k]));
    save();
    PMBar.reset($('#barbell'));
    syncInputs();
    renderAll(false);
    ZL.toast(to === 'kg' ? 'Switched to kilograms' : 'Switched to pounds');
  }));

  /* ---------- 1. Load the bar ---------- */
  const targetInput = $('#target');
  const summary = $('#summary');
  const barSvg = $('#barbell');

  function sizeTarget() {
    targetInput.parentElement.dataset.value = targetInput.value.trim() || '0';
  }
  function stat(value, label, extra) {
    return el('div', { class: 'zl-stat' + (extra ? ' ' + extra : '') }, [el('b', { class: 'num', text: value }), el('span', { text: label })]);
  }

  function renderLoad(animate) {
    const u = U();
    sizeTarget();
    const t = parseNum(targetInput.value);
    const err = $('#target-error');
    summary.replaceChildren();
    targetInput.setAttribute('aria-invalid', 'false');
    err.hidden = true;
    let shown = [];
    let total = barWeight() + collarWeight();
    let status = 'empty';

    if (!Number.isFinite(t) || t <= 0) {
      targetInput.setAttribute('aria-invalid', 'true');
      err.textContent = `Type a weight in ${u}, like ${u === 'kg' ? '100 or 142.5' : '225 or 315'}.`;
      err.hidden = false;
      summary.append(el('p', { class: 'pm-sum-msg', text: 'Enter a target weight to see the plates.' }));
    } else {
      const res = solveNow(t);
      status = res.status;
      if (res.status === 'exact') {
        shown = res.perSide;
        total = t;
        summary.append(
          el('div', { class: 'pm-sum-head' }, [el('span', { class: 'zl-label', text: 'Each side' }), el('span', { class: 'zl-badge good', html: ZL.icons.check + 'Exact' })]),
          plateRow(shown),
          el('p', { class: 'pm-breakdown num', text: breakdown(res.perSideWeight) })
        );
      } else if (res.status === 'light') {
        summary.append(
          el('div', { class: 'pm-sum-head' }, [el('span', { class: 'zl-label', text: 'Each side' }), el('span', { class: 'zl-badge bad', text: 'Too light' })]),
          el('p', { class: 'pm-sum-msg', text: `${fmt(t)} ${u} is lighter than the bar${state.collars ? ' and collars' : ''} (${fmt(res.base)} ${u}).` }),
          el('div', { class: 'pm-options' }, [optBtn(res.base, 'above', 'Empty bar')])
        );
      } else {
        const { below, above } = res;
        const pick = below || above;
        shown = pick ? pick.perSide : [];
        total = pick ? pick.total : total;
        let msg = `${fmt(t)} ${u} can't be made with your plates.`;
        if (below && above) msg += ' Closest you can load:';
        else if (below) msg += ` The most you can load is ${fmt(below.total)} ${u}. Add plates under My plates to go heavier.`;
        summary.append(
          el('div', { class: 'pm-sum-head' }, [el('span', { class: 'zl-label', text: 'Each side' }), el('span', { class: 'zl-badge', text: 'Closest match' })]),
          el('p', { class: 'pm-sum-msg', text: msg }),
          el('div', { class: 'pm-options' }, [below && optBtn(below.total, 'below', 'Lighter'), above && optBtn(above.total, 'above', 'Heavier')])
        );
      }
    }

    const { overfull } = PMBar.draw(barSvg, { perSide: shown, units: u, collars: state.collars, animate });
    barSvg.dataset.status = status;
    const cap = $('#bar-caption');
    const use = PM.sleeveUse(shown, u, state.collars);
    cap.className = 'pm-bar-caption' + (overfull ? ' is-bad' : '');
    cap.textContent = overfull
      ? `That's ${Math.round(use.mm)} mm of plates a side, more than fits on a standard 415 mm sleeve.`
      : status === 'between' ? `Showing ${fmt(total)} ${u}, the closest lighter load.` : 'Drawn to scale, plate thickness exaggerated so the numbers fit.';

    const per = shown.reduce((a, w) => a + w, 0);
    $('#load-stats').replaceChildren(
      stat(`${fmt(total)} ${u}`, 'On the bar', 'big'),
      stat(`${fmt(per)} ${u}`, 'Each side'),
      stat(String(shown.length * 2), shown.length === 1 ? 'Plates total' : 'Plates total'),
      stat(`${Math.min(999, Math.round(use.frac * 100))}%`, 'Sleeve used')
    );
    const logBtn = el('button', { type: 'button', class: 'zl-btn zl-btn-ghost zl-btn-sm pm-log-this', id: 'log-this', text: `Log a set at ${fmt(total)} ${u}`, onclick: () => logPrefill(total) });
    if (status === 'exact' || status === 'between') summary.append(logBtn);
  }

  function plateRow(list) {
    const row = el('div', { class: 'pm-chips', 'data-testid': 'per-side' });
    if (!list.length) row.append(el('span', { class: 'pm-chips-empty', text: 'No plates, just the bar' }));
    list.forEach((w, i) => { const c = chip(w); c.style.setProperty('--i', i); row.append(c); });
    return row;
  }
  function breakdown(perSideW) {
    const u = U();
    const parts = [`Bar ${fmt(barWeight())}`];
    if (state.collars) parts.push(`collars ${fmt(PM.COLLAR_PAIR[u])}`);
    if (perSideW > 0) parts.push(`2 × ${fmt(perSideW)}`);
    return parts.join(' + ') + ` = ${fmt(barWeight() + collarWeight() + 2 * perSideW)} ${u}`;
  }
  function optBtn(w, kind, label) {
    return el('button', {
      type: 'button', class: 'pm-opt', 'data-load': w, 'data-option': kind, 'aria-label': `Load ${fmt(w)} ${U()}`,
      onclick: () => { setTarget(w, true); ZL.toast(`Loaded ${fmt(w)} ${U()}`); targetInput.focus({ preventScroll: true }); }
    }, [el('b', { class: 'num', text: `${fmt(w)} ${U()}` }), el('span', { text: label })]);
  }

  function setTarget(w, animate) {
    state.target = Math.max(0, Math.round(w * 100) / 100);
    targetInput.value = fmt(state.target);
    save();
    renderLoad(animate);
    if (animate && !reduceMotion.matches) {
      const wrap = $('.pm-target-wrap');
      wrap.classList.remove('bump'); void wrap.offsetWidth; wrap.classList.add('bump');
    }
  }

  targetInput.addEventListener('input', () => {
    const v = parseNum(targetInput.value);
    if (Number.isFinite(v)) { state.target = v; save(); }
    renderLoad(true);
  });
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
  });
  targetInput.addEventListener('focus', () => targetInput.select());
  function bump(dir) {
    const cur = parseNum(targetInput.value);
    const base = barWeight() + collarWeight();
    const st = step();
    const from = Number.isFinite(cur) ? cur : base;
    // Snap to the step grid that starts at the empty bar, so 101 + 2.5 lands on 102.5, then move.
    const k = (from - base) / st;
    const next = base + (dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1) * st;
    setTarget(Math.max(base, Math.round(next * 100) / 100), true);
  }
  $('#plus').addEventListener('click', () => bump(1));
  $('#minus').addEventListener('click', () => bump(-1));

  function renderBarOpts() {
    const seg = $('#bar-seg');
    seg.replaceChildren(...PM.BARS[U()].map((b) => el('button', {
      type: 'button', 'data-bar': b.v, 'aria-pressed': String(eq().bar === b.v), text: b.label,
      onclick: () => {
        if (eq().bar === b.v) return;
        eq().bar = b.v;
        save(); renderBarOpts(); renderAll(true);
        ZL.toast(b.v === 'custom' ? 'Using a custom bar' : `Using a ${b.label} bar`);
        if (b.v === 'custom') $('#bar-custom').focus();
      }
    })));
    $('#custom-wrap').hidden = eq().bar !== 'custom';
    if (document.activeElement !== $('#bar-custom')) $('#bar-custom').value = fmt(eq().custom);
    $('#collars').checked = state.collars;
  }
  $('#bar-custom').addEventListener('input', (e) => {
    const v = parseNum(e.target.value);
    const bad = !Number.isFinite(v) || v > 100;
    e.target.setAttribute('aria-invalid', String(bad));
    $('#bar-custom-error').hidden = !bad;
    $('#bar-custom-error').textContent = `Enter the bar's weight in ${U()}, from 0 to 100.`;
    if (bad) return;
    eq().custom = v;
    save(); renderAll(true);
  });
  $('#collars').addEventListener('change', (e) => {
    state.collars = e.target.checked;
    save(); renderAll(true);
    ZL.toast(state.collars ? `Collars on, +${fmt(PM.COLLAR_PAIR[U()])} ${U()}` : 'Collars off');
  });

  /* ---------- 2. 1RM ---------- */
  const rpeSel = $('#rm-rpe');
  PM.RPE_VALUES.forEach((v) => rpeSel.append(el('option', { value: v, text: `${fmt(v)}${v === 10 ? ', max effort' : v === 9 ? ', 1 rep left' : v === 8 ? ', 2 reps left' : v === 7 ? ', 3 reps left' : v === 6 ? ', 4 reps left' : ''}` })));

  function rmValue() {
    const w = parseNum($('#rm-w').value), r = parseNum($('#rm-r').value);
    const rpe = Number(rpeSel.value);
    const u = U();
    const rpeMode = state.rm.mode === 'rpe';
    let msg = '', warn = '';
    if (!Number.isFinite(w) || w <= 0) msg = `Enter the weight you lifted in ${u}.`;
    else if (!Number.isInteger(r) || r < 1) msg = 'Enter reps as a whole number, 1 or more.';
    else if (rpeMode && r > 12) msg = 'The RPE chart covers 1 to 12 reps. Lower the reps or switch to the Reps method.';
    else if (r > 30) msg = 'Use a set of 30 reps or fewer. The formulas stop making sense past that.';
    else if (!rpeMode && r > 12) warn = 'Above 12 reps these estimates get rough. Treat them as a ballpark.';
    if (msg) return { msg };
    const est = PM.oneRepMax(w, r);
    const value = rpeMode ? PM.rpeE1rm(w, r, rpe) : est.average;
    return { w, r, rpe, est, value, warn, rpeMode };
  }

  function renderRm() {
    const u = U();
    const v = rmValue();
    const err = $('#rm-error');
    $('#rpe-wrap').hidden = state.rm.mode !== 'rpe';
    $('#rpe-hint').hidden = state.rm.mode !== 'rpe';
    $$('#rm-mode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.rm.mode));
    $('#rm-w').setAttribute('aria-invalid', String(!!v.msg && /weight/.test(v.msg)));
    $('#rm-r').setAttribute('aria-invalid', String(!!v.msg && /reps|RPE/.test(v.msg)));
    const body = $('#pct-body');
    body.replaceChildren();
    if (v.msg) {
      err.textContent = v.msg; err.hidden = false; err.className = 'zl-error';
      $('#rm-avg').textContent = '–';
      $('#rm-methods').replaceChildren();
      $('#rm-result').classList.add('is-empty');
      body.append(el('tr', {}, [el('td', { colspan: 4, class: 'pm-td-empty', text: 'Fix the set above to see percentages.' })]));
      return;
    }
    err.hidden = !v.warn; err.textContent = v.warn; err.className = 'zl-hint pm-warn';
    $('#rm-result').classList.remove('is-empty');
    $('#rm-avg').textContent = fmt1(v.value);
    const dl = $('#rm-methods');
    const item = (k, val) => el('div', {}, [el('dt', { text: k }), el('dd', { class: 'num', text: val })]);
    if (v.rpeMode) {
      $('#rm-caption').textContent = 'Estimated one-rep max, from the RPE chart';
      $('#rm-sub').textContent = `${fmt(v.w)} ${u} × ${v.r} at RPE ${fmt(v.rpe)} is ${PM.rpePercent(v.r, v.rpe).toFixed(1)}% of your max.`;
      dl.replaceChildren(
        item('Chart', `${PM.rpePercent(v.r, v.rpe).toFixed(1)}%`),
        item('Reps left', fmt(10 - v.rpe)),
        item('Formula average', `${fmt1(v.est.average)} ${u}`)
      );
    } else {
      $('#rm-caption').textContent = 'Estimated one-rep max';
      $('#rm-sub').textContent = 'The average of three formulas.';
      dl.replaceChildren(item('Epley', `${fmt1(v.est.epley)} ${u}`), item('Brzycki', `${fmt1(v.est.brzycki)} ${u}`), item('Lombardi', `${fmt1(v.est.lombardi)} ${u}`));
    }
    const tt = totals();
    for (let p = 100; p >= 50; p -= 5) {
      const exact = (v.value * p) / 100;
      const ld = PM.nearestLoadable(exact, tt);
      body.append(el('tr', { 'data-pct': p }, [
        el('th', { scope: 'row', class: 'num', text: `${p}%` }),
        el('td', { class: 'num pm-muted', text: fmt1(exact) }),
        el('td', { class: 'num pm-strong', text: `${fmt(ld)} ${u}` }),
        el('td', { class: 'pm-act' }, [el('button', {
          type: 'button', class: 'zl-btn zl-btn-secondary zl-btn-sm', text: 'Load this', 'aria-label': `Load ${fmt(ld)} ${u}, ${p}% of your max`,
          onclick: () => loadWeight(ld, `${p}% of your max`)
        })])
      ]));
    }
  }
  ['#rm-w', '#rm-r'].forEach((s) => $(s).addEventListener('input', () => {
    const w = parseNum($('#rm-w').value), r = parseNum($('#rm-r').value);
    if (Number.isFinite(w)) state.rm.w = w;
    if (Number.isFinite(r)) state.rm.r = r;
    save(); renderRm();
  }));
  rpeSel.addEventListener('change', () => { state.rm.rpe = Number(rpeSel.value); save(); renderRm(); });
  $$('#rm-mode button').forEach((b) => b.addEventListener('click', () => {
    if (state.rm.mode === b.dataset.mode) return;
    state.rm.mode = b.dataset.mode; save(); renderRm();
  }));

  /* ---------- 3. Warm-up ---------- */
  function renderWarm() {
    const list = $('#warm-sets');
    list.replaceChildren();
    const w = parseNum($('#warm-w').value);
    const u = U();
    const err = $('#warm-error');
    const bad = !Number.isFinite(w) || w <= 0;
    $('#warm-w').setAttribute('aria-invalid', String(bad));
    err.hidden = !bad;
    if (bad) {
      err.textContent = `Enter your working weight in ${u}, like ${u === 'kg' ? '100' : '225'}.`;
      $('#warm-progress').hidden = true;
      list.append(el('li', { class: 'zl-empty pm-warm-empty' }, [el('h3', { text: 'No working weight yet' }), el('p', { text: 'Type the weight of your work sets above and the ramp appears here.' })]));
      return;
    }
    const sets = PM.warmupPlan(w, barWeight(), totals(), u);
    const all = sets.concat([{ weight: w, reps: 'Work', label: 'Working weight', work: true }]);
    const key = [fmt(w), u, barWeight(), collarWeight(), JSON.stringify(eq().pairs)].join('|');
    if (state.warmDone.key !== key) { state.warmDone = { key, done: [] }; save(); }
    const done = new Set(state.warmDone.done);
    all.forEach((s, i) => {
      const res = solveNow(s.weight);
      const per = res.status === 'exact' ? res.perSide : null;
      const id = 'warm-ck-' + i;
      const chips = el('div', { class: 'pm-chips sm' });
      if (per && per.length) per.forEach((p) => chips.append(chip(p, true)));
      else chips.append(el('span', { class: 'pm-chips-empty', text: per ? 'Just the bar' : `Closest is ${fmt((res.below || res.above || { total: s.weight }).total)} ${u}` }));
      const li = el('li', { class: 'pm-set' + (s.work ? ' is-work' : '') + (done.has(i) ? ' is-done' : ''), 'data-i': i }, [
        el('label', { class: 'pm-check', for: id }, [
          el('input', { type: 'checkbox', id, checked: done.has(i), 'aria-label': `Done: ${fmt(s.weight)} ${u} ${s.work ? 'work sets' : '× ' + s.reps}`, onchange: (e) => tick(i, e.target.checked, all.length) }),
          el('span', { class: 'pm-check-box', html: ZL.icons.check })
        ]),
        el('div', { class: 'pm-set-main' }, [
          el('div', { class: 'pm-set-w num' }, [el('strong', { text: fmt(s.weight) }), ` ${u}`]),
          el('div', { class: 'pm-set-meta', text: s.work ? 'Working sets' : `${s.label}, ${s.reps === '1–2' ? '1 to 2 reps' : s.reps + (s.reps === '1' ? ' rep' : ' reps')}` })
        ]),
        el('span', { class: 'pm-set-reps num', text: s.work ? 'Work' : `× ${s.reps}` }),
        chips,
        el('button', { type: 'button', class: 'zl-btn zl-btn-secondary zl-btn-sm', text: 'Load', 'aria-label': `Load ${fmt(s.weight)} ${u}`, onclick: () => loadWeight(s.weight, s.work ? 'your working weight' : `warm-up set ${i + 1}`) })
      ]);
      list.append(li);
    });
    renderWarmProgress(all.length);
  }
  function renderWarmProgress(n) {
    const d = state.warmDone.done.length;
    $('#warm-progress').hidden = false;
    $('#warm-count').textContent = `${d} of ${n}`;
    const bar = $('#warm-bar');
    bar.setAttribute('aria-valuemax', n); bar.setAttribute('aria-valuenow', d);
    bar.firstElementChild.style.width = (n ? (d / n) * 100 : 0) + '%';
    $('#warm-reset').disabled = d === 0;
  }
  function tick(i, on, n) {
    const s = new Set(state.warmDone.done);
    on ? s.add(i) : s.delete(i);
    state.warmDone.done = [...s].sort((a, b) => a - b);
    save();
    const li = $(`#warm-sets .pm-set[data-i="${i}"]`);
    li.classList.toggle('is-done', on);
    renderWarmProgress(n);
    if (on && s.size === n) ZL.toast('All sets done. Nice work.');
    else if (on && s.size === n - 1 && !s.has(n - 1)) ZL.toast('Warm-up done. Time for your work sets.');
  }
  $('#warm-w').addEventListener('input', () => {
    const w = parseNum($('#warm-w').value);
    if (Number.isFinite(w)) { state.warm = w; save(); }
    renderWarm();
  });
  $('#warm-use').addEventListener('click', () => {
    const t = parseNum(targetInput.value);
    if (!Number.isFinite(t) || t <= 0) { ZL.toast('Set a target weight on the Load tab first', { type: 'info' }); return; }
    $('#warm-w').value = fmt(t); state.warm = t; save(); renderWarm();
    ZL.toast(`Warm-up planned for ${fmt(t)} ${U()}`);
  });
  $('#warm-reset').addEventListener('click', () => {
    const prev = state.warmDone.done.slice();
    state.warmDone.done = []; save(); renderWarm();
    ZL.toast('Ticks cleared', { action: { label: 'Undo', fn: () => { state.warmDone.done = prev; save(); renderWarm(); } } });
  });

  /* ---------- 4. Program (5/3/1) ---------- */
  function renderProgram(animate) {
    const u = U();
    const lift = state.prog.lift;
    $$('#p-lift button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lift === lift));
    const tm = parseNum($('#p-tm').value);
    const err = $('#p-error');
    const host = $('#p-table');
    host.replaceChildren();
    const tmBad = !Number.isFinite(tm) || tm < 50 || tm > 100;
    $('#p-tm').setAttribute('aria-invalid', String(tmBad));
    const badLifts = $$('.pm-lift-in').filter((i) => i.value.trim() !== '' && !(parseNum(i.value) > 0));
    $$('.pm-lift-in').forEach((i) => i.setAttribute('aria-invalid', String(badLifts.includes(i))));
    if (tmBad || badLifts.length) {
      err.textContent = tmBad ? 'Training max should be a percentage from 50 to 100. Most people use 85 or 90.' : `Enter each 1RM as a number in ${u}, or leave it blank.`;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const one = parseNum($('#p-' + lift).value);
    if (!(one > 0)) {
      host.append(el('div', { class: 'zl-empty' }, [el('h3', { text: `No ${LIFT_NAME[lift]} 1RM yet` }), el('p', { text: `Enter your ${LIFT_NAME[lift]} one-rep max above, or fill it from your log.` })]));
      return;
    }
    const plan = PM.program531(one, tm, totals());
    host.append(el('div', { class: 'pm-prog-tm' }, [
      el('span', { class: 'zl-label', text: 'Training max' }),
      el('b', { class: 'num', text: `${fmt1(plan.tm)} ${u}` }),
      el('span', { class: 'zl-hint', text: `${fmt(tm)}% of ${fmt(one)} ${u}` })
    ]));
    const grid = el('div', { class: 'pm-weeks' + (animate && !reduceMotion.matches ? ' anim' : '') });
    plan.weeks.forEach((wk, wi) => {
      const col = el('div', { class: 'pm-week' + (wi === 3 ? ' is-deload' : ''), 'data-week': wi + 1 }, [
        el('div', { class: 'pm-week-head' }, [el('b', { text: wk.name }), el('span', { text: wk.sub })])
      ]);
      wk.sets.forEach((st, si) => {
        col.append(el('button', {
          type: 'button', class: 'pm-cell', 'data-set': si + 1, 'data-w': st.weight, style: `--d:${wi * 3 + si}`,
          'aria-label': `${wk.name}, set ${si + 1}: ${fmt(st.weight)} ${u} for ${st.reps.replace('+', ' or more')} reps, ${st.pct}%. Load it.`,
          onclick: () => loadWeight(st.weight, `${wk.name.toLowerCase()} set ${si + 1}`)
        }, [
          el('span', { class: 'pm-cell-w num' }, [el('b', { text: fmt(st.weight) }), el('small', { text: ' ' + u })]),
          el('span', { class: 'pm-cell-r num', text: `× ${st.reps}` }),
          el('span', { class: 'pm-cell-p num', text: `${st.pct}%` })
        ]));
      });
      grid.append(col);
    });
    host.append(grid, el('p', { class: 'zl-hint pm-prog-note', text: 'A plus sign means as many reps as you can with good form on the last set.' }));
  }
  $$('.pm-lift-in').forEach((i) => i.addEventListener('input', () => {
    const v = parseNum(i.value);
    state.prog.lifts[i.dataset.lift] = Number.isFinite(v) ? v : null;
    save(); renderProgram(false);
  }));
  $('#p-tm').addEventListener('input', () => {
    const v = parseNum($('#p-tm').value);
    if (Number.isFinite(v)) state.prog.tm = v;
    save(); renderProgram(false);
  });
  $$('#p-lift button').forEach((b) => b.addEventListener('click', () => {
    if (state.prog.lift === b.dataset.lift) return;
    state.prog.lift = b.dataset.lift; save(); renderProgram(true);
  }));
  $('#p-fill').addEventListener('click', () => {
    const filled = [];
    for (const k in LIFT_EX) {
      const pts = PM.progression(log, LIFT_EX[k], U());
      if (!pts.length) continue;
      const best = Math.max(...pts.map((p) => p.v));
      state.prog.lifts[k] = Math.round(best * 2) / 2;
      $('#p-' + k).value = fmt(state.prog.lifts[k]);
      filled.push(LIFT_NAME[k]);
    }
    if (!filled.length) { ZL.toast('Log some squat, bench, deadlift or press sets first', { type: 'info' }); return; }
    save(); renderProgram(true);
    ZL.toast(`Filled ${filled.join(', ')} from your log`);
  });

  /* ---------- 5. Log ---------- */
  const exSel = $('#l-ex');
  let historyGroups = 6;
  function exerciseNames() {
    const set = new Set(EXERCISES);
    state.customEx.forEach((e) => set.add(e));
    log.forEach((s) => set.add(s.ex));
    return [...set];
  }
  function renderExSelect() {
    const names = exerciseNames();
    exSel.replaceChildren(...names.map((n) => el('option', { value: n, text: n })), el('option', { value: '__custom', text: 'Other exercise…' }));
    exSel.value = names.includes(state.logEx) ? state.logEx : names[0];
    $('#l-custom-wrap').hidden = exSel.value !== '__custom';
  }
  exSel.addEventListener('change', () => {
    $('#l-custom-wrap').hidden = exSel.value !== '__custom';
    if (exSel.value === '__custom') $('#l-custom').focus();
    else { state.logEx = exSel.value; save(); prefillWeight(true); }
  });
  /** Suggest the last weight used for the chosen exercise. */
  function prefillWeight(force) {
    const wIn = $('#l-w');
    if (wIn.value.trim() && !force) return;
    const last = PM.sortLog(log).reverse().find((s) => s.ex === exSel.value);
    if (last) { wIn.value = fmt1(displayW(last)); $('#l-r').value = String(last.r); }
  }
  function logPrefill(w) {
    selectTab('log');
    $('#l-w').value = fmt(w);
    $('#l-d').value = todayIso();
    $('#l-r').focus();
    $('#l-r').select();
  }
  function fieldErr(input, msg) {
    input.setAttribute('aria-invalid', 'true');
    const e = $('#l-error'); e.textContent = msg; e.hidden = false;
    input.focus();
    return false;
  }
  $('#log-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $$('#log-form .zl-input, #log-form .zl-select').forEach((i) => i.setAttribute('aria-invalid', 'false'));
    $('#l-error').hidden = true;
    let ex = exSel.value;
    if (ex === '__custom') {
      ex = $('#l-custom').value.trim().replace(/\s+/g, ' ');
      if (!ex) return fieldErr($('#l-custom'), 'Type a name for the exercise, like Pause squat.');
    }
    const w = parseNum($('#l-w').value), r = parseNum($('#l-r').value), d = $('#l-d').value;
    if (!(w > 0) || w > 1000) return fieldErr($('#l-w'), `Enter the weight in ${U()}, like ${U() === 'kg' ? '100' : '225'}.`);
    if (!Number.isInteger(r) || r < 1 || r > 30) return fieldErr($('#l-r'), 'Enter reps as a whole number from 1 to 30.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fieldErr($('#l-d'), 'Pick the date you did the set.');
    if (d > todayIso()) return fieldErr($('#l-d'), "That date is in the future. Pick today or earlier.");
    if (!EXERCISES.includes(ex) && !state.customEx.includes(ex)) state.customEx.push(ex);
    const before = PM.prIds(log);
    const entry = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ex, w, r, d, u: U(), t: Date.now() };
    log.push(entry);
    const after = PM.prIds(log);
    const isPr = after.has(entry.id) && !before.has(entry.id);
    state.logEx = ex; state.chartEx = ex;
    save(); saveLog();
    renderExSelect();
    renderLog(true, entry.id);
    $('#l-custom').value = '';
    if (isPr) ZL.toast(`New PR: ${ex}, ${fmt1(PM.e1rm(w, r))} ${U()} estimated max`);
    else ZL.toast(`Logged ${ex}, ${fmt(w)} ${U()} × ${r}`);
    $('#l-r').focus(); $('#l-r').select();
  });

  function displayW(s) { return PM.convert(s.w, s.u || 'kg', U()); }
  function renderLog(animate, newId) {
    const has = log.length > 0;
    $('#log-body').hidden = !has;
    $('#log-empty').hidden = has;
    if (!$('#l-d').value) $('#l-d').value = todayIso();
    $('#l-d').max = todayIso();
    prefillWeight(false);
    if (!has) return;
    const prs = PM.prIds(log);
    // chart exercise chips: exercises with data, most logged first
    const counts = {};
    log.forEach((s) => (counts[s.ex] = (counts[s.ex] || 0) + 1));
    const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (!names.includes(state.chartEx)) state.chartEx = names[0];
    const seg = $('#chart-ex');
    seg.replaceChildren(...names.slice(0, 5).map((n) => el('button', {
      type: 'button', 'aria-pressed': String(n === state.chartEx), text: n, 'data-ex': n,
      onclick: () => { state.chartEx = n; save(); renderLog(true); }
    })));
    if (!names.slice(0, 5).includes(state.chartEx)) seg.append(el('button', { type: 'button', 'aria-pressed': 'true', text: state.chartEx }));
    drawChart(animate, prs);

    // history
    const groups = new Map();
    PM.sortLog(log).reverse().forEach((s) => { if (!groups.has(s.d)) groups.set(s.d, []); groups.get(s.d).push(s); });
    const hist = $('#history');
    hist.replaceChildren();
    let gi = 0;
    for (const [d, sets] of groups) {
      if (gi++ >= historyGroups) break;
      const exs = [...new Set(sets.map((s) => s.ex))];
      const g = el('section', { class: 'pm-day', 'data-date': d }, [
        el('header', {}, [el('h3', { text: niceDate(d) }), el('span', { text: `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}, ${exs.join(' and ')}` })])
      ]);
      const ul = el('ul', {});
      sets.slice().reverse().forEach((s) => {
        const w = displayW(s);
        const pr = prs.has(s.id);
        ul.append(el('li', { class: 'pm-entry' + (s.id === newId ? ' is-new' : ''), 'data-id': s.id }, [
          el('span', { class: 'pm-entry-ex', text: s.ex }),
          el('span', { class: 'pm-entry-set num' }, [el('b', { text: fmt1(w) }), ` ${U()} × ${s.r}`]),
          el('span', { class: 'pm-entry-e1 num', text: `${fmt1(PM.e1rm(w, s.r))} e1RM` }),
          pr ? el('span', { class: 'zl-badge pm-pr', text: 'PR' }) : el('span', { class: 'pm-pr-gap' }),
          el('button', { type: 'button', class: 'zl-iconbtn pm-del', 'aria-label': `Delete ${s.ex} ${fmt1(w)} ${U()} × ${s.r}`, 'data-tip': 'Delete', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>', onclick: () => delSet(s.id) })
        ]));
      });
      g.append(ul);
      hist.append(g);
    }
    const more = $('#history-more');
    more.hidden = groups.size <= historyGroups;
    more.textContent = `Show older sessions (${groups.size - historyGroups} more)`;
  }
  $('#history-more').addEventListener('click', () => { historyGroups += 6; renderLog(false); });

  function drawChart(animate, prs) {
    const ex = state.chartEx;
    const pts = PM.progression(log, ex, U());
    const prDates = new Set(log.filter((s) => prs.has(s.id) && s.ex === ex).map((s) => s.d));
    pts.forEach((p) => (p.pr = prDates.has(p.d)));
    const host = $('#chart');
    const statsEl = $('#chart-stats');
    if (!pts.length) { host.replaceChildren(); statsEl.replaceChildren(); return; }
    const best = Math.max(...pts.map((p) => p.v));
    const change = pts[pts.length - 1].v - pts[0].v;
    const prCount = log.filter((s) => s.ex === ex && prs.has(s.id)).length;
    statsEl.replaceChildren(
      stat(`${fmt1(best)} ${U()}`, 'Best estimated max', 'big'),
      stat(`${change >= 0 ? '+' : '−'}${fmt1(Math.abs(change))} ${U()}`, pts.length > 1 ? `Since ${niceDate(pts[0].d)}` : 'Change', change > 0 ? 'up' : ''),
      stat(String(prCount), prCount === 1 ? 'Personal record' : 'Personal records'),
      stat(String(pts.length), pts.length === 1 ? 'Session' : 'Sessions')
    );
    if (pts.length < 2) {
      host.replaceChildren(el('div', { class: 'pm-chart-one' }, [el('p', { text: `Log ${ex.toLowerCase()} on another day to start the trend line.` })]));
      return;
    }
    PMChart.draw(host, pts, { units: U(), label: ex, animate });
  }

  function delSet(id) {
    const i = log.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [gone] = log.splice(i, 1);
    saveLog(); renderLog(false); renderExSelect();
    ZL.toast(`Deleted ${gone.ex}, ${fmt(gone.w)} ${gone.u} × ${gone.r}`, { action: { label: 'Undo', fn: () => { log.splice(i, 0, gone); saveLog(); renderLog(false, gone.id); renderExSelect(); ZL.toast('Set restored'); } } });
  }

  $('#export').addEventListener('click', () => {
    if (!log.length) { ZL.toast('Nothing to export yet', { type: 'info' }); return; }
    const blob = new Blob([PM.toCsv(log)], { type: 'text/csv' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `plate-math-log-${todayIso()}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ZL.toast(`Exported ${log.length} sets to CSV`);
  });

  async function loadExample() {
    if (log.length) {
      const ok = await ZL.confirm({ title: 'Replace your log?', body: `This swaps your ${log.length} logged ${log.length === 1 ? 'set' : 'sets'} for eight weeks of example squat and bench sessions.`, confirmLabel: 'Replace log', danger: true });
      if (!ok) return;
    }
    log = PM.exampleLog(todayIso(), U());
    state.chartEx = 'Bench press';
    historyGroups = 6;
    save(); saveLog(); renderExSelect();
    renderLog(true);
    ZL.toast(`Loaded ${log.length} example sets`, state.tab === 'log' ? {} : { action: { label: 'View log', fn: () => selectTab('log') } });
  }
  $('#example').addEventListener('click', loadExample);
  $('#log-example').addEventListener('click', loadExample);

  /* ---------- 6. Plates I own ---------- */
  function plateSvg(p) {
    const r = 22 * (p.d / 450) + 6;
    const fill = p.chrome ? '#C9CED4' : p.color;
    return `<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="${r}" fill="${fill}" class="${p.light ? 'pm-disc-lt' : ''}"/>` +
      (p.rim ? `<circle cx="28" cy="28" r="${r - 2.5}" fill="none" stroke="${p.rim}" stroke-width="2"/>` : '') +
      `<circle cx="28" cy="28" r="${Math.max(4, r * 0.32)}" class="pm-disc-hub"/><circle cx="28" cy="28" r="2.6" class="pm-disc-hole"/></svg>`;
  }
  function renderPlates() {
    const u = U();
    const rows = $('#plate-rows');
    rows.replaceChildren();
    let sum = 0, pairs = 0;
    for (const p of PM.PLATES[u]) {
      const n = eq().pairs[p.w] || 0;
      sum += n * 2 * p.w; pairs += n;
      const name = `${fmt(p.w)} ${u}`;
      rows.append(el('li', { class: 'pm-plate-row' + (n ? '' : ' is-zero'), 'data-plate': p.w }, [
        el('span', { class: 'pm-disc', html: plateSvg(p) }),
        el('span', { class: 'pm-plate-name' }, [el('b', { class: 'num', text: name }), el('small', { text: p.name })]),
        el('span', { class: 'pm-mini-step' }, [
          el('button', { type: 'button', class: 'pm-mini', 'data-d': '-1', 'aria-label': `One fewer pair of ${name} plates`, disabled: n <= 0, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>', onclick: () => changePairs(p.w, -1) }),
          el('output', { class: 'pm-count num', 'aria-live': 'polite', 'aria-label': `${name} pairs`, text: String(n) }),
          el('button', { type: 'button', class: 'pm-mini', 'data-d': '1', 'aria-label': `One more pair of ${name} plates`, disabled: n >= PM.MAX_PAIRS, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg>', onclick: () => changePairs(p.w, 1) })
        ]),
        el('span', { class: 'pm-plate-sub num', text: n ? `${fmt(n * 2 * p.w)} ${u}` : 'None' })
      ]));
    }
    const max = totals()[totals().length - 1];
    $('#plate-stats').replaceChildren(
      stat(`${fmt(max)} ${u}`, 'Heaviest you can load', 'big'),
      stat(`${fmt(sum)} ${u}`, 'Plates total'),
      stat(`${fmt(step())} ${u}`, 'Smallest step')
    );
    $('#plates-note').textContent = `A pair is one plate for each side. Up to ${PM.MAX_PAIRS} pairs of each size.`;
  }
  function changePairs(w, d) {
    const cur = eq().pairs[w] || 0;
    const next = Math.max(0, Math.min(PM.MAX_PAIRS, cur + d));
    if (next === cur) return;
    eq().pairs[w] = next;
    save(); renderPlates(); setUnitLabels(); renderCalcs(false);
    const btn = $(`.pm-plate-row[data-plate="${w}"] .pm-mini[data-d="${d}"]`);
    if (btn && !btn.disabled) btn.focus(); else $(`.pm-plate-row[data-plate="${w}"] .pm-mini[data-d="${-d}"]`).focus();
  }
  $('#reset-plates').addEventListener('click', () => {
    const prev = { ...eq().pairs };
    eq().pairs = { ...PM.DEFAULT_PAIRS[U()] };
    save(); renderPlates(); setUnitLabels(); renderCalcs(false);
    ZL.toast('Plates reset to a standard set', { action: { label: 'Undo', fn: () => { eq().pairs = prev; save(); renderPlates(); setUnitLabels(); renderCalcs(false); } } });
  });

  /* ---------- Render all ---------- */
  function syncInputs() {
    targetInput.value = fmt(state.target);
    $('#rm-w').value = fmt(state.rm.w);
    $('#rm-r').value = fmt(state.rm.r);
    rpeSel.value = String(state.rm.rpe);
    $('#warm-w').value = fmt(state.warm);
    for (const k in state.prog.lifts) $('#p-' + k).value = Number.isFinite(state.prog.lifts[k]) ? fmt(state.prog.lifts[k]) : '';
    $('#p-tm').value = fmt(state.prog.tm);
  }
  function renderCalcs(animate) {
    renderLoad(animate); renderRm(); renderWarm(); renderProgram(false);
  }
  function renderAll(animate) {
    setUnitLabels(); renderBarOpts(); renderCalcs(animate); renderPlates(); renderExSelect();
    if (state.tab === 'log') renderLog(false);
  }

  let lastW = 0;
  new ResizeObserver(() => {
    const w = barSvg.parentElement.clientWidth;
    if (Math.abs(w - lastW) < 2) return;
    lastW = w;
    renderLoad(false);
    if (state.tab === 'log' && log.length) drawChart(false, PM.prIds(log));
  }).observe($('#app .zl-app'));
  document.addEventListener('zl:theme', () => { if (state.tab === 'log' && log.length) drawChart(false, PM.prIds(log)); });

  syncInputs();
  renderCount();
  renderAll(false);
  selectTab(state.tab || 'load');
  statusEl.textContent = 'Saved';

  ZL.tour([
    { el: '#app .pm-target', title: 'Type a weight', body: 'Enter your target, or tap minus and plus. The step is one pair of your smallest plates.', before: () => selectTab('load') },
    { el: '#app .pm-bar-stage', title: 'See it on the bar', body: 'Plates slide on in competition colours, drawn to scale with the weight printed on each.', before: () => selectTab('load') },
    { el: '#app .pm-tabs', title: 'Six tools, one inventory', body: '1RM, warm-ups, 5/3/1, your log and your plates. Every number is one you can load.' },
    { el: '#rm-result', title: 'Estimate your max', body: 'Enter weight and reps, or add RPE for a sharper estimate. Load any percentage with one tap.', before: () => selectTab('rm') },
    { el: '#p-table', title: 'Run 5/3/1', body: 'Four weeks of sets from your training max, each rounded to a weight you can load. Tap a set to load it.', before: () => selectTab('program') },
    { el: '#log-form', title: 'Log every set', body: 'Track sets and watch your estimated max climb. Personal records get a badge.', before: () => selectTab('log') }
  ]);

  window.PMApp = { state: () => state, log: () => log, selectTab };
})();
