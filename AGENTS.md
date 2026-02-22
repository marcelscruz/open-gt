# Open GT — GT7 Real-Time Telemetry

> **This is a living document — keep it up to date.** Whenever you add features, change architecture, introduce new files, or make significant decisions, update this file to reflect the current state. If you notice something is outdated or missing, fix it. This is the project's single source of truth for agents.

## What Is This

Real-time telemetry dashboard for **Gran Turismo 7** on PS5. Captures UDP packets from the PS5, decrypts them (Salsa20), parses binary data, and streams it to a web dashboard via WebSocket.

Think of it as a racing engineer's screen — live speed, RPM, gears, tyre temps, lap times, fuel, track map, all updating at 30Hz. Optionally, an AI race engineer can analyze telemetry and talk to the driver in real time via voice.

## Open Source Policy

This is an open source project. All code in the repository must work for any user on any network without modification. Specifically:

- **No hardcoded IPs, paths, or usernames** — use auto-discovery, environment variables, or relative paths
- **No API keys or secrets in code** — use `.env` files (already in `.gitignore`)
- **No personal configuration committed** — launchd plists, local overrides, etc. stay local
- **Environment-specific values go in `.env`** — document them in this file or a `.env.example`

## Git Workflow

- **Feature branches + PRs to main** — no direct commits to main
- Branch naming: `feature/<name>`, `fix/<name>`, `refactor/<name>`, `docs/<name>`

## Code Standards

These rules apply to all code in this repository. Follow them strictly.

### Workspace Structure

This is a pnpm workspace monorepo with three packages:
- `@opengt/server` — Node.js telemetry server (`server/`)
- `@opengt/dashboard` — Next.js frontend (`dashboard/`)
- `@opengt/shared` — shared types, constants, and personalities (`shared/`)

Shared types and constants live in `@opengt/shared`. Never duplicate types between server and dashboard.

### Imports

- **No barrel exports** — do not create `index.ts` files that re-export from other files
- Import directly from the specific file: `import type { TelemetryData } from "@opengt/shared/types"`
- Use `import type` for type-only imports

### Style

- **Functions over classes** — use plain functions and modules unless state genuinely requires a class
- **Biome** for linting and formatting — run `pnpm check` before committing
- **Explicit over clever** — prefer readable code over terse abstractions
- **Name things clearly** — a function name should describe what it does without reading the body

### Configuration

- Protocol constants (ports, magic numbers, keys) live in `@opengt/shared/constants`
- Environment variable overrides are optional — defaults must work out of the box
- Document any new env var in `.env.example`
- **Environment variables** are loaded via Node's `--env-file=../.env` flag in the server dev script — no dotenv dependency
- On `pnpm install`, a postinstall script creates `.env` from `.env.example` if it doesn't exist

### Documentation

- **Keep `README.md` up to date** — when adding features, changing architecture, or making important decisions, update the README accordingly
- The README is the public face of the project — it should always reflect the current state

### Architecture

- Server modules are single-purpose: `udp.ts` handles networking, `telemetry.ts` handles decryption/parsing, `websocket.ts` handles Socket.IO
- Only `index.ts` wires modules together — other modules should not import from each other unless necessary
- Keep files focused and small — if a file grows past ~150 lines, consider splitting

## Quick Start

```bash
pnpm install
pnpm dev
```

That's it. Starts both the telemetry server and the dashboard. The PS5 is auto-discovered on the local network — no config needed.

- **Dashboard:** http://localhost:4500
- **Telemetry WebSocket:** ws://localhost:4401

Optional: Set `PS5_IP` in `.env` to skip auto-discovery and target a specific console.

## Architecture

```
PS5 ──UDP:33740──▶ Telemetry Server (port 4401) ──Socket.IO──▶ Dashboard (port 4500)
                          │
                   Heartbeat every 10s
                   UDP:33739 → PS5
                          │
                   Analyzer ──▶ Callout Engine ──▶ Gemini Live API (voice)
```

Two processes run via `concurrently`:
- `pnpm dev:server` — Node.js UDP listener + Socket.IO server (`server/src/index.ts`)
- `pnpm dev:dashboard` — Next.js dashboard (`dashboard/`)

## Stack

- **Runtime:** Node.js + TypeScript
- **Dashboard:** Next.js 15 + React 19 + Tailwind v4
- **Real-time:** Socket.IO v4
- **AI Voice:** Google Gemini Live API (native audio)
- **Build tools:** tsx (server), pnpm

