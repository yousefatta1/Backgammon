import * as net from './net.js';
import * as G from './game.js';
import { pipCount, remainingDice } from './engine.js';
import { renderBoard, originXY, CHECKER_COLORS } from './board.js';
import { sfx, setMuted, isMuted } from './sound.js';

// ---------- constants ----------
const AVATARS = ['🐻', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐝',
  '🐙', '🦋', '🐢', '🐶', '🐱', '🦉', '🌻', '🌙', '⭐', '🔥', '🍓', '🍑', '🥑', '🍩', '☕', '👑'];
const STAKES = [
  'Loser makes morning coffee ☕', 'Loser does the dishes 🍽️', 'Winner picks the movie 🎬',
  'Winner picks dinner 🍕', 'Loser gives a 10-min massage 💆', 'Breakfast in bed 🥞',
  'Loser plans the next date night 🌹', 'Winner gets the remote all night 📺',
  'Loser walks to get dessert 🍦', 'Winner controls the playlist 🎶', 'Loser folds the laundry 🧺',
  'Loser writes a love note 💌', 'Bragging rights only 😎',
];
const REACTIONS = ['❤️', '😘', '😂', '😱', '🙄', '🔥', '🎉', '😭'];
const PHRASES = ['Nice roll! 🎲', 'So lucky 🙄', 'Your move, babe 😘', 'I love you ❤️',
  'Hurry up 😴', "You're going down 😤", 'Rematch? 🔁', 'Good game 🤝'];

const HANDLE_RE = /^[a-z0-9_-]{3,30}$/;

// ---------- tiny helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  session: readJSON('bg.session'),
  room: null, version: 0, games: [], gamesLoaded: false,
  online: new Set(), view: 'play', selected: null, anim: null, rolling: false,
  conn: null, saving: false, pending: null, histFilter: 'all', live: false,
  celebrated: null, pollTimer: null,
};

function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function writeJSON(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } }
function saveSession() { writeJSON('bg.session', store.session); }

const app = document.getElementById('app');
const S = () => store.room;
const players = () => S()?.players || [];
const mySeats = () => {
  const seat = store.session?.seat;
  return seat === 'both' ? [0, 1] : seat == null ? [] : [Number(seat)];
};
const persp = () => (store.session?.seat === '1' ? 1 : 0);
const isMine = (p) => mySeats().includes(p);
const shared = () => store.session?.seat === 'both';
const nameOf = (p) => players()[p]?.name || `Player ${p + 1}`;
const emojiOf = (p) => players()[p]?.emoji || (p ? '🐰' : '🐻');
const colorOf = (p) => players()[p]?.color || (p ? 'ruby' : 'ivory');
const who = (p) => `${emojiOf(p)} ${esc(nameOf(p))}`;

// ---------- boot ----------
route();
window.addEventListener('keydown', onKey);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

function route() {
  closeModal();
  if (!store.session?.token) return renderAuth();
  if (store.session.seat == null) return enterRoom().then(renderPicker);
  return enterRoom().then(renderShell);
}

async function enterRoom() {
  if (store.room && store.conn) return;
  try {
    const r = await net.getRoom(store.session.token);
    if (!r) { signOut('That board no longer exists.'); throw new Error('gone'); }
    store.room = r.state; store.version = r.version;
  } catch (e) {
    if (e.message === 'gone') throw e;
    app.innerHTML = `<div class="center-msg"><div class="spinner"></div><p>Can't reach the server. Retrying…</p></div>`;
    await new Promise((res) => setTimeout(res, 2500));
    return enterRoom();
  }
}

function connectLive() {
  store.conn?.close();
  store.conn = net.connect(store.session.token, store.session.seat === 'both' ? '0,1' : store.session.seat, {
    onState: ({ state, version }) => { if (version > store.version) accept(state, version); },
    onReact: showReaction,
    onGames: loadGames,
    onPresence: (seats) => { store.online = seats; renderHeader(); renderPlayers(); },
    onStatus: (st) => { store.live = st === 'SUBSCRIBED'; renderHeader(); },
  });
  clearInterval(store.pollTimer);
  store.pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 4000);
}

async function refresh() {
  if (!store.session?.token || store.saving || store.pending) return;
  try {
    const r = await net.getRoom(store.session.token);
    if (r && r.version > store.version && !store.saving && !store.pending) accept(r.state, r.version);
  } catch { /* offline, try later */ }
}

async function loadGames() {
  try {
    store.games = await net.listGames(store.session.token);
    store.gamesLoaded = true;
    renderHeader();
    if (store.view !== 'settings') renderView();
  } catch { /* ignore */ }
}

// Apply a state that arrived from the other device.
function accept(state, version) {
  const prev = store.room;
  const wasMyTurn = myTurnNow(prev);
  store.anim = deriveAnim(prev, state);
  store.room = state; store.version = version;
  const newRoll = state.phase === 'moving' && !state.made.length &&
    (prev?.phase !== 'moving' || prev.turn !== state.turn || String(prev.dice) !== String(state.dice));
  if (newRoll) flashRoll();
  else if (store.anim) sfx.move();
  store.selected = null;
  if (!wasMyTurn && myTurnNow(state) && !shared()) { sfx.turn(); navigator.vibrate?.(60); }
  render();
}

function myTurnNow(s) {
  return !!s && s.turn != null && (s.phase === 'rolling' || s.phase === 'moving') && isMine(s.turn);
}

function deriveAnim(prev, next) {
  if (!prev || !next || next.turn !== prev.turn) return null;
  const pm = prev.made || [], nm = next.made || [];
  if (nm.length !== pm.length + 1) return null;
  const m = nm[nm.length - 1];
  if (m.to === 'off') return null;
  return { to: m.to, player: next.turn, fromXY: originXY(prev.board, m, next.turn, persp()) };
}

// ---------- saving (coalesced, optimistic) ----------
function commit(state, result = null) {
  store.anim = deriveAnim(store.room, state) || store.anim;
  store.room = state;
  store.pending = { state, result: result || store.pending?.result || null };
  store.selected = null;
  render();
  flush();
}

async function flush() {
  if (store.saving || !store.pending) return;
  store.saving = true;
  const job = store.pending; store.pending = null;
  try {
    const v = await net.saveRoom(store.session.token, job.state, store.version, job.result);
    if (v == null) {
      store.pending = null;
      store.saving = false;
      const r = await net.getRoom(store.session.token);
      if (r) { store.room = r.state; store.version = r.version; }
      toast('Your partner moved first, board refreshed', 'warn');
      render();
      return;
    }
    store.version = v;
    store.conn?.send('state', { state: job.state, version: v });
    if (job.result) { await loadGames(); store.conn?.send('games', {}); }
  } catch (e) {
    toast('Could not save, check your connection', 'error');
    store.pending = store.pending || job;
    setTimeout(() => { store.saving = false; flush(); }, 2500);
    return;
  }
  store.saving = false;
  if (store.pending) flush();
}

