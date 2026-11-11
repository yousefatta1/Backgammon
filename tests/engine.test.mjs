import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startBoard, singleMoves, legalSequences, nextMoves, pipCount, scoreWin, applyMove,
} from '../js/engine.js';
import * as G from '../js/game.js';

const empty = () => ({ pts: Array(24).fill(0), bar: [0, 0], off: [0, 0] });

test('start position has 15 checkers each and 167 pips', () => {
  const b = startBoard();
  const sum = (p) => b.pts.reduce((a, v) => a + Math.max(0, p === 0 ? v : -v), 0);
  assert.equal(sum(0), 15);
  assert.equal(sum(1), 15);
  assert.equal(pipCount(b, 0), 167);
  assert.equal(pipCount(b, 1), 167);
});

test('cannot land on a point with two opposing checkers', () => {
  const b = startBoard();
  // Player 0 from 12 with a 1 lands on 11, which holds 5 of player 1.
  assert.ok(!singleMoves(b, 0, 1).some((m) => m.from === 12 && m.to === 11));
});

test('hitting a blot sends it to the bar', () => {
  const b = empty();
  b.pts[10] = 1; b.pts[7] = -1;
  const n = applyMove(b, 0, { from: 10, to: 7, die: 3 });
  assert.equal(n.pts[7], 1);
  assert.equal(n.bar[1], 1);
});

test('checker on bar must enter first', () => {
  const b = startBoard();
  b.pts[23] = 1; b.bar[0] = 1;
  const ms = singleMoves(b, 0, 3);
  assert.deepEqual(ms, [{ from: 'bar', to: 21, die: 3 }]);
});

test('bearing off with a higher die only from the farthest checker', () => {
  const b = empty();
  b.pts[2] = 1; b.pts[0] = 14;
  const ms = singleMoves(b, 0, 6);
  assert.deepEqual(ms.filter((m) => m.to === 'off').map((m) => m.from), [2]);
});

test('no bearing off while a checker is outside home', () => {
  const b = empty();
  b.pts[6] = 1; b.pts[0] = 14;
  assert.ok(!singleMoves(b, 0, 1).some((m) => m.to === 'off'));
});

test('must use both dice when possible', () => {
  // Player 0 single checker at 10. 6-1: 10->4->3 or 10->9->3 both fine; a lone 6 or 1 is not.
  const b = empty();
  b.pts[10] = 1; b.pts[0] = 14;
  const seqs = legalSequences(b, 0, [6, 1]);
  assert.ok(seqs.every((s) => s.length === 2));
});

test('if only one die playable, must play the higher', () => {
  // Player 0 checker on 7. Player 1 blocks 1 (from 7 with 6) ... set up so either die alone works
  // but not both: 7 -5-> 2 then 1 blocked; 7 -1-> 6 then 5 -> 1 blocked.
  const b = empty();
  b.pts[7] = 1; b.pts[0] = 0;
  b.pts[1] = -2; b.pts[6] = 0;
  // Block 2 from 6? Put opponent on index 2-... make continuation impossible:
  b.pts[2] = 0;
  // 7-5=2 open, then 2-1=1 blocked. 7-1=6 open, then 6-5=1 blocked. So only one die playable.
  b.pts[23] = -13;
  const seqs = legalSequences(b, 0, [5, 1]);
  assert.ok(seqs.length > 0);
  assert.ok(seqs.every((s) => s.length === 1 && s[0].die === 5));
});

test('doubles allow four moves', () => {
  const b = startBoard();
  const seqs = legalSequences(b, 0, [3, 3, 3, 3]);
  assert.ok(seqs.length > 0);
  assert.ok(seqs.every((s) => s.length === 4));
});

test('nextMoves follows prefix', () => {
  const b = startBoard();
  const first = nextMoves(b, 0, [6, 5], []);
  assert.ok(first.length > 0);
  const m = first.find((x) => x.from === 23 && x.die === 6);
  const nb = applyMove(b, 0, m);
  const second = nextMoves(b, 0, [6, 5], [m]);
  assert.ok(second.every((x) => x.die === 5));
  assert.ok(nb);
});

test('gammon and backgammon scoring', () => {
  const b = empty();
  b.off[0] = 15;
  b.pts[12] = -15;
  assert.deepEqual(scoreWin(b, 0), { kind: 'gammon', points: 2 });
  b.pts[12] = -14; b.pts[3] = -1;
  assert.deepEqual(scoreWin(b, 0), { kind: 'backgammon', points: 3 });
  b.pts[3] = 0; b.off[1] = 1;
  assert.deepEqual(scoreWin(b, 0), { kind: 'single', points: 1 });
});

test('random self-play games always finish with legal moves', () => {
  for (let g = 0; g < 30; g++) {
    let s = G.newRoom([{ name: 'A', emoji: '🐻' }, { name: 'B', emoji: '🐰' }]);
    s = G.openingRoll(s);
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 5000) {
      if (s.phase === 'rolling') s = G.roll(s);
      const legal = G.legalNow(s);
      if (legal.length) {
        s = G.move(s, legal[Math.floor(Math.random() * legal.length)]);
        assert.ok(s);
      } else {
        s = G.endTurn(s);
      }
    }
    assert.equal(s.phase, 'over');
    assert.equal(s.board.off[s.result.winner], 15);
  }
});
