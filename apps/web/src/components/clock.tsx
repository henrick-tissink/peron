"use client";

import { useEffect, useState } from "react";

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function Clock() {
  const [t, setT] = useState(() => fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setT(fmt(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm text-[var(--color-accent)]">{t}</span>;
}
