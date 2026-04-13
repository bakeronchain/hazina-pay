"use client";

interface Props {
  percent: number; // 0–100
  label?: string;
}

export function ProgressBar({ percent, label }: Props) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span>{clamped.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-zinc-800">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
