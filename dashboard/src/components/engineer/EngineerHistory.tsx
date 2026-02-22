"use client";
import { useEffect, useRef } from "react";
import type { EngineerMessage } from "@/lib/useEngineer";

interface Props {
  messages: EngineerMessage[];
  isOpen: boolean;
  onToggle: () => void;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

const TYPE_ICONS: Record<string, string> = {
  fuel_low: "⛽",
  fuel_estimate: "⛽",
  tyre_temp_high: "🔥",
  tyre_trend: "🌡️",
  lap_delta: "⏱️",
  lap_summary: "🏁",
  rev_limiter: "⚡",
  tcs_intervention: "🛞",
  asm_intervention: "🛡️",
  race_progress: "📊",
  pace_summary: "📈",
  response: "🎙️",
  transcript: "💬",
};

export function EngineerHistory({ messages, isOpen, onToggle }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages only
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !wasAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
  }

  return (
    <div
      className={`fixed top-0 right-0 h-full bg-card border-l border-border transition-transform duration-200 z-40 ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      style={{ width: "340px" }}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className="absolute -left-10 top-4 w-10 h-10 bg-card border border-border border-r-0 rounded-l flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition"
      >
        {isOpen ? "›" : "‹"}
      </button>

      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Engineer Comms</h3>
        <span className="text-xs text-muted-foreground/50">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="overflow-y-auto h-[calc(100%-60px)] p-3 space-y-1"
      >
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground/50 text-center mt-8">No messages yet</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className="px-3 py-2 rounded-md text-xs hover:bg-muted/50"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span>{TYPE_ICONS[msg.type] ?? "📡"}</span>
              <span className="text-muted-foreground/50">{formatTime(msg.timestamp)}</span>
            </div>
            <p className="text-foreground/90">{msg.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
