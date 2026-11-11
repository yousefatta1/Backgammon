// SVG board renderer with material themes. Pure function of its inputs: returns an SVG string.
import { countAt } from './engine.js';

export const CHECKER_COLORS = {
  ivory:    { label: 'Ivory',    fill: '#f3e9d6', shade: '#c4ae86', rim: '#8f7752', ink: '#3a2a1d' },
  ruby:     { label: 'Oxblood',  fill: '#a8283a', shade: '#5e0f1b', rim: '#3e0811', ink: '#fbe9e9' },
  onyx:     { label: 'Ebony',    fill: '#3b3537', shade: '#151213', rim: '#050404', ink: '#f3e9d6' },
  sapphire: { label: 'Sapphire', fill: '#3d68b8', shade: '#1b346a', rim: '#0f2147', ink: '#f2f6ff' },
  gold:     { label: 'Gold',     fill: '#e5bd5c', shade: '#9c7320', rim: '#6b4d0f', ink: '#3a2a1d' },
  rose:     { label: 'Blush',    fill: '#eeb3c2', shade: '#b86a83', rim: '#86425a', ink: '#4a1a28' },
  lilac:    { label: 'Amethyst', fill: '#9a82d2', shade: '#58448f', rim: '#3a2b66', ink: '#ffffff' },
  mint:     { label: 'Jade',     fill: '#7ccaa8', shade: '#3c8466', rim: '#235743', ink: '#123326' },
};

export const THEMES = {
  walnut: {
    label: 'Walnut & Brass',
    frame: ['#6a3f24', '#4a2a17', '#2b160a'], grain: 0.55, trim: '#c9a25a', trimOpacity: 0.85,
    field: ['#4a2e1f', '#2c190f'], fieldTexture: 'leather', stitch: '#c9a25a',
    ptA: ['#efdcb6', '#d2b98a'], ptB: ['#8a2430', '#5c1119'], ptEdge: 'rgba(0,0,0,.25)',
    bar: ['#3a2213', '#22120a'], tray: '#1a0d06',
    die: { body: ['#fffaf0', '#e6d8bf'], edge: '#b9a582', pip: '#2a1a14' },
    numColor: '#d9bd8c', glow: '#ffd27a',
  },
  emerald: {
    label: 'Emerald Club',
    frame: ['#7a2c1a', '#4f1a0e', '#270a04'], grain: 0.45, trim: '#d8b45c', trimOpacity: 0.9,
    field: ['#226b50', '#0d3a2a'], fieldTexture: 'felt', stitch: null,
    ptA: ['#f2e6cc', '#d9c69e'], ptB: ['#26231f', '#0d0c0b'], ptEdge: '#d8b45c',
    bar: ['#4a190c', '#260a04'], tray: '#160602',
    die: { body: ['#fffdf6', '#ebe0c8'], edge: '#bfae8a', pip: '#7a1220' },
    numColor: '#e6cd8f', glow: '#ffe08a',
  },
  marble: {
    label: 'Midnight Marble',
    frame: ['#2a2a2e', '#151517', '#070708'], grain: 0, trim: '#d4af37', trimOpacity: 1,
    field: ['#1d1d21', '#0c0c0e'], fieldTexture: 'marble', stitch: null,
    ptA: ['#e9cf8e', '#b8913f'], ptB: ['#4a4a52', '#2a2a30'], ptEdge: 'rgba(212,175,55,.55)',
    bar: ['#141416', '#09090a'], tray: '#050506',
    die: { body: ['#36363c', '#18181b'], edge: '#d4af37', pip: '#f0cf72' },
    numColor: '#d4af37', glow: '#ffe08a',
  },
};

const W = 940, H = 640;
const TOP = 26, BOT = 614, MID = 320, PT_H = 250;
const R = 27, STEP = 54;
const BAR_X = 414, TRAY_X = 872;

export function slotX(d) {
  if (d <= 5) return 774 - d * 60;
  if (d <= 11) return 354 - (d - 6) * 60;
  if (d <= 17) return 54 + (d - 12) * 60;
  return 474 + (d - 18) * 60;
}
const isTop = (d) => d >= 12;
const disp = (i, persp) => (persp === 0 ? i : 23 - i);

function stackStep(n, room) {
  return n <= 1 ? STEP : Math.min(STEP, (room - 2 * R) / (n - 1));
}

