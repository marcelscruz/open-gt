"use client";
import { useEffect, useRef } from "react";

export function Speedometer({ speed, maxSpeed }: { speed: number; maxSpeed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const max = maxSpeed || 400;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // biome-ignore lint/style/noNonNullAssertion: canvas 2d context is always available
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width,
      h = canvas.height;
    const cx = w / 2,
      cy = h * 0.6;
    const r = Math.min(w, h) * 0.4;

    ctx.clearRect(0, 0, w, h);

    // Arc background
    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = "#262626";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.stroke();

    // Arc fill
    const pct = Math.min(speed / max, 1);
    const fillAngle = startAngle + pct * (endAngle - startAngle);
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, fillAngle);
    ctx.strokeStyle = pct > 0.85 ? "#ef4444" : pct > 0.6 ? "#f97316" : "#22c55e";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.stroke();

    // Speed text
    ctx.fillStyle = "#fafafa";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.round(speed).toString(), cx, cy - 10);

    ctx.fillStyle = "#737373";
    ctx.font = "14px monospace";
    ctx.fillText("km/h", cx, cy + 25);
  }, [speed, max]);

  return <canvas ref={canvasRef} width={240} height={200} className="w-full h-auto" />;
}
