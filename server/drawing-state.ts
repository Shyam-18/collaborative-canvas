// server/drawing-state.ts
import { v4 as uuid } from "uuid";
import { loadOps, saveOps } from "./persistence";
import { saveCheckpoint, CHECKPOINT_INTERVAL, loadCheckpoint } from "./checkpoint";

export type Tool = "brush" | "eraser";
export type Point = { x: number; y: number; t: number };
export type StrokeStyle = { color: string; width: number; tool: Tool };
export type OpType = "stroke" | "erase";

export type StrokeOp = {
  opId: string;
  type: OpType;
  style: StrokeStyle;
  points: Point[];
  active: boolean;
  seq: number;
  userId: string;
};

type TempStroke = {
  style: StrokeStyle;
  points: Point[];
  userId: string;
};

export function createDrawingState(roomId: string) {
  const existingCheckpoint = loadCheckpoint(roomId);
  const ops: StrokeOp[] = existingCheckpoint ? existingCheckpoint : loadOps(roomId);
  const opIndex = new Map<string, number>();
  let seqCounter = 0;
  for (let i = 0; i < ops.length; i++) {
    opIndex.set(ops[i].opId, i);
    if (ops[i].seq > seqCounter) seqCounter = ops[i].seq;
  }
  const temp = new Map<string, TempStroke>();
  function persist() { saveOps(roomId, ops); }
  function key(socketId: string, tempId: string) { return `${socketId}|${tempId}`; }

  function startTemp(socketId: string, tempId: string, userId: string, style: StrokeStyle, start: Point) {
    temp.set(key(socketId, tempId), { style, points: [start], userId });
  }

  function appendTemp(socketId: string, tempId: string, points: Point[]) {
    const rec = temp.get(key(socketId, tempId));
    if (!rec) return;
    rec.points.push(...points);
  }

  function commitTemp(socketId: string, tempId: string): { op: StrokeOp } | null {
    const k = key(socketId, tempId);
    const rec = temp.get(k);
    if (!rec) return null;
    temp.delete(k);

    const op: StrokeOp = {
      opId: uuid(),
      type: rec.style.tool === "eraser" ? "erase" : "stroke",
      style: rec.style,
      points: rec.points.slice(),
      active: true,
      seq: ++seqCounter,
      userId: rec.userId,
    };

    opIndex.set(op.opId, ops.length);
    ops.push(op);
    persist();
    if (ops.length % CHECKPOINT_INTERVAL === 0) {
      console.log(`[checkpoint] Room ${roomId} reached ${ops.length} ops — saving JSON checkpoint`);
      saveCheckpoint(roomId, ops);
    }
    return { op };
  }

  function toggleLastActive(): StrokeOp | null {
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.active) {
        op.active = false;
        op.seq = ++seqCounter;
        persist();
        return op;
      }
    }
    return null;
  }

  function toggleLastInactive(): StrokeOp | null {
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (!op.active) {
        op.active = true;
        op.seq = ++seqCounter;
        persist();
        return op;
      }
    }
    return null;
  }

  function getTimeline(): StrokeOp[] {
    return ops.map(o => ({ ...o, points: o.points.slice() }));
  }

  return { startTemp, appendTemp, commitTemp, toggleLastActive, toggleLastInactive, getTimeline };
}
