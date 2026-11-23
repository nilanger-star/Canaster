// Canasta Online – kleiner Spielserver (Node.js + WebSocket)
// Start: npm install && npm start   → http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const C = require('./logic.js');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'games.json');
const PUBLIC = __dirname;   // alle Dateien liegen im selben Ordner

/* ---------- Spielstände (im Speicher, zusätzlich in games.json gesichert) ---------- */
const games = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const g of saved) games.set(g.code, g);
  console.log(games.size + ' Spiele geladen.');
} catch (e) { /* noch keine Datei */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify([...games.values()]), err => { if (err) console.error('Speichern fehlgeschlagen:', err.message); });
  }, 1000);
}
// Aufräumen: beendete Spiele nach 12 h, alle anderen nach 3 Tagen ohne Aktivität
setInterval(() => {
  const now = Date.now();
  for (const [code, g] of games) {
    const age = now - (g.updatedAt || 0);
    if ((g.status === 'finished' && age > 12 * 3600e3) || age > 72 * 3600e3) games.delete(code);
  }
  save();
}, 3600e3);

/* ---------- HTTP: liefert die Webseite aus ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  const file = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  if (!['index.html', 'logic.js'].includes(file)) { res.writeHead(404); return res.end('Nicht gefunden'); }
  fs.readFile(path.join(PUBLIC, file), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Fehler'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/* ---------- WebSocket: Spielverkehr ---------- */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const clients = new Set();

const isOnline = (code, pid) => [...clients].some(c => c.pid === pid && c.code === code);
const viewFor = (g, pid) => C.view(g, pid, id => isOnline(g.code, id));
function listFor(pid) {
  return [...games.values()]
    .filter(g => g.status !== 'finished' || g.playerIds.includes(pid))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 40)
    .map(g => C.listItem(g, pid));
}
const sendTo = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function broadcastGame(g) {
  for (const c of clients) if (c.code === g.code && c.pid) sendTo(c, { t: 'game', game: viewFor(g, c.pid) });
}
function broadcastList() {
  for (const c of clients) if (c.pid && !c.code) sendTo(c, { t: 'list', games: listFor(c.pid) });
}

function genCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; if (!games.has(s)) return s; }
}

wss.on('connection', ws => {
  ws.pid = null; ws.code = null; ws.alive = true;
  clients.add(ws);
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    ws.alive = true;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') return sendTo(ws, { t: 'pong' });
    if (m.t === 'hello') {
      if (typeof m.pid !== 'string' || !/^[a-f0-9]{16,64}$/.test(m.pid)) return sendTo(ws, { t: 'error', msg: 'Ungültige Kennung.' });
      ws.pid = m.pid;
      if (!ws.code) sendTo(ws, { t: 'list', games: listFor(ws.pid) });
      else if (games.has(ws.code)) broadcastGame(games.get(ws.code));
      return;
    }
    if (!ws.pid) return;
    if (m.t === 'list') { ws.code = null; return sendTo(ws, { t: 'list', games: listFor(ws.pid) }); }
    if (m.t === 'close') { const old = ws.code; ws.code = null; if (old && games.has(old)) broadcastGame(games.get(old)); return; }
    if (m.t === 'create') {
      const n = [2, 3, 4].includes(m.n) ? m.n : 4;
      const code = genCode();
      games.set(code, C.newGame(code, n, ws.pid, C.cleanName(m.name)));
      ws.code = code; save();
      sendTo(ws, { t: 'created', code });
      broadcastGame(games.get(code)); broadcastList();
      return;
    }
    if (m.t === 'open') {
      const code = String(m.code || '').toUpperCase();
      const g = games.get(code);
      ws.code = code;
      if (!g) return sendTo(ws, { t: 'notfound', code });
      return broadcastGame(g);
    }
    if (m.t === 'action') {
      const g = games.get(String(m.code || ''));
      if (!g) return sendTo(ws, { t: 'ack', rid: m.rid, ok: false, msg: 'Das Spiel existiert nicht mehr.' });
      const work = JSON.parse(JSON.stringify(g));          // erst auf einer Kopie prüfen
      try {
        C.apply(work, ws.pid, String(m.a || ''), Array.isArray(m.args) ? m.args : []);
      } catch (e) {
        if (!e.game) console.error(e);
        return sendTo(ws, { t: 'ack', rid: m.rid, ok: false, msg: e.game ? e.message : 'Interner Fehler.' });
      }
      work.rev = (work.rev || 0) + 1; work.updatedAt = Date.now();
      games.set(work.code, work); save();
      sendTo(ws, { t: 'ack', rid: m.rid, ok: true });
      broadcastGame(work); broadcastList();
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
    if (ws.code && games.has(ws.code)) broadcastGame(games.get(ws.code));
  });
});
// tote Verbindungen erkennen
setInterval(() => {
  for (const ws of clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) {} }
}, 30000);

server.listen(PORT, () => console.log('Canasta läuft auf Port ' + PORT));
