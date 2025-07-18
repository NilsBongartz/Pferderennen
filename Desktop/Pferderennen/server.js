const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 3000 });

let clients = new Map(); // clientId -> { socket, username, team }
let questions = [];
let currentQuestionIndex = 0;
let requiredPercentage = 0.8;
let gameRunning = false;
let answers = { rot: [], gelb: [] };

// --- Helper ---
function broadcast(data) {
  const json = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(json);
    }
  }
}

function sendTeamList() {
  const teams = {};
  for (const [id, c] of clients.entries()) {
    teams[id] = { username: c.username, team: c.team };
  }
  broadcast({ type: "teams", teams });
}

function getTeamSizes() {
  let rot = 0, gelb = 0;
  for (const c of clients.values()) {
    if (c.team === "rot") rot++;
    else if (c.team === "gelb") gelb++;
  }
  return { rot, gelb };
}

function getProgress() {
  return {
    rot: currentQuestionIndex,
    gelb: currentQuestionIndex,
    total: questions.length
  };
}

function getTeamProgress() {
  return {
    rot: currentQuestionIndex,
    gelb: currentQuestionIndex
  };
}

function prepareQuestion() {
  const q = questions[currentQuestionIndex];
  if (!q) return null;
  return {
    index: currentQuestionIndex,
    total: questions.length,
    question: q.question,
    answers: q.answers,
    correct: q.correct,
    progress: getTeamProgress()
  };
}

// --- Main Connection Handler ---
wss.on("connection", (ws) => {
  const id = Date.now() + "_" + Math.random().toString(36).substring(2, 5);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // --- Join ---
      if (data.type === "join") {
        const team = data.team;
        clients.set(id, { socket: ws, username: data.username, team });
        sendTeamList();
      }

      // --- Fragen speichern (Admin) ---
      if (data.type === "setQuestions") {
        questions = data.questions;
        currentQuestionIndex = 0;
        answers.rot = [];
        answers.gelb = [];
        broadcast({ type: "questionsUpdated", total: questions.length });
      }

      // --- Schwelle speichern (Admin) ---
      if (data.type === "setThreshold") {
        requiredPercentage = data.value;
      }

      // --- Spiel starten ---
      if (data.type === "startGame") {
        gameRunning = true;
        currentQuestionIndex = 0;
        answers.rot = [];
        answers.gelb = [];
        broadcast({ type: "start", question: prepareQuestion() });
      }

      // --- Spiel stoppen ---
      if (data.type === "stopGame") {
        gameRunning = false;
        broadcast({ type: "stopped", progress: getProgress() });
      }

      // --- Zurück zur Lobby ---
      if (data.type === "returnToLobby") {
        gameRunning = false;
        currentQuestionIndex = 0;
        answers.rot = [];
        answers.gelb = [];
        broadcast({ type: "returnToLobby" });
      }

      // --- Komplett-Reset (Admin) ---
      if (data.type === "resetAll") {
        questions = [];
        currentQuestionIndex = 0;
        answers.rot = [];
        answers.gelb = [];
        broadcast({ type: "stopped", progress: getProgress() });
        broadcast({ type: "questionsUpdated", total: 0 });
      }

      // --- Kick User (Admin) ---
      if (data.type === "kickUser" && data.id) {
        if (clients.has(data.id)) {
          clients.get(data.id).socket.close();
          clients.delete(data.id);
          sendTeamList();
        }
      }

      // --- Progress explizit abfragen (Admin) ---
      if (data.type === "getProgress") {
        ws.send(JSON.stringify({ type: "progress", progress: getProgress() }));
      }

      // --- Antwort verarbeiten (Spieler) ---
      if (data.type === "submitAnswer") {
        const client = clients.get(id);
        if (!client || !gameRunning) return;

        const team = client.team;
        // Doppelte Antworten eines Users in einer Runde verhindern
        if (answers[team].some(a => a.user === client.username)) return;

        answers[team].push({ user: client.username, answer: data.answer });

        const teamSize = getTeamSizes()[team];
        const teamAnswers = answers[team].filter(a => a.answer !== null);
        const uniqueUsers = [...new Set(teamAnswers.map(a => a.user))];
        const correctCount = teamAnswers.filter(a => a.answer === questions[currentQuestionIndex].correct).length;

        const requiredCount = Math.ceil(teamSize * requiredPercentage);

        if (uniqueUsers.length >= requiredCount && correctCount >= requiredCount) {
          currentQuestionIndex++;

          if (currentQuestionIndex >= questions.length) {
            gameRunning = false;
            broadcast({ type: "stopped", progress: getProgress() });
            return;
          }

          answers.rot = [];
          answers.gelb = [];

          broadcast({
            type: "question",
            question: prepareQuestion()
          });
        } else {
          broadcast({ type: "answerUpdate", team });
        }
      }
    } catch (e) {
      console.error("⚠️ Fehler beim Verarbeiten der Nachricht:", e.message);
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    sendTeamList();
  });
});

console.log("✅ WebSocket-Server läuft auf ws://localhost:3000");