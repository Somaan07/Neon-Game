/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Zap, Bot, User, ChevronRight, Car, Bird } from 'lucide-react';

// --- Constants ---
const GRAVITY = 0.25;
const JUMP_STRENGTH = -6; // Increased by 20% from -5
const PIPE_SPEED = 3;
const PIPE_SPAWN_RATE = 1500; // ms
const PIPE_WIDTH = 60;
const PIPE_GAP = 160;
const BIRD_SIZE = 34;

// Crossy Mode Constants
const LANE_HEIGHT = 60;
const PLAYER_SIZE = 40;

interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
  id: number;
}

interface Obstacle {
  x: number;
  width: number;
  id: number;
  type: 'CAR' | 'TRAIN' | 'SNAKE';
  offset?: number;
}

interface Lane {
  index: number;
  type: 'ROAD' | 'GRASS' | 'RAIL';
  speed: number;
  obstacles: Obstacle[];
  color: string;
  warning?: number;
}

interface Theme {
  bird: string;
  bg: string;
  pipe: string;
  grid: string;
  accent: string;
  ballStyle: 'solid' | 'ring' | 'striped' | 'dotted' | 'glow' | 'square' | 'diamond' | 'target' | 'spiral' | 'burst';
}

const THEMES: Theme[] = [
  { bird: '#FF00FF', bg: '#050505', pipe: '#00FF00', grid: 'rgba(0, 255, 0, 0.05)', accent: '#00FF00', ballStyle: 'solid' }, // 0-9
  { bird: '#00FFFF', bg: '#001122', pipe: '#FF00FF', grid: 'rgba(255, 0, 255, 0.1)', accent: '#FF00FF', ballStyle: 'ring' }, // 10-19
  { bird: '#FFFF00', bg: '#221100', pipe: '#00FFFF', grid: 'rgba(0, 255, 255, 0.1)', accent: '#00FFFF', ballStyle: 'striped' }, // 20-29
  { bird: '#FF4444', bg: '#110011', pipe: '#FFFF00', grid: 'rgba(255, 255, 0, 0.1)', accent: '#FFFF00', ballStyle: 'dotted' }, // 30-39
  { bird: '#44FF44', bg: '#001100', pipe: '#FF4444', grid: 'rgba(255, 68, 68, 0.1)', accent: '#FF4444', ballStyle: 'glow' }, // 40-49
  { bird: '#FFFFFF', bg: '#111111', pipe: '#888888', grid: 'rgba(255, 255, 255, 0.05)', accent: '#FFFFFF', ballStyle: 'square' }, // 50-59
  { bird: '#FFA500', bg: '#1a0a00', pipe: '#0000FF', grid: 'rgba(0, 0, 255, 0.1)', accent: '#0000FF', ballStyle: 'diamond' }, // 60-69
  { bird: '#8A2BE2', bg: '#0a001a', pipe: '#7FFF00', grid: 'rgba(127, 255, 0, 0.1)', accent: '#7FFF00', ballStyle: 'target' }, // 70-79
  { bird: '#FF1493', bg: '#1a000a', pipe: '#00CED1', grid: 'rgba(0, 206, 209, 0.1)', accent: '#00CED1', ballStyle: 'spiral' }, // 80-89
  { bird: '#ADFF2F', bg: '#0a1a00', pipe: '#FF4500', grid: 'rgba(255, 69, 0, 0.1)', accent: '#FF4500', ballStyle: 'burst' }, // 90-99
];