// ======================================================================
// AUTH
// ======================================================================
function renderAuth(tab = 'signin', msg = '') {
  document.title = 'Backgammon for Two';
  app.innerHTML = `
  <div class="auth">
    <section class="auth-hero">
      <div class="brand big">${logo()}<span>Backgammon<em>for two</em></span></div>
      <h1>Your board.<br/>Your rivalry.<br/><span class="grad">Your bragging rights.</span></h1>
      <p class="lede">A private backgammon table for the two of you. Play live from your own phones, put something sweet on the line, and keep score of every game you've ever played.</p>
      <ul class="perks">
        <li><span>🎲</span>Live play across two devices, or pass-and-play on one</li>
        <li><span>💌</span>Stakes like "loser makes coffee", tracked until paid</li>
        <li><span>🏆</span>All-time scoreboard, streaks, gammons and full history</li>
        <li><span>😘</span>Emoji reactions that pop up on both screens</li>
      </ul>
      <div class="hero-board" aria-hidden="true">${heroBoard()}</div>
    </section>
    <section class="auth-panel">
      <div class="auth-card">
        <div class="seg" role="tablist">
          <button role="tab" data-tab="signin" class="${tab === 'signin' ? 'on' : ''}">Sign in</button>
          <button role="tab" data-tab="create" class="${tab === 'create' ? 'on' : ''}">Create your board</button>
        </div>
        ${tab === 'signin' ? signinForm(msg) : createForm(msg)}
      </div>
      <p class="fineprint">One account for the two of you. Each of you signs in on your own device with the same board name and passcode.</p>
    </section>
  </div>`;
  $$('[data-tab]').forEach((b) => b.onclick = () => renderAuth(b.dataset.tab));
  if (tab === 'signin') bindSignin(); else bindCreate();
}

function signinForm(msg) {
  return `
  <form id="signin" class="form" novalidate>
    <h2>Welcome back</h2>
    <p class="sub">Sign in to your shared board.</p>
    ${msg ? `<div class="alert">${esc(msg)}</div>` : ''}
    <label class="field"><span>Board name</span>
      <input name="handle" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="e.g. yousef-and-sam" required /></label>
    <label class="field"><span>Passcode</span>
      <div class="pw"><input name="pass" type="password" autocomplete="current-password" placeholder="••••••" required />
      <button type="button" class="pw-toggle" aria-label="Show passcode">Show</button></div></label>
    <div class="form-error" hidden></div>
    <button class="btn primary block" type="submit"><span>Sign in</span></button>
    <p class="switch">New here? <a href="#" data-tab="create">Create a board for you two</a></p>
  </form>`;
}

function createForm(msg) {
  const p = (i, name, emoji, color) => `
    <fieldset class="pl-pick" data-p="${i}">
      <legend>${i === 0 ? 'You' : 'Your partner'}</legend>
      <div class="pl-row">
        <button type="button" class="avatar-btn" data-emoji-for="${i}" aria-label="Choose emoji">${emoji}</button>
        <input name="name${i}" maxlength="20" placeholder="${i === 0 ? 'Your name' : 'Their name'}" value="${esc(name)}" required />
      </div>
      <div class="swatches" data-color-for="${i}">${swatches(color)}</div>
      <input type="hidden" name="emoji${i}" value="${emoji}"/><input type="hidden" name="color${i}" value="${color}"/>
    </fieldset>`;
  return `
  <form id="create" class="form" novalidate>
    <h2>Set up your table</h2>
    <p class="sub">Takes 20 seconds. Then send your partner the board name and passcode.</p>
    ${msg ? `<div class="alert">${esc(msg)}</div>` : ''}
    <label class="field"><span>Board name</span>
      <input name="handle" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="yousef-and-sam" required />
      <small>Lowercase letters, numbers, - or _. This is how you both sign in.</small></label>
    <div class="grid2">
      <label class="field"><span>Passcode</span><input name="pass" type="password" autocomplete="new-password" placeholder="6+ characters" required /></label>
      <label class="field"><span>Confirm</span><input name="pass2" type="password" autocomplete="new-password" placeholder="Repeat it" required /></label>
    </div>
    <div class="grid2 players-pick">
      ${p(0, '', '🐻', 'ivory')}
      ${p(1, '', '🐰', 'ruby')}
    </div>
    <div class="form-error" hidden></div>
    <button class="btn primary block" type="submit"><span>Create our board 💞</span></button>
    <p class="switch">Already have one? <a href="#" data-tab="signin">Sign in</a></p>
  </form>`;
}

function swatches(sel) {
  return Object.entries(CHECKER_COLORS).map(([k, c]) =>
    `<button type="button" class="sw ${k === sel ? 'on' : ''}" data-color="${k}" title="${c.label}" style="--c:${c.fill};--r:${c.rim}"></button>`).join('');
}

function bindPw(form) {
  $$('.pw-toggle', form).forEach((b) => b.onclick = () => {
    const i = b.previousElementSibling;
    i.type = i.type === 'password' ? 'text' : 'password';
    b.textContent = i.type === 'password' ? 'Show' : 'Hide';
  });
}

function formError(form, msg) {
  const el = $('.form-error', form);
  el.textContent = msg; el.hidden = !msg;
}

function busy(btn, on) {
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}

function bindSignin() {
  const f = $('#signin');
  bindPw(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const handle = f.handle.value.trim().toLowerCase();
    const pass = f.pass.value;
    if (!handle || !pass) return formError(f, 'Enter your board name and passcode.');
    const btn = $('button[type=submit]', f);
    busy(btn, true); formError(f, '');
    try {
      const token = await net.login(handle, pass);
      if (!token) { busy(btn, false); return formError(f, "That board name and passcode don't match."); }
      store.session = { token, handle, seat: null };
      saveSession();
      route();
    } catch (err) {
      busy(btn, false);
      formError(f, /too many/.test(err.message) ? 'Too many tries. Wait 15 minutes and try again.' : 'Could not reach the server. Try again.');
    }
  };
}

