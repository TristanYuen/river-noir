import { useCallback, useRef } from "react";

export function useGameSound(enabled: boolean): (kind?: "chip" | "fold" | "deal") => void {
  const contextRef = useRef<AudioContext | null>(null);
  return useCallback((kind = "chip") => {
    if (!enabled) return;
    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return;
    const context = contextRef.current ?? new AudioContextClass();
    contextRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = kind === "fold" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(kind === "deal" ? 540 : kind === "fold" ? 190 : 360, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "deal" ? 690 : 240, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
  }, [enabled]);
}