type GameMode = 'FLAP' | 'CROSS';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<GameMode | null>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);
  const [highScoreFlap, setHighScoreFlap] = useState(0);
  const [highScoreCross, setHighScoreCross] = useState(0);
  const [isGodMode, setIsGodMode] = useState(false);
  
  // Flap state refs
  const birdY = useRef(300);
  const birdVelocity = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const lastPipeTime = useRef(0);
  
  // Cross state refs
  const playerLane = useRef(1);
  const playerX = useRef(200);
  const playerY = useRef(540);
  const playerVisualY = useRef(540);
  const lanes = useRef<Map<number, Lane>>(new Map());
  const laneCount = useRef(0);
  const cameraY = useRef(-240);
  const targetCameraY = useRef(-240);
  
  const frameId = useRef<number>(0);
  const scoreRef = useRef(0);
  const isSpacePressed = useRef(false);

  // Theme calculation
  const currentTheme = useMemo(() => {
    const index = Math.floor(score / 10) % THEMES.length;
    return THEMES[index];
  }, [score]);

  const createLane = useCallback((index: number): Lane => {
    const isSafe = index < 6;
    const typeRand = Math.random();
    let type: Lane['type'] = 'ROAD';
    if (isSafe || typeRand < 0.3) type = 'GRASS';
    else if (typeRand < 0.36) type = 'RAIL';

    const speed = type === 'GRASS' ? 0 : (Math.random() > 0.5 ? 1 : -1) * (Math.random() * (type === 'RAIL' ? 7 : 3) + (type === 'RAIL' ? 7 : 2));
    
    const obstacles: Obstacle[] = [];
    if (type === 'ROAD') {
      const count = 1 + Math.floor(Math.random() * 2);
      for (let j = 0; j < count; j++) {
        obstacles.push({ x: Math.random() * 400, width: 35, id: Math.random(), type: 'CAR' });
      }
    } else if (type === 'RAIL') {
      obstacles.push({ x: -1200, width: 1000, id: Math.random(), type: 'TRAIN' });
    } else if (type === 'GRASS' && !isSafe && Math.random() < 0.2) {
      obstacles.push({ x: Math.random() * 400, width: 40, id: Math.random(), type: 'SNAKE', offset: Math.random() * Math.PI * 2 });
    }

    return {
      index,
      type,
      speed,
      obstacles,
      color: type === 'GRASS' ? 'rgba(0, 255, 0, 0.03)' : type === 'RAIL' ? 'rgba(255, 255, 255, 0.01)' : 'rgba(255, 255, 255, 0.03)'
    };
  }, []);

  const initCrossLanes = useCallback(() => {
    lanes.current.clear();
    laneCount.current = 0;
    for (let i = 0; i < 50; i++) {
      lanes.current.set(i, createLane(i));
      laneCount.current++;
    }
  }, [createLane]);

  const initGame = useCallback(() => {
    if (mode === 'FLAP') {
      birdY.current = 300;
      birdVelocity.current = 0;
      pipes.current = [];
      lastPipeTime.current = 0;
    } else {
      playerLane.current = 1;
      playerX.current = 200 - PLAYER_SIZE / 2;
      playerY.current = 600 - playerLane.current * LANE_HEIGHT - (LANE_HEIGHT - PLAYER_SIZE) / 2 - PLAYER_SIZE;
      playerVisualY.current = playerY.current;
      targetCameraY.current = 300 - (playerY.current + PLAYER_SIZE / 2);
      cameraY.current = targetCameraY.current;
      initCrossLanes();
    }
    scoreRef.current = 0;
    setScore(0);
  }, [mode, initCrossLanes]);

  const jump = useCallback(() => {
    if (gameState === 'PLAYING') {
      if (mode === 'FLAP') {
        birdVelocity.current = JUMP_STRENGTH;
      } else {
        playerLane.current += 1;
        playerY.current = 600 - playerLane.current * LANE_HEIGHT - (LANE_HEIGHT - PLAYER_SIZE) / 2 - PLAYER_SIZE;
        scoreRef.current += 1;
        setScore(scoreRef.current);
        targetCameraY.current = 300 - (playerY.current + PLAYER_SIZE / 2);
      }
    } else if (gameState === 'START' || gameState === 'GAME_OVER') {
      initGame();
      setGameState('PLAYING');
    }
  }, [gameState, mode, initGame]);

  // Handle Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!isSpacePressed.current) {
          jump();
        }
        isSpacePressed.current = true;
      }
      if (mode === 'CROSS' && gameState === 'PLAYING') {
        if (e.code === 'ArrowLeft') {
          playerX.current -= 40;
          e.preventDefault();
        }
        if (e.code === 'ArrowRight') {
          playerX.current += 40;
          e.preventDefault();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        isSpacePressed.current = false;
      }
    };
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (!isSpacePressed.current) {
        jump();
      }
      isSpacePressed.current = true;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      isSpacePressed.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [jump, mode, gameState]);

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mode) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const update = (time: number) => {
      if (gameState === 'PLAYING') {
        if (mode === 'FLAP') {
          // God Mode Logic
          if (isGodMode) {
            const nextPipe = pipes.current.find(p => p.x + PIPE_WIDTH > 50);
            const targetY = nextPipe 
              ? nextPipe.topHeight + PIPE_GAP / 2 - BIRD_SIZE / 2 
              : canvas.height / 2;
            if (birdY.current > targetY + 10) birdVelocity.current = JUMP_STRENGTH;
          }

          // Original Physics: No hold-to-fly
          birdVelocity.current += GRAVITY;
          if (birdVelocity.current < -8) birdVelocity.current = -8;
          birdY.current += birdVelocity.current;

          if (time - lastPipeTime.current > PIPE_SPAWN_RATE) {
            const minPipeHeight = 50;
            const maxPipeHeight = canvas.height - PIPE_GAP - minPipeHeight;
            const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1)) + minPipeHeight;
            pipes.current.push({ x: canvas.width, topHeight, passed: false, id: Date.now() });
            lastPipeTime.current = time;
          }

          pipes.current.forEach(pipe => {
            pipe.x -= PIPE_SPEED;
            const birdLeft = 50, birdRight = 50 + BIRD_SIZE, birdTop = birdY.current, birdBottom = birdY.current + BIRD_SIZE;
            const pipeLeft = pipe.x, pipeRight = pipe.x + PIPE_WIDTH;
            if (birdRight > pipeLeft && birdLeft < pipeRight) {
              if (birdTop < pipe.topHeight || birdBottom > pipe.topHeight + PIPE_GAP) {
                if (!isGodMode) setGameState('GAME_OVER');
              }
            }
            if (!pipe.passed && pipe.x + PIPE_WIDTH < 50) {
              pipe.passed = true;
              scoreRef.current += 1;
              setScore(scoreRef.current);
            }
          });
          pipes.current = pipes.current.filter(pipe => pipe.x + PIPE_WIDTH > 0);
          if (birdY.current < 0 || birdY.current + BIRD_SIZE > canvas.height) {
            if (!isGodMode) setGameState('GAME_OVER');
            else {
              if (birdY.current < 0) birdY.current = 0;
              if (birdY.current + BIRD_SIZE > canvas.height) birdY.current = canvas.height - BIRD_SIZE;
              birdVelocity.current = 0;
            }
          }
        } else {
          // CROSS MODE
          // Faster camera follow to prevent player going off-screen
          cameraY.current += (targetCameraY.current - cameraY.current) * 0.15;
          playerVisualY.current += (playerY.current - playerVisualY.current) * 0.2;
          
          // God Mode AI for Cross
          if (isGodMode) {
            const nextLane = lanes.current.get(playerLane.current + 1);
            if (nextLane) {
              let safe = true;
              nextLane.obstacles.forEach(obs => {
                const ox = obs.type === 'SNAKE' ? obs.x + Math.sin(time / 200 + (obs.offset || 0)) * 30 : obs.x;
                if (playerX.current + PLAYER_SIZE > ox - 40 && playerX.current < ox + obs.width + 40) safe = false;
              });
              if (nextLane.warning && nextLane.warning > 0.1) safe = false;
              if (safe) jump();
            }
          }

          lanes.current.forEach(lane => {
            const laneY = 600 - lane.index * LANE_HEIGHT;
            
            // Train Warning Logic
            if (lane.type === 'RAIL') {
              const train = lane.obstacles.find(o => o.type === 'TRAIN');
              if (train) {
                const isEntering = lane.speed > 0 
                  ? (train.x < -50 && train.x > -500)
                  : (train.x > 450 && train.x < 900);
                lane.warning = isEntering ? (Math.sin(time / 100) * 0.5 + 0.5) : 0;
              }
            }

            lane.obstacles.forEach(obs => {
              obs.x += lane.speed;
              const margin = obs.type === 'TRAIN' ? 1000 : 200;
              if (obs.x > 400 + margin) obs.x = -obs.width - margin + 100;
              if (obs.x < -obs.width - margin) obs.x = 400 + margin - 100;

              // Collision
              let collisionX = obs.x;
              let collisionW = obs.width;

              if (obs.type === 'SNAKE') {
                collisionX += Math.sin(time / 200 + (obs.offset || 0)) * 30;
              }

              if (playerY.current < laneY + LANE_HEIGHT && playerY.current + PLAYER_SIZE > laneY) {
                if (playerX.current + PLAYER_SIZE > collisionX && playerX.current < collisionX + collisionW) {
                  if (!isGodMode) setGameState('GAME_OVER');
                }
              }
            });
          });

          // Infinite lanes generation
          const currentTopLaneIndex = Math.floor((Math.abs(cameraY.current) + 600) / LANE_HEIGHT) + 10;
          while (laneCount.current < currentTopLaneIndex) {
            lanes.current.set(laneCount.current, createLane(laneCount.current));
            laneCount.current++;
          }
          
          // Cleanup very old lanes (far below camera)
          const bottomVisibleLane = Math.floor(Math.abs(cameraY.current) / LANE_HEIGHT) - 10;
          for (const [index] of lanes.current) {
            if (index < bottomVisibleLane) {
              lanes.current.delete(index);
            }
          }
          
          if (playerX.current < 0) playerX.current = 0;
          if (playerX.current + PLAYER_SIZE > 400) playerX.current = 400 - PLAYER_SIZE;
        }
      }

      // --- Rendering ---
      ctx.fillStyle = currentTheme.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (mode === 'FLAP') {
        ctx.strokeStyle = currentTheme.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i < canvas.width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
        for (let i = 0; i < canvas.height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }

        pipes.current.forEach(pipe => {
          ctx.fillStyle = currentTheme.pipe;
          ctx.shadowBlur = 15;
          ctx.shadowColor = currentTheme.pipe;
          
          // Draw Building (Top)
          ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
          // Windows on building
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          for (let wy = 10; wy < pipe.topHeight - 10; wy += 20) {
            ctx.fillRect(pipe.x + 10, wy, 10, 10);
            ctx.fillRect(pipe.x + PIPE_WIDTH - 20, wy, 10, 10);
          }

          // Draw Building (Bottom)
          ctx.fillStyle = currentTheme.pipe;
          ctx.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, canvas.height - (pipe.topHeight + PIPE_GAP));
          // Windows on building
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          for (let wy = pipe.topHeight + PIPE_GAP + 10; wy < canvas.height - 10; wy += 20) {
            ctx.fillRect(pipe.x + 10, wy, 10, 10);
            ctx.fillRect(pipe.x + PIPE_WIDTH - 20, wy, 10, 10);
          }

          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 2;
          ctx.strokeRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
          ctx.strokeRect(pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, canvas.height - (pipe.topHeight + PIPE_GAP));
        });

        // Draw Plane
        ctx.fillStyle = currentTheme.bird;
        ctx.shadowBlur = 20;
        ctx.shadowColor = currentTheme.bird;
        const bx = 50, by = birdY.current, bs = BIRD_SIZE;
        
        ctx.beginPath();
        // Fuselage
        ctx.ellipse(bx + bs/2, by + bs/2, bs/2, bs/4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.beginPath();
        ctx.moveTo(bx, by + bs/2);
        ctx.lineTo(bx - 5, by + bs/4);
        ctx.lineTo(bx - 5, by + 3*bs/4);
        ctx.closePath();
        ctx.fill();
        // Wings
        ctx.beginPath();
        ctx.moveTo(bx + bs/2, by + bs/2);
        ctx.lineTo(bx + bs/4, by);
        ctx.lineTo(bx + 3*bs/4, by);
        ctx.closePath();
        ctx.fill();
        
        ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.fillRect(bx + bs - 10, by + bs/2 - 2, 4, 4);
      } else {
        ctx.save();
        ctx.translate(0, cameraY.current);
        lanes.current.forEach(lane => {
          const laneY = 600 - lane.index * LANE_HEIGHT;
          ctx.fillStyle = lane.color;
          ctx.fillRect(0, laneY, 400, LANE_HEIGHT);
          
          // Lane markings
          if (lane.type === 'ROAD') {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(0, laneY + LANE_HEIGHT / 2);
            ctx.lineTo(400, laneY + LANE_HEIGHT / 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (lane.type === 'RAIL') {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, laneY + 15); ctx.lineTo(400, laneY + 15);
            ctx.moveTo(0, laneY + LANE_HEIGHT - 15); ctx.lineTo(400, laneY + LANE_HEIGHT - 15);
            ctx.stroke();
            for (let rx = 0; rx < 400; rx += 30) {
              ctx.beginPath(); ctx.moveTo(rx, laneY + 10); ctx.lineTo(rx, laneY + LANE_HEIGHT - 10); ctx.stroke();
            }
            
            // Train Signal Warning
            if (lane.warning && lane.warning > 0) {
              ctx.fillStyle = `rgba(255, 0, 0, ${lane.warning * 0.3})`;
              ctx.fillRect(0, laneY, 400, LANE_HEIGHT);
              ctx.fillStyle = `rgba(255, 0, 0, ${lane.warning})`;
              ctx.font = 'bold 12px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('! TRAIN !', 200, laneY + LANE_HEIGHT / 2 + 5);
            }
          }
          
          lane.obstacles.forEach(obs => {
            ctx.fillStyle = currentTheme.pipe;
            ctx.shadowBlur = 10;
            ctx.shadowColor = currentTheme.pipe;
            
            if (obs.type === 'CAR') {
              const carX = obs.x;
              const carY = laneY + 20;
              const carW = obs.width;
              const carH = LANE_HEIGHT - 40;
              ctx.fillRect(carX, carY, carW, carH);
              ctx.fillStyle = 'rgba(0,0,0,0.5)';
              if (lane.speed > 0) ctx.fillRect(carX + carW - 8, carY + 2, 6, carH - 4);
              else ctx.fillRect(carX + 2, carY + 2, 6, carH - 4);
            } else if (obs.type === 'TRAIN') {
              const trainX = obs.x;
              const trainY = laneY + 15;
              const trainW = obs.width;
              const trainH = LANE_HEIGHT - 30;
              ctx.fillRect(trainX, trainY, trainW, trainH);
              // Train windows
              ctx.fillStyle = 'rgba(255,255,255,0.15)';
              for (let tx = 20; tx < trainW - 20; tx += 60) {
                ctx.fillRect(trainX + tx, trainY + 5, 40, trainH - 10);
              }
            } else if (obs.type === 'SNAKE') {
              const snakeX = obs.x + Math.sin(time / 200 + (obs.offset || 0)) * 30;
              const snakeY = laneY + LANE_HEIGHT / 2;
              ctx.beginPath();
              ctx.arc(snakeX, snakeY, 10, 0, Math.PI * 2);
              ctx.fill();
              for (let si = 1; si < 6; si++) {
                const segX = obs.x + Math.sin((time - si * 60) / 200 + (obs.offset || 0)) * 30;
                ctx.beginPath();
                ctx.arc(segX, snakeY, 10 - si, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          });
        });

        // Draw Player (Ball)
        ctx.fillStyle = currentTheme.bird;
        ctx.shadowBlur = 20;
        ctx.shadowColor = currentTheme.bird;
        
        const px = playerX.current + PLAYER_SIZE / 2;
        const py = playerVisualY.current + LANE_HEIGHT / 2;
        const pr = PLAYER_SIZE / 2 - 5;
        
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        
        // Ball Styles
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        
        switch (currentTheme.ballStyle) {
          case 'ring':
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'striped':
            ctx.beginPath();
            ctx.moveTo(px - pr, py);
            ctx.lineTo(px + pr, py);
            ctx.moveTo(px - pr * 0.7, py - pr * 0.7);
            ctx.lineTo(px + pr * 0.7, py + pr * 0.7);
            ctx.stroke();
            break;
          case 'dotted':
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            for (let i = 0; i < 4; i++) {
              const angle = (i * Math.PI) / 2;
              ctx.beginPath();
              ctx.arc(px + Math.cos(angle) * pr * 0.5, py + Math.sin(angle) * pr * 0.5, 3, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          case 'glow':
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            break;
          case 'square':
            ctx.strokeRect(px - pr * 0.5, py - pr * 0.5, pr, pr);
            break;
          case 'diamond':
            ctx.beginPath();
            ctx.moveTo(px, py - pr * 0.8);
            ctx.lineTo(px + pr * 0.8, py);
            ctx.lineTo(px, py + pr * 0.8);
            ctx.lineTo(px - pr * 0.8, py);
            ctx.closePath();
            ctx.stroke();
            break;
          case 'target':
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'spiral':
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 4; a += 0.1) {
              const r = (a / (Math.PI * 4)) * pr;
              const x = px + Math.cos(a) * r;
              const y = py + Math.sin(a) * r;
              if (a === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
            break;
          case 'burst':
            for (let i = 0; i < 8; i++) {
              const angle = (i * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + Math.cos(angle) * pr, py + Math.sin(angle) * pr);
              ctx.stroke();
            }
            break;
        }
        ctx.restore();
      }

      frameId.current = requestAnimationFrame(update);
    };

    frameId.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId.current);
  }, [gameState, isGodMode, currentTheme, mode, jump]);

  // Update High Score
  useEffect(() => {
    if (mode === 'FLAP' && score > highScoreFlap) setHighScoreFlap(score);
    if (mode === 'CROSS' && score > highScoreCross) setHighScoreCross(score);
  }, [score, mode, highScoreFlap, highScoreCross]);

  return (
    <div 
      className="min-h-screen text-white flex flex-col items-center justify-center font-sans overflow-hidden selection:bg-white selection:text-black transition-colors duration-1000 relative"
      style={{ backgroundColor: currentTheme.bg }}
    >
      {/* Live Background for Menu & Game */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-60">
          {THEMES.map((t, i) => (
            <motion.div
              key={i}
              animate={{ 
                opacity: (score % 100 >= i * 10 && score % 100 < (i + 1) * 10) || (score === 0 && i === 0) ? 1 : 0,
                scale: (score % 100 >= i * 10 && score % 100 < (i + 1) * 10) || (score === 0 && i === 0) ? 1.5 : 1
              }}
              className="absolute inset-0 transition-opacity duration-1000"
              style={{ background: `radial-gradient(circle at 50% 50%, ${t.accent}66 0%, transparent 70%)` }}
            />
          ))}
        </div>
        
        {/* Animated Designs in Background */}
        <div className="absolute inset-0 opacity-30">
          {Array.from({ length: 15 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                x: [Math.random() * 100 - 50, Math.random() * 100 - 50],
                y: [Math.random() * 100 - 50, Math.random() * 100 - 50],
                rotate: [0, 360],
                opacity: [0.1, 0.4, 0.1]
              }}
              transition={{ 
                duration: 15 + Math.random() * 25, 
                repeat: Infinity,
                ease: "linear"
              }}
              className="absolute w-96 h-96 border-2 rounded-full blur-sm"
              style={{ 
                borderColor: THEMES[Math.floor(i % THEMES.length)].accent,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`
              }}
            />
          ))}
        </div>

        <div className="absolute inset-0 grid grid-cols-10 grid-rows-10 opacity-20">
          {Array.from({ length: 100 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                opacity: [0.2, 0.6, 0.2],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 5 + Math.random() * 7, 
                repeat: Infinity,
                delay: Math.random() * 5
              }}
              className="border border-white/10"
            />
          ))}
        </div>
      </div>

      {!mode ? (
        <div className="relative w-full h-full flex flex-col items-center justify-center">

          <div className="flex flex-col items-center gap-8 z-10">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <Zap className="w-20 h-20 text-[#00FF00] mx-auto mb-4" />
              <h1 className="text-7xl font-black uppercase tracking-tighter italic">NEON<br/><span className="text-[#00FF00]">GAMES</span></h1>
            </motion.div>
            <div className="flex flex-col gap-4 w-64">
              <button 
                onClick={() => setMode('FLAP')}
                className="group relative px-8 py-6 bg-[#00FF00] text-black font-black uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-between"
              >
                <span className="flex items-center gap-3"><Bird className="w-6 h-6" /> Neon Flap</span>
                <ChevronRight className="w-6 h-6" />
                <div className="absolute inset-0 bg-white translate-x-1 translate-y-1 -z-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
              </button>
              <button 
                onClick={() => setMode('CROSS')}
                className="group relative px-8 py-6 bg-[#FF00FF] text-white font-black uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-between"
              >
                <span className="flex items-center gap-3"><Car className="w-6 h-6" /> Neon Cross</span>
                <ChevronRight className="w-6 h-6" />
                <div className="absolute inset-0 bg-white/20 translate-x-1 translate-y-1 -z-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Header Stats */}
          <div className="absolute top-8 left-8 flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-[0.2em] font-mono opacity-60" style={{ color: currentTheme.accent }}>Score</div>
            <div className="text-4xl font-black italic font-mono">{score.toString().padStart(2, '0')}</div>
          </div>

          <div className="absolute top-8 right-8 flex flex-col items-end gap-1">
            <div className="text-[10px] uppercase tracking-[0.2em] font-mono opacity-60" style={{ color: currentTheme.bird }}>Best</div>
            <div className="text-4xl font-black italic font-mono" style={{ color: currentTheme.bird }}>
              {(mode === 'FLAP' ? highScoreFlap : highScoreCross).toString().padStart(2, '0')}
            </div>
          </div>

          {/* God Mode Toggle */}
          <div className="absolute bottom-8 left-8 flex items-center gap-4 bg-white/5 backdrop-blur-md p-2 rounded-full border border-white/10">
            <button 
              onClick={() => setIsGodMode(!isGodMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${isGodMode ? 'text-black font-bold' : 'text-white/40 hover:text-white'}`}
              style={{ backgroundColor: isGodMode ? currentTheme.accent : 'transparent' }}
            >
              {isGodMode ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              <span className="text-[10px] uppercase tracking-widest">{isGodMode ? 'God Mode Active' : 'Manual Control'}</span>
            </button>
            <button 
              onClick={() => { setMode(null); setGameState('START'); }}
              className="text-white/40 hover:text-white text-[10px] uppercase tracking-widest px-4"
            >
              Menu
            </button>
          </div>

          {/* Game Container */}
          <div className="relative border-4 border-white/10 bg-black/40 backdrop-blur-sm shadow-2xl overflow-hidden">
            <canvas
              ref={canvasRef}
              width={400}
              height={600}
              className="block cursor-pointer"
              onMouseDown={() => { isSpacePressed.current = true; jump(); }}
              onMouseUp={() => { isSpacePressed.current = false; }}
            />

            {/* Overlays */}
            <AnimatePresence>
              {gameState === 'START' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-8 text-center"
                >
                  <motion.div 
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="mb-8"
                  >
                    <Zap className="w-16 h-16 fill-current" style={{ color: currentTheme.accent }} />
                  </motion.div>
                  <h1 className="text-6xl font-black uppercase tracking-tighter mb-2 italic">
                    NEON<br/><span style={{ color: currentTheme.accent }}>{mode}</span>
                  </h1>
                  <div className="bg-white/5 p-6 rounded-2xl border-2 border-white/10 mb-8 text-left w-full max-w-[320px] shadow-xl">
                    <h3 className="text-xs uppercase tracking-[0.3em] text-[#00FF00] mb-4 font-black italic">Mission Briefing</h3>
                    <ul className="text-sm space-y-4 text-white font-mono">
                      {mode === 'FLAP' ? (
                        <>
                          <li className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#00FF00] mt-1.5 shadow-[0_0_10px_#00FF00]" />
                            <span><span className="text-[#00FF00] font-bold">SPACE / CLICK</span> to ignite thrusters and JUMP</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#00FF00] mt-1.5 shadow-[0_0_10px_#00FF00]" />
                            <span>Navigate through the <span className="text-[#00FF00] font-bold">NEON SKYSCRAPERS</span></span>
                          </li>
                        </>
                      ) : (
                        <>
                          <li className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#FF00FF] mt-1.5 shadow-[0_0_10px_#FF00FF]" />
                            <span><span className="text-[#FF00FF] font-bold">SPACE / CLICK</span> to JUMP FORWARD</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#FF00FF] mt-1.5 shadow-[0_0_10px_#FF00FF]" />
                            <span><span className="text-[#FF00FF] font-bold">ARROW KEYS</span> to strafe LEFT/RIGHT</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#FF00FF] mt-1.5 shadow-[0_0_10px_#FF00FF]" />
                            <span>Avoid <span className="text-[#FF00FF] font-bold">CARS, TRAINS</span> and <span className="text-[#FF00FF] font-bold">SNAKES</span></span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                  <button
                    onClick={jump}
                    className="group relative px-8 py-4 text-black font-black uppercase tracking-widest hover:scale-105 transition-transform"
                    style={{ backgroundColor: currentTheme.accent }}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <Play className="w-5 h-5 fill-current" /> Start Game
                    </span>
                    <div className="absolute inset-0 bg-white translate-x-1 translate-y-1 -z-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
                  </button>
                </motion.div>
              )}

              {gameState === 'GAME_OVER' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl p-8 text-center"
                >
                  <div className="mb-4" style={{ color: currentTheme.bird }}>
                    <Trophy className="w-16 h-16 mx-auto mb-4" />
                    <h2 className="text-5xl font-black uppercase tracking-tighter italic">GAME OVER</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8 mb-12 w-full max-w-[240px]">
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Score</div>
                      <div className="text-3xl font-black font-mono">{score}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Best</div>
                      <div className="text-3xl font-black font-mono" style={{ color: currentTheme.bird }}>
                        {mode === 'FLAP' ? highScoreFlap : highScoreCross}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={jump}
                    className="group relative px-8 py-4 text-white font-black uppercase tracking-widest hover:scale-105 transition-transform"
                    style={{ backgroundColor: currentTheme.bird }}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <RotateCcw className="w-5 h-5" /> Try Again
                    </span>
                    <div className="absolute inset-0 bg-white/20 translate-x-1 translate-y-1 -z-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Background Decorative Elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 opacity-20">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[120px]" 
          style={{ backgroundColor: currentTheme.accent }}
        />
        <motion.div 
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 12, repeat: Infinity }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-[120px]" 
          style={{ backgroundColor: currentTheme.bird }}
        />
      </div>
    </div>
  );
}
