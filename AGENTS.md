# Open GT — GT7 Real-Time Telemetry

> **Keep this file up to date.** Document new discoveries, decisions, architecture changes, and lessons learned here as the project evolves. This is the project's living knowledge base.

## What Is This

Real-time telemetry dashboard for **Gran Turismo 7** on PS5. Captures UDP packets from the PS5, decrypts them (Salsa20), parses binary data, and streams it to a web dashboard via WebSocket.

Think of it as a racing engineer's screen — live speed, RPM, gears, tyre temps, lap times, fuel, track map, all updating at 30Hz.

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
- `@opengt/shared` — shared types and constants (`shared/`)

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

Optional: `PS5_IP=192.168.x.x pnpm dev` to skip auto-discovery and target a specific IP.

## Architecture

```
PS5 ──UDP:33740──▶ Telemetry Server (port 4401) ──Socket.IO──▶ Dashboard (port 4500)
                          │
                   Heartbeat every 10s
                   UDP:33739 → PS5
```

Two processes run via `concurrently`:
- `pnpm dev:server` — Node.js UDP listener + Socket.IO server (`server/src/index.ts`)
- `pnpm dev:dashboard` — Next.js dashboard (`dashboard/`)

## Stack

- **Runtime:** Node.js + TypeScript
- **Dashboard:** Next.js 15 + React 19 + Tailwind v4
- **Real-time:** Socket.IO v4
- **Build tools:** tsx (server), pnpm

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
shared/                     # @opengt/shared — shared types & constants
  src/
    types.ts                — TelemetryData (single source of truth)
    constants.ts            — Ports, magic numbers, protocol values
server/                     # @opengt/server — Node.js telemetry server
  src/
    index.ts                — Entry point, wires modules together
    udp.ts                  — UDP socket, broadcast discovery, heartbeat
    telemetry.ts            — Decryption, parsing, throttling
    websocket.ts            — Socket.IO server, client tracking
    crypto/
      salsa20.ts            — Salsa20 implementation (no deps)
dashboard/                  # @opengt/dashboard — Next.js frontend
  src/
    app/                    — Next.js app (layout, page, globals.css)
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
    lib/
      useTelemetry.ts       — React hook for Socket.IO connection
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
- AI race engineer: voice interface for real-time telemetry insights and conversation
- LLM-powered driving performance analysis
