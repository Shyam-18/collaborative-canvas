import { CanvasApp, Point, StrokeStyle } from "./canvas.js";

// declare socket.io global
declare global {
  interface Window { io: (uri?: string, opts?: any) => any; }
}

function getRoomFromURL(): string {
  const u = new URL(location.href);
  return (u.searchParams.get("room") || "lobby").trim();
}
const roomId = getRoomFromURL();

// DOM
const statusEl = document.getElementById("status") as HTMLSpanElement;
const fpsEl = document.getElementById("fps") as HTMLSpanElement;
const latEl = document.getElementById("lat") as HTMLSpanElement;
const usersEl = document.getElementById("users") as HTMLUListElement;
const roomLabel = document.getElementById("roomLabel") as HTMLSpanElement;
const connLabel = document.getElementById("connLabel") as HTMLSpanElement;
const board = document.getElementById("board") as HTMLCanvasElement;

if (!board) throw new Error("#board canvas not found");

// Canvas
const app = new CanvasApp(board);
(window as any).app = app;

function setStatus(text: string) { statusEl.textContent = text; console.log(text); }

// Socket (room-aware)
const socket = window.io("/", {
  transports: ["websocket"],
  autoConnect: true,
  query: { room: roomId }
});

// connection state badges
roomLabel.textContent = `Room: ${roomId}`;
connLabel.textContent = "Connecting…";
connLabel.className = "badge warn";

socket.on("connect", () => { connLabel.textContent = "Connected"; connLabel.className = "badge ok"; });
socket.on("disconnect", () => { connLabel.textContent = "Disconnected"; connLabel.className = "badge err"; });
socket.io.on("reconnect_attempt", () => { connLabel.textContent = "Reconnecting…"; connLabel.className = "badge warn"; });

// Types
type StrokeOp = {
  opId: string;
  type: "stroke" | "erase";
  style: StrokeStyle;
  points: Point[];
  active: boolean;
  seq: number;
  userId: string;
};

let ops: StrokeOp[] = [];
let selfId: string | null = null;

// ===== User List UI =====
type User = { userId: string; color: string };
function renderUsers(list: User[]) {
  usersEl.innerHTML = "";
  list.forEach(u => {
    const li = document.createElement("li");
    li.className = "user";
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.background = u.color;
    const id = document.createElement("div");
    id.className = "uid";
    id.textContent = u.userId.slice(0, 6);
    li.appendChild(dot);
    li.appendChild(id);
    if (u.userId === selfId) {
      const me = document.createElement("div");
      me.className = "me";
      me.textContent = "you";
      li.appendChild(me);
    }
    usersEl.appendChild(li);
  });
}

// ===== FPS HUD =====
let frames = 0;
let lastSec = performance.now();
function tickFPS() {
  frames++;
  const now = performance.now();
  if (now - lastSec >= 1000) {
    fpsEl.textContent = `FPS: ${frames}`;
    frames = 0;
    lastSec = now;
  }
  requestAnimationFrame(tickFPS);
}
requestAnimationFrame(tickFPS);

// ===== Latency (round-trip) =====
function pingLoop() {
  const sent = Date.now();
  socket.emit("latency:ping", sent);
}
socket.on("latency:pong", (sent: number) => {
  const rtt = Date.now() - sent;
  latEl.textContent = `Latency: ${rtt} ms`;
});
setInterval(pingLoop, 2000);

// ===== Join / Checkpoint / Replay =====
socket.on("joined", async ({ self, users, timeline, roomId }: { self: User; users: User[]; timeline: StrokeOp[]; roomId: string }) => {
  selfId = self.userId;
  renderUsers(users);

  // Load JSON checkpoint if present
  try {
    const resp = await fetch(`/data/checkpoints/checkpoint-${roomId}.json?${Date.now()}`);
    if (resp.ok) {
      const cp = await resp.json(); // { ts, ops }
      ops = (cp.ops as StrokeOp[]).concat(timeline).sort((a, b) => a.seq - b.seq);
      console.log(`[checkpoint] loaded JSON with ${cp.ops.length} ops`);
    } else {
      ops = timeline.slice().sort((a, b) => a.seq - b.seq);
    }
  } catch {
    ops = timeline.slice().sort((a, b) => a.seq - b.seq);
  }

  replayAll();
  setStatus(`ready • strokes: ${ops.length}`);
});