function checkerPos(d, k, n) {
  const sp = stackStep(n, PT_H);
  const x = slotX(d);
  const y = isTop(d) ? TOP + R + k * sp : BOT - R - k * sp;
  return [x, y];
}

function barPos(own, k, n) {
  const sp = stackStep(n, 230);
  return own ? [BAR_X, MID + 62 + k * sp] : [BAR_X, MID - 62 - k * sp];
}

function trayTop(own) {
  return own ? [TRAY_X, BOT - 120] : [TRAY_X, TOP + 120];
}

function anchor(loc, player, persp, board) {
  if (loc === 'bar') return [BAR_X, player === persp ? MID + 62 : MID - 62];
  if (loc === 'off') return trayTop(player === persp);
  const d = disp(loc, persp);
  const n = Math.max(1, Math.abs(board.pts[loc]));
  return checkerPos(d, Math.min(n, 5) - 1, n);
}

function checker(x, y, color, extra = '', label = '') {
  const c = CHECKER_COLORS[color] || CHECKER_COLORS.ivory;
  return `<g class="ck ${extra}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <circle class="ck-body" r="${R}" fill="url(#cg-${color})" stroke="${c.rim}" stroke-width="1.2"/>
    <circle r="${R - 3.5}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1"/>
    <circle r="${R - 8}" fill="url(#cf-${color})" stroke="${c.rim}" stroke-opacity=".45" stroke-width="1"/>
    <circle r="${R - 13}" fill="none" stroke="${c.shade}" stroke-opacity=".5" stroke-width="1"/>
    <ellipse cx="-6" cy="-10" rx="14" ry="7" fill="url(#gloss)" transform="rotate(-25)"/>
    ${label ? `<text class="ck-n" y="5.5" fill="${c.ink}">${label}</text>` : ''}
  </g>`;
}

function checkerDefs(color) {
  const c = CHECKER_COLORS[color] || CHECKER_COLORS.ivory;
  return `<radialGradient id="cg-${color}" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="${c.fill}"/><stop offset=".75" stop-color="${c.shade}"/><stop offset="1" stop-color="${c.rim}"/>
    </radialGradient>
    <radialGradient id="cf-${color}" cx="60%" cy="65%" r="80%">
      <stop offset="0" stop-color="${c.fill}"/><stop offset="1" stop-color="${c.shade}"/>
    </radialGradient>`;
}

function themeDefs(t) {
  let tex = '';
  if (t.fieldTexture === 'felt') {
    tex = `<filter id="tex" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/>
      <feComposite in2="SourceGraphic" operator="in"/></filter>`;
  } else if (t.fieldTexture === 'leather') {
    tex = `<filter id="tex" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="4" seed="9"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.12"/>
      <feComposite in2="SourceGraphic" operator="in"/></filter>`;
  } else if (t.fieldTexture === 'marble') {
    tex = `<filter id="tex" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency=".005 .009" numOctaves="5" seed="17"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 .92  0 0 0 0 .78  -7 0 0 0 1.05"/>
      <feComponentTransfer><feFuncA type="linear" slope=".42"/></feComponentTransfer>
      <feComposite in2="SourceGraphic" operator="in"/></filter>`;
  }
  return `
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.frame[0]}"/><stop offset=".55" stop-color="${t.frame[1]}"/><stop offset="1" stop-color="${t.frame[2]}"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".004 .16" numOctaves="3" seed="2"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${t.grain * 1.6} -${t.grain * 0.55}"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.field[0]}"/><stop offset="1" stop-color="${t.field[1]}"/>
    </linearGradient>
    ${tex}
    <radialGradient id="vignette" cx="50%" cy="45%" r="70%">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </radialGradient>
    <linearGradient id="ptA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.ptA[0]}"/><stop offset="1" stop-color="${t.ptA[1]}"/></linearGradient>
    <linearGradient id="ptB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.ptB[0]}"/><stop offset="1" stop-color="${t.ptB[1]}"/></linearGradient>
    <linearGradient id="ptA2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${t.ptA[0]}"/><stop offset="1" stop-color="${t.ptA[1]}"/></linearGradient>
    <linearGradient id="ptB2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${t.ptB[0]}"/><stop offset="1" stop-color="${t.ptB[1]}"/></linearGradient>
    <linearGradient id="barG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.bar[1]}"/><stop offset=".5" stop-color="${t.bar[0]}"/><stop offset="1" stop-color="${t.bar[1]}"/>
    </linearGradient>
    <radialGradient id="gloss" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dieG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.die.body[0]}"/><stop offset="1" stop-color="${t.die.body[1]}"/>
    </linearGradient>
    <radialGradient id="pipG" cx="40%" cy="35%" r="65%">
      <stop offset="0" stop-color="${t.die.pip}" stop-opacity=".75"/><stop offset="1" stop-color="${t.die.pip}"/>
    </radialGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="2.6" flood-color="#000" flood-opacity=".55"/></filter>
    <filter id="inset" x="0" y="0" width="100%" height="100%">
      <feFlood flood-color="#000" flood-opacity=".7"/><feComposite in2="SourceAlpha" operator="out"/>
      <feGaussianBlur stdDeviation="7"/><feOffset dy="3"/><feComposite in2="SourceAlpha" operator="in"/>
    </filter>
    <marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${t.glow}"/>
    </marker>`;
}

