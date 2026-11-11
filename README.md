# Backgammon for Two

A private backgammon table for a couple. Each of you plays from your own phone or laptop, live, or you pass one device back and forth.

- **Sign in** with a shared board name + passcode, then pick who's playing on this device.
- **Full rules**: bar entry, hitting, bearing off, forced higher die, must use both dice, gammons (2 pts) and backgammons (3 pts).
- **Stakes**: put something on each game ("loser makes coffee ☕"). Unpaid stakes show up as IOUs until someone taps *Mark paid*.
- **Scoreboard**: all-time wins and points, win rate, gammons, streaks, this week / this month, recent form.
- **History**: every game ever played, filterable.
- **Reactions**: emoji and quick messages that float up on both screens.

## How it's built

Plain HTML/CSS/ES modules, no build step.

| Path | What |
| --- | --- |
| `js/engine.js` | Pure backgammon rules (move generation, legality, scoring) |
| `js/game.js` | Game-state transitions (roll, move, undo, end turn, resign) |
| `js/board.js` | SVG board renderer |
| `js/app.js` | UI: sign in, player picker, table, scoreboard, history, settings |
| `js/net.js` | Supabase RPC calls + realtime channel |
| `js/sound.js` | Synthesized sound effects |

Backend is Supabase. The tables (`rooms`, `games`) have row-level security on with no policies, so the browser can only reach them through `bg_*` SQL functions. Passcodes are bcrypt-hashed, and sign-in is limited to 10 failed tries per board per 15 minutes. Moves sync through a Supabase Realtime broadcast channel with a 4-second polling fallback, and saves use optimistic version checks so two devices can't overwrite each other.

## Run locally

```bash
python3 -m http.server 8080
```

## Tests

```bash
npm test
```
