import { BROADCAST_HZ, MAGIC_GT7, PACKET_SIZE, SALSA_KEY } from "@opengt/shared/constants";
import type { TelemetryData } from "@opengt/shared/types";
import { salsa20Decrypt } from "./crypto/salsa20.js";

const salsaKey = Buffer.from(SALSA_KEY.slice(0, 32), "ascii");

const BROADCAST_INTERVAL = 1000 / BROADCAST_HZ;
let lastBroadcast = 0;

function formatLapTime(ms: number): string {
  if (ms < 0) return "--:--.---";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function parsePacket(buf: Buffer): TelemetryData {
  const magic = buf.readInt32LE(0x00);
  const position = { x: buf.readFloatLE(0x04), y: buf.readFloatLE(0x08), z: buf.readFloatLE(0x0c) };
  const velocity = { x: buf.readFloatLE(0x10), y: buf.readFloatLE(0x14), z: buf.readFloatLE(0x18) };
  const rotation = {
    pitch: buf.readFloatLE(0x1c),
    yaw: buf.readFloatLE(0x20),
    roll: buf.readFloatLE(0x24),
  };
  const orientationToNorth = buf.readFloatLE(0x28);
  const angularVelocity = {
    x: buf.readFloatLE(0x2c),
    y: buf.readFloatLE(0x30),
    z: buf.readFloatLE(0x34),
  };
  const bodyHeight = buf.readFloatLE(0x38);
  const engineRPM = buf.readFloatLE(0x3c);
  const fuelLevel = buf.readFloatLE(0x44);
  const fuelCapacity = buf.readFloatLE(0x48);
  const speedMs = buf.readFloatLE(0x4c);
  const boost = buf.readFloatLE(0x50);
  const oilPressure = buf.readFloatLE(0x54);
  const waterTemp = buf.readFloatLE(0x58);
  const oilTemp = buf.readFloatLE(0x5c);
  const tyreTemp = {
    fl: buf.readFloatLE(0x60),
    fr: buf.readFloatLE(0x64),
    rl: buf.readFloatLE(0x68),
    rr: buf.readFloatLE(0x6c),
  };
  const packetId = buf.readInt32LE(0x70);
  const lapCount = buf.readInt16LE(0x74);
  const totalLaps = buf.readInt16LE(0x76);
  const bestLapTime = buf.readInt32LE(0x78);
  const lastLapTime = buf.readInt32LE(0x7c);
  const dayProgression = buf.readInt32LE(0x80);
  const raceStartPosition = buf.readInt16LE(0x84);
  const preRaceNumCars = buf.readInt16LE(0x86);
  const minAlertRPM = buf.readInt16LE(0x88);
  const maxAlertRPM = buf.readInt16LE(0x8a);
  const calcMaxSpeed = buf.readInt16LE(0x8c);
  const flags = buf.readUInt16LE(0x8e);

  const gearByte = buf.readUInt8(0x90);
  const currentGear = gearByte & 0x0f;            // low nibble = current gear
  const suggestedGear = (gearByte >> 4) & 0x0f;   // high nibble = suggested gear

  const throttleRaw = buf.readUInt8(0x91);
  const brakeRaw = buf.readUInt8(0x92);

  const wheelRPS = {
    fl: buf.readFloatLE(0xa4),
    fr: buf.readFloatLE(0xa8),
    rl: buf.readFloatLE(0xac),
    rr: buf.readFloatLE(0xb0),
  };
  const tyreRadius = {
    fl: buf.readFloatLE(0xb4),
    fr: buf.readFloatLE(0xb8),
    rl: buf.readFloatLE(0xbc),
    rr: buf.readFloatLE(0xc0),
  };
  const suspHeight = {
    fl: buf.readFloatLE(0xc4),
    fr: buf.readFloatLE(0xc8),
    rl: buf.readFloatLE(0xcc),
    rr: buf.readFloatLE(0xd0),
  };

  const clutch = buf.readFloatLE(0xf4);
  const clutchEngagement = buf.readFloatLE(0xf8);
  const rpmFromClutchToGearbox = buf.readFloatLE(0xfc);
  const transmissionTopSpeed = buf.readFloatLE(0x100);

  const gearRatios: number[] = [];
  for (let i = 0; i < 8; i++) gearRatios.push(buf.readFloatLE(0x104 + i * 4));

  const carCode = buf.readInt32LE(0x124);

  return {
    magic,
    position,
    velocity,
    rotation,
    orientationToNorth,
    angularVelocity,
    bodyHeight,
    engineRPM,
    fuelLevel,
    fuelCapacity,
    speed: speedMs * 3.6,
    boost,
    oilPressure,
    waterTemp,
    oilTemp,
    tyreTemp,
    packetId,
    lapCount,
    totalLaps,
    bestLapTime,
    lastLapTime,
    dayProgression,
    raceStartPosition,
    preRaceNumCars,
    minAlertRPM,
    maxAlertRPM,
    calcMaxSpeed,
    flags,
    currentGear,
    suggestedGear,
    throttle: Math.round((throttleRaw / 255) * 100),
    brake: Math.round((brakeRaw / 255) * 100),
    wheelRPS,
    tyreRadius,
    suspHeight,
    clutch,
    clutchEngagement,
    rpmFromClutchToGearbox,
    transmissionTopSpeed,
    gearRatios,
    carCode,
    carOnTrack: !!(flags & 1),
    paused: !!(flags & 2),
    loading: !!(flags & 4),
    inGear: !!(flags & 8),
    hasTurbo: !!(flags & 16),
    revLimiter: !!(flags & 32),
    handbrake: !!(flags & 64),
    lightsOn: !!(flags & 128),
    asmActive: !!(flags & 1024),
    tcsActive: !!(flags & 2048),
    bestLapFormatted: formatLapTime(bestLapTime),
    lastLapFormatted: formatLapTime(lastLapTime),
    currentLapTime: -1,
  };
}

/** Process a raw UDP packet: decrypt, verify, parse. Returns null if invalid. */
export function processPacket(msg: Buffer): TelemetryData | null {
  if (msg.length < PACKET_SIZE) return null;

  // Extract IV from bytes 0x40-0x43 and build 8-byte nonce
  const iv1 = msg.readUInt32LE(0x40);
  const iv2 = (iv1 ^ 0xdeadbeaf) >>> 0;
  const iv = Buffer.alloc(8);
  iv.writeUInt32LE(iv2, 0);
  iv.writeUInt32LE(iv1, 4);

  // Decrypt
  const decrypted = salsa20Decrypt(msg, salsaKey, iv);

  // Restore IV bytes (they weren't encrypted)
  msg.copy(decrypted, 0x40, 0x40, 0x44);

  // Verify magic
  const magic = decrypted.readInt32LE(0);
  if (magic !== MAGIC_GT7) return null;

  return parsePacket(decrypted);
}

/** Returns true if enough time has passed since last broadcast (30Hz throttle) */
export function shouldBroadcast(): boolean {
  const now = Date.now();
  if (now - lastBroadcast >= BROADCAST_INTERVAL) {
    lastBroadcast = now;
    return true;
  }
  return false;
}
