import type { Callout } from "@opengt/shared/callout-types";
import type { TelemetrySnapshot } from "@opengt/shared/engineer-types";
import type { EngineerPersonality } from "@opengt/shared/personalities";
import { GoogleGenAI, type LiveServerMessage, Modality } from "@google/genai";

export interface GeminiSessionConfig {
  apiKey: string;
  personality: EngineerPersonality;
  onAudio: (base64Audio: string) => void;
  onText: (text: string, type: string) => void;
  onError: (error: Error) => void;
}

export interface GeminiSession {
  connect(): Promise<void>;
  sendCallout(callout: Callout): void;
  sendAudio(base64Audio: string): void;
  endAudioStream(): void;
  updateContext(snapshot: TelemetrySnapshot): void;
  disconnect(): void;
  readonly connected: boolean;
}

const BASE_SYSTEM_INSTRUCTION = `You are a race engineer communicating with a driver during a Gran Turismo 7 race.
You speak through voice radio — keep responses SHORT, CLEAR, and ACTIONABLE.
Maximum 2 sentences per response unless the driver asks for detail.
Use standard racing terminology. Lap times use MM:SS.mmm format.

When you receive a [CALLOUT], verbalize it naturally in your personality's style.
When the driver speaks to you, answer using the current telemetry context below.
If you don't have enough information to answer, say so briefly.

Current telemetry context will be updated periodically as [CONTEXT] messages.`;

export function createGeminiSession(config: GeminiSessionConfig): GeminiSession {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  // biome-ignore lint/suspicious/noExplicitAny: Live session type not fully exported
  let session: any = null;
  let isConnected = false;

  const systemInstruction = `${BASE_SYSTEM_INSTRUCTION}\n\n${config.personality.systemPrompt}`;

  async function connect(): Promise<void> {
    try {
      session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.personality.voiceName,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            isConnected = true;
            console.log("[Gemini] Live session connected");
          },
          onmessage: (message: LiveServerMessage) => {
            handleMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            console.error("[Gemini] Error:", e.message);
            config.onError(new Error(e.message));
          },
          onclose: () => {
            isConnected = false;
            console.log("[Gemini] Live session disconnected");
          },
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[Gemini] Failed to connect:", error.message);
      config.onError(error);
    }
  }

  function handleMessage(message: LiveServerMessage): void {
    // Handle audio output
    const parts = message.serverContent?.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          config.onAudio(part.inlineData.data);
        }
        if (part.text) {
          config.onText(part.text, "response");
        }
      }
    }

    // Handle output audio transcription
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      config.onText(outputTranscript, "transcript");
    }
  }

  function sendCallout(callout: Callout): void {
    if (!session || !isConnected) return;

    const text = `[CALLOUT: ${callout.type}] ${callout.message} Deliver this information in your style.`;
    session.sendClientContent({
      turns: [{ role: "user", parts: [{ text }] }],
    });
  }

  function sendAudio(base64Audio: string): void {
    if (!session || !isConnected) return;

    try {
      session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: "audio/pcm;rate=16000",
        },
      });
    } catch (err) {
      console.error("[Gemini] sendRealtimeInput error:", err);
    }
  }

  function endAudioStream(): void {
    if (!session || !isConnected) return;
    try {
      session.sendRealtimeInput({ audioStreamEnd: true });
    } catch (err) {
      console.error("[Gemini] audioStreamEnd error:", err);
    }
  }

  function updateContext(snapshot: TelemetrySnapshot): void {
    if (!session || !isConnected) return;

    const contextText = formatSnapshotForContext(snapshot);
    session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: `[CONTEXT UPDATE]\n${contextText}` }] }],
      turnComplete: false,
    });
  }

  function disconnect(): void {
    if (session) {
      session.close();
      session = null;
      isConnected = false;
    }
  }

  return {
    connect,
    sendCallout,
    sendAudio,
    endAudioStream,
    updateContext,
    disconnect,
    get connected() {
      return isConnected;
    },
  };
}

function formatSnapshotForContext(s: TelemetrySnapshot): string {
  const lines: string[] = [];
  lines.push(`Lap ${s.lapCount}${s.totalLaps > 0 ? ` of ${s.totalLaps}` : ""}`);

  if (s.bestLapTime > 0) lines.push(`Best: ${formatMs(s.bestLapTime)}`);
  if (s.lastLapTime > 0)
    lines.push(
      `Last: ${formatMs(s.lastLapTime)} (delta: ${s.lapDelta > 0 ? "+" : ""}${(s.lapDelta / 1000).toFixed(3)}s)`,
    );
  lines.push(`Pace: ${s.lapTimeTrend}`);

  lines.push(
    `Speed: ${Math.round(s.speed)} km/h | Gear: ${s.currentGear} | RPM: ${Math.round(s.engineRPM)}`,
  );

  if (s.fuelUsageEnabled) {
    if (s.fuelBurnRate > 0) {
      lines.push(
        `Fuel: ${s.fuelLevel.toFixed(1)}L / ${s.fuelCapacity.toFixed(0)}L | ~${s.estimatedLapsRemaining.toFixed(1)} laps remaining`,
      );
    } else {
      lines.push(`Fuel: ${s.fuelLevel.toFixed(1)}L / ${s.fuelCapacity.toFixed(0)}L | burn rate not yet available`);
    }
  }
  // When fuelUsageEnabled is false or not yet determined, omit fuel from context entirely

  const temps = s.tyreTemps;
  lines.push(
    `Tyres: FL ${Math.round(temps.fl)}°C FR ${Math.round(temps.fr)}°C RL ${Math.round(temps.rl)}°C RR ${Math.round(temps.rr)}°C`,
  );

  if (s.tcsPercent > 0.05) lines.push(`TCS active ${Math.round(s.tcsPercent * 100)}% this lap`);
  if (s.asmPercent > 0.05) lines.push(`ASM active ${Math.round(s.asmPercent * 100)}% this lap`);

  return lines.join("\n");
}

function formatMs(ms: number): string {
  if (ms < 0) return "--:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}