function bindCreate() {
  const f = $('#create');
  $$('[data-color-for]', f).forEach((wrap) => {
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-color]'); if (!b) return;
      const i = wrap.dataset.colorFor;
      f[`color${i}`].value = b.dataset.color;
      $$('.sw', wrap).forEach((s) => s.classList.toggle('on', s === b));
    };
  });
  $$('[data-emoji-for]', f).forEach((b) => b.onclick = () => pickEmoji(b, (em) => {
    b.textContent = em; f[`emoji${b.dataset.emojiFor}`].value = em;
  }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const handle = f.handle.value.trim().toLowerCase();
    const name0 = f.name0.value.trim(), name1 = f.name1.value.trim();
    if (!HANDLE_RE.test(handle)) return formError(f, 'Board name: 3 to 30 lowercase letters, numbers, - or _.');
    if (f.pass.value.length < 6) return formError(f, 'Passcode needs at least 6 characters.');
    if (f.pass.value !== f.pass2.value) return formError(f, "Passcodes don't match.");
    if (!name0 || !name1) return formError(f, 'Add both of your names.');
    if (f.color0.value === f.color1.value) return formError(f, 'Pick two different checker colors.');
    const state = G.newRoom([
      { name: name0, emoji: f.emoji0.value, color: f.color0.value },
      { name: name1, emoji: f.emoji1.value, color: f.color1.value },
    ]);
    const btn = $('button[type=submit]', f);
    busy(btn, true); formError(f, '');
    try {
      const token = await net.register(handle, f.pass.value, state);
      store.session = { token, handle, seat: null };
      saveSession();
      route();
    } catch (err) {
      busy(btn, false);
      formError(f, /taken|unique|duplicate/i.test(err.message) ? 'That board name is taken. Try another.' : 'Could not create the board. Try again.');
    }
  };
}

function pickEmoji(anchorEl, onPick) {
  openModal(`
    <div class="modal-head"><h3>Pick an emoji</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="emoji-grid">${AVATARS.map((e) => `<button class="emoji-cell" data-e="${e}">${e}</button>`).join('')}</div>`,
  (root) => { root.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) { onPick(b.dataset.e); closeModal(); } }; }, 'sm');
}

// ======================================================================
// PROFILE PICKER
// ======================================================================
function renderPicker() {
  const ps = players();
  document.title = "Who's playing? · Backgammon";
  app.innerHTML = `
  <div class="picker">
    <div class="brand">${logo()}<span>Backgammon<em>for two</em></span></div>
    <h1>Who's playing on this device?</h1>
    <p class="sub">Signed in to <b>${esc(store.session.handle)}</b></p>
    <div class="profiles">
      ${[0, 1].map((i) => `
        <button class="profile" data-seat="${i}" style="--pc:${CHECKER_COLORS[ps[i]?.color || 'ivory'].fill}">
          <span class="profile-av">${esc(ps[i]?.emoji)}</span>
          <span class="profile-name">${esc(ps[i]?.name)}</span>
          <span class="profile-meta">${CHECKER_COLORS[ps[i]?.color || 'ivory'].label} checkers</span>
        </button>`).join('')}
    </div>
    <button class="btn ghost" data-seat="both">👫 Both of us, passing this device back and forth</button>
    <button class="link" id="signout">Sign out</button>
  </div>`;
  $$('[data-seat]').forEach((b) => b.onclick = () => {
    store.session.seat = b.dataset.seat;
    saveSession();
    store.conn?.close(); store.conn = null;
    renderShell();
  });
  $('#signout').onclick = () => signOut();
}

function signOut(msg = '') {
  store.conn?.close();
  clearInterval(store.pollTimer);
  Object.assign(store, { session: null, room: null, conn: null, games: [], gamesLoaded: false, view: 'play' });
  saveSession();
  renderAuth('signin', msg);
}

// ======================================================================
// SHELL
// ======================================================================
const NAV = [
  ['play', 'Play', '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'],
  ['scores', 'Scoreboard', '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'],
  ['history', 'History', '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'],
  ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'],
];
const icon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

function renderShell() {
  app.innerHTML = `
    <header class="topbar" id="topbar"></header>
    <main class="main" id="view"></main>
    <nav class="tabbar" id="tabbar">${NAV.map(([k, label, ic]) => `<button data-view="${k}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;
  $('#tabbar').onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };
  connectLive();
  loadGames();
  render();
}

function go(view) {
  store.view = view;
  store.selected = null;
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  if (!$('#view')) return;
  renderHeader();
  renderView();
}

