"use client";

export function FuelGauge({
  level,
  capacity,
  estimatedLaps,
  fuelUsageEnabled,
}: {
  level: number;
  capacity: number;
  estimatedLaps?: number;
  fuelUsageEnabled?: boolean | null;
}) {
  const pct = capacity > 0 ? Math.round((level / capacity) * 100) : 0;
  const color = pct > 30 ? "#22c55e" : pct > 10 ? "#f97316" : "#ef4444";
  const showEstimate =
    fuelUsageEnabled === true && estimatedLaps != null && Number.isFinite(estimatedLaps);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Fuel</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="w-full h-3 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{level.toFixed(1)} / {capacity.toFixed(0)} L</span>
        {showEstimate && (
          <span style={{ color: estimatedLaps < 3 ? "#ef4444" : undefined }}>
            ~{estimatedLaps.toFixed(1)} laps
          </span>
        )}
      </div>
    </div>
  );
}
