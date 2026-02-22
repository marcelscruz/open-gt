"use client";

export function LapTimes({
  lap,
  totalLaps,
  best,
  last,
}: {
  lap: number;
  totalLaps: number;
  best: string;
  last: string;
}) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-end text-base">
        <span className="font-bold">
          {lap}
          {totalLaps > 0 ? ` / ${totalLaps}` : ""}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Best</span>
        <span className="text-accent-green font-mono">{best}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Last</span>
        <span className="font-mono">{last}</span>
      </div>
    </div>
  );
}
