const connectionForm = document.getElementById("connection-form");
const stepsList = document.getElementById("steps-list");
const installButton = document.getElementById("install-button");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const logArea = document.getElementById("log");

let connectionData = null;
let steps = [];

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logArea.textContent += `[${timestamp}] ${message}\n`;
  logArea.scrollTop = logArea.scrollHeight;
}

function setButtonsState(enabled) {
  installButton.disabled = !enabled;
  startButton.disabled = !enabled;
  stopButton.disabled = !enabled;
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
  } catch (error) {
    log(error.message);
  }
}

startButton.addEventListener("click", () => controlServer("start"));
stopButton.addEventListener("click", () => controlServer("stop"));
