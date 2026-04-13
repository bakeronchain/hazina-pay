"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "solid" | "outline";
  loading?: boolean;
}

export function GoldButton({
  children,
  variant = "solid",
  loading = false,
  disabled,
  className = "",
  ...rest
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed";
  const solid =
    "bg-gradient-to-r from-yellow-400 to-amber-500 text-black hover:from-yellow-300 hover:to-amber-400";
  const outline =
    "border border-yellow-500 text-yellow-400 hover:bg-yellow-500/10";

  return (
    <button
      className={`${base} ${variant === "solid" ? solid : outline} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
