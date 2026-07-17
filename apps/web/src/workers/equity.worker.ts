/// <reference lib="webworker" />

import { analyzeHand, calculateEquity, type EquityRequest } from "@river-noir/poker-equity";

interface WorkerRequest {
  readonly id: string;
  readonly request: EquityRequest;
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const equity = calculateEquity(request);
    const analysis = analyzeHand(request.heroCards, request.communityCards);
    self.postMessage({ id, equity, analysis });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
