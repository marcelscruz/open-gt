export type TempTrend = "rising" | "stable" | "cooling";
export type LapTimeTrend = "improving" | "degrading" | "consistent";

export interface FourCorners<T> {
  fl: T;
  fr: T;
  rl: T;
  rr: T;
}

export interface TelemetrySnapshot {
  // Lap info
  lapCount: number;
  totalLaps: number;
  lastLapTime: number; // ms, -1 if unset
  bestLapTime: number; // ms, -1 if unset
  lapDelta: number; // ms, positive = slower than best
  lapTimeTrend: LapTimeTrend;
  recentLapTimes: number[]; // last 5

  // Fuel
  fuelLevel: number;
  fuelCapacity: number;
  fuelBurnRate: number; // per lap, 0 if not enough data or no fuel usage
  estimatedLapsRemaining: number; // Infinity if burn rate unknown or no fuel usage
  fuelUsageEnabled: boolean | null; // null = not yet determined, true = consuming fuel, false = no fuel usage

  // Tyres
  tyreTemps: FourCorners<number>;
  tyreTempTrend: FourCorners<TempTrend>;

  // Driving quality
  revLimiterPercent: number; // 0-1, frequency this lap
  tcsPercent: number; // 0-1
  asmPercent: number; // 0-1

  // Current state
  speed: number;
  topSpeedThisLap: number;
  currentGear: number;
  suggestedGear: number;
  engineRPM: number;

  // Car
  carCode: number;
  carOnTrack: boolean;

  // Timing
  sessionDurationMs: number;
  currentLapStartedAt: number; // timestamp ms
}
