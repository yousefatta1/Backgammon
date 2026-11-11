// Pure backgammon rules. No DOM, no network, so it runs in Node tests too.
//
// Board: pts[0..23]. Positive counts are player 0's checkers, negative are player 1's.
// Player 0 moves from index 23 toward 0 and bears off past 0 (home = 0..5).
// Player 1 moves from index 0 toward 23 and bears off past 23 (home = 18..23).

export const CHECKERS = 15;

export function startBoard() {
  const pts = Array(24).fill(0);
  pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return { pts, bar: [0, 0], off: [0, 0] };
}

const sgn = (p) => (p === 0 ? 1 : -1);
export const countAt = (b, p, i) => Math.max(0, b.pts[i] * sgn(p));
const inHome = (p, i) => (p === 0 ? i <= 5 : i >= 18);
const distance = (p, i) => (p === 0 ? i + 1 : 24 - i);
const entry = (p, die) => (p === 0 ? 24 - die : die - 1);
const canLand = (b, p, i) => b.pts[i] * sgn(p) >= -1;

export function cloneBoard(b) {
  return { pts: b.pts.slice(), bar: b.bar.slice(), off: b.off.slice() };
}

function allHome(b, p) {
  if (b.bar[p]) return false;
  for (let i = 0; i < 24; i++) if (countAt(b, p, i) && !inHome(p, i)) return false;
  return true;
}

export function singleMoves(b, p, die) {
  const out = [];
  if (b.bar[p] > 0) {
    const t = entry(p, die);
    if (canLand(b, p, t)) out.push({ from: 'bar', to: t, die });
    return out;
  }
  const home = allHome(b, p);
  for (let i = 0; i < 24; i++) {
    if (!countAt(b, p, i)) continue;
    const t = p === 0 ? i - die : i + die;
    if (t >= 0 && t <= 23) {
      if (canLand(b, p, t)) out.push({ from: i, to: t, die });
    } else if (home) {
      const d = distance(p, i);
      if (die === d) {
        out.push({ from: i, to: 'off', die });
      } else if (die > d) {
        let farther = false;
        for (let j = 0; j < 24; j++) {
          if (countAt(b, p, j) && distance(p, j) > d) { farther = true; break; }
        }
        if (!farther) out.push({ from: i, to: 'off', die });
      }
    }
  }
  return out;
}

export function applyMove(b, p, m) {
  const n = cloneBoard(b);
  const s = sgn(p);
  if (m.from === 'bar') n.bar[p]--;
  else n.pts[m.from] -= s;
  if (m.to === 'off') {
    n.off[p]++;
  } else {
    if (n.pts[m.to] * s === -1) {
      n.pts[m.to] = 0;
      n.bar[1 - p]++;
    }
    n.pts[m.to] += s;
  }
  return n;
}

// Every legal full-turn move sequence, honoring "use as many dice as possible"
// and "if only one die can be played, play the higher one when you can".
export function legalSequences(b, p, dice) {
  const all = [];
  (function rec(board, rest, seq) {
    let any = false;
    const tried = new Set();
    for (let k = 0; k < rest.length; k++) {
      const d = rest[k];
      if (tried.has(d)) continue;
      tried.add(d);
      const remaining = rest.slice(0, k).concat(rest.slice(k + 1));
      for (const m of singleMoves(board, p, d)) {
        any = true;
        rec(applyMove(board, p, m), remaining, seq.concat([m]));
      }
    }
    if (!any) all.push(seq);
  })(b, dice, []);

  const max = all.reduce((a, s) => Math.max(a, s.length), 0);
  let legal = all.filter((s) => s.length === max);
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(dice[0], dice[1]);
    if (legal.some((s) => s[0].die === hi)) legal = legal.filter((s) => s[0].die === hi);
  }
  return legal;
}

const mk = (m) => `${m.from}>${m.to}:${m.die}`;
export const sameMove = (a, b) => a.from === b.from && a.to === b.to && a.die === b.die;

// Moves available next, given the board at the start of the turn and moves already made.
export function nextMoves(startBoard, p, dice, made) {
  const seqs = legalSequences(startBoard, p, expandDice(dice));
  const out = [];
  const keys = new Set();
  for (const s of seqs) {
    if (s.length <= made.length) continue;
    let ok = true;
    for (let i = 0; i < made.length; i++) if (!sameMove(s[i], made[i])) { ok = false; break; }
    if (!ok) continue;
    const m = s[made.length];
    const k = mk(m);
    if (!keys.has(k)) { keys.add(k); out.push({ from: m.from, to: m.to, die: m.die }); }
  }
  return out;
}

export const expandDice = (d) => (d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]]);

export function remainingDice(dice, made) {
  const left = expandDice(dice);
  for (const m of made) {
    const i = left.indexOf(m.die);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

export function pipCount(b, p) {
  let n = b.bar[p] * 25;
  for (let i = 0; i < 24; i++) n += countAt(b, p, i) * distance(p, i);
  return n;
}

export function scoreWin(b, winner) {
  const loser = 1 - winner;
  if (b.off[loser] > 0) return { kind: 'single', points: 1 };
  let trapped = b.bar[loser] > 0;
  for (let i = 0; i < 24 && !trapped; i++) {
    if (countAt(b, loser, i) && inHome(winner, i)) trapped = true;
  }
  return trapped ? { kind: 'backgammon', points: 3 } : { kind: 'gammon', points: 2 };
}

export function rollDie(rand = Math.random) {
  return 1 + Math.floor(rand() * 6);
}
