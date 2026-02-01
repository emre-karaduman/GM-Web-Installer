const express = require("express");
const path = require("path");
const { Client } = require("ssh2");

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
    label: "Abhängigkeiten installieren",
    command: "apt-get install -y curl wget screen",
  },
  {
    label: "Gameserver Benutzer anlegen",
    command: "id -u gameserver >/dev/null 2>&1 || useradd -m -s /bin/bash gameserver",
  },
  {
    label: "Installationsordner vorbereiten",
    command: "mkdir -p /opt/gameserver && chown gameserver:gameserver /opt/gameserver",
  },
  {
    label: "Service Platzhalter anlegen",
    command: "printf '[Unit]\nDescription=Game Server\nAfter=network.target\n\n[Service]\nType=simple\nUser=gameserver\nWorkingDirectory=/opt/gameserver\nExecStart=/opt/gameserver/start.sh\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n' > /etc/systemd/system/gameserver.service",
  },
  {
    label: "Startskript vorbereiten",
    command: "printf '#!/usr/bin/env bash\necho \"Gameserver startet...\"\nwhile true; do sleep 60; done\n' > /opt/gameserver/start.sh && chmod +x /opt/gameserver/start.sh",
  },
  {
    label: "Service aktivieren",
    command: "systemctl daemon-reload && systemctl enable gameserver.service",
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
    const result = await runCommand(connection, "systemctl start gameserver.service");
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
    const result = await runCommand(connection, "systemctl stop gameserver.service");
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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});
