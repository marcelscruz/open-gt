# Project Restructure: pnpm Workspaces + Code Standards

## Goal

Restructure open-gt from a flat single-package layout into a pnpm workspace monorepo. Establish code standards for an open source project that is maintainable, well-organized, and easy for contributors to understand.

## Current State

The project is ~900 lines across a flat structure:

```
open-gt/
├── server/           # 4 files: index.ts, parser.ts, salsa20.ts, types.ts
├── app/              # Next.js 15 dashboard
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
├── package.json      # Single package.json for everything
└── start.sh
```

Problems:
- `TelemetryData` type is duplicated in `server/types.ts` and `app/src/lib/types.ts`
- `server/index.ts` handles UDP, discovery, decryption, parsing, and broadcasting in one file
- Config values (ports, magic numbers, intervals) are scattered as inline literals
- No linting or formatting tooling
- No shared TypeScript config
- No `.env.example` documenting available overrides

## Target State

```
open-gt/
├── dashboard/                  # @opengt/dashboard — Next.js 15 frontend
│   ├── src/
│   │   ├── app/                # pages, layout, globals.css
│   │   ├── components/         # UI components
│   │   └── lib/                # hooks, client utilities
│   ├── package.json
│   └── tsconfig.json
├── server/                     # @opengt/server — Node.js telemetry server
│   ├── src/
│   │   ├── index.ts            # Entry point, wires modules together
│   │   ├── udp.ts              # UDP socket, broadcast discovery, heartbeat
│   │   ├── telemetry.ts        # IV extraction, decryption, parsing, throttling
│   │   ├── websocket.ts        # Socket.IO server, client tracking
│   │   └── crypto/
│   │       └── salsa20.ts      # Salsa20 implementation (unchanged)
│   ├── package.json
│   └── tsconfig.json
├── shared/                     # @opengt/shared — shared types & constants
│   ├── src/
│   │   ├── types.ts            # TelemetryData (single source of truth)
│   │   └── constants.ts        # Ports, magic numbers, protocol values
│   ├── package.json
│   └── tsconfig.json
├── package.json                # Root workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json          # Shared strict TS config
├── biome.json                  # Linting + formatting
├── .env.example
├── .gitignore
├── start.sh
└── AGENTS.md
```

## Workspace Setup

### pnpm-workspace.yaml

```yaml
packages:
  - dashboard
  - server
  - shared
```

### Package Names

- `@opengt/dashboard` — Next.js frontend
- `@opengt/server` — Node.js telemetry server
- `@opengt/shared` — shared types and constants

### Dependency Graph

```
@opengt/dashboard  ──depends on──▶  @opengt/shared
@opengt/server     ──depends on──▶  @opengt/shared
```

Dependencies use the `workspace:` protocol:

```json
{
  "dependencies": {
    "@opengt/shared": "workspace:*"
  }
}
```

pnpm resolves these locally via symlinks. No publishing required.

