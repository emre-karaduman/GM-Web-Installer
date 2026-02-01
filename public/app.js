const connectionForm = document.getElementById("connection-form");
const stepsList = document.getElementById("steps-list");
const installButton = document.getElementById("install-button");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const statusButton = document.getElementById("status-button");
const serverStatus = document.getElementById("server-status");
const logArea = document.getElementById("log");
const consoleOutput = document.getElementById("console-output");
const consoleCommand = document.getElementById("console-command");
const consoleSend = document.getElementById("console-send");
const startScriptArea = document.getElementById("start-script");
const loadScriptButton = document.getElementById("load-script");
const saveScriptButton = document.getElementById("save-script");
const rconHostInput = document.getElementById("rcon-host");
const rconPortInput = document.getElementById("rcon-port");
const rconPasswordInput = document.getElementById("rcon-password");
const rconOutput = document.getElementById("rcon-output");
const rconCommand = document.getElementById("rcon-command");
const rconSend = document.getElementById("rcon-send");

let connectionData = null;
let steps = [];
let socket = null;
let statusTimer = null;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logArea.textContent += `[${timestamp}] ${message}\n`;
  logArea.scrollTop = logArea.scrollHeight;
}

function appendConsole(message) {
  consoleOutput.textContent += message;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function appendRcon(message) {
  rconOutput.textContent += message;
  rconOutput.scrollTop = rconOutput.scrollHeight;
}

function setButtonsState(enabled) {
  installButton.disabled = !enabled;
  startButton.disabled = !enabled;
  stopButton.disabled = !enabled;
  statusButton.disabled = !enabled;
  loadScriptButton.disabled = !enabled;
  saveScriptButton.disabled = !enabled;
  rconSend.disabled = !enabled;
}

async function fetchSteps() {
  const response = await fetch("/api/install-steps");
  if (!response.ok) {
    throw new Error("Installationsschritte konnten nicht geladen werden.");
  }
  const data = await response.json();
  steps = data.steps || [];
}

function renderSteps() {
  stepsList.innerHTML = "";
  steps.forEach((step) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${step.label}</strong><br/><code>${step.command}</code>`;
    stepsList.appendChild(item);
  });
}

function connectConsole() {
  if (!connectionData) {
    return;
  }
  if (socket) {
    socket.close();
  }
  const params = new URLSearchParams(connectionData);
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${window.location.host}/ws/console?${params}`);

  socket.addEventListener("open", () => {
    consoleSend.disabled = false;
    appendConsole("Konsole verbunden.\n");
  });

  socket.addEventListener("message", (event) => {
    appendConsole(event.data);
  });

  socket.addEventListener("close", () => {
    consoleSend.disabled = true;
    appendConsole("\nKonsole getrennt.\n");
  });

  socket.addEventListener("error", () => {
    consoleSend.disabled = true;
    appendConsole("\nVerbindungsfehler in der Konsole.\n");
  });
}

async function updateStatus() {
  if (!connectionData) {
    return;
  }
  try {
    const response = await fetch("/api/server/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionData),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Status konnte nicht ermittelt werden.");
    }
    serverStatus.textContent = data.status;
    serverStatus.classList.toggle("status-online", data.status === "active");
    serverStatus.classList.toggle("status-offline", data.status !== "active");
  } catch (error) {
    serverStatus.textContent = "unbekannt";
    log(error.message);
  }
}

async function loadStartScript() {
  if (!connectionData) {
    return;
  }
  try {
    const response = await fetch("/api/start-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionData),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Startskript konnte nicht geladen werden.");
    }
    startScriptArea.value = data.script || "";
    log("Startskript geladen.");
  } catch (error) {
    log(error.message);
  }
}

async function saveStartScript() {
  if (!connectionData) {
    return;
  }
  try {
    const response = await fetch("/api/start-script/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...connectionData, script: startScriptArea.value }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Startskript konnte nicht gespeichert werden.");
    }
    log("Startskript gespeichert.");
  } catch (error) {
    log(error.message);
  }
}

connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(connectionForm);
  connectionData = {
    host: formData.get("host"),
    username: formData.get("username"),
    password: formData.get("password"),
  };

  try {
    log("Installationsschritte werden geladen...");
    await fetchSteps();
    renderSteps();
    setButtonsState(true);
    connectConsole();
    await loadStartScript();
    await updateStatus();
    if (!rconHostInput.value) {
      rconHostInput.value = connectionData.host;
    }
    if (!rconPortInput.value) {
      rconPortInput.value = "25575";
    }
    if (statusTimer) {
      clearInterval(statusTimer);
    }
    statusTimer = setInterval(updateStatus, 5000);
    log("Bereit für die Installation.");
  } catch (error) {
    log(error.message);
  }
});

installButton.addEventListener("click", async () => {
  if (!connectionData) {
    log("Bitte erst Verbindung konfigurieren.");
    return;
  }
  installButton.disabled = true;
  log("Installation startet...");

  try {
    const response = await fetch("/api/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionData),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Installation fehlgeschlagen.");
    }
    data.results.forEach((result) => {
      log(`${result.label}: ${result.code === 0 ? "OK" : "Fehler"}`);
      if (result.stdout) {
        log(result.stdout.trim());
      }
      if (result.stderr) {
        log(result.stderr.trim());
      }
    });
    log("Installation abgeschlossen.");
  } catch (error) {
    log(error.message);
  } finally {
    installButton.disabled = false;
  }
});

async function controlServer(action) {
  if (!connectionData) {
    log("Bitte erst Verbindung konfigurieren.");
    return;
  }
  log(`Server ${action}...`);
  try {
    const response = await fetch(`/api/server/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionData),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || `Server ${action} fehlgeschlagen.`);
    }
    log(`Server ${action} erfolgreich.`);
    await updateStatus();
    connectConsole();
  } catch (error) {
    log(error.message);
  }
}

startButton.addEventListener("click", () => controlServer("start"));
stopButton.addEventListener("click", () => controlServer("stop"));
statusButton.addEventListener("click", updateStatus);
loadScriptButton.addEventListener("click", loadStartScript);
saveScriptButton.addEventListener("click", saveStartScript);

consoleSend.addEventListener("click", () => {
  const value = consoleCommand.value.trim();
  if (!value || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(`${value}\n`);
  consoleCommand.value = "";
});

consoleCommand.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    consoleSend.click();
  }
});

rconSend.addEventListener("click", async () => {
  const command = rconCommand.value.trim();
  if (!command) {
    return;
  }
  const payload = {
    host: rconHostInput.value.trim(),
    port: rconPortInput.value.trim(),
    password: rconPasswordInput.value,
    command,
  };
  if (!payload.host || !payload.port || !payload.password) {
    appendRcon("Bitte RCON Host, Port und Passwort angeben.\n");
    return;
  }
  try {
    const response = await fetch("/api/rcon/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "RCON Fehler.");
    }
    appendRcon(`> ${command}\n${data.response || "OK"}\n`);
    rconCommand.value = "";
  } catch (error) {
    appendRcon(`${error.message}\n`);
  }
});

rconCommand.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    rconSend.click();
  }
});
