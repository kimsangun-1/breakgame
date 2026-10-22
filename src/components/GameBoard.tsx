"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { saveGameSuccessRecord } from "@/utils/ranking";
import RankingBoard from "@/components/RankingBoard";

// 5 rows x 8 columns = 40 bricks
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const TOTAL_BRICKS = BRICK_ROWS * BRICK_COLS; // 40
const RED_BRICK_COUNT = 12; // 30%

// Colors definition
const BRICK_COLORS = {
  LIGHT_RED: "#fca5a5",     // tailwind red-300
  LIGHT_ORANGE: "#fdba74",  // tailwind orange-300
  LIGHT_YELLOW: "#fde047",  // tailwind yellow-300
  LIGHT_GREEN: "#86efac",   // tailwind green-300
  LIGHT_BLUE: "#93c5fd",    // tailwind blue-300
  LIGHT_PURPLE: "#d8b4fe",  // tailwind purple-300
};

const OTHER_COLORS = [
  BRICK_COLORS.LIGHT_ORANGE,
  BRICK_COLORS.LIGHT_YELLOW,
  BRICK_COLORS.LIGHT_GREEN,
  BRICK_COLORS.LIGHT_BLUE,
  BRICK_COLORS.LIGHT_PURPLE,
];

// Logical internal canvas coordinates (aspect ratio 4:3)
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const BASE_BALL_SPEED = 6.0; // Strictly constant scalar velocity
const TARGET_RED_BRICKS = 3; // Mission target: break 3 red bricks

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isRed: boolean;
  status: number; // 1: intact, 0: broken
}

interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  radius: number;
  alpha: number;
  life: number;
}

interface ConfettiParticle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  alpha: number;
}

interface GameBoardProps {
  userName: string;
  onRestart: () => void;
  onExit: () => void;
}

