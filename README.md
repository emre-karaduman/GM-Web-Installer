# GM-Web-Installer

Eine einfache Webapp, um einen Gameserver auf einem Debian 12 KVM Host per SSH zu installieren und zu steuern.

## Voraussetzungen

- Node.js 18+
- Zugriff auf einen Debian 12 Server per SSH (Root oder sudo)

## Starten

```bash
npm install
npm start
```

Die App läuft anschließend unter `http://localhost:3000`.

## Hinweise

- Die Installationsschritte sind in `server.js` definiert und können angepasst werden.
- Start/Stop nutzt einen Systemd-Service namens `gameserver.service`.
