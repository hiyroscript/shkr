/* ---- backdrops.js ---- */
/* ============================================================================
   BACKDROPS — the "terrain background" layer of every world. Each world gets
   five looping parallax strips of solid fog-grey silhouettes, pre-rendered
   once: farther strips are paler, softer and sink into a baked mist band.
   A generator draws one element with its base at (0,0), y pointing UP, in
   world units; F() fills the current path with the layer's flat tone, K() a
   slightly darker shade of it and Wt() a slightly lighter one.
   ========================================================================== */
const BACKDROPS = (function () {
  "use strict";
  const TAU = Math.PI * 2;
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  let c, F, K, Wt, r;                      /* context, layer tone, darker shade, lighter shade, rng */
  const R = function (x, y, w, h) { c.beginPath(); c.rect(x, y, w, h); };
  const P = function (pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); };
  const C = function (x, y, rad) { c.beginPath(); c.arc(x, y, rad, 0, TAU); };
  const Ln = function (pts, w) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = w || .06; c.stroke(); };
  const rr = function (a, b) { return a + r() * (b - a); };

  /* a sagging cable from (x0, y0) to (x1, y1), sag in units at mid-span; returns the curve as t -> [x, y] */
  const sag = function (x0, y0, x1, y1, s, w) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 2 * s;
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.lineWidth = w; c.stroke();
    return function (t) { const u = 1 - t; return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]; };
  };

  /* name: [fn, gapMin, gapMax, anchor, link]  anchor g=ground, t=hangs from top, s=floats in sky.
     link (optional): fn(A, B) draws what joins two neighbouring items, in strip units (x along the strip, y up from the
     baseline). A and B are { x, sm, a }: the item's place, its size multiplier and whatever its fn returned. */
  const G = {
    peaks: [function () { const w = rr(9, 16), h = rr(5, 10); P([-w / 2, 0, -w * .12, h, 0, h * .86, w * .14, h * .97, w / 2, 0]); F(); P([-w * .12, h, -w * .2, h * .72, -w * .08, h * .8, 0, h * .66, w * .07, h * .82, w * .14, h * .97, 0, h * .86]); Wt(); }, 4, 9, "g"],
    pines: [function () { const h = rr(4, 8), w = h * .3; R(-.12, 0, .24, h * .3); K(); for (let i = 0; i < 4; i++) { const y = h * (.18 + i * .2), ww = w * (1 - i * .2); c.beginPath(); c.moveTo(-ww, y); c.quadraticCurveTo(-ww * .38, y + h * .07, 0, y + h * .34); c.quadraticCurveTo(ww * .38, y + h * .07, ww, y); c.quadraticCurveTo(0, y - h * .05, -ww, y); F(); } }, 1.2, 4, "g"],
    icepines: [function () { const h = rr(4, 7.5), w = h * .28; R(-.1, 0, .2, h * .3); K(); for (let i = 0; i < 4; i++) { const y = h * (.18 + i * .2), ww = w * (1 - i * .2); P([-ww, y, 0, y + h * .34, ww, y]); F(); P([-ww * .5, y + h * .17, 0, y + h * .34, ww * .5, y + h * .17, ww * .2, y + h * .13, 0, y + h * .19, -ww * .25, y + h * .12]); Wt(); } }, 1.5, 4.5, "g"],
    towers: [function () { const h = rr(7, 14), w = rr(2, 3.6); R(-w / 2, 0, w, h); F(); R(-w * .3, h, w * .6, .5); F(); Ln([0, h + .5, 0, h + rr(1, 2.6)]); for (let y = 1; y < h - .6; y += 1.1) for (let x = -w / 2 + .35; x < w / 2 - .4; x += .7) if (r() < .45) { R(x, y, .3, .5); Wt(); } }, .3, 2.5, "g"],
    city: [function () { const h = rr(3.5, 8), w = rr(2.4, 4.4); R(-w / 2, 0, w, h); F(); if (r() < .5) { R(-w * .3, h, .9, .7); K(); Ln([-w * .3 + .45, h + .7, -w * .3 + .45, h + 1.5]); } else { R(w * .1, h, .8, .5); F(); P([w * .1, h + .5, w * .1 + .4, h + .95, w * .1 + .8, h + .5]); K(); } for (let y = .7; y < h - .7; y += .95) for (let x = -w / 2 + .35; x < w / 2 - .5; x += .75) if (r() < .6) { R(x, y, .36, .5); Wt(); } }, .1, 1.2, "g"],
    /* rigging runs from the masthead to the deck edge (the hull's top is y = 1, x -2.1..2.1) */
    masts: [function () { const h = rr(6, 11); Ln([0, 0, 0, h], .14); for (let i = 1; i <= 3; i++) { const y = h * (.3 + i * .2), w = 2.6 - i * .6; Ln([-w / 2, y, w / 2, y], .09); P([-w / 2, y, w / 2, y, w * .42, y - h * .16, -w * .42, y - h * .16]); F(); } Ln([0, h, -1.9, 1], .03); Ln([0, h, 1.9, 1], .03); P([0, h, .9, h - .25, 0, h - .5]); K(); P([-2.6, 0, -2.1, 1, 2.1, 1, 2.8, 0]); F(); }, 3, 8, "g"],
    /* every part touches the one it hangs from: cab on the tower and up into the jib, counterweight under the jib's tail,
       the cable from the jib's underside down to a sling and the load. Spacing keeps the 8-unit jib clear of the next crane */
    cranes: [function () {
      const h = rr(6, 9), jy = function (x) { return h + .6 + (x + 2.4) / 7.9 * .7; }, cx = 4.6, ce = jy(cx) - rr(1.5, 4);
      P([-.7, 0, -.25, h, .25, h, .7, 0]); F(); for (let y = .6; y < h; y += 1.1) Ln([-.6 + y * .05, y, .6 - y * .05, y + .5], .05);
      R(-.6, h, 1.2, 1); K(); P([-2.4, h + .6, 5.5, h + 1.3, 5.5, h + 1.6, -2.4, h + 1.1]); F();
      R(-2.4, h - .4, .9, 1.1); K();
      Ln([cx, jy(cx), cx, ce], .05); Ln([cx - .32, ce - .3, cx, ce, cx + .32, ce - .3], .04); R(cx - .4, ce - 1, .8, .7); K();
    }, 7, 12, "g"],
    gears: [function () { const rad = rr(1.6, 4), n = Math.round(rad * 5), y = rr(2, 9); c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, rd = rad * (i % 2 ? 1 : .86); c.lineTo(Math.cos(a) * rd, y + Math.sin(a) * rd); c.lineTo(Math.cos(a + TAU / (n * 4)) * rd, y + Math.sin(a + TAU / (n * 4)) * rd); } c.closePath(); F(); C(0, y, rad * .55); Wt(); C(0, y, rad * .5); F(); for (let i = 0; i < 6; i++) Ln([0, y, Math.cos(i * TAU / 6) * (rad * .5 - .06), y + Math.sin(i * TAU / 6) * (rad * .5 - .06)], .12); C(0, y, rad * .14); K(); }, .5, 3, "g"],
    pendulums: [function () { const l = rr(3, 8); const px = (r() - .5) * 1.6; Ln([0, 0, px, -l], .07); C(px, -l, rr(.5, .9)); K(); C(px, -l, .25); Wt(); if (r() < .5) { const x = rr(-3, 3), y = -rr(2, 4); Ln([x, 0, x, y], .07); C(x, y, 1.1); F(); } }, 2, 6, "t"],
    kites: [function () { const s = rr(.6, 1.3), y = rr(5, 12); c.save(); c.translate(0, y); c.rotate(rr(-.5, .5)); P([0, s, s * .7, 0, 0, -s * 1.2, -s * .7, 0]); F(); Ln([0, s, 0, -s * 1.2], .03); Ln([-s * .7, 0, s * .7, 0], .03); c.beginPath(); c.moveTo(0, -s * 1.2); c.bezierCurveTo(1, -s * 2.4, -1, -s * 3.4, .6, -s * 5); c.lineWidth = .04; c.stroke(); c.restore(); }, 3, 9, "s"],
    windmills: [function () { const h = rr(4, 7); P([-.8, 0, -.4, h, .4, h, .8, 0]); F(); R(-.2, h * .3, .4, .6); Wt(); P([-.55, h, 0, h + .7, .55, h]); K(); const a0 = r() * TAU; for (let i = 0; i < 4; i++) { c.save(); c.translate(0, h + .1); c.rotate(a0 + i * TAU / 4); P([0, -.08, 3, -.08, 3, .7, .5, .7, .5, .08, 0, .08]); F(); for (let x = .9; x < 3; x += .5) Ln([x, 0, x, .7], .03); c.restore(); } C(0, h + .1, .16); K(); }, 5, 12, "g"],
    /* course lines are clipped to the pyramid so their round caps never poke past its slopes */
    pyramids: [function () { const w = rr(8, 15), h = w * .55; P([-w / 2, 0, 0, h, w / 2, 0]); F(); c.save(); c.clip(); for (let i = 1; i < 7; i++) Ln([-w / 2 * (1 - i / 7), h * i / 7, w / 2 * (1 - i / 7), h * i / 7], .035); c.restore(); P([0, h, w * .09, h * .82, -w * .09, h * .82]); K(); }, 2, 10, "g"],
    /* trunk, crown knot and seven drooping fronds in one tone; each frond is a tapered leaf along an arched spine,
       leaflet notches cut into its lower edge */
    palms: [function () {
      const h = rr(3.5, 6.5), b = rr(-1, 1), tx = b + .12, ty = h + .08;
      c.beginPath(); c.moveTo(-.16, 0); c.quadraticCurveTo(b * .6, h * .5, b, h); c.lineTo(b + .24, h); c.quadraticCurveTo(b * .6 + .24, h * .5, .22, 0); c.closePath(); F();
      for (let i = 0; i < 7; i++) {
        const a = -.12 + i * (Math.PI + .24) / 6 + (i === 3 ? (r() < .5 ? -.4 : .4) : rr(-.07, .07)), ca = Math.cos(a), sa = Math.sin(a), ac = Math.abs(ca), l = rr(2.3, 3) * (1 - .3 * sa * sa), n = 16;
        /* spine: out along the frond's angle, arching up a little, then drooping the more it points sideways */
        const P1 = [tx + l * .5 * ca, ty + l * (.5 * sa + .08)], P2 = [tx + l * .95 * ca, ty + l * (.4 * sa - .42 * ac - .1)], up = [], dn = [];
        for (let k = 0; k <= n; k++) {
          const t = k / n, u = 1 - t, x = u * u * tx + 2 * u * t * P1[0] + t * t * P2[0], y = u * u * ty + 2 * u * t * P1[1] + t * t * P2[1];
          let dx = 2 * u * (P1[0] - tx) + 2 * t * (P2[0] - P1[0]), dy = 2 * u * (P1[1] - ty) + 2 * t * (P2[1] - P1[1]); const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          let nx = -dy, ny = dx; if (ny < 0) { nx = -nx; ny = -ny; }   /* the normal on the frond's upper side */
          /* narrow stem, widest a fifth of the way out, pointed tip; three leaflet notches cut into the lower edge */
          const hw = .32 * (t < .35 ? .25 + 2.15 * t : Math.pow(u / .65, .9)), cut = k === 8 || k === 10 || k === 12 || k === 14 ? .2 : 1;
          up.push(x + nx * hw * .5, y + ny * hw * .5); dn.push(x - nx * hw * cut, y - ny * hw * cut);
        }
        c.beginPath(); c.moveTo(up[0], up[1]); for (let k = 2; k < up.length; k += 2) c.lineTo(up[k], up[k + 1]);
        for (let k = dn.length - 2; k >= 0; k -= 2) c.lineTo(dn[k], dn[k + 1]); c.closePath(); F();
      }
      C(tx, ty, .28); F(); C(tx - .15, ty - .2, .11); F(); C(tx + .14, ty - .22, .11); F();
    }, 2, 7, "g"],
    dunes: [function () { const w = rr(9, 16), h = rr(1.2, 2.6); c.beginPath(); c.moveTo(-w / 2, 0); c.bezierCurveTo(-w * .2, h * .3, -w * .1, h, w * .05, h); c.bezierCurveTo(w * .2, h * .4, w * .35, h * .1, w / 2, 0); c.closePath(); F(); }, 0, 3, "g"],
    pagodas: [function () { const n = 3 + Math.floor(r() * 3), w = rr(2.4, 3.4); let y = 0; for (let i = 0; i < n; i++) { const ww = w * (1 - i * .14); R(-ww * .32, y, ww * .64, 1); F(); R(-.12, y + .3, .24, .4); Wt(); c.beginPath(); c.moveTo(-ww * .85, y + 1.05); c.quadraticCurveTo(-ww * .4, y + 1.05, -ww * .3, y + 1.5); c.lineTo(ww * .3, y + 1.5); c.quadraticCurveTo(ww * .4, y + 1.05, ww * .85, y + 1.05); c.lineTo(ww * .85, y + .95); c.lineTo(-ww * .85, y + .95); c.closePath(); K(); y += 1.5; } Ln([0, y, 0, y + 1.4], .1); C(0, y + .7, .16); K(); }, 4, 10, "g"],
    bamboo: [function () { const h = rr(5, 11), w = rr(.14, .26), b = rr(-.6, .6); for (let y = 0; y < h; y += 1.05) { R(-w / 2 + b * y / h, y, w, .96); K(); } for (let i = 0; i < 5; i++) { const y = h * rr(.5, 1), d = r() < .5 ? -1 : 1, x = b * y / h; P([x, y, x + d * .9, y + .35, x + d * .25, y + .05]); F(); } }, .3, 1.6, "g"],
    stalact: [function () { const h = rr(1.5, 6), w = rr(.6, 1.6); P([-w, 0, -w * .3, -h * .5, 0, -h, w * .35, -h * .45, w, 0]); F(); Ln([-w * .2, -.2, -w * .05, -h * .7], .03); }, 0, 1.4, "t"],
    crystals: [function () { const n = 2 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const h = rr(1.5, 5.5), w = rr(.5, 1.1), a = rr(-.5, .5); c.save(); c.translate(rr(-1, 1), 0); c.rotate(a); P([-w / 2, 0, -w / 2, h * .8, 0, h, w / 2, h * .8, w / 2, 0]); F(); P([-w / 2, h * .8, 0, h, 0, 0, -w / 2, 0]); c.globalAlpha = .35; Wt(); c.globalAlpha = 1; Ln([0, 0, 0, h * .96], .03); c.restore(); } }, 1, 5, "g"],
    chimneys: [function () { const h = rr(6, 11), w = rr(.9, 1.4); P([-w * .7, 0, -w * .45, h, w * .45, h, w * .7, 0]); F(); R(-w * .55, h, w * 1.1, .35); K(); R(-w * .52, h * .6, w * 1.04, .3); Wt(); for (let i = 0; i < 4; i++) { C(i * .9 + rr(0, .5), h + 1 + i * .9, .6 + i * .28); c.lineWidth = .05; c.stroke(); } }, 2, 7, "g"],
    pipes: [function () { const h = rr(2, 6), w = rr(3, 7); R(-w / 2, h, w, .5); F(); R(-w / 2 - .1, h - .1, .25, .7); K(); R(w / 2 - .15, h - .1, .25, .7); K(); R(-w / 2 + .5, 0, .45, h); F(); R(w / 2 - 1, 0, .45, h); F(); C(0, h + .25, .5); F(); Ln([-.5, h + .25, .5, h + .25], .08); Ln([0, h - .25, 0, h + .75], .08); R(-1.2, 0, 2.4, rr(1, 1.8)); F(); }, .5, 3, "g"],
    wreck: [function () { c.save(); c.rotate(rr(-.25, .25)); P([-6, 1.5, -5, 0, 5, 0, 7, 2.6, 2, 2.2, -2, 2]); F(); for (let x = -4; x < 5; x += 1.2) { C(x, 1.1, .22); Wt(); } Ln([0, 2, .6, 8], .16); Ln([-1.4, 5.5, 2.4, 6], .08); Ln([3.5, 2.3, 3.9, 6], .12); P([.6, 8, 2, 6.9, .55, 6.6]); F(); c.restore(); }, 8, 16, "g"],
    kelp: [function () { const h = rr(3, 9), n = 1 + Math.floor(r() * 3); for (let k = 0; k < n; k++) { const x = k * .5 - .4, ph = r() * 6; c.beginPath(); c.moveTo(x - .12, 0); for (let y = 0; y <= h; y += .4) c.lineTo(x - .12 + Math.sin(y * 1.1 + ph) * .35, y); for (let y = h; y >= 0; y -= .4) c.lineTo(x + .14 + Math.sin(y * 1.1 + ph) * .35, y); c.closePath(); F(); } }, .6, 2.6, "g"],
    coral: [function () { const br = function (x, y, a, l, d) { const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; Ln([x, y, x2, y2], .06 + d * .06); if (d > 0) { br(x2, y2, a + rr(.3, .7), l * .72, d - 1); br(x2, y2, a - rr(.3, .7), l * .72, d - 1); } else { C(x2, y2, .12); K(); } }; br(0, 0, Math.PI / 2, rr(.9, 1.6), 3); }, 1, 4, "g"],
    lighthouse: [function () { const h = rr(8, 11); P([-1, 0, -.6, h, .6, h, 1, 0]); F(); for (let i = 0; i < 3; i++) { const y = h * (.15 + i * .28); P([-1 + y / h * .4, y, 1 - y / h * .4, y, 1 - (y + 1.1) / h * .4, y + 1.1, -1 + (y + 1.1) / h * .4, y + 1.1]); Wt(); } R(-.85, h, 1.7, .2); K(); R(-.5, h + .2, 1, .9); Wt(); c.lineWidth = .06; c.stroke(); P([-.7, h + 1.1, 0, h + 1.9, .7, h + 1.1]); K(); P([.5, h + .75, 16, h + 3.6, 16, h - 1.6]); c.globalAlpha = .5; F(); c.globalAlpha = 1; P([-.5, h + .75, -16, h + 3, -16, h - 1]); c.globalAlpha = .5; F(); c.globalAlpha = 1; }, 26, 40, "g"],
    cliffs: [function () { const h = rr(2.5, 7), w = rr(2, 4.5); P([-w / 2, 0, -w * .42, h * .7, -w * .2, h, w * .15, h * .93, w * .3, h * .6, w / 2, 0]); F(); Ln([-w * .1, h * .9, -w * .2, h * .3], .04); Ln([w * .15, h * .7, w * .05, h * .15], .04); }, 0, 2.2, "g"],
    /* cableway towers; the link draws each span: a track cable and a lower haul rope from one tower's right crossarm tip
       to the next tower's left tip, sagging between them, with a gondola hung from a point on the track cable */
    pylons: [function () { const h = rr(6, 9); P([-.9, 0, -.2, h, .2, h, .9, 0]); c.lineWidth = .1; c.stroke(); for (let y = 0; y < h - 1; y += 1.3) { const a = .9 - y / h * .7, b = .9 - (y + 1.3) / h * .7; Ln([-a, y, b, y + 1.3], .05); Ln([a, y, -b, y + 1.3], .05); } R(-1.6, h, 3.2, .22); K(); return { h: h }; }, 12, 18, "g",
      function (A, B) {
        const x0 = A.x + 1.58 * A.sm, y0 = (A.a.h + .11) * A.sm, x1 = B.x - 1.58 * B.sm, y1 = (B.a.h + .11) * B.sm, sp = x1 - x0, s = (A.sm + B.sm) / 2;
        if (sp <= 0) return;
        const track = sag(x0, y0, x1, y1, sp * rr(.045, .065), .05 * s); sag(x0, y0, x1, y1, sp * .09, .035 * s);
        if (sp < 7 * s) return;
        const p = track(rr(.28, .72)), gx = p[0], gy = p[1];
        Ln([gx, gy, gx, gy - .8 * s], .05 * s); c.beginPath(); c.roundRect(gx - .7 * s, gy - 2.1 * s, 1.4 * s, 1.32 * s, .3 * s); F(); R(gx - .5 * s, gy - 1.6 * s, s, .45 * s); Wt();
      }],
    ferris: [function () { const rad = rr(4.5, 6.5), y = rad + 1.2; P([-2.6, 0, 0, y, 2.6, 0, 2.2, 0, 0, y - .7, -2.2, 0]); K(); C(0, y, rad); c.lineWidth = .12; c.stroke(); C(0, y, rad * .82); c.lineWidth = .05; c.stroke(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12, x = Math.cos(a) * rad, yy = y + Math.sin(a) * rad; Ln([0, y, x, yy], .04); Ln([x, yy, x, yy - .25], .05); c.beginPath(); c.roundRect(x - .35, yy - .8, .7, .6, .15); F(); } C(0, y, .4); K(); }, 16, 28, "g"],
    tents: [function () { const w = rr(4, 7), h = rr(2.5, 4); R(-w / 2, 0, w, h * .45); F(); for (let x = -w / 2; x < w / 2; x += w / 5) { R(x, 0, w / 10, h * .45); Wt(); } c.beginPath(); c.moveTo(-w * .58, h * .45); c.quadraticCurveTo(-w * .1, h * .6, 0, h); c.quadraticCurveTo(w * .1, h * .6, w * .58, h * .45); c.closePath(); F(); Ln([0, h, 0, h + 1], .06); P([0, h + 1, .8, h + .75, 0, h + .5]); K(); }, 1, 6, "g"],
    domes: [function () { const w = rr(3, 5.5), h = rr(1.5, 4); R(-w / 2, 0, w, h); F(); c.beginPath(); c.arc(0, h, w / 2, 0, Math.PI); c.closePath(); F(); c.save(); c.translate(0, h); c.rotate(rr(-.5, .5)); R(-.25, 0, .5, w / 2 + .05); Wt(); R(-.12, w * .3, .24, w * .45); K(); c.restore(); R(-w / 2 - .15, h - .15, w + .3, .22); K(); for (let x = -w / 2 + .5; x < w / 2 - .4; x += .9) { R(x, h * .35, .3, .45); Wt(); } }, 3, 9, "g"],
    antennas: [function () { const h = rr(5, 10); Ln([-.5, 0, 0, h, .5, 0], .07); for (let y = 0; y < h - .8; y += .9) { const a = .5 * (1 - y / h), b = .5 * (1 - (y + .9) / h); Ln([-a, y, b, y + .9, -b, y + .9, a, y], .035); } if (r() < .6) { c.save(); c.translate(0, h * .7); c.rotate(rr(.3, 1)); c.beginPath(); c.arc(0, 0, 1.1, Math.PI, TAU); c.closePath(); F(); Ln([0, 0, 0, .9], .05); c.restore(); } C(0, h, .12); K(); }, 3, 8, "g"],
    arches: [function () { const h = rr(5, 8), n = 3; for (let i = 0; i < n; i++) { const x = i * 3.4 - 3.4; c.beginPath(); c.moveTo(x - 1.7, 0); c.lineTo(x - 1.7, h); c.lineTo(x + 1.7, h); c.lineTo(x + 1.7, 0); c.lineTo(x + 1.15, 0); c.lineTo(x + 1.15, h - 2.2); c.arc(x, h - 2.2, 1.15, 0, Math.PI, false); c.lineTo(x - 1.15, 0); c.closePath(); F(); } R(-5.3, h, 10.6, .4); K(); for (let x = -4.6; x < 5; x += 1.15) { R(x, h - .5, .3, .25); Wt(); } }, 2, 9, "g"],
    vines: [function () { const l = rr(2, 8), ph = r() * 6; c.beginPath(); c.moveTo(0, 0); for (let y = 0; y <= l; y += .3) c.lineTo(Math.sin(y * .9 + ph) * .3, -y); c.lineWidth = .07; c.stroke(); for (let y = .5; y < l; y += .55) { const x = Math.sin(y * .9 + ph) * .3, d = r() < .5 ? -1 : 1; c.beginPath(); c.ellipse(x + d * .22, -y, .26, .12, d * .6, 0, TAU); F(); } }, .3, 1.5, "t"],
    meteors: [function () { const y = rr(5, 13), l = rr(2, 6); c.save(); c.translate(0, y); c.rotate(-.55); P([0, 0, l, .22, l, -.22]); F(); C(0, 0, .22); K(); Ln([l * .2, .3, l * 1.2, .5], .025); Ln([l * .3, -.3, l * 1.3, -.55], .025); c.restore(); }, 3, 9, "s"],
    stones: [function () { if (r() < .4) { const h = rr(3, 4.6); R(-1.6, 0, .8, h); F(); R(.8, 0, .8, h); F(); P([-2, h, -1.9, h + .75, 2, h + .85, 1.9, h]); F(); } else { const h = rr(1.6, 5), w = rr(.8, 1.5); P([-w / 2, 0, -w * .42, h * .85, -w * .1, h, w * .36, h * .9, w / 2, 0]); F(); Ln([-w * .1, h * .7, w * .05, h * .3], .04); } }, 1.5, 6, "g"],
    ribs: [function () { const n = 5 + Math.floor(r() * 3), h = rr(4, 7); Ln([-n * .7, .3, n * .7, .3], .28); for (let i = 0; i < n; i++) { const x = (i - n / 2) * 1.35, hh = h * (1 - Math.abs(i - n / 2) / n * .9); c.beginPath(); c.moveTo(x, .3); c.bezierCurveTo(x - .9, hh * .5, x - .5, hh, x + .6, hh * 1.02); c.lineWidth = .2; c.stroke(); } }, 5, 12, "g"],
    geysers: [function () { const h = rr(5, 10); P([-1.2, 0, -.35, .9, .35, .9, 1.2, 0]); K(); c.beginPath(); c.moveTo(-.3, .9); c.bezierCurveTo(-.5, h * .5, -1.4, h * .8, -1.8, h); c.bezierCurveTo(-.8, h * 1.12, .8, h * 1.12, 1.8, h); c.bezierCurveTo(1.4, h * .8, .5, h * .5, .3, .9); c.closePath(); F(); for (let i = 0; i < 4; i++) { C(rr(-2, 2), h + rr(.2, 1.6), rr(.25, .6)); c.lineWidth = .04; c.stroke(); } }, 5, 12, "g"],
    rockarch: [function () { const w = rr(5, 8), h = rr(3.5, 6); c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w * .46, h * .8); c.quadraticCurveTo(0, h * 1.25, w * .46, h * .85); c.lineTo(w / 2, 0); c.lineTo(w * .26, 0); c.quadraticCurveTo(w * .22, h * .62, 0, h * .66); c.quadraticCurveTo(-w * .22, h * .62, -w * .24, 0); c.closePath(); F(); Ln([-w * .38, h * .7, -w * .3, h * .2], .04); }, 2, 8, "g"],
    volcano: [function () { const w = rr(14, 20), h = rr(6, 9); P([-w / 2, 0, -w * .12, h, -w * .04, h * .93, w * .05, h * .97, w * .12, h, w / 2, 0]); F(); P([-w * .12, h, -w * .04, h * .93, w * .05, h * .97, w * .12, h, w * .06, h * .7, 0, h * .8, -w * .05, h * .62]); Wt(); for (let i = 0; i < 6; i++) { C(rr(-1, 1) + i * .5, h + .8 + i * 1.1, .7 + i * .4); c.lineWidth = .05; c.stroke(); } }, 8, 18, "g"],
    deadtrees: [function () { const br = function (x, y, a, l, d) { const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; Ln([x, y, x2, y2], .05 + d * .07); if (d > 0) { br(x2, y2, a + rr(.25, .7), l * .7, d - 1); br(x2, y2, a - rr(.25, .7), l * .7, d - 1); } }; br(0, 0, Math.PI / 2 + rr(-.15, .15), rr(1.4, 2.4), 4); }, 1.5, 5, "g"],
    columns: [function () { const h = rr(6, 10), n = 4; for (let i = 0; i < n; i++) { const x = (i - 1.5) * 2.2; R(x - .4, .3, .8, h - .6); F(); for (let k = -1; k <= 1; k++) Ln([x + k * .2, .5, x + k * .2, h - .5], .03); R(x - .6, 0, 1.2, .3); K(); R(x - .6, h - .3, 1.2, .3); K(); } R(-4.6, h, 9.2, .5); F(); P([-4.8, h + .5, 0, h + 2.2, 4.8, h + .5]); F(); C(0, h + 1.1, .4); Wt(); }, 3, 9, "g"],
    chandeliers: [function () { const l = rr(1.5, 5), arm = function (x) { const t = (x / 1.6 + 1) / 2; return -l - 2.6 * t * (1 - t); }; Ln([0, 0, 0, arm(0)], .06); c.beginPath(); c.moveTo(-1.6, -l); c.quadraticCurveTo(0, -l - 1.3, 1.6, -l); c.lineWidth = .1; c.stroke(); for (let i = -2; i <= 2; i++) { const x = i * .8, y = arm(x); R(x - .07, y, .14, .5); K(); c.beginPath(); c.ellipse(x, y + .68, .09, .18, 0, 0, TAU); Wt(); c.lineWidth = .04; c.stroke(); } P([-.25, -l - .7, 0, -l - 1.2, .25, -l - .7]); K(); }, 3, 8, "t"],
    shelves: [function () { const w = rr(4, 6), h = rr(8, 13); R(-w / 2, 0, w, h); F(); for (let y = .2; y < h - 1; y += 1.5) { R(-w / 2 + .2, y, w - .4, 1.25); Wt(); let x = -w / 2 + .25; while (x < w / 2 - .5) { const bw = rr(.14, .34), bh = rr(.75, 1.2); if (r() < .86) { R(x, y, bw, bh); K(); } x += bw + .05; } } R(-w / 2 - .15, h, w + .3, .3); K(); }, .2, 2, "g"],
    ladders: [function () { const h = rr(5, 10), a = rr(-.22, .22); c.save(); c.rotate(a); Ln([-.4, 0, -.4, h], .1); Ln([.4, 0, .4, h], .1); for (let y = .5; y < h; y += .7) Ln([-.4, y, .4, y], .06); c.restore(); let y = 0; for (let i = 0; i < 5; i++) { const w = rr(1, 1.8), hh = rr(.2, .36); R(1.4 + rr(-.2, .2), y, w, hh); F(); y += hh; } }, 3, 8, "g"],
    spires: [function () { const h = rr(8, 14), w = rr(1.6, 2.4); R(-w / 2, 0, w, h * .55); F(); P([-w / 2, h * .55, 0, h, w / 2, h * .55]); F(); Ln([0, h, 0, h + .9], .06); Ln([-.3, h + .55, .3, h + .55], .06); for (let y = 1; y < h * .5; y += 1.8) { c.beginPath(); c.moveTo(-.25, y); c.lineTo(-.25, y + .8); c.quadraticCurveTo(0, y + 1.3, .25, y + .8); c.lineTo(.25, y); c.closePath(); Wt(); } P([-w / 2 - .5, 0, -w / 2 - .5, h * .3, -w / 2 - .25, h * .42, -w / 2, h * .3, -w / 2, 0]); F(); P([w / 2 + .5, 0, w / 2 + .5, h * .3, w / 2 + .25, h * .42, w / 2, h * .3, w / 2, 0]); F(); }, .6, 4, "g"],
    gothic: [function () { const h = rr(6, 9), w = 5; c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, h * .6); c.quadraticCurveTo(-w / 2, h, 0, h * 1.12); c.quadraticCurveTo(w / 2, h, w / 2, h * .6); c.lineTo(w / 2, 0); c.closePath(); F(); C(0, h * .66, 1.25); Wt(); C(0, h * .66, 1.1); F(); for (let i = 0; i < 8; i++) Ln([0, h * .66, Math.cos(i * TAU / 8) * 1.1, h * .66 + Math.sin(i * TAU / 8) * 1.1], .06); C(0, h * .66, .3); Wt(); for (const x of [-1.2, 0, 1.2]) { c.beginPath(); c.moveTo(x - .35, 0); c.lineTo(x - .35, h * .28); c.quadraticCurveTo(x, h * .4, x + .35, h * .28); c.lineTo(x + .35, 0); c.closePath(); Wt(); } }, 2, 7, "g"],
    girders: [function () { const h = rr(6, 13), w = rr(4, 7), n = Math.round(w / 2); c.lineWidth = .14; for (let i = 0; i <= n; i++) Ln([-w / 2 + i * w / n, 0, -w / 2 + i * w / n, h], .14); for (let y = 2; y <= h; y += 2) { Ln([-w / 2, y, w / 2, y], .14); for (let i = 0; i < n; i++) if (r() < .55) Ln([-w / 2 + i * w / n, y - 2, -w / 2 + (i + 1) * w / n, y], .05); } if (r() < .5) { Ln([w / 2, h, w / 2 + 4, h + 1.2], .1); Ln([w / 2 + 3.4, h + 1, w / 2 + 3.4, h - 2.5], .04); P([w / 2 + 3.1, h - 2.5, w / 2 + 3.7, h - 2.5, w / 2 + 3.4, h - 3.1]); K(); } }, 1, 6, "g"],
    coils: [function () { const h = rr(4, 7); P([-.7, 0, -.3, h * .5, .3, h * .5, .7, 0]); F(); for (let y = h * .5; y < h * .86; y += .32) { c.beginPath(); c.ellipse(0, y, .55, .16, 0, 0, TAU); K(); } c.beginPath(); c.ellipse(0, h * .92, 1.3, .45, 0, 0, TAU); F(); c.beginPath(); c.ellipse(0, h * .92, .6, .16, 0, 0, TAU); Wt(); for (let i = 0; i < 3; i++) { let x = rr(-1, 1), y = h * .95; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rr(-.7, .7); y += rr(.2, .7); c.lineTo(x, y); } c.lineWidth = .04; c.stroke(); } }, 4, 10, "g"],
    watertowers: [function () { const h = rr(5, 8); Ln([-1.1, 0, -.8, h], .1); Ln([1.1, 0, .8, h], .1); Ln([-1.01, h * .3, .89, h * .7], .05); Ln([1.01, h * .3, -.89, h * .7], .05); c.beginPath(); c.roundRect(-1.5, h, 3, 2.3, .3); F(); P([-1.6, h + 2.3, 0, h + 3.2, 1.6, h + 2.3]); K(); for (let y = h + .5; y < h + 2.2; y += .6) Ln([-1.47, y, 1.47, y], .03); Ln([.3, h, .3, 0], .06); }, 6, 14, "g"],
    trains: [function () { const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) { const x = i * 5.3 - n * 2.6; c.beginPath(); c.roundRect(x, .7, 5, 2.3, .15); F(); R(x - .1, 2.9, 5.2, .22); K(); for (let k = 0; k < 4; k++) Ln([x + .6 + k * 1.25, .9, x + .6 + k * 1.25, 2.8], .035); for (const wx of [.9, 1.8, 3.2, 4.1]) { C(x + wx, .45, .45); K(); C(x + wx, .45, .16); Wt(); } Ln([x + 5, 1, x + 5.3, 1], .1); } }, 3, 10, "g"],
    minarets: [function () { const h = rr(7, 12); R(-.4, 0, .8, h); F(); R(-.65, h * .62, 1.3, .25); K(); R(-.6, h, 1.2, .25); K(); c.beginPath(); c.moveTo(-.45, h + .25); c.bezierCurveTo(-.8, h + .9, -.2, h + 1.2, 0, h + 1.9); c.bezierCurveTo(.2, h + 1.2, .8, h + .9, .45, h + .25); c.closePath(); F(); if (r() < .6) { const w = rr(3, 5); R(1.2, 0, w, 2.6); F(); c.beginPath(); c.moveTo(1.2 + w * .12, 2.6); c.bezierCurveTo(1.2, 4.6, 1.2 + w * .4, 4.6, 1.2 + w / 2, 5.6); c.bezierCurveTo(1.2 + w * .6, 4.6, 1.2 + w, 4.6, 1.2 + w * .88, 2.6); c.closePath(); F(); for (let x = 1.7; x < w + .6; x += 1) { c.beginPath(); c.moveTo(x, .5); c.lineTo(x, 1.4); c.quadraticCurveTo(x + .2, 1.9, x + .4, 1.4); c.lineTo(x + .4, .5); c.closePath(); Wt(); } } }, 3, 9, "g"],
    stalls: [function () { const w = rr(3, 4.6), h = rr(2.2, 3); Ln([-w / 2, 0, -w / 2, h], .1); Ln([w / 2, 0, w / 2, h], .1); R(-w / 2, 0, w, 1); F(); c.beginPath(); c.moveTo(-w / 2 - .4, h); const n = 6; for (let i = 0; i < n; i++) { const x0 = -w / 2 - .4 + i * (w + .8) / n; c.quadraticCurveTo(x0 + (w + .8) / n / 2, h - .55, x0 + (w + .8) / n, h); } c.lineTo(w / 2 + .2, h + .9); c.lineTo(-w / 2 - .2, h + .9); c.closePath(); F(); for (let i = 0; i < n; i += 2) { const x0 = -w / 2 - .3 + i * (w + .6) / n; R(x0, h + .05, (w + .6) / n, .8); Wt(); } for (let x = -w / 2 + .6; x < w / 2 - .3; x += .9) { Ln([x, h, x, h - .5], .03); C(x, h - .7, .2); K(); } }, 1, 5, "g"],
    zeppelins: [function () { const w = rr(5, 9), y = rr(6, 12); c.beginPath(); c.ellipse(0, y, w / 2, w * .15, 0, 0, TAU); F(); for (let i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(0, y, w / 2 * Math.cos(i * .5), w * .15, 0, 0, TAU); c.lineWidth = .03; c.stroke(); } P([-w / 2 + .2, y, -w / 2 - .8, y + .9, -w / 2 - .8, y - .9]); K(); c.beginPath(); c.roundRect(-w * .12, y - w * .15 - .5, w * .24, .5, .15); K(); Ln([-w * .08, y - w * .13, -w * .08, y - w * .15 - .2], .03); }, 6, 14, "s"],
    clouds: [function () { const y = rr(3, 11), n = 4 + Math.floor(r() * 3); c.beginPath(); let x = -n * .6; c.moveTo(x, y); for (let i = 0; i < n; i++) { const rad = rr(.7, 1.3); c.arc(x + rad, y, rad, Math.PI, 0, true); x += rad * 1.5; } c.lineTo(x + .4, y); c.lineTo(-n * .6, y); c.closePath(); F(); }, 2, 7, "s"],
    castles: [function () { const w = rr(4, 7), h = rr(3, 6), xr = Math.max(w * .3, w * .2 + .8); P([-w / 2, 0, -w * .5, -h * .55, -w * .47, -h - .05, xr, -h - .05, xr + .3, -h * .7, w / 2, 0]); F(); R(-w * .3, -h - 2.2, w * .6, 2.2); F(); for (let x = -w * .3; x < w * .3 - .2; x += .56) { R(x, -h - 2.6, .3, .4); K(); } R(-w * .46, -h - 3.6, .9, 3.6); F(); P([-w * .46 - .15, -h - 3.6, -w * .46 + .45, -h - 4.9, -w * .46 + 1.05, -h - 3.6]); K(); R(w * .2, -h - 3, .8, 3); F(); P([w * .2 - .15, -h - 3, w * .2 + .4, -h - 4, w * .2 + .95, -h - 3]); K(); R(-.2, -h - 1.4, .4, .7); Wt(); }, 3, 9, "t"],
    battlements: [function () { const w = rr(4, 8), h = rr(3, 6); R(-w / 2, 0, w, h); F(); for (let x = -w / 2; x < w / 2 - .3; x += .9) { R(x, h, .5, .5); K(); } R(-w / 2 - 1.2, 0, 1.4, h + 2); F(); for (let x = -w / 2 - 1.2; x < -w / 2 + .1; x += .56) { R(x, h + 2, .3, .4); K(); } R(-w / 2 - .7, h + .6, .3, .7); Wt(); c.beginPath(); c.moveTo(-.6, 0); c.lineTo(-.6, 1.5); c.quadraticCurveTo(0, 2.4, .6, 1.5); c.lineTo(.6, 0); c.closePath(); K(); }, .4, 3, "g"],
    ringsun: [function () { const y = 9, rad = 4.2; C(0, y, rad); K(); C(0, y, rad * .86); Wt(); C(0, y, rad * .8); c.lineWidth = .05; c.stroke(); for (let i = 0; i < 48; i++) { const a = i * TAU / 48, l = i % 4 === 0 ? 2.6 : i % 2 ? .7 : 1.4; Ln([Math.cos(a) * (rad + .35), y + Math.sin(a) * (rad + .35), Math.cos(a) * (rad + .35 + l), y + Math.sin(a) * (rad + .35 + l)], i % 4 === 0 ? .09 : .04); } }, 44, 60, "g"],
    shards: [function () { if (r() < .5) { const h = rr(4, 10), w = rr(.9, 1.8); P([-w / 2, 0, -w * .4, h, w * .1, h * 1.05, w / 2, 0]); F(); Ln([-w * .1, h * .9, w * .05, .2], .03); } else { const y = rr(4, 11), s = rr(.5, 1.5); c.save(); c.translate(0, y); c.rotate(r() * 3); P([-s, 0, -s * .2, s * .7, s, s * .2, s * .3, -s * .6]); F(); Ln([-s, 0, s, s * .2], .03); c.restore(); } }, 1, 5, "g"],
    /* soft rolling hills for the farthest strip */
    hills: [function () { const w = rr(16, 30), h = rr(1.2, 3.4), k = rr(-.25, .25); c.beginPath(); c.moveTo(-w / 2, 0); c.bezierCurveTo(-w * .32, h * .25, -w * (.22 - k), h, w * k, h); c.bezierCurveTo(w * (.22 + k), h, w * .32, h * .25, w / 2, 0); c.closePath(); F(); }, 7, 13, "g"],
    /* a faint distant spire, rare */
    spire: [function () { const h = rr(9, 13), w = rr(.9, 1.4); R(-w * .8, 0, w * 1.6, h * .32); F(); P([-w / 2, h * .3, -w * .38, h * .58, -w * .2, h * .62, 0, h, w * .2, h * .62, w * .38, h * .58, w / 2, h * .3]); F(); R(-w * .9, h * .3, w * 1.8, .25); K(); }, 55, 90, "g"],
    /* broad tree: a flared, slightly leaning trunk under one connected crown. The crown is a central core ellipse with
       foliage clumps grown outward from it (each one overlapping what is already there), scalloped with leafy lumps on
       its outer edge only; its mass is re-centred over the trunk top. 2-4 tapered limbs fork off high on the trunk and
       end inside clumps. */
    canopy: [function () {
      const h = rr(5, 6.8), lean = rr(-.45, .45), tw = rr(.4, .54), cw = h / 3 * rr(1.8, 2.6), chh = cw * rr(.8, .94);
      const cy = h + chh * .04, off = rr(-.12, .12) * cw;
      /* trunk: wide root flare at the base, narrowing quickly, then gently up to the crown */
      c.beginPath(); c.moveTo(-tw * 2.1, 0);
      c.bezierCurveTo(-tw * 1.05, h * .03, -tw * .85, h * .12, -tw * .7 + lean * .12, h * .28);
      c.quadraticCurveTo(-tw * .5 + lean * .5, h * .7, -tw * .46 + lean, h);
      c.lineTo(tw * .46 + lean, h);
      c.quadraticCurveTo(tw * .5 + lean * .5, h * .7, tw * .7 + lean * .12, h * .28);
      c.bezierCurveTo(tw * .85, h * .12, tw * 1.05, h * .03, tw * 2.1, 0); c.closePath(); F();
      /* crown clumps [x, y, rx, ry], grown out from a core; each must overlap the clumps placed before it */
      const bl = [[0, chh * .1, cw * .3, chh * .32]], nl = 6 + Math.floor(r() * 4);
      for (let i = 0; i < nl; i++) {
        const a = -.32 * Math.PI + (i + rr(.1, .9)) / nl * 1.64 * Math.PI, rad = cw * rr(.18, .27), ry = rad * rr(.82, 1);
        let d = rr(.55, 1), x = 0, y = 0;
        for (let k = 0; k < 6; k++, d *= .75) {
          x = Math.cos(a) * (cw / 2 - rad) * d; y = Math.sin(a) * (chh / 2 - ry) * d;
          let hit = false;
          for (const b of bl) { const dx = (x - b[0]) / (rad + b[2]), dy = (y - b[1]) / (ry + b[3]); if (dx * dx + dy * dy < .5) { hit = true; break; } }
          if (hit) break;
        }
        bl.push([x, y, rad, ry]);
      }
      /* re-centre: the crown's area-weighted centre sits over the trunk top, give or take 12% of its width */
      let sa = 0, sx = 0; for (const b of bl) { sa += b[2] * b[3]; sx += b[0] * b[2] * b[3]; }
      const dx0 = lean + off - sx / sa;
      for (const b of bl) { b[0] += dx0; b[1] += cy; }
      /* limbs: start high on the trunk, taper, and end at the centre of a clump so no bare stick shows below */
      const nb = 2 + Math.floor(r() * 3);
      for (let i = 0; i < nb; i++) {
        const sd = i % 2 ? 1 : -1, y0 = h * rr(.6, .72), x0 = lean * Math.pow(y0 / h, 1.6);
        let tb = bl[0], best = -1e9;
        for (let k = 1; k < bl.length; k++) { const s = (bl[k][0] - x0) * sd - Math.abs(bl[k][1] - cy) * .8 + ((k * 7 + i * 3) % 5) * .15; if (s > best) { best = s; tb = bl[k]; } }
        const x1 = tb[0], y1 = tb[1], mx = x0 + (x1 - x0) * .25, my = y0 + (y1 - y0) * .75, w0 = tw * rr(.42, .55), w1 = .08;
        const L = [], Rt = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8, u = 1 - t, px = u * u * x0 + 2 * u * t * mx + t * t * x1, py = u * u * y0 + 2 * u * t * my + t * t * y1;
          const tx = 2 * u * (mx - x0) + 2 * t * (x1 - mx), ty = 2 * u * (my - y0) + 2 * t * (y1 - my), tl = Math.hypot(tx, ty) || 1, w = (w0 + (w1 - w0) * t) / tl;
          L.push(px - ty * w, py + tx * w); Rt.unshift(px + ty * w, py - tx * w);
        }
        P(L.concat(Rt)); F();
      }
      /* foliage: the clumps as slight ellipses, plus leafy lumps of mixed sizes on the side facing out of the crown;
         lumps on the underside are flatter so the bottom edge reads as a soft, shallow scallop */
      const ccx = lean + off;
      c.beginPath();
      for (const b of bl) {
        c.moveTo(b[0] + b[2], b[1]); c.ellipse(b[0], b[1], b[2], b[3], 0, 0, TAU);
        const oa = Math.atan2((b[1] - cy) / chh, (b[0] - ccx) / cw), nk = 4 + Math.floor(r() * 4);
        for (let k = 0; k < nk; k++) {
          const a = oa + rr(-1.5, 1.5), lr = b[2] * rr(.2, .44), dn = Math.sin(a) < 0, lx = b[0] + Math.cos(a) * b[2] * rr(.72, .95), ly = b[1] + Math.sin(a) * b[3] * rr(.72, .95) * (dn ? .7 : 1);
          c.moveTo(lx + lr, ly); c.ellipse(lx, ly, lr, lr * (dn ? .7 : rr(.85, 1)), 0, 0, TAU);
        }
      }
      F();
    }, 6, 12, "g"]
  };

  let canBlur = null;
  function blurOK() {
    if (canBlur === null) { try { const t = document.createElement("canvas").getContext("2d"); t.filter = "blur(2px)"; canBlur = t.filter === "blur(2px)"; } catch (e) { canBlur = false; } }
    return canBlur;
  }

  /* The same strip as a job of small steps (one item, one set of links, the mist, the blur, the top), so The
     Convergence can build the next world a few milliseconds a frame while a run goes on. Every step sets the drawing
     state it needs (c, F, K, Wt, r), so jobs and whole strips can interleave. o.fast: a far layer's softness from a
     GPU downscale and upscale instead of the canvas blur filter (that filter is the slowest part on a phone). */
  function job(o) {
    const res = o.soft ? .5 : 1, u = o.u * res, wu = o.widthU;
    const cv = document.createElement("canvas"), W = Math.max(2, Math.round(wu * u)), HH = Math.max(2, Math.round(o.hPx * res)), gp = o.groundPx * res;
    cv.width = W; cv.height = HH;
    const cx = cv.getContext("2d");
    const fF = function () { cx.fillStyle = o.tone; cx.fill(); }, fK = function () { cx.fillStyle = o.dark; cx.fill(); }, fW = function () { cx.fillStyle = o.light; cx.fill(); };
    cx.strokeStyle = o.tone; cx.lineJoin = "round"; cx.lineCap = "round";
    if (o.minLine) { const st = cx.stroke; cx.stroke = function () { if (cx.lineWidth >= o.minLine) st.apply(cx, arguments); }; }
    const use = function () { c = cx; F = fF; K = fK; Wt = fW; };
    const ops = [];
    let ground = false, out = cv;
    for (const gen of o.gens) {
      const def = G[gen[0]]; if (!def) continue;
      const gm = gen[2] || 1, sm = gen[3] || 1, mg = gen[4] || 0;
      r = rng(gen[1]); if (def[3] === "g") ground = true;
      const items = []; let x = r() * 3;
      while (x < wu - 1) { items.push([x, r() * 1e9 >>> 0]); x += Math.max(mg, (def[1] + r() * (def[2] - def[1])) * gm + 1.2); }
      /* the last item must keep the minimum gap to the first one's copy across the loop seam too */
      const gMin = Math.max(mg, def[1] * gm + 1.2);
      while (items.length > 1 && items[0][0] + wu - items[items.length - 1][0] < gMin) items.pop();
      const ends = [];
      items.forEach(function (it) {
        ops.push(function () {
          for (const off of [0, -wu, wu]) {
            r = rng(it[1]);
            c.save();
            c.translate((it[0] + off) * u, def[3] === "t" ? 0 : gp);
            c.scale(u * sm, -u * sm);
            const a = def[0]();
            c.restore();
            if (off === 0) ends.push({ x: it[0], sm: sm, a: a, seed: it[1] });
          }
        });
      });
      /* links between neighbours, the last one to the first one's copy one loop on, drawn in all three copies so the
         seam stays clean */
      if (def[4]) ops.push(function () {
        if (!ends.length) return;
        for (const off of [0, -wu, wu]) {
          c.save(); c.translate(off * u, def[3] === "t" ? 0 : gp); c.scale(u, -u);
          for (let i = 0; i < ends.length; i++) {
            const A = ends[i], B = i + 1 < ends.length ? ends[i + 1] : { x: ends[0].x + wu, sm: ends[0].sm, a: ends[0].a };
            r = rng(A.seed ^ 0x5BD1E995); def[4](A, B);
          }
          c.restore();
        }
      });
    }
    ops.push(function () {
      if (ground) { c.fillStyle = o.tone; c.fillRect(0, gp - 1, W, HH - gp + 1); }
      /* mist: wash the bottom 35% of the silhouettes into fog, then fade the strip out below its baseline */
      const m = o.mist, mc = "rgba(" + m[0] + "," + m[1] + "," + m[2] + ",", f0 = gp * .65;
      c.globalCompositeOperation = "source-atop";
      let gr = c.createLinearGradient(0, f0, 0, HH);
      gr.addColorStop(0, mc + "0)"); gr.addColorStop(Math.min(.99, (gp - f0) / (HH - f0)), mc + m[3] + ")"); gr.addColorStop(1, mc + Math.min(1, m[3] + .3) + ")");
      c.fillStyle = gr; c.fillRect(0, f0, W, HH - f0);
      c.globalCompositeOperation = "destination-out";
      const b0 = gp + (HH - gp) * .3;
      gr = c.createLinearGradient(0, b0, 0, HH); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)");
      c.fillStyle = gr; c.fillRect(0, b0, W, HH - b0);
      c.globalCompositeOperation = "source-over";
    });
    if (o.soft && o.fast) ops.push(function () {
      /* soft by scaling: down to a quarter and back, with the neighbours drawn so the loop seam stays clean */
      const k = 4 / (1 + o.soft), w2 = Math.max(2, Math.round(W / k)), h2 = Math.max(2, Math.round(HH / k)), sm = document.createElement("canvas");
      sm.width = w2 * 3; sm.height = h2;
      const s2 = sm.getContext("2d"); s2.imageSmoothingQuality = "high";
      s2.drawImage(cv, 0, 0, w2, h2); s2.drawImage(cv, w2, 0, w2, h2); s2.drawImage(cv, 2 * w2, 0, w2, h2);
      out = document.createElement("canvas"); out.width = W; out.height = HH;
      const tc = out.getContext("2d"); tc.imageSmoothingQuality = "high"; tc.drawImage(sm, w2, 0, w2, h2, 0, 0, W, HH);
    });
    else if (o.soft) ops.push(function () {
      if (!blurOK()) return;
      /* one-time blur on the offscreen copy; draw the neighbours too so the loop seam stays clean */
      out = document.createElement("canvas"); out.width = W; out.height = HH;
      const tc = out.getContext("2d"); tc.filter = "blur(" + o.soft + "px)";
      tc.drawImage(cv, -W, 0); tc.drawImage(cv, 0, 0); tc.drawImage(cv, W, 0);
    });
    ops.push(function () { out.res = res; out.top = emptyTop(out); });
    let i = 0;
    const now = function () { return typeof performance !== "undefined" ? performance.now() : Date.now(); };
    /* run steps for up to ms milliseconds (at least one); the finished strip, or null while there is more to do */
    function step(ms) {
      const end = now() + ms;
      do { use(); ops[i++](); } while (i < ops.length && now() < end);
      return i >= ops.length ? out : null;
    }
    return { step: step, get done() { return i >= ops.length; } };
  }
  /* Render one looping strip of solid silhouettes, all at once.
     o.gens: [[name, seed, spacing multiplier, size multiplier, min spacing in units], ...]
     o.widthU: loop width in units, o.u: px per unit, o.hPx / o.groundPx: strip height and baseline in px
     o.tone / o.dark / o.light: flat fills, o.mist: [r, g, b, a] fog colour baked into the base
     o.soft: draw at half resolution (and blur once) so far layers read as out of focus
     o.minLine: drop stroked details thinner than this (in units) */
  function strip(o) { return job(o).step(Infinity); }
  /* rows of pure sky above the tallest silhouette; the renderer skips them so each frame blits less. Read from a copy
     an eighth the size, scaled down on the GPU: reading back the whole strip cost most of its build (tens of ms on a
     phone, and The Convergence builds a world every biome), and an eighth still finds the top to within 8 rows, which
     are given back as margin */
  let small = null;
  function emptyTop(cv) {
    try {
      const k = 8, w = Math.max(1, Math.ceil(cv.width / k)), h = Math.max(1, Math.ceil(cv.height / k));
      if (!small) small = document.createElement("canvas");
      small.width = w; small.height = h;
      const sc2 = small.getContext("2d");
      sc2.clearRect(0, 0, w, h); sc2.drawImage(cv, 0, 0, w, h);
      const d = sc2.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 0) return Math.max(0, (y - 1) * k - 2);
    } catch (e) {}
    return 0;
  }
  /* One element on its own canvas (Infinite Shadow's collision motifs: a third world's ring-sun, zeppelins or towers in
     the sky). o.gen: a generator name, o.seed, o.u: px per unit, o.tone / o.dark / o.light. The element's base is at
     (cv.ox, cv.oy); one that hangs from the top (anchor "t") has its top there instead. */
  function single(o) {
    const def = G[o.gen]; if (!def) return null;
    const u = o.u, wu = 30, hu = 24, cv = document.createElement("canvas");
    cv.width = Math.round(wu * u); cv.height = Math.round(hu * u);
    c = cv.getContext("2d");
    F = function () { c.fillStyle = o.tone; c.fill(); };
    K = function () { c.fillStyle = o.dark; c.fill(); };
    Wt = function () { c.fillStyle = o.light; c.fill(); };
    c.strokeStyle = o.tone; c.lineJoin = "round"; c.lineCap = "round";
    const top = def[3] === "t";
    cv.ox = cv.width / 2; cv.oy = top ? 0 : cv.height;
    r = rng(o.seed >>> 0);
    c.save(); c.translate(cv.ox, cv.oy); c.scale(u, -u); def[0](); c.restore();
    return cv;
  }
  return { strip: strip, job: job, single: single, names: Object.keys(G) };
})();

