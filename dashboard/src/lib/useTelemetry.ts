"use client";
import type { TelemetrySnapshot } from "@opengt/shared/engineer-types";
import type { TelemetryData } from "@opengt/shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export function useTelemetry() {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<TelemetryData | null>(null);
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const trackRef = useRef<{ x: number; z: number }[]>([]);

  useEffect(() => {
    const socket = io("http://localhost:4401", { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("telemetry", (d: TelemetryData) => {
      setData(d);
      if (d.carOnTrack && (d.position.x !== 0 || d.position.z !== 0)) {
        trackRef.current.push({ x: d.position.x, z: d.position.z });
        if (trackRef.current.length > 5000) trackRef.current.shift();
      }
    });
    socket.on("telemetry:snapshot", (s: TelemetrySnapshot) => {
      setSnapshot(s);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const resetTrack = useCallback(() => {
    trackRef.current = [];
  }, []);

  return { connected, data, snapshot, trackPoints: trackRef, resetTrack };
}