### Root package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently -n server,dashboard -c blue,green \"pnpm --filter @opengt/server dev\" \"pnpm --filter @opengt/dashboard dev\"",
    "dev:server": "pnpm --filter @opengt/server dev",
    "dev:dashboard": "pnpm --filter @opengt/dashboard dev",
    "build": "pnpm --filter @opengt/dashboard build",
    "check": "biome check .",
    "format": "biome format --write ."
  }
}
```

`pnpm dev` at root still starts everything. Same developer experience as today.

## Shared Package

### shared/src/types.ts

The existing `TelemetryData` interface moves here. Both server and dashboard import from `@opengt/shared/types`. The duplicate in `app/src/lib/types.ts` is deleted.

```typescript
import type { TelemetryData } from "@opengt/shared/types";
```

### shared/src/constants.ts

All protocol values centralized:

```typescript
export const WS_PORT = 4401;
export const DASHBOARD_PORT = 4500;
export const GT7_SEND_PORT = 33739;
export const GT7_RECV_PORT = 33740;
export const BROADCAST_HZ = 30;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const MAGIC_GT7 = 0x47375330;
export const SALSA_KEY = "Simulator Interface Packet GT7 ver 0.0";
export const PACKET_SIZE = 296;
```

### No Barrel Exports

No `index.ts` barrel file. Consumers import directly from the file they need:

```typescript
import type { TelemetryData } from "@opengt/shared/types";
import { WS_PORT, MAGIC_GT7 } from "@opengt/shared/constants";
```

### shared/package.json

```json
{
  "name": "@opengt/shared",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./types": "./src/types.ts",
    "./constants": "./src/constants.ts"
  }
}
```

Exports raw TypeScript source. Consuming apps transpile it according to their own tsconfig.

## Server Module Split

The current `server/index.ts` (118 lines) splits into four files:

### server/src/index.ts — Entry Point

Wires modules together. The only file that imports from all other server modules. Keeps the startup sequence clear and readable.

Responsibilities:
- Import and initialize UDP, telemetry, and WebSocket modules
- Connect the UDP message handler to the telemetry processor
- Connect telemetry output to Socket.IO broadcasting
- Start the heartbeat loop
- Log startup info

### server/src/udp.ts — Network Layer

Responsibilities:
- Create and bind the UDP socket with broadcast enabled
- Calculate broadcast addresses from network interfaces (existing `getBroadcastAddresses` logic)
- PS5 auto-discovery: track `discoveredPS5`, lock onto IP after first valid packet
- Send heartbeat packets to PS5 targets
- Accept optional `PS5_IP` env var override

Exports:
- `createUdpSocket(port)` — creates bound UDP socket
- `getBroadcastAddresses()` — returns subnet broadcast addresses
- `startHeartbeat(socket, targets, interval)` — begins heartbeat loop

### server/src/telemetry.ts — Packet Processing

Responsibilities:
- Extract IV from bytes 0x40-0x43
- Build 8-byte nonce (XOR with 0xDEADBEAF)
- Decrypt via Salsa20
- Restore IV bytes
- Verify magic number
- Parse binary packet into `TelemetryData`
- Throttle output to 30Hz

Exports:
- `processPacket(msg)` — returns `TelemetryData | null`

### server/src/websocket.ts — WebSocket Server

Responsibilities:
- Create HTTP server and Socket.IO instance
- CORS configuration
- Client connection/disconnection logging
- Expose `emit` for broadcasting telemetry

Exports:
- `createWebSocketServer(port)` — returns Socket.IO server instance

### server/src/crypto/salsa20.ts — Encryption

Existing implementation. Moved into `crypto/` subfolder. No code changes.

## Dashboard Changes

### Rename and Move

`app/` becomes `dashboard/`. Internal structure stays the same:

```
dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ConnectionStatus.tsx
│   │   ├── Speedometer.tsx
│   │   ├── Tachometer.tsx
│   │   ├── GearIndicator.tsx
│   │   ├── PedalBars.tsx
│   │   ├── TyreTemps.tsx
│   │   ├── LapTimes.tsx
│   │   ├── FuelGauge.tsx
│   │   └── TrackMap.tsx
│   └── lib/
│       └── useTelemetry.ts
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```

### Import Changes

- Delete `dashboard/src/lib/types.ts`
- All type imports change from `./types` to `@opengt/shared/types`
- `useTelemetry.ts` import updated

## TypeScript Configuration

### tsconfig.base.json (root)

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

Each workspace extends this and adds its own `include`, `outDir`, and path mappings.

## Biome Configuration

### biome.json (root)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all"
    }
  }
}
```

Single config at root applies to all workspaces. Run `pnpm check` to lint + format.

## Environment Configuration

### .env.example

```bash
# PS5 connection (optional — auto-discovers if blank)
PS5_IP=

# Server ports (optional — defaults work out of the box)
WS_PORT=4401

# AI Race Engineer (future)
GEMINI_API_KEY=
```

The server reads env vars with fallbacks to constants from `@opengt/shared/constants`. Zero config by default, overridable when needed.

## Migration Steps

This is a restructure of existing code, not new functionality. The app should work identically before and after.

1. Create `pnpm-workspace.yaml` and `tsconfig.base.json` at root
2. Create `shared/` workspace with types and constants extracted from server
3. Create `server/` workspace — move files into `src/`, split `index.ts` into modules
4. Rename `app/` to `dashboard/` — update imports to use `@opengt/shared`
5. Update root `package.json` — workspace scripts, move shared deps
6. Install Biome, create `biome.json`, run initial format
7. Create `.env.example`
8. Update `AGENTS.md` with new structure and code standards
9. Verify `pnpm dev` starts both server and dashboard correctly
10. Verify telemetry flows from PS5 through to dashboard

## What This Does NOT Include

- Tests (will be added when AI race engineer feature lands)
- Turborepo or build caching (unnecessary at this scale)
- CI/CD pipeline (future)
- AI race engineer implementation (separate design doc)
- Race data persistence (separate design doc)
