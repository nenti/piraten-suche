"use strict";
// Piraten-Suche — autoritativer Multiplayer-Server.
// Kein npm-Dependency: statischer Datei-Server + handgeschriebener
// WebSocket (RFC 6455, Text-Frames) + serverseitige Spielwelt.

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// ---------- statischer Client ----------
const CLIENT = fs.readFileSync(path.join(__dirname, "public", "index.html"));

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200); return res.end("ok"); }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(CLIENT);
});

// ---------- minimaler WebSocket ----------
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set();

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1")
    .update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n");
  socket.setNoDelay(true);

  const c = { socket, buf: Buffer.alloc(0), alive: true, player: null };
  clients.add(c);
  onConnect(c);

  socket.on("data", (d) => {
    c.buf = Buffer.concat([c.buf, d]);
    let frame;
    while ((frame = decodeFrame(c.buf))) {
      c.buf = frame.rest;
      if (frame.opcode === 0x8) { closeClient(c); return; }       // close
      if (frame.opcode === 0x9) { socket.write(encodeFrame(frame.payload, 0xA)); continue; } // ping->pong
      if (frame.opcode === 0x1) {                                  // text
        try { onMessage(c, JSON.parse(frame.payload.toString("utf8"))); }
        catch (_) {}
      }
    }
  });
  socket.on("close", () => closeClient(c));
  socket.on("error", () => closeClient(c));
});

function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  const need = off + (masked ? 4 : 0) + len;
  if (buf.length < need) return null;
  let payload;
  if (masked) {
    const mask = buf.slice(off, off + 4);
    payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[off + 4 + i] ^ mask[i & 3];
  } else {
    payload = buf.slice(off, off + len);
  }
  return { opcode, payload, rest: buf.slice(need) };
}

function encodeFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function send(c, obj) {
  if (!c.alive) return;
  try { c.socket.write(encodeFrame(JSON.stringify(obj))); }
  catch (_) { closeClient(c); }
}
function closeClient(c) {
  if (!c.alive) return;
  c.alive = false;
  clients.delete(c);
  if (c.player) delete world.players[c.player];
  try { c.socket.destroy(); } catch (_) {}
}

// ================= SPIELWELT (autoritativ) =================
const WORLD_W = 3600, WORLD_H = 1100;
const SEA_BOT = 260, SAND_BOT = 380;
const ROAD_Y = WORLD_H - 210, ROAD_H = 96;
const PARK = { x: 560, y: ROAD_Y - 80, w: 160, h: 80 };
const SHOP = { x: 300, y: 470, w: 110, h: 90 };               // Shop (Schippe/Knarre)
const AIRPORT = { x: 2700, y: 520, w: 520, h: 130 };          // Flugplatz (Level 2)
const RANCH = { x: 1650, y: 760, w: 170, h: 120 };            // Ranch: Schippen -> Pferd
const HORSE_COST = 10;                                        // Schippen für ein Pferd
const WIN_GOAL = 6;                                           // mehr Schätze als nötig
const MTYPES = {
  schleicher: { hp: 5,  r: 1.0 },
  flatterer:  { hp: 4,  r: 0.9 },
  brocken:    { hp: 10, r: 1.8 },     // groß, stark, hartnäckig
};
const rnd = (a, b) => a + Math.random() * (b - a);

const islands = [
  { x: 1500, y: 40, w: 240, h: 130 },
  { x: 2700, y: 70, w: 220, h: 150 },
  { x: 820,  y: 30, w: 180, h: 100 },
];
const houses = [
  { x: 760, y: 460, w: 130, h: 100 },
  { x: 1250, y: 600, w: 130, h: 100 },
  { x: 2150, y: 500, w: 140, h: 105 },
];
const trees = [
  { x: 560, y: 460 }, { x: 980, y: 600 }, { x: 1450, y: 460 },
  { x: 1850, y: 640 }, { x: 2050, y: 420 }, { x: 2500, y: 600 },
  { x: 470, y: 720 }, { x: 1650, y: 800 }, { x: 3050, y: 520 },
  { x: 2900, y: 760 }, { x: 3300, y: 600 },
];

