// ── Raw telemetry from GT7 UDP packets ──────────────────────────

export interface TelemetryData {
  magic: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  orientationToNorth: number;
  angularVelocity: { x: number; y: number; z: number };
  bodyHeight: number;
  engineRPM: number;
  fuelLevel: number;
  fuelCapacity: number;
  speed: number; // km/h
  boost: number;
  oilPressure: number;
  waterTemp: number;
  oilTemp: number;
  tyreTemp: { fl: number; fr: number; rl: number; rr: number };
  packetId: number;
  lapCount: number;
  totalLaps: number;
  bestLapTime: number; // ms, -1 if unset
  lastLapTime: number; // ms, -1 if unset
  dayProgression: number;
  raceStartPosition: number;
  preRaceNumCars: number;
  minAlertRPM: number;
  maxAlertRPM: number;
  calcMaxSpeed: number;
  flags: number;
  currentGear: number;
  suggestedGear: number;
  throttle: number; // 0-100
  brake: number; // 0-100
  wheelRPS: { fl: number; fr: number; rl: number; rr: number };
  tyreRadius: { fl: number; fr: number; rl: number; rr: number };
  suspHeight: { fl: number; fr: number; rl: number; rr: number };
  clutch: number;
  clutchEngagement: number;
  rpmFromClutchToGearbox: number;
  transmissionTopSpeed: number;
  gearRatios: number[];
  carCode: number;
  // Derived flags
  carOnTrack: boolean;
  paused: boolean;
  loading: boolean;
  inGear: boolean;
  hasTurbo: boolean;
  revLimiter: boolean;
  handbrake: boolean;
  lightsOn: boolean;
  asmActive: boolean;
  tcsActive: boolean;
  // Formatted times
  bestLapFormatted: string;
  lastLapFormatted: string;
  currentLapTime: number; // not directly available, calculated from dayProgression
}

// ── Processed telemetry snapshot & trends ───────────────────────

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

// ── Race engineer callouts ──────────────────────────────────────

export type CalloutType =
  | "fuel_low"
  | "fuel_estimate"
  | "tyre_temp_high"
  | "tyre_trend"
  | "lap_delta"
  | "lap_summary"
  | "rev_limiter"
  | "tcs_intervention"
  | "asm_intervention"
  | "race_progress"
  | "pace_summary";

export type CalloutPriority = "critical" | "normal" | "info";
export type VerbosityLevel = 1 | 2 | 3; // 1=minimal, 2=balanced, 3=full

export interface Callout {
  type: CalloutType;
  priority: CalloutPriority;
  /** Structured data for Gemini to verbalize */
  data: Record<string, unknown>;
  /** Fallback plain text if Gemini is unavailable */
  message: string;
  timestamp: number;
}

// ── Engineer personality ────────────────────────────────────────

export interface EngineerPersonality {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  voiceName: string;
  isCustom: boolean;
}
