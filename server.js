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

const MANIFEST = JSON.stringify({
  name: "Piraten-Suche", short_name: "Piraten",
  start_url: "/", display: "fullscreen", orientation: "landscape",
  background_color: "#07151d", theme_color: "#07151d",
  icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
});
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="12" fill="#2e6f4e"/>' +
  '<text x="32" y="44" font-size="38" text-anchor="middle">🏴‍☠️</text></svg>';

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") { res.writeHead(200); return res.end("ok"); }
  if (req.url === "/manifest.json") {
    res.writeHead(200, { "Content-Type": "application/manifest+json" });
    return res.end(MANIFEST);
  }
  if (req.url === "/icon.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(ICON);
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
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
  if (c.player) {
    const pl = world.players[c.player];               // Fahrzeug-Sitze freigeben
    if (pl) for (const arr of [world.boats, world.cars, world.planes, world.subs])
      for (const v of arr) { if (v.driver === pl) v.driver = null; if (v.passenger === pl) v.passenger = null; }
    delete world.players[c.player];
    if (world.adminId === c.player) {                 // Admin neu vergeben
      const ids = Object.keys(world.players);
      world.adminId = ids.length ? ids[0] : null;
    }
  }
  try { c.socket.destroy(); } catch (_) {}
}

// ================= SPIELWELT (autoritativ) =================
let WORLD_W = 3300, WORLD_H = 1100;               // WELT WAECHST PRO LEVEL: 1=3300, 2=4500, 3+=5400 (Phase 3c)
const SEA_BOT = 260, SAND_BOT = 380;
const HQ = { x: 700, y: 430 };                    // Headquarter / Spawn-Basis (sicher)
function hqR() { return 110 + world.level * 30; }  // wächst pro Level
// 2D-Distanz: deutlich schneller als Math.hypot in V8 (kein Variadic/Overflow-Handling),
// identisches Ergebnis bei Spiel-Koordinaten. Heisser Pfad: pro Tick x Monster x Schuss.
const dist = (x, y) => Math.sqrt(x*x + y*y);

function inHQ(x, y) { return dist(x-HQ.x, y-HQ.y) < hqR(); }
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
  oktopus:    { hp: 6,  r: 1.4, sea: true },   // Level 3: lebt im Meer
  kannibale:  { hp: 6,  r: 1.0 },     // Level 3: bewacht die Königsinsel
  koenig:     { hp: 24, r: 2.6 },     // Level 3: Boss auf der Königsinsel
};
const rnd = (a, b) => a + Math.random() * (b - a);

// letzte Insel = große Königsinsel (Level 3)
const islands = [
  { x: 1500, y: 40,  w: 240, h: 130 },
  { x: 2700, y: 70,  w: 220, h: 150 },
  { x: 820,  y: 30,  w: 180, h: 100 },
  { x: 4200, y: 6,   w: 760, h: 238, king: true },   // groß & noch weiter draußen (Phase 3: Bossinsel Richtung Meer geschoben)
];
const BIGISLAND = islands[3];
const HARBOR = { x: 360, y: SEA_BOT - 60, w: 220, h: 50 };   // U-Boot-Hafen (Level 3)
const houses = [
  { x: 1100, y: 460, w: 130, h: 100 },           // vorher x=760 — lag IM HQ-Radius, jetzt klar ausserhalb
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
function nearShop(x, y){ return dist(SHOP.x+SHOP.w/2-x, SHOP.y+SHOP.h/2-y) < 70; }
function nearRanch(x, y){ return dist(RANCH.x+RANCH.w/2-x, RANCH.y+RANCH.h/2-y) < 90; }
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
  spears: [],                                      // feindliche Speere (Boss)
  monsters: [],
  truck: { x: 0, y: ROAD_Y + ROAD_H/2, dir: 1 },   // Eiswagen
  bushes: [],
  pickups: [],                                     // gedroppte Schippen + Muenzen (kind "s" / "c")
  hq: { hp: 30, maxhp: 30, hitFx: 0, dmgCd: 0, deadTimer: 0, towerLvl: 0, hpLvl: 0 },   // HQ hat Leben + Ausbau + Game-Over-Timer (Phase 3)
  towers: [                                        // 4 Verteidigungs-Tuerme um HQ herum
    { x: HQ.x - 100, y: HQ.y - 70, cd: 0 },
    { x: HQ.x + 100, y: HQ.y - 70, cd: 0 },
    { x: HQ.x - 100, y: HQ.y + 70, cd: 0 },
    { x: HQ.x + 100, y: HQ.y + 70, cd: 0 },
  ],
  planes: [],                                      // Flugzeuge (ab Level 2)
  subs: [],                                        // U-Boote (ab Level 3)
  won: false,
  level: 1,
  kingDown: 0,                                     // >0: König besiegt (Banner-Timer)
  adminId: null,                                   // erster Spieler darf neu starten
  waveCd: 700,                                     // Ticks bis zur nächsten Monsterwelle
  wave: 0,                                         // >0: "Welle!"-Banner-Timer
};
for (let i = 0; i < 10; i++)
  world.bushes.push({ x: rnd(500, WORLD_W-200), y: rnd(SAND_BOT+60, WORLD_H-70), ripe: true, regrow: 0 });
for (let i = 0; i < 6; i++) spawnMonster();

function spawnMonster(type, x, y) {
  if (!type) {
    const pool = world.level >= 2
      ? ["schleicher","flatterer","brocken","brocken","flatterer"]
      : ["schleicher","flatterer","schleicher"];
    type = pool[Math.floor(Math.random()*pool.length)];
  }
  const m = MTYPES[type];
  if (x == null) {
    if (m.sea) { x = rnd(200, WORLD_W-200); y = rnd(40, SEA_BOT-30); }
    else { x = rnd(WORLD_W*0.6, WORLD_W-120); y = rnd(SAND_BOT+90, WORLD_H-90); }   // Phase 3: rechts spawnen, laufen Richtung HQ
  }
  world.monsters.push({
    x, y, vx: 0, vy: 0, type, hp: m.hp, maxhp: m.hp, r: m.r, sea: !!m.sea,
    island: type === "koenig" || type === "kannibale",   // bleibt auf der Königsinsel
    flee: 0, mad: 0, pop: 0, wob: Math.random()*7,
  });
}

