const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Allow all origins for dev (restrict in prod)
  res.header("Access-Control-Allow-Methods", "GET, POST");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
const secret = new TextEncoder().encode("my_super_secret_12345");
const sessions = {};

app.post("/create-session", (req, res) => {
  const sessionId = Date.now().toString() + Math.floor(Math.random() * 10000);
  sessions[sessionId] = { status: "inactive", anomalies: 0, screenshots: [] };
  res.json({ sessionId });
});

app.post("/screenshot", (req, res) => {
  const { sessionId, screenshot, overlays, timestamp } = req.body;
  if (!sessions[sessionId])
    sessions[sessionId] = { status: "active", anomalies: 0, screenshots: [] };
  sessions[sessionId].screenshots.push({ screenshot, overlays, timestamp });
  if (overlays && overlays.length > 0) {
    sessions[sessionId].anomalies += overlays.length;
    io.emit("anomaly", { sessionId, overlays, timestamp, screenshot });
  }
  res.json({ ok: true });
});

// Install route on backend
app.get("/install", (req, res) => {
  const sessionId = req.query.sessionId;
  res.send(`
    <h1>Install SecureShare</h1>
    <p>In development, manually load the extension in <a href="chrome://extensions/" target="_blank">chrome://extensions/</a> (select the 'dist' folder).</p>
    <p>Then, open the extension popup, paste this Session ID: <strong>${sessionId}</strong>, and click 'Save Session ID'.</p>
    <p>In production, this would redirect to the Chrome Web Store.</p>
  `);
});

app.post("/ping", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    const { sessionId } = payload;
    if (sessions[sessionId]) {
      sessions[sessionId].lastPing = Date.now();
      console.log(
        `Ping received for session ${sessionId} at ${new Date().toISOString()}`
      );
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(`Ping error for token: ${err.message}`);
    res.sendStatus(401);
  }
});

app.post("/validate", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    const data = payload;
    const anomaly = data.watermark !== "expected_pattern" || data.hasOverlay;
    if (anomaly && sessions[data.sessionId]) {
      sessions[data.sessionId].anomalies.push({
        time: Date.now(),
        type: "overlay",
      });
      if (data.screenshot)
        sessions[data.sessionId].screenshots.push(data.screenshot);
      io.emit("anomaly", { sessionId: data.sessionId, anomaly });
      console.log(
        `Anomaly detected for session ${
          data.sessionId
        } at ${new Date().toISOString()}`
      );
    }
    res.json({ anomaly });
  } catch (err) {
    console.error(`Validate error: ${err.message}`);
    res.sendStatus(401);
  }
});

app.get("/dashboard/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.sendStatus(404);
  const isActive = Date.now() - session.lastPing < 15000;
  res.json({
    active: isActive,
    anomalies: session.anomalies,
    screenshots: session.screenshots,
  });
});

app.get("/status/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId] || {
    status: "inactive",
    anomalies: 0,
    screenshots: [],
  };
  res.json(session);
});

io.on("connection", (socket) => {
  socket.on("subscribe", (sessionId) => {
    socket.join(sessionId);
  });
});

server.listen(3000, () => console.log('Backend running on 3000'));