function renderView() {
  const v = $('#view');
  if (!v) return;
  $$('#tabbar [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === store.view));
  if (store.view === 'play') renderPlay(v);
  else if (store.view === 'scores') renderScores(v);
  else if (store.view === 'history') renderHistory(v);
  else if (store.view === 'settings' && !v.querySelector('.settings')) renderSettings(v);
  updateTitle();
}

function updateTitle() {
  const s = S();
  if (!s) return;
  document.title = myTurnNow(s) && !shared() ? '🎲 Your turn · Backgammon' : 'Backgammon for Two';
}

function renderHeader() {
  const h = $('#topbar');
  if (!h || !S()) return;
  const st = computeStats(store.games);
  h.innerHTML = `
    <div class="brand sm">${logo()}<span>Backgammon<em>for two</em></span></div>
    <div class="scoreline" title="All-time wins">
      <span class="sl-p">${presenceDot(0)}<b>${esc(emojiOf(0))}</b><span class="sl-name">${esc(nameOf(0))}</span></span>
      <span class="sl-n">${st.p[0].wins}</span><span class="sl-sep">:</span><span class="sl-n">${st.p[1].wins}</span>
      <span class="sl-p"><span class="sl-name">${esc(nameOf(1))}</span><b>${esc(emojiOf(1))}</b>${presenceDot(1)}</span>
    </div>
    <nav class="topnav">${NAV.map(([k, label, ic]) => `<button data-view="${k}" class="${store.view === k ? 'on' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
    <span class="live ${store.live ? 'on' : ''}" title="${store.live ? 'Live sync connected' : 'Connecting…'}"><i></i>${store.live ? 'Live' : 'Sync'}</span>`;
  $('.topnav', h).onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };
}

function presenceDot(p) {
  if (isMine(p)) return '';
  const on = store.online.has(String(p));
  return `<i class="dot ${on ? 'on' : ''}" title="${esc(nameOf(p))} is ${on ? 'here' : 'away'}"></i>`;
}

// ======================================================================
// PLAY
// ======================================================================
function renderPlay(v) {
  const s = S();
  if (!v.querySelector('.play')) {
    v.innerHTML = `
    <section class="play">
      <div class="table">
        <div class="pcard-slot" id="pc-top"></div>
        <div class="board-wrap" id="board"></div>
        <div class="pcard-slot" id="pc-bot"></div>
      </div>
      <aside class="side">
        <div class="card status-card" id="status"></div>
        <div class="card stake-card" id="stake"></div>
        <div class="card react-card" id="react"></div>
        <div class="card form-card" id="form"></div>
      </aside>
    </section>`;
    $('#board').onclick = onBoardClick;
    bindReactions();
  }
  renderPlayers();
  renderBoardArea();
  renderStatus();
  renderStake();
  renderForm();
  if (s.phase === 'over' && store.celebrated !== s.gameNo) {
    store.celebrated = s.gameNo;
    if (store.celebratedInit) { celebrate(s.result.winner); sfx.win(); }
  }
  store.celebratedInit = true;
}

function renderPlayers() {
  const top = $('#pc-top'), bot = $('#pc-bot');
  if (!top || !S()) return;
  const me = persp(), them = 1 - me;
  top.innerHTML = playerCard(them);
  bot.innerHTML = playerCard(me);
}

function playerCard(p) {
  const s = S();
  const c = CHECKER_COLORS[colorOf(p)];
  const toMove = s.turn === p && (s.phase === 'rolling' || s.phase === 'moving');
  const st = computeStats(store.games);
  const streak = st.cur && st.cur.p === p && st.cur.n >= 2 ? `<span class="badge fire">🔥 ${st.cur.n} in a row</span>` : '';
  return `
  <div class="pcard ${toMove ? 'active' : ''}" style="--pc:${c.fill};--pr:${c.rim}">
    <span class="pc-av">${esc(emojiOf(p))}${presenceDot(p)}</span>
    <span class="pc-main">
      <span class="pc-name">${esc(nameOf(p))}${isMine(p) && !shared() ? ' <small>(you)</small>' : ''}</span>
      <span class="pc-meta"><i class="chip-dot"></i>${c.label} · ${pipCount(s.board, p)} pips · ${s.board.off[p]}/15 off</span>
    </span>
    <span class="pc-right">${streak}${toMove ? `<span class="badge turn">${s.phase === 'rolling' ? 'to roll' : 'moving'}</span>` : ''}</span>
  </div>`;
}

function boardOptions() {
  const s = S();
  const mover = s.turn;
  const o = {
    board: s.board, persp: persp(), colors: [colorOf(0), colorOf(1)], mover,
    dice: s.dice, remaining: s.dice ? remainingDice(s.dice, s.made) : null, rolling: store.rolling,
    anim: store.anim,
  };
  if (s.phase === 'moving' && isMine(s.turn)) {
    const legal = G.legalNow(s);
    o.sources = new Set(legal.map((m) => m.from));
    if (store.selected != null) o.targets = new Set(legal.filter((m) => m.from === store.selected).map((m) => m.to));
    o.selected = store.selected;
  }
  if (s.phase === 'opening') {
    o.rollable = true; o.mover = null; o.rollLabel = '🎲 Opening roll';
  } else if (s.phase === 'rolling' && isMine(s.turn)) {
    o.rollable = true; o.rollLabel = '🎲 Roll';
  }
  if (s.opening && s.phase === 'moving' && !s.made.length) {
    o.opening = `${emojiOf(0)} ${s.opening[0]}  ·  ${emojiOf(1)} ${s.opening[1]}`;
  }
  if (s.last && s.last.moves?.length && (s.phase === 'rolling' || (s.phase === 'moving' && !s.made.length))) {
    o.arrows = s.last.moves.map((m) => ({ from: m.from, to: m.to, player: s.last.player }));
  }
  return o;
}

function renderBoardArea() {
  const el = $('#board');
  if (!el) return;
  const s = S();
  el.innerHTML = renderBoard(boardOptions()) + (s.phase === 'over' ? overCard() : '');
  store.anim = null;
  if (s.phase === 'over') {
    $('#rematch', el)?.addEventListener('click', rematch);
    $('#to-scores', el)?.addEventListener('click', () => go('scores'));
  }
}

function overCard() {
  const s = S(); const r = s.result;
  const kindLabel = { single: 'Single game', gammon: 'Gammon!', backgammon: 'Backgammon!!' }[r.kind];
  return `
  <div class="over">
    <div class="over-card">
      <div class="over-em">${esc(emojiOf(r.winner))}</div>
      <h2>${esc(nameOf(r.winner))} wins!</h2>
      <p class="over-kind">${r.resigned ? `${esc(nameOf(1 - r.winner))} resigned` : kindLabel} · <b>${r.points} point${r.points > 1 ? 's' : ''}</b></p>
      ${r.stake ? `<p class="over-stake">💌 ${esc(nameOf(1 - r.winner))} owes: <b>${esc(r.stake)}</b></p>` : ''}
      <div class="over-actions">
        <button class="btn primary" id="rematch">Rematch 🔁</button>
        <button class="btn ghost" id="to-scores">Scoreboard</button>
      </div>
    </div>
  </div>`;
}

function renderStatus() {
  const el = $('#status');
  if (!el) return;
  const s = S();
  let title = '', sub = '', actions = '';
  const mine = isMine(s.turn);
  if (s.phase === 'opening') {
    title = `Game ${s.gameNo} · Who goes first?`;
    sub = 'Each of you throws one die. The higher number moves first using both dice.';
    actions = `<button class="btn primary" data-act="roll">🎲 Opening roll <kbd>R</kbd></button>`;
  } else if (s.phase === 'rolling') {
    if (mine) {
      title = shared() ? `${who(s.turn)}, your turn` : 'Your turn';
      sub = s.last?.moves?.length === 0 ? `${esc(nameOf(s.last.player))} couldn't move. Roll when ready.` : 'Gold arrows show the last move. Roll when ready.';
      actions = `<button class="btn primary" data-act="roll">🎲 Roll dice <kbd>R</kbd></button>`;
    } else {
      title = `Waiting for ${who(s.turn)}`;
      sub = store.online.has(String(s.turn)) ? `${esc(nameOf(s.turn))} is here and about to roll.` : `${esc(nameOf(s.turn))} isn't on the board right now. Send a nudge 👇`;
    }
  } else if (s.phase === 'moving') {
    const legal = G.legalNow(s);
    const rem = remainingDice(s.dice, s.made);
    if (mine) {
      if (!legal.length && !s.made.length) {
        title = 'No legal moves 😬';
        sub = `Rolled ${s.dice.join('-')}, but every landing spot is blocked.`;
        actions = `<button class="btn primary" data-act="done">Pass turn <kbd>↵</kbd></button>`;
      } else if (!legal.length) {
        title = 'Turn complete';
        sub = rem.length ? `The remaining ${rem.join(', ')} can't be played.` : 'Happy with it? Lock it in, or undo to rethink.';
        actions = `<button class="btn primary" data-act="done">Done <kbd>↵</kbd></button><button class="btn ghost" data-act="undo">Undo <kbd>U</kbd></button>`;
      } else {
        title = shared() ? `${who(s.turn)} to move` : 'Your move';
        sub = `Dice left: <b>${rem.join(' · ')}</b>. Tap a glowing checker, then where it goes.`;
        actions = s.made.length ? `<button class="btn ghost" data-act="undo">Undo <kbd>U</kbd></button>` : '';
      }
    } else {
      title = `${who(s.turn)} is moving…`;
      sub = `Rolled ${s.dice.join('-')}${s.made.length ? `, ${s.made.length} checker${s.made.length > 1 ? 's' : ''} moved so far` : ''}.`;
    }
  } else if (s.phase === 'over') {
    title = `${who(s.result.winner)} won game ${s.gameNo}`;
    sub = 'Saved to your scoreboard.';
    actions = `<button class="btn primary" data-act="rematch">Rematch 🔁</button>`;
  }
  const canResign = (s.phase === 'rolling' || s.phase === 'moving') && mySeats().length;
  el.innerHTML = `
    <div class="status-head"><span class="eyebrow">Game ${s.gameNo}${s.turns ? ` · Turn ${s.turns}` : ''}</span>
      ${canResign ? '<button class="link danger" data-act="resign">Resign</button>' : ''}</div>
    <h3>${title}</h3><p>${sub}</p>
    ${actions ? `<div class="actions">${actions}</div>` : ''}`;
  el.onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); };
}