let nextId = 1;
function onConnect(c) {
  const id = "p" + (nextId++);
  c.player = id;
  world.players[id] = {
    id, name: "Pirat " + id.slice(1),
    x: HQ.x, y: HQ.y, dir: 1, color: pickColor(),
    hearts: 3, coins: 0, shovels: 5, shovelLvl: 1, gun: false, planeLvl: 0, shootCd: 0,
    boat: null, car: null, plane: null, sub: null, horse: null, mounted: false,
    down: 0, inv: 0, fx: null, hqResp: false,
    in: { dx: 0, dy: 0, act: false }, lastAct: false, lastActive: Date.now(),
  };
  if (!world.adminId) world.adminId = id;            // erster Spieler = Admin
  send(c, { t: "init", id, W: WORLD_W, H: WORLD_H,
            statics: { houses, trees, islands, cave: CAVE, road: { ROAD_Y, ROAD_H }, park: PARK, shop: SHOP, airport: AIRPORT, ranch: RANCH, harbor: HARBOR, hq: HQ } });
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
    if (p.in.dx || p.in.dy || p.in.act) p.lastActive = Date.now();
  }
  if (m.t === "exit") exitVehicle(p);
  if (m.t === "restart" && c.player === world.adminId) resetWorld();
  if (m.t === "buy" && nearShop(p.x, p.y)) {
    // Knarre & Flugzeug-Upgrade wahlweise mit Schippen (2x Muenz-Preis,
    // passt zur Ranch-Rate 5🪚→3🪙). Schippen-Stack bleibt Muenz-only.
    const ws = m.pay === "shovels";
    if (m.item === "shovel" && p.coins >= 3) { p.coins -= 3; p.shovels += 3; }
    else if (m.item === "gun" && !p.gun) {
      if (ws && p.shovels >= 24)     { p.shovels -= 24; p.gun = true; }
      else if (!ws && p.coins >= 12) { p.coins -= 12;   p.gun = true; }
    }
    else if (m.item === "planeup" && p.planeLvl < 3) {
      if (ws && p.shovels >= 30)     { p.shovels -= 30; p.planeLvl++; }
      else if (!ws && p.coins >= 15) { p.coins -= 15;   p.planeLvl++; }
    }
  }
  if (m.t === "hqbuy" && inHQ(p.x, p.y)) {
    // Burg-Ausbau: Reparieren / Tuerme staerker / Max-HP erweitern. Bezahlt der Spieler aus eigener Tasche.
    if (m.item === "repair") {
      if (p.coins >= 2 && world.hq.hp < world.hq.maxhp) {
        p.coins -= 2; world.hq.hp = Math.min(world.hq.maxhp, world.hq.hp + 3);
      }
    } else if (m.item === "tower" && world.hq.towerLvl < 3) {
      const cost = [10, 20, 40][world.hq.towerLvl];
      if (p.coins >= cost) { p.coins -= cost; world.hq.towerLvl++; }
    } else if (m.item === "hpcap" && world.hq.hpLvl < 3) {
      const cost = [15, 30, 60][world.hq.hpLvl];
      if (p.coins >= cost) {
        p.coins -= cost; world.hq.hpLvl++;
        world.hq.maxhp = 30 + world.hq.hpLvl * 5;
        world.hq.hp = world.hq.maxhp;            // Upgrade heilt direkt auf neues Max
      }
    }
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
    const d = dist(tr.x-x, tr.y-y);
    if (d < bd) { bd = d; best = tr; }
  }
  return { tr: best, d: bd };
}

function vehInfo(p) {
  if (p.boat)  return { v: p.boat,  kind: "boat",  arr: world.boats };
  if (p.car)   return { v: p.car,   kind: "car",   arr: world.cars };
  if (p.plane) return { v: p.plane, kind: "plane", arr: world.planes };
  if (p.sub)   return { v: p.sub,   kind: "sub",   arr: world.subs };
  return null;
}
const SHOOT_RANGE = { boat: 320, car: 360, sub: 380, plane: 460, gun: 240 };
// manuelles Schießen: aus Fahrzeug oder mit Knarre; gehaltener Knopf feuert in Kadenz
function tryShoot(p) {
  const veh = vehInfo(p);
  if (!veh && !p.gun) return false;
  if (p.shootCd > 0) return true;
  fireBolt(p, SHOOT_RANGE[veh ? veh.kind : "gun"]);
  p.shootCd = (veh && veh.kind === "plane") ? Math.max(2, 5 - (p.planeLvl||0)) : 7;
  return true;
}

