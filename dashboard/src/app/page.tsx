"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { EngineerHistory } from "@/components/engineer/EngineerHistory";
import { EngineerOverlay } from "@/components/engineer/EngineerOverlay";
import { EngineerSettings } from "@/components/engineer/EngineerSettings";
import { FuelGauge } from "@/components/FuelGauge";
import { GearIndicator } from "@/components/GearIndicator";
import { LapTimes } from "@/components/LapTimes";
import { PedalBars } from "@/components/PedalBars";
import { Speedometer } from "@/components/Speedometer";
import { Tachometer } from "@/components/Tachometer";
import { TrackMap } from "@/components/TrackMap";
import { TyreTemps } from "@/components/TyreTemps";
import { useEngineer } from "@/lib/useEngineer";
import { useTelemetry } from "@/lib/useTelemetry";

const PERSONALITY_NAMES: Record<string, string> = {
  marcus: "Marcus",
  johnny: "Johnny",
  blank: "Custom",
};

export default function Dashboard() {
  const { connected, data, snapshot, trackPoints } = useTelemetry();
  const engineer = useEngineer();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activePersonality, setActivePersonality] = useState("marcus");
  const [hasApiKey, setHasApiKey] = useState(false);
  const configSocketRef = useRef<Socket | null>(null);

  // Listen to config:state to track whether an API key is available
  useEffect(() => {
    const socket = io("http://localhost:4401", { transports: ["websocket"] });
    configSocketRef.current = socket;

    socket.on("config:state", (state: { hasApiKey: boolean }) => {
      setHasApiKey(state.hasApiKey);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const d = data;

  return (
    <div className="min-h-screen p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold tracking-wider text-muted-foreground uppercase">
          Open GT
        </h1>
        <div className="flex items-center gap-2">
          <a
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground transition cursor-pointer px-3 py-2 rounded-md hover:bg-muted/50"
          >
            <span className="text-lg">⚙</span> Settings
          </a>
          <ConnectionStatus connected={connected} />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left column: Tach + Tyres */}
        <div className="col-span-3 space-y-4">
          <Card title="Tachometer">
            <Tachometer
              rpm={d?.engineRPM ?? 0}
              minAlert={d?.minAlertRPM ?? 0}
              maxAlert={d?.maxAlertRPM ?? 9000}
            />
          </Card>
          <Card title="Tyres">
            <TyreTemps temps={d?.tyreTemp ?? { fl: 0, fr: 0, rl: 0, rr: 0 }} />
          </Card>
        </div>

        {/* Center: Speed + Gear + Pedals */}
        <div className="col-span-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card title="Speed">
              <Speedometer speed={d?.speed ?? 0} maxSpeed={d?.calcMaxSpeed ?? 400} />
            </Card>
            <Card title="Gear" className="flex items-center justify-center">
              <GearIndicator current={d?.currentGear ?? 0} suggested={d?.suggestedGear ?? 0} />
            </Card>
            <Card title="Pedals" className="flex items-center justify-center">
              <PedalBars throttle={d?.throttle ?? 0} brake={d?.brake ?? 0} />
            </Card>
          </div>
          <Card title="Track Map">
            <TrackMap
              trackPoints={trackPoints}
              currentPos={d ? { x: d.position.x, z: d.position.z } : null}
            />
          </Card>
        </div>

        {/* Right column: Laps + Fuel + Info */}
        <div className="col-span-3 space-y-4">
          <Card title="Laps">
            <LapTimes
              lap={d?.lapCount ?? 0}
              totalLaps={d?.totalLaps ?? 0}
              best={d?.bestLapFormatted ?? "--:--.---"}
              last={d?.lastLapFormatted ?? "--:--.---"}
            />
          </Card>
          <Card title="Fuel">
            <FuelGauge
              level={d?.fuelLevel ?? 0}
              capacity={d?.fuelCapacity ?? 0}
              estimatedLaps={snapshot?.estimatedLapsRemaining}
              fuelUsageEnabled={snapshot?.fuelUsageEnabled}
            />
          </Card>
          <Card title="Status">
            <div className="space-y-1 text-xs">
              <StatusRow label="On Track" active={d?.carOnTrack} />
              <StatusRow label="Paused" active={d?.paused} />
              <StatusRow label="TCS" active={d?.tcsActive} />
              <StatusRow label="ASM" active={d?.asmActive} />
              <StatusRow label="Handbrake" active={d?.handbrake} />
              <StatusRow label="Rev Limiter" active={d?.revLimiter} warn />
            </div>
          </Card>
        </div>
      </div>

      {/* Engineer UI */}
      <EngineerOverlay
        currentMessage={engineer.currentMessage}
        isConnected={engineer.isConnected}
        isListening={engineer.isListening}
        personalityName={PERSONALITY_NAMES[activePersonality] ?? activePersonality}
      />

      <EngineerHistory
        messages={engineer.messages}
        isOpen={historyOpen}
        onToggle={() => setHistoryOpen((prev) => !prev)}
      />

      <EngineerSettings
        isConnected={engineer.isConnected}
        hasApiKey={hasApiKey}
        onStart={(settings) => {
          setActivePersonality(settings.personalityId);
          engineer.start(settings);
        }}
        onStop={engineer.stop}
        onVerbosityChange={engineer.setVerbosity}
      />
    </div>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">{title}</h2>
      <div className={className}>{children}</div>
    </div>
  );
}

function StatusRow({ label, active, warn }: { label: string; active?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          active ? (warn ? "text-accent-red" : "text-accent-green") : "text-muted-foreground"
        }
      >
        {active ? "ON" : "OFF"}
      </span>
    </div>
  );
}
