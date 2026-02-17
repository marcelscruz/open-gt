import type {
  Callout,
  CalloutPriority,
  CalloutType,
  VerbosityLevel,
} from "@opengt/shared/callout-types";
import type { TelemetrySnapshot } from "@opengt/shared/engineer-types";

interface CooldownMap {
  [key: string]: number; // callout type → last fired timestamp
}

interface CalloutRule {
  type: CalloutType;
  priority: CalloutPriority;
  /** Minimum verbosity level required for this rule to fire */
  minVerbosity: VerbosityLevel;
  /** Minimum ms between firings */
  cooldownMs: number;
  /** Evaluate whether this rule should fire */
  evaluate(snapshot: TelemetrySnapshot): {
    fire: boolean;
    data: Record<string, unknown>;
    message: string;
  };
}

export interface CalloutEngine {
  /** Called periodically (~1s) with the current snapshot. Returns callouts to deliver. */
  evaluate(snapshot: TelemetrySnapshot): Callout[];
  /** Called when a new lap starts. Returns lap-triggered callouts. */
  onLapComplete(snapshot: TelemetrySnapshot): Callout[];
  /** Update verbosity level */
  setVerbosity(level: VerbosityLevel): void;
}

function formatLapTime(ms: number): string {
  if (ms < 0) return "--:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function formatDelta(ms: number): string {
  const sign = ms >= 0 ? "+" : "-";
  const abs = Math.abs(ms);
  return `${sign}${(abs / 1000).toFixed(3)}s`;
}

// --- Periodic rules (evaluated every ~1s) ---

const periodicRules: CalloutRule[] = [
  {
    type: "fuel_low",
    priority: "critical",
    minVerbosity: 1,
    cooldownMs: 60_000,
    evaluate(s) {
      const fire = s.fuelUsageEnabled && s.estimatedLapsRemaining < 3 && s.fuelBurnRate > 0;
      return {
        fire,
        data: {
          estimatedLaps: s.estimatedLapsRemaining,
          fuelLevel: s.fuelLevel,
          fuelCapacity: s.fuelCapacity,
        },
        message: `Fuel critical — estimated ${s.estimatedLapsRemaining.toFixed(1)} laps remaining.`,
      };
    },
  },
  {
    type: "tyre_temp_high",
    priority: "critical",
    minVerbosity: 1,
    cooldownMs: 30_000,
    evaluate(s) {
      const hot: string[] = [];
      for (const [corner, temp] of Object.entries(s.tyreTemps)) {
        if (temp > 100) hot.push(`${corner.toUpperCase()} ${Math.round(temp)}°C`);
      }
      return {
        fire: hot.length > 0,
        data: { tyreTemps: s.tyreTemps, hotCorners: hot },
        message: hot.length > 0 ? `Tyres running hot: ${hot.join(", ")}.` : "",
      };
    },
  },
  {
    type: "tyre_trend",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 60_000,
    evaluate(s) {
      const rising: string[] = [];
      for (const [corner, trend] of Object.entries(s.tyreTempTrend)) {
        if (trend === "rising") rising.push(corner.toUpperCase());
      }
      return {
        fire: rising.length > 0,
        data: { tyreTempTrend: s.tyreTempTrend, risingCorners: rising },
        message:
          rising.length > 0 ? `Tyre temps rising: ${rising.join(", ")}. Manage your inputs.` : "",
      };
    },
  },
];

// --- Lap-complete rules (evaluated once per lap) ---