function renderStake() {
  const el = $('#stake');
  if (!el) return;
  const s = S();
  const editable = s.phase === 'opening';
  el.innerHTML = `
    <div class="eyebrow">Playing for</div>
    <div class="stake-row">
      <span class="stake-text ${s.stake ? '' : 'none'}">${s.stake ? esc(s.stake) : 'Nothing yet. Make it interesting?'}</span>
      ${editable ? `<button class="btn sm ghost" data-act="stake">${s.stake ? 'Change' : 'Set stake'}</button>` : ''}
    </div>
    ${editable ? '' : '<small class="muted">Stakes lock once the game starts.</small>'}`;
  el.onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); };
}

function renderForm() {
  const el = $('#form');
  if (!el) return;
  const st = computeStats(store.games);
  const form = store.games.slice(0, 8);
  el.innerHTML = `
    <div class="eyebrow">Recent form</div>
    ${form.length ? `<div class="form-dots">${form.slice().reverse().map((g) => `<span class="fd" title="${esc(nameOf(g.winner))} · ${g.kind}">${esc(emojiOf(g.winner))}</span>`).join('')}</div>` : '<p class="muted">Your first game will show up here.</p>'}
    <div class="mini-stats">
      <div><b>${st.p[0].points}</b><span>${esc(emojiOf(0))} points</span></div>
      <div><b>${st.total}</b><span>games</span></div>
      <div><b>${st.p[1].points}</b><span>${esc(emojiOf(1))} points</span></div>
    </div>`;
}

function bindReactions() {
  const el = $('#react');
  el.innerHTML = `
    <div class="eyebrow">Send a reaction</div>
    <div class="react-row">${REACTIONS.map((e) => `<button class="react" data-e="${e}" aria-label="Send ${e}">${e}</button>`).join('')}</div>
    <div class="phrase-row">${PHRASES.map((t) => `<button class="phrase" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-e],[data-t]');
    if (!b) return;
    const from = shared() ? (S().turn ?? 0) : mySeats()[0];
    const payload = { from, emoji: b.dataset.e || null, text: b.dataset.t || null };
    showReaction(payload, true);
    store.conn?.send('react', payload);
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  };
}

// ---------- interaction ----------
function onBoardClick(e) {
  const t = e.target.closest('[data-pt],[data-action]');
  if (!t) { if (store.selected != null) { store.selected = null; renderBoardArea(); } return; }
  if (t.dataset.action === 'roll') return act('roll');
  const raw = t.dataset.pt;
  const pt = raw === 'bar' || raw === 'off' ? raw : Number(raw);
  onPoint(pt);
}

function onPoint(pt) {
  const s = S();
  if (s.phase !== 'moving' || !isMine(s.turn)) return;
  const legal = G.legalNow(s);
  if (store.selected != null) {
    const m = legal.find((x) => x.from === store.selected && x.to === pt);
    if (m) return doMove(m);
  }
  const fromMoves = legal.filter((x) => x.from === pt);
  if (fromMoves.length) {
    const targets = new Set(fromMoves.map((x) => x.to));
    if (targets.size === 1) return doMove(fromMoves[0]);
    store.selected = store.selected === pt ? null : pt;
    sfx.tick();
    return renderBoardArea();
  }
  const toMoves = legal.filter((x) => x.to === pt);
  if (toMoves.length === 1) return doMove(toMoves[0]);
  store.selected = null;
  renderBoardArea();
}

function doMove(m) {
  const s = S();
  const next = G.move(s, m);
  if (!next) return;
  sfx.move();
  if (next.phase === 'over') {
    const r = next.result;
    return commit(next, { winner: r.winner, points: r.points, kind: r.kind, stake: r.stake || null, turns: r.turns, startedAt: r.startedAt });
  }
  // A single remaining choice? Keep the turn open so Undo still works.
  commit(next);
}

function act(a) {
  const s = S();
  if (a === 'roll') {
    if (s.phase === 'opening') { flashRoll(); return commit(G.openingRoll(s)); }
    if (s.phase === 'rolling' && isMine(s.turn)) { flashRoll(); return commit(G.roll(s)); }
  }
  if (a === 'undo' && s.phase === 'moving' && isMine(s.turn) && s.made.length) { sfx.tick(); return commit(G.undo(s)); }
  if (a === 'done' && G.canEndTurn(s) && isMine(s.turn)) { sfx.tick(); return commit(G.endTurn(s)); }
  if (a === 'rematch' && s.phase === 'over') return rematch();
  if (a === 'stake' && s.phase === 'opening') return stakeModal();
  if (a === 'resign') return resignModal();
}

function rematch() {
  const s = S();
  if (s.phase !== 'over') return;
  commit(G.newGame(s, ''));
  stakeModal(true);
}

function flashRoll() {
  store.rolling = true;
  sfx.roll();
  setTimeout(() => { store.rolling = false; }, 650);
}

function onKey(e) {
  if (e.target.matches('input, textarea') || $('#modal')?.childElementCount) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (store.view !== 'play' || !S()) return;
  const k = e.key.toLowerCase();
  if (k === 'r') act('roll');
  else if (k === 'u') act('undo');
  else if (k === 'enter') act('done');
  else if (k === 'escape' && store.selected != null) { store.selected = null; renderBoardArea(); }
}

