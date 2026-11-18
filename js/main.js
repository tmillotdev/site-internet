/* =========================================================
   Timothée Millot Développement · v3 « l'étoile relie les écrans »
   - Écran 1 : le gros logo, une ligne. L'étoile du logo est le stylo.
   - Un cran (molette / swipe / touche) = un écran.
   - L'étoile file jusqu'à l'écran suivant comme une étoile filante (traînée bleue qui s'évapore)
     (qui glisse pour la rattraper), puis y joue une surprise :
       02 sur_mesure     : elle éclate en 4 éclats qui découpent un cadre ajusté au texte
       03 automatisation : comète qui balaie les tâches répétitives et révèle le titre
       04 ia             : elle sème des points qui se relient en réseau
       05 qui_je_suis    : orbite autour du titre, le cercle reste comme une signature
       06 contact        : toute la constellation du parcours s'allume (cliquable)
   - Un écran déjà vu : retour rapide, effet déjà en place.
   ========================================================= */
(function () {
  if (!window.gsap || !window.Observer) return; // sans GSAP : page classique qui défile
  gsap.registerPlugin(Observer);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = reduceMotion ? 0.01 : 1; // multiplicateur de durée
  const NS = 'http://www.w3.org/2000/svg';
  const R = n => Math.round(n * 10) / 10;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  const unit = v => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
  const pt = (x, y) => ({ x, y });
  const backOut = gsap.parseEase('back.out(3)');

  const SPEED = 1150;     // vitesse de l'étoile filante en px/s entre deux écrans
  const TAIL_MAX = 360;   // longueur max de sa traînée bleue

  const world = document.querySelector('.world');
  const ink = document.querySelector('.ink');
  const defs = ink.querySelector('defs');
  const travelPath = ink.querySelector('.ink__travel');
  const pen = document.querySelector('.pen');
  const logo = document.querySelector('.hero__logo');
  const counterNow = document.querySelector('.counter__now');
  const screens = gsap.utils.toArray('.screen');
  const N = screens.length;
  const LAST = N - 1;
  document.querySelector('.counter__total').textContent = String(N).padStart(2, '0');

  let vh = window.innerHeight, vw = window.innerWidth;
  let strokeTravel = 8, strokeFrame = 7, strokeFine = 2.4;
  let penScaleHome = 1;

  /* ---------- Petits outils SVG ---------- */
  function svg(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const fxLayer = svg('g', { class: 'fx' });
  ink.insertBefore(fxLayer, travelPath);

  // Boîte d'un élément en coordonnées « monde »
  function rel(node) {
    const r = node.getBoundingClientRect(), w = world.getBoundingClientRect();
    return { x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height };
  }
  function makeStar(parent) {
    const g = svg('g', { class: 'star' }, parent);
    svg('use', { href: '#star4', x: -22, y: -22, width: 44, height: 44 }, g);
    g.style.opacity = 0;
    return g;
  }
  function placeStar(g, x, y, s, rot, op) {
    g.setAttribute('transform', `translate(${R(x)} ${R(y)}) rotate(${R(rot || 0)}) scale(${Math.max(0.001, s).toFixed(3)})`);
    g.style.opacity = op;
  }
  const lineD = (a, b) => `M ${R(a.x)} ${R(a.y)} L ${R(b.x)} ${R(b.y)}`;
  // Courbe douce passant par tous les points (Catmull-Rom → Bézier), découpée en segments
  function smoothSegs(P) {
    const segs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      segs.push(`C ${R(p1.x + (p2.x - p0.x) / 6)} ${R(p1.y + (p2.y - p0.y) / 6)} ${R(p2.x - (p3.x - p1.x) / 6)} ${R(p2.y - (p3.y - p1.y) / 6)} ${R(p2.x)} ${R(p2.y)}`);
    }
    return segs;
  }
  function makeRnd(s) { return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; }; }

  function penAt(path, len) {
    const p = path.getPointAtLength(clamp(0.01, path.getTotalLength(), len));
    gsap.set(pen, { x: p.x, y: p.y });
  }
  const penOn = p => gsap.set(pen, { x: p.x, y: p.y });

  // Centre de l'étoile du logo (coordonnées « monde ») et sa taille
  function logoStar() {
    const r = logo.getBoundingClientRect();
    const wr = world.getBoundingClientRect();
    const k = r.width / 707.28;
    return { x: r.left - wr.left + (292 - 11) * k, y: r.top - wr.top + (50 - 4) * k, size: 44 * k };
  }

  /* =========================================================
     Les effets. Chacun expose :
       in / inDir   : où l'étoile arrive (et de quelle direction)
       out / outDir : où elle se repose ensuite (et par où elle repart)
       layout()     : calcule la géométrie
       reset()      : état « pas encore joué »
       done()       : état final (écran déjà vu)
       play(tl, at) : ajoute l'animation à la timeline, renvoie sa durée
       textAt       : moment (fraction de la durée) où le texte apparaît
     ========================================================= */

  /* ---------- 01 · Accueil ---------- */
  function fxHome() {
    const self = {
      home: true, textAt: 0,
      layout() { const s = logoStar(); self.in = self.out = pt(s.x, s.y); self.inDir = self.outDir = [0, 1]; },
      reset() {}, done() {}, play() { return 0; }
    };
    return self;
  }

  /* ---------- 02 · Sur mesure : éclats + cadre qui se resserre en repères de coupe ---------- */
  function fxFrame(screen) {
    const scene = screen.querySelector('.scene');
    const g = svg('g', { class: 'fx-frame' }, fxLayer);
    const sides = [0, 1, 2, 3].map(() => svg('path', { class: 'fx-line' }, g));
    const shards = [0, 1, 2, 3].map(() => makeStar(g));
    const st = { split: 0, draw: 0, tight: 0, merge: 0 };
    let box, padO = 60, padT = 16, mark = 40;
    const corners = pad => [
      pt(box.x - pad, box.y - pad), pt(box.x + box.w + pad, box.y - pad),
      pt(box.x + box.w + pad, box.y + box.h + pad), pt(box.x - pad, box.y + box.h + pad)
    ];
    function render() {
      const C = corners(lerp(padO, padT, st.tight)), CO = corners(padO);
      sides.forEach((p, i) => {
        const a = C[i], b = C[(i + 1) % 4];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        p.setAttribute('d', lineD(a, b));
        p.style.strokeWidth = strokeFrame;
        if (st.tight > 0) {
          const m = lerp(len / 2, Math.min(mark, len / 2), st.tight);
          p.style.strokeDasharray = `${R(m)} ${R(Math.max(0, len - 2 * m))} ${R(m)} 0`;
        } else {
          p.style.strokeDasharray = `${R(st.draw * len)} ${R(len * 2)}`;
        }
        p.style.visibility = st.draw > 0.002 ? 'visible' : 'hidden';
      });
      const vis = st.split > 0 && st.merge < 1;
      shards.forEach((s, i) => {
        const a = C[i], b = C[(i + 1) % 4];
        let x, y;
        if (st.draw <= 0) { x = lerp(CO[0].x, CO[i].x, st.split); y = lerp(CO[0].y, CO[i].y, st.split); }
        else { x = lerp(a.x, b.x, st.draw); y = lerp(a.y, b.y, st.draw); }
        if (st.merge > 0) { x = lerp(x, C[2].x, st.merge); y = lerp(y, C[2].y, st.merge); }
        placeStar(s, x, y, 0.62 * (1 - 0.4 * st.merge), 360 * st.split + 180 * st.draw + 90 * st.tight, vis ? 1 : 0);
      });
    }
    const self = {
      textAt: 0.45,
      layout() {
        box = rel(scene);
        padO = clamp(36, 90, vw * 0.05);
        padT = clamp(10, 22, vw * 0.012);
        mark = clamp(26, 72, vw * 0.04);
        const C = corners(padO), CT = corners(padT);
        self.in = C[0]; self.inDir = [-1, -0.7];
        self.out = CT[2]; self.outDir = [0.5, 1];
        render();
      },
      reset() { Object.assign(st, { split: 0, draw: 0, tight: 0, merge: 0 }); render(); },
      done() { Object.assign(st, { split: 1, draw: 1, tight: 1, merge: 1 }); render(); },
      play(tl, at) {
        tl.set(pen, { autoAlpha: 0 }, at + 0.02 * D);
        tl.to(st, { split: 1, duration: 0.35 * D, ease: 'power2.out', onUpdate: render }, at);
        tl.to(st, { draw: 1, duration: 0.6 * D, ease: 'power1.inOut', onUpdate: render }, at + 0.35 * D);
        tl.to(st, { tight: 1, duration: 0.55 * D, ease: 'power3.inOut', onUpdate: render }, at + 0.95 * D);
        tl.to(st, { merge: 1, duration: 0.3 * D, ease: 'power2.in', onUpdate: render }, at + 1.5 * D);
        tl.set(pen, { x: self.out.x, y: self.out.y, autoAlpha: 1 }, at + 1.8 * D);
        tl.fromTo(pen, { scale: 0.4 }, { scale: 1, duration: 0.4 * D, ease: 'back.out(3)', immediateRender: false }, at + 1.8 * D);
        return 1.8 * D;
      }
    };
    return self;
  }

  /* ---------- 03 · Automatisation : comète qui balaie les tâches répétitives ---------- */
  function fxComet(screen, idx) {
    const scene = screen.querySelector('.scene');
    const title = scene.querySelector('.fx-title');
    const chores = scene.querySelector('.chores');
    const grad = svg('linearGradient', { id: 'comet' + idx, gradientUnits: 'userSpaceOnUse' }, defs);
    svg('stop', { offset: '0', 'stop-color': '#2F5BFF', 'stop-opacity': '0' }, grad);
    svg('stop', { offset: '0.65', 'stop-color': '#2F5BFF', 'stop-opacity': '0.45' }, grad);
    svg('stop', { offset: '1', 'stop-color': '#2F5BFF', 'stop-opacity': '1' }, grad);
    const tail = svg('path', { class: 'fx-comet', stroke: `url(#comet${idx})` }, fxLayer);
    const st = { d: 0, fade: 0 };
    let len = 1, tailLen = 200, tBox, cBox;
    function render(movePen) {
      const p = tail.getPointAtLength(clamp(0.01, len, st.d));
      if (movePen) gsap.set(pen, { x: p.x, y: p.y });
      const tp = clamp01((p.x - tBox.x) / tBox.w) * 100;
      const cp = clamp01((p.x - cBox.x) / cBox.w) * 100;
      title.style.clipPath = `inset(-30% ${R(100 - tp)}% -30% -5%)`;
      title.style.visibility = tp > 0 ? 'visible' : 'hidden';
      chores.style.clipPath = `inset(0 0 0 ${R(cp)}%)`;
      const vis = Math.min(st.d, tailLen);
      tail.style.strokeDasharray = `${R(Math.max(vis, 0.01))} ${R(len * 3)}`;
      tail.style.strokeDashoffset = R(-(st.d - vis));
      tail.style.opacity = st.d > 1 ? 1 - st.fade : 0;
      const q = tail.getPointAtLength(Math.max(0.01, st.d - vis));
      grad.setAttribute('x1', R(q.x)); grad.setAttribute('y1', R(q.y));
      grad.setAttribute('x2', R(p.x + 0.1)); grad.setAttribute('y2', R(p.y));
    }
    const self = {
      textAt: 0.8,
      layout() {
        const box = rel(scene);
        tBox = rel(title); cBox = rel(chores);
        const a = pt(Math.max(16, box.x - 80), box.y + box.h * 0.3);
        const b = pt(Math.min(vw - 16, box.x + box.w + 90), box.y + box.h * 0.66);
        const w = b.x - a.x;
        tail.setAttribute('d', `M ${R(a.x)} ${R(a.y)} C ${R(a.x + w * 0.35)} ${R(a.y - box.h * 0.4)} ${R(b.x - w * 0.35)} ${R(b.y + box.h * 0.4)} ${R(b.x)} ${R(b.y)}`);
        len = tail.getTotalLength();
        tailLen = Math.min(420, len * 0.42);
        tail.style.strokeWidth = strokeTravel * 1.25;
        self.in = a; self.inDir = [-1, -0.5];
        self.out = b; self.outDir = [0.3, 1];
        render(false);
      },
      reset() { st.d = 0; st.fade = 0; render(false); },
      done() { st.d = len; st.fade = 1; render(false); },
      play(tl, at) {
        const dur = clamp(0.9, 1.4, len / (SPEED * 1.5)) * D;
        tl.to(st, { d: len, duration: dur, ease: 'power1.in', onUpdate: () => render(true) }, at);
        tl.to(pen, { rotation: '+=540', duration: dur, ease: 'power1.in' }, at);
        tl.to(st, { fade: 1, duration: 0.5 * D, ease: 'power1.out', onUpdate: () => render(false) }, at + dur);
        return dur;
      }
    };
    return self;
  }

  /* ---------- 04 · IA : des points semés autour du titre, reliés en réseau ---------- */
  function fxNetwork(screen, idx) {
    const scene = screen.querySelector('.scene');
    const g = svg('g', { class: 'fx-net' }, fxLayer);
    const guide = svg('path', { class: 'fx-guide' }, g);
    const edgesG = svg('g', {}, g), dotsG = svg('g', {}, g);
    const K = 8;
    const dots = Array.from({ length: K }, (_, k) => svg('circle', { class: k % 3 === 1 ? 'fx-dot fx-dot--blue' : 'fx-dot', r: 0 }, dotsG));
    const pairs = [];
    for (let k = 0; k < K - 1; k++) pairs.push([k, k + 1, 'seq']);
    [[0, 2], [2, 4], [4, 6], [1, 3], [5, 7], [7, 0]].forEach(([a, b]) => pairs.push([a, b, 'chord']));
    const edges = pairs.map(([a, b, kind]) => ({ a, b, kind, len: 1, el: svg('path', { class: 'fx-edge' }, edgesG) }));
    const LAG = 170;
    let P = [], cum = [], total = 1, r0 = 6;
    const st = { d: 0, links: 0 };
    function render(movePen) {
      if (movePen) penAt(guide, Math.min(st.d, total));
      dots.forEach((c, k) => {
        const t = clamp01((st.d - cum[k]) / 50);
        c.setAttribute('r', R(r0 * (t > 0 ? backOut(t) : 0)));
      });
      edges.forEach(e => {
        const t = e.skip ? 0 : e.kind === 'seq' ? clamp01((st.d - cum[e.b]) / LAG) : st.links;
        e.el.style.strokeDasharray = `${R(e.len * t)} ${R(e.len * 2)}`;
        e.el.style.visibility = t > 0.002 ? 'visible' : 'hidden';
      });
    }
    const self = {
      textAt: 0.25,
      layout() {
        const box = rel(scene);
        const pad = clamp(28, 70, vw * 0.04);
        const L = box.x - pad, T = box.y - pad, W = box.w + 2 * pad, H = box.h + 2 * pad;
        const rnd = makeRnd(17 + idx);
        const base = [[0, 0.2], [0.28, 0], [0.6, -0.03], [1, 0.08], [1.02, 0.58], [0.76, 1], [0.42, 1.04], [0.06, 0.9]];
        P = base.map(([u, v]) => pt(clamp(16, vw - 16, L + u * W + rnd() * W * 0.03), T + v * H + rnd() * 14));
        const segs = smoothSegs(P);
        cum = [0];
        segs.forEach((s, i) => {
          guide.setAttribute('d', `M ${R(P[i].x)} ${R(P[i].y)} ${s}`);
          cum.push(cum[i] + guide.getTotalLength());
        });
        guide.setAttribute('d', `M ${R(P[0].x)} ${R(P[0].y)} ${segs.join(' ')}`);
        total = cum[K - 1];
        r0 = clamp(4, 7.5, vw * 0.0045);
        dots.forEach((c, k) => { c.setAttribute('cx', R(P[k].x)); c.setAttribute('cy', R(P[k].y)); });
        edges.forEach(e => {
          e.el.setAttribute('d', lineD(P[e.a], P[e.b]));
          e.len = Math.hypot(P[e.b].x - P[e.a].x, P[e.b].y - P[e.a].y);
          e.el.style.strokeWidth = strokeFine;
          // une corde qui traverserait le texte n'est pas tracée
          e.skip = e.kind === 'chord' && [0.25, 0.5, 0.75].some(t => {
            const x = lerp(P[e.a].x, P[e.b].x, t), y = lerp(P[e.a].y, P[e.b].y, t);
            return x > box.x - 6 && x < box.x + box.w + 6 && y > box.y - 6 && y < box.y + box.h + 6;
          });
        });
        self.in = P[0]; self.inDir = [-1, -0.6];
        self.out = P[K - 1]; self.outDir = [-0.4, 1];
        render(false);
      },
      reset() { st.d = 0; st.links = 0; render(false); },
      done() { st.d = total + LAG; st.links = 1; render(false); },
      play(tl, at) {
        const dur = clamp(1.1, 1.8, total / (SPEED * 2)) * D;
        tl.to(st, { d: total + LAG, duration: dur, ease: 'none', onUpdate: () => render(true) }, at);
        tl.to(pen, { rotation: '+=360', duration: dur, ease: 'none' }, at);
        tl.to(st, { links: 1, duration: 0.6 * D, ease: 'power2.out', onUpdate: () => render(false) }, at + dur * 0.8);
        return dur + 0.4 * D;
      }
    };
    return self;
  }

  /* ---------- 05 · Qui je suis : une orbite autour du titre ---------- */
  function fxOrbit(screen) {
    const scene = screen.querySelector('.scene');
    const path = svg('path', { class: 'fx-orbit' }, fxLayer);
    const st = { p: 0 };
    let len = 1;
    function render(movePen) {
      const l = len * st.p;
      path.style.strokeDasharray = `${R(l)} ${R(len * 2)}`;
      path.style.visibility = l > 0.5 ? 'visible' : 'hidden';
      if (movePen) penAt(path, l);
    }
    const self = {
      textAt: 0.2,
      layout() {
        const box = rel(scene);
        const c = pt(box.x + box.w / 2, box.y + box.h / 2);
        const pad = clamp(40, 110, vw * 0.06);
        const rx = Math.min(box.w / 2 + pad, vw / 2 - 18);
        const ry = Math.min(box.h / 2 + pad * 0.75, vh / 2 - 18);
        const tilt = -6 * Math.PI / 180, turns = 1.1, n = 200;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * turns, a = Math.PI + t * 2 * Math.PI, gr = 1 + 0.05 * t;
          const x0 = rx * gr * Math.cos(a), y0 = ry * gr * Math.sin(a);
          pts.push(pt(c.x + x0 * Math.cos(tilt) - y0 * Math.sin(tilt), c.y + x0 * Math.sin(tilt) + y0 * Math.cos(tilt)));
        }
        path.setAttribute('d', 'M ' + pts.map(p => `${R(p.x)} ${R(p.y)}`).join(' L '));
        path.style.strokeWidth = strokeFine * 1.3;
        len = path.getTotalLength();
        self.in = pts[0]; self.inDir = [-1, -0.7];
        self.out = pts[n]; self.outDir = [-0.6, 1];
        render(false);
      },
      reset() { st.p = 0; render(false); },
      done() { st.p = 1; render(false); },
      play(tl, at) {
        const dur = 1.6 * D;
        tl.to(st, { p: 1, duration: dur, ease: 'power1.inOut', onUpdate: () => render(true) }, at);
        tl.to(pen, { rotation: '+=360', duration: dur, ease: 'power1.inOut' }, at);
        return dur;
      }
    };
    return self;
  }

  /* ---------- 06 · Contact : la constellation du parcours ---------- */
  function fxConstellation(screen, idx) {
    const scene = screen.querySelector('.scene');
    const g = svg('g', { class: 'fx-const' }, fxLayer);
    const link = svg('path', { class: 'fx-link' }, g);
    const names = screens.map((s, i) => {
      const k = s.querySelector('.scene__key');
      return k ? k.textContent.trim() : (i === 0 ? 'accueil' : '');
    });
    const stars = names.map((_, i) => {
      if (i === idx) return null;
      const s = makeStar(g);
      s.addEventListener('click', () => goTo(i));
      return s;
    });
    const labels = names.map((name, i) => {
      const t = svg('text', { class: 'fx-label' + (i === idx ? ' is-here' : ''), 'text-anchor': 'middle' }, g);
      t.textContent = name;
      t.addEventListener('click', () => goTo(i));
      return t;
    });
    const st = { p: 0 };
    let P = [], cl = [], len = 1;
    function render() {
      const L = st.p * len;
      link.style.strokeDasharray = `${R(L)} ${R(len * 2)}`;
      link.style.visibility = L > 0.5 ? 'visible' : 'hidden';
      names.forEach((_, i) => {
        const t = i === idx ? clamp01(st.p * 6) : clamp01((L - cl[i]) / 60);
        if (stars[i]) placeStar(stars[i], P[i].x, P[i].y, 0.42 * backOut(t), 45 * t, t > 0 ? 1 : 0);
        labels[i].style.opacity = t;
        labels[i].style.pointerEvents = t > 0.5 ? 'auto' : 'none';
      });
    }
    const self = {
      textAt: 0.3,
      layout() {
        const sBox = rel(screen), box = rel(scene);
        const top = sBox.y + Math.max(46, vh * 0.1);
        const bot = Math.max(top + 50, box.y - 50);
        const ys = [0.55, 0.12, 0.7, 0.22, 0.88, 0.4];
        P = names.map((_, i) => pt(vw * (0.1 + 0.8 * i / Math.max(1, N - 1)), lerp(top, bot, ys[i % ys.length])));
        // le lien part du point « contact » et remonte le parcours
        const order = names.map((_, i) => i).sort((a, b) => Math.abs(a - idx) - Math.abs(b - idx));
        let d = `M ${R(P[order[0]].x)} ${R(P[order[0]].y)}`;
        cl = [];
        cl[order[0]] = 0;
        for (let k = 1; k < order.length; k++) {
          const a = P[order[k - 1]], b = P[order[k]];
          d += ` L ${R(b.x)} ${R(b.y)}`;
          cl[order[k]] = cl[order[k - 1]] + Math.hypot(b.x - a.x, b.y - a.y);
        }
        link.setAttribute('d', d);
        link.style.strokeWidth = Math.max(1.2, strokeFine * 0.7);
        len = link.getTotalLength();
        labels.forEach((t, i) => { t.setAttribute('x', R(P[i].x)); t.setAttribute('y', R(P[i].y + (i === idx ? 40 : 28))); });
        self.in = self.out = P[idx]; self.inDir = [-0.3, -1]; self.outDir = [0.3, -1];
        render();
      },
      reset() { st.p = 0; render(); },
      done() { st.p = 1; render(); },
      play(tl, at) {
        tl.fromTo(pen, { scale: 1 }, { scale: 1.5, duration: 0.22 * D, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false }, at);
        tl.to(pen, { rotation: '+=90', duration: 0.44 * D, ease: 'power2.out' }, at);
        tl.to(st, { p: 1, duration: 0.95 * D, ease: 'power2.inOut', onUpdate: render }, at + 0.12 * D);
        return 1.1 * D;
      }
    };
    return self;
  }

  const FACTORIES = { home: fxHome, frame: fxFrame, comet: fxComet, network: fxNetwork, orbit: fxOrbit, constellation: fxConstellation };
  const fxs = screens.map((s, i) => (FACTORIES[s.dataset.fx] || fxHome)(s, i));

  /* ---------- L'étoile filante : une traînée bleue courte qui s'évapore ---------- */
  let travelLen = 0, tailLen = 200;
  const tGrad = svg('linearGradient', { id: 'travelGrad', gradientUnits: 'userSpaceOnUse' }, defs);
  svg('stop', { offset: '0', 'stop-color': '#2F5BFF', 'stop-opacity': '0' }, tGrad);
  svg('stop', { offset: '0.6', 'stop-color': '#2F5BFF', 'stop-opacity': '0.35' }, tGrad);
  svg('stop', { offset: '1', 'stop-color': '#2F5BFF', 'stop-opacity': '0.95' }, tGrad);
  travelPath.style.stroke = 'url(#travelGrad)';
  function setTravel(d) {
    travelPath.setAttribute('d', d);
    travelPath.style.strokeWidth = strokeTravel;
    travelLen = travelPath.getTotalLength();
    tailLen = Math.min(TAIL_MAX, travelLen * 0.45);
  }
  // Une courbe de Bézier entre P0 et P3, qui part dans la direction e et arrive depuis la direction o
  function cubic(P0, P3, e, o) {
    const dist = clamp(160, 480, Math.hypot(P3.x - P0.x, P3.y - P0.y) * 0.4);
    const [ex, ey] = unit(e), [ox, oy] = unit(o);
    return `M ${R(P0.x)} ${R(P0.y)} C ${R(P0.x + ex * dist)} ${R(P0.y + ey * dist)} ${R(P3.x + ox * dist)} ${R(P3.y + oy * dist)} ${R(P3.x)} ${R(P3.y)}`;
  }
  // Autour du logo par la droite : de l'étoile vers un point P, ou l'inverse
  function aroundLogo(star, P, dirOut, toStar) {
    const lr = logo.getBoundingClientRect(), wr = world.getBoundingClientRect();
    const Rx = Math.min(lr.right - wr.left + 70, vw - 24);
    const [ox, oy] = unit(dirOut);
    const dist = clamp(160, 420, Math.abs(P.y - star.y) * 0.3);
    const E = { x: Rx, y: star.y + 90 };
    const mid = star.y + (P.y - star.y) * 0.35;
    if (!toStar) {
      return [`M ${R(star.x)} ${R(star.y)}`,
        `C ${R(star.x + 30)} ${R(star.y - 100)} ${R(Rx + 20)} ${R(star.y - 80)} ${R(E.x)} ${R(E.y)}`,
        `C ${R(Rx - 10)} ${R(mid)} ${R(P.x + ox * dist)} ${R(P.y + oy * dist)} ${R(P.x)} ${R(P.y)}`].join(' ');
    }
    return [`M ${R(P.x)} ${R(P.y)}`,
      `C ${R(P.x + ox * dist)} ${R(P.y + oy * dist)} ${R(Rx - 10)} ${R(mid)} ${R(E.x)} ${R(E.y)}`,
      `C ${R(Rx + 20)} ${R(star.y - 80)} ${R(star.x + 30)} ${R(star.y - 100)} ${R(star.x)} ${R(star.y)}`].join(' ');
  }
  const upDir = p => [p.x > vw / 2 ? 1 : -1, -0.45];

  const run = { d: 0 };
  const trail = { tail: 0 };
  function renderTrail() {
    const head = Math.min(run.d, travelLen);
    const from = Math.min(head, Math.max(trail.tail, head - tailLen));
    const vis = head - from;
    travelPath.style.visibility = vis < 0.5 ? 'hidden' : 'visible';
    travelPath.style.strokeDasharray = `${R(vis)} ${R(travelLen * 3)}`;
    travelPath.style.strokeDashoffset = R(-from);
    const a = travelPath.getPointAtLength(Math.max(0.01, from)), b = travelPath.getPointAtLength(Math.max(0.02, head));
    tGrad.setAttribute('x1', R(a.x)); tGrad.setAttribute('y1', R(a.y));
    tGrad.setAttribute('x2', R(b.x + 0.1)); tGrad.setAttribute('y2', R(b.y));
  }
  function renderRun() { renderTrail(); penAt(travelPath, Math.min(run.d, travelLen)); }

  /* ---------- Mise en page ---------- */
  function layout() {
    vh = window.innerHeight; vw = window.innerWidth;
    strokeTravel = clamp(5, 10, vw * 0.0062);
    strokeFrame = strokeTravel * 0.85;
    strokeFine = clamp(1.6, 3, vw * 0.0018);
    screens.forEach(s => { s.style.height = vh + 'px'; });
    ink.style.height = N * vh + 'px';
    const star = logoStar();
    penScaleHome = star.size / (parseFloat(getComputedStyle(pen).width) || 46);
    fxs.forEach(f => f.layout());
  }

  /* ---------- Textes ---------- */
  const reveals = s => gsap.utils.toArray(s.querySelectorAll('.reveal'));
  function textIn(screen, at, tl, fast) {
    tl.fromTo(reveals(screen),
      { autoAlpha: 0, y: fast ? 24 : 36, clipPath: 'inset(0 100% 0 0)' },
      { autoAlpha: 1, y: 0, clipPath: 'inset(0 0% 0 0)', duration: (fast ? 0.45 : 0.9) * D, stagger: (fast ? 0.05 : 0.08) * D, ease: 'power3.out', immediateRender: false },
      at);
  }

  /* ---------- Navigation ---------- */
  let current = 0;
  let busy = false;
  const visited = new Set([0]);
  const updateCounter = i => { counterNow.textContent = String(i + 1).padStart(2, '0'); };

  function goTo(next) {
    next = clamp(0, LAST, next);
    if (busy || next === current) return;
    busy = true;

    const dir = next > current ? 1 : -1;
    const A = fxs[current], B = fxs[next];
    const from = current;
    gsap.killTweensOf(reveals(screens[next]));
    gsap.set(pen, { autoAlpha: 1 });

    // Écran déjà découvert : glissement rapide, effet déjà en place
    if (visited.has(next)) {
      B.done();
      gsap.set(reveals(screens[next]), { autoAlpha: 0 });
      const P = B.out;
      const q = gsap.timeline();
      q.add(() => { current = next; busy = false; gsap.set(reveals(screens[from]), { autoAlpha: 0 }); }, 0.45 * D);
      q.to(world, { y: -next * vh, duration: 0.45 * D, ease: 'power3.inOut' }, 0);
      q.to(pen, { x: P.x, y: P.y, rotation: '+=' + 90 * dir, scale: B.home ? penScaleHome : 1, duration: 0.45 * D, ease: 'power3.inOut' }, 0);
      q.add(() => updateCounter(next), 0.25 * D);
      textIn(screens[next], 0.25 * D, q, true);
      return;
    }

    // Première découverte. En avançant, l'effet se joue ; en remontant (après un saut), il est déjà en place.
    const play = dir > 0 && !B.home;
    if (play) B.reset(); else B.done();
    gsap.set(reveals(screens[next]), { autoAlpha: 0 });

    const target = play ? B.in : B.out;
    if (A.home) setTravel(aroundLogo(A.out, target, play ? B.inDir : B.outDir, false));
    else if (B.home) setTravel(aroundLogo(B.out, A.out, upDir(A.out), true));
    else setTravel(cubic(A.out, target, dir > 0 ? A.outDir : upDir(A.out), play ? B.inDir : B.outDir));
    run.d = 0; trail.tail = 0;

    const T = Math.max(0.55, travelLen / SPEED) * D;
    const tl = gsap.timeline({ onComplete: () => { travelPath.style.visibility = 'hidden'; } });

    // 1 · l'étoile file vers l'écran suivant, traînée bleue derrière elle
    tl.to(run, { d: travelLen, duration: T, ease: 'power1.inOut', onUpdate: renderRun }, 0);
    tl.to(pen, { rotation: '+=' + 360 * dir, duration: T, ease: 'power1.inOut' }, 0);
    if (A.home) tl.fromTo(pen, { scale: penScaleHome }, { scale: 1, duration: T, ease: 'none' }, 0);
    if (B.home) tl.to(pen, { scale: penScaleHome, duration: T, ease: 'none' }, 0);

    // 2 · l'écran descend après elle et l'a rattrapée quand elle arrive
    tl.to(world, { y: -next * vh, duration: 0.8 * T, ease: 'power2.inOut' }, 0.15 * T);
    tl.add(() => updateCounter(next), T);

    // 3 · la surprise de l'écran
    const Tf = play ? B.play(tl, T) : 0;
    textIn(screens[next], play ? T + B.textAt * Tf : 0.8 * T, tl);

    // 4 · la traînée s'évapore dès l'arrivée
    tl.fromTo(trail, { tail: Math.max(0, travelLen - tailLen) }, { tail: travelLen, duration: 0.35 * D, ease: 'power2.out', onUpdate: renderTrail, immediateRender: false }, T);
    tl.add(() => {
      current = next; busy = false;
      visited.add(next);
      gsap.set(reveals(screens[from]), { autoAlpha: 0 });
    }, T + Tf + 0.3 * D);
  }

  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  Observer.create({
    target: window,
    type: 'wheel,touch',
    wheelSpeed: -1,
    tolerance: 12,
    preventDefault: true,
    onDown: prev,
    onUp: next
  });

  window.addEventListener('keydown', e => {
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(LAST); }
  });

  const hint = document.querySelector('.scroll-hint');
  if (hint) { hint.style.cursor = 'pointer'; hint.addEventListener('click', next); }

  // Redimensionnement : on recalcule tout, chaque effet reprend son état
  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (busy) return;
      layout();
      gsap.set(world, { y: -current * vh });
      fxs.forEach((f, i) => (visited.has(i) ? f.done() : f.reset()));
      penOn(fxs[current].out);
      gsap.set(pen, { scale: current === 0 ? penScaleHome : 1, autoAlpha: 1 });
    }, 150);
  });

  /* ---------- Démarrage : le logo apparaît, son étoile est le stylo ---------- */
  screens.forEach(s => gsap.set(reveals(s), { autoAlpha: 0 }));
  gsap.set(logo, { autoAlpha: 0 });
  gsap.set(pen, { autoAlpha: 0 });
  updateCounter(0);

  function start() {
    layout();
    gsap.set(world, { y: 0 });
    penOn(fxs[0].out);
    gsap.set(pen, { scale: 0, rotation: 0, autoAlpha: 1 });
    const intro = gsap.timeline();
    intro
      .fromTo(logo, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9 * D, ease: 'power3.out' }, 0)
      .to(pen, { scale: penScaleHome, rotation: 90, duration: 0.7 * D, ease: 'back.out(2)' }, 0.5 * D);
    textIn(screens[0], 1.0 * D, intro);
  }
  const logoReady = logo.complete ? Promise.resolve() : new Promise(r => { logo.onload = r; logo.onerror = r; });
  Promise.all([document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(), logoReady]).then(start);

  // Pour tester : window.tmGoTo(3)
  window.tmGoTo = goTo;
  window.tmBusy = () => busy;
})();
