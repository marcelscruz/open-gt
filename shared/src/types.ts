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
