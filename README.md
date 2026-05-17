# Piraten-Suche 🏴‍☠️

Ein Online-Koop-Schatzsuchspiel am Meer — zusammen am selben Gerät **oder** über
Browser/Handy im selben Spiel. Ein Spiel von Yannick/Janik, Micky & Papa.

## Starten

```
node server.js
```

Dann im Browser öffnen:

- Auf diesem Rechner: `http://localhost:3000`
- Andere im selben WLAN (z. B. Handy): `http://<LAN-IP>:3000`

Kein Build, keine Abhängigkeiten — reines Node (Server) + eine HTML-Datei
(`public/index.html`, autoritativer Server, handgeschriebenes WebSocket).

## Was drin ist

Level-System mit aufsteigendem Schwierigkeitsgrad:

- **Level 1:** Schätze suchen (zufällige Orte, 6 von ~8 zum Sieg), Schippen
  als begrenzte Ressource, Shop (Schippe/Knarre), Boot, Auto, Eiswagen,
  Beerenbüsche, Höhle, Inseln, Tamagotchi-Geist mit Tipps, Wiederbeleben.
- **Level 2:** Flugplatz mit Flugzeugen, mehr & aggressivere Monster
  (inkl. großem „Brocken"), Ranch (Schippen → Pferd in Spielerfarbe / Münzen).
- **Level 3:** U-Boot-Hafen, Oktopusse im Meer, große **Königsinsel** mit
  Kannibalen und einem **König-Boss**, den man besiegen muss.

Details & Designgeschichte: [GAME_CONCEPT.md](./GAME_CONCEPT.md) ·
Nächste Ideen: [ROADMAP.md](./ROADMAP.md)

Status: 🚧 In aktiver Entwicklung, lokal/LAN spielbar. Internet-Deploy auf
nyxory steht noch aus (siehe ROADMAP).
