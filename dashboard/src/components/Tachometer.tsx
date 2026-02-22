"use client";
import { useEffect, useRef } from "react";

const FILL_COLOR = "rgb(239,68,68)";
const FILL_COLOR_DIM = "rgba(239,68,68,0.25)";

export function Tachometer({
  rpm,
  minAlert,
  maxAlert,
}: {
  rpm: number;
  minAlert: number;
  maxAlert: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blinkRef = useRef(true);
  const rafRef = useRef<number>(0);
  const maxRPM = Math.max(maxAlert * 1.15, 9000);

  useEffect(() => {
    // Blink toggle at ~16Hz when in redline
    const interval = setInterval(() => {
      blinkRef.current = !blinkRef.current;
    }, 60);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // biome-ignore lint/style/noNonNullAssertion: canvas 2d context is always available
    const ctx = canvas.getContext("2d")!;

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      const cx = w / 2;
      const cy = h * 0.6;
      const r = Math.min(w, h) * 0.4;

      ctx.clearRect(0, 0, w, h);

      const startAngle = 0.75 * Math.PI;
      const endAngle = 2.25 * Math.PI;
      const totalArc = endAngle - startAngle;

      // Background arc
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = "#262626";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.stroke();

      // Blink fill when in redzone, solid red otherwise
      const inRedzone = minAlert > 0 && rpm >= minAlert;
      const fillColor = inRedzone && !blinkRef.current ? FILL_COLOR_DIM : FILL_COLOR;

      // RPM fill arc
      const pct = Math.min(rpm / maxRPM, 1);
      const fillAngle = startAngle + pct * totalArc;
      if (pct > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, fillAngle);
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // RPM text — always white
      ctx.fillStyle = "#fafafa";
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(rpm).toString(), cx, cy - 10);

      ctx.fillStyle = "#737373";
      ctx.font = "14px monospace";
      ctx.fillText("RPM", cx, cy + 20);
    }

    draw();

    // Keep redrawing while in redzone for blink animation
    const inRedzone = minAlert > 0 && rpm >= minAlert;
    if (inRedzone) {
      const tick = () => {
        draw();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [rpm, minAlert, maxRPM]);

  return <canvas ref={canvasRef} width={240} height={200} className="w-full h-auto" />;
}