const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function die(x, y, v, size, used, cls, t, tilt) {
  const h = size / 2, o = size * 0.26, pr = size * 0.088;
  return `<g class="die ${used ? 'used' : ''} ${cls}" transform="translate(${x} ${y}) rotate(${tilt})">
    <rect x="${-h}" y="${-h}" width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#dieG)" stroke="${t.die.edge}" stroke-width="1.3" filter="url(#sh)"/>
    <rect x="${-h + 3}" y="${-h + 3}" width="${size - 6}" height="${size - 6}" rx="${size * 0.18}" fill="none" stroke="#fff" stroke-opacity=".25"/>
    ${PIPS[v].map(([a, b]) => `<circle cx="${a * o}" cy="${b * o}" r="${pr}" fill="url(#pipG)"/>`).join('')}
  </g>`;
}

function trianglePath(x, top) {
  const base = top ? TOP : BOT;
  const tip = top ? TOP + PT_H : BOT - PT_H;
  return `M${x - 28} ${base} L${x - 2} ${tip} Q${x} ${tip + (top ? 4 : -4)} ${x + 2} ${tip} L${x + 28} ${base} Z`;
}

/**
 * opts: {
 *   theme, board, persp, colors:[c0,c1], dice, remaining, mover, selected, sources:Set, targets:Set,
 *   arrows:[{from,to,player}], anim:{to, player, fromXY}, rollable, rolling, rollLabel, opening
 * }
 */
