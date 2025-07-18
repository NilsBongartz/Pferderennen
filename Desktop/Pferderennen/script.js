let socket;
let username;
let team;
let alreadyAnswered = false;
let countdownInterval;
let timerStartTimestamp = 0;
let gameWasStarted = false;

// Einstiegspunkt nach Klick auf "Mitspielen"
function joinGame() {
  username = document.getElementById("username").value.trim();
  if (!username) return showToast("❗ Bitte gib einen Namen ein.", "#e4572e");

  // WebSocket zur aktuellen Server-IP
  const wsURL = `ws://${window.location.hostname}:3000`;
  socket = new WebSocket(wsURL);

  socket.onopen = () => {
    team = Math.random() < 0.5 ? "rot" : "gelb";
    socket.send(JSON.stringify({ type: "join", username, team }));
    showLobby();
  };

  socket.onclose = () => {
    showToast("Verbindung zum Server verloren!", "#e4572e");
  };

  socket.onerror = () => {
    showToast("⚠️ Verbindung zum Spielserver fehlgeschlagen.", "#e4572e");
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "start") {
      gameWasStarted = true;
      showQuestion(msg.question);
    }
    if (msg.type === "question") {
      showQuestion(msg.question);
    }
    if (msg.type === "stopped") {
      showResultScreen(msg.progress);
    }
    if (msg.type === "returnToLobby") {
      showLobby(); // zurück zur Wartelobby
    }
  };
}

// Wartelobby mit Teamzuweisung
function showLobby() {
  clearInterval(countdownInterval);
  document.getElementById("loginArea").style.display = "none";
  document.getElementById("mainContent").innerHTML = `
    <div class="box">
      <h2>Willkommen, ${username}!</h2>
      <p>Du bist im Team <strong>${team === 'rot' ? '🟥 Roter Reiter' : '🟨 Gelber Reiter'}</strong></p>
      <h3>Warte auf Spielstart…</h3>
      <div style="font-size:1.3em;color:#888">Bitte auf dem Gerät bleiben.</div>
    </div>
  `;
}

// Zeigt die aktuelle Frage mit Timer und Antwortoptionen
function showQuestion(q) {
  alreadyAnswered = false;
  timerStartTimestamp = Date.now();
  const container = document.getElementById("mainContent");

  container.innerHTML = `
    <div class="question-box">
      <h2>Frage ${q.index + 1} von ${q.total}</h2>
      <p>${q.question}</p>
      <div class="race-track" id="race"></div>
      <div id="timer">⏱ 20 Sekunden</div>
      ${q.answers.map((a, i) =>
        `<button id="btn_${i}" onclick="submitAnswer('${String.fromCharCode(65 + i)}')" class="answer-btn">
          ${String.fromCharCode(65 + i)}: ${a}
        </button>`).join('<br>')}
      <div id="feedback"></div>
      <div id="teamStatus"></div>
    </div>
  `;
  renderRaceTrack(q.progress);
  startTimer();
}

// Timeranzeige (synchron mit Startzeit)
function startTimer() {
  clearInterval(countdownInterval);
  const timerEl = document.getElementById("timer");
  function update() {
    const elapsed = Math.floor((Date.now() - timerStartTimestamp) / 1000);
    const remaining = Math.max(0, 20 - elapsed);
    if (timerEl) timerEl.textContent = `⏱ ${remaining} Sekunden`;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      if (!alreadyAnswered) submitAnswer(null);
    }
  }
  update();
  countdownInterval = setInterval(update, 500);
}

// Antwort abgeben (Einmal pro Frage)
function submitAnswer(letter) {
  if (alreadyAnswered || !socket) return;
  alreadyAnswered = true;
  clearInterval(countdownInterval);

  // Disable all answer buttons
  Array.from(document.getElementsByClassName("answer-btn")).forEach(btn => btn.disabled = true);

  socket.send(JSON.stringify({
    type: "submitAnswer",
    answer: letter
  }));

  const feedback = document.getElementById("feedback");
  if (letter === null) feedback.textContent = "⏱ Zeit abgelaufen – keine Antwort abgegeben.";
  else feedback.textContent = `✅ Antwort ${letter} gesendet.`;
}

// Fortschrittsanzeige (10 Felder Rennstrecke)
function renderRaceTrack(progress) {
  const raceDiv = document.getElementById("race");
  if (!raceDiv || !progress) return;

  const tiles = 10;
  let bar = "";
  for (let i = 0; i < tiles; i++) {
    const rot = i === progress.rot ? '🐎' : '';
    const gelb = i === progress.gelb ? '🐎' : '';
    const tile = (team === 'rot' ? rot : gelb);
    bar += `<div class='track-tile ${tile ? 'active' : ''}'>${tile}</div>`;
  }
  raceDiv.innerHTML = bar;
}

// Ergebnisanzeige am Spielende
function showResultScreen(data) {
  clearInterval(countdownInterval);
  const total = data.total;
  const winner = data.rot > data.gelb ? "Team Rot 🟥" : data.gelb > data.rot ? "Team Gelb 🟨" : "Unentschieden";
  document.getElementById("mainContent").innerHTML = `
    <div class="result-box">
      <h2>🎉 Spiel beendet</h2>
      <p>Team Rot: ${data.rot} von ${total} Fragen</p>
      <p>Team Gelb: ${data.gelb} von ${total} Fragen</p>
      <h3>🏁 Gewinner: ${winner}</h3>
      <p>Bitte warte auf den Neustart des Spiels durch den Admin.</p>
    </div>
  `;
}

// UX: Schicker Toast/Infobalken
function showToast(msg, color = "#444") {
  let toast = document.getElementById("userToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "userToast";
    toast.style.position = "fixed";
    toast.style.bottom = "32px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = color;
    toast.style.color = "#fff";
    toast.style.padding = "13px 22px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "1.12em";
    toast.style.zIndex = 10000;
    toast.style.boxShadow = "0 2px 16px rgba(0,0,0,0.14)";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = color;
  toast.style.opacity = 1;
  setTimeout(() => { toast.style.opacity = 0; }, 2000);
}