// Smarte Aktionstaste: automatisch die sinnvollste Aktion.
function doAction(p) {
  // 1. Mitspieler wiederbeleben
  for (const o of Object.values(world.players))
    if (o !== p && o.down > 0 && dist(o.x-p.x, o.y-p.y) < 50) {
      o.down = 0; o.hearts = 2; o.inv = 120; return;
    }
  // 2. Eis am Eiswagen (auch aus dem Fahrzeug!) — immer kaufbar fuer 2🪙;
  //    bei vollem Herz heilt es eben nicht, aber die Aktion geht durch.
  if (dist(world.truck.x-p.x, world.truck.y-p.y) < 60 && p.coins >= 2) {
    p.coins -= 2; p.hearts = Math.min(3, p.hearts + 2); p.fx = "ice"; return;
  }
  // 3. Beere essen (auch bei vollem Herz pflueckbar — bringt dann halt nix,
  //    kein Sperren der Aktion fuer Janik)
  for (const bu of world.bushes)
    if (bu.ripe && dist(bu.x-p.x, bu.y-p.y) < 40) {
      bu.ripe = false; bu.regrow = 600;
      if (p.hearts < 3) p.hearts++;
      return;
    }
  // 4. Graben — NUR direkt über einem ungefundenen Schatz
  if (p.shovels > 0) {
    const g = nearestUnfound(p.x, p.y);
    if (g.tr && g.d < 40 + p.shovelLvl*6) {
      g.tr.found = true; p.coins += 2 + p.shovelLvl*2; g.tr.fx = 16;
      const got = world.treasures.filter(z => z.found).length;
      if (got >= WIN_GOAL && !world.won) { world.won = true; winSequence(); }
      return;
    }
  }
  // 5. Ein-/Aufsteigen (zu Fuß ODER vom Pferd) — VOR dem Schießen, sonst
  //    blockt eine gekaufte Knarre dauerhaft jedes Einsteigen. Nur wer
  //    nicht selbst schon ein Fahrzeug fährt (vehInfo) steigt hier ein.
  if (!vehInfo(p)) {
    for (const b of world.boats)
      if (!b.driver && dist(b.x-p.x, b.y-p.y) < 95) { b.driver = p; p.boat = b; p.mounted = false; p.x=b.x; p.y=b.y; return; }
    for (const cr of world.cars)
      if (dist(cr.x-p.x, cr.y-p.y) < 92) {
        if (!cr.driver)        { cr.driver = p;    p.car = cr; p.mounted = false; p.x=cr.x; p.y=cr.y; return; }
        if (!cr.passenger)     { cr.passenger = p; p.car = cr; p.mounted = false; p.x=cr.x; p.y=cr.y; return; }
      }
    for (const pl of world.planes)
      if (!pl.driver && dist(pl.x-p.x, pl.y-p.y) < 100) { pl.driver = p; p.plane = pl; p.mounted = false; p.x=pl.x; p.y=pl.y; return; }
    for (const su of world.subs)
      if (!su.driver && dist(su.x-p.x, su.y-p.y) < 100) { su.driver = p; p.sub = su; p.mounted = false; p.x=su.x; p.y=su.y; return; }
    // Eigenes Pferd besteigen (wenn man gerade nicht reitet)
    if (p.horse && !p.mounted && dist(p.horse.x-p.x, p.horse.y-p.y) < 70) {
      p.mounted = true; p.x = p.horse.x; p.y = p.horse.y; return;
    }
  }
  // 6. Schießen (manuell) — im Fahrzeug oder mit Knarre zu Fuß
  if (tryShoot(p)) return;
  if (nearShop(p.x, p.y) || nearRanch(p.x, p.y)) return;   // Menüs erledigen das
  // Monster verscheuchen (Schaufel-Werfen entfernt — Janik verbrauchte
  // sonst unabsichtlich seine Schippen)
  for (const a of world.monsters) {
    const k = dist(a.x-p.x, a.y-p.y);
    if (k < 120 && a.type !== "brocken" && a.type !== "koenig") {
      a.flee = 22; a.mad = 0; a.vx = (a.x-p.x)/(k||1)*2.4; a.vy = (a.y-p.y)/(k||1)*2.4;
    }
  }
}

// Aussteigen / Absteigen — eigener Knopf ({t:"exit"})
function exitVehicle(p) {
  if (p.boat) {
    const s = landNear(p.x, p.y); const b = p.boat;
    if (b.driver === p) b.driver = null;
    p.boat = null;
    let bx = b.x, by = b.y;
    outer: for (let r = 14; r <= 170; r += 14)
      for (let dg = 0; dg < 360; dg += 20) {
        const a = dg*Math.PI/180, px = s.x+Math.cos(a)*r, py = s.y+Math.sin(a)*r;
        if (px > 20 && px < WORLD_W-20 && isWater(px, py)) {
          bx = px; by = Math.max(16, Math.min(SEA_BOT-6, py)); break outer;
        }
      }
    b.x = bx; b.y = by; p.x = s.x; p.y = s.y; return;
  }
  if (p.car) {
    const s = landNear(p.x, p.y); const c = p.car;
    if (c.driver === p) c.driver = null;
    if (c.passenger === p) c.passenger = null;
    p.car = null; p.x = s.x; p.y = s.y; return;
  }
  if (p.plane) { const s = landNear(p.x, p.y); if (p.plane.driver === p) p.plane.driver = null; p.plane = null; p.x = s.x; p.y = s.y; return; }
  if (p.sub)   { const s = landNear(p.x, p.y); if (p.sub.driver === p)   p.sub.driver   = null; p.sub   = null; p.x = s.x; p.y = s.y; return; }
  if (p.mounted) { const s = landNear(p.x, p.y); p.mounted = false; p.horse.x = p.x; p.horse.y = p.y; p.x = s.x; p.y = s.y; return; }
}

