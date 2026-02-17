"use client";
import type { EngineerMessage } from "@/lib/useEngineer";

interface Props {
  currentMessage: EngineerMessage | null;
  isConnected: boolean;
  isListening: boolean;
  personalityName: string;
}

export function EngineerOverlay({
  currentMessage,
  isConnected,
  isListening,
  personalityName,
}: Props) {
  if (!isConnected) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
      {/* Current message */}
      {currentMessage && (
        <div className="bg-card/90 backdrop-blur border border-border rounded-lg px-4 py-3 mb-2 animate-fade-in">
          <p className="text-sm text-foreground">{currentMessage.text}</p>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          <span>{personalityName}</span>
        </div>
        {isListening && (
          <div className="flex items-center gap-1.5">
            <MicIcon />
            <span>Listening</span>
          </div>
        )}
        {!isListening && <span className="text-muted-foreground/50">Hold Space to talk</span>}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      role="img"
      aria-label="Microphone"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-accent-red"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
