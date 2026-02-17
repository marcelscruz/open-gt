# AI Race Engineer — Design Document

## Goal

Add a real-time AI race engineer to open-gt. The engineer listens to telemetry, proactively calls out important events via voice, and responds to driver questions. Think F1 pit wall comms — but powered by Gemini Live and GT7 telemetry data.

## Architecture Overview

```
PS5 ──UDP──▶ @opengt/server ──Socket.IO──▶ @opengt/dashboard
                │                            │
                ├── TelemetryLogger           ├── EngineerOverlay (text + history)
                │   (writes sessions to disk) │
                │                             ├── EngineerSettings (personality, verbosity)
                ├── TelemetryAnalyzer         │
                │   (aggregates + derives)    └── AudioManager (PTK / always-open mic)
                │                                      │
                ├── CalloutEngine ◀─────────────────────┘
                │   (decides what to say)              │
                │         │                            │
                │         ▼                            ▼
                └── GeminiSession ──── bidirectional audio ────▶ browser speakers
                    (Live API)         + text transcript
```

### Where Things Live

| Concern | Package | Location |
|---------|---------|----------|
| Telemetry logging | `@opengt/server` | `server/src/logger.ts` |
| Telemetry analysis/aggregation | `@opengt/server` | `server/src/analyzer.ts` |
| Callout decision engine | `@opengt/server` | `server/src/engineer/callouts.ts` |
| Gemini Live session management | `@opengt/server` | `server/src/engineer/gemini.ts` |
| Engineer orchestrator | `@opengt/server` | `server/src/engineer/index.ts` |
| Personality presets | `@opengt/shared` | `shared/src/personalities.ts` |
| Engineer types | `@opengt/shared` | `shared/src/engineer-types.ts` |
| Engineer UI (overlay, history, settings) | `@opengt/dashboard` | `dashboard/src/components/engineer/` |
| Audio management (mic, PTK) | `@opengt/dashboard` | `dashboard/src/lib/useEngineer.ts` |

No new workspace packages. The engineer is a server module with dashboard UI — it doesn't warrant its own package.

---

## 1. Telemetry Session Logging

**Priority: implement first.** This is the data foundation for everything — engineer, post-race analysis, replays.

### What to Log

Every telemetry packet received from the PS5, at the throttled 30Hz rate (same data we send to the dashboard). Full `TelemetryData` objects, no filtering.

### Storage Format

**NDJSON** (newline-delimited JSON). One line per packet. Simple, streamable, greppable, no dependencies.

```
{"timestamp":1708012345000,"data":{"speed":245.3,"engineRPM":7200,...}}
{"timestamp":1708012345033,"data":{"speed":246.1,"engineRPM":7350,...}}
```

### Session Lifecycle

A **session** starts when `carOnTrack` transitions from `false` → `true` and ends when it transitions back (or no data for 30 seconds). Each session gets its own file.

```
data/sessions/
  2026-02-15_18-30-00_car-1234_suzuka.ndjson
  2026-02-15_18-30-00_car-1234_suzuka.meta.json
```

The `.meta.json` file stores session metadata:
```json
{
  "startedAt": "2026-02-15T18:30:00.000Z",
  "endedAt": "2026-02-15T18:45:23.000Z",
  "carCode": 1234,
  "totalLaps": 10,
  "bestLapTime": 98234,
  "packets": 27156
}
```

### Implementation: `server/src/logger.ts`

```typescript
export function createTelemetryLogger(dataDir: string): TelemetryLogger;

interface TelemetryLogger {
  /** Called on every telemetry packet. Handles session start/stop internally. */
  onPacket(data: TelemetryData): void;
  /** Graceful shutdown — flush and close current session. */
  close(): void;
}
```

The logger is a pure data sink. It receives packets and writes them. No analysis, no decisions. Wired into `server/src/index.ts` alongside the existing Socket.IO emit.

### Storage Location

`data/sessions/` at the project root. Add `data/` to `.gitignore`.

---

## 2. Telemetry Analyzer

The engineer can't reason about raw 30Hz packets. It needs aggregated, derived data — lap summaries, rolling averages, trend detection.

### Implementation: `server/src/analyzer.ts`

```typescript
export function createTelemetryAnalyzer(): TelemetryAnalyzer;

interface TelemetryAnalyzer {
  /** Feed every packet. Internally tracks state. */
  onPacket(data: TelemetryData): void;
  /** Current aggregated snapshot — called by the callout engine. */
  getSnapshot(): TelemetrySnapshot;
}
```

### What It Tracks

