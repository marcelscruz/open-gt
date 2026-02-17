import crypto from "node:crypto";
import os from "node:os";

/**
 * Simple key encryption for at-rest storage.
 * Not bulletproof — but prevents accidental plaintext leaks.
 * The encryption key is derived from the machine hostname + a salt,
 * so the config file is useless if committed or copied to another machine.
 */

const ALGORITHM = "aes-256-gcm";
const SALT = "open-gt-keystore-v1";

function deriveKey(): Buffer {
  const hostname = os.hostname();
  return crypto.scryptSync(`${hostname}:${SALT}`, SALT, 32);
}

export function encryptValue(plaintext: string): string {
  if (!plaintext) return "";
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptValue(stored: string): string {
  if (!stored) return "";
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) return "";
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // Decryption failed — key was saved on a different machine or corrupted
    return "";
  }
}
