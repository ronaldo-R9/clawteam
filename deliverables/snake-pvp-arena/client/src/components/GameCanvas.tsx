import { useCallback, useEffect, useRef } from 'react';

interface Cell {
  x: number;
  y: number;
}

interface SnakeSnapshot {
  userId: string;
  username: string;
  color: string;
  body: Cell[];
  direction: string;
  score: number;
  alive: boolean;
}

interface RoomSnapshot {
  roomCode: string;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  tick: number;
  countdown: number | null;
  grid: { width: number; height: number };
  players: Array<{ userId: string; username: string; color: string; connected: boolean }>;
  snakes: SnakeSnapshot[];
  food: Cell | null;
  winner: { userId: string; username: string } | null;
  reason: string | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Props {
  state: RoomSnapshot | null;
}

const CELL_PX = 20;
const PARTICLE_COUNT = 12;
const DEATH_PARTICLE_COUNT = 24;

export default function GameCanvas({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const prevFoodRef = useRef<Cell | null>(null);
  const prevAliveRef = useRef<Map<string, boolean>>(new Map());
  const animRef = useRef<number>(0);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = PARTICLE_COUNT) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 1 + Math.random() * 2;
      particlesRef.current.push({
        x: (x + 0.5) * CELL_PX,
        y: (y + 0.5) * CELL_PX,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }, []);

  // Food eaten particles
  useEffect(() => {
    if (!state || !state.food) return;

    const prev = prevFoodRef.current;
    if (prev && (prev.x !== state.food.x || prev.y !== state.food.y)) {
      spawnParticles(prev.x, prev.y, '#facc15');
    }
    prevFoodRef.current = state.food;
  }, [state?.food, state?.tick, spawnParticles]);

  // Death particles
  useEffect(() => {
    if (!state) return;

    for (const snake of state.snakes) {
      const wasAlive = prevAliveRef.current.get(snake.userId);
      if (wasAlive === true && !snake.alive && snake.body.length > 0) {
        const head = snake.body[0];
        spawnParticles(head.x, head.y, snake.color, DEATH_PARTICLE_COUNT);
      }
      prevAliveRef.current.set(snake.userId, snake.alive);
    }
  }, [state?.tick, state?.snakes, spawnParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    function draw() {
      if (!running || !ctx || !canvas) return;

      const gw = state?.grid.width ?? 24;
      const gh = state?.grid.height ?? 24;
      const w = gw * CELL_PX;
      const h = gh * CELL_PX;

      canvas.width = w;
      canvas.height = h;

      // Background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= gw; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_PX, 0);
        ctx.lineTo(x * CELL_PX, h);
        ctx.stroke();
      }
      for (let y = 0; y <= gh; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_PX);
        ctx.lineTo(w, y * CELL_PX);
        ctx.stroke();
      }

      if (!state) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Food with pulsing glow
      if (state.food) {
        const fx = state.food.x * CELL_PX;
        const fy = state.food.y * CELL_PX;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8 * pulse;
        ctx.beginPath();
        ctx.arc(fx + CELL_PX / 2, fy + CELL_PX / 2, CELL_PX / 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Snakes
      for (const snake of state.snakes) {
        const alpha = snake.alive ? 1 : 0.3;
        ctx.globalAlpha = alpha;

        for (let i = 0; i < snake.body.length; i++) {
          const seg = snake.body[i];
          const px = seg.x * CELL_PX;
          const py = seg.y * CELL_PX;
          const isHead = i === 0;

          ctx.fillStyle = snake.color;
          if (isHead) {
            ctx.shadowColor = snake.color;
            ctx.shadowBlur = 6;
          }

          const pad = isHead ? 0 : 1;
          const radius = isHead ? 4 : 2;
          roundRect(ctx, px + pad, py + pad, CELL_PX - pad * 2, CELL_PX - pad * 2, radius);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Direction-aware eyes on head
          if (isHead && snake.alive) {
            const cx = px + CELL_PX / 2;
            const cy = py + CELL_PX / 2;
            const eyeOffset = 3;
            const pupilShift = 1.5;

            let eye1x: number, eye1y: number, eye2x: number, eye2y: number;
            let pupil1x: number, pupil1y: number, pupil2x: number, pupil2y: number;

            switch (snake.direction) {
              case 'up':
                eye1x = cx - eyeOffset; eye1y = cy - eyeOffset;
                eye2x = cx + eyeOffset; eye2y = cy - eyeOffset;
                pupil1x = eye1x; pupil1y = eye1y - pupilShift;
                pupil2x = eye2x; pupil2y = eye2y - pupilShift;
                break;
              case 'down':
                eye1x = cx - eyeOffset; eye1y = cy + eyeOffset;
                eye2x = cx + eyeOffset; eye2y = cy + eyeOffset;
                pupil1x = eye1x; pupil1y = eye1y + pupilShift;
                pupil2x = eye2x; pupil2y = eye2y + pupilShift;
                break;
              case 'left':
                eye1x = cx - eyeOffset; eye1y = cy - eyeOffset;
                eye2x = cx - eyeOffset; eye2y = cy + eyeOffset;
                pupil1x = eye1x - pupilShift; pupil1y = eye1y;
                pupil2x = eye2x - pupilShift; pupil2y = eye2y;
                break;
              case 'right':
              default:
                eye1x = cx + eyeOffset; eye1y = cy - eyeOffset;
                eye2x = cx + eyeOffset; eye2y = cy + eyeOffset;
                pupil1x = eye1x + pupilShift; pupil1y = eye1y;
                pupil2x = eye2x + pupilShift; pupil2y = eye2y;
                break;
            }

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(eye1x, eye1y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eye2x, eye2y, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(pupil1x, pupil1y, 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(pupil2x, pupil2y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }

      // Particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        p.vx *= 0.96;
        p.vy *= 0.96;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      className="block mx-auto rounded-lg border border-slate-700"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
