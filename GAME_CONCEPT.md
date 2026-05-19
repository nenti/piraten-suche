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
- **Kein hartes Verlieren:** Herzen runter/rauf (Beeren/Eiswagen). Wer „unten"
  ist, wird von einem Mitspieler wiederbelebt; sonst Auto-Revive erst nach
  ~30 s. Tod im Fahrzeug → Respawn am **Headquarter** (sichere Zone, wächst
  pro Level).
- **Geist** als Tamagotchi: schwebt langsam hinterher und gibt Tipps.

## Steuerung (smart)

Eine Aktionstaste wählt automatisch die sinnvollste Aktion: Wiederbeleben →
Eis → Beere → **Graben (nur direkt über einem Schatz)** → **Schießen**
(im Fahrzeug / mit Knarre, gehalten = Dauerfeuer) → Einsteigen → Pferd →
Schaufel werfen / verscheuchen. **Aussteigen = eigener Knopf** (Handy
„🚪 Aussteigen", PC Taste **E**). Auto = 2 Sitze (Fahrer lenkt, beide
schießen). Pfeiltasten/WASD laufen; Handy Joystick + Knöpfe.

## Fahrzeuge

Boot ⛵, Auto 🚗 (Straße, 2 Plätze, Baureihen Sportwagen/Pickup/Trabi/Van),
Flugzeug ✈️ (Level 2, upgradebar im Shop), U-Boot ⚓ (Level 3, Meer),
Pferd 🐴 (Ranch). **Alle Fahrzeuge haben Leben, sind angreifbar und werden
zerstört → Respawn an ihrer Basis.** Insassen sind in Spielerfarbe sichtbar.
Verteidigung ist **manuell** (Aktionstaste schießt).

## Monster

Cartoon-gruselig, aggressiv, aber nicht angsteinflößend. Arten: Schleicher,
Flatterer, großer **Brocken**; Level 3+: **Oktopus** (Meer, zieht Boote/
U-Boote runter), **Kannibale** + **König-Boss** (wirft Speere auf Spieler
**und** Fahrzeuge, verteidigt die Insel, respawnt). Monster kommen in
**Wellen**, pro Level stärker.

## Levels

1. Schatzsuche-Grundspiel.
2. **Flugplatz** + Flugzeuge, Ranch, mehr Monster.
3. **U-Boot-Hafen**, Oktopusse, **Königsinsel** mit Kannibalen + König-Boss
   (besiegen = Insel erobert → 🏳️‍🌈 Regenbogen-Fahne + Münzen).
4. **Crazier:** zwei Könige, mehr Oktopusse/Kannibalen, schnellere Wellen.
   Danach endlos. Der Admin (erster Spieler) kann jederzeit neu starten.

## Technik

HTML5-Canvas-Client + dependency-freier Node-Server (autoritativ, WebSocket).
Couch-Koop **und** Netzwerk. Minimap zeigt Orte & Spieler.

## Hinweis zur Entwicklung

Das ursprüngliche Konzept war bewusst „nichts Gruseliges, ganz freundlich".
Im gemeinsamen Spielen wollten die Kinder es spannender (Tiere, Schießen,
Levels) — umgesetzt **cartoonhaft & ohne hartes Sterben**, damit es für alle
inkl. der Kleinen passt. Weitere/zurückgestellte Ideen: siehe ROADMAP.md.
