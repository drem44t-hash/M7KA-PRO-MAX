// عشيرة تيم — منطق الواجهة
// خريطة كبيرة، كل متابع جديد = بوت يظهر وينضم لقبيلة، مع تكبير/تصغير وسحب

const socket = io();

const worldCanvas = document.getElementById("world");
const worldCtx = worldCanvas.getContext("2d");
const miniCanvas = document.getElementById("minimap");
const miniCtx = miniCanvas.getContext("2d");

const introEl = document.getElementById("intro");
const usernameInput = document.getElementById("usernameInput");
const connectBtn = document.getElementById("connectBtn");
const demoBtn = document.getElementById("demoBtn");
const connBadge = document.getElementById("connBadge");
const connText = document.getElementById("connText");
const statTotal = document.getElementById("statTotal");
const statFollowers = document.getElementById("statFollowers");
const tribesPanel = document.getElementById("tribesPanel");
const simulateBtn = document.getElementById("simulateBtn");

// ---------- إعداد القبائل ----------
const WORLD_W = 4200;
const WORLD_H = 3000;

const TRIBES = [
  { id: "teal", name: "الفيروزي", color: "#00e5c7", cx: WORLD_W * 0.28, cy: WORLD_H * 0.32, members: [] },
  { id: "magenta", name: "الوردي", color: "#ff3d81", cx: WORLD_W * 0.74, cy: WORLD_H * 0.28, members: [] },
  { id: "amber", name: "الذهبي", color: "#ffb020", cx: WORLD_W * 0.3, cy: WORLD_H * 0.75, members: [] },
  { id: "violet", name: "البنفسجي", color: "#8b6bff", cx: WORLD_W * 0.72, cy: WORLD_H * 0.74, members: [] },
];

let avatarSeq = 0;
let totalCount = 0;
let spawnPulses = []; // حلقات النبض عند ظهور بوت جديد

// ---------- الكاميرا ----------
const camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.32 };
let dragging = false;
let dragStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };

function resizeCanvases() {
  worldCanvas.width = window.innerWidth;
  worldCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvases);
resizeCanvases();

// ---------- تفاعل السحب والتكبير ----------
worldCanvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  camStart = { x: camera.x, y: camera.y };
});
window.addEventListener("pointerup", () => (dragging = false));
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = (e.clientX - dragStart.x) / camera.zoom;
  const dy = (e.clientY - dragStart.y) / camera.zoom;
  camera.x = clamp(camStart.x - dx, 0, WORLD_W);
  camera.y = clamp(camStart.y - dy, 0, WORLD_H);
});
worldCanvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    camera.zoom = clamp(camera.zoom + delta * camera.zoom, 0.08, 2.2);
  },
  { passive: false }
);

