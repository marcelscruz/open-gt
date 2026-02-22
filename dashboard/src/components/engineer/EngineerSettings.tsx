"use client";
import { useEffect, useState } from "react";
import type { EngineerSettings as Settings, VerbosityLevel } from "@/lib/useEngineer";

interface Props {
  isConnected: boolean;
  hasApiKey: boolean;
  onStart: (settings: Settings) => void;
  onStop: () => void;
  onVerbosityChange: (level: VerbosityLevel) => void;
}

const PERSONALITIES = [
  { id: "marcus", name: "Marcus", desc: "Calm F1 strategist" },
  { id: "johnny", name: "Johnny", desc: "Enthusiastic spotter" },
  { id: "blank", name: "Custom", desc: "Build your own" },
];

const VERBOSITY_LABELS: Record<VerbosityLevel, { name: string; desc: string }> = {
  1: { name: "Minimal", desc: "Critical alerts only" },
  2: { name: "Balanced", desc: "Useful updates each lap" },
  3: { name: "Full", desc: "Everything, every lap" },
};

const LS_PERSONALITY_KEY = "opengt:personalityId";
const LS_INSTRUCTIONS_KEY = "opengt:customInstructions";

export function EngineerSettings({ isConnected, hasApiKey, onStart, onStop, onVerbosityChange }: Props) {
  const [personalityId, setPersonalityId] = useState("marcus");
  const [verbosity, setVerbosity] = useState<VerbosityLevel>(2);
  const [mode, setMode] = useState<"ptk" | "always-open">("ptk");
  const [isOpen, setIsOpen] = useState(false);

  // Sync personality from localStorage (settings page is source of truth)
  useEffect(() => {
    const stored = localStorage.getItem(LS_PERSONALITY_KEY);
    if (stored) setPersonalityId(stored);

    function onStorage(e: StorageEvent) {
      if (e.key === LS_PERSONALITY_KEY && e.newValue) setPersonalityId(e.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function handleStart() {
    const customInstructions = localStorage.getItem(LS_INSTRUCTIONS_KEY)?.trim() || undefined;
    onStart({ personalityId, customInstructions, verbosity, mode });
  }

  function handleVerbosityChange(level: VerbosityLevel) {
    setVerbosity(level);
    if (isConnected) onVerbosityChange(level);
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-10 h-10 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground z-50"
        title="Engineer Settings"
      >
        🎙️
      </button>
    );
  }

  const canStart = hasApiKey && !isConnected;

  return (
    <div className="fixed bottom-4 right-4 w-72 bg-card border border-border rounded-lg p-4 z-50 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Race Engineer</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ✕
        </button>
      </div>

      {/* Personality */}
      <div className="mb-3">
        <span className="text-xs text-muted-foreground block mb-1.5">Personality</span>
        <div className="space-y-1">
          {PERSONALITIES.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                setPersonalityId(p.id);
                localStorage.setItem(LS_PERSONALITY_KEY, p.id);
              }}
              disabled={isConnected}
              className={`w-full text-left px-2 py-1.5 rounded text-xs transition ${
                personalityId === p.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              } ${isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="font-medium">{personalityId === p.id ? "✓ " : ""}{p.name}</span>
              <span className="text-muted-foreground/70 ml-1">— {p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Verbosity */}
      <div className="mb-3">
        <span className="text-xs text-muted-foreground block mb-1.5">Verbosity</span>
        <div className="flex gap-1">
          {([1, 2, 3] as VerbosityLevel[]).map((level) => (
            <button
              type="button"
              key={level}
              onClick={() => handleVerbosityChange(level)}
              className={`flex-1 px-2 py-1.5 rounded text-xs transition ${
                verbosity === level
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              title={VERBOSITY_LABELS[level].desc}
            >
              {VERBOSITY_LABELS[level].name}
            </button>
          ))}
        </div>
      </div>

      {/* Mode */}
      <div className="mb-4">
        <span className="text-xs text-muted-foreground block mb-1.5">Voice Mode</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("ptk")}
            disabled={isConnected}
            className={`flex-1 px-2 py-1.5 rounded text-xs transition ${
              mode === "ptk"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            } ${isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Push to Talk
          </button>
          <button
            type="button"
            onClick={() => setMode("always-open")}
            disabled={isConnected}
            className={`flex-1 px-2 py-1.5 rounded text-xs transition ${
              mode === "always-open"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            } ${isConnected ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Always Open
          </button>
        </div>
      </div>

      {/* Start/Stop */}
      {isConnected ? (
        <button
          type="button"
          onClick={onStop}
          className="w-full py-2 rounded text-xs font-medium bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition"
        >
          Stop Engineer
        </button>
      ) : (
        <div>
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className={`w-full py-2 rounded text-xs font-medium transition ${
              canStart
                ? "bg-accent-green/20 text-accent-green hover:bg-accent-green/30"
                : "bg-muted text-muted-foreground/40 cursor-not-allowed"
            }`}
          >
            Start Engineer
          </button>
          {!hasApiKey && (
            <p className="text-xs text-muted-foreground/50 mt-1.5 text-center">
              Add a Gemini API key in{" "}
              <a href="/settings" className="underline hover:text-muted-foreground/70">
                Settings
              </a>{" "}
              to enable
            </p>
          )}
        </div>
      )}
    </div>
  );
}
