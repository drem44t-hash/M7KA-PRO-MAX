// عشيرة تيم — السيرفر
// يراقب عدد متابعين حساب تيك توك بشكل دوري (كل 5 دقايق افتراضيًا)
// وأي زيادة في العدد = بوت جديد (أو أكثر) يبثّها للواجهة الأمامية عبر Socket.io.

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// --- حالة التتبع الحالية ---
let trackedUsername = null;
let lastFollowerCount = null;
let pollTimer = null;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // كل 5 دقايق

function broadcast(event, payload) {
  io.emit(event, payload);
}

// أسماء عشوائية تستخدم فقط في وضع المحاكاة (بدون تتبع حقيقي)
const DEMO_NAMES = [
  "سلطان", "نوف", "فهد", "غلا", "بندر", "شهد", "تركي", "لمى",
  "عبدالله", "ريم", "سعود", "دانه", "خالد", "جود", "ماجد", "رهف"
];

function randomDemoUser() {
  const n = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
  const id = Math.floor(Math.random() * 99999);
  return { uniqueId: `${n}${id}`, nickname: n };
}

// يقرأ صفحة بروفايل تيك توك العامة ويستخرج عدد المتابعين من الداتا المدمجة بالصفحة.
// ملاحظة: تيك توك ما يوفر API رسمي لعدد متابعين أي حساب، فهذا يعتمد على قراءة
// الصفحة العامة نفسها. لو تيك توك غيّر بنية صفحته، هذا الجزء يحتاج تحديث.
async function fetchFollowerCount(username) {
  const url = `https://www.tiktok.com/@${username}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  if (!res.ok) throw new Error(`تيك توك رجّع خطأ ${res.status}`);
  const html = await res.text();

  const match = html.match(/"followerCount":(\d+)/);
  if (!match) throw new Error("ما قدرت ألقى عدد المتابعين بالصفحة (ممكن الحساب غير موجود أو خاص)");
  return parseInt(match[1], 10);
}

async function pollOnce() {
  if (!trackedUsername) return;
  try {
    const count = await fetchFollowerCount(trackedUsername);

    if (lastFollowerCount === null) {
      // أول فحص: نثبّت نقطة البداية بدون ما نطلّع بوتات (عشان ما تطلع دفعة وحدة)
      lastFollowerCount = count;
      broadcast("status", { connected: true, username: trackedUsername, followerCount: count });
      return;
    }

    const diff = count - lastFollowerCount;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        broadcast("newFollower", { ...randomDemoUser(), source: "poll" });
      }
    }
    lastFollowerCount = count;
    broadcast("status", { connected: true, username: trackedUsername, followerCount: count });
  } catch (err) {
    console.error("خطأ أثناء فحص المتابعين:", err.message);
    broadcast("status", { connected: true, username: trackedUsername, error: err.message });
  }
}

function startTracking(username) {
  stopTracking();
  trackedUsername = username;
  lastFollowerCount = null;
  pollOnce(); // فحص فوري أول
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

function stopTracking() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  trackedUsername = null;
  lastFollowerCount = null;
}

// --- API ---

// بدء التتبع: POST { username: "azex0110" }
app.post("/api/connect", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "لازم تحط يوزر تيك توك" });
  const clean = username.replace("@", "").trim();
  try {
    // نتأكد إن الحساب موجود ونقدر نقرأ عدد متابعينه قبل ما نبدأ التتبع الدوري
    await fetchFollowerCount(clean);
    startTracking(clean);
    res.json({ ok: true, username: clean, intervalMs: POLL_INTERVAL_MS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ما قدرت ألقى الحساب أو أقرأ عدد متابعينه.", detail: String(err.message || err) });
  }
});

app.post("/api/disconnect", (req, res) => {
  const username = trackedUsername;
  stopTracking();
  broadcast("status", { connected: false, username });
  res.json({ ok: true });
});

app.get("/api/status", (req, res) => {
  res.json({
    connected: !!trackedUsername,
    username: trackedUsername,
    followerCount: lastFollowerCount,
    intervalMs: POLL_INTERVAL_MS
  });
});

// وضع المحاكاة: يولّد متابع وهمي كل ما تناديه (زر "محاكاة" في الواجهة)، بدون تتبع حقيقي
app.post("/api/simulate", (req, res) => {
  const user = randomDemoUser();
  broadcast("newFollower", { ...user, source: "simulate" });
  res.json({ ok: true, user });
});

const PORT = process.env.PORT || 8091;
server.listen(PORT, () => {
  console.log(`عشيرة تيم شغالة على http://localhost:${PORT}`);
});
