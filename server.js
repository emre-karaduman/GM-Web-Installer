const express = require("express");
const http = require("http");
const path = require("path");
const { Client } = require("ssh2");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const installSteps = [
  {
    label: "System aktualisieren",
    command: "apt-get update -y && apt-get upgrade -y",
  },
  {
    label: "Java und Tools installieren",
    command: "apt-get install -y curl wget screen openjdk-17-jre-headless",
  },
  {
    label: "Minecraft Benutzer anlegen",
    command: "id -u minecraft >/dev/null 2>&1 || useradd -m -s /bin/bash minecraft",
  },
  {
    label: "Minecraft Ordner vorbereiten",
    command: "mkdir -p /opt/minecraft && chown minecraft:minecraft /opt/minecraft",
  },
  {
    label: "PaperMC herunterladen",
    command:
      "wget -O /opt/minecraft/paper.jar https://fill-data.papermc.io/v1/objects/4a558a00005d33dafa4c4d5f9e47b3bd47d92311fceccd9c9754ee6b913f8649/paper-1.21.11-100.jar",
  },
  {
    label: "EULA akzeptieren",
    command: "echo 'eula=true' > /opt/minecraft/eula.txt",
  },
  {
    label: "Startskript erstellen",
    command:
      "printf '#!/usr/bin/env bash\\ncd /opt/minecraft\\njava -Xms2G -Xmx2G -jar paper.jar --nogui\\n' > /opt/minecraft/start.sh && chmod +x /opt/minecraft/start.sh",
  },
  {
    label: "Service anlegen",
    command:
      "printf '[Unit]\\nDescription=PaperMC Server\\nAfter=network.target\\n\\n[Service]\\nType=simple\\nUser=minecraft\\nWorkingDirectory=/opt/minecraft\\nExecStart=/opt/minecraft/start.sh\\nRestart=on-failure\\nRestartSec=10\\n\\n[Install]\\nWantedBy=multi-user.target\\n' > /etc/systemd/system/minecraft.service",
  },
  {
    label: "Service aktivieren",
    command: "systemctl daemon-reload && systemctl enable minecraft.service",
  },
];

function runCommand(connection, command) {
  return new Promise((resolve, reject) => {
    connection.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream
        .on("close", (code) => {
          resolve({ code, stdout, stderr });
        })
        .on("data", (data) => {
          stdout += data.toString();
        });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    });
  });
}

async function runSteps(connection, steps) {
  const results = [];
  for (const step of steps) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runCommand(connection, step.command);
    results.push({
      label: step.label,
      command: step.command,
      ...result,
    });
    if (result.code !== 0) {
      break;
    }
  }
  return results;
}

function withConnection({ host, username, password }) {
  return new Promise((resolve, reject) => {
    const connection = new Client();
    connection
      .on("ready", () => resolve(connection))
      .on("error", (error) => reject(error))
      .connect({
        host,
        username,
        password,
      });
  });
}

app.post("/api/install", async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password) {
    res.status(400).json({ message: "Bitte Host, Benutzer und Passwort angeben." });
    return;
  }

  let connection;
  try {
    connection = await withConnection({ host, username, password });
    const results = await runSteps(connection, installSteps);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.post("/api/server/start", async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password) {
    res.status(400).json({ message: "Bitte Host, Benutzer und Passwort angeben." });
    return;
  }
  let connection;
  try {
    connection = await withConnection({ host, username, password });
    const result = await runCommand(connection, "systemctl start minecraft.service");
    res.json({ success: result.code === 0, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.post("/api/server/stop", async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password) {
    res.status(400).json({ message: "Bitte Host, Benutzer und Passwort angeben." });
    return;
  }
  let connection;
  try {
    connection = await withConnection({ host, username, password });
    const result = await runCommand(connection, "systemctl stop minecraft.service");
    res.json({ success: result.code === 0, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.post("/api/server/status", async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password) {
    res.status(400).json({ message: "Bitte Host, Benutzer und Passwort angeben." });
    return;
  }
  let connection;
  try {
    connection = await withConnection({ host, username, password });
    const result = await runCommand(
      connection,
      "systemctl is-active minecraft.service"
    );
    const status = result.stdout.trim() || "unknown";
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.post("/api/start-script", async (req, res) => {
  const { host, username, password } = req.body;
  if (!host || !username || !password) {
    res.status(400).json({ message: "Bitte Host, Benutzer und Passwort angeben." });
    return;
  }
  let connection;
  try {
    connection = await withConnection({ host, username, password });
    const result = await runCommand(connection, "cat /opt/minecraft/start.sh");
    res.json({ success: true, script: result.stdout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.post("/api/start-script/update", async (req, res) => {
  const { host, username, password, script } = req.body;
  if (!host || !username || !password || !script) {
    res.status(400).json({ message: "Bitte Host, Benutzer, Passwort und Skript angeben." });
    return;
  }
  let connection;
  try {
    const encodedScript = Buffer.from(script, "utf8").toString("base64");
    connection = await withConnection({ host, username, password });
    const result = await runCommand(
      connection,
      `echo '${encodedScript}' | base64 -d > /opt/minecraft/start.sh && chmod +x /opt/minecraft/start.sh`
    );
    res.json({ success: result.code === 0, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.get("/api/install-steps", (req, res) => {
  res.json({
    steps: installSteps.map((step) => ({
      label: step.label,
      command: step.command,
    })),
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/console" });

wss.on("connection", (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const host = url.searchParams.get("host");
  const username = url.searchParams.get("username");
  const password = url.searchParams.get("password");

  if (!host || !username || !password) {
    socket.send("Fehlende Verbindungsdaten.\\n");
    socket.close();
    return;
  }

  const connection = new Client();
  let shellStream;

  connection
    .on("ready", () => {
      socket.send("SSH verbunden.\\n");
      connection.shell((error, stream) => {
        if (error) {
          socket.send(`Shell Fehler: ${error.message}\\n`);
          socket.close();
          connection.end();
          return;
        }
        shellStream = stream;
        stream.on("data", (data) => socket.send(data.toString()));
        stream.stderr.on("data", (data) => socket.send(data.toString()));
        stream.on("close", () => socket.close());
      });
    })
    .on("error", (error) => {
      socket.send(`SSH Fehler: ${error.message}\\n`);
      socket.close();
    })
    .connect({ host, username, password });

  socket.on("message", (message) => {
    if (shellStream) {
      shellStream.write(message.toString());
    }
  });

  socket.on("close", () => {
    if (shellStream) {
      shellStream.end();
    }
    connection.end();
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});
