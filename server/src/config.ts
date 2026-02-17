import fs from "node:fs";
import path from "node:path";
import { decryptValue, encryptValue } from "./keystore.js";

export interface AppConfig {
  geminiApiKey: string;
  engineerEnabled: boolean;
}

interface StoredConfig {
  geminiApiKeyEncrypted: string;
  engineerEnabled: boolean;
}

const DEFAULT_STORED: StoredConfig = {
  geminiApiKeyEncrypted: "",
  engineerEnabled: false,
};

let configPath: string;
let current: AppConfig;

function load(): AppConfig {
  if (fs.existsSync(configPath)) {
    try {
      const raw: StoredConfig = {
        ...DEFAULT_STORED,
        ...JSON.parse(fs.readFileSync(configPath, "utf-8")),
      };
      return {
        geminiApiKey: decryptValue(raw.geminiApiKeyEncrypted),
        engineerEnabled: raw.engineerEnabled,
      };
    } catch {
      return { geminiApiKey: "", engineerEnabled: false };
    }
  }
  return { geminiApiKey: "", engineerEnabled: false };
}

function save(config: AppConfig): void {
  const stored: StoredConfig = {
    geminiApiKeyEncrypted: encryptValue(config.geminiApiKey),
    engineerEnabled: config.engineerEnabled,
  };
  fs.writeFileSync(configPath, JSON.stringify(stored, null, 2));
}

export function initConfig(dataDir: string): AppConfig {
  configPath = path.join(dataDir, "config.json");
  fs.mkdirSync(dataDir, { recursive: true });

  current = load();

  // Env var overrides file config (for backwards compat / CI)
  if (process.env.GEMINI_API_KEY) {
    current.geminiApiKey = process.env.GEMINI_API_KEY;
    current.engineerEnabled = true;
  }

  return current;
}

export function getConfig(): AppConfig {
  return current;
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  current = { ...current, ...patch };
  save(current);
  return current;
}

export function deleteApiKey(): AppConfig {
  current = { ...current, geminiApiKey: "", engineerEnabled: false };
  save(current);
  return current;
}
