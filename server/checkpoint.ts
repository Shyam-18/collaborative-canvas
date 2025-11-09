// server/checkpoint.ts
import fs from "fs";
import path from "path";
import { StrokeOp } from "./drawing-state";

const SAVE_PATH = path.join(process.cwd(), "data", "checkpoints");
if (!fs.existsSync(SAVE_PATH)) fs.mkdirSync(SAVE_PATH, { recursive: true });

export const CHECKPOINT_INTERVAL = 5;

// Each checkpoint is a JSON snapshot of all ops at that point.
export function checkpointFile(roomId: string): string {
  const safe = roomId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(SAVE_PATH, `checkpoint-${safe}.json`);
}

export function saveCheckpoint(roomId: string, ops: StrokeOp[]) {
  try {
    const data = JSON.stringify({ ts: Date.now(), ops }, null, 2);
    fs.writeFileSync(checkpointFile(roomId), data, "utf8");
    console.log(`[checkpoint] saved JSON for room "${roomId}"`);
  } catch (err) {
    console.error("[checkpoint] save failed:", err);
  }
}

export function loadCheckpoint(roomId: string): StrokeOp[] | null {
  try {
    const file = checkpointFile(roomId);
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(text);
    return parsed.ops || [];
  } catch (err) {
    console.error("[checkpoint] load failed:", err);
    return null;
  }
}
