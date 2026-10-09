"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 25_000;

// Tells the server while the app is on screen, so it can skip native push
// notifications the user would otherwise get on top of the in-app alert.
export function useAppPresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;

    function report(active: boolean) {
      const body = JSON.stringify({ active });

      // sendBeacon survives the page being backgrounded or closed.
      if (!active && navigator.sendBeacon?.("/api/presence", body)) return;

      void fetch("/api/presence", {
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      }).catch(() => {});
    }

    function start() {
      window.clearInterval(timer);
      report(true);
      timer = window.setInterval(() => report(true), HEARTBEAT_MS);
    }

    function stop() {
      window.clearInterval(timer);
      timer = undefined;
      report(false);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", stop);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [enabled]);
}
