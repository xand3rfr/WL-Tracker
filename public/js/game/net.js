// thin WebSocket client for the room Durable Object
export async function createRoom() {
  const r = await fetch('/api/rooms', { method: 'POST' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.code) throw new Error(data.error || 'Could not create a room.');
  return data.code;
}

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.id = null;
    this.code = null;
    this.closedByUs = false;
  }
  on(t, fn) { this.handlers[t] = fn; return this; }
  emit(t, m) { this.handlers[t]?.(m); }

  connect(code, hello) {
    this.code = code.toUpperCase();
    this.closedByUs = false;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = this.ws = new WebSocket(`${proto}//${location.host}/api/rooms/${this.code}/ws`);
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Connection timed out.')); ws.close(); } }, 8000);
      ws.onopen = () => this.send({ t: 'hello', ...hello });
      ws.onmessage = e => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'welcome') { this.id = m.id; if (!settled) { settled = true; clearTimeout(timer); resolve(m); } }
        if (m.t === 'error' && !settled) { settled = true; clearTimeout(timer); reject(new Error(m.msg)); return; }
        this.emit(m.t, m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) { settled = true; reject(new Error('Could not connect to that room.')); }
        else if (!this.closedByUs) this.emit('disconnect', {});
      };
    });
  }

  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closedByUs = true; this.ws?.close(); this.ws = null; this.id = null; }
}
