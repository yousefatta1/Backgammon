// Game-state transitions. Every function returns a new state object; nothing mutates.
import {
  startBoard, applyMove, nextMoves, scoreWin, rollDie, sameMove, CHECKERS,
} from './engine.js';

export function newRoom(players) {
  return newGame({ v: 1, players, gameNo: 0, stake: '' }, '');
}

export function newGame(prev, stake = prev.stake || '') {
  return {
    v: 1,
    players: prev.players,
    gameNo: (prev.gameNo || 0) + 1,
    phase: 'opening',
    board: startBoard(),
    turn: null,
    dice: null,
    start: null,
    made: [],
    opening: null,
    last: null,
    stake,
    startedAt: null,
    turns: 0,
    result: null,
    lastWinner: prev.result ? prev.result.winner : prev.lastWinner ?? null,
  };
}

const rand = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
};

// Each side throws one die; the higher die moves first and plays both numbers.
export function openingRoll(s) {
  let a, b;
  do { a = rollDie(rand); b = rollDie(rand); } while (a === b);
  const turn = a > b ? 0 : 1;
  return {
    ...s,
    phase: 'moving',
    opening: [a, b],
    turn,
    dice: [a, b],
    start: s.board,
    made: [],
    startedAt: new Date().toISOString(),
    turns: 1,
  };
}

export function roll(s) {
  const dice = [rollDie(rand), rollDie(rand)];
  return { ...s, phase: 'moving', dice, start: s.board, made: [], opening: null };
}

export function legalNow(s) {
  if (s.phase !== 'moving') return [];
  return nextMoves(s.start, s.turn, s.dice, s.made);
}

export function move(s, m) {
  const legal = legalNow(s).find((x) => sameMove(x, m));
  if (!legal) return null;
  const hit = m.to !== 'off' && s.board.pts[m.to] !== 0 &&
    Math.sign(s.board.pts[m.to]) !== (s.turn === 0 ? 1 : -1);
  const board = applyMove(s.board, s.turn, legal);
  const made = s.made.concat([{ ...legal, hit }]);
  const next = { ...s, board, made };
  if (board.off[s.turn] === CHECKERS) {
    const w = scoreWin(board, s.turn);
    return {
      ...next,
      phase: 'over',
      last: { player: s.turn, dice: s.dice, moves: made },
      result: { winner: s.turn, ...w, stake: s.stake, turns: s.turns, startedAt: s.startedAt },
    };
  }
  return next;
}

export function undo(s) {
  if (s.phase !== 'moving' || !s.made.length) return s;
  return { ...s, board: s.start, made: [] };
}

export function canEndTurn(s) {
  return s.phase === 'moving' && legalNow(s).length === 0;
}

export function endTurn(s) {
  return {
    ...s,
    phase: 'rolling',
    last: { player: s.turn, dice: s.dice, moves: s.made },
    turn: 1 - s.turn,
    dice: null,
    start: null,
    made: [],
    opening: null,
    turns: s.turns + 1,
  };
}

export function resign(s, who) {
  const winner = 1 - who;
  return {
    ...s,
    phase: 'over',
    result: {
      winner, kind: 'single', points: 1, resigned: true,
      stake: s.stake, turns: s.turns, startedAt: s.startedAt,
    },
  };
}