export default function GameBoard({ userName, onRestart, onExit }: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Status indicators
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [brokenBricks, setBrokenBricks] = useState(0);
  const [brokenRedBricks, setBrokenRedBricks] = useState(0);
  const [isBgmOn, setIsBgmOn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(3); // Initial countdown: 3 -> 2 -> 1 -> null (play)
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0); // In milliseconds
  const [finalTimeFormatted, setFinalTimeFormatted] = useState<string | null>(null);
  const [rankingRefreshTrigger, setRankingRefreshTrigger] = useState(0);

  const isPausedRef = useRef(false);
  const countdownRef = useRef<number | null>(3);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef<number>(0);

  // High precision timer refs
  const gameStartTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);
  const lastActiveTimestampRef = useRef<number | null>(null);
  const finalTimeFormattedRef = useRef<string>("00:00");

  // Format milliseconds to mm:ss
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Sound effect generator via Web Audio API
  const playBrickHitSound = useCallback((isRed: boolean) => {
    if (isPausedRef.current || countdownRef.current !== null) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Throttle rapid repeated sounds to avoid harsh clipping (at least 40ms apart)
      const now = ctx.currentTime;
      if (now - lastSoundTimeRef.current < 0.04) return;
      lastSoundTimeRef.current = now;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch: red bricks slightly higher & brighter
      const baseFreq = isRed ? 780 : 540;
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

      // Controlled volume: soft pop sound (~0.12, lower than BGM)
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Ignore audio error gracefully
    }
  }, []);

  // Game state in refs for 60fps loop accuracy
  const paddleRef = useRef({
    width: 120,
    height: 14,
    x: (CANVAS_WIDTH - 120) / 2,
    y: CANVAS_HEIGHT - 35,
    speed: 8.5,
  });

  const ballRef = useRef({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 65,
    radius: 9,
    dx: 3.5,
    dy: -4.8,
  });

  const bricksRef = useRef<Brick[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const confettiRef = useRef<ConfettiParticle[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const isMissionSuccessRef = useRef(false);
  const successHandledRef = useRef(false);
  
  // Strictly keyboard arrow keys (ArrowLeft, ArrowRight)
  const leftPressed = useRef(false);
  const rightPressed = useRef(false);

  // Keep ref sync with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Audio setup: Hyper_Speed_Run.mp3 with low volume (0.2), loop playback
  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    try {
      audio = new Audio("/Hyper_Speed_Run.mp3");
      audio.loop = true;
      audio.volume = 0.2; // Initial low volume (0.2)
      audioRef.current = audio;

      // Auto-play immediately after entering game board (user gesture was 'Game Start' click)
      audio.play().then(() => {
        setIsBgmOn(true);
      }).catch((err) => {
        // Autoplay policy fallback: normal gameplay continues even if sound is blocked
        console.info("[GameBoard] Autoplay blocked, game continues normally:", err.message);
        setIsBgmOn(false);
      });
    } catch (err) {
      console.warn("[GameBoard] Audio initialization failed:", err);
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      audioRef.current = null;
    };
  }, []);

  // Sync BGM with pause / resume states
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPaused) {
      audioRef.current.pause();
    } else if (isBgmOn) {
      audioRef.current.play().catch(() => {});
    }
  }, [isPaused, isBgmOn]);

  // Initial 3 -> 2 -> 1 Countdown timer (runs ONCE at start)
  useEffect(() => {
    countdownRef.current = 3;
    setCountdown(3);

    const timer1 = setTimeout(() => {
      countdownRef.current = 2;
      setCountdown(2);
    }, 1000);

    const timer2 = setTimeout(() => {
      countdownRef.current = 1;
      setCountdown(1);
    }, 2000);

    const timer3 = setTimeout(() => {
      countdownRef.current = null;
      setCountdown(null);
      // Start time measurement EXACTLY when countdown finishes and ball starts moving
      const now = performance.now();
      gameStartTimeRef.current = now;
      lastActiveTimestampRef.current = now;
    }, 3000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const toggleBgm = () => {
    if (!audioRef.current) return;
    if (isBgmOn) {
      audioRef.current.pause();
      setIsBgmOn(false);
    } else {
      audioRef.current.play().then(() => setIsBgmOn(true)).catch((err) => {
        console.warn("Audio playback error:", err);
      });
    }
  };

  const togglePause = () => {
    // If mission ended (success or fail), pause cannot be toggled
    if (isMissionSuccessRef.current || lives <= 0) return;

    setIsPaused((prev) => {
      const next = !prev;
      const now = performance.now();
      if (next) {
        // Pausing: accumulate time spent active
        if (lastActiveTimestampRef.current !== null && countdownRef.current === null && !isMissionSuccessRef.current) {
          accumulatedTimeRef.current += (now - lastActiveTimestampRef.current);
          lastActiveTimestampRef.current = null;
        }
      } else {
        // Resuming: mark new active timestamp
        if (countdownRef.current === null && !isMissionSuccessRef.current) {
          lastActiveTimestampRef.current = now;
        }
      }
      return next;
    });
  };

  // Generate bricks: exactly 12 light red, 28 other 5 colors randomly, shuffled
  const initBricks = useCallback(() => {
    const colorsList: string[] = [];
    for (let i = 0; i < RED_BRICK_COUNT; i++) {
      colorsList.push(BRICK_COLORS.LIGHT_RED);
    }
    for (let i = 0; i < TOTAL_BRICKS - RED_BRICK_COUNT; i++) {
      const randColor = OTHER_COLORS[Math.floor(Math.random() * OTHER_COLORS.length)];
      colorsList.push(randColor);
    }

    // Fisher-Yates Shuffle
    for (let i = colorsList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorsList[i], colorsList[j]] = [colorsList[j], colorsList[i]];
    }

    const padding = 10;
    const offsetTop = 55;
    const offsetLeft = 35;
    const totalAvailableWidth = CANVAS_WIDTH - offsetLeft * 2 - padding * (BRICK_COLS - 1);
    const brickWidth = totalAvailableWidth / BRICK_COLS;
    const brickHeight = 24;

    const bricks: Brick[] = [];
    let index = 0;

    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const brickX = offsetLeft + c * (brickWidth + padding);
        const brickY = offsetTop + r * (brickHeight + padding);
        const color = colorsList[index];
        bricks.push({
          x: brickX,
          y: brickY,
          width: brickWidth,
          height: brickHeight,
          color: color,
          isRed: color === BRICK_COLORS.LIGHT_RED,
          status: 1,
        });
        index++;
      }
    }
    bricksRef.current = bricks;
  }, []);

  // Keyboard handlers: ONLY ArrowLeft and ArrowRight, prevent browser scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        leftPressed.current = true;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        rightPressed.current = true;
      } else if (e.key === " " || e.key === "p" || e.key === "P") {
        // Space or P to pause
        e.preventDefault();
        togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        leftPressed.current = false;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        rightPressed.current = false;
      }
    };

    // When the window loses focus, reset keys to prevent paddle runaway
    const handleBlur = () => {
      leftPressed.current = false;
      rightPressed.current = false;
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Mouse / Touch paddle controller mapped accurately via getBoundingClientRect
  const handlePointerMove = (clientX: number) => {
    if (isPausedRef.current || isMissionSuccessRef.current || lives <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const scaleX = CANVAS_WIDTH / rect.width;
    const relativeX = (clientX - rect.left) * scaleX;

    const paddle = paddleRef.current;
    let newX = relativeX - paddle.width / 2;
    if (newX < 0) newX = 0;
    if (newX + paddle.width > CANVAS_WIDTH) newX = CANVAS_WIDTH - paddle.width;
    paddle.x = newX;
  };

  // Native non-passive touch listeners for mobile swipe without horizontal scroll conflicts
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        handlePointerMove(e.touches[0].clientX);
      }
    };

    const onTouchMoveNative = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault(); // Prevents horizontal navigation swipe and page bounce
        handlePointerMove(e.touches[0].clientX);
      }
    };

    canvas.addEventListener("touchstart", onTouchStartNative, { passive: false });
    canvas.addEventListener("touchmove", onTouchMoveNative, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStartNative);
      canvas.removeEventListener("touchmove", onTouchMoveNative);
    };
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerMove(e.clientX);
  };

  // Confetti explosion animation for Mission Success
  const triggerConfetti = () => {
    const confettiColors = ["#f43f5e", "#38bdf8", "#facc15", "#4ade80", "#a855f7", "#fb923c", "#ffffff"];
    const list: ConfettiParticle[] = [];
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      list.push({
        x: CANVAS_WIDTH / 2 + (Math.random() * 200 - 100),
        y: CANVAS_HEIGHT / 2 - 40,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 4, // initial upwards burst
        size: Math.random() * 8 + 5,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
      });
    }
    confettiRef.current = list;
  };

  // Spark / Brick shattering visual effects
  const spawnBrickParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      particlesRef.current.push({
        x,
        y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        color,
        radius: Math.random() * 2.5 + 1.5,
        alpha: 1,
        life: 25,
      });
    }
  };

  // Main Game Loop
  useEffect(() => {
    initBricks();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let currentLives = 3;
    let currentScore = 0;
    let currentBroken = 0;
    let currentRedBroken = 0;

    const updateAndDraw = () => {
      const paddle = paddleRef.current;
      const ball = ballRef.current;

      const isCountingDown = countdownRef.current !== null;
      const paused = isPausedRef.current;

      // 1. Paddle movement via Left/Right arrow keys strictly
      if (!paused && !isMissionSuccessRef.current) {
        if (leftPressed.current && !rightPressed.current) {
          paddle.x = Math.max(0, paddle.x - paddle.speed);
        } else if (rightPressed.current && !leftPressed.current) {
          paddle.x = Math.min(CANVAS_WIDTH - paddle.width, paddle.x + paddle.speed);
        }
      }

      // 2. Ball movement & Physics (ONLY active when countdown finished AND not paused AND game alive AND not succeeded)
      if (!isCountingDown && !paused && currentLives > 0 && !isMissionSuccessRef.current) {
        // Initialize timer starting reference if not yet set
        const now = performance.now();
        if (lastActiveTimestampRef.current === null) {
          lastActiveTimestampRef.current = now;
        }

        // Update active timer in real time
        const currentTotalMs = accumulatedTimeRef.current + (now - lastActiveTimestampRef.current);
        setElapsedTimeMs(currentTotalMs);

        ball.x += ball.dx;
        ball.y += ball.dy;

        // Maintain constant velocity magnitude
        const currentSpeed = Math.hypot(ball.dx, ball.dy);
        if (currentSpeed > 0 && Math.abs(currentSpeed - BASE_BALL_SPEED) > 0.05) {
          ball.dx = (ball.dx / currentSpeed) * BASE_BALL_SPEED;
          ball.dy = (ball.dy / currentSpeed) * BASE_BALL_SPEED;
        }

        // Left & Right Wall Collision
        if (ball.x - ball.radius <= 0) {
          ball.x = ball.radius;
          ball.dx = Math.abs(ball.dx); // Always rebound right
        } else if (ball.x + ball.radius >= CANVAS_WIDTH) {
          ball.x = CANVAS_WIDTH - ball.radius;
          ball.dx = -Math.abs(ball.dx); // Always rebound left
        }

        // Top Wall Collision
        if (ball.y - ball.radius <= 0) {
          ball.y = ball.radius;
          ball.dy = Math.abs(ball.dy); // Always rebound downwards
        }

        // Paddle Collision (Natural angle based on hit location)
        if (
          ball.y + ball.radius >= paddle.y &&
          ball.y - ball.radius <= paddle.y + paddle.height &&
          ball.x >= paddle.x &&
          ball.x <= paddle.x + paddle.width &&
          ball.dy > 0
        ) {
          const hitPoint = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
          const clampedHit = Math.max(-0.95, Math.min(0.95, hitPoint));

          const maxAngle = (65 * Math.PI) / 180;
          const bounceAngle = clampedHit * maxAngle;

          ball.dx = BASE_BALL_SPEED * Math.sin(bounceAngle);
          ball.dy = -BASE_BALL_SPEED * Math.cos(bounceAngle);
          ball.y = paddle.y - ball.radius - 0.5;
        }

        // Brick Collision (Single hit per frame strictly to avoid duplicate breakage)
        const bricks = bricksRef.current;
        for (let i = 0; i < bricks.length; i++) {
          const b = bricks[i];
          if (b.status === 1) {
            const closestX = Math.max(b.x, Math.min(ball.x, b.x + b.width));
            const closestY = Math.max(b.y, Math.min(ball.y, b.y + b.height));

            const distX = ball.x - closestX;
            const distY = ball.y - closestY;
            const distanceSquared = distX * distX + distY * distY;

            if (distanceSquared <= ball.radius * ball.radius) {
              b.status = 0;

              currentScore += b.isRed ? 20 : 10;
              currentBroken += 1;
              if (b.isRed) currentRedBroken += 1;

              setScore(currentScore);
              setBrokenBricks(currentBroken);
              setBrokenRedBricks(currentRedBroken);

              // Play gentle hit sound
              playBrickHitSound(b.isRed);

              // Check for mission success condition: 3 red bricks broken
              if (currentRedBroken >= TARGET_RED_BRICKS && !successHandledRef.current) {
                successHandledRef.current = true;
                isMissionSuccessRef.current = true;

                // Stop timer immediately and lock final elapsed time
                const finishTime = performance.now();
                let finalMs = accumulatedTimeRef.current;
                if (lastActiveTimestampRef.current !== null) {
                  finalMs += (finishTime - lastActiveTimestampRef.current);
                }
                lastActiveTimestampRef.current = null;
                accumulatedTimeRef.current = finalMs;
                setElapsedTimeMs(finalMs);
                const formatted = formatTime(finalMs);
                finalTimeFormattedRef.current = formatted;
                setFinalTimeFormatted(formatted);

                // Stop ball and paddle movement
                ball.dx = 0;
                ball.dy = 0;

                // Trigger confetti celebration
                triggerConfetti();

                // Save SUCCESS record to Google Sheets asynchronously and refresh ranking
                saveGameSuccessRecord(userName, finalMs, formatted)
                  .then(() => {
                    // Trigger ranking board refresh after small delay
                    setTimeout(() => {
                      setRankingRefreshTrigger((prev) => prev + 1);
                    }, 1200);
                  })
                  .catch((err) => {
                    console.warn("[GameBoard] Auto save record failed:", err);
                  });

                // Stop BGM
                if (audioRef.current) {
                  audioRef.current.pause();
                }
                break;
              }

              spawnBrickParticles(closestX, closestY, b.color);

              const overlapX = ball.radius - Math.abs(distX);
              const overlapY = ball.radius - Math.abs(distY);

              if (overlapX < overlapY && Math.abs(distX) > 0.001) {
                ball.dx = -ball.dx;
                ball.x += (distX > 0 ? overlapX : -overlapX);
              } else {
                ball.dy = -ball.dy;
                ball.y += (distY > 0 ? overlapY : -overlapY);
              }

              const speed = Math.hypot(ball.dx, ball.dy);
              if (speed > 0) {
                ball.dx = (ball.dx / speed) * BASE_BALL_SPEED;
                ball.dy = (ball.dy / speed) * BASE_BALL_SPEED;
              }

              break;
            }
          }
        }

        // Bottom boundary (Life loss)
        if (ball.y - ball.radius > CANVAS_HEIGHT) {
          currentLives -= 1;
          setLives(currentLives);

          if (currentLives > 0) {
            // Immediate relaunch WITHOUT 3-2-1 countdown!
            paddle.x = (CANVAS_WIDTH - paddle.width) / 2;
            ball.x = CANVAS_WIDTH / 2;
            ball.y = CANVAS_HEIGHT - 65;
            const launchAngle = (Math.random() * 0.8 - 0.4);
            ball.dx = BASE_BALL_SPEED * Math.sin(launchAngle);
            ball.dy = -BASE_BALL_SPEED * Math.cos(launchAngle);
          } else {
            // Game Over (freeze ball)
            ball.dx = 0;
            ball.dy = 0;
            if (audioRef.current) {
              audioRef.current.pause();
            }
          }
        }
      }

      // 3. RENDER
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Background subtle grid/fill
      ctx.fillStyle = "#0a0f1d";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Bricks
      const currentBricks = bricksRef.current;
      for (let i = 0; i < currentBricks.length; i++) {
        const b = currentBricks[i];
        if (b.status === 1) {
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.width, b.height, 5);
          ctx.fillStyle = b.color;
          ctx.fill();

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.stroke();

          if (b.isRed) {
            ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
            ctx.beginPath();
            ctx.arc(b.x + b.width / 2, b.y + b.height / 2, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Draw & Update Shatter Particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!paused) {
          p.x += p.dx;
          p.y += p.dy;
          p.alpha -= 1 / p.life;
        }
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw & Update Confetti Particles
      const confetti = confettiRef.current;
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.dx;
        c.y += c.dy;
        c.dy += 0.15; // Gravity
        c.rotation += c.rotationSpeed;
        c.alpha -= 0.005;

        if (c.alpha <= 0 || c.y > CANVAS_HEIGHT) {
          confetti.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, c.alpha);
        ctx.translate(c.x, c.y);
        ctx.rotate((c.rotation * Math.PI) / 180);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        ctx.restore();
      }

      // Draw Paddle
      ctx.save();
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 7);
      ctx.fillStyle = "#0284c7";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#e0f2fe";
      ctx.stroke();
      ctx.restore();

      // Draw Ball
      ctx.save();
      ctx.shadowColor = "#f43f5e";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fb7185";
      ctx.stroke();
      ctx.restore();

      // OVERLAY 1: Countdown 3 -> 2 -> 1 (Initial start only)
      if (countdownRef.current !== null) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.font = "bold 90px sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#0284c7";
        ctx.shadowBlur = 24;
        ctx.fillText(String(countdownRef.current), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);

        ctx.font = "bold 20px sans-serif";
        ctx.fillStyle = "#f8fafc";
        ctx.shadowBlur = 0;
        ctx.fillText("준비하세요!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
        ctx.restore();
      }

      // OVERLAY 2: Pause Overlay
      if (paused && countdownRef.current === null && currentLives > 0 && currentBroken < TOTAL_BRICKS) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.font = "bold 38px sans-serif";
        ctx.fillStyle = "#facc15";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⏸️ 일시 정지 (PAUSED)", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15);

        ctx.font = "16px sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText("계속하려면 상단의 [▶️ 계속하기] 또는 스페이스바를 누르세요", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
        ctx.restore();
      }

      // OVERLAY 3: Game Over (Mission Failed) or Mission Success
      if (currentLives <= 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.font = "bold 38px sans-serif";
        ctx.fillStyle = "#ef4444";
        ctx.textAlign = "center";
        ctx.fillText("게임 미션 실패", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

        ctx.font = "16px sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText("상단의 [🔄 재시작] 버튼을 눌러 다시 도전하세요!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
      } else if (isMissionSuccessRef.current) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.save();
        ctx.font = "bold 42px sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.shadowColor = "#0284c7";
        ctx.shadowBlur = 18;
        ctx.textAlign = "center";
        ctx.fillText("🎉 게임 미션 성공! 🎉", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
        ctx.restore();

        ctx.font = "bold 22px sans-serif";
        ctx.fillStyle = "#facc15";
        ctx.textAlign = "center";
        ctx.fillText(`플레이어: ${userName}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 15);

        ctx.font = "bold 24px monospace";
        ctx.fillStyle = "#4ade80";
        ctx.textAlign = "center";
        const displayTime = finalTimeFormattedRef.current || finalTimeFormatted || formatTime(accumulatedTimeRef.current);
        ctx.fillText(`⏱️ 최종 완료 시간: ${displayTime}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 52);

        ctx.font = "15px sans-serif";
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText("목표 빨강 벽돌 3개를 모두 제거했습니다!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 85);

        ctx.font = "bold 14px sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText("💡 상단의 [🔄 다시 시작] 버튼을 누르면 즉시 새 게임이 시작됩니다", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 115);
      }

      animationFrameId.current = requestAnimationFrame(updateAndDraw);
    };

    animationFrameId.current = requestAnimationFrame(updateAndDraw);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [initBricks]);

  // Restart function
  const restartGame = () => {
    initBricks();
    particlesRef.current = [];
    confettiRef.current = [];
    isMissionSuccessRef.current = false;
    successHandledRef.current = false;
    accumulatedTimeRef.current = 0;
    lastActiveTimestampRef.current = null;
    gameStartTimeRef.current = null;
    finalTimeFormattedRef.current = "00:00";
    setElapsedTimeMs(0);
    setFinalTimeFormatted(null);
    setScore(0);
    setLives(3);
    setBrokenBricks(0);
    setBrokenRedBricks(0);
    setIsPaused(false);
    paddleRef.current.x = (CANVAS_WIDTH - paddleRef.current.width) / 2;
    ballRef.current.x = CANVAS_WIDTH / 2;
    ballRef.current.y = CANVAS_HEIGHT - 65;
    ballRef.current.dx = 3.5;
    ballRef.current.dy = -4.8;

    // Reset initial countdown on explicit full restart
    countdownRef.current = 3;
    setCountdown(3);
    setTimeout(() => {
      countdownRef.current = 2;
      setCountdown(2);
    }, 1000);
    setTimeout(() => {
      countdownRef.current = 1;
      setCountdown(1);
    }, 2000);
    setTimeout(() => {
      countdownRef.current = null;
      setCountdown(null);
    }, 3000);

    if (audioRef.current && isBgmOn) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="w-full max-w-4xl flex flex-col items-center">
      {/* Top Status Dashboard */}
      <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-2.5 sm:p-4 mb-2.5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-xs sm:text-sm">
        {/* Upper row on mobile: Player info + Stats */}
        <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
          {/* Player & Mascot Info */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-cyan-400/50 bg-slate-800 shrink-0">
              <Image
                src="/Mascot.jpg"
                alt="횃불이"
                fill
                className="object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] text-slate-400">플레이어</div>
              <div className="font-bold text-cyan-300 text-xs sm:text-sm truncate max-w-[90px] sm:max-w-none">{userName}</div>
            </div>
          </div>

          {/* Game Stats Mini Grid */}
          <div className="flex items-center gap-2.5 sm:gap-4 bg-slate-950/70 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-400 text-[9px] sm:text-[11px] block">진행 시간</span>
              <span className="font-mono font-bold text-cyan-300 text-xs sm:text-base">
                {formatTime(elapsedTimeMs)}
              </span>
            </div>
            <div className="w-px h-5 sm:h-6 bg-slate-800" />
            <div>
              <span className="text-slate-400 text-[9px] sm:text-[11px] block">생명</span>
              <span className="font-extrabold text-rose-400 text-xs sm:text-base tracking-tighter">
                {"❤️".repeat(Math.max(0, lives))}
              </span>
            </div>
            <div className="w-px h-5 sm:h-6 bg-slate-800" />
            <div>
              <span className="text-rose-400 text-[9px] sm:text-[11px] block font-semibold">빨강 목표</span>
              <span className="font-extrabold text-rose-300 text-xs sm:text-base">
                {brokenRedBricks}/3
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
          {/* 일시정지 버튼 */}
          <button
            onClick={togglePause}
            disabled={isMissionSuccessRef.current || lives <= 0}
            className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition ${
              isPaused
                ? "bg-amber-600/30 border-amber-500 text-amber-200"
                : "bg-slate-800 border-slate-700 text-slate-300"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isPaused ? "▶️ 계속" : "⏸️ 일시정지"}
          </button>

          {/* 다시 시작 버튼 */}
          <button
            onClick={() => {
              restartGame();
            }}
            className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] sm:text-xs shadow transition active:scale-95 cursor-pointer"
          >
            🔄 다시 시작
          </button>

          {/* 게임 종료 버튼 */}
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
              onExit();
            }}
            className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 font-medium text-[11px] sm:text-xs transition active:scale-95"
          >
            ⏹️ 종료
          </button>

          {/* BGM 토글 */}
          <button
            onClick={toggleBgm}
            className={`px-2 sm:px-2.5 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition ${
              isBgmOn
                ? "bg-emerald-600/30 border-emerald-500 text-emerald-200"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
            title="BGM 토글"
          >
            {isBgmOn ? "🔊 BGM" : "🔇"}
          </button>
        </div>
      </div>

      {/* Game Board Canvas Container (Maintains 4:3 Aspect Ratio) */}
      <div className="w-full relative rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-black touch-none select-none">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseMove={onMouseMove}
          className="w-full h-auto aspect-[4/3] block cursor-ew-resize touch-none"
        />
      </div>

      {/* Control Help bar */}
      <div className="w-full mt-2.5 flex flex-wrap items-center justify-between text-[11px] sm:text-xs text-slate-400 px-1 sm:px-2 gap-1 mb-4">
        <p className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <span>🎮 조작:</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono">
            ← / →
          </span>
          <span>또는 모바일 터치 스와이프</span>
        </p>
        <p className="text-[10px] sm:text-[11px] text-slate-500">
          * 터치 시 브라우저 스크롤 차단 적용
        </p>
      </div>

      {/* Top 3 Ranking Board */}
      <RankingBoard refreshTrigger={rankingRefreshTrigger} />
    </div>
  );
}
