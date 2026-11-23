# Canasta Online

Canasta für 2 bis 4 Spieler im Browser. Ein kleiner Node.js-Server hält die Spiele und schickt jedem Spieler nur seine eigenen Karten.

## Kostenlos ins Internet bringen (Render.com)

Du brauchst zwei kostenlose Konten: **GitHub** (speichert den Code) und **Render** (führt den Server aus). Eine Kreditkarte ist nicht nötig.

### 1. Code auf GitHub hochladen
1. Konto anlegen auf https://github.com und anmelden.
2. Oben rechts auf **+** → **New repository**.
3. Name z. B. `canasta`, **Public** auswählen, auf **Create repository** klicken.
4. Auf der neuen Seite auf den Link **„uploading an existing file“** klicken.
5. Den **Inhalt** des entpackten Ordners hineinziehen: `server.js`, `package.json`, `README.md`, `.gitignore` und den Ordner `public` (mit `index.html` und `logic.js`).
   Wichtig: die Dateien selbst hochladen, nicht den übergeordneten Ordner.
6. Unten auf **Commit changes** klicken.

### 2. Bei Render starten
1. Auf https://render.com mit **„Sign in with GitHub“** anmelden.
2. **New +** → **Web Service** auswählen.
3. Das Repository `canasta` auswählen (eventuell Render erst den Zugriff auf GitHub erlauben).
4. Einstellungen:
   - **Language/Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
5. Auf **Deploy Web Service** klicken. Nach 1–3 Minuten steht oben eine Adresse wie
   `https://canasta-xxxx.onrender.com`. Das ist eure Spielseite – einfach an die Mitspieler schicken.

### Gut zu wissen beim Gratis-Tarif
- Wenn 15 Minuten niemand die Seite offen hat, legt Render den Server schlafen. Der nächste Aufruf dauert dann etwa **eine Minute**, bis die Seite erscheint. Danach läuft alles normal.
- Solange jemand die Seite geöffnet hat, bleibt der Server wach.
- Beim Einschlafen gehen **laufende Spiele verloren**. Spielt eine Partie also am Stück. Eine Partie bis 5000 Punkte dauert meist ein bis zwei Stunden.
- Änderungen am Code: Datei auf GitHub ersetzen → Render baut automatisch neu.

## Lokal oder auf einem Raspberry Pi
Node.js 18 oder neuer installieren, dann im Ordner:
```
npm install
npm start
```
Die Seite läuft auf `http://localhost:3000` (im Heimnetz: `http://<IP-des-Rechners>:3000`).
Hier bleiben die Spiele auch nach einem Neustart erhalten (Datei `games.json`).
