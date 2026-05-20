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
- **Playtest 2026-05-20 (Janik):** kompakter ⛔-Aussteigen-Knopf
  (vorher verdeckte er im Boot die Sicht), Beere/Eis immer auslösbar
  (auch bei vollem Herz), sichtbarer 60-s-Respawn-Countdown, Admin-
  Restart hinter ⚙-Menü, **Schaufel-Werfen entfernt** (verbrauchte
  Janik ungewollt), **Shop akzeptiert Schippen** (Knarre 24🪚 /
  Flugzeug-Upgrade 30🪚 — kein Trade-Hopping mehr nötig); −10
  Monster gesamt, **König immer da** (Respawn 3 s + Safety-Net),
  **Kannibalen werfen jetzt auch Speere** (kürzer/seltener),
  **Flatterer greifen auch Flugzeuge an**. Pferd-Reiter sind wieder
  angreifbar; Einsteigen geht jetzt vor Schießen.

## Offen — klein/mittel

- **Lasso / Vieh einfangen** am Ranch-Thema (Cowboy-Platz, Pferd-Tricks)
- Schatz physisch zum Fahrzeug/Stützpunkt bringen (statt nur Zähler)
- Sound/Musik, mehr Tipp-Variation des Geistes
- Balancing nach echten Mehrspieler-Sessions (Monster-Dichte je Spielerzahl)

## Phase 3 — Basis verteidigen + Welt öffnen (in Arbeit, nächster Brocken)

Aus dem Playtest mit Janik (2026-05-20):
- **HQ wird zur Festung**: HP-Balken, Mauern/Tor, **Auto-Türme**
  zielen & schießen auf Monster im Radius; Monster-Münzen-Drops
  fliegen automatisch zum HQ-Konto, damit Janik weniger Schippen↔
  Münzen-Tradehopping braucht.
- **Monster-Flow**: spawnen **rechts** und laufen **gemächlich
  Richtung HQ** statt random — konstanter Angriff zum Verteidigen.
  HQ-HP geht runter wenn sie reinkommen; Game-Over bei 0
  (Admin-Restart aus dem ⚙-Menü).
- **Karte deutlich weiter Richtung Meer** (Janik: „noch viel viel
  weiter") — echte WORLD-Resize seewärts, Kamera-Bounds nachziehen.
- **Wasserfall-Geheimnisse**:
  - Normaler **Wasserfall**, mit dem Boot durchfahrbar → führt in
    eine **Höhle mit Monstern** (Loot zum Risiko hin).
  - **Regenbogen-Wasserfall** → **nette Monster** dahinter, die dem
    Spieler **Münzen + Schippen** schenken und eine **stärkere
    Pistole** anbieten (Belohnung für die, die's bis weit raus
    schaffen).
- **Schippen-Cluster**: nahe beieinander liegende Pickups visuell zu
  einem Stack zusammenfassen („🪚 ×20") statt 20 einzelne Sprites —
  Endgame-Map sieht sonst chaotisch aus, viele Schippen sammeln sich
  aus zerschossenen Land-Monstern.

## Offen — groß

- **Internet-Deploy auf nyxory** ✅ — live unter
  `piraten-suche-nyx-piraten-suche.nyxory.app`; offen: Custom-Domain.
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
