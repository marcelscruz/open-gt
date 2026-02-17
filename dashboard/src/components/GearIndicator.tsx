"use client";

// GT7 gear byte: high nibble = current gear, low nibble = suggested gear
// Values: 0 = neutral/none, 1-8 = gear, 15 = neutral (between shifts) / no suggestion

function gearToLabel(gear: number): string {
  if (gear === 0 || gear >= 15) return "N";
  return gear.toString();
}

export function GearIndicator({ current, suggested }: { current: number; suggested: number }) {
  const currentLabel = gearToLabel(current);
  // Hide suggested when it's 0 (none), 15 (no suggestion), or matches current
  const showSuggested = suggested > 0 && suggested < 15 && suggested !== current;
  const suggestedLabel = suggested.toString();

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="text-8xl font-bold leading-none tracking-tight text-white">{currentLabel}</div>
      {showSuggested && (
        <div className="text-2xl text-red-500 mt-1">↓ {suggestedLabel}</div>
      )}
    </div>
  );
}
