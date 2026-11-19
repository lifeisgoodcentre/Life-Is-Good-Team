// Minimal signature pad: pointer events, smooth strokes, HiDPI aware.
export function createSignaturePad(container) {
  container.innerHTML = `<canvas></canvas><div class="line"></div><div class="hint">Sign here with your finger or mouse</div>`;
  const canvas = container.querySelector("canvas");
  const hint = container.querySelector(".hint");
  const ctx = canvas.getContext("2d");
  let strokes = [];
  let current = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function drawStroke(c, pts) {
    if (!pts.length) return;
    c.lineWidth = 2.4; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#111";
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) c.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    if (pts.length > 1) c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    c.stroke();
  }
  function redraw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    strokes.forEach((s) => drawStroke(ctx, s));
    hint.style.display = strokes.length ? "none" : "";
  }
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = [pos(e)];
    strokes.push(current);
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    current.push(pos(e));
    redraw();
  });
  const end = () => { current = null; container.dispatchEvent(new Event("change")); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  window.addEventListener("resize", resize);
  requestAnimationFrame(resize);

  return {
    // "Empty" = less than ~40px of ink in total (a stray tap doesn't count as a signature).
    isEmpty: () => strokes.reduce((n, s) => n + s.reduce((m, p, i) => (i ? m + Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y) : m), 0), 0) < 40,
    clear() { strokes = []; redraw(); container.dispatchEvent(new Event("change")); },
    // Export at 1x on white so the stored image stays small and prints cleanly.
    toDataURL() {
      const r = canvas.getBoundingClientRect();
      const out = document.createElement("canvas");
      out.width = Math.round(r.width); out.height = Math.round(r.height);
      const c = out.getContext("2d");
      c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height);
      strokes.forEach((s) => drawStroke(c, s));
      return out.toDataURL("image/png");
    },
    destroy() { window.removeEventListener("resize", resize); },
  };
}
