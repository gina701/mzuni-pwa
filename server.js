require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DB_FILE = path.join(DATA_DIR, "database.json");
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
if (process.env.NODE_ENV === "production") {
  const missing = ["ADMIN_EMAIL", "ADMIN_PASSWORD"].filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  if (process.env.ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters in production.");
}
const COURSES = [
  "Human Communication",
  "Mass Communication",
  "Communication Theory",
  "English for Academic Purposes"
];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], materials: [], rooms: [] }, null, 2));
}
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch (e) { console.error("Database read error:", e.message); throw new Error("Could not read database."); }
}
function writeDB(db) {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_FILE);
}
async function deleteStoredFile(fileName) {
  await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(fileName))).catch(err => {
    if (err.code !== "ENOENT") throw err;
  });
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}
function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!raw) return res.status(401).json({ error: "Please sign in first." });
  try {
    const payload = jwt.verify(raw, JWT_SECRET);
    const user = readDB().users.find(u => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: "Account not found. Please sign in again." });
    req.user = user;
    next();
  } catch (_) { return res.status(401).json({ error: "Your session expired. Please sign in again." }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}
function cleanText(value, max = 180) {
  return String(value || "").trim().slice(0, max);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false }));
app.use(express.static(path.join(__dirname, "public")));

async function seedAdmin() {
  const email = cleanText(process.env.ADMIN_EMAIL || "admin@mzuni.local", 254).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!";
  const db = readDB();
  if (!db.users.some(u => u.role === "admin")) {
    db.users.push({
      id: crypto.randomUUID(), name: cleanText(process.env.ADMIN_NAME || "MZUNI Administrator", 80),
      email, passwordHash: await bcrypt.hash(password, 12), role: "admin",
      createdAt: new Date().toISOString()
    });
    writeDB(db);
    console.log("Initial admin created:", email);
    if (!process.env.ADMIN_PASSWORD) console.warn("WARNING: Set ADMIN_PASSWORD before using this app publicly.");
  }
}
app.get("/api/health", (req, res) => res.json({ ok: true, app: "MZUNI Communication Studies", time: new Date().toISOString() }));
app.get("/api/config", (req, res) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  res.json({ courses: COURSES, maxRoomMembers: 4, iceServers });
});

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Enter your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const db = readDB();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: "An account with that email already exists." });
  const user = { id: crypto.randomUUID(), name, email, passwordHash: await bcrypt.hash(password, 12), role: "student", createdAt: new Date().toISOString() };
  db.users.push(user); await writeDB(db);
  res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
}));
app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");
  const user = readDB().users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect." });
  res.json({ token: tokenFor(user), user: publicUser(user) });
}));
app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/materials", auth, (req, res) => {
  const db = readDB();
  res.json(db.materials.filter(m => m.status === "approved").sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(m => ({ ...m, fileUrl: `/uploads/${encodeURIComponent(m.fileName)}` })));
});
app.get("/api/admin/materials", auth, adminOnly, (req, res) => {
  res.json(readDB().materials.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(m => ({ ...m, fileUrl: `/uploads/${encodeURIComponent(m.fileName)}` })));
});
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, "");
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage, limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|doc|docx|ppt|pptx|txt|jpg|jpeg|png)$/i.test(file.originalname);
    cb(allowed ? null : new Error("Allowed file types: PDF, Word, PowerPoint, TXT, JPG and PNG."), allowed);
  }
});
app.post("/api/admin/materials", auth, adminOnly, upload.single("file"), asyncRoute(async (req, res) => {
  const title = cleanText(req.body.title, 140);
  const course = cleanText(req.body.course, 100);
  if (!title || !COURSES.includes(course) || !req.file) {
    if (req.file) await deleteStoredFile(req.file.filename);
    return res.status(400).json({ error: "Provide a title, a valid course and a file." });
  }
  const db = readDB();
  const item = {
    id: crypto.randomUUID(), title, course, description: cleanText(req.body.description, 600),
    originalName: path.basename(req.file.originalname), fileName: req.file.filename,
    mimeType: req.file.mimetype, size: req.file.size, status: "pending",
    uploadedBy: req.user.name, createdAt: new Date().toISOString()
  };
  try {
    db.materials.push(item);
    writeDB(db);
  } catch (err) {
    await deleteStoredFile(req.file.filename);
    throw err;
  }
  res.status(201).json({ material: { ...item, fileUrl: `/uploads/${encodeURIComponent(item.fileName)}` }, message: "Uploaded for review. Approve it in the admin panel to make it visible to students." });
}));
app.patch("/api/admin/materials/:id", auth, adminOnly, asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected." });
  const db = readDB();
  const item = db.materials.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Material not found." });
  item.status = status; item.reviewedAt = new Date().toISOString(); item.reviewedBy = req.user.name;
  writeDB(db);
  res.json({ material: item });
}));
app.delete("/api/admin/materials/:id", auth, adminOnly, asyncRoute(async (req, res) => {
  const db = readDB();
  const index = db.materials.findIndex(m => m.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Material not found." });
  const [item] = db.materials.splice(index, 1);
  writeDB(db);
  await deleteStoredFile(item.fileName);
  res.json({ ok: true });
}));

app.get("/api/rooms", auth, (req, res) => {
  const rooms = readDB().rooms.filter(r => r.status === "open").map(r => ({
    id: r.id, code: r.code, title: r.title, course: r.course,
    hostName: r.hostName, createdAt: r.createdAt, memberCount: liveRoomCount(r.id)
  }));
  res.json(rooms);
});
app.post("/api/rooms", auth, asyncRoute(async (req, res) => {
  const title = cleanText(req.body.title, 100);
  const course = cleanText(req.body.course, 100);
  if (!title || !COURSES.includes(course)) return res.status(400).json({ error: "Enter a room name and choose a valid course." });
  const db = readDB();
  const room = {
    id: crypto.randomUUID(), code: crypto.randomBytes(3).toString("hex").toUpperCase(),
    title, course, hostId: req.user.id, hostName: req.user.name,
    status: "open", createdAt: new Date().toISOString()
  };
  db.rooms.push(room); writeDB(db);
  res.status(201).json(room);
}));
app.post("/api/rooms/join", auth, (req, res) => {
  const code = cleanText(req.body.code, 10).toUpperCase();
  const room = readDB().rooms.find(r => r.code === code && r.status === "open");
  if (!room) return res.status(404).json({ error: "No open room matches that code." });
  if (liveRoomCount(room.id) >= 4) return res.status(409).json({ error: "This room already has four participants." });
  res.json({ id: room.id, code: room.code });
});
app.post("/api/rooms/:id/close", auth, asyncRoute(async (req, res) => {
  const db = readDB();
  const room = db.rooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found." });
  if (room.hostId !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "Only the room host can close it." });
  room.status = "closed"; room.closedAt = new Date().toISOString(); writeDB(db);
  broadcastRoom(room.id, { type: "room-closed" });
  res.json({ ok: true });
}));

