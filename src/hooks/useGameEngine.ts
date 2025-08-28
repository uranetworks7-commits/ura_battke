'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, set, update, onDisconnect, goOffline, goOnline, off, serverTimestamp } from 'firebase/database';
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
const NORMAL_BULLET_DAMAGE = 24;
const HACKER_BULLET_DAMAGE = 100;
const BULLET_SPEED = 10;
const FIRE_COOLDOWN = 300; // milliseconds

const HACKER_CODE_225 = '#225';
const HACKER_CODE_226 = '#226';

const WAITING_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const AFK_TIMEOUT = 2 * 60 * 1000; // 2 minutes

export enum GameStatus {
  WAITING,
  PLAYING,
  ENDED,
}

interface WinnerInfo {
  name: string;
  username: string;
  reason: 'afk' | 'elimination' | 'timeout';
}
interface PlayerState {
  id: string;
  name: string;
  username: string;
  x: number;
  y: number;
  vy: number;
  hp: number;
  dir: 'left' | 'right';
  isHacker: boolean;
  hackerType: '' | '225' | '226';
  lastUpdate: any;
}

interface OpponentState extends Omit<PlayerState, 'vy'> {}

interface Bullet {
  id: string;
  x: number;
  y: number;
  dir: number;
}

const sanitizeKey = (key: string) => key.replace(/[.#$[\]]/g, '_');

export function useGameEngine(canvasRef: React.RefObject<HTMLCanvasElement>, roomCode: string, playerName: string, playerUsername: string) {
  const { toast } = useToast();
  const sRoomCode = sanitizeKey(roomCode);
  const roomPathRef = useRef(ref(db, sRoomCode));
  
  const playerStateRef = useRef<PlayerState | null>(null);
  const opponentStateRef = useRef<OpponentState | null>(null);
  const roleRef = useRef<'player1' | 'player2' | null>(null);
  
  const bulletsRef = useRef<Bullet[]>([]);
  const opponentBulletsRef = useRef<Bullet[]>([]);
  const lastFireTimeRef = useRef(0);
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const afkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.WAITING);
  const [winner, setWinner] = useState<string | null>(null);
  const [cheaterDetected, setCheaterDetected] = useState(false);
  const [playerUI, setPlayerUI] = useState({ name: playerName, hp: INITIAL_HP });
  const [opponentUI, setOpponentUI] =useState({ name: 'Opponent', hp: INITIAL_HP });
  
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const playerImgRef = useRef<HTMLImageElement | null>(null);

  const declareWinner = useCallback((winnerInfo: WinnerInfo) => {
    if (winner) return;
    update(ref(db, sRoomCode), { winner: winnerInfo });
  }, [sRoomCode, winner]);

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

    ctx.fillStyle = 'red';
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
            let isHacker = false;
            let hackerType: '' | '225' | '226' = '';
            let displayName = playerName;

            if(playerName.includes(HACKER_CODE_225)) {
                isHacker = true;
                hackerType = '225';
                displayName = playerName.replace(HACKER_CODE_225, '');
            } else if (playerName.includes(HACKER_CODE_226)) {
                isHacker = true;
                hackerType = '226';
                displayName = playerName.replace(HACKER_CODE_226, '');
            }

            const basePlayer = { name: displayName, username: playerUsername, hp: INITIAL_HP, isHacker, hackerType, lastUpdate: serverTimestamp() };

            if (!roomData?.player1) {
                roleRef.current = 'player1';
                playerStateRef.current = { ...basePlayer, id: 'p1', x: 100, y: GROUND_Y, vy: 0, dir: 'right' };
            } else if (!roomData?.player2) {
                roleRef.current = 'player2';
                playerStateRef.current = { ...basePlayer, id: 'p2', x: CANVAS_WIDTH - 100 - PLAYER_WIDTH, y: GROUND_Y, vy: 0, dir: 'left' };
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

        if (myData && playerStateRef.current) {
            playerStateRef.current.hp = myData.hp; // Only sync HP from db, rest is controlled locally
            setPlayerUI({ name: myData.name, hp: myData.hp });
        }
        
        if (opponentData) {
            if (!opponentStateRef.current) { // Opponent just joined
                opponentStateRef.current = { id: opponentRole, ...opponentData, vy: 0 };
            } else { // Opponent state is updating
                opponentStateRef.current = { ...opponentStateRef.current, ...opponentData };
            }
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
            const winnerInfo = roomData.winner;
            setWinner(winnerInfo.name);
            setGameStatus(GameStatus.ENDED);
            off(roomPathRef.current);
            // Don't clear the room data, so it can be reviewed.
            // set(roomPathRef.current, null);
        }
    };
    
    onValue(roomPathRef.current, handleRoomValue);

    return () => {
        if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
        if (afkTimeoutRef.current) clearTimeout(afkTimeoutRef.current);
        off(roomPathRef.current, 'value', handleRoomValue);
        const playerRole = roleRef.current;
        if (playerRole && gameStatus !== GameStatus.ENDED) {
            set(ref(db, `${sRoomCode}/${playerRole}`), null);
        }
        goOffline(db);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sRoomCode, playerName, playerUsername, toast]);
  
   useEffect(() => {
    if (gameStatus === GameStatus.WAITING) {
      if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = setTimeout(() => {
        if (gameStatus === GameStatus.WAITING && playerStateRef.current && !opponentStateRef.current) {
           declareWinner({ name: playerStateRef.current.name, username: playerStateRef.current.username, reason: 'timeout' });
        }
      }, WAITING_TIMEOUT);
    } else {
      if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
    }
    return () => {
      if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
    }
  }, [gameStatus, declareWinner]);

  useEffect(() => {
    if (gameStatus !== GameStatus.PLAYING) {
      if (afkTimeoutRef.current) clearTimeout(afkTimeoutRef.current);
      return;
    }
  
    const resetAfkTimeout = () => {
        if (afkTimeoutRef.current) clearTimeout(afkTimeoutRef.current);
        afkTimeoutRef.current = setTimeout(() => {
            const player = playerStateRef.current;
            const opponent = opponentStateRef.current;
            const now = Date.now();
            
            if (player && !winner) {
                const opponentLastUpdate = opponent?.lastUpdate ? new Date(opponent.lastUpdate).getTime() : 0;
                if (!opponent || (opponentLastUpdate && now - opponentLastUpdate > AFK_TIMEOUT)) {
                    declareWinner({ name: player.name, username: player.username, reason: 'afk' });
                } else {
                    resetAfkTimeout();
                }
            }
        }, AFK_TIMEOUT + 1000); // Check slightly after AFK timeout
    };

    resetAfkTimeout();
  
    return () => {
      if (afkTimeoutRef.current) clearTimeout(afkTimeoutRef.current);
    };
  }, [gameStatus, declareWinner, winner]);

  useEffect(() => {
    let animationFrameId: number;
    const gameLoop = () => {
      if (gameStatus !== GameStatus.PLAYING || !playerStateRef.current) {
        if(animationFrameId) cancelAnimationFrame(animationFrameId);
        return;
      }
      
      const player = playerStateRef.current;
      
      player.vy += GRAVITY;
      player.y += player.vy;
      if (player.y >= GROUND_Y) {
          player.y = GROUND_Y;
          player.vy = 0;
      }
      player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, player.x));
      
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
              const damage = playerStateRef.current?.isHacker ? HACKER_BULLET_DAMAGE : NORMAL_BULLET_DAMAGE;
              const newHp = Math.max(0, opponent.hp - damage);
              const oppRole = roleRef.current === 'player1' ? 'player2' : 'player1';
              update(ref(db, `${sRoomCode}/${oppRole}`), { hp: newHp });
              if (newHp <= 0 && playerStateRef.current) {
                  declareWinner({ name: playerStateRef.current.name, username: playerStateRef.current.username, reason: 'elimination'});
              }
            }
        });
        if(bulletsToRemove.size > 0) bulletsRef.current = bulletsRef.current.filter(b => !bulletsToRemove.has(b.id));
      }

      if (roleRef.current) {
        const { id, vy, ...playerData } = player;
        update(ref(db, `${sRoomCode}/${roleRef.current}`), {
          ...playerData,
          x: player.x,
          y: player.y,
          dir: player.dir,
          bullets: bulletsRef.current,
          lastUpdate: serverTimestamp()
        });
      }

      draw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    if (gameStatus === GameStatus.PLAYING) {
      animationFrameId = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameStatus, draw, sRoomCode, declareWinner]);

  const actions = {
    moveLeft: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING) { 
          const speed = p.isHacker && p.hackerType === '225' ? MOVE_SPEED * 2 : MOVE_SPEED;
          p.x -= speed;
          p.dir = 'left';
        }
    },
    moveRight: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING) {
          const speed = p.isHacker && p.hackerType === '225' ? MOVE_SPEED * 2 : MOVE_SPEED;
          p.x += speed;
          p.dir = 'right';
        }
    },
    jump: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING && p.y >= GROUND_Y) {
          const power = p.isHacker && p.hackerType === '225' ? JUMP_POWER * 2 : JUMP_POWER;
          p.vy = power;
        }
    },
    fire: () => {
        const p = playerStateRef.current;
        const now = Date.now();
        if(p && gameStatus === GameStatus.PLAYING && now - lastFireTimeRef.current > FIRE_COOLDOWN) {
            lastFireTimeRef.current = now;
            const fireCount = p.isHacker && p.hackerType === '225' ? 20 : 1;
            for(let i = 0; i < fireCount; i++) {
              bulletsRef.current.push({
                  id: `${now}-${Math.random()}-${i}`,
                  x: p.x + (p.dir === 'right' ? PLAYER_WIDTH : -8),
                  y: p.y + (PLAYER_HEIGHT / 2 - 10) + (Math.random() * 20 - 10), // slight vertical spread
                  dir: p.dir === 'right' ? 1 : -1,
              });
            }
        }
    },
    reportOpponent: () => {
        const opponent = opponentStateRef.current;
        if (!opponent) return;

        if (opponent.hackerType === '225') {
            setCheaterDetected(true);
            setGameStatus(GameStatus.ENDED);
            off(roomPathRef.current);
            set(roomPathRef.current, null); // Clear the room
        } else {
            toast({
                title: 'Report Submitted',
                description: 'Thank you for your feedback.',
            });
        }
    },
  };

  return { player: playerUI, opponent: opponentUI, gameStatus, winner, actions, cheaterDetected };
}
