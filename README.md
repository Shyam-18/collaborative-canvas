# Collaborative Canvas — Real-Time Multi-User Drawing (Vanilla JS + Node)

A real-time, multi-user drawing app with brush/eraser, colors, width, **global undo/redo**, live cursors, **rooms**, and persistence with JSON checkpoints.  
No frameworks. No drawing libraries. Pure HTML5 Canvas + Socket.IO.

## Live Demo
**URL:** https://collaborative-canvas-277m.onrender.com

### How to Test
1. Open the link in **two tabs/devices**.
2. Draw in one → appears **live** in the other as you draw.
3. Try **Eraser**, **Undo/Redo** (global across users).
4. Rooms: add `?room=alpha` and `?room=beta` to test isolation.
5. Check **FPS** and **Latency** badges (status bar).

> Note: On Render free tier, the service may “wake up” after inactivity (10–30s).  
> Persistence across redeploys requires a Render Disk mounted at `/opt/render/project/src/data`.

---

## Tech Stack
- **Frontend:** Vanilla TypeScript, HTML5 Canvas (no React/Vue, no drawing libs)
- **Realtime:** Socket.IO (WebSockets)
- **Backend:** Node.js + Express (TypeScript)
- **State:** Operation log (stroke/erase ops), JSON persistence, JSON checkpoints
- **Rooms:** `?room=<id>` → isolated timelines/state
- **Deploy:** Render Web Service

---

## Local Development
```bash
npm install
npm run build:client
npm run dev
# open http://localhost:3000
```
## Production
npm run build:all     # builds server (CJS) + client (ESM)
npm start             # serves dist/server.js and dist/client/*

## Project Structure
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── main.ts          # sockets, UI, cursors, HUD, replay
│   └── canvas.ts        # canvas engine (live+committed layers, eraser)
├── server/
│   ├── server.ts        # express + socket.io + routes
│   ├── rooms.ts         # room/user manager, colors
│   ├── drawing-state.ts # op log, temp strokes, undo/redo, checkpoints hook
│   └── persistence.ts   # save/load per-room ops
├── data/                # runtime data + checkpoints (served at /data)
├── dist/                # build outputs
├── package.json
├── tsconfig.json
└── client/tsconfig.client.json

## Features

Brush & Eraser, color picker, width control

Live cursors (per-user color)

Real-time streaming while drawing (not post-stroke)

Global Undo/Redo via operation log (active toggle with ordered seq)

Rooms via query param (?room=) for isolation

Persistence: per-room JSON + JSON checkpoints (fast startup)

HUD: FPS + round-trip latency

Mobile/Pen friendly: Pointer Events, basic pressure support

## Design Notes (short)

Canvas engine uses two layers: committed bitmap + live overlay (for in-progress).

Eraser uses destination-out compositing (first-class op).

Undo/Redo toggles op active and replays deterministic timeline.

Checkpointing saves periodic JSON snapshots (portable, no native deps).

Network batches points with requestAnimationFrame to reduce chatter.

## Deployment (Render)

Build Command: npm install && npm run build:all

Start Command: npm start

Node version (package.json → engines): 20.x

Healthcheck: /healthz

(Optional) Disk for persistence: mount at /opt/render/project/src/data

## Known Limitations

Free-tier Render can sleep; expect a short wake-up.

Persistence across redeploys needs a Disk; otherwise state resets on rebuild.
