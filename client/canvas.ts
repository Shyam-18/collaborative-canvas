export type Tool = "brush" | "eraser";
export type Point = { x: number; y: number; t: number; p?: number }; // p = pressure 0..1
export type StrokeStyle = { color: string; width: number; tool: Tool };

export class CanvasApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private live: HTMLCanvasElement;
  private liveCtx: CanvasRenderingContext2D;
  private committed: HTMLCanvasElement;
  private committedCtx: CanvasRenderingContext2D;

  private points: Point[] = [];
  private isDrawing = false;
  private style: StrokeStyle = { color: "#ff4757", width: 6, tool: "brush" };

  private listeners = { start: [] as Array<() => void>, add: [] as Array<(pt: Point) => void>, end: [] as Array<() => void> };
  private overlayDrawer: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  private remoteLive = new Map<string, { pts: Point[]; style: StrokeStyle }>();

  // options
  private usePressure = true; // basic pen pressure support

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c2d = canvas.getContext("2d");
    if (!c2d) throw new Error("2D context not available");
    this.ctx = c2d;

    this.live = document.createElement("canvas");
    this.liveCtx = this.live.getContext("2d")!;
    this.committed = document.createElement("canvas");
    this.committedCtx = this.committed.getContext("2d")!;

    this.resize();
    window.addEventListener("resize", () => this.resize());

    canvas.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp as any, { passive: false });
    window.addEventListener("pointercancel", this.onPointerUp as any, { passive: false });

    requestAnimationFrame(() => this.loop());
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    [this.canvas, this.live, this.committed].forEach(c => {
      c.width = Math.max(1, Math.floor(r.width * dpr));
      c.height = Math.max(1, Math.floor(r.height * dpr));
      (c.getContext("2d")!).setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  private loop() {
    this.composite();
    requestAnimationFrame(() => this.loop());
  }

  public toCanvasCoords(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== "touch" && e.pointerType !== "pen") return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.isDrawing = true;
    const p = this.toCanvasCoords(e.clientX, e.clientY);
    this.points = [{ x: p.x, y: p.y, t: performance.now(), p: e.pressure }];
    this.listeners.start.forEach(cb => cb());
    this.listeners.add.forEach(cb => cb(this.points[0]));
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDrawing) return;
    e.preventDefault();
    const p = this.toCanvasCoords(e.clientX, e.clientY);
    const pt: Point = { x: p.x, y: p.y, t: performance.now(), p: e.pressure };
    const last = this.points[this.points.length - 1];
    if (!last || last.x !== pt.x || last.y !== pt.y) {
      this.points.push(pt);
      this.listeners.add.forEach(cb => cb(pt));
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isDrawing) return;
    e.preventDefault();
    this.isDrawing = false;
    // commit to base
    this.drawStroke(this.committedCtx, this.points, this.style);
    this.listeners.end.forEach(cb => cb());
    this.points = [];
    this.liveCtx.clearRect(0, 0, this.live.width, this.live.height);
  };

  private composite() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    // base
    this.ctx.drawImage(this.committed, 0, 0);
    // remote live
    this.remoteLive.forEach(rec => this.drawStroke(this.ctx, rec.pts, rec.style));
    // my live
    if (this.isDrawing) {
      if (this.style.tool === "eraser") {
        this.drawStroke(this.ctx, this.points, this.style);
      } else {
        this.liveCtx.clearRect(0, 0, this.live.width, this.live.height);
        this.drawStroke(this.liveCtx, this.points, this.style);
        this.ctx.drawImage(this.live, 0, 0);
      }
    }
    // overlay
    if (this.overlayDrawer) this.overlayDrawer(this.ctx);
  }

  private drawStroke(ctx: CanvasRenderingContext2D, points: Point[], style: StrokeStyle) {
    if (points.length === 0) return;
    const isEraser = style.tool === "eraser";
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // segment-by-segment (support pressure if present)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const pressure = this.usePressure ? ((a.p ?? 0.5) + (b.p ?? 0.5)) / 2 : 1;
      ctx.strokeStyle = isEraser ? "#000" : style.color;
      ctx.lineWidth = Math.max(1, style.width * pressure);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // handle single-tap dot
    if (points.length === 1) {
      const p = points[0];
      ctx.fillStyle = isEraser ? "#000" : style.color;
      const pressure = this.usePressure ? (p.p ?? 0.5) : 1;
      const r = Math.max(0.5, (style.width * pressure) / 2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (isEraser) {
        // destination-out fill:
        ctx.fill();
      } else {
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = prev;
  }

  // public API
  public clearCommitted() { this.committedCtx.clearRect(0, 0, this.committed.width, this.committed.height); }
  public drawCommitted(points: Point[], style: StrokeStyle) { this.drawStroke(this.committedCtx, points, style); }
  public setTool(t: Tool) { this.style.tool = t; }
  public setColor(c: string) { this.style.color = c; }
  public setWidth(w: number) { this.style.width = w; }
  public getStyle() { return { ...this.style }; }
  public peekCurrentPoint() { return this.points[this.points.length - 1] || null; }
  public onLocalStrokeStart(cb: () => void) { this.listeners.start.push(cb); }
  public onLocalPointAdded(cb: (pt: Point) => void) { this.listeners.add.push(cb); }
  public onLocalStrokeEnd(cb: () => void) { this.listeners.end.push(cb); }
  public setOverlayDrawer(fn: (ctx: CanvasRenderingContext2D) => void) { this.overlayDrawer = fn; }

  // remote live
  public remoteStrokeStart(uid: string, tid: string, style: StrokeStyle, start: Point) {
    this.remoteLive.set(`${uid}:${tid}`, { pts: [start], style });
  }
  public remoteStrokeAppend(uid: string, tid: string, pts: Point[]) {
    const rec = this.remoteLive.get(`${uid}:${tid}`); if (!rec) return;
    rec.pts.push(...pts);
  }
  public remoteStrokeCommit(uid: string, tid: string) {
    const k = `${uid}:${tid}`;
    const rec = this.remoteLive.get(k);
    if (rec) {
      this.drawStroke(this.committedCtx, rec.pts, rec.style);
      this.remoteLive.delete(k);
    }
  }
}
