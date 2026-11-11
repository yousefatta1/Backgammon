// SVG board renderer. Pure function of its inputs: returns an SVG string.
import { countAt } from './engine.js';

export const CHECKER_COLORS = {
  ivory:    { label: 'Ivory',    fill: '#f6ecda', shade: '#cdb994', rim: '#9c865f', ink: '#3a2a1d' },
  ruby:     { label: 'Ruby',     fill: '#d0435b', shade: '#83202f', rim: '#5a1322', ink: '#fff4f4' },
  onyx:     { label: 'Onyx',     fill: '#4a4345', shade: '#1f1a1b', rim: '#0b0909', ink: '#f6ecda' },
  sapphire: { label: 'Sapphire', fill: '#4a7fd6', shade: '#22427d', rim: '#142a52', ink: '#f2f6ff' },
  gold:     { label: 'Gold',     fill: '#ecc25a', shade: '#a97c1f', rim: '#73520f', ink: '#3a2a1d' },
  rose:     { label: 'Blush',    fill: '#f4b0c2', shade: '#c66c88', rim: '#94485f', ink: '#4a1a28' },
  lilac:    { label: 'Lilac',    fill: '#a891e0', shade: '#6550a3', rim: '#40316f', ink: '#ffffff' },
  mint:     { label: 'Mint',     fill: '#8fd8bb', shade: '#4a9a7c', rim: '#2c6650', ink: '#123326' },
};

const W = 940, H = 640;
const TOP = 24, BOT = 616, MID = 320, PT_H = 252;
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
  // Where an arrow for a move should start or end.
  if (loc === 'bar') return [BAR_X, player === persp ? MID + 62 : MID - 62];
  if (loc === 'off') return trayTop(player === persp);
  const d = disp(loc, persp);
  const n = Math.max(1, Math.abs(board.pts[loc]));
  return checkerPos(d, Math.min(n, 5) - 1, n);
}

function checker(x, y, color, extra = '', label = '') {
  const c = CHECKER_COLORS[color] || CHECKER_COLORS.ivory;
  return `<g class="ck ${extra}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
    <circle r="${R}" fill="url(#g-${color})" stroke="${c.rim}" stroke-width="1.5"/>
    <circle r="${R - 7}" fill="none" stroke="${c.shade}" stroke-opacity=".55" stroke-width="1.5"/>
    <circle r="${R - 13}" fill="none" stroke="${c.rim}" stroke-opacity=".25" stroke-width="1"/>
    ${label ? `<text class="ck-n" y="6" fill="${c.ink}">${label}</text>` : ''}
  </g>`;
}

function gradient(color) {
  const c = CHECKER_COLORS[color] || CHECKER_COLORS.ivory;
  return `<radialGradient id="g-${color}" cx="38%" cy="32%" r="75%">
    <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
    <stop offset=".18" stop-color="${c.fill}"/>
    <stop offset="1" stop-color="${c.shade}"/>
  </radialGradient>`;
}

const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function die(x, y, v, size, used, cls) {
  const h = size / 2, o = size * 0.26, pr = size * 0.085;
  return `<g class="die ${used ? 'used' : ''} ${cls}" transform="translate(${x} ${y})">
    <rect x="${-h}" y="${-h}" width="${size}" height="${size}" rx="${size * 0.2}" class="die-body"/>
    ${PIPS[v].map(([a, b]) => `<circle cx="${a * o}" cy="${b * o}" r="${pr}" class="die-pip"/>`).join('')}
  </g>`;
}

/**
 * opts: {
 *   board, persp, colors:[c0,c1], dice, remaining, mover, selected, sources:Set, targets:Set,
 *   arrows:[{from,to,player}], anim:{to, player, from}, rollable, rolling, overlay
 * }
 */