// Spieler geht zu Boden: aus Fahrzeug/Pferd werfen (Tod sichtbar, Sitz frei)
function goDown(p, hq) {
  for (const arr of [world.boats, world.cars, world.planes, world.subs])
    for (const v of arr) { if (v.driver === p) v.driver = null; if (v.passenger === p) v.passenger = null; }
  p.boat = p.car = p.plane = p.sub = null;
  p.mounted = false;
  p.hearts = 0; p.down = 1200; p.inv = 0;   // 60s Respawn-Timer (20Hz × 60)
  p.hqResp = true;                          // immer am HQ (Startpunkt) aufwachen
}
// Fahrzeug zerstört: Insassen werden ohnmächtig, Fahrzeug respawnt an seiner Basis
function destroyVehicle(v, kind, arr) {
  for (const p of Object.values(world.players)) {
    if (p[kind] === v) { goDown(p, true); }
  }
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  const base = v.base, mh = v.maxhp;
  setTimeout(() => {
    const fresh = { x: base.x, y: base.y, dir: 1, driver: null, hp: mh, maxhp: mh, ic: 0, dmg: 0, base };
    if (kind === "car") { fresh.passenger = null; fresh.mdl = v.mdl; }
    arr.push(fresh);
  }, 9000);
}
function winSequence() {
  const next = world.level + 1;
  setTimeout(() => {
    if (next === 2) {
      world.level = 2;
      WORLD_W = 4500;                              // Welt wird breiter: Flugplatz-Bereich kommt rein
      for (let i = 0; i < 3; i++) {                // Flugzeuge am Flugplatz
        const px = AIRPORT.x + 70 + i*150, py = AIRPORT.y + AIRPORT.h/2;
        world.planes.push({ x: px, y: py, dir: 1, driver: null, hp: 6, maxhp: 6, ic: 0, dmg: 0, base: { x: px, y: py } });
      }
      for (let i = 0; i < 4; i++) spawnMonster();   // Level 2: ein paar mehr (–2 zur Beruhigung)
    } else if (next === 3) {
      world.level = 3;
      WORLD_W = 5400;                              // Welt voll offen: Bossinsel erreichbar
      for (let i = 0; i < 3; i++) {                // U-Boote im Hafen
        const sx = HARBOR.x + 50 + i*70, sy = HARBOR.y + HARBOR.h/2;
        world.subs.push({ x: sx, y: sy, dir: 1, driver: null, hp: 7, maxhp: 7, ic: 0, dmg: 0, base: { x: sx, y: sy } });
      }
      for (let i = 0; i < 5; i++) spawnMonster("oktopus");          // Oktopusse im Meer (–2)
      for (let i = 0; i < 4; i++)                                   // Kannibalen auf der Königsinsel (–2)
        spawnMonster("kannibale", BIGISLAND.x + rnd(40, BIGISLAND.w-40), BIGISLAND.y + rnd(40, BIGISLAND.h-30));
      spawnMonster("koenig", BIGISLAND.x + BIGISLAND.w/2, BIGISLAND.y + BIGISLAND.h/2);  // König-Boss
    } else if (next === 4) {
      world.level = 4;                                               // crazier: 2. König + mehr
      for (let i = 0; i < 6; i++) spawnMonster("oktopus");          // Level 4 (–2)
      for (let i = 0; i < 6; i++)                                   // (–2)
        spawnMonster("kannibale", BIGISLAND.x + rnd(40, BIGISLAND.w-40), BIGISLAND.y + rnd(40, BIGISLAND.h-30));
      spawnMonster("koenig", BIGISLAND.x + BIGISLAND.w*0.3, BIGISLAND.y + BIGISLAND.h/2);
      spawnMonster("koenig", BIGISLAND.x + BIGISLAND.w*0.7, BIGISLAND.y + BIGISLAND.h/2);
      world.waveCd = 300;
    }
    world.treasures = freshTreasures();
    world.won = false;
  }, 6000);
}

function fireBolt(p, maxRange = 560) {
  let tgt = null, bd = 1e9;
  for (const a of world.monsters) {
    const d = dist(a.x-p.x, a.y-p.y);
    if (d < bd) { bd = d; tgt = a; }
  }
  if (!tgt || bd > maxRange) return;
  const k = bd || 1;
  const dmg = p.plane ? 1 + (p.planeLvl||0) : 1;     // Flugzeug-Upgrade = mehr Schaden
  world.bolts.push({ x: p.x, y: p.y-6, vx: (tgt.x-p.x)/k*9, vy: (tgt.y-p.y)/k*9, life: 80, dmg });
}
// Schaufel werfen — Erst-Verteidigung zu Fuß (kostet 1 Schippe)
function throwShovel(p) {
  if (p.shovels <= 0 || p.shootCd > 0) return false;
  let tgt = null, bd = 1e9;
  for (const a of world.monsters) {
    const d = dist(a.x-p.x, a.y-p.y);
    if (d < bd) { bd = d; tgt = a; }
  }
  if (!tgt || bd > 280) return false;
  const k = bd || 1;
  p.shovels--; p.shootCd = 11;
  world.bolts.push({ x: p.x, y: p.y-6, vx: (tgt.x-p.x)/k*8, vy: (tgt.y-p.y)/k*8, life: 60, dmg: 1, shovel: true });
  return true;
}
// kompletter Neustart (nur Admin / leeres Spiel)
function resetWorld() {
  world.level = 1; world.won = false; world.kingDown = 0; world.wave = 0; world.waveCd = 700;
  WORLD_W = 3300;                              // neue Runde -> Karte zurueck auf Level-1-Groesse
  world.treasures = freshTreasures();
  world.monsters = []; world.bolts = []; world.spears = []; world.pickups = [];
  world.planes = []; world.subs = [];
  world.boats = []; world.cars = [];
  world.hq.maxhp = 30; world.hq.hp = 30; world.hq.hitFx = 0; world.hq.dmgCd = 0;
  world.hq.deadTimer = 0; world.hq.towerLvl = 0; world.hq.hpLvl = 0;       // Ausbau-Reset bei neuer Runde
  for (const tw of world.towers) tw.cd = 0;
  for (let i = 0; i < 4; i++) { const bx=620+i*150, by=SEA_BOT-55;
    world.boats.push({ x:bx, y:by, driver:null, hp:6, maxhp:6, ic:0, dmg:0, base:{x:bx,y:by} }); }
  for (let i = 0; i < 4; i++) { const cx=PARK.x+24+i*34, cy=PARK.y+40;
    world.cars.push({ x:cx, y:cy, dir:1, driver:null, passenger:null, hp:8, maxhp:8, ic:0, dmg:0, mdl:i, base:{x:cx,y:cy} }); }
  for (let i = 0; i < 6; i++) spawnMonster();
  for (const p of Object.values(world.players)) {
    p.boat=p.car=p.plane=p.sub=p.horse=null; p.mounted=false;
    p.hearts=3; p.down=0; p.inv=120; p.coins=0; p.shovels=5; p.shovelLvl=1;
    p.gun=false; p.planeLvl=0; p.x=HQ.x; p.y=HQ.y; p.hqResp=false;
  }
}

