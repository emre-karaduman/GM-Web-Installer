# GM-Web-Installer

Eine Webapp, um einen PaperMC-Minecraft-Server auf einem Debian 12 KVM Host per SSH zu installieren und zu steuern.

## Voraussetzungen

- Node.js 18+
- Zugriff auf einen Debian 12 Server per SSH (Root oder sudo)
- Ausgehender Zugriff auf den PaperMC-Download

## Starten

```bash
npm install
npm start
```

Die App läuft anschließend unter `http://localhost:3000`.

## Hinweise

- Die Installationsschritte sind in `server.js` definiert und können angepasst werden.
- Start/Stop nutzt einen Systemd-Service namens `minecraft.service`.
- Die Live-Konsole nutzt eine SSH-Shell-Verbindung per WebSocket.
- Das Startskript kann über die Weboberfläche geladen und gespeichert werden.
- Für RCON muss in `server.properties` `enable-rcon=true` und `rcon.password` gesetzt werden.
- Die `server.properties` lassen sich über die Weboberfläche laden und speichern.