export function renderBoard(o) {
  const { board, persp } = o;
  const colorOf = (p) => o.colors[p];
  const parts = [];

  parts.push(`<defs>
    ${[...new Set(o.colors)].map(gradient).join('')}
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5a3624"/><stop offset=".5" stop-color="#3f2416"/><stop offset="1" stop-color="#2c180e"/>
    </linearGradient>
    <radialGradient id="felt" cx="50%" cy="50%" r="75%">
      <stop offset="0" stop-color="#2d5546"/><stop offset="1" stop-color="#173229"/>
    </radialGradient>
    <linearGradient id="ptA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe1c6"/><stop offset="1" stop-color="#d8c39c"/></linearGradient>
    <linearGradient id="ptB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2573d"/><stop offset="1" stop-color="#93361f"/></linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-opacity=".45"/></filter>
    <marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#ffd27a"/>
    </marker>
  </defs>`);

  // Frame, felt, bar, tray
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="22" fill="url(#wood)"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="12" fill="none" stroke="#000" stroke-opacity=".25"/>
    <rect x="24" y="${TOP}" width="360" height="${BOT - TOP}" rx="4" fill="url(#felt)"/>
    <rect x="444" y="${TOP}" width="360" height="${BOT - TOP}" rx="4" fill="url(#felt)"/>
    <rect x="388" y="${TOP}" width="52" height="${BOT - TOP}" rx="6" fill="#26150c" opacity=".55"/>
    <rect x="828" y="${TOP}" width="88" height="${BOT - TOP}" rx="10" fill="#1a0e08" opacity=".55"/>
    <line x1="836" x2="908" y1="${MID}" y2="${MID}" stroke="#000" stroke-opacity=".35"/>`);

  // Points
  for (let d = 0; d < 24; d++) {
    const x = slotX(d);
    const top = isTop(d);
    const base = top ? TOP : BOT;
    const tip = top ? TOP + PT_H : BOT - PT_H;
    const fill = (d % 2 === 0) ? 'url(#ptB)' : 'url(#ptA)';
    const real = persp === 0 ? d : 23 - d;
    const isTarget = o.targets?.has(real);
    parts.push(`<path d="M${x - 29} ${base} L${x} ${tip} L${x + 29} ${base} Z" fill="${fill}" opacity=".94"/>`);
    if (isTarget) {
      parts.push(`<path class="target-glow" d="M${x - 29} ${base} L${x} ${tip} L${x + 29} ${base} Z"/>`);
    }
    // Point numbers count from the viewer's side: 1 is the deepest home point.
    parts.push(`<text class="pt-num" x="${x}" y="${top ? TOP - 8 : BOT + 17}">${d + 1}</text>`);
  }

  // Last-turn arrows (drawn under checkers)
  for (const a of o.arrows || []) {
    const [x1, y1] = anchor(a.from, a.player, persp, a.boardBefore || board);
    const [x2, y2] = anchor(a.to, a.player, persp, board);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + (Math.abs(x2 - x1) < 10 ? 0 : (y1 < MID ? 60 : -60));
    parts.push(`<path class="move-arrow" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" marker-end="url(#arrowhead)"/>`);
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
      const label = topMost && n > 5 ? String(n) : '';
      let g = checker(x, y, colorOf(p), cls, label);
      if (topMost && o.anim && o.anim.to === i) g = animWrap(g, o.anim.fromXY, [x, y]);
      parts.push(g);
    }
    if (isSource || o.targets?.has(i)) {
      const top = isTop(d);
      parts.push(`<rect class="hit" data-pt="${i}" x="${slotX(d) - 30}" y="${top ? TOP : BOT - PT_H - 20}" width="60" height="${PT_H + 20}"/>`);
    }
  }
  // Empty target points still need click areas
  for (const t of o.targets || []) {
    if (t === 'off' || board.pts[t]) continue;
    const d = disp(t, persp);
    const top = isTop(d);
    parts.push(`<rect class="hit" data-pt="${t}" x="${slotX(d) - 30}" y="${top ? TOP : BOT - PT_H - 20}" width="60" height="${PT_H + 20}"/>`);
  }

  // Target dots
  for (const t of o.targets || []) {
    if (t === 'off') continue;
    const d = disp(t, persp);
    const n = countAt(board, o.mover, t);
    const [x, y] = checkerPos(d, Math.min(n, 5), Math.max(n + 1, 1));
    parts.push(`<circle class="target-dot" cx="${x}" cy="${y}" r="${R - 4}" pointer-events="none"/>`);
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

  // Borne-off trays
  for (const p of [0, 1]) {
    const own = p === persp;
    const c = CHECKER_COLORS[colorOf(p)];
    for (let k = 0; k < board.off[p]; k++) {
      const y = own ? BOT - 14 - k * 15.5 : TOP + 2 + k * 15.5;
      parts.push(`<rect x="840" y="${y}" width="64" height="12" rx="4" fill="${c.fill}" stroke="${c.rim}" stroke-width="1.2"/>`);
    }
    if (board.off[p]) {
      parts.push(`<text class="tray-n" x="${TRAY_X}" y="${own ? BOT - 24 - board.off[p] * 15.5 : TOP + 30 + board.off[p] * 15.5}">${board.off[p]}</text>`);
    }
  }
  if (o.targets?.has('off')) {
    const own = o.mover === persp;
    parts.push(`<rect class="tray-target" x="832" y="${own ? MID + 6 : TOP + 4}" width="80" height="${MID - TOP - 10}" rx="9"/>`);
    parts.push(`<rect class="hit" data-pt="off" x="828" y="${own ? MID : TOP}" width="88" height="${MID - TOP}"/>`);
    parts.push(`<text class="tray-hint" x="${TRAY_X}" y="${own ? MID + 34 : MID - 22}">bear off</text>`);
  }

  // Dice: the mover's dice sit on their right-hand field like a real table
  if (o.dice) {
    const right = o.mover === persp || o.mover == null;
    const cx = right ? 624 : 204;
    const vals = o.dice[0] === o.dice[1] ? [o.dice[0], o.dice[0], o.dice[0], o.dice[0]] : o.dice.slice();
    const size = vals.length === 4 ? 46 : 58;
    const gap = vals.length === 4 ? 10 : 16;
    const total = vals.length * size + (vals.length - 1) * gap;
    const left = o.remaining ? o.remaining.slice() : vals.slice();
    const usedFlags = vals.map(() => true);
    // mark the first matching value as unused for each remaining die
    for (const r of left) {
      const idx = vals.findIndex((v, j) => v === r && usedFlags[j]);
      if (idx >= 0) usedFlags[idx] = false;
    }
    vals.forEach((v, j) => {
      const x = cx - total / 2 + size / 2 + j * (size + gap);
      parts.push(die(x, MID, v, size, o.remaining ? usedFlags[j] : false, o.rolling ? 'rolling' : ''));
    });
    if (o.opening) {
      // label opening dice with who threw them
      parts.push(`<text class="dice-cap" x="${cx}" y="${MID + 52}">${o.opening}</text>`);
    }
  } else if (o.rollable) {
    const cx = o.mover === persp || o.mover == null ? 624 : 204;
    parts.push(`<g class="roll-cta" data-action="roll" transform="translate(${cx} ${MID})">
      <rect x="-86" y="-30" width="172" height="60" rx="30"/>
      <text y="7">${o.rollLabel || 'Roll dice'}</text>
    </g>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" class="board-svg" role="img" aria-label="Backgammon board">${parts.join('')}</svg>`;
}

function animWrap(g, fromXY, toXY) {
  if (!fromXY) return g;
  const dx = fromXY[0] - toXY[0], dy = fromXY[1] - toXY[1];
  return `<g class="arrive" style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px">${g}</g>`;
}

// Where the moving checker started, for the arrival animation.
export function originXY(boardBefore, m, player, persp) {
  if (m.from === 'bar') {
    const n = boardBefore.bar[player];
    return barPos(player === persp, n - 1, n);
  }
  const n = countAt(boardBefore, player, m.from);
  return checkerPos(disp(m.from, persp), n - 1, n);
}