function freshTreasures() {
  // Nicht immer am gleichen Platz: zufällig verteilt, aber fair erreichbar.
  const list = [
    { x: 260, y: 760, found: false, cave: true },                 // immer in der Höhle
    { x: islands[0].x + rnd(40,islands[0].w-40), y: islands[0].y + rnd(40,islands[0].h-30), found: false },
    { x: islands[1].x + rnd(40,islands[1].w-40), y: islands[1].y + rnd(40,islands[1].h-30), found: false },
  ];
  for (let i = 0; i < 5; i++) {                                    // 5 verstreut auf der Wiese
    let x, y, tries = 0;
    do { x = rnd(450, WORLD_W-200); y = rnd(SAND_BOT+50, WORLD_H-60); tries++; }
    while (blockedFoot(x, y) && tries < 40);
    list.push({ x, y, found: false });
  }
  return list;
}

const CAVE = { x: 120, y: 640, w: 300, h: 260 };
function inCave(x, y){ return x>CAVE.x&&x<CAVE.x+CAVE.w&&y>CAVE.y&&y<CAVE.y+CAVE.h; }
function onIsland(x, y){
  for (const is of islands)
    if (x>is.x&&x<is.x+is.w&&y>is.y&&y<is.y+is.h) return true;
  return false;
}
function isWater(x, y){ return y < SEA_BOT && !onIsland(x, y); }
function onRoad(x, y){
  if (x < 18 || x > WORLD_W - 18) return false;
  if (y > ROAD_Y && y < ROAD_Y + ROAD_H) return true;
  return x>PARK.x&&x<PARK.x+PARK.w&&y>PARK.y&&y<PARK.y+PARK.h;
}
function onPark(x, y){ return x>PARK.x&&x<PARK.x+PARK.w&&y>PARK.y&&y<PARK.y+PARK.h; }
function nearShop(x, y){ return Math.hypot(SHOP.x+SHOP.w/2-x, SHOP.y+SHOP.h/2-y) < 70; }
function nearRanch(x, y){ return Math.hypot(RANCH.x+RANCH.w/2-x, RANCH.y+RANCH.h/2-y) < 90; }
function blockedFoot(x, y){
  if (x<14||x>WORLD_W-14||y>WORLD_H-12) return true;
  if (isWater(x, y)) return true;
  for (const h of houses)
    if (x>h.x&&x<h.x+h.w&&y>h.y+30&&y<h.y+h.h) return true;
  return false;
}
function landNear(x, y){
  for (let r = 10; r <= 200; r += 10)
    for (let d = 0; d < 360; d += 22) {
      const a = d*Math.PI/180, px = x+Math.cos(a)*r, py = y+Math.sin(a)*r;
      if (!blockedFoot(px, py)) return { x: px, y: py };
    }
  return { x: Math.max(20, Math.min(WORLD_W-20, x)), y: SEA_BOT+14 };
}

const world = {
  players: {},                 // id -> player
  treasures: freshTreasures(),
  boats: [],
  cars: [],
  bolts: [],
  monsters: [],
  truck: { x: 0, y: ROAD_Y + ROAD_H/2, dir: 1 },   // Eiswagen
  bushes: [],
  pickups: [],                                     // gedroppte Schippen
  planes: [],                                      // Flugzeuge (ab Level 2)
  won: false,
  level: 1,
};
for (let i = 0; i < 10; i++)
  world.bushes.push({ x: rnd(500, WORLD_W-200), y: rnd(SAND_BOT+60, WORLD_H-70), ripe: true, regrow: 0 });
for (let i = 0; i < 9; i++) spawnMonster();

function spawnMonster() {
  // Level 2: mehr & gemeinere Mischung, inkl. großer Brocken
  const pool = world.level >= 2
    ? ["schleicher","flatterer","brocken","brocken","flatterer"]
    : ["schleicher","flatterer","schleicher"];
  const type = pool[Math.floor(Math.random()*pool.length)];
  const m = MTYPES[type];
  world.monsters.push({
    x: rnd(1400, WORLD_W-200), y: rnd(SAND_BOT+90, WORLD_H-90),
    vx: 0, vy: 0, type, hp: m.hp, maxhp: m.hp, r: m.r,
    flee: 0, mad: 0, pop: 0, wob: Math.random()*7,
  });
}

