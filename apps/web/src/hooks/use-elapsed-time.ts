"use client";

import { useState, useEffect } from "react";

export function useElapsedTime(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!startedAt) {
      setElapsed("00:00");
      return;
    }

    const update = () => {
      const diff = Date.now() - new Date(startedAt).getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}
