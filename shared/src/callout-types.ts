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
