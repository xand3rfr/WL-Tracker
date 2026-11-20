import { DurableObject } from 'cloudflare:workers';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MSG = 48 * 1024;
const MAX_BUILD = 12 * 1024;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MODES = [2, 3], TARGETS = [11, 21], SCORING = ['12', '23'], DIFFS = ['rookie', 'pro', 'allstar', 'hof'];

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      for (let i = 0; i < 6; i++) {
        const code = genCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
        if (r.ok) return json({ code });
      }
      return json({ error: 'Could not create a room, try again.' }, 503);
    }
    const m = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/ws$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(req);
  },
};

const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || 'Player';

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lobby = undefined;
  }

  async load() {
    if (this.lobby === undefined) this.lobby = (await this.ctx.storage.get('lobby')) || null;
    return this.lobby;
  }
  save() { return this.ctx.storage.put('lobby', this.lobby); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      if (await this.load()) return new Response('exists', { status: 409 });
      this.lobby = { code: url.searchParams.get('code'), host: null, phase: 'lobby', settings: { mode: 3, target: 21, scoring: '23', difficulty: 'pro' }, players: {}, order: 0 };
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
      return new Response('ok');
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const L = await this.load();
    if (!L) {
      server.accept();
      server.send(JSON.stringify({ t: 'error', msg: 'Room not found. Check the code.' }));
      server.close(4004, 'not found');
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id });
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets(id) { return id ? this.ctx.getWebSockets(id) : this.ctx.getWebSockets(); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* socket already closed */ } }
  sendTo(id, msg) { for (const ws of this.sockets(id)) this.send(ws, msg); }
  broadcast(msg, exceptId) {
    const s = JSON.stringify(msg);
    for (const ws of this.sockets()) { const a = ws.deserializeAttachment(); if (a?.id !== exceptId && a?.joined) this.send(ws, s); }
  }
  lobbyMsg() {
    const L = this.lobby;
    return { t: 'lobby', code: L.code, host: L.host, phase: L.phase, settings: L.settings, players: Object.values(L.players).sort((a, b) => a.order - b.order) };
  }
  teamCount(team) { return Object.values(this.lobby.players).filter(p => p.team === team).length; }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const L = await this.load();
    if (!L) return;
    const att = ws.deserializeAttachment() || {};
    const id = att.id;
    const me = L.players[id];
    const isHost = L.host === id;

    switch (m.t) {
      case 'hello': {
        if (me) return;
        if (L.phase !== 'lobby') return this.send(ws, { t: 'error', msg: 'That game already started.' });
        const cap = L.settings.mode;
        if (Object.keys(L.players).length >= cap * 2) return this.send(ws, { t: 'error', msg: 'Room is full.' });
        const build = typeof m.build === 'object' && JSON.stringify(m.build).length <= MAX_BUILD ? m.build : null;
        if (!build) return this.send(ws, { t: 'error', msg: 'Invalid player build.' });
        const team = this.teamCount(0) <= this.teamCount(1) && this.teamCount(0) < cap ? 0 : 1;
        L.players[id] = { id, name: cleanName(m.name), build, team, ready: false, order: L.order++ };
        if (!L.host) L.host = id;
        ws.serializeAttachment({ id, joined: true });
        await this.save();
        this.send(ws, { t: 'welcome', id, code: L.code });
        this.broadcast(this.lobbyMsg());
        return;
      }
      case 'side': {
        if (!me || L.phase !== 'lobby') return;
        const team = m.team === 1 ? 1 : 0;
        if (team !== me.team && this.teamCount(team) >= L.settings.mode) return this.send(ws, { t: 'error', msg: 'That side is full.' });
        me.team = team; me.ready = false;
        break;
      }
      case 'build': {
        if (!me || L.phase !== 'lobby' || typeof m.build !== 'object' || JSON.stringify(m.build).length > MAX_BUILD) return;
        me.build = m.build; me.name = cleanName(m.name); me.ready = false;
        break;
      }
      case 'ready': if (!me) return; me.ready = !!m.v; break;
      case 'settings': {
        if (!isHost || L.phase !== 'lobby') return;
        const s = m.settings || {};
        const next = {
          mode: MODES.includes(s.mode) ? s.mode : L.settings.mode,
          target: TARGETS.includes(s.target) ? s.target : L.settings.target,
          scoring: SCORING.includes(s.scoring) ? s.scoring : L.settings.scoring,
          difficulty: DIFFS.includes(s.difficulty) ? s.difficulty : L.settings.difficulty,
        };
        if (next.mode < L.settings.mode) {
          const players = Object.values(L.players);
          if (players.length > next.mode * 2) return this.send(ws, { t: 'error', msg: `Too many players for ${next.mode}v${next.mode}.` });
          for (const team of [0, 1]) {
            const side = players.filter(p => p.team === team).sort((a, b) => b.order - a.order);
            while (side.length > next.mode) side.shift().team = 1 - team;
          }
        }
        L.settings = next;
        for (const p of Object.values(L.players)) if (p.id !== id) p.ready = false;
        break;
      }
      case 'start': {
        if (!isHost || L.phase !== 'lobby' || typeof m.cfg !== 'object') return;
        L.phase = 'game';
        await this.save();
        this.broadcast({ t: 'start', cfg: m.cfg });
        this.broadcast(this.lobbyMsg());
        return;
      }
      case 'in': {
        if (!me || L.phase !== 'game' || isHost) return;
        this.sendTo(L.host, { t: 'in', from: id, i: m.i });
        return;
      }
      case 'st': {
        if (!isHost || L.phase !== 'game') return;
        const s = JSON.stringify({ t: 'st', s: m.s });
        for (const w of this.sockets()) { const a = w.deserializeAttachment(); if (a?.joined && a.id !== id) this.send(w, s); }
        return;
      }
      case 'lobby': {
        if (!isHost) return;
        L.phase = 'lobby';
        for (const p of Object.values(L.players)) p.ready = false;
        await this.save();
        this.broadcast({ t: 'toLobby' });
        this.broadcast(this.lobbyMsg());
        return;
      }
      case 'ping': this.send(ws, { t: 'pong', at: m.at }); return;
      default: return;
    }
    await this.save();
    this.broadcast(this.lobbyMsg());
  }

  async leave(ws) {
    const L = await this.load();
    const att = ws.deserializeAttachment() || {};
    if (!L || !att.id || !L.players[att.id]) return;
    delete L.players[att.id];
    const remaining = Object.values(L.players).sort((a, b) => a.order - b.order);
    if (!remaining.length) {
      await this.ctx.storage.deleteAll();
      this.lobby = null;
      return;
    }
    if (L.host === att.id) {
      L.host = remaining[0].id;
      if (L.phase === 'game') { L.phase = 'lobby'; this.broadcast({ t: 'hostLeft' }); }
    } else if (L.phase === 'game') {
      this.sendTo(L.host, { t: 'left', id: att.id });
    }
    await this.save();
    this.broadcast(this.lobbyMsg());
  }

  async webSocketClose(ws) { await this.leave(ws); }
  async webSocketError(ws) { await this.leave(ws); }

  async alarm() {
    for (const ws of this.sockets()) { try { ws.close(4000, 'room expired'); } catch { /* already closed */ } }
    await this.ctx.storage.deleteAll();
    this.lobby = null;
  }
}
