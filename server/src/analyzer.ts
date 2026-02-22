import type {
  FourCorners,
  LapTimeTrend,
  TelemetryData,
  TelemetrySnapshot,
  TempTrend,
} from "@opengt/shared/types";

const TEMP_WINDOW_MS = 5_000;
const TREND_THRESHOLD = 3; // °C change to count as rising/cooling

interface TempSample {
  value: number;
  timestamp: number;
}

export interface TelemetryAnalyzer {
  /** Feed every telemetry packet. */
  onPacket(data: TelemetryData): void;
  /** Current aggregated snapshot. */
  getSnapshot(): TelemetrySnapshot;
  /** Register a callback for lap changes. */
  onLapChange(callback: () => void): void;
}

export function createTelemetryAnalyzer(): TelemetryAnalyzer {
  let sessionStartedAt = 0;
  let currentLapStartedAt = 0;
  let lastLapCount = -1;

  // Lap history
  const recentLapTimes: number[] = [];
  const fuelAtLapStart: number[] = []; // fuel level at start of each lap

  // Per-lap counters
  let lapPacketCount = 0;
  let revLimiterCount = 0;
  let tcsCount = 0;
  let asmCount = 0;
  let topSpeedThisLap = 0;

  // Fuel usage detection: null = not yet determined, true/false = confirmed
  // Check at 5, 10, 15, 20, 25, 30s — give up at 30s if no consumption detected
  let fuelUsageEnabled: boolean | null = null;
  let lastFuelLevel = -1;
  let initialFuelLevel = -1;
  let nextFuelCheckIndex = 0;
  const FUEL_CHECK_TIMES_MS = [5_000, 10_000, 15_000, 20_000, 25_000, 30_000];

  // Tyre temp history (rolling window)
  const tempHistory: FourCorners<TempSample[]> = { fl: [], fr: [], rl: [], rr: [] };

  // Latest data
  let latest: TelemetryData | null = null;
  let wasOnTrack = false;
  let lapChangeCallback: (() => void) | null = null;

  // Race identity — used to detect new race vs pause/resume
  let raceCarCode = -1;
  let raceLastBestLap = -1;
  let raceLastLapCount = -1;

  /** Detect if this packet represents a new race (not just a pause/resume). */
  function isNewRace(data: TelemetryData): boolean {
    // First time we see data
    if (raceCarCode === -1) return true;

    // Different car = definitely new race
    if (data.carCode !== raceCarCode) return true;

    // Lap count reset to 0 = new race
    if (data.lapCount === 0 && raceLastLapCount > 0) return true;

    // Lap count went backwards (e.g. 4 → 1) = new race
    if (data.lapCount < raceLastLapCount - 1) return true;

    // Best lap time reset to -1 while we had one before = new race
    if (data.bestLapTime < 0 && raceLastBestLap > 0) return true;

    // Fuel went back to full while it was consumed = new race (or at least new stint)
    if (
      fuelUsageEnabled === true &&
      data.fuelLevel >= data.fuelCapacity * 0.99 &&
      lastFuelLevel > 0 &&
      lastFuelLevel < data.fuelCapacity * 0.95
    ) {
      return true;
    }

    return false;
  }

  function resetSession(): void {
    sessionStartedAt = Date.now();
    currentLapStartedAt = Date.now();
    lastLapCount = -1;
    recentLapTimes.length = 0;
    fuelAtLapStart.length = 0;
    fuelUsageEnabled = null;
    lastFuelLevel = -1;
    initialFuelLevel = -1;
    nextFuelCheckIndex = 0;
    resetLapCounters();
    for (const key of ["fl", "fr", "rl", "rr"] as const) {
      tempHistory[key].length = 0;
    }
  }

  function resetLapCounters(): void {
    lapPacketCount = 0;
    revLimiterCount = 0;
    tcsCount = 0;
    asmCount = 0;
    topSpeedThisLap = 0;
  }

  function handleLapChange(data: TelemetryData): void {
    // Record lap time if valid
    if (data.lastLapTime > 0) {
      recentLapTimes.push(data.lastLapTime);
      if (recentLapTimes.length > 5) recentLapTimes.shift();
    }

    // Record fuel at start of new lap
    fuelAtLapStart.push(data.fuelLevel);

    resetLapCounters();
    currentLapStartedAt = Date.now();
  }

  function recordTempSample(data: TelemetryData): void {
    const now = Date.now();
    const cutoff = now - TEMP_WINDOW_MS;

    for (const key of ["fl", "fr", "rl", "rr"] as const) {
      tempHistory[key].push({ value: data.tyreTemp[key], timestamp: now });
      // Prune old samples
      while (tempHistory[key].length > 0 && tempHistory[key][0].timestamp < cutoff) {
        tempHistory[key].shift();
      }
    }
  }

  function getTempTrend(samples: TempSample[]): TempTrend {
    if (samples.length < 2) return "stable";
    const first = samples[0].value;
    const last = samples[samples.length - 1].value;
    const diff = last - first;
    if (diff > TREND_THRESHOLD) return "rising";
    if (diff < -TREND_THRESHOLD) return "cooling";
    return "stable";
  }

  function calculateFuelBurnRate(): number {
    // Need at least 2 full laps of data (skip first entry which is often a partial out-lap)
    if (fuelAtLapStart.length < 3) return 0;

    // Use only full laps: from index 1 onward (index 0 is race start / partial out-lap)
    const fullLapBurns: number[] = [];
    for (let i = 2; i < fuelAtLapStart.length; i++) {
      const burn = fuelAtLapStart[i - 1] - fuelAtLapStart[i];
      if (burn > 0) fullLapBurns.push(burn);
    }
    if (fullLapBurns.length === 0) return 0;

    // Use last 3 full laps for recent accuracy
    const recent = fullLapBurns.slice(-3);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  function getLapTimeTrend(): LapTimeTrend {
    if (recentLapTimes.length < 3) return "consistent";
    const last3 = recentLapTimes.slice(-3);
    const improving = last3[1] < last3[0] && last3[2] < last3[1];
    const degrading = last3[1] > last3[0] && last3[2] > last3[1];
    if (improving) return "improving";
    if (degrading) return "degrading";
    return "consistent";
  }

  function onPacket(data: TelemetryData): void {
    latest = data;

    // New race detection (reset only on actual new race, not pause/resume)
    if (data.carOnTrack && isNewRace(data)) {
      console.log(
        `[Analyzer] New race detected: car=${data.carCode} lap=${data.lapCount} fuel=${data.fuelLevel.toFixed(1)}/${data.fuelCapacity}`,
      );
      resetSession();
      fuelAtLapStart.push(data.fuelLevel);
    } else if (data.carOnTrack && !wasOnTrack) {
      // Resuming same race after pause — just log it
      console.log(`[Analyzer] Resuming race: lap=${data.lapCount}`);
    }

    wasOnTrack = data.carOnTrack;

    if (!data.carOnTrack) return;

    // Update race identity tracking
    raceCarCode = data.carCode;
    raceLastLapCount = data.lapCount;
    if (data.bestLapTime > 0) raceLastBestLap = data.bestLapTime;

    // Record initial fuel level on first packet
    if (initialFuelLevel < 0) {
      initialFuelLevel = data.fuelLevel;
    }

    // Detect fuel usage at scheduled check times (5s, 10s, 15s, 20s, 25s, 30s)
    if (fuelUsageEnabled === null && nextFuelCheckIndex < FUEL_CHECK_TIMES_MS.length) {
      const elapsed = Date.now() - sessionStartedAt;
      if (elapsed >= FUEL_CHECK_TIMES_MS[nextFuelCheckIndex]) {
        const consumed = initialFuelLevel - data.fuelLevel;
        if (consumed > 0.01) {
          fuelUsageEnabled = true;
        } else if (nextFuelCheckIndex >= FUEL_CHECK_TIMES_MS.length - 1) {
          // Final check at 30s — no consumption detected, give up
          fuelUsageEnabled = false;
        }
        nextFuelCheckIndex++;
      }
    }
    lastFuelLevel = data.fuelLevel;

    // Lap change detection
    if (lastLapCount >= 0 && data.lapCount !== lastLapCount) {
      handleLapChange(data);
      lapChangeCallback?.();
    }
    lastLapCount = data.lapCount;

    // Per-packet accumulation
    lapPacketCount++;
    if (data.revLimiter) revLimiterCount++;
    if (data.tcsActive) tcsCount++;
    if (data.asmActive) asmCount++;
    if (data.speed > topSpeedThisLap) topSpeedThisLap = data.speed;

    recordTempSample(data);
  }

  function estimateFuelLapsRemaining(currentFuel: number, perLapBurnRate: number): number {
    // Primary: use per-lap burn rate from completed full laps
    if (perLapBurnRate > 0) {
      return currentFuel / perLapBurnRate;
    }

    // Fallback: use real-time consumption rate projected over a lap duration
    // Need: fuel consumed since session start, elapsed time, and a reference lap time
    if (initialFuelLevel > 0 && currentFuel < initialFuelLevel) {
      const consumed = initialFuelLevel - currentFuel;
      const elapsedMs = Date.now() - sessionStartedAt;
      if (elapsedMs > 5_000 && consumed > 0.01) {
        // Use best or last lap time as reference for a full lap, fallback to elapsed/lapCount
        const refLapMs = (latest?.bestLapTime ?? 0) > 0
          ? latest!.bestLapTime
          : (latest?.lastLapTime ?? 0) > 0
            ? latest!.lastLapTime
            : null;

        if (refLapMs) {
          const burnPerMs = consumed / elapsedMs;
          const burnPerLap = burnPerMs * refLapMs;
          if (burnPerLap > 0) return currentFuel / burnPerLap;
        }
      }
    }

    return Number.POSITIVE_INFINITY;
  }

  function getSnapshot(): TelemetrySnapshot {
    const d = latest;
    const burnRate = calculateFuelBurnRate();
    const safeDivide = lapPacketCount > 0 ? lapPacketCount : 1;
    const currentFuel = d?.fuelLevel ?? 0;

    return {
      lapCount: d?.lapCount ?? 0,
      totalLaps: d?.totalLaps ?? 0,
      lastLapTime: d?.lastLapTime ?? -1,
      bestLapTime: d?.bestLapTime ?? -1,
      lapDelta: d && d.lastLapTime > 0 && d.bestLapTime > 0 ? d.lastLapTime - d.bestLapTime : 0,
      lapTimeTrend: getLapTimeTrend(),
      recentLapTimes: [...recentLapTimes],

      fuelLevel: currentFuel,
      fuelCapacity: d?.fuelCapacity ?? 0,
      fuelBurnRate: fuelUsageEnabled === true ? burnRate : 0,
      estimatedLapsRemaining: fuelUsageEnabled === true
        ? estimateFuelLapsRemaining(currentFuel, burnRate)
        : Number.POSITIVE_INFINITY,
      fuelUsageEnabled,

      tyreTemps: d?.tyreTemp ?? { fl: 0, fr: 0, rl: 0, rr: 0 },
      tyreTempTrend: {
        fl: getTempTrend(tempHistory.fl),
        fr: getTempTrend(tempHistory.fr),
        rl: getTempTrend(tempHistory.rl),
        rr: getTempTrend(tempHistory.rr),
      },

      revLimiterPercent: revLimiterCount / safeDivide,
      tcsPercent: tcsCount / safeDivide,
      asmPercent: asmCount / safeDivide,

      speed: d?.speed ?? 0,
      topSpeedThisLap,
      currentGear: d?.currentGear ?? 0,
      suggestedGear: d?.suggestedGear ?? 0,
      engineRPM: d?.engineRPM ?? 0,

      carCode: d?.carCode ?? 0,
      carOnTrack: d?.carOnTrack ?? false,

      sessionDurationMs: sessionStartedAt > 0 ? Date.now() - sessionStartedAt : 0,
      currentLapStartedAt,
    };
  }

  return {
    onPacket,
    getSnapshot,
    onLapChange(callback: () => void) {
      lapChangeCallback = callback;
    },
  };
}
