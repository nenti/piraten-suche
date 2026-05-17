# Piraten-Suche 🏴‍☠️ — Spielkonzept

Ein Spiel von Yannick/Janik, Micky & Papa. Das Konzept ist beim gemeinsamen
Spielen gewachsen — von „freundliche Schatzsuche" zu einem Online-Koop-Spiel
mit Levels. Diese Datei beschreibt den **aktuellen Stand**.

## Worum geht es?

Man läuft in einer Welt **am Meer** herum (2D von oben) und **sucht versteckte
Goldschätze** — allein, zu zweit an einem Gerät, oder online zusammen
(Browser/Handy, alle im selben Spiel).

## Kern

- Schätze liegen an **zufälligen Orten**; man braucht **6 von ~8** zum Sieg.
- **Graben kostet Schippen** (begrenzt). Schippen kommen aus Monster-Drops
  oder dem Shop; Überschuss tauscht man an der Ranch in Münzen/ein Pferd.
- **Münzen** aus Schätzen/Oktopussen → Shop (Schippe/Knarre), Eiswagen (Heilung).
- **Kein hartes Verlieren:** Herzen gehen runter und wieder rauf
  (Beeren/Eiswagen). Wer „unten" ist, wird von einem Mitspieler wiederbelebt.
- **Geist** als Tamagotchi: schwebt langsam hinterher und gibt Tipps.

## Fahrzeuge

Boot ⛵ (Meer, kommt zu dir), Auto 🚗 (Straße, auto-schießt),
Flugzeug ✈️ (Level 2, fliegt überall), U-Boot ⚓ (Level 3, Meer),
Pferd 🐴 (Ranch, Spielerfarbe). Ein-/Aussteigen mit der Aktionstaste, überall.

## Monster

Cartoon-gruselig, aggressiv, aber nicht angsteinflößend (für kleine
Zuschauer ok). Arten: Schleicher, Flatterer, großer **Brocken**;
Level 3: **Oktopus** (Meer), **Kannibale** + **König-Boss** (Königsinsel).
Auto/Knarre/U-Boot verteidigen automatisch.

## Levels

1. Schatzsuche-Grundspiel.
2. **Flugplatz** + Flugzeuge, mehr/aggressivere Monster, Ranch.
3. **U-Boot-Hafen**, Oktopusse, **Königsinsel** mit Kannibalen + König-Boss
   (besiegen = Insel erobert, Münz-Belohnung). Danach endlos.

## Technik

HTML5-Canvas-Client + dependency-freier Node-Server (autoritativ, WebSocket).
Couch-Koop **und** Netzwerk. Steuerung: Pfeiltasten/WASD + Leertaste/Enter,
auf dem Handy Joystick + Aktionsknopf.

## Hinweis zur Entwicklung

Das ursprüngliche Konzept war bewusst „nichts Gruseliges, ganz freundlich".
Im gemeinsamen Spielen wollten die Kinder es spannender (Tiere, Schießen,
Levels) — umgesetzt **cartoonhaft & ohne hartes Sterben**, damit es für alle
inkl. der Kleinen passt. Weitere/zurückgestellte Ideen: siehe ROADMAP.md.
