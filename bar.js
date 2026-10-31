/* Plate Math: side-on barbell drawn to scale in SVG. window.PMBar.draw(svg, opts) */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const memo = new WeakMap();

  function s(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /**
   * opts: { perSide: number[], units: 'kg'|'lb', collars: bool, animate: bool, mode?: 'full'|'side' }
   * Thickness is exaggerated by K so labels fit. Plates, collars and sleeves all use the same K, so they stay in proportion.
   */
  function draw(svg, opts) {
    const { perSide, units, collars } = opts;
    const specs = window.PM.PLATES[units];
    const spec = (w) => specs.find((p) => p.w === w);
    const width = svg.parentElement.clientWidth || 900;
    const mode = opts.mode || (width < 700 ? 'side' : 'full');
    const K = mode === 'full' ? 2.4 : 2.3;
    let sleeveLen = 415 * K;
    const stopW = 30 * K;
    const shaftHalf = mode === 'full' ? 230 : 0;
    // Show the first ~300 mm of each sleeve (room for eleven 25s); widen only if the load goes past that.
    const loadedMM = perSide.reduce((a, w) => a + ((specs.find((p) => p.w === w) || {}).t || 0), 0) + (collars ? 42 : 0);
    const visMM = Math.min(415, Math.max(300, loadedMM + 40));
    const H = 450;
    const top = -H / 2 - 30;
    const floorY = H / 2 + 4;
    if (mode === 'full') sleeveLen = visMM * K;
    const sideExtent = shaftHalf + stopW + sleeveLen + 24;
    const viewX = mode === 'full' ? -sideExtent : -80;
    const viewW = mode === 'full' ? 2 * sideExtent : shaftHalf + stopW + Math.max(320, loadedMM + 40) * K + 80;
    const viewH = floorY - top + 26;
    svg.setAttribute('viewBox', `${viewX} ${top} ${viewW} ${viewH}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.dataset.mode = mode;
    svg.replaceChildren();
    const uid = svg.id || 'bb';

    const defs = s('defs', {}, svg);
    const chrome = s('linearGradient', { id: uid + '-chrome', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    [['0', '#F1F3F5'], ['0.35', '#C8CED5'], ['0.6', '#A7B0BA'], ['1', '#808A95']].forEach(([o, c]) => s('stop', { offset: o, 'stop-color': c }, chrome));
    const shine = s('linearGradient', { id: uid + '-shine', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    [['0', '#FFFFFF', 0.28], ['0.35', '#FFFFFF', 0.06], ['0.7', '#000000', 0], ['1', '#000000', 0.22]].forEach(([o, c, a]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, shine));
    const vshade = s('linearGradient', { id: uid + '-vshade', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    [['0', '#FFFFFF', 0.16], ['0.5', '#FFFFFF', 0], ['1', '#000000', 0.18]].forEach(([o, c, a]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, vshade));
    const shadow = s('radialGradient', { id: uid + '-shadow', cx: 0.5, cy: 0.5, r: 0.5 }, defs);
    s('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': 0.28 }, shadow);
    s('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': 0 }, shadow);

    s('line', { x1: viewX, x2: viewX + viewW, y1: floorY, y2: floorY, class: 'bb-floor' }, svg);

    // Shaft with knurling
    const shaftFrom = mode === 'full' ? -shaftHalf : -80;
    s('rect', { x: shaftFrom, y: -14, width: shaftHalf - shaftFrom, height: 28, rx: 3, fill: `url(#${uid}-chrome)` }, svg);
    if (mode === 'full') {
      const g = s('g', { class: 'bb-knurl' }, svg);
      for (let x = -shaftHalf + 26; x < shaftHalf - 26; x += 8) {
        if (Math.abs(x) < 44) continue;
        s('line', { x1: x, x2: x + 5, y1: -11, y2: 11 }, g);
      }
    }

    const sides = mode === 'full' ? [1, -1] : [1];
    const prev = memo.get(svg);
    const animate = opts.animate && !reduce.matches && prev && prev.mode === mode && prev.units === units && prev.vis === svg.getAttribute('viewBox');
    const before = (prev && prev.perSide) || [];
    let common = 0;
    while (common < before.length && common < perSide.length && before[common] === perSide[common]) common++;

    let usedMM = 0;
    for (const dir of sides) {
      const sideG = s('g', { class: 'bb-side' }, svg);
      const tr = (x, w) => (dir === 1 ? x : -x - w);
      const sleeveX = shaftHalf + stopW;
      // shadow under the loaded sleeve
      s('ellipse', { cx: tr(sleeveX, sleeveLen * 0.5) + (sleeveLen * 0.25) * dir, cy: floorY + 2, rx: sleeveLen * 0.42, ry: 14, fill: `url(#${uid}-shadow)`, class: 'bb-shadow' }, sideG);
      s('rect', { x: tr(shaftHalf, stopW), y: -40, width: stopW, height: 80, rx: 5, fill: `url(#${uid}-chrome)` }, sideG);
      s('rect', { x: tr(sleeveX, sleeveLen), y: -26, width: sleeveLen, height: 52, rx: 4, fill: `url(#${uid}-chrome)` }, sideG);
      s('rect', { x: tr(sleeveX + sleeveLen - 6, 6), y: -26, width: 6, height: 52, rx: 2, class: 'bb-cap' }, sideG);

      let x = sleeveX + 1;
      usedMM = 0;
      perSide.forEach((w, i) => {
        const p = spec(w);
        if (!p) return;
        const pw = p.t * K;
        const g = s('g', { class: 'plate', 'data-w': w }, sideG);
        const px = tr(x, pw);
        const r = Math.min(7, pw / 3);
        s('rect', { x: px, y: -p.d / 2, width: pw, height: p.d, rx: r, fill: p.chrome ? `url(#${uid}-chrome)` : p.color, class: 'plate-body' + (p.light ? ' plate-light' : '') }, g);
        if (p.rim) {
          s('rect', { x: px + 2, y: -p.d / 2 + 7, width: pw - 4, height: 8, rx: 2, fill: p.rim }, g);
          s('rect', { x: px + 2, y: p.d / 2 - 15, width: pw - 4, height: 8, rx: 2, fill: p.rim }, g);
        }
        s('rect', { x: px, y: -p.d / 2, width: pw, height: p.d, rx: r, fill: `url(#${uid}-shine)`, 'pointer-events': 'none' }, g);
        s('rect', { x: px, y: -p.d / 2, width: pw, height: p.d, rx: r, fill: `url(#${uid}-vshade)`, 'pointer-events': 'none' }, g);
        const hubH = Math.min(84, p.d * 0.32);
        s('rect', { x: px + pw * 0.16, y: -hubH / 2, width: pw * 0.68, height: hubH, rx: 3, class: 'plate-hub' }, g);
        const fs = Math.max(11, Math.min(pw * 0.62, mode === 'full' ? 36 : 44));
        const cx = px + pw / 2;
        const cy = -(p.d / 2 + hubH / 2) / 2;
        const t = s('text', { x: cx, y: cy, 'font-size': fs, fill: p.text, class: 'plate-label', transform: `rotate(-90 ${cx} ${cy})`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
        t.textContent = window.PM.fmt(w);
        const t2 = s('text', { x: cx, y: -cy, 'font-size': fs * 0.72, fill: p.text, class: 'plate-label plate-unit', transform: `rotate(-90 ${cx} ${-cy})`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
        t2.textContent = p.d >= 300 ? units.toUpperCase() : '';
        if (animate && i >= common) {
          const dist = (sleeveX + sleeveLen + 60 - x) * dir;
          g.animate(
            [{ transform: `translateX(${dist}px)`, opacity: 0 }, { offset: 0.7, opacity: 1 }, { transform: 'translateX(0)', opacity: 1 }],
            { duration: 420, delay: (i - common) * 50, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' }
          );
        }
        x += pw + 1.5;
        usedMM += p.t;
      });

      if (collars) {
        const cw = 42 * K;
        const g = s('g', { class: 'collar' }, sideG);
        const cx = tr(x, cw);
        s('rect', { x: cx, y: -56, width: cw, height: 112, rx: 9, class: 'collar-body' }, g);
        s('rect', { x: cx, y: -56, width: cw, height: 112, rx: 9, fill: `url(#${uid}-vshade)` }, g);
        s('rect', { x: tr(x + cw * 0.3, cw * 0.4), y: -82, width: cw * 0.4, height: 30, rx: 6, class: 'collar-lever' }, g);
        usedMM += 42;
      }
    }

    const fmt = window.PM.fmt;
    svg.setAttribute('aria-label', perSide.length
      ? `Barbell loaded with ${perSide.map(fmt).join(', ')} ${units} on each side${collars ? ', collars on' : ''}`
      : `Empty barbell${collars ? ' with collars' : ''}`);
    memo.set(svg, { perSide: perSide.slice(), mode, units, vis: svg.getAttribute('viewBox') });
    return { overfull: usedMM > 415, mode };
  }

  window.PMBar = { draw, reset: (svg) => memo.delete(svg) };
})();
