# ARCHITECTURE

## 1) Data Flow
1. User draws → local preview on **live layer**.
2. Client emits:
   - `stroke:start {tempId, tool, color, width, start}`
   - `stroke:append {tempId, points[]}` (batched via rAF)
   - `stroke:commit {tempId}`
3. Server records an authoritative `StrokeOp` and broadcasts `op:commit`.
4. Clients:
   - Clear the remote-live for `{userId,tempId}`
   - Append `op` to timeline
   - Draw to **committed layer**.

Cursors: `cursor {x,y,dpr}` rebroadcast to room and rendered in overlay.

## 2) Protocol (per room)
- `joined { self, users, timeline, roomId }`
- `users [ { userId, color } ]`
- `cursor { userId, x, y, color, dpr }`
- `stroke:start`, `stroke:append`
- `op:commit { op, tempId, authorSocketId }`
- `op:toggle { opId, active, seq }` (for undo/redo)
- `latency:ping/pong` (HUD)

Room chosen by query: `?room=<id>` (isolates users and ops).

## 3) State Model

type Tool = "brush" | "eraser";

type StrokeStyle = { color: string; width: number; tool: Tool };

type StrokeOp = {
  opId: string;           // server-generated
  type: "stroke" | "erase";
  style: StrokeStyle;     // if type === "erase", style.tool === "eraser"
  points: {x:number; y:number; t:number}[];
  userId: string;
  active: boolean;        // toggled by undo/redo
  seq: number;            // monotonic ordering for deterministic replay
};
## 4) Undo/Redo (global)
Undo: find the last active op → set active=false, bump seq, broadcast op:toggle.

Redo: find the last inactive op → set active=true, bump seq, broadcast op:toggle.

Replay: client clears committed bitmap and redraws ops.filter(o=>o.active).sort(by seq) → strong consistency across clients.

## 5) Canvas Engine
Committed canvas (authoritative pixels)

Live canvas (local preview stroke)

Remote live strokes drawn transiently each frame and cleared on commit

Eraser uses destination-out compositing

Pointer Events; pressure widens stroke (basic)

## 6) Performance
Batching stroke:append via requestAnimationFrame to reduce WS load.

Checkpoints: every N ops, save snapshot JSON to /data/checkpoints/checkpoint-<room>.json.
On join: load checkpoint (if present) + append fresh ops → replay small delta.

DPR-correct cursors to prevent drift on HiDPI.

Replay only on toggle; committed strokes are incremental otherwise.

## 7) Persistence
Per-room ops saved in data/canvas-<room>.json.

Checkpoints saved under data/checkpoints/ (JSON, no native deps).

Why JSON over PNG: portable, cross-platform (Windows-friendly), avoids native node-canvas build chain, achieves same fast-reload goal.

## 8) Conflict Resolution
Overlap resolved by op order; eraser punches through previous pixels.

Undo/redo toggles do not mutate history; they toggle active.

Deterministic rebuild guarantees convergence across clients.

## 9) Scaling (to 1000 users)
Socket.IO Redis adapter for pub/sub across multiple instances.

Shard by room to bound fan-out.

Binary encoding (Float32Array) for points to reduce payload size.

Increase checkpoint cadence and stream deltas to late joiners.

Optional: WebRTC data channels for very large rooms.

## 10) Security
No authentication (per assignment).

CORS open for demo; restrict in prod.

Health endpoint /healthz for platform readiness.