The analyzer maintains a rolling state that resets per session (when `carOnTrack` changes):

| Derived Value | How |
|---|---|
| **Fuel burn rate** | `(fuelLevel at lap start - fuelLevel at lap end) / 1 lap`. Rolling average over last 3 laps. |
| **Estimated laps remaining** | `fuelLevel / avgBurnRate` |
| **Lap delta** | `lastLapTime - bestLapTime` (positive = slower) |
| **Lap time trend** | Last 5 lap times — improving, degrading, or consistent |
| **Tyre temp averages** | Per-corner rolling average over last 5 seconds |
| **Tyre temp trend** | Rising / stable / cooling per corner |
| **Rev limiter frequency** | Count of `revLimiter=true` packets in current lap / total packets |
| **TCS/ASM frequency** | Same approach — percentage of packets with intervention active |
| **Current lap time** | Calculated from packet timestamps since last lap change |
| **Wheelspin events** | Detect when driven wheels RPS diverge significantly from non-driven |
| **Top speed (this lap)** | Max `speed` value in current lap |

### `TelemetrySnapshot` Type

```typescript
// shared/src/engineer-types.ts
export interface TelemetrySnapshot {
  lapCount: number;
  totalLaps: number;
  lastLapTime: number;
  bestLapTime: number;
  lapDelta: number; // ms, positive = slower than best
  lapTimeTrend: "improving" | "degrading" | "consistent";
  recentLapTimes: number[]; // last 5

  fuelLevel: number;
  fuelCapacity: number;
  fuelBurnRate: number; // per lap
  estimatedLapsRemaining: number;

  tyreTemps: { fl: number; fr: number; rl: number; rr: number };
  tyreTempTrend: { fl: TempTrend; fr: TempTrend; rl: TempTrend; rr: TempTrend };

  revLimiterPercent: number; // 0-1, frequency this lap
  tcsPercent: number;
  asmPercent: number;

  speed: number;
  topSpeedThisLap: number;
  currentGear: number;
  suggestedGear: number;

  carCode: number;
  sessionDuration: number; // ms since session start
}

export type TempTrend = "rising" | "stable" | "cooling";
```

---

## 3. Callout Engine

Decides **what** to say and **when**. This is the brain of proactive comms — not Gemini. Gemini handles natural language generation and voice; the callout engine handles the decision logic.

### Why Separate from Gemini?

Gemini is expensive per-token and has latency. We don't want to stream 30Hz data to it and ask "should you say something?" Instead, the callout engine runs deterministic checks locally, and only sends a callout request to Gemini when something is worth saying.

### Implementation: `server/src/engineer/callouts.ts`

```typescript
export function createCalloutEngine(config: CalloutConfig): CalloutEngine;

interface CalloutEngine {
  /** Called periodically (every ~1s) with the current snapshot. Returns callouts to deliver. */
  evaluate(snapshot: TelemetrySnapshot): Callout[];
  /** Called when a new lap starts — opportunity for lap summary callouts. */
  onLapComplete(snapshot: TelemetrySnapshot): Callout[];
}

interface Callout {
  type: CalloutType;
  priority: "critical" | "normal" | "info";
  data: Record<string, unknown>; // context for Gemini to verbalize
  message: string; // fallback plain text if Gemini is unavailable
}

type CalloutType =
  | "fuel_low"
  | "fuel_estimate"
  | "tyre_temp_high"
  | "tyre_trend"
  | "lap_delta"
  | "lap_summary"
  | "rev_limiter"
  | "shift_suggestion"
  | "tcs_intervention"
  | "asm_intervention"
  | "race_progress"
  | "pace_summary";
```

### Callout Rules

Each callout type has a trigger condition and a cooldown (minimum time between repeats):

| Callout | Trigger | Cooldown | Verbosity |
|---|---|---|---|
| `fuel_low` | `estimatedLapsRemaining < 3` | 60s | Minimal |
| `fuel_estimate` | On lap complete | per lap | Balanced |
| `tyre_temp_high` | Any corner > 100°C avg | 30s | Minimal |
| `tyre_trend` | Any corner trend = "rising" for > 3 laps | 60s | Balanced |
| `lap_delta` | On lap complete, `|lapDelta| > 500ms` | per lap | Balanced |
| `lap_summary` | On lap complete | per lap | Full |
| `rev_limiter` | `revLimiterPercent > 0.15` at lap end | per lap | Balanced |
| `shift_suggestion` | `currentGear !== suggestedGear` sustained > 2s | 10s | Full |
| `tcs_intervention` | `tcsPercent > 0.10` at lap end | per lap | Balanced |
| `asm_intervention` | `asmPercent > 0.10` at lap end | per lap | Balanced |
| `race_progress` | Every 5 laps or last 3 laps | per trigger | Balanced |
| `pace_summary` | On lap complete | per lap | Full |

