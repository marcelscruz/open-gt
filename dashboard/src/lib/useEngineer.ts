"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type VerbosityLevel = 1 | 2 | 3;

export interface EngineerMessage {
  text: string;
  type: string;
  timestamp: number;
}

export interface EngineerSettings {
  personalityId: string;
  verbosity: VerbosityLevel;
  mode: "ptk" | "always-open";
}

export function useEngineer() {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<EngineerMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState<EngineerMessage | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null);
  const currentMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const modeRef = useRef<"ptk" | "always-open">("ptk");

  // Connect to Socket.IO for engineer events
  // biome-ignore lint/correctness/useExhaustiveDependencies: socket setup runs once on mount
  useEffect(() => {
    const socket = io("http://localhost:4401", { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("engineer:status", (status: { connected: boolean }) => {
      setIsConnected(status.connected);
    });

    socket.on("engineer:text", (msg: EngineerMessage) => {
      setMessages((prev) => [...prev, msg]);
      setCurrentMessage(msg);

      // Clear current message after 5 seconds
      if (currentMessageTimerRef.current) clearTimeout(currentMessageTimerRef.current);
      currentMessageTimerRef.current = setTimeout(() => setCurrentMessage(null), 5000);
    });

    socket.on("engineer:audio:out", async (base64Audio: string) => {
      try {
        // Ensure playback worklet is initialized
        if (!playbackNodeRef.current) {
          const ctx = new AudioContext({ sampleRate: 24000 });
          audioContextRef.current = ctx;
          await ctx.audioWorklet.addModule("/pcm-playback-processor.js");
          const node = new AudioWorkletNode(ctx, "pcm-playback-processor");
          node.connect(ctx.destination);
          playbackNodeRef.current = node;
        }

        // Decode base64 → 16-bit PCM → float32 and post to worklet
        const raw = atob(base64Audio);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

        const samples = new Int16Array(bytes.buffer);
        const floats = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

        playbackNodeRef.current.port.postMessage(floats);
      } catch (err) {
        console.error("[Engineer] Playback error:", err);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Start mic capture
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);

      // Use ScriptProcessorNode for simplicity (deprecated but widely supported)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32768)));
        }

        // Convert to base64 and send
        const bytes = new Uint8Array(pcm.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        socketRef.current?.emit("engineer:audio:in", base64);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setIsListening(true);
    } catch (err) {
      console.error("[Engineer] Mic access denied:", err);
    }
  }, []);

  // Stop mic capture
  const stopMic = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) track.stop();
      mediaStreamRef.current = null;
    }
    // Signal server that audio stream ended so Gemini flushes its buffer
    socketRef.current?.emit("engineer:audio:end");
    setIsListening(false);
  }, []);

  // Start engineer session
  const start = useCallback(
    (settings: EngineerSettings) => {
      modeRef.current = settings.mode;
      socketRef.current?.emit("engineer:start", {
        personalityId: settings.personalityId,
        verbosity: settings.verbosity,
      });

      // If always-open, start mic immediately
      if (settings.mode === "always-open") {
        startMic();
      }
    },
    [startMic],
  );

  // Stop engineer session
  const stop = useCallback(() => {
    stopMic();
    socketRef.current?.emit("engineer:stop");
    setMessages([]);
    setCurrentMessage(null);
  }, [stopMic]);

  // Set verbosity
  const setVerbosity = useCallback((level: VerbosityLevel) => {
    socketRef.current?.emit("engineer:verbosity", { level });
  }, []);

  // PTK handlers
  const ptkDown = useCallback(() => {
    if (modeRef.current === "ptk" && isConnected) {
      startMic();
    }
  }, [isConnected, startMic]);

  const ptkUp = useCallback(() => {
    if (modeRef.current === "ptk") {
      stopMic();
    }
  }, [stopMic]);

  // Keyboard handler for spacebar PTK
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat && isConnected && modeRef.current === "ptk") {
        e.preventDefault();
        ptkDown();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && isConnected && modeRef.current === "ptk") {
        e.preventDefault();
        ptkUp();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isConnected, ptkDown, ptkUp]);

  return {
    isConnected,
    isListening,
    messages,
    currentMessage,
    start,
    stop,
    setVerbosity,
    ptkDown,
    ptkUp,
  };
}