// ---------- Tick ----------
function tick() {
  const PLR = Object.values(world.players);   // einmal pro Tick cachen statt pro Monster/Schuss neu allokieren
  for (const p of PLR) {
    const edge = p.in.act && !p.lastAct;
    p.lastAct = p.in.act;
    if (p.down > 0) {                       // ohnmächtig: wartet auf Rettung (Auto-Revive erst nach 30s)
      p.down--;
      if (p.down === 0) {
        p.hearts = 2; p.inv = 150;
        if (p.hqResp) { p.x = HQ.x; p.y = HQ.y; p.hqResp = false; }
      }
      continue;
    }
    if (p.inv > 0) p.inv--;
    // Flugzeug-Reparatur am HQ: wer im Flugzeug ueber der sicheren Zone hovert,
    // dessen Maschine flickt sich langsam (~1 HP / 1.5s @ 20Hz)
    if (p.plane && p.plane.hp < p.plane.maxhp && inHQ(p.x, p.y)) {
      p.plane.repCd = (p.plane.repCd || 0) - 1;
      if (p.plane.repCd <= 0) { p.plane.hp++; p.plane.repCd = 30; }
    }
    const dx = p.in.dx, dy = p.in.dy;
    if (dx || dy) {
      const l = dist(dx, dy) || 1;
      const sp = p.plane ? 12 : p.car ? 9.2 : p.sub ? 8.2 : p.mounted ? 8.2 : p.boat ? 7.2 : 6.0;
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
      } else if (p.sub) {                            // U-Boot: nur im Meer, schnell
        nx = Math.max(20, Math.min(WORLD_W-20, nx));
        ny = Math.max(16, Math.min(SEA_BOT-6, ny));
        p.x = nx; p.y = ny; p.sub.x = nx; p.sub.y = ny; if (dx) p.sub.dir = p.dir;
      } else if (p.car) {
        if (p.car.driver === p) {                    // nur der Fahrer lenkt
          if (onRoad(nx, p.y)) p.x = nx;
          if (onRoad(p.x, ny)) p.y = ny;
          p.car.x = p.x; p.car.y = p.y; if (dx) p.car.dir = p.dir;
        }
      } else {
        if (!blockedFoot(nx, p.y)) p.x = nx;
        if (!blockedFoot(p.x, ny)) p.y = ny;
      }
    }
    if (p.car && p.car.driver !== p) { p.x = p.car.x; p.y = p.car.y; }   // Beifahrer folgt
    if (!p.boat && !p.car && !p.plane && !p.sub && isWater(p.x, p.y)) { const s = landNear(p.x, p.y); p.x = s.x; p.y = s.y; }
    if (p.horse && !p.mounted && isWater(p.horse.x, p.horse.y)) { const s = landNear(p.horse.x, p.horse.y); p.horse.x = s.x; p.horse.y = s.y; }
    if (edge) doAction(p);
    if (p.shootCd > 0) p.shootCd--;     // Feuerraten-Limit
    // gehaltener Aktionsknopf feuert weiter (nur Fahrzeug/Knarre, ohne andere Aktion auszulösen)
    if (p.in.act && !edge && p.down <= 0 && (vehInfo(p) || p.gun)) tryShoot(p);
  }

  // Fahrzeug-Trefferschutz herunterzählen (verhindert Sofort-Tod durch Dauerbiss)
  for (const arr of [world.boats, world.cars, world.planes, world.subs])
    for (const v of arr) { if (v.ic > 0) v.ic--; if (v.dmg > 0) v.dmg--; }
  if (world.kingDown > 0) world.kingDown--;

  // (Freie Boote bleiben einfach stehen — kein Nachschwimmen mehr, das
  //  driftete unkontrolliert. Beim Aussteigen wird das Boot direkt
  //  neben den Spieler ans Wasser gesetzt, siehe doAction.)

  // Monster
  for (const a of world.monsters) {
    a.wob += .15;
    let mx;
    if (a.flee > 0) {
      a.flee--; a.mad = 0;
      let np = null, nd = 1e9;
      for (const p of PLR) {
        const d = dist(p.x-a.x, p.y-a.y); if (d < nd) { nd = d; np = p; }
      }
      if (np) { const k = nd||1; a.vx = (a.x-np.x)/k*2.4; a.vy = (a.y-np.y)/k*2.4; }
      mx = 2.4;
    } else {
      let tgt = null, td = 1e9;
      for (const p of PLR) {
        if (p.inv > 0 || p.down > 0) continue;
        if (inHQ(p.x, p.y)) continue;                 // Headquarter ist sicher
        if (a.sea) {                                  // Oktopus: Spieler im/am Wasser (auch Boot/U-Boot)
          if (!(p.boat || p.sub || p.y < SEA_BOT + 50)) continue;
        } else {                                      // Landmonster: Autos & Pferd-Reiter angreifbar; Flatterer kommen auch ans Flugzeug ran
          if (p.plane && a.type !== "flatterer") continue;
        }
        const d = dist(p.x-a.x, p.y-a.y); if (d < td) { td = d; tgt = p; }
      }
      // aggressiv: große Reichweite, halten hartnäckig drauf
      const RNG = { flatterer:360, brocken:420, oktopus:300, kannibale:340, koenig:420 };
      const ACC = { flatterer:.34, brocken:.26, oktopus:.24, kannibale:.30, koenig:.18 };
      const MX  = { flatterer:4.4, brocken:3.2, oktopus:3.6, kannibale:3.9, koenig:2.4 };
      const range = RNG[a.type] || 320;
      if (tgt && td < range) {
        a.mad = Math.min(1, a.mad + .05);
        const acc = ACC[a.type] || .28;
        a.vx += (tgt.x-a.x)/td*acc; a.vy += (tgt.y-a.y)/td*acc;
        if (td < 26*a.r) {
          const tv = tgt.boat ? { v:tgt.boat, k:"boat", arr:world.boats }
                   : tgt.car  ? { v:tgt.car,  k:"car",  arr:world.cars }
                   : tgt.sub  ? { v:tgt.sub,  k:"sub",  arr:world.subs }
                   : tgt.plane? { v:tgt.plane,k:"plane",arr:world.planes } : null;
          if (tv) {                                   // Fahrzeug nimmt Schaden
            if (tv.v.ic <= 0) {
              tv.v.hp--; tv.v.ic = 22; tv.v.dmg = 10;
              if (a.sea) { tv.v.x += (a.x-tv.v.x)*0.05; tv.v.y += (a.y-tv.v.y)*0.03; } // Oktopus zieht
              if (tv.v.hp <= 0) destroyVehicle(tv.v, tv.k, tv.arr);
            }
            a.flee = 14;
          } else {                                    // Spieler zu Fuß
            tgt.hearts--; tgt.inv = 120;
            const kb = (a.type === "brocken" || a.type === "koenig") ? 40 : 22;
            const k = dist(tgt.x-a.x, tgt.y-a.y)||1;
            tgt.x = Math.max(16, Math.min(WORLD_W-16, tgt.x+(tgt.x-a.x)/k*kb));
            tgt.y = Math.max(SEA_BOT+8, Math.min(WORLD_H-12, tgt.y+(tgt.y-a.y)/k*kb));
            if (tgt.hearts <= 0) goDown(tgt);   // aus Pferd/Fahrzeug werfen, 30s bis Auto-Revive
            a.flee = (a.type === "brocken" || a.type === "koenig") ? 8 : 20;
          }
        }
        mx = MX[a.type] || 2.6;
      } else {
        a.mad = Math.max(0, a.mad - .02);
        if (Math.random() < .02) { a.vx = rnd(-.6,.6); a.vy = rnd(-.6,.6); }
        // Land-Monster: weit weg ziehen sie spuerbar Richtung HQ (mit y-Streuung
        // damit nicht alle in einer Linie laufen). Sobald die Burg in Sicht ist
        // (~700 px), schalten sie auf STURM: deutlich schneller, harter Pull.
        let charge = false;
        if (!a.sea && !a.island) {
          const hk = dist(a.x-HQ.x, a.y-HQ.y) || 1;
          charge = hk < 700;
          const pullX = charge ? 0.14 : 0.05;
          const pullY = charge ? 0.10 : 0.01;     // y-Pull weit draussen schwach (Streuung)
          a.vx += (HQ.x-a.x)/hk * pullX;
          a.vy += (HQ.y-a.y)/hk * pullY;
          if (!charge && Math.random() < .04) a.vy += rnd(-.5, .5);   // gelegentlich seitlich wandern
        }
        mx = charge ? 2.0 : 1.0;                  // rennen wenn Burg sichtbar, schlendern weit draussen
      }
    }
    const sp = dist(a.vx, a.vy);
    if (sp > mx) { a.vx = a.vx/sp*mx; a.vy = a.vy/sp*mx; }
    let nx = a.x+a.vx, ny = a.y+a.vy;
    if (a.island) {                                   // König & Kannibalen verteidigen die Insel
      const ix0 = BIGISLAND.x+16, ix1 = BIGISLAND.x+BIGISLAND.w-16;
      const iy0 = BIGISLAND.y+16, iy1 = BIGISLAND.y+BIGISLAND.h-16;
      if (nx < ix0) { nx = ix0; a.vx = Math.abs(a.vx); }
      if (nx > ix1) { nx = ix1; a.vx = -Math.abs(a.vx); }
      if (ny < iy0) { ny = iy0; a.vy = Math.abs(a.vy); }
      if (ny > iy1) { ny = iy1; a.vy = -Math.abs(a.vy); }
      a.x = nx; a.y = ny;
    } else {
      if (a.sea) {                                    // Oktopus bleibt im Wasser
        if (ny < 20) { ny = 20; a.vy *= -1; }
        if (ny > SEA_BOT-12) { ny = SEA_BOT-12; a.vy *= -1; }
      } else {
        if (ny < SAND_BOT+12) { ny = SAND_BOT+12; a.vy *= -1; }
        if (ny > WORLD_H-14) { ny = WORLD_H-14; a.vy *= -1; }
      }
      if (nx < 14 || nx > WORLD_W-14) a.vx *= -1;
      a.x = Math.max(14, Math.min(WORLD_W-14, nx)); a.y = ny;
    }
    if (a.pop > 0) a.pop--;
    // König wehrt sich: wirft regelmäßig Speere (trifft Spieler UND Fahrzeuge)
    // Koenig + Kannibalen werfen Speere; Kannibalen mit kuerzerer Reichweite & langsamer
    if (a.type === "koenig" || a.type === "kannibale") {
      const isKing = a.type === "koenig";
      const range  = isKing ? 640 : 380;
      const speed  = isKing ? 7   : 6;
      a.spearCd = (a.spearCd || 0) - 1;
      if (a.spearCd <= 0) {
        let st = null, sd = 1e9;
        for (const p of PLR) {
          if (p.down > 0 || inHQ(p.x, p.y)) continue;
          const d = dist(p.x-a.x, p.y-a.y); if (d < sd) { sd = d; st = p; }
        }
        if (st && sd < range) {
          const k = sd || 1;
          world.spears.push({ x: a.x, y: a.y-20, vx: (st.x-a.x)/k*speed, vy: (st.y-a.y)/k*speed, life: 95 });
          a.spearCd = isKing ? 40 : 75;       // Kannibalen werfen seltener
        } else a.spearCd = isKing ? 18 : 35;
      }
    }
  }

  // HQ-Schaden + Game-Over-Timer: bei HP=0 ist die Runde verloren — Auto-Restart nach 10s.
  world.hq.dmgCd = Math.max(0, world.hq.dmgCd - 1);
  world.hq.hitFx = Math.max(0, world.hq.hitFx - 1);
  if (world.hq.hp <= 0) {
    world.hq.deadTimer++;
    if (world.hq.deadTimer >= 200) { resetWorld(); return; }   // 10s @ 20Hz -> neue Runde
  } else if (world.hq.dmgCd <= 0) {
    for (const a of world.monsters) {
      if (a.sea || a.island) continue;
      if (inHQ(a.x, a.y)) {
        world.hq.hp = Math.max(0, world.hq.hp - 1);
        world.hq.hitFx = 8;
        world.hq.dmgCd = 16;                       // max 1 HP / ~0.8s, auch bei mehreren drinnen
        break;
      }
    }
  }
  // Verteidigungs-Tuerme: zielen auf naechstes Land-Monster in Reichweite und feuern Bolts.
  for (const tw of world.towers) {
    tw.cd = Math.max(0, tw.cd - 1);
    if (tw.cd > 0) continue;
    let tgt = null, td = 1e9;
    for (const a of world.monsters) {
      if (a.sea || a.island) continue;            // Tuerme nur gegen Land-Monster
      const d = dist(a.x-tw.x, a.y-tw.y);
      if (d < td) { td = d; tgt = a; }
    }
    if (tgt && td < 300) {
      const k = td || 1;
      world.bolts.push({ x: tw.x, y: tw.y-8, vx: (tgt.x-tw.x)/k*9, vy: (tgt.y-tw.y)/k*9, life: 60, dmg: 1 + (world.hq.towerLvl||0), tower: true });
      tw.cd = 30;                                 // ~1.5s pro Schuss
    }
  }

  // Boss-Speere — Schaden an Spielern UND Fahrzeugen
  for (let i = world.spears.length-1; i >= 0; i--) {
    const s = world.spears[i]; s.x += s.vx; s.y += s.vy; s.life--;
    let hit = false;
    for (const p of Object.values(world.players)) {
      if (p.down > 0 || p.inv > 0 || inHQ(p.x, p.y)) continue;
      if (dist(p.x-s.x, p.y-s.y) < 20) {
        const tv = p.boat ? { v:p.boat, k:"boat", arr:world.boats }
                 : p.car  ? { v:p.car,  k:"car",  arr:world.cars }
                 : p.sub  ? { v:p.sub,  k:"sub",  arr:world.subs }
                 : p.plane? { v:p.plane,k:"plane",arr:world.planes } : null;
        if (tv) { if (tv.v.ic <= 0) { tv.v.hp--; tv.v.ic = 22; tv.v.dmg = 10;
            if (tv.v.hp <= 0) destroyVehicle(tv.v, tv.k, tv.arr); } }
        else { p.hearts--; p.inv = 110; if (p.hearts <= 0) goDown(p); }
        hit = true; break;
      }
    }
    if (hit || s.life <= 0 || s.x<0||s.x>WORLD_W||s.y<0||s.y>WORLD_H) world.spears.splice(i, 1);
  }

  // Schatz-Fund-Effekt herunterzählen
  for (const t of world.treasures) if (t.fx > 0) t.fx--;

  // Schüsse
  for (let i = world.bolts.length-1; i >= 0; i--) {
    const b = world.bolts[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    let hit = false;
    for (let j = world.monsters.length-1; j >= 0; j--) {
      const a = world.monsters[j];
      if (dist(a.x-b.x, a.y-b.y) < 18*a.r) {
        a.hp -= (b.dmg || 1); a.pop = 12; hit = true;
        const k = dist(a.x-b.x, a.y-b.y)||1;
        // wird angeschossen, kommt aber gleich wieder (aggressiv)
        a.flee = 0;                                  // beim Beschuss NICHT fliehen, weiter jagen
        a.vx = (a.x-b.x)/k*2.0; a.vy = (a.y-b.y)/k*2.0;
        if (a.hp <= 0) {
          const at = a.type;
          if (at === "koenig") {                      // Boss besiegt: Insel erobert! Neuer Boss kommt
            world.kingDown = 600;
            for (const pp of Object.values(world.players)) pp.coins += 25;
            world.monsters.splice(j, 1);
            setTimeout(() => spawnMonster("koenig", BIGISLAND.x + BIGISLAND.w/2, BIGISLAND.y + BIGISLAND.h/2), 3000);
          } else if (a.sea) {                         // Oktopus -> Münzen (im Meer)
            let np = null, nd = 1e9;
            for (const pp of Object.values(world.players)) {
              const dd = dist(pp.x-a.x, pp.y-a.y); if (dd < nd) { nd = dd; np = pp; }
            }
            if (np) np.coins += 4;
            world.monsters.splice(j, 1);
            setTimeout(() => spawnMonster("oktopus"), 5000);
          } else {                                    // Landmonster -> Schippe + meist Muenze droppen
            world.pickups.push({ x: a.x + rnd(-14, 14), y: a.y + rnd(-14, 14), life: 1800, kind: "s" });
            if (Math.random() < 0.7) world.pickups.push({ x: a.x + rnd(-14, 14), y: a.y + rnd(-14, 14), life: 1800, kind: "c" });
            world.monsters.splice(j, 1);
            // Kannibalen kommen immer wieder (Insel bleibt umkämpft)
            setTimeout(() => spawnMonster(
              at === "kannibale" ? "kannibale" : undefined,
              at === "kannibale" ? BIGISLAND.x + rnd(40, BIGISLAND.w-40) : undefined,
              at === "kannibale" ? BIGISLAND.y + rnd(40, BIGISLAND.h-30) : undefined), 4000);
          }
        }
        break;
      }
    }
    if (hit || b.life <= 0 || b.x<0||b.x>WORLD_W||b.y<0||b.y>WORLD_H)
      world.bolts.splice(i, 1);
  }

  for (const bu of world.bushes) if (!bu.ripe && --bu.regrow <= 0) bu.ripe = true;

  // Pickup-Aufsammeln (Schippen + Muenzen je nach Sorte)
  for (let i = world.pickups.length-1; i >= 0; i--) {
    const pk = world.pickups[i];
    if (--pk.life <= 0) { world.pickups.splice(i, 1); continue; }
    for (const p of Object.values(world.players)) {
      if (p.down > 0 || p.boat) continue;
      if (dist(p.x-pk.x, p.y-pk.y) < 26) {
        if (pk.kind === "c") p.coins += 2;
        else                 p.shovels += 2;
        world.pickups.splice(i, 1);
        break;
      }
    }
  }

  // Monsterwellen — kommen regelmäßig, werden pro Level stärker
  // Sicherheitsnetz: ab Level 3 muss immer mindestens ein Koenig auf der Insel sein
  // (Janik wartet sonst rum). Springt nicht waehrend der "Erobert!"-Phase ein.
  if (world.level >= 3 && world.kingDown <= 0) {
    let hasKing = false;
    for (const a of world.monsters) if (a.type === "koenig") { hasKing = true; break; }
    if (!hasKing) spawnMonster("koenig", BIGISLAND.x + BIGISLAND.w/2, BIGISLAND.y + BIGISLAND.h/2);
  }
  if (world.wave > 0) world.wave--;
  if (Object.keys(world.players).length > 0 && --world.waveCd <= 0) {
    const n = 2 + world.level + Math.floor(Math.random()*2);
    for (let i = 0; i < n; i++) spawnMonster();
    world.wave = 90;                                 // "Welle!"-Banner ~4.5s
    world.waveCd = Math.max(360, 800 - world.level*90);
  }

  // Eiswagen faehrt die Strasse entlang
  const tr = world.truck;
  tr.x += tr.dir * 1.6;
  if (tr.x > WORLD_W-40) tr.dir = -1;
  if (tr.x < 40) tr.dir = 1;
}