## AI Race Engineer

The race engineer is a voice-based AI assistant that talks to the driver during races, relaying telemetry information and answering questions.

### How It Works

1. **Analyzer** (`server/src/analyzer.ts`) — Processes raw telemetry into a `TelemetrySnapshot` with derived data (lap deltas, pace trends, fuel estimates, tyre temp trends)
2. **Callout Engine** (`server/src/engineer/callouts.ts`) — Applies rules to snapshots to generate `Callout` objects (e.g. "new best lap", "fuel warning", "tyre alert") based on verbosity level and cooldown timers
3. **Gemini Session** (`server/src/engineer/gemini.ts`) — Connects to Gemini Live API with voice output. Receives callouts and context updates, sends audio responses back to the dashboard
4. **Engineer Orchestrator** (`server/src/engineer/index.ts`) — Manages session lifecycle, wires Socket.IO events to the Gemini session

### System Instruction Architecture

The system instruction sent to Gemini has two distinct layers:

1. **Base system instruction** (`BASE_SYSTEM_INSTRUCTION` in `gemini.ts`) — Always present, never overridable. Defines:
   - What the model is (race engineer on pit wall, GT7, voice radio)
   - Communication rules (1–2 sentences, racing terminology, lap time format)
   - How telemetry data arrives (`[CONTEXT UPDATE]` messages)
   - How callouts work (`[CALLOUT]` messages)
   - How to handle driver interaction

2. **Personality** (from `shared/src/personalities.ts` + user custom instructions) — Appended after the base. Defines communication style only:
   - Tone, character, energy level
   - How to deliver information (flat vs enthusiastic, formal vs casual)
   - Example callouts showing the personality's style

Custom instructions from the user are appended after the personality and take precedence for style/behavior customization.

**Important:** The base instruction must never be overridden by personalities or custom instructions. It contains the functional contract for how the model processes telemetry data.

### Personalities

Defined in `shared/src/personalities.ts`. Each personality has:
- `id` — Unique identifier used in localStorage and Socket.IO events
- `name` / `description` — Display text for the UI
- `systemPrompt` — Personality-only instructions (tone, style, examples)
- `voiceName` — Gemini voice (Charon, Puck, Aoede)

Current presets:
- **Marcus** — Calm F1 strategist, measured delivery, data-first (voice: Charon)
- **Johnny** — Enthusiastic spotter, high energy, celebratory (voice: Puck)
- **Custom** — Empty personality, user builds from scratch via custom instructions (voice: Aoede)

### Dashboard Integration

- **Settings page** (`dashboard/src/app/settings/page.tsx`) — API key management, engineer toggle, personality switcher with readonly system prompt display, custom instructions textarea
- **Floating widget** (`dashboard/src/components/engineer/EngineerSettings.tsx`) — Quick access to personality, verbosity, voice mode, and start/stop. Reads personality and custom instructions from localStorage. Disabled when no API key.
- **Overlay** (`dashboard/src/components/engineer/EngineerOverlay.tsx`) — Shows current engineer message and listening state
- **History** (`dashboard/src/components/engineer/EngineerHistory.tsx`) — Scrollable message history

Settings are persisted to localStorage (`opengt:personalityId`, `opengt:customInstructions`) and shared between the settings page and the floating widget.

### Socket.IO Events (Engineer)

| Event | Direction | Payload |
|-------|-----------|---------|
| `engineer:start` | client → server | `{ personalityId?, customPersonality?, verbosity? }` |
| `engineer:stop` | client → server | — |
| `engineer:audio` | both directions | Base64 PCM audio chunks |
| `engineer:message` | server → client | `{ text, type }` |
| `engineer:verbosity` | client → server | `{ level: 1\|2\|3 }` |
| `config:state` | server → client | `{ hasApiKey, apiKeyHint, engineerEnabled, apiKeyValid }` |
| `config:setApiKey` | client → server | `{ apiKey }` → callback `{ valid, error? }` |
| `config:testKey` | client → server | callback `{ valid, error? }` |
| `config:deleteKey` | client → server | — |

## GT7 Telemetry Protocol