### Verbosity Filtering

The engine receives the current verbosity level and only emits callouts at or above that level:
- **Minimal**: only `critical` priority callouts
- **Balanced**: `critical` + `normal`
- **Full**: everything including `info`

---

## 4. Gemini Live Integration

### Why Gemini Live API

Gemini Live provides bidirectional real-time audio streaming — the model can listen and speak simultaneously with low latency. This is exactly what a race engineer comms channel needs. It handles:
- Speech-to-text (driver's voice)
- Natural language understanding (interpret questions in context)
- Response generation (using telemetry context)
- Text-to-speech (speak responses in selected voice)

### Session Management: `server/src/engineer/gemini.ts`

```typescript
export function createGeminiSession(config: GeminiConfig): GeminiSession;

interface GeminiConfig {
  apiKey: string;
  personality: EngineerPersonality;
  onAudio: (audioChunk: Buffer) => void; // stream to client
  onText: (text: string) => void; // transcript for UI
}

interface GeminiSession {
  /** Start the Gemini Live session. */
  connect(): Promise<void>;
  /** Send a proactive callout for the model to verbalize. */
  sendCallout(callout: Callout): void;
  /** Send driver audio (from PTK or always-open mic). */
  sendAudio(chunk: Buffer): void;
  /** Update telemetry context (called periodically, not every packet). */
  updateContext(snapshot: TelemetrySnapshot): void;
  /** Disconnect and clean up. */
  disconnect(): void;
  /** Whether the session is active. */
  readonly connected: boolean;
}
```

### System Prompt Structure

The system prompt sent to Gemini combines:

1. **Base instructions** — you are a race engineer for GT7, you receive telemetry data, respond concisely, use racing terminology
2. **Personality prompt** — from the selected personality preset
3. **Telemetry context** — updated every ~5 seconds via tool/context update, containing the current `TelemetrySnapshot` as structured text

Example system prompt (Marcus personality):
```
You are a race engineer communicating with a driver during a Gran Turismo 7 race.
You speak through voice — keep responses short, clear, and actionable.
Use standard racing terminology. Times are in minutes:seconds.milliseconds format.

Personality: You are Marcus, a calm and precise F1-style strategist. You are
data-first — always reference specific numbers. You don't get excited, you
get accurate. Your tone is measured and confident.

When you receive a callout, verbalize it naturally in your personality's style.
When the driver asks a question, answer using the current telemetry context.

Current telemetry context will be provided and updated periodically.
```

### Proactive Callouts via Gemini

When the callout engine produces a callout, it's sent to Gemini as a text message:

```
[CALLOUT: lap_delta] Driver just completed lap 7. Last lap: 1:42.350, best lap: 1:41.823.
Delta: +0.527s. Deliver this information in your style.
```

Gemini then speaks it in the selected voice and personality. The text transcript is captured and sent to the dashboard for display.

### PTK vs Always-Open

Both modes use the same `GeminiSession`. The difference is when audio is sent:

- **PTK (default)**: Dashboard captures mic audio only while spacebar is held → streams via Socket.IO to server → `session.sendAudio(chunk)`. When spacebar is released, stop streaming. Gemini sees silence and knows the driver is done talking.
- **Always-open**: Mic is continuously captured and streamed. Gemini handles turn detection natively. More natural but uses more API quota.

The mode is a dashboard-side toggle that controls when `sendAudio` is called. The server doesn't care which mode is active.

### Audio Routing

```
                    Socket.IO
Dashboard mic ──────────────▶ Server ──▶ GeminiSession.sendAudio()
                                              │
                                              ▼
                                        Gemini Live API
                                              │
                                              ▼
Dashboard speakers ◀────────────── Server ◀── GeminiSession.onAudio()
                    Socket.IO
```

Audio is streamed as binary chunks over Socket.IO. The dashboard uses the Web Audio API to capture mic input and play back engineer audio.

### Socket.IO Events (new)

| Event | Direction | Payload | Description |
|---|---|---|---|
| `engineer:start` | client → server | `{ personality, verbosity, mode }` | Start engineer session |
| `engineer:stop` | client → server | — | Stop engineer session |
| `engineer:audio:in` | client → server | `Buffer` (audio chunk) | Driver mic audio |
| `engineer:audio:out` | server → client | `Buffer` (audio chunk) | Engineer voice audio |
| `engineer:text` | server → client | `{ text, type, timestamp }` | Transcript for UI overlay/history |
| `engineer:status` | server → client | `{ connected, mode, personality }` | Session state updates |
| `engineer:verbosity` | client → server | `{ level }` | Change verbosity mid-session |

---

## 5. Personality System

### Preset Format

```typescript
// shared/src/personalities.ts
export interface EngineerPersonality {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  voiceName: string; // Gemini voice ID
  isCustom: boolean;
}

export const PERSONALITIES: EngineerPersonality[] = [
  {
    id: "marcus",
    name: "Marcus",
    description: "Calm F1 strategist. Precise, data-first, measured.",
    systemPrompt: `You are Marcus, a calm and precise F1-style race strategist...`,
    voiceName: "Kore", // deep, measured Gemini voice
    isCustom: false,
  },
  {
    id: "johnny",
    name: "Johnny",
    description: "Enthusiastic spotter. Celebrates wins, high energy.",
    systemPrompt: `You are Johnny, an enthusiastic racing spotter...`,
    voiceName: "Puck", // energetic Gemini voice
    isCustom: false,
  },
  {
    id: "data",
    name: "Data",
    description: "Pure information. Minimal personality, maximum clarity.",
    systemPrompt: `You deliver telemetry information with zero personality...`,
    voiceName: "Aoede", // neutral Gemini voice
    isCustom: false,
  },
];
```

### Custom Personalities

Custom personalities are stored in the dashboard's `localStorage`. Same shape as presets but with `isCustom: true`. The settings UI provides:
- Text field for the system prompt
- Dropdown for voice selection (populated from available Gemini voices)
- Name and description fields

Custom personalities are sent to the server on `engineer:start` — the server doesn't persist them.

---

## 6. Dashboard UI Changes

### Engineer Overlay: `dashboard/src/components/engineer/EngineerOverlay.tsx`

A semi-transparent overlay at the bottom of the dashboard showing:
- Current engineer message (large text, fades after 5 seconds)
- PTK indicator (mic icon, lights up when spacebar held)
- Engineer status (connected / personality name)

Must be **non-intrusive** — the driver glances at the dashboard, they shouldn't have to read walls of text. Messages are short and fade quickly.

### History Panel: `dashboard/src/components/engineer/EngineerHistory.tsx`

A collapsible side panel (or slide-out drawer) containing:
- Scrollable log of all engineer messages with timestamps
- Each entry shows: timestamp, callout type icon, message text
- Auto-scrolls to latest, but stops auto-scroll if user scrolls up
- Persists for the session (cleared on page reload or new session)

### Engineer Settings: `dashboard/src/components/engineer/EngineerSettings.tsx`

A settings panel (accessible via gear icon on the overlay) with:
- **Personality selector** — radio buttons for presets, option to create custom
- **Verbosity slider** — Minimal / Balanced / Full with descriptions
- **Mode toggle** — Push-to-talk / Always open
- **Start/Stop button** — begins/ends the engineer session
- **Voice test** — button that sends a test callout so user can hear the voice

### Hook: `dashboard/src/lib/useEngineer.ts`

```typescript
export function useEngineer(): {
  // State
  isConnected: boolean;
  isListening: boolean; // PTK active
  messages: EngineerMessage[];
  currentMessage: EngineerMessage | null;
  settings: EngineerSettings;

  // Actions
  start: (settings: EngineerSettings) => void;
  stop: () => void;
  setVerbosity: (level: VerbosityLevel) => void;
  ptkDown: () => void; // spacebar pressed
  ptkUp: () => void;   // spacebar released
};
```

The hook manages:
- Socket.IO event listeners for engineer events
- Web Audio API for mic capture and audio playback
- Keyboard listener for spacebar (PTK)
- Message state (current + history)

### Audio in the Browser

**Mic capture**: `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaStreamAudioSourceNode` → `AudioWorkletNode` (for chunking) → Socket.IO binary emit.

**Playback**: Incoming audio chunks → `AudioBuffer` → `AudioBufferSourceNode` → speakers. Use a playback queue to handle chunks arriving faster than they play.

---

## 7. Engineer Orchestrator

### `server/src/engineer/index.ts`

Wires the analyzer, callout engine, and Gemini session together:

```typescript
export function createEngineer(io: Server): Engineer;

interface Engineer {
  /** Start a session for a specific client. */
  startSession(socketId: string, config: EngineerSessionConfig): void;
  /** Stop a session. */
  stopSession(socketId: string): void;
  /** Feed telemetry — called on every packet. */
  onPacket(data: TelemetryData): void;
}
```

The orchestrator:
1. Receives every telemetry packet → feeds to the analyzer
2. Every ~1 second, gets a snapshot from the analyzer → feeds to the callout engine
3. Callout engine returns any triggered callouts → sends to Gemini for verbalization
4. Gemini produces audio + text → orchestrator emits via Socket.IO to the dashboard
5. Updates Gemini's telemetry context every ~5 seconds

### Single-Session Design

For v1, one engineer session at a time (one driver, one dashboard). If multiple dashboards connect, only the one that started the session gets engineer comms. This simplifies everything and matches the use case (Marcel's setup).

---

## 8. Server Integration

### Changes to `server/src/index.ts`

```typescript
import { createTelemetryLogger } from "./logger.js";
import { createEngineer } from "./engineer/index.js";

const logger = createTelemetryLogger(path.join(process.cwd(), "data/sessions"));
const engineer = createEngineer(io);

// In the UDP callback, after processPacket:
const telemetry = processPacket(msg);
if (!telemetry) return;

logger.onPacket(telemetry);       // always log
engineer.onPacket(telemetry);      // feed engineer (no-op if no active session)

if (shouldBroadcast()) {
  io.emit("telemetry", telemetry);
}
```

### New Dependencies

| Package | Where | Why |
|---|---|---|
| `@google/generative-ai` | `@opengt/server` | Gemini Live API client |

Minimize new deps. The logger uses built-in `fs`. The analyzer is pure computation. Audio encoding/decoding may need a small lib depending on Gemini's audio format requirements — evaluate at implementation time.

---

## 9. Environment & Config

### `.env.example` Addition

```bash
# AI Race Engineer
GEMINI_API_KEY=your-gemini-api-key-here
```

Already present. No changes needed.

### Runtime Config

All engineer config (personality, verbosity, mode) is sent per-session from the dashboard. No server-side config files needed beyond the API key.

---

## 10. New File Structure (Summary)

```
server/src/
  index.ts              # (modified) — wire in logger + engineer
  logger.ts             # (new) — telemetry session logging
  analyzer.ts           # (new) — telemetry aggregation + derived values
  engineer/
    index.ts            # (new) — orchestrator
    callouts.ts         # (new) — callout decision engine
    gemini.ts           # (new) — Gemini Live session management

shared/src/
  types.ts              # (existing)
  constants.ts          # (existing)
  engineer-types.ts     # (new) — TelemetrySnapshot, Callout, etc.
  personalities.ts      # (new) — personality presets

dashboard/src/
  components/
    engineer/
      EngineerOverlay.tsx   # (new) — current message display
      EngineerHistory.tsx   # (new) — message log panel
      EngineerSettings.tsx  # (new) — personality, verbosity, mode
  lib/
    useEngineer.ts          # (new) — engineer state + audio hook
    useTelemetry.ts         # (existing)

data/                       # (new, gitignored)
  sessions/                 # telemetry NDJSON logs
```

---

## 11. Implementation Phases

### Phase 1: Telemetry Logging
- Implement `logger.ts`
- Wire into `server/src/index.ts`
- Add `data/` to `.gitignore`
- Test: run a session, verify NDJSON output and meta file
- **Ship independently** — no engineer dependency

### Phase 2: Telemetry Analyzer
- Implement `analyzer.ts` with `TelemetrySnapshot`
- Add `engineer-types.ts` to shared
- Unit test derived values (fuel burn rate, lap delta, trends)
- Can emit snapshot via Socket.IO for debugging (`telemetry:snapshot` event)

### Phase 3: Callout Engine
- Implement `callouts.ts` with all callout rules
- Test with recorded session data (from Phase 1 logs)
- Verify cooldowns and verbosity filtering work correctly

### Phase 4: Gemini Integration
- Implement `gemini.ts` — session management, audio streaming
- Implement `engineer/index.ts` orchestrator
- Add `personalities.ts` to shared
- Wire into server, test with text-only first (skip audio)
- Add audio streaming, test end-to-end

### Phase 5: Dashboard UI
- Implement `useEngineer.ts` hook with audio capture/playback
- Build `EngineerOverlay.tsx`, `EngineerHistory.tsx`, `EngineerSettings.tsx`
- Integrate into dashboard layout
- PTK keyboard handling
- Test full loop: telemetry → callout → voice → display

### Phase 6: Polish
- Tune callout thresholds with real racing data
- Refine personality prompts based on how they sound
- Add voice test button
- Handle edge cases: session reconnection, Gemini errors, audio device issues
