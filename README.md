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
