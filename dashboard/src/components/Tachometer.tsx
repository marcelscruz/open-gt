"use client";
import { useEffect, useRef } from "react";

/** Lerp between two [r,g,b] colors */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const COLOR_RED: [number, number, number] = [239, 68, 68];
const COLOR_LAVENDER: [number, number, number] = [210, 170, 240];
const COLOR_LIGHT_BLUE: [number, number, number] = [100, 180, 255];

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

      // Redline zone marker
      if (minAlert > 0) {
        const redStart = startAngle + (minAlert / maxRPM) * totalArc;
        ctx.beginPath();
        ctx.arc(cx, cy, r, redStart, endAngle);
        ctx.strokeStyle = "rgba(100,180,255,0.15)";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Compute fill color based on RPM proximity to minAlert
      const inRedzone = minAlert > 0 && rpm >= minAlert;
      // Transition zone: start blending 8% of minAlert before it
      const transitionStart = minAlert * 0.92;
      const transitionRange = minAlert - transitionStart;

      let fillColor: string;
      if (inRedzone) {
        // In redzone: light blue, blink on/off
        fillColor = blinkRef.current
          ? lerpColor(COLOR_LIGHT_BLUE, COLOR_LIGHT_BLUE, 1)
          : "rgba(100,180,255,0.25)";
      } else if (minAlert > 0 && rpm > transitionStart) {
        // Transitioning: red → white → light blue
        const t = (rpm - transitionStart) / transitionRange; // 0..1
        if (t < 0.5) {
          // red → white (first half)
          fillColor = lerpColor(COLOR_RED, COLOR_LAVENDER, t * 2);
        } else {
          // white → light blue (second half)
          fillColor = lerpColor(COLOR_LAVENDER, COLOR_LIGHT_BLUE, (t - 0.5) * 2);
        }
      } else {
        // Normal: red
        fillColor = lerpColor(COLOR_RED, COLOR_RED, 1);
      }

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

      // RPM text — also blinks in redzone
      const textColor = inRedzone
        ? blinkRef.current ? "#64b4ff" : "rgba(100,180,255,0.3)"
        : "#fafafa";
      ctx.fillStyle = textColor;
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