- **Heartbeat:** Send `"A"` to PS5 on UDP port **33739** — PS5 responds with telemetry
- **Telemetry:** PS5 sends 296-byte encrypted packets to UDP port **33740** at 60Hz
- **Encryption:** Salsa20 — key is first 32 bytes of `"Simulator Interface Packet GT7 ver 0.0"`, IV at bytes 0x40-0x43
- **Magic number:** `0x47375330` ("G7S0") at offset 0x00 after decryption — used to verify successful decrypt
- **Important:** Only ONE listener can receive packets at a time. The PS5 responds to whoever sent the last heartbeat.

## Auto-Discovery

The server broadcasts heartbeats to all subnet broadcast addresses (calculated from network interfaces). When it receives a valid decrypted packet, it locks onto that PS5 IP and stops broadcasting. Zero config.

## Project Structure

```
shared/                     # @opengt/shared — shared types, constants, personalities
  src/
    types.ts                — All shared types (TelemetryData, TelemetrySnapshot, Callout, EngineerPersonality, etc.)
    constants.ts            — Ports, magic numbers, protocol values
    personalities.ts        — Engineer personality presets (Marcus, Johnny, Custom)
server/                     # @opengt/server — Node.js telemetry server
  src/
    index.ts                — Entry point, wires modules together
    udp.ts                  — UDP socket, broadcast discovery, heartbeat
    telemetry.ts            — Decryption, parsing, throttling
    websocket.ts            — Socket.IO server, client tracking
    analyzer.ts             — Derives TelemetrySnapshot from raw data (trends, deltas, fuel estimates)
    engineer/
      index.ts              — Engineer orchestrator, session lifecycle, Socket.IO events
      gemini.ts             — Gemini Live API session (audio in/out, system instruction, context updates)
      callouts.ts           — Rule-based callout generation from telemetry snapshots
      validate-key.ts       — Gemini API key validation
    crypto/
      salsa20.ts            — Salsa20 implementation (no deps)
dashboard/                  # @opengt/dashboard — Next.js frontend
  src/
    app/
      page.tsx              — Main dashboard (telemetry widgets + engineer UI)
      settings/page.tsx     — Settings (API key, engineer toggle, personality, custom instructions)
      layout.tsx            — Root layout
      globals.css           — Tailwind v4 theme
    components/
      ConnectionStatus.tsx  — WebSocket + PS5 connection indicators
      Speedometer.tsx       — Speed display (km/h)
      Tachometer.tsx        — RPM bar with redline
      GearIndicator.tsx     — Current + suggested gear
      PedalBars.tsx         — Throttle/brake bars (0-100%)
      TyreTemps.tsx         — Four-corner tyre temperatures
      LapTimes.tsx          — Best/last/current lap times
      FuelGauge.tsx         — Fuel level + capacity
      TrackMap.tsx          — XZ position trace (live track map)
      engineer/
        EngineerSettings.tsx — Floating widget for quick engineer controls
        EngineerOverlay.tsx  — Current message display + listening indicator
        EngineerHistory.tsx  — Scrollable message history panel
    lib/
      useTelemetry.ts       — React hook for telemetry Socket.IO connection
      useEngineer.ts        — React hook for engineer session (start/stop, audio, messages)
.env.example                — Template for environment variables
biome.json                  — Linting + formatting config
tsconfig.base.json          — Shared strict TypeScript config
pnpm-workspace.yaml         — Workspace definition
start.sh                    — Launch script (used by launchd plist)
```

## Connection Status (UI)

The dashboard shows two connection states:
1. **Top bar "Connected/Disconnected"** — WebSocket link between browser ↔ telemetry server
2. **PS5 status** — Whether the telemetry server has locked onto a PS5 (receiving valid data)

"Connected" at top does NOT mean PS5 data is flowing — it just means the dashboard can talk to the backend.

## Telemetry Data Fields

Every packet (30Hz) contains the following data:

### Motion & Position
| Field | Type | Notes |
|-------|------|-------|
| `position` | `{x, y, z}` | World coordinates — x/z for track map, y for elevation |
| `velocity` | `{x, y, z}` | Speed vector in m/s per axis |
| `rotation` | `{pitch, yaw, roll}` | Car body rotation |
| `orientationToNorth` | `number` | Compass heading |
| `angularVelocity` | `{x, y, z}` | Rotational speed (useful for spin/oversteer detection) |
| `bodyHeight` | `number` | Ride height — drops under aero load, rises on bumps |