const peers = new Map(); // roomId -> Map(userId -> { ws, user })
function liveRoomCount(roomId) { return peers.has(roomId) ? peers.get(roomId).size : 0; }
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcastRoom(roomId, data, exceptId) {
  const roomPeers = peers.get(roomId);
  if (!roomPeers) return;
  for (const [id, peer] of roomPeers) if (id !== exceptId) send(peer.ws, data);
}
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/signal") return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req, url));
});
wss.on("connection", (ws, req, url) => {
  let user = null, roomId = null;
  try {
    const payload = jwt.verify(url.searchParams.get("token") || "", JWT_SECRET);
    user = readDB().users.find(u => u.id === payload.sub);
  } catch (_) {}
  if (!user) { ws.close(4401, "Sign in required"); return; }
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    if (msg.type === "join") {
      const db = readDB();
      const room = db.rooms.find(r => r.id === String(msg.roomId) && r.status === "open");
      if (!room) return send(ws, { type: "error", message: "This room is not open." });
      if (!peers.has(room.id)) peers.set(room.id, new Map());
      const roomPeers = peers.get(room.id);
      if (!roomPeers.has(user.id) && roomPeers.size >= 4) return send(ws, { type: "error", message: "This room already has four participants." });
      roomId = room.id;
      const existing = [...roomPeers.entries()].filter(([id]) => id !== user.id).map(([id, p]) => ({ id, name: p.user.name }));
      roomPeers.set(user.id, { ws, user });
      send(ws, { type: "joined", roomId, selfId: user.id, peers: existing, maxParticipants: 4 });
      broadcastRoom(roomId, { type: "peer-joined", peer: { id: user.id, name: user.name } }, user.id);
      return;
    }
    if (!roomId) return;
    if (["offer", "answer", "ice-candidate", "peer-state"].includes(msg.type)) {
      const target = peers.get(roomId)?.get(String(msg.to));
      if (target) send(target.ws, { ...msg, from: user.id, fromName: user.name });
    }
  });
  ws.on("close", () => {
    if (!roomId) return;
    const roomPeers = peers.get(roomId);
    if (roomPeers && roomPeers.get(user.id)?.ws === ws) {
      roomPeers.delete(user.id);
      broadcastRoom(roomId, { type: "peer-left", peerId: user.id });
      if (!roomPeers.size) peers.delete(roomId);
    }
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Files must be 15 MB or smaller." : err.message });
  if (err) {
    console.error("Request failed:", err);
    return res.status(500).json({ error: "The request could not be completed. Please try again." });
  }
  next();
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
seedAdmin()
  .then(() => server.listen(PORT, "0.0.0.0", () => console.log(`MZUNI Communication Studies PWA listening on port ${PORT}`)))
  .catch(err => { console.error("Admin setup failed:", err); process.exit(1); });