function broadcast() {
  let anyClient = false;
  for (const c of clients) if (c.alive) { anyClient = true; break; }
  if (!anyClient) return;                       // niemand verbunden -> kein Snapshot bauen/serialisieren
  const pls = Object.values(world.players);
  const snap = {
    t: "s",
    players: pls.map(p => ({
      id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y),
      d: p.dir, c: p.color, h: p.hearts, co: p.coins, sh: p.shovels,
      sl: p.shovelLvl, gn: p.gun, plv: p.planeLvl, bo: !!p.boat, ca: !!p.car, pn: !!p.plane, su: !!p.sub,
      mo: p.mounted,
      ho: p.horse ? { x: Math.round(p.horse.x), y: Math.round(p.horse.y), d: p.horse.dir } : null,
      dn: p.down, iv: p.inv > 0, fx: p.fx || null,   // dn = verbleibende Ticks (Client zeigt 60s-Countdown)
    })),
    won: world.won, goal: WIN_GOAL, level: world.level, kingDown: world.kingDown > 0,
    admin: world.adminId, wave: world.wave > 0,
    pl: world.planes.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), d: p.dir, dr: !!p.driver, di: p.driver?p.driver.id:null, dC: p.driver?p.driver.color:null, hp: p.hp, mh: p.maxhp, dm: p.dmg })),
    su: world.subs.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), d: s.dir, dr: !!s.driver, di: s.driver?s.driver.id:null, dC: s.driver?s.driver.color:null, hp: s.hp, mh: s.maxhp, dm: s.dmg })),
    tr: world.treasures.map(t => ({ x: t.x, y: t.y, f: t.found, cv: !!t.cave, fx: t.fx || 0 })),
    bo: world.boats.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), dr: !!b.driver, di: b.driver?b.driver.id:null, dC: b.driver?b.driver.color:null, hp: b.hp, mh: b.maxhp, dm: b.dmg })),
    ca: world.cars.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), d: c.dir, dr: !!c.driver, di: c.driver?c.driver.id:null, dC: c.driver?c.driver.color:null, pi: c.passenger?c.passenger.id:null, pC: c.passenger?c.passenger.color:null, hp: c.hp, mh: c.maxhp, dm: c.dmg, ml: c.mdl||0 })),
    mo: world.monsters.map(a => ({ x: Math.round(a.x), y: Math.round(a.y), tp: a.type, hp: a.hp, mh: a.maxhp, md: a.mad, po: a.pop })),
    sr: world.spears.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })),
    bl: world.bolts.map(b => ({ x: Math.round(b.x), y: Math.round(b.y) })),
    bu: world.bushes.map(b => ({ x: b.x, y: b.y, r: b.ripe })),
    pk: world.pickups.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), k: p.kind || "s" })),
    tk: { x: Math.round(world.truck.x), y: world.truck.y },
    hq: { hp: world.hq.hp, mh: world.hq.maxhp, fx: world.hq.hitFx, dT: world.hq.deadTimer || 0, tLv: world.hq.towerLvl || 0, hLv: world.hq.hpLvl || 0 },
    tw: world.towers.map(t => ({ x: t.x, y: t.y, cd: t.cd })),
  };
  for (const p of pls) p.fx = null;   // Effekt ist Einmal-Puls
  const msg = encodeFrame(JSON.stringify(snap));
  for (const c of clients) if (c.alive) { try { c.socket.write(msg); } catch (_) { closeClient(c); } }
}

