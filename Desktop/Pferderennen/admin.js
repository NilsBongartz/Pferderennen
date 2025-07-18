const socket = new WebSocket(`ws://${window.location.hostname}:3000`);

let localQuestions = [];
let editingIndex = -1;
let currentProgress = { rot: 0, gelb: 0, total: 0 };
let currentTeams = {};
let sending = false; // Spinner/Busy

// --- WebSocket Events ---
socket.onopen = () => {
  // Zeige kurzen Status beim Verbindungsaufbau (kann als Toast o.ä. genutzt werden)
  showToast("🟢 Mit Server verbunden.", "green");
};

socket.onclose = () => {
  showToast("🔴 Verbindung zum Server verloren!", "red");
};

socket.onerror = () => {
  showToast("⚠️ Serververbindung fehlgeschlagen!", "orange");
};

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "teams") {
    currentTeams = msg.teams;
    updateTeamTables();
  }
  if (msg.type === "answerUpdate" || msg.type === "question") {
    updateTeamProgress();
  }
  if (msg.type === "stopped" || msg.type === "progress") {
    currentProgress = msg.progress;
    updateRaceTracks();
  }
};

// --- Frage hinzufügen ---
function addQuestion() {
  clearError("questionError");
  const q = document.getElementById("question").value.trim();
  const a1 = document.getElementById("a1").value.trim();
  const a2 = document.getElementById("a2").value.trim();
  const a3 = document.getElementById("a3").value.trim();
  const a4 = document.getElementById("a4").value.trim();
  const correct = document.getElementById("correct").value.trim().toUpperCase();

  if (!q || !a1 || !a2 || !a3 || !a4 || !"ABCD".includes(correct)) {
    setError("questionError", "❌ Bitte alle Felder korrekt ausfüllen (A–D).");
    return;
  }

  const newQ = { question: q, answers: [a1, a2, a3, a4], correct };

  if (editingIndex >= 0) {
    localQuestions[editingIndex] = newQ;
    editingIndex = -1;
  } else {
    localQuestions.push(newQ);
  }
  localStorage.setItem("questions", JSON.stringify(localQuestions));
  updateQuestionList();
  clearInputs();
  showToast("✅ Frage gespeichert.", "green");
}

function clearInputs() {
  ["question", "a1", "a2", "a3", "a4", "correct"].forEach(id => {
    document.getElementById(id).value = "";
  });
  editingIndex = -1;
}

