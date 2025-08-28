'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, set, update, onDisconnect, goOffline, goOnline, off } from 'firebase/database';
import { useToast } from './use-toast';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 60;
const GROUND_Y = CANVAS_HEIGHT - PLAYER_HEIGHT - 10;
const GRAVITY = 2;
const JUMP_POWER = -25;
const MOVE_SPEED = 20;
const INITIAL_HP = 1800;
const BULLET_DAMAGE = 24;
const BULLET_SPEED = 10;
const FIRE_COOLDOWN = 300; // milliseconds

export enum GameStatus {
  WAITING,
  PLAYING,
  ENDED,
}

interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  vy: number;
  hp: number;
  dir: 'left' | 'right';
}

interface OpponentState extends Omit<PlayerState, 'vy'> {}

interface Bullet {
  id: string;
  x: number;
  y: number;
  dir: number;
}

const sanitizeKey = (key: string) => key.replace(/[.#$[\]]/g, '_');

export function useGameEngine(canvasRef: React.RefObject<HTMLCanvasElement>, roomCode: string, playerName: string) {
  const { toast } = useToast();
  const sRoomCode = sanitizeKey(roomCode);
  const roomPathRef = useRef(ref(db, sRoomCode));
  
  const playerStateRef = useRef<PlayerState | null>(null);
  const opponentStateRef = useRef<OpponentState | null>(null);
  const roleRef = useRef<'player1' | 'player2' | null>(null);
  
  const bulletsRef = useRef<Bullet[]>([]);
  const opponentBulletsRef = useRef<Bullet[]>([]);
  const lastFireTimeRef = useRef(0);

  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.WAITING);
  const [winner, setWinner] = useState<string | null>(null);
  const [playerUI, setPlayerUI] = useState({ name: playerName, hp: INITIAL_HP });
  const [opponentUI, setOpponentUI] =useState({ name: 'Opponent', hp: INITIAL_HP });
  
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const playerImgRef = useRef<HTMLImageElement | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (bgImgRef.current?.complete) {
      ctx.drawImage(bgImgRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      ctx.fillStyle = '#1A1A1A';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    
    const player = playerStateRef.current;
    const opponent = opponentStateRef.current;

    const drawEntity = (entity: PlayerState | OpponentState | null, isPlayer: boolean) => {
      if (!entity) return;
      if (playerImgRef.current?.complete) {
        ctx.save();
        const flip = entity.dir === 'left';
        ctx.translate(entity.x + (flip ? PLAYER_WIDTH : 0), entity.y);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(playerImgRef.current, 0, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
        ctx.restore();
      } else {
        ctx.fillStyle = isPlayer ? '#00FFFF' : '#FF4136';
        ctx.fillRect(entity.x, entity.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      }
    };
    
    drawEntity(player, true);
    if(gameStatus === GameStatus.PLAYING) drawEntity(opponent, false);

    ctx.fillStyle = '#32CD32';
    bulletsRef.current.forEach(b => ctx.fillRect(b.x, b.y, 8, 4));
    opponentBulletsRef.current.forEach(b => ctx.fillRect(b.x, b.y, 8, 4));

  }, [canvasRef, gameStatus]);
  
  useEffect(() => {
    goOnline(db);
    bgImgRef.current = new Image();
    bgImgRef.current.src = 'https://i.postimg.cc/y8ZBRDXQ/mmm.png';
    playerImgRef.current = new Image();
    playerImgRef.current.src = 'https://i.postimg.cc/6qbwrRmS/Player1.png';

    const handleRoomValue = (snapshot: any) => {
        const roomData = snapshot.val();
        if (!roomData && gameStatus !== GameStatus.WAITING) return;

        if (!roleRef.current) {
            if (!roomData?.player1) {
                roleRef.current = 'player1';
                playerStateRef.current = { id: 'p1', name: playerName, x: 100, y: GROUND_Y, vy: 0, hp: INITIAL_HP, dir: 'right' };
            } else if (!roomData?.player2) {
                roleRef.current = 'player2';
                playerStateRef.current = { id: 'p2', name: playerName, x: CANVAS_WIDTH - 100 - PLAYER_WIDTH, y: GROUND_Y, vy: 0, hp: INITIAL_HP, dir: 'left' };
            } else {
                toast({ title: 'Error', description: 'Room is full.', variant: 'destructive' });
                return;
            }
            const myRef = ref(db, `${sRoomCode}/${roleRef.current}`);
            const { id, vy, ...playerData } = playerStateRef.current || {};
            set(myRef, playerData);
            onDisconnect(myRef).remove();
        }

        const opponentRole = roleRef.current === 'player1' ? 'player2' : 'player1';
        const myData = roomData?.[roleRef.current!];
        const opponentData = roomData?.[opponentRole];

        if (myData) {
            if(playerStateRef.current) {
              playerStateRef.current.hp = myData.hp;
            }
            setPlayerUI({ name: myData.name, hp: myData.hp });
        }
        
        if (opponentData) {
            opponentStateRef.current = { id: opponentRole, ...opponentData, vy: 0 };
            opponentBulletsRef.current = opponentData.bullets || [];
            setOpponentUI({ name: opponentData.name, hp: opponentData.hp });
        } else {
            opponentStateRef.current = null;
        }
        
        if (roomData?.player1 && roomData?.player2 && gameStatus === GameStatus.WAITING) {
            setGameStatus(GameStatus.PLAYING);
        }

        if (roomData?.winner) {
            if (winner) return;
            setWinner(roomData.winner);
            setGameStatus(GameStatus.ENDED);
            off(roomPathRef.current);
            set(roomPathRef.current, null);
        }
    };
    
    onValue(roomPathRef.current, handleRoomValue);

    return () => {
        off(roomPathRef.current, 'value', handleRoomValue);
        const playerRole = roleRef.current;
        if (playerRole) {
            set(ref(db, `${sRoomCode}/${playerRole}`), null);
        }
        goOffline(db);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sRoomCode, playerName, toast]);
  
  useEffect(() => {
    let animationFrameId: number;
    const gameLoop = () => {
      if (gameStatus !== GameStatus.PLAYING) return;
      
      const player = playerStateRef.current;
      if (player) {
          player.vy += GRAVITY;
          player.y += player.vy;
          if (player.y >= GROUND_Y) {
              player.y = GROUND_Y;
              player.vy = 0;
          }
          player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, player.x));
      }
      
      bulletsRef.current = bulletsRef.current.map(b => ({...b, x: b.x + b.dir * BULLET_SPEED})).filter(b => b.x > 0 && b.x < CANVAS_WIDTH);

      const opponent = opponentStateRef.current;
      if (opponent) {
        const bulletsToRemove = new Set<string>();
        bulletsRef.current.forEach(bullet => {
            if (
              bullet.x < opponent.x + PLAYER_WIDTH && bullet.x + 8 > opponent.x &&
              bullet.y < opponent.y + PLAYER_HEIGHT && bullet.y + 4 > opponent.y
            ) {
              bulletsToRemove.add(bullet.id);
              const newHp = Math.max(0, opponent.hp - BULLET_DAMAGE);
              const oppRole = roleRef.current === 'player1' ? 'player2' : 'player1';
              update(ref(db, `${sRoomCode}/${oppRole}`), { hp: newHp });
              if (newHp <= 0 && winner === null) {
                  update(ref(db, `${sRoomCode}`), { winner: player?.name });
              }
            }
        });
        if(bulletsToRemove.size > 0) bulletsRef.current = bulletsRef.current.filter(b => !bulletsToRemove.has(b.id));
      }

      if (player && roleRef.current) {
        update(ref(db, `${sRoomCode}/${roleRef.current}`), {
          x: player.x,
          y: player.y,
          dir: player.dir,
          bullets: bulletsRef.current,
        });
      }

      draw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    if (gameStatus === GameStatus.PLAYING) {
      animationFrameId = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameStatus, draw, sRoomCode, winner]);

  const actions = {
    moveLeft: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING) { p.x -= MOVE_SPEED; p.dir = 'left'; }
    },
    moveRight: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING) { p.x += MOVE_SPEED; p.dir = 'right';}
    },
    jump: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING && p.y >= GROUND_Y) { p.vy = JUMP_POWER; }
    },
    fire: () => {
        const p = playerStateRef.current;
        const now = Date.now();
        if(p && gameStatus === GameStatus.PLAYING && now - lastFireTimeRef.current > FIRE_COOLDOWN) {
            lastFireTimeRef.current = now;
            bulletsRef.current.push({
                id: `${now}-${Math.random()}`,
                x: p.x + (p.dir === 'right' ? PLAYER_WIDTH : -8),
                y: p.y + PLAYER_HEIGHT / 2 - 10,
                dir: p.dir === 'right' ? 1 : -1,
            });
        }
    },
  };

  return { player: playerUI, opponent: opponentUI, gameStatus, winner, actions };
}
