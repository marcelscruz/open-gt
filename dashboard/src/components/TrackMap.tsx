"use client";
import { type MutableRefObject, useEffect, useRef } from "react";

interface Props {
  trackPoints: MutableRefObject<{ x: number; z: number }[]>;
  currentPos: { x: number; z: number } | null;
}

export function TrackMap({ trackPoints, currentPos }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // biome-ignore lint/style/noNonNullAssertion: canvas 2d context is always available
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width,
      h = canvas.height;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const pts = trackPoints.current;
      if (pts.length < 2) {
        ctx.fillStyle = "#737373";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for track data...", w / 2, h / 2);
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Calculate bounds
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const rangeX = maxX - minX || 1;
      const rangeZ = maxZ - minZ || 1;
      const pad = 20;
      const scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeZ);
      const offX = (w - rangeX * scale) / 2;
      const offZ = (h - rangeZ * scale) / 2;

      const toScreen = (x: number, z: number) => ({
        sx: offX + (x - minX) * scale,
        sy: offZ + (z - minZ) * scale,
      });

      // Draw track line
      ctx.beginPath();
      const first = toScreen(pts[0].x, pts[0].z);
      ctx.moveTo(first.sx, first.sy);
      for (let i = 1; i < pts.length; i++) {
        const p = toScreen(pts[i].x, pts[i].z);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.strokeStyle = "#404040";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw car position
      if (currentPos) {
        const c = toScreen(currentPos.x, currentPos.z);
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [trackPoints, currentPos]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={200}
      className="w-full h-auto rounded-md bg-muted"
    />
  );
}
