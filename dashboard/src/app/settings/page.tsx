"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

interface ConfigState {
  apiKeyHint: string;
  hasApiKey: boolean;
  engineerEnabled: boolean;
  apiKeyValid: boolean | null;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigState>({
    apiKeyHint: "",
    hasApiKey: false,
    engineerEnabled: false,
    apiKeyValid: null,
  });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io("http://localhost:4401", { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("config:state", (state: ConfigState) => {
      setConfig(state);
    });

    socket.on("connect", () => {
      socket.emit("config:testKey", (result: { valid: boolean; error?: string }) => {
        if (!result.valid && result.error && result.error !== "API key is empty") {
          setMessage({ text: result.error, type: "error" });
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const saveKey = useCallback(() => {
    if (!socketRef.current || !apiKey.trim()) return;
    setSaving(true);
    setMessage(null);

    socketRef.current.emit(
      "config:setApiKey",
      { apiKey: apiKey.trim() },
      (result: { valid: boolean; error?: string }) => {
        setSaving(false);
        if (result.valid) {
          setMessage(null);
          setApiKey("");
        } else {
          setMessage({ text: result.error ?? "Invalid API key", type: "error" });
        }
      },
    );
  }, [apiKey]);

  const testKey = useCallback(() => {
    if (!socketRef.current) return;
    setTesting(true);
    setMessage(null);

    socketRef.current.emit("config:testKey", (result: { valid: boolean; error?: string }) => {
      setTesting(false);
      if (!result.valid) {
        setMessage({ text: result.error ?? "Invalid API key", type: "error" });
      } else {
        setMessage(null);
      }
    });
  }, []);

  const deleteKey = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("config:deleteKey");
    setApiKey("");
    setMessage({ text: "API key deleted", type: "success" });
  }, []);

  const toggleEngineer = useCallback((enabled: boolean) => {
    socketRef.current?.emit("config:setEngineerEnabled", { enabled });
  }, []);

  return (
    <div className="min-h-screen p-4 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-lg font-bold tracking-wider text-muted-foreground uppercase">
          Settings
        </h1>
        <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition">
          ← Dashboard
        </a>
      </div>

      {/* API Key Section */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs text-muted-foreground uppercase tracking-wider">Gemini API Key</h2>
          {config.apiKeyValid === true && (
            <span className="text-accent-green text-xs">✓ Valid</span>
          )}
          {config.apiKeyValid === false && (
            <span className="text-accent-red text-xs">✗ Invalid</span>
          )}
        </div>

        {config.hasApiKey ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground font-mono">{config.apiKeyHint || "••••••••••••••••"}</span>
              <button
                type="button"
                onClick={testKey}
                disabled={testing}
                className="text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
              >
                {testing ? "Testing..." : "Test"}
              </button>
            </div>
            <button
              type="button"
              onClick={deleteKey}
              className="text-xs text-accent-red/70 hover:text-accent-red transition"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="Enter your Gemini API key..."
              className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent-blue"
            />
            <button
              type="button"
              onClick={saveKey}
              disabled={saving || !apiKey.trim()}
              className="px-4 py-2 rounded text-xs font-medium bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {message && (
          <div
            className={`mt-3 rounded px-3 py-2 text-xs ${
              message.type === "success"
                ? "bg-accent-green/10 text-accent-green border border-accent-green/20"
                : "bg-accent-red/10 text-accent-red border border-accent-red/20"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Engineer Toggle */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              AI Race Engineer
            </h2>
            <p className="text-xs text-muted-foreground/70">
              {config.hasApiKey
                ? "Enable voice engineer during races"
                : "Add an API key first to enable"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleEngineer(!config.engineerEnabled)}
            disabled={!config.hasApiKey}
            className={`w-12 h-6 rounded-full transition relative disabled:opacity-30 disabled:cursor-not-allowed ${
              config.engineerEnabled ? "bg-accent-green" : "bg-border"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-foreground transition-transform ${
                config.engineerEnabled ? "translate-x-[22px]" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Info */}
      <p className="text-xs text-muted-foreground/40 mt-4 text-center">
        Get a Gemini API key at{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-muted-foreground/60"
        >
          aistudio.google.com
        </a>
      </p>
    </div>
  );
}