// Boote & Autos einmalig platzieren (mit Leben + Heimat-Basis für Respawn)
for (let i = 0; i < 4; i++) {
  const bx = 620 + i*150, by = SEA_BOT-55;
  world.boats.push({ x: bx, y: by, driver: null, hp: 6, maxhp: 6, ic: 0, dmg: 0, base: { x: bx, y: by } });
}
for (let i = 0; i < 4; i++) {
  const cx = PARK.x + 22 + i*36, cy = PARK.y + 40;
  world.cars.push({ x: cx, y: cy, dir: 1, driver: null, passenger: null, hp: 8, maxhp: 8, ic: 0, dmg: 0, mdl: i, base: { x: cx, y: cy } });
}

const BROADCAST_MS = 50;               // 20 Hz Netz-Snapshots = Sim-Takt: glatte Monster/Schuss-
                                       // Bewegung. (CPU unkritisch: voller Kern, ~1-2% Last.)
setInterval(tick, 50);                 // Physik: 20 Hz
setInterval(broadcast, BROADCAST_MS);  // Netz entkoppelt vom Sim-Tick -> kein Burst pro Tick

// inaktive Spieler (~4 Min ohne Bewegung/Aktion) entfernen
setInterval(() => {
  const now = Date.now();
  for (const c of clients) {
    const pl = c.player && world.players[c.player];
    if (pl && now - pl.lastActive > 240000) closeClient(c);
  }
}, 30000);

server.listen(PORT, HOST, () =>
  console.log("Piraten-Suche listening on " + HOST + ":" + PORT));
