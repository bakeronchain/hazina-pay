"use client";

type Status = "locked" | "unlocked" | "verified" | "unverified" | "emergency";

const styles: Record<Status, string> = {
  locked:     "bg-red-500/20 text-red-400 border border-red-500/30",
  unlocked:   "bg-green-500/20 text-green-400 border border-green-500/30",
  verified:   "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  unverified: "bg-zinc-700/50 text-zinc-400 border border-zinc-600",
  emergency:  "bg-orange-500/20 text-orange-400 border border-orange-500/30",
};

const labels: Record<Status, string> = {
  locked:     "Locked",
  unlocked:   "Unlocked",
  verified:   "Verified",
  unverified: "Not Verified",
  emergency:  "Emergency",
};

interface Props {
  status: Status;
}

export function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
