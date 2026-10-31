/* Plate Math: estimated 1RM line chart in SVG with hover, tap and keyboard tooltips. window.PMChart.draw(host, points, opts) */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function s(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const day = (iso) => new Date(iso + 'T12:00:00').getTime();
  const short = (iso) => { const d = new Date(iso + 'T12:00:00'); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => span / st <= count) || 10 * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
  }

  /** points: [{d, v, w, r, pr}] ascending by date. opts: { units, label } */
  function draw(host, points, opts) {
    const fmt1 = window.PM.fmt1, fmt = window.PM.fmt;
    host.replaceChildren();
    const W = Math.max(280, host.clientWidth || 640);
    const narrow = W < 520;
    const H = narrow ? 220 : 280;
    const m = { l: narrow ? 40 : 52, r: 16, t: 28, b: 34 };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg', role: 'img', tabindex: '0',
      'aria-label': `${opts.label}: estimated one-rep max over ${points.length} sessions, from ${fmt1(points[0].v)} to ${fmt1(points[points.length - 1].v)} ${opts.units}. Use the arrow keys to read each point.` }, host);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.appendChild(tip);

    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    const pad = Math.max(2, (hi - lo) * 0.12);
    const ticks = niceTicks(lo - pad, hi + pad, narrow ? 4 : 5);
    lo = ticks[0]; hi = ticks[ticks.length - 1];
    const t0 = day(points[0].d), t1 = day(points[points.length - 1].d);
    const X = (iso) => (t1 === t0 ? m.l + (W - m.l - m.r) / 2 : m.l + ((day(iso) - t0) / (t1 - t0)) * (W - m.l - m.r));
    const Y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);

    const defs = s('defs', {}, svg);
    const grad = s('linearGradient', { id: 'chart-fill', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    s('stop', { offset: '0', 'stop-color': 'var(--accent)', 'stop-opacity': 0.22 }, grad);
    s('stop', { offset: '1', 'stop-color': 'var(--accent)', 'stop-opacity': 0 }, grad);

    const grid = s('g', { class: 'chart-grid' }, svg);
    ticks.forEach((v, i) => {
      s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid);
      const t = s('text', { x: m.l - 10, y: Y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'chart-axis' }, grid);
      t.textContent = fmt(v);
      if (i === ticks.length - 1) {
        const u = s('text', { x: m.l + 6, y: Y(v) - 8, 'text-anchor': 'start', class: 'chart-axis chart-unit' }, grid);
        u.textContent = opts.units + ', estimated max';
      }
    });

    // x labels: about one per 80px, never overlapping
    const xg = s('g', { class: 'chart-grid' }, svg);
    const maxLabels = Math.max(2, Math.floor((W - m.l - m.r) / (narrow ? 64 : 84)));
    const every = Math.max(1, Math.ceil(points.length / maxLabels));
    let lastX = -Infinity;
    points.forEach((p, i) => {
      if (i % every !== 0 && i !== points.length - 1) return;
      const x = X(p.d);
      if (x - lastX < (narrow ? 50 : 64)) return;
      lastX = x;
      const t = s('text', { x, y: H - 10, 'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle', class: 'chart-axis' }, xg);
      t.textContent = short(p.d);
    });

    const line = points.map((p, i) => (i ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
    s('path', { d: `${line} L${X(points[points.length - 1].d).toFixed(1)} ${H - m.b} L${X(points[0].d).toFixed(1)} ${H - m.b} Z`, fill: 'url(#chart-fill)', class: 'chart-area' }, svg);
    const path = s('path', { d: line, class: 'chart-line' }, svg);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && opts.animate) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
        .finished.then(() => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; }).catch(() => {});
    }
    const cursor = s('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'chart-cursor', opacity: 0 }, svg);
    const dots = s('g', {}, svg);
    points.forEach((p, i) => {
      const c = s('circle', { cx: X(p.d), cy: Y(p.v), r: p.pr ? 5.5 : 3.5, class: 'chart-dot' + (p.pr ? ' is-pr' : ''), 'data-i': i }, dots);
      if (p.pr) s('circle', { cx: X(p.d), cy: Y(p.v), r: 9, class: 'chart-pr-ring' }, dots);
      return c;
    });
    const hot = s('circle', { r: 7, class: 'chart-hot', opacity: 0 }, svg);

    let active = -1;
    function show(i) {
      active = i;
      const p = points[i];
      const x = X(p.d), y = Y(p.v);
      cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.setAttribute('opacity', 1);
      hot.setAttribute('cx', x); hot.setAttribute('cy', y); hot.setAttribute('opacity', 1);
      tip.innerHTML = `<b>${fmt1(p.v)} ${opts.units}</b>${p.pr ? '<span class="zl-badge">PR</span>' : ''}<span>${short(p.d)}, best set ${fmt(p.w)} × ${p.r}</span>`;
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = x - tw / 2;
      left = Math.max(4, Math.min(W - tw - 4, left));
      let top = y - th - 14;
      if (top < 0) top = y + 14;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function hide() { active = -1; tip.hidden = true; cursor.setAttribute('opacity', 0); hot.setAttribute('opacity', 0); }
    function nearest(clientX) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      let bi = 0, bd = Infinity;
      points.forEach((p, i) => { const d = Math.abs(X(p.d) - x); if (d < bd) { bd = d; bi = i; } });
      return bi;
    }
    svg.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    svg.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = active < 0 ? (e.key === 'ArrowRight' ? 0 : points.length - 1) : Math.max(0, Math.min(points.length - 1, active + (e.key === 'ArrowRight' ? 1 : -1)));
        show(n);
      } else if (e.key === 'Escape') hide();
    });
    return { show, hide };
  }

  window.PMChart = { draw };
})();