export function renderBoard(o) {
  const t = THEMES[o.theme] || THEMES.walnut;
  const { board, persp } = o;
  const colorOf = (p) => o.colors[p];
  const parts = [];

  parts.push(`<defs>${themeDefs(t)}${[...new Set(o.colors)].map(checkerDefs).join('')}</defs>`);

  // Frame with grain and a fine inlay line
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="24" fill="url(#wood)"/>`);
  if (t.grain) parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="24" fill="#000" filter="url(#grain)"/>`);
  parts.push(`<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="23" fill="none" stroke="#fff" stroke-opacity=".12"/>
    <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="17" fill="none" stroke="${t.trim}" stroke-opacity="${t.trimOpacity}" stroke-width="1.6"/>`);

  // Playing fields
  for (const fx of [24, 444]) {
    parts.push(`<rect x="${fx}" y="${TOP}" width="360" height="${BOT - TOP}" rx="5" fill="url(#field)"/>`);
    if (t.fieldTexture) parts.push(`<rect x="${fx}" y="${TOP}" width="360" height="${BOT - TOP}" rx="5" fill="#000" filter="url(#tex)"/>`);
    if (t.stitch) parts.push(`<rect x="${fx + 7}" y="${TOP + 7}" width="346" height="${BOT - TOP - 14}" rx="4" fill="none" stroke="${t.stitch}" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="6 5"/>`);
  }
  // Bar and tray
  parts.push(`<rect x="388" y="${TOP - 4}" width="52" height="${BOT - TOP + 8}" rx="8" fill="url(#barG)"/>
    <line x1="414" x2="414" y1="${TOP + 6}" y2="${BOT - 6}" stroke="${t.trim}" stroke-opacity=".35"/>
    <rect x="828" y="${TOP}" width="88" height="${BOT - TOP}" rx="10" fill="${t.tray}"/>
    <rect x="828" y="${TOP}" width="88" height="${BOT - TOP}" rx="10" fill="#000" filter="url(#inset)"/>
    <line x1="840" x2="904" y1="${MID}" y2="${MID}" stroke="${t.trim}" stroke-opacity=".4"/>`);

  // Points
  for (let d = 0; d < 24; d++) {
    const x = slotX(d);
    const top = isTop(d);
    const alt = d % 2 === 0;
    const fill = alt ? (top ? 'url(#ptB)' : 'url(#ptB2)') : (top ? 'url(#ptA)' : 'url(#ptA2)');
    const real = persp === 0 ? d : 23 - d;
    parts.push(`<path d="${trianglePath(x, top)}" fill="${fill}" stroke="${t.ptEdge}" stroke-width="1"/>`);
    if (o.targets?.has(real)) parts.push(`<path class="target-glow" d="${trianglePath(x, top)}" fill="${t.glow}"/>`);
    parts.push(`<text class="pt-num" fill="${t.numColor}" x="${x}" y="${top ? TOP - 9 : BOT + 18}">${d + 1}</text>`);
  }
  // Inner shadow over fields gives depth under the frame lip
  for (const fx of [24, 444]) parts.push(`<rect x="${fx}" y="${TOP}" width="360" height="${BOT - TOP}" rx="5" fill="#000" filter="url(#inset)" pointer-events="none"/>`);

  // Last-turn arrows
  for (const a of o.arrows || []) {
    const [x1, y1] = anchor(a.from, a.player, persp, board);
    const [x2, y2] = anchor(a.to, a.player, persp, board);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + (Math.abs(x2 - x1) < 10 ? 0 : (y1 < MID ? 60 : -60));
    parts.push(`<path class="move-arrow" stroke="${t.glow}" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" marker-end="url(#arrowhead)"/>`);
  }

  // Checkers on points
  for (let i = 0; i < 24; i++) {
    const v = board.pts[i];
    if (!v) continue;
    const p = v > 0 ? 0 : 1;
    const n = Math.abs(v);
    const d = disp(i, persp);
    const isSource = o.sources?.has(i);
    const isSel = o.selected === i;
    for (let k = 0; k < n; k++) {
      const [x, y] = checkerPos(d, k, n);
      const topMost = k === n - 1;
      let cls = '';
      if (topMost && isSource) cls += ' src';
      if (topMost && isSel) cls += ' sel';
      let g = checker(x, y, colorOf(p), cls, topMost && n > 5 ? String(n) : '');
      if (topMost && o.anim && o.anim.to === i) g = animWrap(g, o.anim.fromXY, [x, y]);
      parts.push(g);
    }
    if (isSource || o.targets?.has(i)) {
      const top = isTop(d);
      parts.push(`<rect class="hit" data-pt="${i}" x="${slotX(d) - 30}" y="${top ? TOP : BOT - PT_H - 20}" width="60" height="${PT_H + 20}"/>`);
    }
  }
  for (const tg of o.targets || []) {
    if (tg === 'off' || board.pts[tg]) continue;
    const d = disp(tg, persp);
    const top = isTop(d);
    parts.push(`<rect class="hit" data-pt="${tg}" x="${slotX(d) - 30}" y="${top ? TOP : BOT - PT_H - 20}" width="60" height="${PT_H + 20}"/>`);
  }
  for (const tg of o.targets || []) {
    if (tg === 'off') continue;
    const d = disp(tg, persp);
    const n = countAt(board, o.mover, tg);
    const [x, y] = checkerPos(d, Math.min(n, 5), Math.max(n + 1, 1));
    parts.push(`<circle class="target-dot" stroke="${t.glow}" cx="${x}" cy="${y}" r="${R - 4}" pointer-events="none"/>`);
  }

  // Bar
  for (const p of [0, 1]) {
    const n = board.bar[p];
    const own = p === persp;
    for (let k = 0; k < n; k++) {
      const [x, y] = barPos(own, k, n);
      const topMost = k === n - 1;
      let cls = '';
      if (topMost && o.sources?.has('bar') && o.mover === p) cls += ' src';
      if (topMost && o.selected === 'bar' && o.mover === p) cls += ' sel';
      let g = checker(x, y, colorOf(p), cls, topMost && n > 1 ? String(n) : '');
      if (topMost && o.anim && o.anim.to === 'bar' && o.anim.player === p) g = animWrap(g, o.anim.fromXY, [x, y]);
      parts.push(g);
    }
    if (n && o.sources?.has('bar') && o.mover === p) {
      parts.push(`<rect class="hit" data-pt="bar" x="388" y="${own ? MID : TOP}" width="52" height="${MID - TOP}"/>`);
    }
  }

  // Borne-off trays: checkers seen edge-on
  for (const p of [0, 1]) {
    const own = p === persp;
    const c = CHECKER_COLORS[colorOf(p)];
    for (let k = 0; k < board.off[p]; k++) {
      const y = own ? BOT - 16 - k * 15.5 : TOP + 4 + k * 15.5;
      parts.push(`<rect x="842" y="${y}" width="60" height="12.5" rx="5" fill="url(#cg-${colorOf(p)})" stroke="${c.rim}" stroke-width="1"/>`);
    }
    if (board.off[p]) {
      parts.push(`<text class="tray-n" fill="${t.numColor}" x="${TRAY_X}" y="${own ? BOT - 26 - board.off[p] * 15.5 : TOP + 32 + board.off[p] * 15.5}">${board.off[p]}</text>`);
    }
  }
  if (o.targets?.has('off')) {
    const own = o.mover === persp;
    parts.push(`<rect class="tray-target" stroke="${t.glow}" x="832" y="${own ? MID + 6 : TOP + 4}" width="80" height="${MID - TOP - 10}" rx="9"/>`);
    parts.push(`<rect class="hit" data-pt="off" x="828" y="${own ? MID : TOP}" width="88" height="${MID - TOP}"/>`);
    parts.push(`<text class="tray-hint" fill="${t.glow}" x="${TRAY_X}" y="${own ? MID + 34 : MID - 22}">bear off</text>`);
  }

  // Dice sit on the mover's right-hand field, like a real table
  if (o.dice) {
    const right = o.mover === persp || o.mover == null;
    const cx = right ? 624 : 204;
    const vals = o.dice[0] === o.dice[1] ? [o.dice[0], o.dice[0], o.dice[0], o.dice[0]] : o.dice.slice();
    const size = vals.length === 4 ? 48 : 60;
    const gap = vals.length === 4 ? 12 : 22;
    const total = vals.length * size + (vals.length - 1) * gap;
    const left = o.remaining ? o.remaining.slice() : vals.slice();
    const usedFlags = vals.map(() => true);
    for (const r of left) {
      const idx = vals.findIndex((v, j) => v === r && usedFlags[j]);
      if (idx >= 0) usedFlags[idx] = false;
    }
    const tilts = [-9, 7, -4, 11];
    vals.forEach((v, j) => {
      const x = cx - total / 2 + size / 2 + j * (size + gap);
      parts.push(die(x, MID, v, size, o.remaining ? usedFlags[j] : false, o.rolling ? 'rolling' : '', t, tilts[j]));
    });
    if (o.opening) parts.push(`<text class="dice-cap" fill="${t.numColor}" x="${cx}" y="${MID + 56}">${o.opening}</text>`);
  } else if (o.rollable) {
    const cx = o.mover === persp || o.mover == null ? 624 : 204;
    parts.push(`<g class="roll-cta" data-action="roll" transform="translate(${cx} ${MID})">
      <rect x="-92" y="-31" width="184" height="62" rx="31" fill="rgba(0,0,0,.45)" stroke="${t.trim}" stroke-width="1.6"/>
      <text y="7" fill="#fff5e0">${o.rollLabel || 'Roll dice'}</text>
    </g>`);
  }

  // Soft vignette, like a lamp over the table
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="24" fill="url(#vignette)" pointer-events="none"/>`);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="board-svg" role="img" aria-label="Backgammon board">${parts.join('')}</svg>`;
  // Gradient and filter ids are global to the page, so boards that share a page need their own prefix.
  if (o.idp) svg = svg.replace(/id="([^"]+)"/g, `id="${o.idp}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${o.idp}$1)`);
  return svg;
}

function animWrap(g, fromXY, toXY) {
  if (!fromXY) return g;
  const dx = fromXY[0] - toXY[0], dy = fromXY[1] - toXY[1];
  return `<g class="arrive" style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px">${g}</g>`;
}

export function originXY(boardBefore, m, player, persp) {
  if (m.from === 'bar') {
    const n = boardBefore.bar[player];
    return barPos(player === persp, n - 1, n);
  }
  const n = countAt(boardBefore, player, m.from);
  return checkerPos(disp(m.from, persp), n - 1, n);
}
