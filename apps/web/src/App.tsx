import { useEffect, useRef } from "react";
import { Lobby } from "./components/Lobby.js";
import { TablePage } from "./components/TablePage.js";
import { useGameStore } from "./store/gameStore.js";

export function App() {
  const screen = useGameStore((state) => state.screen);
  const startLocalGame = useGameStore((state) => state.startLocalGame);
  const setLocale = useGameStore((state) => state.setLocale);
  const demoStarted = useRef(false);
  useEffect(() => {
    const parameters = new URLSearchParams(globalThis.location.search);
    if (parameters.get("lang") === "en") setLocale("en-US");
    if (!import.meta.env.DEV || demoStarted.current || parameters.get("demo") !== "1") return;
    demoStarted.current = true;
    const requestedPlayers = Number(parameters.get("players") ?? 6);
    const totalPlayers = Number.isInteger(requestedPlayers) ? Math.max(3, Math.min(10, requestedPlayers)) : 6;
    void startLocalGame({
      nickname: "You",
      totalPlayers,
      difficulty: "standard",
      deepSeekEnabled: false,
      initialStack: 10_000,
      smallBlind: 50,
      bigBlind: 100,
      soundEnabled: false,
      analysisEnabled: true,
    });
  }, [setLocale, startLocalGame]);
  return screen === "table" ? <TablePage /> : <Lobby />;
}