const lapRules: CalloutRule[] = [
  {
    type: "lap_delta",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 0, // once per lap, no additional cooldown
    evaluate(s) {
      const hasDelta = s.lastLapTime > 0 && s.bestLapTime > 0 && s.lapDelta !== 0;
      const significant = Math.abs(s.lapDelta) > 500;
      return {
        fire: hasDelta && significant,
        data: { lastLap: s.lastLapTime, bestLap: s.bestLapTime, delta: s.lapDelta },
        message: `Last lap ${formatLapTime(s.lastLapTime)}, ${formatDelta(s.lapDelta)} to your best.`,
      };
    },
  },
  {
    type: "lap_summary",
    priority: "info",
    minVerbosity: 3,
    cooldownMs: 0,
    evaluate(s) {
      return {
        fire: s.lastLapTime > 0,
        data: {
          lap: s.lapCount,
          totalLaps: s.totalLaps,
          lastLap: s.lastLapTime,
          bestLap: s.bestLapTime,
          topSpeed: s.topSpeedThisLap,
          fuelRemaining: s.estimatedLapsRemaining,
        },
        message: `Lap ${s.lapCount}${s.totalLaps > 0 ? ` of ${s.totalLaps}` : ""} complete. ${formatLapTime(s.lastLapTime)}. Top speed ${Math.round(s.topSpeedThisLap)} km/h.`,
      };
    },
  },
  {
    type: "fuel_estimate",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 0,
    evaluate(s) {
      const hasData = s.fuelUsageEnabled && s.fuelBurnRate > 0;
      return {
        fire: hasData,
        data: {
          burnRate: s.fuelBurnRate,
          estimatedLaps: s.estimatedLapsRemaining,
          fuelLevel: s.fuelLevel,
        },
        message: `Fuel for approximately ${s.estimatedLapsRemaining.toFixed(1)} laps at current pace.`,
      };
    },
  },
  {
    type: "rev_limiter",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 0,
    evaluate(s) {
      const fire = s.revLimiterPercent > 0.15;
      return {
        fire,
        data: { percent: s.revLimiterPercent },
        message: `Hitting the rev limiter ${Math.round(s.revLimiterPercent * 100)}% of this lap. Shift earlier.`,
      };
    },
  },
  {
    type: "tcs_intervention",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 0,
    evaluate(s) {
      const fire = s.tcsPercent > 0.1;
      return {
        fire,
        data: { percent: s.tcsPercent },
        message: `TCS intervening ${Math.round(s.tcsPercent * 100)}% of this lap. Ease the throttle on exit.`,
      };
    },
  },
  {
    type: "asm_intervention",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 0,
    evaluate(s) {
      const fire = s.asmPercent > 0.1;
      return {
        fire,
        data: { percent: s.asmPercent },
        message: `ASM active ${Math.round(s.asmPercent * 100)}% of this lap. Stability management is working hard.`,
      };
    },
  },
  {
    type: "race_progress",
    priority: "normal",
    minVerbosity: 2,
    cooldownMs: 0,
    evaluate(s) {
      if (s.totalLaps <= 0) return { fire: false, data: {}, message: "" };
      const remaining = s.totalLaps - s.lapCount;
      const isEveryFive = s.lapCount > 0 && s.lapCount % 5 === 0;
      const isFinalStint = remaining > 0 && remaining <= 3;
      return {
        fire: isEveryFive || isFinalStint,
        data: { lap: s.lapCount, totalLaps: s.totalLaps, remaining },
        message: isFinalStint
          ? `${remaining} lap${remaining === 1 ? "" : "s"} to go. Bring it home.`
          : `Lap ${s.lapCount} of ${s.totalLaps}. ${remaining} remaining.`,
      };
    },
  },
  {
    type: "pace_summary",
    priority: "info",
    minVerbosity: 3,
    cooldownMs: 0,
    evaluate(s) {
      const fire = s.recentLapTimes.length >= 3;
      return {
        fire,
        data: { trend: s.lapTimeTrend, recentLaps: s.recentLapTimes },
        message: `Pace is ${s.lapTimeTrend}. Last 3: ${s.recentLapTimes.slice(-3).map(formatLapTime).join(", ")}.`,
      };
    },
  },
];

const VERBOSITY_FILTER: Record<VerbosityLevel, CalloutPriority[]> = {
  1: ["critical"],
  2: ["critical", "normal"],
  3: ["critical", "normal", "info"],
};

export function createCalloutEngine(): CalloutEngine {
  let verbosity: VerbosityLevel = 2;
  const cooldowns: CooldownMap = {};

  function shouldFire(rule: CalloutRule, now: number): boolean {
    // Check verbosity
    if (rule.minVerbosity > verbosity) return false;
    if (!VERBOSITY_FILTER[verbosity].includes(rule.priority)) return false;

    // Check cooldown
    const lastFired = cooldowns[rule.type] ?? 0;
    if (rule.cooldownMs > 0 && now - lastFired < rule.cooldownMs) return false;

    return true;
  }

  function runRules(rules: CalloutRule[], snapshot: TelemetrySnapshot): Callout[] {
    const now = Date.now();
    const callouts: Callout[] = [];

    for (const rule of rules) {
      if (!shouldFire(rule, now)) continue;

      const result = rule.evaluate(snapshot);
      if (!result.fire) continue;

      cooldowns[rule.type] = now;
      callouts.push({
        type: rule.type,
        priority: rule.priority,
        data: result.data,
        message: result.message,
        timestamp: now,
      });
    }

    return callouts;
  }

  return {
    evaluate(snapshot) {
      return runRules(periodicRules, snapshot);
    },
    onLapComplete(snapshot) {
      return runRules(lapRules, snapshot);
    },
    setVerbosity(level) {
      verbosity = level;
    },
  };
}
