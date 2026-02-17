"use client";

export function PedalBars({ throttle, brake }: { throttle: number; brake: number }) {
  return (
    <div className="flex gap-3 items-end h-40">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground">THR</span>
        <div className="w-8 h-32 bg-border rounded-sm relative overflow-hidden">
          <div
            className="absolute bottom-0 w-full bg-accent-green rounded-sm transition-all duration-75"
            style={{ height: `${throttle}%` }}
          />
        </div>
        <span className="text-xs text-accent-green">{throttle}%</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-muted-foreground">BRK</span>
        <div className="w-8 h-32 bg-border rounded-sm relative overflow-hidden">
          <div
            className="absolute bottom-0 w-full bg-accent-red rounded-sm transition-all duration-75"
            style={{ height: `${brake}%` }}
          />
        </div>
        <span className="text-xs text-accent-red">{brake}%</span>
      </div>
    </div>
  );
}