socket.on("users", (list: User[]) => renderUsers(list));

// ===== Replay =====
function replayAll() {
  app.clearCommitted();
  for (const op of ops) {
    if (!op.active) continue;
    const s = { ...op.style };
    if (op.type === "erase") s.tool = "eraser";
    app.drawCommitted(op.points, s);
  }
}

// ===== Live cursors =====
const cursors = new Map<string, { x: number; y: number; color: string; last: number }>();
function drawCursors(ctx: CanvasRenderingContext2D) {
  const now = performance.now();
  cursors.forEach((c, uid) => {
    if (now - c.last > 3000) { cursors.delete(uid); return; }
    ctx.save();
    ctx.fillStyle = c.color;
    ctx.font = "10px system-ui";
    ctx.fillText(uid.slice(0,4), c.x + 6, c.y - 6);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
app.setOverlayDrawer(drawCursors);

board.addEventListener("pointermove", (e: PointerEvent) => {
  const { x, y } = app.toCanvasCoords(e.clientX, e.clientY);
  socket.emit("cursor", { x, y, dpr: window.devicePixelRatio });
});
socket.on("cursor", ({ userId, x, y, color, dpr = 1 }: { userId: string; x: number; y: number; color: string; dpr?: number }) => {
  const scale = window.devicePixelRatio / dpr;
  cursors.set(userId, { x: x * scale, y: y * scale, color, last: performance.now() });
});

// ===== Toolbar =====
(document.getElementById("tool-brush") as HTMLButtonElement)?.addEventListener("click", () => app.setTool("brush"));
(document.getElementById("tool-eraser") as HTMLButtonElement)?.addEventListener("click", () => app.setTool("eraser"));
(document.getElementById("color") as HTMLInputElement)?.addEventListener("input", (e: Event) => app.setColor((e.target as HTMLInputElement).value));
(document.getElementById("width") as HTMLInputElement)?.addEventListener("input", (e: Event) => app.setWidth(parseInt((e.target as HTMLInputElement).value, 10) || 6));
(document.getElementById("undo") as HTMLButtonElement)?.addEventListener("click", () => socket.emit("op:undo"));
(document.getElementById("redo") as HTMLButtonElement)?.addEventListener("click", () => socket.emit("op:redo"));

// ===== Local stroke streaming (same as before) =====
let currentTempId: string | null = null;
function uuid(): string { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }

app.onLocalStrokeStart(() => {
  currentTempId = uuid();
  const s = app.getStyle();
  const start = app.peekCurrentPoint();
  socket.emit("stroke:start", { tempId: currentTempId, tool: s.tool, color: s.color, width: s.width, start });
});

let batch: Point[] = [];
let batching = false;
app.onLocalPointAdded((pt: Point) => {
  batch.push(pt);
  if (!batching) {
    batching = true;
    requestAnimationFrame(() => {
      if (currentTempId && batch.length) socket.emit("stroke:append", { tempId: currentTempId, points: batch });
      batch = [];
      batching = false;
    });
  }
});

app.onLocalStrokeEnd(() => {
  if (currentTempId) socket.emit("stroke:commit", { tempId: currentTempId });
  currentTempId = null;
});

// ===== Remote streaming =====
socket.on("stroke:start", (d: { userId: string; tempId: string; tool: StrokeStyle["tool"]; color: string; width: number; start: Point }) =>
  app.remoteStrokeStart(d.userId, d.tempId, { tool: d.tool, color: d.color, width: d.width }, d.start)
);
socket.on("stroke:append", (d: { userId: string; tempId: string; points: Point[] }) =>
  app.remoteStrokeAppend(d.userId, d.tempId, d.points)
);

// ===== Commit / toggles =====
socket.on("op:commit", ({ op, tempId, authorSocketId }: { op: StrokeOp; tempId: string; authorSocketId: string }) => {
  ops.push(op);
  app.remoteStrokeCommit(op.userId, tempId);
  const isMine = authorSocketId === socket.id;
  if (op.active) app.drawCommitted(op.points, op.style);
  if (isMine) setStatus(`committed • total ops: ${ops.length}`);
});

socket.on("op:toggle", ({ opId, active }: { opId: string; active: boolean }) => {
  const f = ops.find(o => o.opId === opId);
  if (f) f.active = active;
  replayAll();
  setStatus(`replayed • total ops: ${ops.length}`);
});
