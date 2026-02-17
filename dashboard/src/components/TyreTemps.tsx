"use client";

function tempColor(t: number): string {
  if (t <= 0) return "#737373";
  if (t < 60) return "#3b82f6"; // cold - blue
  if (t < 90) return "#22c55e"; // optimal - green
  if (t < 110) return "#f97316"; // warm - orange
  return "#ef4444"; // hot - red
}

function TyreBox({ label, temp }: { label: string; temp: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-muted-foreground mb-1">{label}</span>
      <div
        className="w-14 h-20 rounded-md flex items-center justify-center text-sm font-bold border border-border"
        style={{
          backgroundColor: `${tempColor(temp)}25`,
          color: tempColor(temp),
          borderColor: `${tempColor(temp)}50`,
        }}
      >
        {temp > 0 ? `${Math.round(temp)}°` : "--"}
      </div>
    </div>
  );
}

export function TyreTemps({
  temps,
}: {
  temps: { fl: number; fr: number; rl: number; rr: number };
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <TyreBox label="FL" temp={temps.fl} />
      <TyreBox label="FR" temp={temps.fr} />
      <TyreBox label="RL" temp={temps.rl} />
      <TyreBox label="RR" temp={temps.rr} />
    </div>
  );
}
