# Open GT

Real-time telemetry dashboard for Gran Turismo 7 on PS4/PS5.

Grabs the encrypted UDP telemetry stream from your console, decrypts it (Salsa20), parses the binary data, and pipes it to a web dashboard over WebSocket at 30Hz.

![License](https://img.shields.io/badge/license-MIT-blue)

## What You'll Need

**Required:**

- **Node.js 20+** — runtime for the telemetry server and dashboard. [Download here](https://nodejs.org/)
- **pnpm 9+** — package manager used for the monorepo workspace. Install with `npm install -g pnpm` or see [pnpm.io](https://pnpm.io/installation).
- **PS4 or PS5 running Gran Turismo 7** — the console streams telemetry over your local network. Must be on the same network (same subnet) as the machine running Open GT.

**Optional:**

- **Gemini API key** — only needed for the AI race engineer voice feature. Free tier works fine. [Get one here](https://aistudio.google.com/apikey). You can enter it in the dashboard Settings page, or set `GEMINI_API_KEY` in your `.env` file.
- **Your console's IP address** — useful if auto-discovery doesn't work (e.g., different subnet, VPN, or complex network setup) or if you have multiple consoles and want to target a specific one. Set `PS5_IP` in your `.env` file.

Both environment variables go in a `.env` file at the project root. Rename `.env.example` to `.env` to get started.

## Features

- **Zero config** — auto-discovers your console on the local network
- **Real-time gauges** — speed, RPM, gear, throttle/brake, tyre temps, fuel, lap times
- **Live track map** — traces your position as you drive
- **Status flags** — TCS, ASM, rev limiter, handbrake, lights
- **AI race engineer** — voice comms powered by Gemini Live (optional)
- **Telemetry logging** — automatic session recording in NDJSON

## Quick Start

```bash
git clone https://github.com/namekworld/open-gt.git
cd open-gt
pnpm install
pnpm dev
```

Dashboard at `http://localhost:4500`, telemetry server on `ws://localhost:4401`.

Fire up a race in GT7 — the server finds your console automatically and data starts flowing.

If auto-discovery doesn't work (different subnet, VPN, etc.), point it at your console directly by adding its IP address to your `.env` file:

```bash
# .env
PS5_IP=<your console's IP address>
```

> **How to find your console's IP address:**
>
> On your PS5, go to **Settings > Network > Connection Status > View Connection Status** and use the **IPv4 Address** field (it will look something like `192.168.X.X` or `10.0.X.X`). Copy that number into the `.env` file above, replacing `<your console's IP address>`.
>
> On PS4, go to **Settings > Network > View Connection Status** and use the **IP Address** field.

## How It Works

```
PS4/PS5 ──UDP:33740──▶ Telemetry Server (:4401) ──Socket.IO──▶ Dashboard (:4500)
                              │
                       Heartbeat every 10s
                       UDP:33739 → console
```

1. Server sends a heartbeat (`"A"`) to the console on UDP 33739
2. Console responds with 296-byte encrypted packets on UDP 33740 at 60Hz
3. Server decrypts (Salsa20), parses, throttles to 30Hz, and streams to connected dashboards

The auto-discovery broadcasts heartbeats to all subnet broadcast addresses. When a valid decrypted packet comes back, it locks onto that console and stops broadcasting.

One catch: only one listener gets telemetry at a time. The console talks to whoever sent the last heartbeat.

## Architecture

pnpm workspace monorepo, three packages:

| Package             | Path         | What it does                                               |
| ------------------- | ------------ | ---------------------------------------------------------- |
| `@opengt/server`    | `server/`    | UDP listener, Salsa20 decryption, Socket.IO, race engineer |
| `@opengt/dashboard` | `dashboard/` | Next.js web dashboard with real-time gauges                |
| `@opengt/shared`    | `shared/`    | Shared TypeScript types and constants                      |

### Server

| Module                  | What it does                                   |
| ----------------------- | ---------------------------------------------- |
| `src/index.ts`          | Entry point — wires everything together        |
| `src/udp.ts`            | UDP socket, broadcast discovery, heartbeat     |
| `src/telemetry.ts`      | Decryption, binary parsing, 30Hz throttling    |
| `src/websocket.ts`      | Socket.IO server, client management            |
| `src/crypto/salsa20.ts` | Pure TypeScript Salsa20 (~80 lines, zero deps) |

### Dashboard

| Component          | Shows                          |
| ------------------ | ------------------------------ |
| `Speedometer`      | Speed (km/h) arc gauge         |
| `Tachometer`       | RPM with redline zone          |
| `GearIndicator`    | Current + suggested gear       |
| `PedalBars`        | Throttle/brake (0–100%)        |
| `TyreTemps`        | Four-corner temps, color-coded |
| `LapTimes`         | Current, best, last lap        |
| `FuelGauge`        | Level in % and liters          |
| `TrackMap`         | Live position trace            |
| `ConnectionStatus` | WebSocket + console state      |

## AI Race Engineer

Voice-based race engineer that talks to you during races. Think pit wall strategist, but AI.

**Setup:** Open Settings in the dashboard → paste your [Gemini API key](https://aistudio.google.com/apikey) → flip the switch. Key is encrypted at rest and stays on your machine.

The engineer watches your telemetry and calls out:

- Fuel burn rate, laps remaining, low fuel warnings
- Tyre temperature alerts and degradation trends
- Lap deltas and pace trends
- Rev limiter / TCS / ASM intervention rates
- Lap counts and final stint alerts

The callout logic is a local rules engine — deterministic, no LLM involved. Gemini only does the voice synthesis and natural language. Cheap, fast, predictable.

**Voice modes:** Push-to-talk (spacebar, default) or always-open mic.

**Personalities:**

| Preset | Vibe                                                     |
| ------ | -------------------------------------------------------- |
| Marcus | Calm F1 strategist — measured, data-first                |
| Johnny | Enthusiastic spotter — high energy, celebrates overtakes |
| Data   | Pure info — no personality, just numbers                 |

You can also write your own system prompt and pick a voice.

**Verbosity:** Minimal (critical alerts only), Balanced (default — useful stuff each lap), Full (everything including detailed lap summaries).

All messages show up in a slide-out history panel on the right side of the dashboard.

## Telemetry Logging

Sessions are recorded automatically to `data/sessions/` as NDJSON. A session starts when the car hits the track and ends when it leaves (or after 30s of silence).

Each session gets:

- `.ndjson` — every packet with timestamps, one JSON object per line
- `.meta.json` — summary with car code, lap count, best lap, duration, packet count

## GT7 Telemetry Protocol

GT7 sends telemetry over UDP as encrypted binary packets.

| Detail         | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Heartbeat port | UDP 33739 (send `"A"`)                                       |
| Telemetry port | UDP 33740                                                    |
| Packet size    | 296 bytes                                                    |
| Rate           | 60Hz                                                         |
| Encryption     | Salsa20                                                      |
| Key            | First 32 bytes of `"Simulator Interface Packet GT7 ver 0.0"` |
| IV             | Bytes 0x40–0x43                                              |
| Magic          | `0x47375330` ("G7S0") at offset 0x00 after decryption        |

### Packet Contents

All values are little-endian.

#### Motion & Position

| Field                | Type                 | Description                                            |
| -------------------- | -------------------- | ------------------------------------------------------ |
| `position`           | `{x, y, z}`          | World coordinates — x/z for track map, y for elevation |
| `velocity`           | `{x, y, z}`          | Speed vector in m/s per axis                           |
| `rotation`           | `{pitch, yaw, roll}` | Car body rotation                                      |
| `orientationToNorth` | `float`              | Compass heading                                        |
| `angularVelocity`    | `{x, y, z}`          | Rotational speed — useful for spin/oversteer detection |
| `bodyHeight`         | `float`              | Ride height — drops under aero load, rises on bumps    |

#### Engine & Drivetrain

| Field                    | Type       | Description                          |
| ------------------------ | ---------- | ------------------------------------ |
| `engineRPM`              | `float`    | Current RPM                          |
| `minAlertRPM`            | `int16`    | Shift light activation RPM           |
| `maxAlertRPM`            | `int16`    | Redline RPM                          |
| `boost`                  | `float`    | Turbo boost pressure (0 for NA cars) |
| `currentGear`            | `uint8`    | 0=reverse, 1–8=forward gears         |
| `suggestedGear`          | `uint8`    | Game's recommended gear              |
| `clutch`                 | `float`    | Clutch pedal position                |
| `clutchEngagement`       | `float`    | Clutch engagement level              |
| `rpmFromClutchToGearbox` | `float`    | RPM after clutch                     |
| `transmissionTopSpeed`   | `float`    | Top speed for current gearing        |
| `gearRatios`             | `float[8]` | All 8 forward gear ratios            |

#### Driver Inputs

| Field      | Type    | Description                  |
| ---------- | ------- | ---------------------------- |
| `throttle` | `uint8` | 0–255 (normalized to 0–100%) |
| `brake`    | `uint8` | 0–255 (normalized to 0–100%) |

#### Tyres & Suspension

| Field        | Type               | Description                                                |
| ------------ | ------------------ | ---------------------------------------------------------- |
| `tyreTemp`   | `{fl, fr, rl, rr}` | Temperature per corner (°C)                                |
| `wheelRPS`   | `{fl, fr, rl, rr}` | Wheel rotations/sec — compare corners for wheelspin/lockup |
| `tyreRadius` | `{fl, fr, rl, rr}` | Tyre radius per corner                                     |
| `suspHeight` | `{fl, fr, rl, rr}` | Suspension displacement — kerb strikes, bottoming out      |

#### Fluids & Temps

| Field          | Type    | Description            |
| -------------- | ------- | ---------------------- |
| `fuelLevel`    | `float` | Current fuel amount    |
| `fuelCapacity` | `float` | Tank size              |
| `oilPressure`  | `float` | Engine oil pressure    |
| `oilTemp`      | `float` | Engine oil temperature |
| `waterTemp`    | `float` | Coolant temperature    |

#### Race Info

| Field               | Type    | Description                            |
| ------------------- | ------- | -------------------------------------- |
| `lapCount`          | `int16` | Current lap number                     |
| `totalLaps`         | `int16` | Total laps (0 = time trial / free run) |
| `bestLapTime`       | `int32` | Best lap in ms (−1 if unset)           |
| `lastLapTime`       | `int32` | Last completed lap in ms (−1 if unset) |
| `dayProgression`    | `int32` | Time of day in race (day/night cycles) |
| `raceStartPosition` | `int16` | Grid position                          |
| `preRaceNumCars`    | `int16` | Number of cars                         |
| `calcMaxSpeed`      | `int16` | Calculated max speed for the car       |
| `carCode`           | `int32` | Unique car identifier                  |

#### Status Flags

| Flag         | Description                      |
| ------------ | -------------------------------- |
| `carOnTrack` | On track (false in menus/replay) |
| `paused`     | Game paused                      |
| `loading`    | Loading screen / menus           |
| `inGear`     | Transmission engaged             |
| `hasTurbo`   | Forced induction                 |
| `revLimiter` | Hitting rev limiter              |
| `handbrake`  | Handbrake on                     |
| `lightsOn`   | Headlights on                    |
| `asmActive`  | Stability management intervening |
| `tcsActive`  | Traction control intervening     |

### Derivable Data

Not in the raw packets but you can calculate:

- **Fuel burn rate** — compare `fuelLevel` across laps for estimated laps remaining
- **Lap delta** — `lastLapTime` vs `bestLapTime`
- **Tyre degradation** — temperature trends over time
- **Wheelspin/lockup** — compare `wheelRPS` across driven vs non-driven wheels
- **Oversteer/understeer** — angular velocity relative to steering input
- **Braking zones** — correlate speed, brake input, and position
- **Sector splits** — subdivide track position data into segments

## Configuration

Most things are in the dashboard Settings page. For env var overrides, copy `.env.example`:

```bash
cp .env.example .env
```

| Variable         | Default       | What it does                                            |
| ---------------- | ------------- | ------------------------------------------------------- |
| `PS5_IP`         | auto-discover | Target a specific console                               |
| `WS_PORT`        | `4401`        | WebSocket server port                                   |
| `GEMINI_API_KEY` | —             | Override the Settings-stored key (useful for CI/Docker) |

## Development

```bash
pnpm dev            # Server + dashboard
pnpm dev:server     # Server only
pnpm dev:dashboard  # Dashboard only
pnpm build          # Production build
pnpm check          # Lint + format check (Biome)
pnpm format         # Auto-format
```

## Design Decisions

**Salsa20 in pure TypeScript** — The console encrypts with Salsa20. Instead of pulling in a native crypto lib (which is a pain for cross-platform), we just implement it directly. ~80 lines, zero deps, tested against the actual protocol.

**Socket.IO over raw WebSockets** — Auto-reconnect, fallback transports, room management. For a dashboard that needs to stay connected, it's worth the dependency.

**pnpm workspaces** — Server and dashboard share types. Monorepo with `@opengt/shared` keeps one source of truth without publishing packages.

**30Hz not 60Hz** — The console sends at 60Hz but most data doesn't change frame-to-frame. 30Hz halves the bandwidth while still looking smooth. Server processes every packet internally.

## Ports

| Port  | Service                 |
| ----- | ----------------------- |
| 4500  | Dashboard               |
| 4401  | Telemetry WebSocket     |
| 33739 | UDP heartbeat → console |
| 33740 | UDP telemetry ← console |

## Roadmap

- [x] Telemetry session recording
- [x] AI race engineer with voice comms
- [ ] Post-race analysis and performance insights
- [ ] Session replay
- [ ] Custom personality creator in the UI

## License

MIT