let nextId = 1;
function onConnect(c) {
  const id = "p" + (nextId++);
  c.player = id;
  world.players[id] = {
    id, name: "Pirat " + id.slice(1),
    x: 700, y: 420, dir: 1, color: pickColor(),
    hearts: 3, coins: 0, shovels: 5, shovelLvl: 1, gun: false, gunCd: 0,
    boat: null, car: null, plane: null, horse: null, mounted: false, down: 0, inv: 0,
    in: { dx: 0, dy: 0, act: false }, lastAct: false,
  };
  send(c, { t: "init", id, W: WORLD_W, H: WORLD_H,
            statics: { houses, trees, islands, cave: CAVE, road: { ROAD_Y, ROAD_H }, park: PARK, shop: SHOP, airport: AIRPORT, ranch: RANCH } });
}
const COLORS = ["#e8413a","#3a78e8","#2fae5f","#e0a82e","#9b59b6","#e91e8c"];
function pickColor() {
  const used = Object.values(world.players).map(p => p.color);
  return COLORS.find(c => !used.includes(c)) || COLORS[(nextId) % COLORS.length];
}

function onMessage(c, m) {
  const p = world.players[c.player];
  if (!p) return;
  if (m.t === "name" && typeof m.name === "string")
    p.name = m.name.slice(0, 14).replace(/[^\p{L}\p{N} _-]/gu, "") || p.name;
  if (m.t === "in") {
    p.in.dx = Math.max(-1, Math.min(1, +m.dx || 0));
    p.in.dy = Math.max(-1, Math.min(1, +m.dy || 0));
    p.in.act = !!m.act;
  }
  if (m.t === "buy" && nearShop(p.x, p.y)) {
    if (m.item === "shovel" && p.coins >= 3) { p.coins -= 3; p.shovels += 3; }
    else if (m.item === "gun" && !p.gun && p.coins >= 12) { p.coins -= 12; p.gun = true; }
  }
  if (m.t === "ranch" && nearRanch(p.x, p.y)) {
    if (m.item === "horse" && !p.horse && p.shovels >= HORSE_COST) {
      p.shovels -= HORSE_COST;
      p.horse = { x: p.x, y: p.y + 4, dir: p.dir };
      p.mounted = true; p.x = p.horse.x; p.y = p.horse.y;
    } else if (m.item === "sell" && p.shovels >= 5) {
      p.shovels -= 5; p.coins += 3;                 // Überschuss-Schippen -> Münzen
    }
  }
}

function nearestUnfound(x, y) {
  let best = null, bd = 1e9;
  for (const tr of world.treasures) {
    if (tr.found) continue;
    const d = Math.hypot(tr.x-x, tr.y-y);
    if (d < bd) { bd = d; best = tr; }
  }
  return { tr: best, d: bd };
}

