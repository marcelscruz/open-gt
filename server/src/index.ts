import path from "node:path";
import { HEARTBEAT_INTERVAL_MS, WS_PORT } from "@opengt/shared/constants";
import { createTelemetryAnalyzer } from "./analyzer.js";
import { deleteApiKey, getConfig, initConfig, updateConfig } from "./config.js";
import { createCalloutEngine } from "./engineer/callouts.js";
import { createEngineer, type Engineer } from "./engineer/index.js";
import { validateGeminiKey } from "./engineer/validate-key.js";
import { createTelemetryLogger } from "./logger.js";
import { processPacket, shouldBroadcast } from "./telemetry.js";
import { createUdpSocket, getBroadcastAddresses, startHeartbeat } from "./udp.js";
import { createWebSocketServer } from "./websocket.js";

function maskKey(key: string): string {
  if (!key || key.length < 8) return "";
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 7, 16))}${key.slice(-3)}`;
}

// If PS5_IP is explicitly set, use that; otherwise auto-discover via broadcast
const explicitIP = process.env.PS5_IP;
let ps5Targets = explicitIP ? [explicitIP] : getBroadcastAddresses();
let discoveredPS5: string | null = null;

console.log(
  `[GT7] ${explicitIP ? `Using explicit PS5 IP: ${explicitIP}` : `Auto-discovery via broadcast: ${ps5Targets.join(", ")}`}`,
);

// Config + data
const dataDir = path.join(process.cwd(), "data");
initConfig(dataDir);
const logger = createTelemetryLogger(path.join(dataDir, "sessions"));
const analyzer = createTelemetryAnalyzer();
const calloutEngine = createCalloutEngine();

// Socket.IO server
const io = createWebSocketServer(WS_PORT);

// Engineer — created dynamically when API key is available and enabled
let engineer: Engineer | null = null;

function initEngineer(): void {
  const cfg = getConfig();
  if (cfg.geminiApiKey && cfg.engineerEnabled) {
    engineer = createEngineer(io, { apiKey: cfg.geminiApiKey });
    console.log("[GT7] 🎙️ AI Race Engineer enabled");
  } else {
    engineer = null;
    console.log("[GT7] AI Race Engineer disabled");
  }
}

initEngineer();

// Settings + config Socket.IO events
io.on("connection", (socket) => {
  // Send current config on connect
  const cfg = getConfig();
  socket.emit("config:state", {
    apiKeyHint: maskKey(cfg.geminiApiKey),
    hasApiKey: cfg.geminiApiKey.length > 0,
    engineerEnabled: cfg.engineerEnabled,
    apiKeyValid: null,
  });

  // Save API key
  socket.on(
    "config:setApiKey",
    async (
      params: { apiKey: string },
      callback?: (result: { valid: boolean; error?: string }) => void,
    ) => {
      const result = await validateGeminiKey(params.apiKey);
      if (result.valid) {
        updateConfig({ geminiApiKey: params.apiKey });
        initEngineer();
      }
      // Broadcast updated state to all clients
      const updated = getConfig();
      io.emit("config:state", {
        apiKeyHint: maskKey(updated.geminiApiKey),
        hasApiKey: updated.geminiApiKey.length > 0,
        engineerEnabled: updated.engineerEnabled,
        apiKeyValid: result.valid,
      });
      callback?.(result);
    },
  );

  // Test existing key
  socket.on(
    "config:testKey",
    async (callback?: (result: { valid: boolean; error?: string }) => void) => {
      const cfg = getConfig();
      const result = await validateGeminiKey(cfg.geminiApiKey);
      io.emit("config:state", {
        apiKeyHint: maskKey(cfg.geminiApiKey),
        hasApiKey: cfg.geminiApiKey.length > 0,
        engineerEnabled: cfg.engineerEnabled,
        apiKeyValid: result.valid,
      });
      callback?.(result);
    },
  );

  // Delete API key
  socket.on("config:deleteKey", () => {
    deleteApiKey();
    engineer = null;
    console.log("[GT7] API key deleted, engineer disabled");
    io.emit("config:state", { apiKeyHint: "", hasApiKey: false, engineerEnabled: false, apiKeyValid: null });
  });

  // Toggle engineer on/off
  socket.on("config:setEngineerEnabled", (params: { enabled: boolean }) => {
    updateConfig({ engineerEnabled: params.enabled });
    initEngineer();
    const updated = getConfig();
    io.emit("config:state", {
      apiKeyHint: maskKey(updated.geminiApiKey),
      hasApiKey: updated.geminiApiKey.length > 0,
      engineerEnabled: updated.engineerEnabled,
      apiKeyValid: null,
    });
  });

  // Verbosity
  socket.on("engineer:verbosity", (params: { level: 1 | 2 | 3 }) => {
    calloutEngine.setVerbosity(params.level);
    console.log(`[Engineer] Verbosity set to ${params.level}`);
  });
});

// UDP socket — process incoming telemetry packets
const udp = createUdpSocket((msg, rinfo) => {
  const telemetry = processPacket(msg);
  if (!telemetry) return;

  // Log and analyze every valid packet
  logger.onPacket(telemetry);
  analyzer.onPacket(telemetry);

  // Auto-discover: lock onto the PS5's IP once we get valid data
  if (!discoveredPS5 && !explicitIP) {
    discoveredPS5 = rinfo.address;
    ps5Targets = [discoveredPS5];
    console.log(`[GT7] 🎮 PS5 discovered at ${discoveredPS5}`);
  }

  // Throttle broadcast to ~30Hz
  if (shouldBroadcast()) {
    io.emit("telemetry", telemetry);
  }
});

// Emit telemetry snapshot every second + evaluate periodic callouts
let contextUpdateCounter = 0;
setInterval(() => {
  const snapshot = analyzer.getSnapshot();
  if (snapshot.carOnTrack) {
    io.emit("telemetry:snapshot", snapshot);

    // Evaluate periodic callout rules
    const callouts = calloutEngine.evaluate(snapshot);
    if (callouts.length > 0) {
      for (const callout of callouts) {
        console.log(`[Engineer] ${callout.type}: ${callout.message}`);
      }

      if (engineer?.hasActiveSession) {
        engineer.deliverCallouts(callouts);
      } else {
        for (const callout of callouts) {
          io.emit("engineer:text", {
            text: callout.message,
            type: callout.type,
            timestamp: callout.timestamp,
          });
        }
      }
    }

    // Update Gemini context every 5 seconds
    contextUpdateCounter++;
    if (engineer?.hasActiveSession && contextUpdateCounter >= 5) {
      engineer.updateContext(snapshot);
      contextUpdateCounter = 0;
    }
  }
}, 1000);

// Evaluate lap-complete callout rules when a new lap starts
analyzer.onLapChange(() => {
  const snapshot = analyzer.getSnapshot();
  const callouts = calloutEngine.onLapComplete(snapshot);

  if (callouts.length > 0) {
    for (const callout of callouts) {
      console.log(`[Engineer] ${callout.type}: ${callout.message}`);
    }

    if (engineer?.hasActiveSession) {
      engineer.deliverCallouts(callouts);
    } else {
      for (const callout of callouts) {
        io.emit("engineer:text", {
          text: callout.message,
          type: callout.type,
          timestamp: callout.timestamp,
        });
      }
    }
  }
});

// Send heartbeat to PS5 targets
startHeartbeat(udp, () => ps5Targets, HEARTBEAT_INTERVAL_MS);

console.log(
  `[GT7] Targets: ${ps5Targets.join(", ")}${discoveredPS5 ? ` (discovered: ${discoveredPS5})` : " (auto-discovery mode)"}`,
);

// Graceful shutdown
process.on("SIGINT", () => {
  logger.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  logger.close();
  process.exit(0);
});