function updateQuestionList() {
  const list = document.getElementById("questionList");
  list.innerHTML = "";
  localQuestions.forEach((q, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      Frage ${i + 1}: ${q.question} (${q.correct})
      <button onclick="editQuestion(${i})">✏️ Bearbeiten</button>
      <button onclick="deleteQuestion(${i})" style="color:red;">🗑 Löschen</button>
    `;
    list.appendChild(li);
  });
}

function editQuestion(index) {
  const q = localQuestions[index];
  document.getElementById("question").value = q.question;
  document.getElementById("a1").value = q.answers[0];
  document.getElementById("a2").value = q.answers[1];
  document.getElementById("a3").value = q.answers[2];
  document.getElementById("a4").value = q.answers[3];
  document.getElementById("correct").value = q.correct;
  editingIndex = index;
  showToast("✏️ Bearbeitungsmodus aktiviert.", "#1877ff");
}

function deleteQuestion(index) {
  if (confirm("❌ Diese Frage wirklich löschen?")) {
    localQuestions.splice(index, 1);
    localStorage.setItem("questions", JSON.stringify(localQuestions));
    updateQuestionList();
    showToast("🗑 Frage gelöscht.", "#ff7700");
  }
}

function sendQuestions() {
  clearError("settingsError");
  const threshold = parseFloat(document.getElementById("requiredPercentage").value);
  if (isNaN(threshold) || threshold < 0.1 || threshold > 1) {
    setError("settingsError", "❌ Ungültiger Schwellenwert (0.1–1.0)");
    return;
  }
  if (!localQuestions.length) {
    setError("settingsError", "⚠️ Es muss mindestens eine Frage gespeichert sein!");
    return;
  }
  if (sending) return;

  sending = true;
  socket.send(JSON.stringify({ type: "setQuestions", questions: localQuestions }));
  socket.send(JSON.stringify({ type: "setThreshold", value: threshold }));
  localStorage.setItem("questions", JSON.stringify(localQuestions));
  showToast("✅ Fragen & Schwelle gesendet", "green");
  setTimeout(() => sending = false, 1200);
}

function startGame() {
  socket.send(JSON.stringify({ type: "startGame" }));
  showToast("🎬 Spiel gestartet.", "green");
}

function stopGame() {
  if (confirm("🛑 Spiel beenden?")) {
    socket.send(JSON.stringify({ type: "stopGame" }));
    showToast("⏹ Spiel gestoppt.", "red");
  }
}

function returnToLobby() {
  socket.send(JSON.stringify({ type: "returnToLobby" }));
  showToast("👋 Teilnehmer zur Lobby geschickt.", "#1877ff");
}

function resetAll() {
  if (confirm("⚠️ Fortschritt und Teilnehmer wirklich löschen? Alle gehen verloren!")) {
    socket.send(JSON.stringify({ type: "resetAll" }));
    showToast("🗑 Alles wurde zurückgesetzt!", "red");
  }
}

function updateTeamTables() {
  const rot = document.getElementById("rotTable");
  const gelb = document.getElementById("gelbTable");
  if (!rot || !gelb) return;
  rot.innerHTML = "";
  gelb.innerHTML = "";

  for (const id in currentTeams) {
    const { username, team } = currentTeams[id];
    const row = `<tr><td>${username}</td>
      <td><button onclick="kickUser('${id}')">🗑 Entfernen</button></td></tr>`;
    if (team === "rot") rot.innerHTML += row;
    else if (team === "gelb") gelb.innerHTML += row;
  }
}

function kickUser(id) {
  if (confirm("⚠️ Spieler wirklich entfernen?")) {
    socket.send(JSON.stringify({ type: "kickUser", id }));
    showToast("🗑 Spieler entfernt.", "red");
  }
}

function updateTeamProgress() {
  socket.send(JSON.stringify({ type: "getProgress" }));
}

function updateRaceTracks() {
  const total = currentProgress.total || 10;
  const rot = currentProgress.rot || 0;
  const gelb = currentProgress.gelb || 0;

  const raceRot = document.getElementById("raceRot");
  const raceGelb = document.getElementById("raceGelb");
  raceRot.innerHTML = "";
  raceGelb.innerHTML = "";

  for (let i = 0; i < total; i++) {
    const tileRot = document.createElement("div");
    tileRot.className = "track-tile";
    if (i === rot) tileRot.classList.add("active");
    tileRot.textContent = i === rot ? "🐎" : "";
    raceRot.appendChild(tileRot);

    const tileGelb = document.createElement("div");
    tileGelb.className = "track-tile";
    if (i === gelb) tileGelb.classList.add("active");
    tileGelb.textContent = i === gelb ? "🐎" : "";
    raceGelb.appendChild(tileGelb);
  }

  document.getElementById("progressRot").textContent = `Team Rot 🟥: ${rot} von ${total}`;
  document.getElementById("progressGelb").textContent = `Team Gelb 🟨: ${gelb} von ${total}`;
}

// --- Hilfsfunktionen für Error/Toast ---
function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}
function clearError(id) {
  setError(id, "");
}

// Schicker Toast (SnackBar/Infobalken)
function showToast(msg, color = "#444") {
  let toast = document.getElementById("adminToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "adminToast";
    toast.style.position = "fixed";
    toast.style.bottom = "32px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = color;
    toast.style.color = "#fff";
    toast.style.padding = "13px 22px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "1.15em";
    toast.style.zIndex = 10000;
    toast.style.boxShadow = "0 2px 16px rgba(0,0,0,0.13)";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = color;
  toast.style.opacity = 1;
  setTimeout(() => { toast.style.opacity = 0; }, 2000);
}

// --- Wiederherstellung gespeicherter Fragen beim Laden
window.addEventListener("load", () => {
  const stored = localStorage.getItem("questions");
  if (stored) {
    localQuestions = JSON.parse(stored);
    updateQuestionList();
  }
  updateTeamTables();
  updateTeamProgress();
  updateRaceTracks();
});

// --- Live-Aktualisierung ---
setInterval(() => {
  updateTeamTables();
  updateRaceTracks();
}, 1200);