function doAction(p) {
  // Mitspieler wiederbeleben (sanftes Koop-Helfen)
  for (const o of Object.values(world.players))
    if (o !== p && o.down > 0 && Math.hypot(o.x-p.x, o.y-p.y) < 50) {
      o.down = 0; o.hearts = 2; o.inv = 120; return;
    }
  if (p.boat) {                                  // Boot verlassen -> an Land daneben
    const s = landNear(p.x, p.y);
    p.boat.driver = null; p.boat = null; p.x = s.x; p.y = s.y; return;
  }
  if (p.car) {                                   // überall aussteigen (Multiplayer-tauglich)
    const s = landNear(p.x, p.y);
    p.car.driver = null; p.car = null; p.x = s.x; p.y = s.y;
    return;
  }
  if (p.plane) {                                 // landen / aussteigen, überall
    const s = landNear(p.x, p.y);
    p.plane.driver = null; p.plane = null; p.x = s.x; p.y = s.y;
    return;
  }
  if (p.mounted) {                               // vom Pferd absteigen (überall)
    const s = landNear(p.x, p.y);
    p.mounted = false; p.horse.x = p.x; p.horse.y = p.y;
    p.x = s.x; p.y = s.y; return;
  }
  if (p.horse && Math.hypot(p.horse.x-p.x, p.horse.y-p.y) < 70) {  // eigenes Pferd besteigen
    p.mounted = true; p.x = p.horse.x; p.y = p.horse.y; return;
  }
  // Tiere verscheuchen
  for (const a of world.monsters) {
    const k = Math.hypot(a.x-p.x, a.y-p.y);
    if (k < 130 && a.type !== "brocken") { a.flee = 45; a.mad = 0;
      a.vx = (a.x-p.x)/(k||1)*2.4; a.vy = (a.y-p.y)/(k||1)*2.4; }
  }
  for (const b of world.boats)                   // Boot einsteigen
    if (!b.driver && Math.hypot(b.x-p.x, b.y-p.y) < 95) {
      b.driver = p; p.boat = b; p.x = b.x; p.y = b.y; return;
    }
  for (const cr of world.cars)                   // Auto einsteigen
    if (!cr.driver && Math.hypot(cr.x-p.x, cr.y-p.y) < 90) {
      cr.driver = p; p.car = cr; p.x = cr.x; p.y = cr.y; return;
    }
  for (const pl of world.planes)                 // Flugzeug einsteigen
    if (!pl.driver && Math.hypot(pl.x-p.x, pl.y-p.y) < 100) {
      pl.driver = p; p.plane = pl; p.x = pl.x; p.y = pl.y; return;
    }
  if (nearShop(p.x, p.y)) return;                  // Shop läuft über das Menü (buy)
  if (nearRanch(p.x, p.y)) return;                 // Ranch läuft über das Menü (ranch)
  // Eiswagen: Eis fuer Muenzen -> heilen
  if (Math.hypot(world.truck.x-p.x, world.truck.y-p.y) < 60 && p.hearts < 3 && p.coins >= 2) {
    p.coins -= 2; p.hearts = Math.min(3, p.hearts + 2); return;
  }
  for (const bu of world.bushes)                  // Beere essen
    if (bu.ripe && p.hearts < 3 && Math.hypot(bu.x-p.x, bu.y-p.y) < 40) {
      bu.ripe = false; bu.regrow = 600; p.hearts++; return;
    }
  // Graben (begrenzte Schaufeln, Upgrade = mehr Muenzen)
  if (p.shovels <= 0) return;
  const { tr, d } = nearestUnfound(p.x, p.y);
  if (tr && d < 40 + p.shovelLvl*6) {
    tr.found = true;
    p.coins += 2 + p.shovelLvl * 2;
    const got = world.treasures.filter(z => z.found).length;
    if (got >= WIN_GOAL && !world.won) { world.won = true; winSequence(); }
  } else {
    p.shovels--;                                  // Fehlversuch kostet eine Schaufel
  }
}
function winSequence() {
  const toLevel2 = world.level === 1;
  setTimeout(() => {
    if (toLevel2) {
      world.level = 2;
      for (let i = 0; i < 3; i++)                  // Flugzeuge am Flugplatz
        world.planes.push({ x: AIRPORT.x + 70 + i*150, y: AIRPORT.y + AIRPORT.h/2, dir: 1, driver: null, cd: 0 });
      for (let i = 0; i < 6; i++) spawnMonster();   // Level 2: mehr & crazier
    }
    world.treasures = freshTreasures();
    world.won = false;
  }, 6000);
}

function fireBolt(p, maxRange = 560) {
  let tgt = null, bd = 1e9;
  for (const a of world.monsters) {
    const d = Math.hypot(a.x-p.x, a.y-p.y);
    if (d < bd) { bd = d; tgt = a; }
  }
  if (!tgt || bd > maxRange) return;
  const k = bd || 1;
  world.bolts.push({ x: p.x, y: p.y-6, vx: (tgt.x-p.x)/k*9, vy: (tgt.y-p.y)/k*9, life: 80 });
}