document.getElementById("zoomInBtn").onclick = () => (camera.zoom = clamp(camera.zoom * 1.25, 0.08, 2.2));
document.getElementById("zoomOutBtn").onclick = () => (camera.zoom = clamp(camera.zoom * 0.8, 0.08, 2.2));
document.getElementById("recenterBtn").onclick = () => {
  camera.x = WORLD_W / 2;
  camera.y = WORLD_H / 2;
  camera.zoom = 0.32;
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---------- إنشاء بوت جديد ----------
function pickTribe() {
  // توزيع متوازن: ينضم للقبيلة الأقل عددًا
  return TRIBES.reduce((min, t) => (t.members.length < min.members.length ? t : min), TRIBES[0]);
}

function spawnAvatar(user) {
  const tribe = pickTribe();
  const angle = Math.random() * Math.PI * 2;
  // كل ما تكبر القبيلة تتوسع دائرتها للخارج (نفس شكل التجمعات بالمرجع)
  const spread = 60 + Math.sqrt(tribe.members.length) * 26;
  const r = Math.random() * spread;

  const avatar = {
    id: avatarSeq++,
    uniqueId: user.uniqueId,
    nickname: user.nickname || user.uniqueId || "بدون اسم",
    x: tribe.cx + Math.cos(angle) * r,
    y: tribe.cy + Math.sin(angle) * r,
    points: 100,
    tribe,
    spawnedAt: performance.now(),
  };

  tribe.members.push(avatar);
  totalCount++;
  statTotal.textContent = totalCount.toLocaleString("en-US");
  spawnPulses.push({ x: avatar.x, y: avatar.y, color: tribe.color, t: 0 });
  renderTribesPanel();
}

function renderTribesPanel() {
  tribesPanel.innerHTML = "";
  const sorted = [...TRIBES].sort((a, b) => b.members.length - a.members.length);
  for (const t of sorted) {
    const row = document.createElement("div");
    row.className = "tribe-row";
    row.innerHTML = `
      <span class="tribe-name">
        <span class="tribe-swatch" style="background:${t.color}"></span>
        ${t.name}
      </span>
      <span class="tribe-count">${t.members.length.toLocaleString("en-US")}</span>
    `;
    tribesPanel.appendChild(row);
  }
}
renderTribesPanel();

// ---------- الرسم ----------
function worldToScreen(x, y) {
  return {
    sx: (x - camera.x) * camera.zoom + worldCanvas.width / 2,
    sy: (y - camera.y) * camera.zoom + worldCanvas.height / 2,
  };
}

function drawGrid() {
  const step = 90 * camera.zoom;
  if (step < 8) return;
  worldCtx.strokeStyle = "rgba(0, 229, 199, 0.06)";
  worldCtx.lineWidth = 1;
  const originX = (worldCanvas.width / 2 - camera.x * camera.zoom) % step;
  const originY = (worldCanvas.height / 2 - camera.y * camera.zoom) % step;
  worldCtx.beginPath();
  for (let x = originX; x < worldCanvas.width; x += step) {
    worldCtx.moveTo(x, 0);
    worldCtx.lineTo(x, worldCanvas.height);
  }
  for (let y = originY; y < worldCanvas.height; y += step) {
    worldCtx.moveTo(0, y);
    worldCtx.lineTo(worldCanvas.width, y);
  }
  worldCtx.stroke();
}

function drawAvatar(av, now) {
  const { sx, sy } = worldToScreen(av.x, av.y);
  if (sx < -30 || sx > worldCanvas.width + 30 || sy < -30 || sy > worldCanvas.height + 30) return;

  const age = now - av.spawnedAt;
  const pop = age < 380 ? easeOutBack(Math.min(1, age / 380)) : 1;
  const size = 6 * camera.zoom * pop;
  if (size < 0.6) return;

  worldCtx.beginPath();
  worldCtx.fillStyle = av.tribe.color;
  worldCtx.shadowColor = av.tribe.color;
  worldCtx.shadowBlur = 6 * camera.zoom;
  worldCtx.arc(sx, sy, Math.max(1.4, size), 0, Math.PI * 2);
  worldCtx.fill();
  worldCtx.shadowBlur = 0;

  if (camera.zoom > 0.55) {
    worldCtx.font = `700 ${Math.max(9, 10 * camera.zoom)}px Space Mono, monospace`;
    worldCtx.fillStyle = "#eef4f3";
    worldCtx.textAlign = "center";
    worldCtx.fillText(String(av.points), sx, sy - size - 6);
  }
  if (camera.zoom > 1.1) {
    worldCtx.font = `400 ${9 * camera.zoom}px Tajawal, sans-serif`;
    worldCtx.fillStyle = "rgba(238,244,243,0.75)";
    worldCtx.fillText(av.nickname, sx, sy + size + 12);
  }
}

function easeOutBack(t) {
  const c1 = 1.7, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function drawPulses(now) {
  spawnPulses = spawnPulses.filter((p) => now - (p.start || (p.start = now)) < 700);
  for (const p of spawnPulses) {
    const t = (now - p.start) / 700;
    const { sx, sy } = worldToScreen(p.x, p.y);
    worldCtx.beginPath();
    worldCtx.strokeStyle = p.color;
    worldCtx.globalAlpha = 1 - t;
    worldCtx.lineWidth = 2;
    worldCtx.arc(sx, sy, 4 + t * 40 * camera.zoom, 0, Math.PI * 2);
    worldCtx.stroke();
    worldCtx.globalAlpha = 1;
  }
}

function drawMinimap() {
  const w = miniCanvas.width, h = miniCanvas.height;
  miniCtx.clearRect(0, 0, w, h);
  miniCtx.fillStyle = "rgba(0,0,0,0.001)";
  miniCtx.fillRect(0, 0, w, h);

  for (const tribe of TRIBES) {
    miniCtx.fillStyle = tribe.color;
    for (const av of tribe.members) {
      const mx = (av.x / WORLD_W) * w;
      const my = (av.y / WORLD_H) * h;
      miniCtx.globalAlpha = 0.85;
      miniCtx.fillRect(mx, my, 1.6, 1.6);
    }
  }
  miniCtx.globalAlpha = 1;

  // مربع منطقة العرض الحالية
  const viewW = (worldCanvas.width / camera.zoom / WORLD_W) * w;
  const viewH = (worldCanvas.height / camera.zoom / WORLD_H) * h;
  const viewX = (camera.x / WORLD_W) * w - viewW / 2;
  const viewY = (camera.y / WORLD_H) * h - viewH / 2;
  miniCtx.strokeStyle = "#eef4f3";
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(viewX, viewY, viewW, viewH);
}

function fitMinimapSize() {
  const rect = miniCanvas.getBoundingClientRect();
  miniCanvas.width = rect.width;
  miniCanvas.height = rect.height;
}
window.addEventListener("resize", fitMinimapSize);
setTimeout(fitMinimapSize, 0);

function loop() {
  const now = performance.now();
  worldCtx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
  drawGrid();
  for (const tribe of TRIBES) {
    for (const av of tribe.members) drawAvatar(av, now);
  }
  drawPulses(now);
  drawMinimap();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- سوكِت: أحداث التتبع ----------
socket.on("newFollower", (user) => spawnAvatar(user));
socket.on("status", (data) => {
  if (data.connected) {
    connBadge.classList.add("live");
    connText.textContent = data.error ? `@${data.username} — خطأ بآخر فحص` : `يتابع @${data.username}`;
    introEl.style.display = "none";
    if (typeof data.followerCount === "number") {
      statFollowers.textContent = data.followerCount.toLocaleString("en-US");
    }
  } else {
    connBadge.classList.remove("live");
    connText.textContent = "غير متصل";
  }
});

// ---------- واجهة الاتصال ----------
connectBtn.onclick = async () => {
  const username = usernameInput.value.trim();
  if (!username) return;
  connectBtn.disabled = true;
  connectBtn.textContent = "جاري التحقق من الحساب...";
  try {
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل بدء التتبع");
    introEl.style.display = "none";
  } catch (err) {
    alert(err.message);
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "ابدأ التتبع";
  }
};

demoBtn.onclick = () => {
  introEl.style.display = "none";
  connText.textContent = "وضع محاكاة";
};

simulateBtn.onclick = async () => {
  await fetch("/api/simulate", { method: "POST" });
};

// اضغط Enter للاتصال
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") connectBtn.click();
});
