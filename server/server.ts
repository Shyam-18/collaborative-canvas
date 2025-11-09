// server/server.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { createRoomsManager } from "./rooms";
import { StrokeStyle, Point } from "./drawing-state";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const ROOT = process.cwd();
const CLIENT_DIST = path.join(ROOT, "dist", "client");
const DATA_DIR = path.join(ROOT, "data");

// static
app.use("/dist/client", express.static(CLIENT_DIST));
app.use("/data", express.static(DATA_DIR));
app.set("trust proxy", true);

// index
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "client", "index.html"));
});

app.get("/healthz", (_req, res) => res.status(200).send("ok")); // <-- healthcheck

const rooms = createRoomsManager();

io.on("connection", (socket) => {
  const roomId = (socket.handshake.query.room as string) || "lobby";
  socket.join(roomId);

  const user = rooms.addUser(roomId);
  socket.data.user = user;
  socket.data.roomId = roomId;

  const state = rooms.getState(roomId);

  // initial sync
  socket.emit("joined", {
    self: user,
    users: rooms.listUsers(roomId),
    timeline: state.getTimeline(),
    roomId,
  });

  // let everyone in the room refresh their user list
  io.to(roomId).emit("users", rooms.listUsers(roomId));
  socket.to(roomId).emit("presence", { type: "join", user });

  console.log("socket connected:", socket.id, user.userId, "room:", roomId);

  // latency ping/pong
  socket.on("latency:ping", (clientTs: number) => {
    socket.emit("latency:pong", clientTs);
  });

  // live cursor
  socket.on("cursor", (pos) => {
    socket.to(roomId).emit("cursor", { userId: user.userId, color: user.color, ...pos, ts: Date.now() });
  });

  // streaming
  socket.on("stroke:start", (payload: { tempId: string; tool: StrokeStyle["tool"]; color: string; width: number; start: Point }) => {
    const style: StrokeStyle = { tool: payload.tool, color: payload.color, width: payload.width };
    state.startTemp(socket.id, payload.tempId, user.userId, style, payload.start);
    socket.to(roomId).emit("stroke:start", { userId: user.userId, ...payload });
  });

  socket.on("stroke:append", (payload: { tempId: string; points: Point[] }) => {
    state.appendTemp(socket.id, payload.tempId, payload.points);
    socket.to(roomId).emit("stroke:append", { userId: user.userId, ...payload });
  });

  socket.on("stroke:commit", (payload: { tempId: string }) => {
    const res = state.commitTemp(socket.id, payload.tempId);
    if (!res) return;
    const { op } = res;
    io.to(roomId).emit("op:commit", { op, tempId: payload.tempId, authorSocketId: socket.id });
  });

  // undo/redo
  socket.on("op:undo", () => {
    const toggled = state.toggleLastActive();
    if (toggled) io.to(roomId).emit("op:toggle", { opId: toggled.opId, active: toggled.active, seq: toggled.seq });
  });

  socket.on("op:redo", () => {
    const toggled = state.toggleLastInactive();
    if (toggled) io.to(roomId).emit("op:toggle", { opId: toggled.opId, active: toggled.active, seq: toggled.seq });
  });

  socket.on("disconnect", () => {
    rooms.removeUser(roomId, user.userId);
    io.to(roomId).emit("users", rooms.listUsers(roomId));
    socket.to(roomId).emit("presence", { type: "leave", userId: user.userId });
    console.log("socket disconnected:", socket.id, user.userId, "room:", roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