// ---------- Tick ----------
function tick() {
  for (const p of Object.values(world.players)) {
    const edge = p.in.act && !p.lastAct;
    p.lastAct = p.in.act;
    if (p.down > 0) { p.down--; if (p.down === 0) { p.hearts = 2; p.inv = 150; } continue; }
    if (p.inv > 0) p.inv--;
    const dx = p.in.dx, dy = p.in.dy;
    if (dx || dy) {
      const l = Math.hypot(dx, dy) || 1;
      const sp = p.plane ? 9.5 : p.car ? 7.4 : p.mounted ? 6.6 : p.boat ? 5.8 : 4.7;
      let nx = p.x + dx/l*sp, ny = p.y + dy/l*sp;
      if (dx) p.dir = dx > 0 ? 1 : -1;
      if (p.plane) {                               // fliegt frei über alles
        p.x = Math.max(20, Math.min(WORLD_W-20, nx));
        p.y = Math.max(20, Math.min(WORLD_H-20, ny));
        p.plane.x = p.x; p.plane.y = p.y; if (dx) p.plane.dir = p.dir;
      } else if (p.mounted) {                      // Pferd: schnell, nur an Land
        if (!blockedFoot(nx, p.y)) p.x = nx;
        if (!blockedFoot(p.x, ny)) p.y = ny;
        p.horse.x = p.x; p.horse.y = p.y; if (dx) p.horse.dir = p.dir;
      } else if (p.boat) {
        nx = Math.max(20, Math.min(WORLD_W-20, nx));
        ny = Math.max(16, Math.min(SEA_BOT-6, ny));
        p.x = nx; p.y = ny; p.boat.x = nx; p.boat.y = ny;
      } else if (p.car) {
        if (onRoad(nx, p.y)) p.x = nx;
        if (onRoad(p.x, ny)) p.y = ny;
        p.car.x = p.x; p.car.y = p.y; if (dx) p.car.dir = p.dir;
      } else {
        if (!blockedFoot(nx, p.y)) p.x = nx;
        if (!blockedFoot(p.x, ny)) p.y = ny;
      }
    }
    if (!p.boat && !p.car && !p.plane && isWater(p.x, p.y)) { const s = landNear(p.x, p.y); p.x = s.x; p.y = s.y; }
    if (p.horse && !p.mounted && isWater(p.horse.x, p.horse.y)) { const s = landNear(p.horse.x, p.horse.y); p.horse.x = s.x; p.horse.y = s.y; }
    if (edge) doAction(p);
    // Knarre: verteidigt automatisch zu Fuß (kein Zielen nötig)
    if (p.gunCd > 0) p.gunCd--;
    if (p.gun && !p.car && !p.boat && p.down <= 0 && p.gunCd <= 0) {
      const before = world.bolts.length;
      fireBolt(p, 230);
      if (world.bolts.length > before) p.gunCd = 16;   // ~0.8 s
    }
  }

  // Auto schießt automatisch auf nahe Monster (kein Knopf -> Aktion = aussteigen)
  for (const c of world.cars) {
    if (c.cd > 0) c.cd--;
    if (c.driver && c.cd <= 0) {
      const before = world.bolts.length;
      fireBolt(c.driver, 340);
      if (world.bolts.length > before) c.cd = 12;   // ~0.6 s
    }
  }
  // Flugzeug schießt automatisch (große Reichweite)
  for (const pl of world.planes) {
    if (pl.cd > 0) pl.cd--;
    if (pl.driver && pl.cd <= 0) {
      const before = world.bolts.length;
      fireBolt(pl.driver, 420);
      if (world.bolts.length > before) pl.cd = 10;  // ~0.5 s
    }
  }

  // Boote/Autos folgen ihren Fahrern (oben gesetzt); freie bleiben stehen.
  // "Boot kommt zu dir": stehen alle Boote weit weg und ein Spieler ist an
  // einer Kueste ohne Boot in der Naehe, schwimmt das naechste langsam heran.
  for (const p of Object.values(world.players)) {
    if (p.boat || p.car) continue;
    if (p.y > SEA_BOT + 40) continue;                       // nur nahe Wasser
    let near = false, nb = null, nbd = 1e9;
    for (const b of world.boats) {
      const d = Math.hypot(b.x-p.x, b.y-p.y);
      if (!b.driver && d < 120) near = true;
      if (!b.driver && d < nbd) { nbd = d; nb = b; }
    }
    if (!near && nb) {
      const k = nbd || 1;
      nb.x += (p.x - nb.x)/k * 2.0;
      nb.y += Math.max(16, Math.min(SEA_BOT-6, p.y - 20) - nb.y) * 0.04;
    }
  }

  // Monster
  for (const a of world.monsters) {
    a.wob += .15;
    let mx;
    if (a.flee > 0) {
      a.flee--; a.mad = 0;
      let np = null, nd = 1e9;
      for (const p of Object.values(world.players)) {
        const d = Math.hypot(p.x-a.x, p.y-a.y); if (d < nd) { nd = d; np = p; }
      }
      if (np) { const k = nd||1; a.vx = (a.x-np.x)/k*2.4; a.vy = (a.y-np.y)/k*2.4; }
      mx = 2.4;
    } else {
      let tgt = null, td = 1e9;
      for (const p of Object.values(world.players)) {
        if (p.boat || p.car || p.plane || p.mounted || p.inv > 0 || p.down > 0) continue;
        const d = Math.hypot(p.x-a.x, p.y-a.y); if (d < td) { td = d; tgt = p; }
      }
      // aggressiv: große Reichweite, halten hartnäckig drauf
      const range = a.type === "flatterer" ? 360 : a.type === "brocken" ? 420 : 320;
      if (tgt && td < range) {
        a.mad = Math.min(1, a.mad + .05);
        const acc = a.type === "flatterer" ? .34 : a.type === "brocken" ? .26 : .28;
        a.vx += (tgt.x-a.x)/td*acc; a.vy += (tgt.y-a.y)/td*acc;
        if (td < 26*a.r) {
          tgt.hearts--; tgt.inv = 120;
          const kb = a.type === "brocken" ? 40 : 22;
          const k = Math.hypot(tgt.x-a.x, tgt.y-a.y)||1;
          tgt.x = Math.max(16, Math.min(WORLD_W-16, tgt.x+(tgt.x-a.x)/k*kb));
          tgt.y = Math.max(SEA_BOT+8, Math.min(WORLD_H-12, tgt.y+(tgt.y-a.y)/k*kb));
          if (tgt.hearts <= 0) { tgt.hearts = 0; tgt.down = 240; }
          a.flee = a.type === "brocken" ? 8 : 20;     // kommt sofort wieder
        }
        mx = a.type === "flatterer" ? 3.2 : a.type === "brocken" ? 2.3 : 2.6;
      } else {
        a.mad = Math.max(0, a.mad - .02);
        if (Math.random() < .02) { a.vx = rnd(-.6,.6); a.vy = rnd(-.6,.6); }
        mx = .7;
      }
    }
    const sp = Math.hypot(a.vx, a.vy);
    if (sp > mx) { a.vx = a.vx/sp*mx; a.vy = a.vy/sp*mx; }
    let nx = a.x+a.vx, ny = a.y+a.vy;
    if (ny < SAND_BOT+12) { ny = SAND_BOT+12; a.vy *= -1; }
    if (ny > WORLD_H-14) { ny = WORLD_H-14; a.vy *= -1; }
    if (nx < 14 || nx > WORLD_W-14) a.vx *= -1;
    a.x = Math.max(14, Math.min(WORLD_W-14, nx)); a.y = ny;
    if (a.pop > 0) a.pop--;
  }

  // Schüsse
  for (let i = world.bolts.length-1; i >= 0; i--) {
    const b = world.bolts[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    let hit = false;
    for (let j = world.monsters.length-1; j >= 0; j--) {
      const a = world.monsters[j];
      if (Math.hypot(a.x-b.x, a.y-b.y) < 18*a.r) {
        a.hp--; a.pop = 12; hit = true;
        const k = Math.hypot(a.x-b.x, a.y-b.y)||1;
        // wird angeschossen, kommt aber gleich wieder (aggressiv)
        a.flee = a.type === "brocken" ? 0 : 14;
        a.vx = (a.x-b.x)/k*2.0; a.vy = (a.y-b.y)/k*2.0;
        if (a.hp <= 0) {                              // kaputt -> droppt Schippen
          const n = 1 + (Math.random() < 0.5 ? 1 : 0);
          for (let s = 0; s < n; s++)
            world.pickups.push({ x: a.x + rnd(-14, 14), y: a.y + rnd(-14, 14), life: 1800 });
          world.monsters.splice(j, 1);
          setTimeout(spawnMonster, 4000);
        }
        break;
      }
    }
    if (hit || b.life <= 0 || b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H)
      world.bolts.splice(i, 1);
  }

  for (const bu of world.bushes) if (!bu.ripe && --bu.regrow <= 0) bu.ripe = true;

  // Schippen-Drops aufsammeln (Team kann sich so versorgen)
  for (let i = world.pickups.length-1; i >= 0; i--) {
    const pk = world.pickups[i];
    if (--pk.life <= 0) { world.pickups.splice(i, 1); continue; }
    for (const p of Object.values(world.players)) {
      if (p.down > 0 || p.boat) continue;
      if (Math.hypot(p.x-pk.x, p.y-pk.y) < 26) {
        p.shovels += 2;
        world.pickups.splice(i, 1);
        break;
      }
    }
  }

  // Eiswagen faehrt die Strasse entlang
  const tr = world.truck;
  tr.x += tr.dir * 1.6;
  if (tr.x > WORLD_W-40) tr.dir = -1;
  if (tr.x < 40) tr.dir = 1;

  broadcast();
}

function broadcast() {
  const snap = {
    t: "s",
    players: Object.values(world.players).map(p => ({
      id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y),
      d: p.dir, c: p.color, h: p.hearts, co: p.coins, sh: p.shovels,
      sl: p.shovelLvl, gn: p.gun, bo: !!p.boat, ca: !!p.car, pn: !!p.plane,
      mo: p.mounted,
      ho: p.horse ? { x: Math.round(p.horse.x), y: Math.round(p.horse.y), d: p.horse.dir } : null,
      dn: p.down > 0, iv: p.inv > 0,
    })),
    won: world.won, goal: WIN_GOAL, level: world.level,
    pl: world.planes.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), d: p.dir, dr: !!p.driver })),
    tr: world.treasures.map(t => ({ x: t.x, y: t.y, f: t.found, cv: !!t.cave })),
    bo: world.boats.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), dr: !!b.driver })),
    ca: world.cars.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), d: c.dir, dr: !!c.driver })),
    mo: world.monsters.map(a => ({ x: Math.round(a.x), y: Math.round(a.y), tp: a.type, hp: a.hp, mh: a.maxhp, md: a.mad, po: a.pop })),
    bl: world.bolts.map(b => ({ x: Math.round(b.x), y: Math.round(b.y) })),
    bu: world.bushes.map(b => ({ x: b.x, y: b.y, r: b.ripe })),
    pk: world.pickups.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    tk: { x: Math.round(world.truck.x), y: world.truck.y },
  };
  const msg = encodeFrame(JSON.stringify(snap));
  for (const c of clients) if (c.alive) { try { c.socket.write(msg); } catch (_) { closeClient(c); } }
}

// Boote & Autos einmalig platzieren
for (let i = 0; i < 4; i++)
  world.boats.push({ x: 620 + i*150, y: SEA_BOT-55, driver: null });
for (let i = 0; i < 4; i++)
  world.cars.push({ x: PARK.x + 24 + i*34, y: PARK.y + 40, dir: 1, driver: null, cd: 0 });

setInterval(tick, 50);   // 20 Hz

server.listen(PORT, HOST, () =>
  console.log("Piraten-Suche listening on " + HOST + ":" + PORT));
