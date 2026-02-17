import type { Callout, VerbosityLevel } from "@opengt/shared/callout-types";
import type { TelemetrySnapshot } from "@opengt/shared/engineer-types";
import type { EngineerPersonality } from "@opengt/shared/personalities";
import { PERSONALITIES } from "@opengt/shared/personalities";
import type { Server } from "socket.io";
import { createGeminiSession, type GeminiSession } from "./gemini.js";

export interface EngineerConfig {
  apiKey: string;
}

interface ActiveSession {
  socketId: string;
  gemini: GeminiSession;
  contextInterval: NodeJS.Timeout;
}

export interface Engineer {
  /** Start a session for a specific client. */
  startSession(
    socketId: string,
    personality: EngineerPersonality,
    verbosity: VerbosityLevel,
  ): Promise<void>;
  /** Stop a session. */
  stopSession(socketId: string): void;
  /** Deliver callouts through the active session. */
  deliverCallouts(callouts: Callout[]): void;
  /** Update context with latest snapshot. */
  updateContext(snapshot: TelemetrySnapshot): void;
  /** Whether there's an active session. */
  readonly hasActiveSession: boolean;
}

const CONTEXT_UPDATE_INTERVAL_MS = 5_000;

export function createEngineer(io: Server, config: EngineerConfig): Engineer {
  let activeSession: ActiveSession | null = null;

  function getSocket(socketId: string) {
    return io.sockets.sockets.get(socketId);
  }

  async function startSession(
    socketId: string,
    personality: EngineerPersonality,
    _verbosity: VerbosityLevel,
  ): Promise<void> {
    // Only one session at a time
    if (activeSession) {
      stopSession(activeSession.socketId);
    }

    const socket = getSocket(socketId);
    if (!socket) {
      console.error("[Engineer] Socket not found:", socketId);
      return;
    }

    console.log(
      `[Engineer] Starting session for ${socketId} with personality "${personality.name}"`,
    );

    const gemini = createGeminiSession({
      apiKey: config.apiKey,
      personality,
      onAudio: (base64Audio) => {
        socket.emit("engineer:audio:out", base64Audio);
      },
      onText: (text, type) => {
        socket.emit("engineer:text", { text, type, timestamp: Date.now() });
      },
      onError: (error) => {
        socket.emit("engineer:error", { message: error.message });
      },
    });

    await gemini.connect();

    const contextInterval = setInterval(() => {
      // Context is updated by the main loop calling updateContext
    }, CONTEXT_UPDATE_INTERVAL_MS);

    activeSession = { socketId, gemini, contextInterval };

    socket.emit("engineer:status", {
      connected: true,
      personality: personality.id,
    });

    // Handle audio from client
    socket.on("engineer:audio:in", (base64Audio: string) => {
      gemini.sendAudio(base64Audio);
    });

    socket.on("engineer:audio:end", () => {
      gemini.endAudioStream();
    });

    // Handle disconnect
    socket.once("disconnect", () => {
      stopSession(socketId);
    });
  }

  function stopSession(socketId: string): void {
    if (!activeSession || activeSession.socketId !== socketId) return;

    console.log(`[Engineer] Stopping session for ${socketId}`);

    clearInterval(activeSession.contextInterval);
    activeSession.gemini.disconnect();

    const socket = getSocket(socketId);
    if (socket) {
      socket.removeAllListeners("engineer:audio:in");
      socket.emit("engineer:status", { connected: false });
    }

    activeSession = null;
  }

  function deliverCallouts(callouts: Callout[]): void {
    if (!activeSession) return;

    for (const callout of callouts) {
      activeSession.gemini.sendCallout(callout);
    }
  }

  function updateContext(snapshot: TelemetrySnapshot): void {
    if (!activeSession) return;
    activeSession.gemini.updateContext(snapshot);
  }

  // Set up Socket.IO event handlers for engineer control
  io.on("connection", (socket) => {
    socket.on(
      "engineer:start",
      async (params: {
        personalityId?: string;
        customPersonality?: EngineerPersonality;
        verbosity?: VerbosityLevel;
      }) => {
        const personality =
          params.customPersonality ??
          PERSONALITIES.find((p) => p.id === params.personalityId) ??
          PERSONALITIES[0];
        const verbosity = params.verbosity ?? 2;

        await startSession(socket.id, personality, verbosity);
      },
    );

    socket.on("engineer:stop", () => {
      stopSession(socket.id);
    });

    socket.on("engineer:verbosity", (params: { level: VerbosityLevel }) => {
      // Verbosity is handled by the callout engine, emit event for orchestration
      io.emit("engineer:verbosity:change", params);
    });
  });

  return {
    startSession,
    stopSession,
    deliverCallouts,
    updateContext,
    get hasActiveSession() {
      return activeSession !== null;
    },
  };
}
