import { useCallback, useRef } from 'react';

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'square',
  volume: number = 0.15
) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume: number = 0.1) {
  const ctx = getAudioCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

export function useSfx() {
  const lastPlayRef = useRef<Record<string, number>>({});

  const throttle = useCallback((key: string, minMs: number): boolean => {
    const now = Date.now();
    const last = lastPlayRef.current[key] ?? 0;
    if (now - last < minMs) return false;
    lastPlayRef.current[key] = now;
    return true;
  }, []);

  const eatFood = useCallback(() => {
    if (!throttle('eat', 50)) return;
    playTone(587, 0.08, 'square', 0.12);
    setTimeout(() => playTone(784, 0.1, 'square', 0.12), 60);
  }, [throttle]);

  const death = useCallback(() => {
    if (!throttle('death', 200)) return;
    playNoise(0.3, 0.15);
    playTone(200, 0.3, 'sawtooth', 0.1);
    setTimeout(() => playTone(120, 0.4, 'sawtooth', 0.08), 150);
  }, [throttle]);

  const countdownTick = useCallback(() => {
    if (!throttle('countdown', 800)) return;
    playTone(440, 0.12, 'sine', 0.15);
  }, [throttle]);

  const gameStart = useCallback(() => {
    if (!throttle('start', 500)) return;
    playTone(523, 0.1, 'square', 0.12);
    setTimeout(() => playTone(659, 0.1, 'square', 0.12), 100);
    setTimeout(() => playTone(784, 0.15, 'square', 0.12), 200);
  }, [throttle]);

  const win = useCallback(() => {
    if (!throttle('win', 1000)) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'square', 0.12), i * 120);
    });
  }, [throttle]);

  const lose = useCallback(() => {
    if (!throttle('lose', 1000)) return;
    playTone(392, 0.3, 'sawtooth', 0.1);
    setTimeout(() => playTone(330, 0.3, 'sawtooth', 0.08), 200);
    setTimeout(() => playTone(262, 0.5, 'sawtooth', 0.06), 400);
  }, [throttle]);

  return { eatFood, death, countdownTick, gameStart, win, lose };
}
