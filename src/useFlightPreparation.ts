import { useEffect, useState } from "react";
import type { Scenario } from "./simulation";
import { flightPrepared, prepareFlight } from "./flightRuntime";
export function useFlightPreparation(scenario: Scenario) {
  const [ready, setReady] = useState(() => flightPrepared(scenario)),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setReady(flightPrepared(scenario));
    setError("");
    void prepareFlight(scenario).then(
      () => {
        if (!cancelled) setReady(true);
      },
      (e) => {
        if (!cancelled) setError(String(e.message));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scenario, retry]);
  return {
    ready: ready && flightPrepared(scenario),
    error,
    retry: () => setRetry((n) => n + 1),
  };
}
