# Roadmap — Piraten-Suche

Gesammelte Ideen aus den Test-Sessions mit Yannick/Janik, Micky & Papa.
Erledigtes ist abgehakt; offenes ist nach grobem Aufwand sortiert.

## Erledigt ✅

- Browser-Spiel, Couch-Koop → **echtes Online-Multiplayer** (autoritativer
  Server, WebSocket, Handy-Touch-Steuerung, Mitspieler-Namen + Rand-Marker)
- Sanft-gruselige Höhle, freundlicher Geist (trottet hinterher, gibt Tipps)
- Boot (kommt zu dir, Aussteigen an Land daneben), Inseln betretbar
- Auto + Straße + Parkplatz; Auto/Knarre **auto-schießen**, aussteigen überall
- Monster: 3 Arten, Trefferpunkte, Respawn, aggressiv; **kein hartes Sterben**
  (Herzen runter/rauf, Wiederbeleben durch Mitspieler)
- Münzen, Shop (Schippe **oder** Knarre), Eiswagen (Heilung), Beerenbüsche
- Begrenzte Schippen + Drops von Monstern; Ranch: Schippen → Pferd / Münzen
- Zufällige Schatzpositionen; „mehr Schätze als zum Sieg nötig"
- **Level 1 → 2 → 3 → 4** mit Flugplatz/Flugzeugen, U-Booten, Oktopussen,
  Königsinsel + Kannibalen + König-Boss (Level 4: zwei Könige)
- Performance: Client-Interpolation, sofortiges Input-Senden, schnelleres Tempo
- **Großer Umbau (Phasen 1–5):**
  - Smarte Aktionstaste (Graben nur über Schatz), **manuelles Schießen**
    (Auto-Schuss raus, gehalten = Dauerfeuer), eigener **Aussteigen-Knopf** (E)
  - **2-Sitzer-Auto** (Fahrer + Schütze), **Insassen sichtbar** in Spielerfarbe
  - **Fahrzeuge haben Leben & sind angreifbar** (HP-Balken, Zerstörung +
    Respawn an Basis), **Oktopus zieht Boote/U-Boote**, **Boss wirft Speere**
    auf Spieler & Fahrzeuge, **Boss respawnt** (Insel bleibt umkämpft)
  - **Kein Auto-Revive** (Teammate hilft, sonst 30s), **Headquarter/Spawn-
    Basis** (sichere Zone, wächst pro Level), Tod im Fahrzeug → Respawn HQ
  - **Monster-Wellen** (werden pro Level stärker), **Admin-Restart**,
    **Schaufel werfen** (Erst-Verteidigung), **Flugzeug-Upgrades** im Shop
  - Juice: **Schatz-Fund-Animation** (Kanonen), **Eis-Animation**,
    **Auto-Baureihen** (Sportwagen/Pickup/Trabi/Van), **Minimap**,
    **Regenbogen-Fahne** beim Insel-Erobern

## Offen — klein/mittel

- **Lasso / Vieh einfangen** am Ranch-Thema (Cowboy-Platz, Pferd-Tricks)
- Schatz physisch zum Fahrzeug/Stützpunkt bringen (statt nur Zähler)
- Sound/Musik, mehr Tipp-Variation des Geistes
- Balancing nach echten Mehrspieler-Sessions (Monster-Dichte je Spielerzahl)

## Offen — groß

- **Internet-Deploy auf nyxory** (echte URL, von überall spielbar) —
  MCP-Proxy muss am dev-Kontext hängen; Code ist deploybar (Dockerfile da)
- **Map wächst dynamisch ~2× Richtung Meer pro Level** (echte WORLD-Resize,
  Kamera-Bounds, Static-Zonen) — bewusst zurückgestellt (Risiko); aktuell
  stattdessen: Welt fix groß, HQ/Schwierigkeit wachsen pro Level, Level 4 =
  zwei Könige. Königsinsel mit Bergen/Wasserfällen; **nur zu mehreren
  erobern**; Einwohner kommen nach Zeit zurück (pro-Insel-Capture-System)
- **Zwei verbundene große Welten** übers Meer; Welt weiter Richtung Meer öffnen
- Weitere Levels / „immer crazier"; Boss-Varianten
- Fortschritt/Speichern, Skins, eigene Namen dauerhaft

## Bewusst zurückgestellt (Papa: „soll ein Kinderspiel sein")

- Raketen / Raketenwerfer / Mario-Kart-Item-Boxen
- Berge & Lawinen, Heißluftballon, Rakete als Fortbewegung
