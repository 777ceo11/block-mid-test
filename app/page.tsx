"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";

// --- Types ---
type GameState = "MENU" | "STARTING" | "PLAYING" | "PAUSED" | "GAMEOVER" | "SUCCESS";

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isRed: boolean;
  active: boolean;
}

// --- Constants ---
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 700;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 12;
const BALL_RADIUS = 8;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_PADDING = 8;
const BRICK_OFFSET_TOP = 80;
const BRICK_OFFSET_LEFT = 20;
const BRICK_WIDTH = (CANVAS_WIDTH - BRICK_OFFSET_LEFT * 2 - (BRICK_COLS - 1) * BRICK_PADDING) / BRICK_COLS;
const BRICK_HEIGHT = 25;

const COLORS = [
  { hex: "#ff8a80", name: "light-red" },    // Light Red
  { hex: "#ffd180", name: "light-orange" }, // Light Orange
  { hex: "#ffff8d", name: "light-yellow" }, // Light Yellow
  { hex: "#80d8ff", name: "light-blue" },   // Light Blue
  { hex: "#b9f6ca", name: "light-green" },  // Light Green
  { hex: "#ea80fc", name: "light-purple" }, // Light Purple
];

// --- Audio Helper ---
const playCollisionSound = () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.1);
};

export default function BrickBreaker() {
  // UI State
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [playerName, setPlayerName] = useState("");
  const [lives, setLives] = useState(3);
  const [time, setTime] = useState(0);
  const [targetRedBricks, setTargetRedBricks] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [inputError, setInputError] = useState(false);
  const [rankings, setRankings] = useState<{name: string, finishtime: string}[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Game Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const timerRef = useRef<NodeJS.Timeout>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  
  // Game Logic Variables (using refs to avoid re-renders)
  const ballPos = useRef({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 50 });
  const ballVel = useRef({ dx: 4, dy: -4 });
  const paddleX = useRef((CANVAS_WIDTH - PADDLE_WIDTH) / 2);
  const bricks = useRef<Brick[]>([]);
  const rightPressed = useRef(false);
  const leftPressed = useRef(false);
  const redBricksDestroyed = useRef(0);
  const particles = useRef<any[]>([]);

  // --- Background Music ---
  useEffect(() => {
    bgmRef.current = new Audio("/Hyper_Speed_Run.mp3");
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.2;
    
    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!bgmRef.current) return;
    
    if (gameState === "PLAYING") {
      bgmRef.current.play().catch(e => console.log("BGM play blocked", e));
    } else if (gameState === "PAUSED" || gameState === "GAMEOVER" || gameState === "SUCCESS" || gameState === "MENU") {
      bgmRef.current.pause();
    }
  }, [gameState]);

  // --- Confetti Effect (Fireworks) ---
  const createConfetti = useCallback(() => {
    const colors = ["#ff8a80", "#ffd180", "#ffff8d", "#80d8ff", "#b9f6ca", "#ea80fc"];
    
    // Create multiple staggered explosions
    const launchExplosion = (startX: number, startY: number) => {
      for (let i = 0; i < 60; i++) {
        particles.current.push({
          x: startX,
          y: startY,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.6) * 18,
          size: Math.random() * 6 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1.0,
          decay: Math.random() * 0.02 + 0.01,
          gravity: 0.25
        });
      }
    };

    // Center explosion
    launchExplosion(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    
    // Staggered side explosions
    setTimeout(() => launchExplosion(CANVAS_WIDTH * 0.2, CANVAS_HEIGHT * 0.4), 300);
    setTimeout(() => launchExplosion(CANVAS_WIDTH * 0.8, CANVAS_HEIGHT * 0.4), 600);
    setTimeout(() => launchExplosion(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3), 900);
  }, []);

  // --- Initialization ---
  const initBricks = useCallback(() => {
    particles.current = [];
    const newBricks: Brick[] = [];
    const totalBricks = BRICK_ROWS * BRICK_COLS;
    const targetRed = Math.floor(totalBricks * 0.4); // 40% Light Red

    const colorPool: number[] = [];
    for (let i = 0; i < totalBricks; i++) {
      if (i < targetRed) colorPool.push(0);
      else colorPool.push(Math.floor(Math.random() * 5) + 1);
    }
    for (let i = colorPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
    }

    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const colorIdx = colorPool[r * BRICK_COLS + c];
        const color = COLORS[colorIdx].hex;
        const isRed = colorIdx === 0;
        
        newBricks.push({
          x: c * (BRICK_WIDTH + BRICK_PADDING) + BRICK_OFFSET_LEFT,
          y: r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP,
          width: BRICK_WIDTH,
          height: BRICK_HEIGHT,
          color,
          isRed,
          active: true,
        });
      }
    }
    bricks.current = newBricks;
    redBricksDestroyed.current = 0;
    setTargetRedBricks(0);
  }, []);

  const resetBallAndPaddle = useCallback(() => {
    ballPos.current = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 35 };
    ballVel.current = { dx: 4, dy: -4 };
    paddleX.current = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
  }, []);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const saveAndFetchRankings = useCallback(async (name: string, timeStr: string) => {
    setIsSaving(true);
    try {
      await fetch("/api/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, finishtime: timeStr }),
      });
      
      const response = await fetch("/api/ranking");
      const data = await response.json();
      if (Array.isArray(data)) {
        setRankings(data.slice(0, 3));
      }
    } catch (error) {
      console.error("Ranking error:", error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // --- Game Loop ---
  const update = useCallback(() => {
    if (gameState !== "PLAYING" && gameState !== "SUCCESS") return;

    if (gameState === "PLAYING") {
      if (rightPressed.current && paddleX.current < CANVAS_WIDTH - PADDLE_WIDTH) {
        paddleX.current += 7;
      } else if (leftPressed.current && paddleX.current > 0) {
        paddleX.current -= 7;
      }

      ballPos.current.x += ballVel.current.dx;
      ballPos.current.y += ballVel.current.dy;

      if (ballPos.current.x + ballVel.current.dx > CANVAS_WIDTH - BALL_RADIUS || ballPos.current.x + ballVel.current.dx < BALL_RADIUS) {
        ballVel.current.dx = -ballVel.current.dx;
      }
      if (ballPos.current.y + ballVel.current.dy < BALL_RADIUS) {
        ballVel.current.dy = -ballVel.current.dy;
      } else if (ballPos.current.y + ballVel.current.dy > CANVAS_HEIGHT - BALL_RADIUS) {
        if (ballPos.current.x > paddleX.current && ballPos.current.x < paddleX.current + PADDLE_WIDTH) {
          ballVel.current.dy = -ballVel.current.dy;
          const hitPoint = (ballPos.current.x - (paddleX.current + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
          ballVel.current.dx = hitPoint * 5;
        } else {
          setLives((prev) => {
            if (prev <= 1) {
              setGameState("GAMEOVER");
              return 0;
            }
            resetBallAndPaddle();
            return prev - 1;
          });
        }
      }

      for (let i = 0; i < bricks.current.length; i++) {
        const b = bricks.current[i];
        if (b.active) {
          if (
            ballPos.current.x > b.x &&
            ballPos.current.x < b.x + b.width &&
            ballPos.current.y > b.y &&
            ballPos.current.y < b.y + b.height
          ) {
            ballVel.current.dy = -ballVel.current.dy;
            b.active = false;
            playCollisionSound();
            
            if (b.isRed) {
              redBricksDestroyed.current += 1;
              setTargetRedBricks(redBricksDestroyed.current);
              if (redBricksDestroyed.current >= 3) {
                setGameState("SUCCESS");
              }
            }
          }
        }
      }
    }

    draw();
    (requestRef as any).current = requestAnimationFrame(update);
  }, [gameState, resetBallAndPaddle]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (gameState === "SUCCESS") {
      particles.current.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
        ctx.closePath();
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity || 0.15;
        p.life -= p.decay;
        if (p.life <= 0) particles.current.splice(i, 1);
      });
      ctx.globalAlpha = 1.0;
    }

    bricks.current.forEach((b) => {
      if (b.active) {
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, 4);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.closePath();
      }
    });

    ctx.beginPath();
    ctx.roundRect(paddleX.current, CANVAS_HEIGHT - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.closePath();

    if (gameState !== "SUCCESS") {
      ctx.beginPath();
      ctx.arc(ballPos.current.x, ballPos.current.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#ff8a80";
      ctx.fill();
      ctx.closePath();
    }
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") rightPressed.current = true;
      if (e.key === "ArrowLeft") leftPressed.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") rightPressed.current = false;
      if (e.key === "ArrowLeft") leftPressed.current = false;
    };
    const handleTouch = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const touchX = e.touches[0].clientX - rect.left;
      const scaleX = canvas.width / rect.width;
      const actualX = touchX * scaleX;
      let newX = actualX - PADDLE_WIDTH / 2;
      if (newX < 0) newX = 0;
      if (newX > CANVAS_WIDTH - PADDLE_WIDTH) newX = CANVAS_WIDTH - PADDLE_WIDTH;
      paddleX.current = newX;
      if (gameState === "PLAYING") e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("touchstart", handleTouch, { passive: false });
    window.addEventListener("touchmove", handleTouch, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("touchstart", handleTouch);
      window.removeEventListener("touchmove", handleTouch);
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState === "PLAYING" || gameState === "SUCCESS") {
      (requestRef as any).current = requestAnimationFrame(update);
      if (gameState === "PLAYING") {
        timerRef.current = setInterval(() => {
          setTime((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, update]);

  useEffect(() => {
    if (gameState === "SUCCESS") {
      createConfetti();
      saveAndFetchRankings(playerName, formatTime(time));
    }
  }, [gameState, createConfetti, playerName, time, saveAndFetchRankings]);

  const handleStartGame = () => {
    if (!playerName.trim()) {
      setInputError(true);
      return;
    }
    setInputError(false);
    initBricks();
    resetBallAndPaddle();
    setLives(3);
    setTime(0);
    setGameState("STARTING");
    setCountdown(3);
  };

  useEffect(() => {
    if (gameState === "STARTING") {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setGameState("PLAYING");
      }
    }
  }, [gameState, countdown]);

  const handleExit = () => {
    setPlayerName("");
    setGameState("MENU");
  };

  const handlePause = () => {
    if (gameState === "PLAYING") setGameState("PAUSED");
    else if (gameState === "PAUSED") setGameState("PLAYING");
  };

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen w-full">
      
      {/* HUD */}
      {gameState !== "MENU" && (
        <div className="w-[95%] max-w-[600px] mb-4 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 glass-panel">
          <div className="flex gap-4 sm:gap-8 overflow-hidden">
            <div className="flex flex-col">
              <span className="stat-label text-[10px] sm:text-[12px]">Lives</span>
              <div className="flex gap-0.5 sm:gap-1 mt-1">
                {[...Array(3)].map((_, i) => (
                  <span key={i} className={`text-sm sm:text-xl transition-all duration-300 ${i < lives ? "grayscale-0 scale-100" : "grayscale opacity-20 scale-90"}`}>❤️</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="stat-label text-[10px] sm:text-[12px]">Player</span>
              <span className="stat-value text-sm sm:text-2xl truncate max-w-[60px] sm:max-w-none">{playerName}</span>
            </div>
            <div className="flex flex-col">
              <span className="stat-label text-[10px] sm:text-[12px]">Time</span>
              <span className="stat-value text-sm sm:text-2xl text-red-500">{formatTime(time)}</span>
            </div>
            <div className="flex flex-col">
              <span className="stat-label text-[10px] sm:text-[12px]">Target</span>
              <div className="flex items-center gap-1 sm:gap-2">
                 <span className="text-emerald-400 text-sm sm:text-xl">◎</span>
                 <span className="stat-value text-sm sm:text-2xl">{targetRedBricks}/3</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3 relative z-[110]">
            <button onClick={handlePause} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs sm:text-base">
              {gameState === "PAUSED" ? "▶️" : "⏸️"}
            </button>
            <button onClick={handleExit} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-red-900/20 text-red-500 hover:bg-red-900/40 text-sm sm:text-base">
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="relative w-[95%] max-w-[600px] aspect-[6/7] glass-panel overflow-hidden shadow-2xl border-2 border-zinc-800">
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="bg-zinc-950 w-full h-full object-contain" />

        {gameState === "MENU" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900/95 p-4 sm:p-8 backdrop-blur-md overflow-y-auto">
            {/* Mascot Image - Responsive Size */}
            <div className="mb-6 sm:mb-10 relative w-24 h-24 sm:w-40 sm:h-40 group shrink-0">
               <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full"></div>
               <Image src="/Mascot.jpg" alt="Mascot" fill className="object-contain relative z-10" priority />
            </div>

            {/* Title - Responsive Size */}
            <h1 className="text-4xl sm:text-7xl font-black text-white mb-2 tracking-tighter sm:tracking-widest retro-text drop-shadow-[0_4px_0_#1e40af] text-center px-2">
              INU 벽돌깨기
            </h1>
            <p className="text-zinc-500 mb-6 sm:mb-10 font-bold tracking-tight sm:tracking-widest retro-text text-sm sm:text-lg text-center px-4">
              빨간 벽돌 3개를 먼저 깨보세요!
            </p>

            {/* Input & Button - Responsive Width */}
            <div className="w-full max-w-[280px] sm:max-w-xs space-y-4 sm:space-y-6 shrink-0">
              <input
                type="text"
                placeholder="이름을 입력하세요"
                value={playerName}
                onKeyDown={(e) => e.key === 'Enter' && handleStartGame()}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-zinc-950/50 border-2 border-zinc-800 rounded-xl focus:outline-none focus:border-blue-500 text-white text-sm sm:text-base"
              />
              <button onClick={handleStartGame} className="w-full game-btn btn-primary shadow-[0_4px_0_#1d4ed8] active:translate-y-1 active:shadow-none py-3 sm:py-4 text-lg sm:text-xl">
                <span>▶</span> 게임 시작
              </button>
            </div>

            {/* Operation Instructions - Responsive Layout */}
            <div className="mt-6 sm:mt-8 flex flex-col items-center gap-3 sm:gap-4 bg-zinc-950/40 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl border border-zinc-800/50 w-full max-w-[280px] sm:max-w-xs shrink-0">
              <h3 className="stat-label text-blue-400 text-[10px] sm:text-[12px]">HOW TO PLAY</h3>
              <div className="flex justify-around w-full items-center">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-zinc-500 text-[8px] sm:text-[10px] font-bold uppercase tracking-tighter">PC</span>
                  <span className="text-white text-[10px] sm:text-xs font-bold retro-text whitespace-nowrap">← → 방향키</span>
                </div>
                <div className="h-6 sm:h-8 w-px bg-zinc-800"></div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-zinc-500 text-[8px] sm:text-[10px] font-bold uppercase tracking-tighter">MOBILE</span>
                  <span className="text-white text-[10px] sm:text-xs font-bold retro-text whitespace-nowrap">드래그 & 스와이프</span>
                </div>
              </div>
            </div>

            {/* Footer - Responsive Margin */}
            <footer className="mt-8 sm:mt-12 text-zinc-500 text-[10px] sm:text-sm font-bold tracking-wider opacity-60 text-center px-4">
              학과: 경영학부 | 학번: 202102958 | 이름: 정성원
            </footer>
          </div>
        )}

        {gameState === "STARTING" && (
          <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-md">
            <span className="text-[12rem] font-black text-white retro-text animate-ping">{countdown > 0 ? countdown : "GO!"}</span>
          </div>
        )}

        {gameState === "PAUSED" && (
          <div className="absolute inset-0 z-[120] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
            <h2 className="text-6xl font-black mb-12 retro-text text-blue-400">PAUSED</h2>
            <button onClick={handlePause} className="game-btn btn-primary">RESUME</button>
          </div>
        )}

        {(gameState === "GAMEOVER" || gameState === "SUCCESS") && (
          <div className="absolute inset-0 z-[120] flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px] p-8 text-center">
            {gameState === "SUCCESS" ? (
              <>
                <div className="text-7xl mb-4">🏆</div>
                <h2 className="text-5xl font-black text-emerald-400 mb-2 retro-text">MISSION COMPLETE!</h2>
                <p className="text-zinc-400 mb-2 text-lg">{playerName}님, 미션을 성공했습니다!</p>
                <p className="text-2xl font-mono text-white mb-6 retro-text">MY RECORD: {formatTime(time)}</p>
                <div className="w-full max-w-sm bg-zinc-950/50 rounded-2xl border border-zinc-800 p-6 mb-8">
                  <h3 className="stat-label mb-4 text-center text-blue-400">🏆 TOP 3 RANKINGS</h3>
                  {isSaving ? (
                    <div className="py-4 animate-pulse text-zinc-500 retro-text">SAVING RECORD...</div>
                  ) : (
                    <div className="space-y-3">
                      {rankings.length > 0 ? rankings.map((rank, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-zinc-800/50 pb-2 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-zinc-300 text-black' : 'bg-orange-600 text-white'}`}>
                              {i + 1}
                            </span>
                            <span className="text-white font-bold retro-text">{rank.name}</span>
                          </div>
                          <span className="text-blue-400 font-mono font-bold retro-text">{rank.finishtime}</span>
                        </div>
                      )) : (
                        <p className="text-zinc-600 italic py-2">No records yet</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-8xl mb-6">💀</div>
                <h2 className="text-6xl font-black text-red-500 mb-4 retro-text">MISSION FAILED</h2>
                <p className="text-zinc-400 mb-10 text-xl">미션 실패! 다시 도전하시겠습니까?</p>
              </>
            )}
            <button onClick={handleExit} className="game-btn btn-primary shadow-[0_4px_0_#1d4ed8]">다시 시작</button>
          </div>
        )}
      </div>

      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>
    </main>
  );
}
