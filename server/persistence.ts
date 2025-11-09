// server/persistence.ts
import fs from "fs";
import path from "path";
import type { StrokeOp } from "./drawing-state";

const SAVE_PATH = path.join(process.cwd(), "data");

function roomFile(roomId: string) {
  const safe = roomId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(SAVE_PATH, `canvas-${safe}.json`);
}

export function loadOps(roomId: string): StrokeOp[] {
  try {
    const file = roomFile(roomId);
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[persistence] load failed:", err);
    return [];
  }
}

export function saveOps(roomId: string, ops: StrokeOp[]) {
  try {
    if (!fs.existsSync(SAVE_PATH)) fs.mkdirSync(SAVE_PATH, { recursive: true });
    const file = roomFile(roomId);
    fs.writeFileSync(file, JSON.stringify(ops, null, 2), "utf8");
  } catch (err) {
    console.error("[persistence] save failed:", err);
  }
}
