const express = require("express");
const http = require("http");
const path = require("path");
const { Client } = require("ssh2");
const { WebSocketServer } = require("ws");
const { Rcon } = require("rcon-client");

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
    command:
      "apt-get install -y curl wget screen && (java -version >/dev/null 2>&1 || (cd /tmp && wget -q https://download.bell-sw.com/java/21.0.10+10/bellsoft-jdk21.0.10+10-linux-amd64.deb && apt-get install -y ./bellsoft-jdk21.0.10+10-linux-amd64.deb))",
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

app.post("/api/server-properties", async (req, res) => {
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
      "cat /opt/minecraft/server.properties"
    );
    res.json({ success: true, properties: result.stdout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) {
      connection.end();
    }
  }
});

app.post("/api/server-properties/update", async (req, res) => {
  const { host, username, password, properties } = req.body;
  if (!host || !username || !password || !properties) {
    res.status(400).json({
      message: "Bitte Host, Benutzer, Passwort und Properties angeben.",
    });
    return;
  }
  let connection;
  try {
    const encodedProperties = Buffer.from(properties, "utf8").toString("base64");
    connection = await withConnection({ host, username, password });
    const result = await runCommand(
      connection,
      `echo '${encodedProperties}' | base64 -d > /opt/minecraft/server.properties`
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

app.post("/api/rcon/command", async (req, res) => {
  const { host, port, password, command } = req.body;
  if (!host || !port || !password || !command) {
    res.status(400).json({
      message: "Bitte Host, Port, Passwort und Befehl für RCON angeben.",
    });
    return;
  }
  let rcon;
  try {
    rcon = await Rcon.connect({
      host,
      port: Number(port),
      password,
    });
    const response = await rcon.send(command);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (rcon) {
      await rcon.end().catch(() => {});
    }
  }
});

app.post("/api/metrics", async (req, res) => {
  const {
    host,
    username,
    password,
    rconHost,
    rconPort,
    rconPassword,
  } = req.body;
  if (!host || !username || !password) {
    res.status(400).json({ message: "Bitte Host, Benutzer und Passwort angeben." });
    return;
  }
  let connection;
  let rcon;
  try {
    connection = await withConnection({ host, username, password });
    const pidResult = await runCommand(connection, "pgrep -f 'paper.jar' | head -n1");
    const pid = pidResult.stdout.trim();
    let heap = null;
    let gc = null;
    let threads = null;
    let cpu = null;
    let uptime = null;

    if (pid) {
      const jstatResult = await runCommand(connection, `jstat -gc ${pid}`);
      const lines = jstatResult.stdout.trim().split("\n");
      if (lines.length >= 2) {
        const headers = lines[0].trim().split(/\s+/);
        const values = lines[1].trim().split(/\s+/);
        const map = headers.reduce((acc, key, index) => {
          acc[key] = Number(values[index]);
          return acc;
        }, {});
        const heapUsedKb = (map.EU || 0) + (map.OU || 0) + (map.S0U || 0) + (map.S1U || 0);
        const heapMaxKb = (map.EC || 0) + (map.OC || 0) + (map.S0C || 0) + (map.S1C || 0);
        heap = {
          usedMb: Number((heapUsedKb / 1024).toFixed(1)),
          maxMb: Number((heapMaxKb / 1024).toFixed(1)),
        };
        gc = {
          runs: Number((map.YGC || 0) + (map.FGC || 0)),
          pauseSeconds: Number((map.GCT || 0).toFixed(2)),
        };
      }

      const threadResult = await runCommand(
        connection,
        `jcmd ${pid} PerfCounter.print | grep 'java.threads.live'`
      );
      const threadValue = threadResult.stdout.trim().split(/\s+/).pop();
      threads = threadValue ? Number(threadValue) : null;

      const cpuResult = await runCommand(connection, `ps -p ${pid} -o %cpu=`);
      cpu = cpuResult.stdout.trim();

      const uptimeResult = await runCommand(connection, `jcmd ${pid} VM.uptime`);
      const uptimeMatch = uptimeResult.stdout.match(/Uptime:\s+([\\d.]+)/);
      uptime = uptimeMatch ? Number(uptimeMatch[1]) : null;
    }

    let tps = null;
    let tickTimes = null;
    let players = null;

    if (rconHost && rconPort && rconPassword) {
      rcon = await Rcon.connect({
        host: rconHost,
        port: Number(rconPort),
        password: rconPassword,
      });
      const tpsResponse = await rcon.send("tps");
      const tpsMatch = tpsResponse.match(/TPS from last 1m, 5m, 15m:\\s*([\\d.,]+),\\s*([\\d.,]+),\\s*([\\d.,]+)/);
      if (tpsMatch) {
        tps = {
          oneMin: Number(tpsMatch[1].replace(",", ".")),
          fiveMin: Number(tpsMatch[2].replace(",", ".")),
          fifteenMin: Number(tpsMatch[3].replace(",", ".")),
        };
      }
      const tickMatch = tpsResponse.match(/Ticking:\\s*([\\d.]+)\\s*ms/);
      tickTimes = tickMatch ? Number(tickMatch[1]) : null;

      const listResponse = await rcon.send("list");
      const listMatch = listResponse.match(/There are (\\d+) of a max of (\\d+) players online/);
      players = listMatch
        ? { online: Number(listMatch[1]), max: Number(listMatch[2]) }
        : null;
    }

    res.json({
      success: true,
      data: {
        heap,
        gc,
        threads,
        cpu,
        uptime,
        tps,
        tickTimes,
        players,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (rcon) {
      await rcon.end().catch(() => {});
    }
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
