import { useState, useRef, useCallback, useEffect } from "react";
import { Volume2, VolumeX, Volume1, Bell } from "lucide-react";

type TimerState = "idle" | "running" | "paused" | "alarm";
type VolumeMode = "mute" | "low" | "loud";

const CX = 200;
const CY = 200;
const RADIUS = 160;
const TICK_OUTER = 170;
const LABEL_R = 140;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function angleToMinutes(angleDeg: number): number {
  const normalized = ((angleDeg % 360) + 360) % 360;
  return Math.round(normalized / 6);
}

function minutesToAngle(minutes: number): number {
  return minutes * 6;
}

function getAngleFromEvent(e: { clientX: number; clientY: number }, svgEl: SVGSVGElement): number {
  const rect = svgEl.getBoundingClientRect();
  const scale = 400 / rect.width;
  const x = (e.clientX - rect.left) * scale - CX;
  const y = (e.clientY - rect.top) * scale - CY;
  let angle = (Math.atan2(x, -y) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

export default function AnalogTimer() {
  const [setMinutes, setSetMinutes] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [state, setState] = useState<TimerState>("idle");
  const [volumeMode, setVolumeMode] = useState<VolumeMode>("loud");
  const [alertDuration, setAlertDuration] = useState<3 | 30>(3);
  const [isDragging, setIsDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const intervalRef = useRef<number | null>(null);
  const endTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmTimeoutRef = useRef<number | null>(null);

  const currentMinutes = state === "idle" ? setMinutes : Math.ceil(remainingMs / 60000);
  const currentAngle =
    state === "idle"
      ? minutesToAngle(setMinutes)
      : (remainingMs / (setMinutes * 60000)) * minutesToAngle(setMinutes);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
    };
  }, []);

  const playAlarm = useCallback(() => {
    if (volumeMode === "mute") return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    const gain = ctx.createGain();
    gain.gain.value = volumeMode === "low" ? 0.15 : 0.6;
    gain.connect(ctx.destination);

    const playBeep = (time: number) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1000;
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.15);
    };

    for (let i = 0; i < (alertDuration === 3 ? 6 : 60); i++) {
      playBeep(ctx.currentTime + i * 0.5);
    }
  }, [volumeMode, alertDuration]);

  const stopAlarm = useCallback(() => {
    if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
    setState("idle");
    setSetMinutes(0);
    setRemainingMs(0);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (setMinutes === 0) return;
    const totalMs = setMinutes * 60000;
    setRemainingMs(totalMs);
    endTimeRef.current = Date.now() + totalMs;
    setState("running");

    intervalRef.current = window.setInterval(() => {
      const left = endTimeRef.current - Date.now();
      if (left <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setRemainingMs(0);
        setState("alarm");
      } else {
        setRemainingMs(left);
      }
    }, 100);
  }, [setMinutes]);

  // Trigger alarm sound when state becomes "alarm"
  useEffect(() => {
    if (state === "alarm") {
      playAlarm();
      alarmTimeoutRef.current = window.setTimeout(stopAlarm, alertDuration * 1000);
    }
  }, [state, playAlarm, stopAlarm, alertDuration]);

  const handleKnobClick = () => {
    if (isDragging) return;
    if (state === "idle" && setMinutes > 0) {
      startTimer();
    } else if (state === "running") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setState("paused");
    } else if (state === "paused") {
      endTimeRef.current = Date.now() + remainingMs;
      setState("running");
      intervalRef.current = window.setInterval(() => {
        const left = endTimeRef.current - Date.now();
        if (left <= 0) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setRemainingMs(0);
          setState("alarm");
        } else {
          setRemainingMs(left);
        }
      }, 100);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (state !== "idle") return;
    setIsDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !svgRef.current || state !== "idle") return;
    const angle = getAngleFromEvent(e, svgRef.current);
    const mins = angleToMinutes(angle);
    setSetMinutes(Math.max(1, Math.min(60, mins === 0 ? 60 : mins)));
  };

  const handlePointerUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const cycleVolume = () => {
    setVolumeMode((v) => (v === "loud" ? "low" : v === "low" ? "mute" : "loud"));
  };

  const VolumeIcon = volumeMode === "mute" ? VolumeX : volumeMode === "low" ? Volume1 : Volume2;

  // Generate tick marks
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const angle = i * 6;
    const isMajor = i % 5 === 0;
    const innerR = isMajor ? TICK_OUTER - 18 : TICK_OUTER - 10;
    const p1 = polarToCartesian(CX, CY, innerR, angle);
    const p2 = polarToCartesian(CX, CY, TICK_OUTER, angle);
    ticks.push(
      <line
        key={i}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="hsl(var(--timer-tick))"
        strokeWidth={isMajor ? 2.5 : 1}
        strokeLinecap="round"
      />
    );
  }

  // Generate labels
  const labels = [];
  for (let i = 0; i <= 11; i++) {
    const min = i * 5;
    const angle = min * 6;
    const p = polarToCartesian(CX, CY, LABEL_R, angle);
    labels.push(
      <text
        key={min}
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="hsl(var(--timer-tick))"
        fontSize="14"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
      >
        {min === 0 ? "60" : min}
      </text>
    );
  }

  const displayMinutes = state === "idle"
    ? setMinutes
    : Math.floor(remainingMs / 60000);
  const displaySeconds = state === "idle"
    ? 0
    : Math.floor((remainingMs % 60000) / 1000);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-secondary gap-6">
      {/* Timer card */}
      <div
        className="relative rounded-[2rem] p-4 shadow-2xl"
        style={{
          background: `hsl(var(--timer-shell))`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.05)",
        }}
      >
        {/* Pause/stop alarm button */}
        {state === "alarm" && (
          <button
            onClick={stopAlarm}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-destructive text-destructive-foreground font-semibold text-sm flex items-center gap-1.5 animate-pulse"
          >
            <Bell size={14} /> Stop Alarm
          </button>
        )}

        <div
          className="rounded-[1.25rem] overflow-hidden"
          style={{ background: `hsl(var(--timer-face))` }}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 400 400"
            className="w-80 h-80 sm:w-96 sm:h-96 select-none"
            style={{ touchAction: "none", cursor: state === "alarm" ? "default" : "pointer" }}
            onClick={handleKnobClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* White face */}
            <circle cx={CX} cy={CY} r={RADIUS + 10} fill="hsl(var(--timer-face))" />

            {/* Red arc for remaining time */}
            {currentAngle > 0 && (
              <path
                d={describeArc(CX, CY, RADIUS, 0, currentAngle)}
                fill="hsl(var(--timer-arc))"
                opacity={0.85}
              />
            )}

            {/* Transparent center for text readability */}
            <circle cx={CX} cy={CY} r={50} fill="hsl(var(--timer-face))" opacity={0.85} />

            {/* Tick marks */}
            {ticks}

            {/* Labels */}
            {labels}

            {/* Red indicator dot at top-right */}
            <circle
              cx={CX + 22}
              cy={CY - RADIUS + 25}
              r={4}
              fill="hsl(var(--timer-indicator))"
            />

            {/* Bottom labels */}
            <text
              x={80}
              y={360}
              fill="hsl(var(--timer-tick))"
              fontSize="11"
              fontWeight="700"
              fontFamily="system-ui"
              opacity={0.5}
            >
              60 Min
            </text>
            <text
              x={280}
              y={360}
              fill="hsl(var(--timer-tick))"
              fontSize="11"
              fontWeight="700"
              fontFamily="system-ui"
              opacity={0.5}
            >
              TIMER
            </text>

            {/* Center time display */}
            <text
              x={CX}
              y={CY - 6}
              textAnchor="middle"
              dominantBaseline="central"
              fill="hsl(var(--timer-tick))"
              fontSize={state === "idle" ? "28" : "24"}
              fontWeight="700"
              fontFamily="'SF Mono', 'Cascadia Code', monospace"
            >
              {state === "idle"
                ? setMinutes > 0
                  ? `${setMinutes} min`
                  : "SET"
                : `${String(displayMinutes).padStart(2, "0")}:${String(displaySeconds).padStart(2, "0")}`}
            </text>

            {/* State hint */}
            <text
              x={CX}
              y={CY + 18}
              textAnchor="middle"
              fill="hsl(var(--timer-tick))"
              fontSize="10"
              fontFamily="system-ui"
              opacity={0.5}
            >
              {state === "idle"
                ? setMinutes > 0
                  ? "tap knob to start"
                  : "drag knob to set"
                : state === "running"
                ? "tap to pause"
                : state === "paused"
                ? "tap to resume"
                : "ALARM!"}
            </text>

            {/* Center knob */}
            <circle
              cx={CX}
              cy={CY}
              r={30}
              fill="hsl(var(--timer-face))"
              stroke="hsl(var(--timer-tick))"
              strokeWidth={2}
              style={{ cursor: state === "alarm" ? "default" : "pointer" }}
              onClick={handleKnobClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
            {/* Knob grip lines */}
            <line x1={CX - 8} y1={CY - 3} x2={CX + 8} y2={CY - 3} stroke="hsl(var(--timer-tick))" strokeWidth={1.5} opacity={0.3} strokeLinecap="round" />
            <line x1={CX - 8} y1={CY + 3} x2={CX + 8} y2={CY + 3} stroke="hsl(var(--timer-tick))" strokeWidth={1.5} opacity={0.3} strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={cycleVolume}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:opacity-80"
        >
          <VolumeIcon size={16} />
          {volumeMode}
        </button>

        <button
          onClick={() => setAlertDuration((d) => (d === 3 ? 30 : 3))}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:opacity-80"
        >
          Alert: {alertDuration}s
        </button>

        {(state === "running" || state === "paused") && (
          <button
            onClick={() => {
              if (intervalRef.current) clearInterval(intervalRef.current);
              intervalRef.current = null;
              setState("idle");
              setRemainingMs(0);
            }}
            className="px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium transition-colors hover:opacity-80"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