### Engine & Drivetrain
| Field | Type | Notes |
|-------|------|-------|
| `engineRPM` | `number` | Current RPM |
| `minAlertRPM` | `number` | RPM where shift light activates |
| `maxAlertRPM` | `number` | Redline RPM |
| `boost` | `number` | Turbo boost pressure (0 if NA) |
| `currentGear` | `number` | 0=reverse, 1-8=forward gears |
| `suggestedGear` | `number` | Game's recommended gear |
| `clutch` | `number` | Clutch pedal position |
| `clutchEngagement` | `number` | How engaged the clutch is |
| `rpmFromClutchToGearbox` | `number` | RPM after clutch |
| `transmissionTopSpeed` | `number` | Theoretical top speed for current gearing |
| `gearRatios` | `number[]` | Ratios for all 8 gears |

### Inputs
| Field | Type | Notes |
|-------|------|-------|
| `throttle` | `number` | 0-100% |
| `brake` | `number` | 0-100% |

### Tyres & Suspension
| Field | Type | Notes |
|-------|------|-------|
| `tyreTemp` | `{fl, fr, rl, rr}` | Temperature per corner (celsius) |
| `wheelRPS` | `{fl, fr, rl, rr}` | Wheel rotations per second — compare corners to detect wheelspin/lockup |
| `tyreRadius` | `{fl, fr, rl, rr}` | Tyre radius per corner |
| `suspHeight` | `{fl, fr, rl, rr}` | Suspension displacement — useful for detecting kerb strikes, bottoming out |

### Fluids & Temps
| Field | Type | Notes |
|-------|------|-------|
| `fuelLevel` | `number` | Current fuel amount |
| `fuelCapacity` | `number` | Tank size |
| `oilPressure` | `number` | Engine oil pressure |
| `oilTemp` | `number` | Engine oil temperature |
| `waterTemp` | `number` | Coolant temperature |

### Race Info
| Field | Type | Notes |
|-------|------|-------|
| `lapCount` | `number` | Current lap number |
| `totalLaps` | `number` | Total laps in race (0 = time trial / free run) |
| `bestLapTime` | `number` | Best lap in ms (-1 if unset) |
| `lastLapTime` | `number` | Last completed lap in ms (-1 if unset) |
| `bestLapFormatted` | `string` | Best lap as `"MM:SS.mmm"` |
| `lastLapFormatted` | `string` | Last lap as `"MM:SS.mmm"` |
| `dayProgression` | `number` | Time of day in race (for day/night cycles) |
| `raceStartPosition` | `number` | Grid position at race start |
| `preRaceNumCars` | `number` | Number of cars in the race |
| `calcMaxSpeed` | `number` | Calculated max speed for the car |
| `carCode` | `number` | Unique car identifier |

### Status Flags (booleans)
| Field | What it means |
|-------|---------------|
| `carOnTrack` | Car is actively on track (false in menus/replay) |
| `paused` | Game is paused |
| `loading` | Loading screen or in menus |
| `inGear` | Transmission is engaged |
| `hasTurbo` | Car has forced induction |
| `revLimiter` | Currently bouncing off rev limiter |
| `handbrake` | Handbrake is engaged |
| `lightsOn` | Headlights are on |
| `asmActive` | Stability management intervening |
| `tcsActive` | Traction control intervening |

### What Can Be Derived (not in raw packets)
- **Fuel burn rate** — compare `fuelLevel` across laps to estimate laps remaining
- **Lap delta** — compare `lastLapTime` vs `bestLapTime`
- **Tyre degradation trend** — track temps over time
- **Wheelspin/lockup** — compare `wheelRPS` across driven vs non-driven wheels
- **Oversteer/understeer** — angular velocity vs steering input
- **Braking zones** — speed + brake % + position data
- **Sector splits** — subdivide track position data into sectors

## Ports

| Port  | What |
|-------|------|
| 4401  | Telemetry WebSocket server (Socket.IO) |
| 4500  | Dashboard (Next.js dev server) |
| 33739 | UDP heartbeat → PS5 |
| 33740 | UDP telemetry ← PS5 |

## Launchd (macOS)

You can optionally set up a launchd service for auto-start on boot. Use `start.sh` as the launch script — it uses a relative path so it works from any install location.

## Future Ideas

- Store telemetry sessions for post-race analysis
- LLM-powered driving performance analysis
- More engineer voices and personality presets
