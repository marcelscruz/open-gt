import fs from "node:fs";
import path from "node:path";
import type { TelemetryData } from "@opengt/shared/types";

interface SessionMeta {
  startedAt: string;
  endedAt: string | null;
  carCode: number;
  totalLaps: number;
  bestLapTime: number;
  packets: number;
}

export interface TelemetryLogger {
  /** Called on every telemetry packet. Handles session start/stop internally. */
  onPacket(data: TelemetryData): void;
  /** Graceful shutdown — flush and close current session. */
  close(): void;
}

const IDLE_TIMEOUT_MS = 30_000;

export function createTelemetryLogger(dataDir: string): TelemetryLogger {
  fs.mkdirSync(dataDir, { recursive: true });

  let stream: fs.WriteStream | null = null;
  let metaPath: string | null = null;
  let meta: SessionMeta | null = null;
  let wasOnTrack = false;
  let idleTimer: NodeJS.Timeout | null = null;

  function startSession(data: TelemetryData): void {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const baseName = `${timestamp}_car-${data.carCode}`;

    const sessionPath = path.join(dataDir, `${baseName}.ndjson`);
    metaPath = path.join(dataDir, `${baseName}.meta.json`);

    stream = fs.createWriteStream(sessionPath, { flags: "a" });
    meta = {
      startedAt: now.toISOString(),
      endedAt: null,
      carCode: data.carCode,
      totalLaps: data.totalLaps,
      bestLapTime: data.bestLapTime,
      packets: 0,
    };

    console.log(`[Logger] Session started: ${baseName}`);
  }

  function endSession(): void {
    if (!stream || !meta || !metaPath) return;

    meta.endedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    stream.end();
    console.log(`[Logger] Session ended: ${meta.packets} packets logged`);

    stream = null;
    meta = null;
    metaPath = null;
  }

  function resetIdleTimer(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.log(`[Logger] No data for ${IDLE_TIMEOUT_MS / 1000}s — ending session`);
      endSession();
      wasOnTrack = false;
    }, IDLE_TIMEOUT_MS);
  }

  function onPacket(data: TelemetryData): void {
    const onTrack = data.carOnTrack;

    // Transition: off → on track
    if (onTrack && !wasOnTrack) {
      startSession(data);
    }

    // Transition: on → off track
    if (!onTrack && wasOnTrack) {
      endSession();
    }

    wasOnTrack = onTrack;

    // Write packet if we have an active session
    if (stream && onTrack) {
      const line = JSON.stringify({ timestamp: Date.now(), data });
      stream.write(`${line}\n`);

      if (meta) {
        meta.packets++;
        // Update rolling metadata
        if (data.bestLapTime > 0) meta.bestLapTime = data.bestLapTime;
        meta.totalLaps = data.totalLaps;
      }

      resetIdleTimer();
    }
  }

  function close(): void {
    if (idleTimer) clearTimeout(idleTimer);
    endSession();
  }

  return { onPacket, close };
}