function stakeModal(afterRematch = false) {
  const s = S();
  openModal(`
    <div class="modal-head"><h3>${afterRematch ? 'New game! What are we playing for?' : 'What are we playing for?'}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <form id="stake-form" class="form">
      <label class="field"><span>The stake</span>
        <div class="pw"><input name="stake" maxlength="120" value="${esc(s.stake)}" placeholder="Loser makes coffee ☕" />
        <button type="button" class="pw-toggle" id="dice-stake" title="Surprise me">🎲</button></div></label>
      <div class="chips">${STAKES.map((t) => `<button type="button" class="chip" data-s="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-clear>No stake</button>
        <button type="submit" class="btn primary">Lock it in</button>
      </div>
    </form>`, (root) => {
    const f = $('#stake-form', root);
    $('.chips', root).onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) f.stake.value = b.dataset.s; };
    $('#dice-stake', root).onclick = () => { f.stake.value = STAKES[Math.floor(Math.random() * STAKES.length)]; };
    $('[data-clear]', root).onclick = () => { saveStake(''); closeModal(); };
    f.onsubmit = (e) => { e.preventDefault(); saveStake(f.stake.value.trim()); closeModal(); };
    setTimeout(() => f.stake.focus(), 50);
  });
}

function saveStake(stake) {
  const s = S();
  if (s.phase !== 'opening' || s.stake === stake) return;
  commit({ ...s, stake });
  if (stake) {
    const payload = { from: shared() ? 0 : mySeats()[0], emoji: '💌', text: `Playing for: ${stake}` };
    showReaction(payload, true);
    store.conn?.send('react', payload);
  }
}

function resignModal() {
  const s = S();
  const me = shared() ? s.turn : mySeats()[0];
  openModal(`
    <div class="modal-head"><h3>Resign this game?</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <p>${who(1 - me)} gets 1 point${s.stake ? ` and you'll owe: <b>${esc(s.stake)}</b>` : ''}.</p>
    <div class="modal-actions"><button class="btn ghost" data-close>Keep playing</button><button class="btn danger" id="do-resign">Resign</button></div>`,
  (root) => {
    $('#do-resign', root).onclick = () => {
      closeModal();
      const n = G.resign(S(), me);
      const r = n.result;
      commit(n, { winner: r.winner, points: 1, kind: 'single', stake: r.stake || null, turns: r.turns, startedAt: r.startedAt });
    };
  }, 'sm');
}

// ---------- reactions & fx ----------
function showReaction({ from, emoji, text }, local = false) {
  if (!local) sfx.pop();
  const fx = ensureLayer('fx');
  if (emoji) {
    for (let i = 0; i < (text ? 1 : 7); i++) {
      const el = document.createElement('span');
      el.className = 'float-emoji';
      el.textContent = emoji;
      el.style.left = (12 + Math.random() * 76) + '%';
      el.style.animationDelay = (i * 90) + 'ms';
      el.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
      el.style.fontSize = (34 + Math.random() * 28) + 'px';
      fx.appendChild(el);
      setTimeout(() => el.remove(), 2600 + i * 90);
    }
  }
  if (text) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.innerHTML = `<span class="bubble-av">${esc(emojiOf(from))}</span><span><b>${esc(nameOf(from))}</b>${esc(text)}</span>`;
    ensureLayer('bubbles').appendChild(b);
    setTimeout(() => b.classList.add('out'), 3200);
    setTimeout(() => b.remove(), 3700);
  }
}

function celebrate(winner) {
  const fx = ensureLayer('fx');
  const pool = [emojiOf(winner), '🎉', '❤️', '✨', '💖', '🏆'];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.textContent = pool[i % pool.length];
    el.style.left = Math.random() * 100 + '%';
    el.style.animationDelay = Math.random() * 900 + 'ms';
    el.style.animationDuration = 2200 + Math.random() * 1400 + 'ms';
    el.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    fx.appendChild(el);
    setTimeout(() => el.remove(), 4800);
  }
}

function ensureLayer(id) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
  return el;
}

function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  ensureLayer('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3000);
  setTimeout(() => el.remove(), 3500);
}

// ---------- modal ----------
function openModal(html, onMount, size = '') {
  const root = ensureLayer('modal');
  root.innerHTML = `<div class="backdrop" data-close></div><div class="modal ${size}" role="dialog" aria-modal="true">${html}</div>`;
  root.onclick = (e) => { if (e.target.closest('[data-close]')) closeModal(); };
  onMount?.($('.modal', root));
}
function closeModal() { const m = document.getElementById('modal'); if (m) m.innerHTML = ''; }

// ======================================================================
// SCOREBOARD
// ======================================================================
function computeStats(games) {
  const p = [0, 1].map(() => ({ wins: 0, points: 0, gammons: 0, backgammons: 0, best: 0, owed: 0 }));
  const asc = games.slice().sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at) || a.id - b.id);
  let cur = null;
  for (const g of asc) {
    const w = g.winner;
    p[w].wins++; p[w].points += g.points;
    if (g.kind === 'gammon') p[w].gammons++;
    if (g.kind === 'backgammon') p[w].backgammons++;
    if (g.stake && !g.settled) p[1 - w].owed++;
    cur = cur && cur.p === w ? { p: w, n: cur.n + 1 } : { p: w, n: 1 };
    p[w].best = Math.max(p[w].best, cur.n);
  }
  return { p, total: games.length, cur, first: asc[0]?.finished_at || null };
}

function periodWins(games, since) {
  const out = [0, 0];
  for (const g of games) if (new Date(g.finished_at) >= since) out[g.winner]++;
  return out;
}

function renderScores(v) {
  const st = computeStats(store.games);
  const g = store.games;
  const now = new Date();
  const week = new Date(now); week.setDate(now.getDate() - 7);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const wk = periodWins(g, week), mo = periodWins(g, month);
  const leader = st.p[0].wins === st.p[1].wins ? null : st.p[0].wins > st.p[1].wins ? 0 : 1;
  const share = st.total ? Math.round((st.p[0].wins / st.total) * 100) : 50;
  const ious = g.filter((x) => x.stake && !x.settled);
  const since = st.first ? new Date(st.first).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  const pcol = (i) => {
    const x = st.p[i];
    const pct = st.total ? Math.round((x.wins / st.total) * 100) : 0;
    return `
    <div class="card score-p ${leader === i ? 'lead' : ''}" style="--pc:${CHECKER_COLORS[colorOf(i)].fill}">
      ${leader === i ? '<span class="crown" title="All-time leader">👑</span>' : ''}
      <div class="sp-av">${esc(emojiOf(i))}</div>
      <div class="sp-name">${esc(nameOf(i))}</div>
      <div class="sp-wins"><b>${x.wins}</b><span>wins</span></div>
      <dl class="sp-grid">
        <div><dt>Win rate</dt><dd>${pct}%</dd></div>
        <div><dt>Points</dt><dd>${x.points}</dd></div>
        <div><dt>Gammons</dt><dd>${x.gammons}</dd></div>
        <div><dt>Backgammons</dt><dd>${x.backgammons}</dd></div>
        <div><dt>Best streak</dt><dd>${x.best}</dd></div>
        <div><dt>Owes</dt><dd>${x.owed}</dd></div>
      </dl>
    </div>`;
  };

  v.innerHTML = `
  <section class="page">
    <header class="page-head">
      <div><span class="eyebrow">Scoreboard</span><h1>${leader == null ? (st.total ? "Dead even. Of course. 💞" : 'No games yet') : `${esc(nameOf(leader))} leads the rivalry`}</h1>
      <p class="sub">${since ? `Every game since ${since} · ${st.total} played` : 'Finish a game and it lands here, forever.'}</p></div>
    </header>

    ${!store.gamesLoaded ? '<div class="card"><div class="spinner"></div></div>' : `
    <div class="h2h card">
      <div class="h2h-labels"><span>${esc(emojiOf(0))} ${esc(nameOf(0))} <b>${st.p[0].wins}</b></span><span><b>${st.p[1].wins}</b> ${esc(nameOf(1))} ${esc(emojiOf(1))}</span></div>
      <div class="h2h-bar" role="img" aria-label="Win share ${share}% to ${100 - share}%"><i style="width:${share}%;--c0:${CHECKER_COLORS[colorOf(0)].fill}"></i><i style="width:${100 - share}%;--c0:${CHECKER_COLORS[colorOf(1)].fill}"></i></div>
      <div class="h2h-foot">
        <span>${st.cur ? `${esc(emojiOf(st.cur.p))} ${esc(nameOf(st.cur.p))} has won the last ${st.cur.n === 1 ? 'game' : `${st.cur.n} in a row`}${st.cur.n >= 3 ? ' 🔥' : ''}` : 'Waiting on game one'}</span>
      </div>
    </div>

    <div class="score-cols">${pcol(0)}${pcol(1)}</div>

    <div class="periods">
      <div class="card period"><span class="eyebrow">Last 7 days</span><div class="pv">${esc(emojiOf(0))} <b>${wk[0]}</b> <i>–</i> <b>${wk[1]}</b> ${esc(emojiOf(1))}</div></div>
      <div class="card period"><span class="eyebrow">${now.toLocaleDateString(undefined, { month: 'long' })}</span><div class="pv">${esc(emojiOf(0))} <b>${mo[0]}</b> <i>–</i> <b>${mo[1]}</b> ${esc(emojiOf(1))}</div></div>
      <div class="card period"><span class="eyebrow">All-time points</span><div class="pv">${esc(emojiOf(0))} <b>${st.p[0].points}</b> <i>–</i> <b>${st.p[1].points}</b> ${esc(emojiOf(1))}</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>💌 IOUs</h2><span class="muted">${ious.length ? `${ious.length} unpaid` : 'All settled'}</span></div>
      ${ious.length ? `<ul class="iou-list">${ious.map((x) => `
        <li><span class="iou-who">${esc(emojiOf(1 - x.winner))} → ${esc(emojiOf(x.winner))}</span>
          <span class="iou-what"><b>${esc(nameOf(1 - x.winner))}</b> owes ${esc(nameOf(x.winner))}: ${esc(x.stake)}<small>${fmtDate(x.finished_at)}</small></span>
          <button class="btn sm ghost" data-settle="${x.id}">Mark paid ✓</button></li>`).join('')}</ul>`
        : '<p class="muted">No debts on the books. Set a stake before your next game to change that.</p>'}
    </div>`}
  </section>`;
  v.onclick = (e) => { const b = e.target.closest('[data-settle]'); if (b) settle(Number(b.dataset.settle), true, b); };
}

async function settle(id, val, btn) {
  if (btn) busy(btn, true);
  try {
    await net.settleGame(store.session.token, id, val);
    const g = store.games.find((x) => x.id === id); if (g) g.settled = val;
    store.conn?.send('games', {});
    if (val) toast('Marked as paid 💝');
    renderView(); renderHeader();
  } catch { toast('Could not update, try again', 'error'); if (btn) busy(btn, false); }
}

const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// ======================================================================
// HISTORY
// ======================================================================
function renderHistory(v) {
  const f = store.histFilter;
  const list = store.games.filter((g) =>
    f === 'all' ? true : f === 'w0' ? g.winner === 0 : f === 'w1' ? g.winner === 1 :
      f === 'gammon' ? g.kind !== 'single' : f === 'stakes' ? !!g.stake : true);
  const groups = [];
  for (const g of list) {
    const key = new Date(g.finished_at).toDateString();
    let grp = groups[groups.length - 1];
    if (!grp || grp.key !== key) { grp = { key, date: g.finished_at, items: [] }; groups.push(grp); }
    grp.items.push(g);
  }
  const total = store.games.length;
  const chip = (k, label) => `<button class="chip ${f === k ? 'on' : ''}" data-f="${k}">${label}</button>`;
  v.innerHTML = `
  <section class="page">
    <header class="page-head"><div><span class="eyebrow">History</span><h1>Every game you've played</h1>
      <p class="sub">${total} game${total === 1 ? '' : 's'} on record, newest first.</p></div></header>
    <div class="chips filter">${chip('all', 'All')}${chip('w0', `${esc(emojiOf(0))} ${esc(nameOf(0))} won`)}${chip('w1', `${esc(emojiOf(1))} ${esc(nameOf(1))} won`)}${chip('gammon', 'Gammons')}${chip('stakes', 'With stakes')}</div>
    ${!store.gamesLoaded ? '<div class="card"><div class="spinner"></div></div>' :
      !list.length ? `<div class="card empty"><div class="empty-em">🎲</div><p>${total ? 'Nothing matches that filter.' : 'No games yet. Go play your first one!'}</p>${total ? '' : '<button class="btn primary" data-go="play">Start playing</button>'}</div>` :
      groups.map((grp) => `
      <div class="hist-group">
        <h3 class="hist-date">${fmtDate(grp.date)}</h3>
        <ul class="card hist-list">${grp.items.map((g) => `
          <li class="hist-row">
            <span class="hr-av" style="--pc:${CHECKER_COLORS[colorOf(g.winner)].fill}">${esc(emojiOf(g.winner))}</span>
            <span class="hr-main">
              <span class="hr-title"><b>${esc(nameOf(g.winner))}</b> beat ${esc(nameOf(1 - g.winner))}
                ${g.kind !== 'single' ? `<span class="badge ${g.kind}">${g.kind}</span>` : ''}</span>
              <span class="hr-meta">${fmtTime(g.finished_at)}${g.turns ? ` · ${g.turns} turns` : ''}${g.started_at ? ` · ${Math.max(1, Math.round((new Date(g.finished_at) - new Date(g.started_at)) / 60000))} min` : ''}</span>
              ${g.stake ? `<span class="hr-stake ${g.settled ? 'paid' : ''}">💌 ${esc(g.stake)} ${g.settled ? '<em>paid</em>' : ''}</span>` : ''}
            </span>
            <span class="hr-right"><span class="hr-pts">+${g.points}</span>
              ${g.stake ? `<button class="link sm" data-toggle="${g.id}" data-val="${g.settled ? 0 : 1}">${g.settled ? 'Undo paid' : 'Mark paid'}</button>` : ''}</span>
          </li>`).join('')}</ul>
      </div>`).join('')}
  </section>`;
  v.onclick = (e) => {
    const c = e.target.closest('[data-f]'); if (c) { store.histFilter = c.dataset.f; return renderHistory(v); }
    const t = e.target.closest('[data-toggle]'); if (t) return settle(Number(t.dataset.toggle), t.dataset.val === '1', t);
    const gbtn = e.target.closest('[data-go]'); if (gbtn) go(gbtn.dataset.go);
  };
}

// ======================================================================
// SETTINGS
// ======================================================================
function renderSettings(v) {
  const ps = players();
  const seat = store.session.seat;
  const seatLabel = seat === 'both' ? '👫 Both of you (shared device)' : who(Number(seat));
  const pform = (i) => `
    <fieldset class="pl-pick" data-p="${i}">
      <legend>Player ${i + 1}</legend>
      <div class="pl-row">
        <button type="button" class="avatar-btn" data-emoji-for="${i}">${esc(ps[i].emoji)}</button>
        <input name="name${i}" maxlength="20" value="${esc(ps[i].name)}" required />
      </div>
      <div class="swatches" data-color-for="${i}">${swatches(ps[i].color || (i ? 'ruby' : 'ivory'))}</div>
      <input type="hidden" name="emoji${i}" value="${esc(ps[i].emoji)}"/><input type="hidden" name="color${i}" value="${esc(ps[i].color || (i ? 'ruby' : 'ivory'))}"/>
    </fieldset>`;
  v.innerHTML = `
  <section class="page settings">
    <header class="page-head"><div><span class="eyebrow">Settings</span><h1>Your table</h1>
      <p class="sub">Signed in to <b>${esc(store.session.handle)}</b></p></div></header>

    <div class="card">
      <div class="card-head"><h2>Players</h2></div>
      <form id="players-form" class="form">
        <div class="grid2 players-pick">${pform(0)}${pform(1)}</div>
        <div class="form-error" hidden></div>
        <div class="row-end"><button class="btn primary" type="submit">Save players</button></div>
      </form>
    </div>

    <div class="grid2 settings-grid">
      <div class="card">
        <div class="card-head"><h2>This device</h2></div>
        <p>Playing as <b>${seatLabel}</b></p>
        <div class="toggle-row"><span>Sound effects</span><button class="switch-btn ${isMuted() ? '' : 'on'}" id="sound-toggle" role="switch" aria-checked="${!isMuted()}"><i></i></button></div>
        <div class="stack">
          <button class="btn ghost" id="switch-seat">Switch player</button>
          <button class="btn ghost danger-ghost" id="signout">Sign out</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Invite your partner</h2></div>
        <p>On their phone, open this site and sign in with:</p>
        <div class="invite"><div><span>Board name</span><code>${esc(store.session.handle)}</code></div><div><span>Passcode</span><code>the one you chose</code></div></div>
        <button class="btn ghost" id="share">Share the link</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Change passcode</h2></div>
      <form id="pass-form" class="form inline">
        <label class="field"><span>New passcode</span><input name="pass" type="password" autocomplete="new-password" placeholder="6+ characters"/></label>
        <label class="field"><span>Confirm</span><input name="pass2" type="password" autocomplete="new-password"/></label>
        <button class="btn primary" type="submit">Update</button>
        <div class="form-error" hidden></div>
      </form>
    </div>
  </section>`;

  const f = $('#players-form');
  $$('[data-color-for]', f).forEach((wrap) => {
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-color]'); if (!b) return;
      f[`color${wrap.dataset.colorFor}`].value = b.dataset.color;
      $$('.sw', wrap).forEach((s) => s.classList.toggle('on', s === b));
    };
  });
  $$('[data-emoji-for]', f).forEach((b) => b.onclick = () => pickEmoji(b, (em) => {
    b.textContent = em; f[`emoji${b.dataset.emojiFor}`].value = em;
  }));
  f.onsubmit = (e) => {
    e.preventDefault();
    const n0 = f.name0.value.trim(), n1 = f.name1.value.trim();
    if (!n0 || !n1) return formError(f, 'Both players need a name.');
    if (f.color0.value === f.color1.value) return formError(f, 'Pick two different checker colors.');
    formError(f, '');
    commit({ ...S(), players: [
      { name: n0, emoji: f.emoji0.value, color: f.color0.value },
      { name: n1, emoji: f.emoji1.value, color: f.color1.value },
    ] });
    toast('Players saved ✨');
  };
  $('#sound-toggle').onclick = (e) => {
    setMuted(!isMuted());
    e.currentTarget.classList.toggle('on', !isMuted());
    e.currentTarget.setAttribute('aria-checked', String(!isMuted()));
    if (!isMuted()) sfx.tick();
  };
  $('#switch-seat').onclick = () => { store.session.seat = null; saveSession(); store.conn?.close(); store.conn = null; store.view = 'play'; renderPicker(); };
  $('#signout').onclick = () => signOut();
  $('#share').onclick = async () => {
    const url = location.origin + location.pathname;
    const text = `Come play backgammon with me 💞 Board name: ${store.session.handle}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Backgammon for Two', text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Invite copied to clipboard'); }
    } catch { /* cancelled */ }
  };
  const pf = $('#pass-form');
  pf.onsubmit = async (e) => {
    e.preventDefault();
    if (pf.pass.value.length < 6) return formError(pf, 'At least 6 characters.');
    if (pf.pass.value !== pf.pass2.value) return formError(pf, "Passcodes don't match.");
    formError(pf, '');
    const btn = $('button[type=submit]', pf); busy(btn, true);
    try { await net.changePass(store.session.token, pf.pass.value); pf.reset(); toast('Passcode updated 🔒'); }
    catch { formError(pf, 'Could not update. Try again.'); }
    busy(btn, false);
  };
}

// ---------- art ----------
function logo() {
  return `<svg class="logo" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="3" y="3" width="34" height="34" rx="9" fill="url(#lg)"/>
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4b38a"/><stop offset="1" stop-color="#d9516b"/></linearGradient></defs>
    <circle cx="12" cy="12" r="3" fill="#2a1414"/><circle cx="28" cy="28" r="3" fill="#2a1414"/>
    <path d="M20 26.5s-6.5-4-6.5-8.2a3.5 3.5 0 0 1 6.5-1.8 3.5 3.5 0 0 1 6.5 1.8c0 4.2-6.5 8.2-6.5 8.2Z" fill="#fff"/>
  </svg>`;
}

function heroBoard() {
  const b = { pts: Array(24).fill(0), bar: [0, 0], off: [0, 0] };
  Object.assign(b.pts, { 23: 2, 12: 5, 7: 3, 5: 5, 0: -2, 11: -5, 16: -3, 18: -5 });
  return renderBoard({ board: b, persp: 0, colors: ['ivory', 'ruby'], dice: [6, 3], mover: 0 });
}
