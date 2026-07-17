import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerGameView } from "@river-noir/protocol";
import type { EquityResult, HandAnalysis } from "@river-noir/poker-equity";

export interface EquityAnalysisState {
  readonly loading: boolean;
  readonly equity: EquityResult | null;
  readonly analysis: HandAnalysis | null;
  readonly error: string | null;
}

export function useEquityAnalysis(view: PlayerGameView | null, enabled: boolean): EquityAnalysisState {
  const [state, setState] = useState<EquityAnalysisState>({ loading: false, equity: null, analysis: null, error: null });
  const latestId = useRef<string | null>(null);
  const hero = view?.players.find((player) => player.id === view.viewerPlayerId);
  const activeOpponents = view?.players.filter((player) =>
    player.id !== view.viewerPlayerId && (player.status === "active" || player.status === "allIn"),
  ).length ?? 0;
  const key = useMemo(() => JSON.stringify({
    cards: hero?.cards,
    board: view?.communityCards,
    opponents: activeOpponents,
  }), [hero?.cards, view?.communityCards, activeOpponents]);

  useEffect(() => {
    if (!enabled || !view || !hero || hero.cards.length !== 2 || activeOpponents < 1) {
      setState({ loading: false, equity: null, analysis: null, error: null });
      return;
    }
    const worker = new Worker(new URL("../workers/equity.worker.ts", import.meta.url), { type: "module" });
    const id = crypto.randomUUID();
    latestId.current = id;
    setState((current) => ({ ...current, loading: true, error: null }));
    worker.addEventListener("message", (event: MessageEvent<{
      id: string;
      equity?: EquityResult;
      analysis?: HandAnalysis;
      error?: string;
    }>) => {
      if (event.data.id !== latestId.current) return;
      if (event.data.error) setState({ loading: false, equity: null, analysis: null, error: event.data.error });
      else setState({
        loading: false,
        equity: event.data.equity ?? null,
        analysis: event.data.analysis ?? null,
        error: null,
      });
    });
    const iterations = view.street === "preflop" ? 1_800 : view.street === "flop" ? 3_000 : view.street === "turn" ? 4_000 : 2_500;
    worker.postMessage({
      id,
      request: {
        heroCards: hero.cards,
        communityCards: view.communityCards,
        opponentCount: activeOpponents,
        iterations,
      },
    });
    return () => worker.terminate();
  }, [key, enabled, view?.street]);

  return state;
}
