'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, set, update, onDisconnect, goOffline, goOnline, off, serverTimestamp, runTransaction } from 'firebase/database';
import { useToast } from './use-toast';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 60;
const GROUND_Y = CANVAS_HEIGHT - PLAYER_HEIGHT - 10;
const GRAVITY = 2;
const JUMP_POWER = -25;
const MOVE_SPEED = 8;
const INITIAL_HP = 1800;
const GRENADE_RADIUS = 10;
const GRENADE_FUSE = 180; // 3 seconds at 60fps

const GUNS = {
  ak: {
    damage: 24,
    cooldown: 300,
    bulletColor: 'red',
  },
  awm: {
    damage: 124,
    cooldown: 2000,
    bulletColor: '#00FF00', // Stylish green
  },
  grenade: {
    damage: 294, // Max damage
    cooldown: 5000, // 5 seconds
    blastRadius: 150,
  }
};

const HACKER_CODE_225 = '#225';
const HACKER_CODE_226 = '#226';

const WAITING_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const AFK_TIMEOUT = 2 * 60 * 1000; // 2 minutes

export enum GameStatus {
  WAITING,
  PLAYING,
  ENDED,
}

export type GunChoice = 'ak' | 'awm' | 'grenade';

interface PlayerDetails {
  name: string;
  username: string;
}

interface WinnerInfo {
    winner: PlayerDetails;
    reason: 'afk' | 'elimination' | 'timeout';
}
interface PlayerState {
  id: string;
  name: string;
  username: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  dir: 'left' | 'right';
  isHacker: boolean;
  hackerType: '' | '225' | '226';
  lastUpdate: any;
  gun: GunChoice;
  lastGrenadeTime: number;
}

interface OpponentState extends Omit<PlayerState, 'vy' | 'vx' | 'lastGrenadeTime'> {
    bullets?: Bullet[];
    grenades?: Grenade[];
    lastGrenadeTime?: number;
}

interface Bullet {
  id: string;
  x: number;
  y: number;
  dir: number;
  gun: GunChoice;
}

interface Grenade {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    fuse: number;
    ownerId: string;
}

interface Explosion {
    id: string;
    x: number;
    y: number;
    radius: number;
    life: number; // Time to live in frames
}

interface DamageIndicator {
    id: string;
    x: number;
    y: number;
    amount: number;
    life: number; // Time to live in frames
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
  const grenadesRef = useRef<Grenade[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const lastOpponentBulletCount = useRef(0);
  const damageIndicatorsRef = useRef<DamageIndicator[]>([]);
  const lastFireTimeRef = useRef(0);
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const afkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isThrowingGrenadeRef = useRef(false);
  const throwPowerRef = useRef(0);
  const moveState = useRef({ left: false, right: false });

  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.WAITING);
  const [winner, setWinner] = useState<string | null>(null);
  const [cheaterDetected, setCheaterDetected] = useState(false);
  const [playerUI, setPlayerUI] = useState({ name: playerName, hp: INITIAL_HP, gun: 'ak' as GunChoice });
  const [opponentUI, setOpponentUI] = useState({ name: 'Opponent', hp: INITIAL_HP, gun: 'ak' as GunChoice, bullets: [], grenades: [] });
  const [isMuted, setIsMuted] = useState(false);
  const [grenadeCooldown, setGrenadeCooldown] = useState(0);
  const [awmCooldown, setAwmCooldown] = useState(0);
  
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const player1ImgRef = useRef<HTMLImageElement | null>(null);
  const player2ImgRef = useRef<HTMLImageElement | null>(null);
  const grenadeImgRef = useRef<HTMLImageElement | null>(null);

  const audioRefs = useRef<{
    ak_fire?: HTMLAudioElement;
    awm_fire?: HTMLAudioElement;
  }>({});

  useEffect(() => {
    audioRefs.current.ak_fire = new Audio('https://files.catbox.moe/uxsgkh.mp3');
    audioRefs.current.awm_fire = new Audio('https://files.catbox.moe/dvxhe8.mp3');
    if (audioRefs.current.ak_fire) audioRefs.current.ak_fire.volume = 0.5;
    if (audioRefs.current.awm_fire) audioRefs.current.awm_fire.volume = 0.5;
  }, []);

  const playSound = (sound: 'ak_fire' | 'awm_fire') => {
    const audio = audioRefs.current[sound];
    if(audio && !isMuted) {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Sound play interrupted'));
    }
  };

  useEffect(() => {
    const { ak_fire, awm_fire } = audioRefs.current;
    if (ak_fire) ak_fire.muted = isMuted;
    if (awm_fire) awm_fire.muted = isMuted;
  }, [isMuted]);

  const declareWinner = useCallback((winnerDetails: PlayerDetails, reason: WinnerInfo['reason']) => {
      const winnerRef = ref(db, `${sRoomCode}/winner`);
      runTransaction(winnerRef, (currentData) => {
          if (currentData === null) {
              const finalWinnerInfo: WinnerInfo = { winner: winnerDetails, reason };
              return finalWinnerInfo;
          }
          return; // Abort transaction
      });
  }, [sRoomCode]);

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
    const opponent = opponentUI;

    const drawEntity = (entity: PlayerState | OpponentState | null) => {
      if (!entity) return;
      
      const imageToUse = entity.id === 'player1' ? player1ImgRef.current : player2ImgRef.current;

      if (imageToUse?.complete) {
        ctx.save();
        const flip = entity.dir === 'left';
        ctx.translate(entity.x + (flip ? PLAYER_WIDTH : 0), entity.y);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(imageToUse, 0, 0, PLAYER_WIDTH, PLAYER_HEIGHT);
        ctx.restore();
      } else {
        ctx.fillStyle = entity.id === roleRef.current ? '#00FFFF' : '#FF4136';
        ctx.fillRect(entity.x, entity.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      }
    };
    
    const drawBullets = (bullets: Bullet[] | undefined) => {
        if (!bullets) return;
        bullets.forEach(b => {
          ctx.fillStyle = GUNS[b.gun as 'ak' | 'awm'].bulletColor;
          ctx.fillRect(b.x, b.y, 8, 4)
        });
    }

    const drawGrenades = (grenades: Grenade[] | undefined) => {
        if (!grenades || !grenadeImgRef.current?.complete) return;
        grenades.forEach(g => {
            ctx.drawImage(grenadeImgRef.current!, g.x - GRENADE_RADIUS, g.y - GRENADE_RADIUS, GRENADE_RADIUS * 2, GRENADE_RADIUS * 2);
        });
    }

    const drawExplosions = () => {
        explosionsRef.current.forEach(exp => {
            const alpha = exp.life / 30; // Fade out over 0.5s
            ctx.beginPath();
            ctx.arc(exp.x, exp.y, exp.radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
            ctx.fill();
        });
    }
    
    const drawTrajectory = () => {
        if (!isThrowingGrenadeRef.current || !playerStateRef.current) return;
        
        let { x, y, dir } = playerStateRef.current;
        const power = throwPowerRef.current;
        const angle = -Math.PI / 4; // 45 degrees up
        const dirMultiplier = dir === 'right' ? 1 : -1;
        
        let velX = Math.cos(angle) * power * dirMultiplier;
        let velY = Math.sin(angle) * power;
        
        x += dir === 'right' ? PLAYER_WIDTH : 0;
        y += PLAYER_HEIGHT / 2;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.setLineDash([2, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);

        for(let t = 0; t < 60; t += 1) { // Draw dots for the trajectory
            const newX = x + velX * t;
            const newY = y + velY * t + 0.5 * (GRAVITY/2) * t * t;
            if (newY > GROUND_Y + GRENADE_RADIUS) break;
            ctx.lineTo(newX, newY);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    const drawDamageIndicators = () => {
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = 'yellow';
        ctx.textAlign = 'center';
        damageIndicatorsRef.current.forEach(ind => {
            const alpha = ind.life / 60; // Fade out over 1 second (60 frames)
            ctx.globalAlpha = alpha;
            ctx.fillText(`-${ind.amount}`, ind.x, ind.y);
        });
        ctx.globalAlpha = 1.0; // Reset alpha
    };

    drawEntity(player);
    if(gameStatus === GameStatus.PLAYING) drawEntity(opponentStateRef.current);

    drawBullets(bulletsRef.current);
    drawBullets(opponentUI.bullets);
    drawGrenades(grenadesRef.current);
    drawGrenades(opponentUI.grenades);
    drawExplosions();
    drawTrajectory();
    drawDamageIndicators();

  }, [canvasRef, gameStatus, declareWinner, opponentUI]);
  
  useEffect(() => {
    goOnline(db);
    bgImgRef.current = new Image();
    bgImgRef.current.src = 'https://i.postimg.cc/y8ZBRDXQ/mmm.png';
    player1ImgRef.current = new Image();
    player1ImgRef.current.src = 'https://i.postimg.cc/6qbwrRmS/Player1.png';
    player2ImgRef.current = new Image();
    player2ImgRef.current.src = 'https://i.postimg.cc/BnxjBkg4/1756607104764.png';
    grenadeImgRef.current = new Image();
    grenadeImgRef.current.src = 'https://i.postimg.cc/FRLXP1mf/1756586440631.png';


    const handleRoomValue = (snapshot: any) => {
        const roomData = snapshot.val();
        if (!roomData && gameStatus !== GameStatus.WAITING) return;

        if (roomData?.winner) {
            if (winner) return;
            const winnerInfo = roomData.winner;
            setWinner(winnerInfo.winner.name);
            setGameStatus(GameStatus.ENDED);
            off(roomPathRef.current);
            return;
        }

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

            const basePlayer = { name: displayName, username: playerUsername, hp: INITIAL_HP, isHacker, hackerType, lastUpdate: serverTimestamp(), gun: 'ak' as GunChoice, lastGrenadeTime: 0 };
            
            const p1 = roomData?.player1;
            const p2 = roomData?.player2;

            if (p1 && p1.name === displayName && p1.username === playerUsername) {
                roleRef.current = 'player1';
            } else if (p2 && p2.name === displayName && p2.username === playerUsername) {
                roleRef.current = 'player2';
            } else if (!p1) {
                roleRef.current = 'player1';
            } else if (!p2) {
                roleRef.current = 'player2';
            } else {
                 console.error("Room is full or player data mismatch.");
                 return;
            }
            
            const existingData = roomData?.[roleRef.current];

            if (existingData) { // Reconnecting
                 playerStateRef.current = { 
                     ...existingData, 
                     id: roleRef.current,
                     vx: 0, 
                     vy: 0,
                };
            } else { // New player
                 const startingX = roleRef.current === 'player1' ? 100 : CANVAS_WIDTH - 100 - PLAYER_WIDTH;
                 const startingDir = roleRef.current === 'player1' ? 'right' : 'left';
                 playerStateRef.current = { ...basePlayer, id: roleRef.current, x: startingX, y: GROUND_Y, vx: 0, vy: 0, dir: startingDir };
            }

            const myRef = ref(db, `${sRoomCode}/${roleRef.current}`);
            const { id, vy, vx, ...playerData } = playerStateRef.current || {};
            set(myRef, playerData);
        }

        const opponentRole = roleRef.current === 'player1' ? 'player2' : 'player1';
        const myData = roomData?.[roleRef.current!];
        const opponentData = roomData?.[opponentRole];

        if (myData && playerStateRef.current) {
            playerStateRef.current.hp = myData.hp;
            playerStateRef.current.lastGrenadeTime = myData.lastGrenadeTime || 0;
        }
        setPlayerUI({ name: playerStateRef.current?.name || playerName, hp: playerStateRef.current?.hp || INITIAL_HP, gun: playerStateRef.current?.gun || 'ak' });
        
        if (opponentData) {
            opponentStateRef.current = { id: opponentRole, ...opponentData };
            
            const opponentBullets = opponentData.bullets || [];
            if (opponentBullets.length > lastOpponentBulletCount.current && opponentData.gun && opponentData.gun !== 'grenade') {
                playSound(opponentData.gun === 'ak' ? 'ak_fire' : 'awm_fire');
            }
            lastOpponentBulletCount.current = opponentBullets.length;

            setOpponentUI({ 
                name: opponentData.name, 
                hp: opponentData.hp, 
                gun: opponentData.gun,
                bullets: opponentBullets,
                grenades: opponentData.grenades || []
            });
        } else {
            opponentStateRef.current = null;
            setOpponentUI({ name: 'Opponent', hp: INITIAL_HP, gun: 'ak', bullets: [], grenades: [] });
            lastOpponentBulletCount.current = 0;
        }
        
        if (roomData?.player1 && roomData?.player2 && gameStatus === GameStatus.WAITING) {
            setGameStatus(GameStatus.PLAYING);
        }

    };
    
    onValue(roomPathRef.current, handleRoomValue);

    return () => {
        if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
        if (afkTimeoutRef.current) clearTimeout(afkTimeoutRef.current);
        off(roomPathRef.current, 'value', handleRoomValue);
        goOffline(db);
    };
  }, [sRoomCode, playerName, playerUsername, toast, declareWinner, gameStatus, winner]);
  
   useEffect(() => {
    if (gameStatus === GameStatus.WAITING) {
      if (waitingTimeoutRef.current) clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = setTimeout(() => {
        if (gameStatus === GameStatus.WAITING && playerStateRef.current && !opponentStateRef.current) {
           declareWinner({ name: playerStateRef.current.name, username: playerStateRef.current.username }, 'timeout' );
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
                if (opponentLastUpdate && now - opponentLastUpdate > AFK_TIMEOUT) {
                    declareWinner({ name: player.name, username: player.username }, 'afk' );
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

    const handleExplosion = (explosion: Omit<Explosion, 'id' | 'life'>) => {
        playSound('awm_fire');
        explosionsRef.current.push({ ...explosion, id: `exp-${Date.now()}`, life: 30 }); // 0.5s explosion effect

        const { x, y, radius } = explosion;
        const allPlayers: (PlayerState | OpponentState | null)[] = [playerStateRef.current, opponentStateRef.current];
        
        allPlayers.forEach(p => {
            if (!p) return;
            const dist = Math.hypot(p.x + PLAYER_WIDTH / 2 - x, p.y + PLAYER_HEIGHT / 2 - y);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                const damage = Math.round(GUNS.grenade.damage * falloff);
                
                if (damage > 0) {
                    if (isNaN(p.hp)) return;
                    const newHp = Math.max(0, p.hp - damage);
                    
                    const role = p.id === playerStateRef.current?.id ? roleRef.current : (roleRef.current === 'player1' ? 'player2' : 'player1');

                    if (p.id !== playerStateRef.current?.id) {
                        damageIndicatorsRef.current.push({
                            id: `dmg-${Date.now()}`,
                            amount: damage,
                            x: p.x + PLAYER_WIDTH / 2,
                            y: p.y - 10,
                            life: 60
                        });
                    } else {
                       if (playerStateRef.current) playerStateRef.current.hp = newHp;
                    }
                    
                    if (role) {
                        update(ref(db, `${sRoomCode}/${role}`), { hp: newHp });
                    }
                    
                    if (newHp <= 0 && opponentStateRef.current && p.id === opponentStateRef.current.id) {
                        declareWinner({ name: playerStateRef.current!.name, username: playerStateRef.current!.username }, 'elimination');
                    } else if (newHp <= 0 && p.id === playerStateRef.current?.id && opponentStateRef.current) {
                        declareWinner({ name: opponentStateRef.current.name, username: opponentStateRef.current.username }, 'elimination');
                    }
                }
            }
        });
    };

  useEffect(() => {
    let animationFrameId: number;
    const gameLoop = () => {
      if (!playerStateRef.current) {
        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
      }
      
      const player = playerStateRef.current;
      
      if(isThrowingGrenadeRef.current) {
          throwPowerRef.current = Math.min(30, throwPowerRef.current + 0.5);
      }

      if (gameStatus === GameStatus.PLAYING) {
        if (moveState.current.left) player.vx = -MOVE_SPEED;
        else if (moveState.current.right) player.vx = MOVE_SPEED;
        else player.vx = 0;
        
        player.x += player.vx;
        player.vy += GRAVITY;
        player.y += player.vy;

        if (player.y >= GROUND_Y) {
            player.y = GROUND_Y;
            player.vy = 0;
        }
        player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, player.x));
      }
      
      // Cooldown Timers
      if (player.gun === 'awm') {
          const awmTimeLeft = (lastFireTimeRef.current + GUNS.awm.cooldown) - Date.now();
          setAwmCooldown(awmTimeLeft > 0 ? Math.ceil(awmTimeLeft / 1000) : 0);
      } else {
          setAwmCooldown(0); // Not holding AWM, no cooldown visible
      }

      const grenadeTimeLeft = (player.lastGrenadeTime + GUNS.grenade.cooldown) - Date.now();
      setGrenadeCooldown(grenadeTimeLeft > 0 ? Math.ceil(grenadeTimeLeft / 1000) : 0);

      const BULLET_SPEED = 10;
      bulletsRef.current = bulletsRef.current.map(b => ({...b, x: b.x + b.dir * BULLET_SPEED})).filter(b => b.x > 0 && b.x < CANVAS_WIDTH);
      
      grenadesRef.current.forEach(g => {
          g.vy += GRAVITY / 2; // Grenades are heavier
          g.x += g.vx;
          g.y += g.vy;

          if(g.y >= GROUND_Y + GRENADE_RADIUS) {
              g.y = GROUND_Y + GRENADE_RADIUS;
              g.vy *= -0.5; // Lose energy on bounce
              g.vx *= 0.8;
          }
          if(g.x <= 0 || g.x >= CANVAS_WIDTH) {
              g.vx *= -0.5;
          }

          g.fuse--;
          if (g.fuse <= 0) {
              handleExplosion({ x: g.x, y: g.y, radius: GUNS.grenade.blastRadius });
          }
      });
      grenadesRef.current = grenadesRef.current.filter(g => g.fuse > 0);

      explosionsRef.current = explosionsRef.current.map(exp => ({ ...exp, life: exp.life - 1 })).filter(exp => exp.life > 0);
      damageIndicatorsRef.current = damageIndicatorsRef.current.map(ind => ({ ...ind, y: ind.y - 0.5, life: ind.life - 1 })).filter(ind => ind.life > 0);

      const opponent = opponentStateRef.current;
      if (opponent && gameStatus === GameStatus.PLAYING) {
        const bulletsToRemove = new Set<string>();
        bulletsRef.current.forEach(bullet => {
            if (
              bullet.x < opponent.x + PLAYER_WIDTH && bullet.x + 8 > opponent.x &&
              bullet.y < opponent.y + PLAYER_HEIGHT && bullet.y + 4 > opponent.y
            ) {
              bulletsToRemove.add(bullet.id);
              if (isNaN(opponent.hp)) return;
              const damage = player.isHacker ? 100 : GUNS[bullet.gun as 'ak' | 'awm'].damage;

              damageIndicatorsRef.current.push({
                  id: `dmg-${Date.now()}`,
                  amount: damage,
                  x: opponent.x + PLAYER_WIDTH / 2,
                  y: opponent.y - 10,
                  life: 60
              });

              const newHp = Math.max(0, opponent.hp - damage);
              const oppRole = roleRef.current === 'player1' ? 'player2' : 'player1';
              if(!isNaN(newHp)) {
                update(ref(db, `${sRoomCode}/${oppRole}`), { hp: newHp });
              }
              
              if (newHp <= 0 && player) {
                  declareWinner({ name: player.name, username: player.username }, 'elimination');
              }
            }
        });
        if(bulletsToRemove.size > 0) bulletsRef.current = bulletsRef.current.filter(b => !bulletsToRemove.has(b.id));
      }

      if (roleRef.current) {
        const { id, vy, hp, ...playerData } = player;
        update(ref(db, `${sRoomCode}/${roleRef.current}`), {
          x: playerData.x,
          y: playerData.y,
          dir: playerData.dir,
          gun: playerData.gun,
          bullets: bulletsRef.current,
          grenades: grenadesRef.current,
          lastGrenadeTime: playerData.lastGrenadeTime,
          lastUpdate: serverTimestamp()
        });
      }

      draw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameStatus, draw, sRoomCode, declareWinner]);
  
  const actions = {
    startMoveLeft: () => { moveState.current.left = true; if(playerStateRef.current) playerStateRef.current.dir = 'left'; },
    stopMoveLeft: () => { moveState.current.left = false; },
    startMoveRight: () => { moveState.current.right = true; if(playerStateRef.current) playerStateRef.current.dir = 'right'; },
    stopMoveRight: () => { moveState.current.right = false; },
    jump: () => {
        const p = playerStateRef.current;
        if(p && gameStatus === GameStatus.PLAYING && p.y >= GROUND_Y) {
          const power = p.isHacker ? JUMP_POWER * 2 : JUMP_POWER;
          p.vy = power;
        }
    },
    startFire: () => {
        const p = playerStateRef.current;
        if (p && gameStatus === GameStatus.PLAYING && p.gun === 'grenade') {
            const now = Date.now();
            if (now - (p.lastGrenadeTime || 0) > GUNS.grenade.cooldown) {
                 isThrowingGrenadeRef.current = true;
                 throwPowerRef.current = 15; // min power
            }
        }
    },
    fire: () => {
        const p = playerStateRef.current;
        const now = Date.now();
        if(!p || gameStatus !== GameStatus.PLAYING) return;
        
        const gunInfo = GUNS[p.gun];
        if (p.gun === 'grenade') {
            if (!isThrowingGrenadeRef.current) return;
            if (now - (p.lastGrenadeTime || 0) < gunInfo.cooldown) return;
        } else {
            if (now - lastFireTimeRef.current < gunInfo.cooldown) return;
        }
        
        lastFireTimeRef.current = now;

        if (p.gun === 'grenade') {
            isThrowingGrenadeRef.current = false;
            p.lastGrenadeTime = now;

            const power = throwPowerRef.current;
            const angle = -Math.PI / 4; // 45 degrees up
            const dirMultiplier = p.dir === 'right' ? 1 : -1;
            
            grenadesRef.current.push({
                id: `${now}-${Math.random()}`,
                x: p.x + (p.dir === 'right' ? PLAYER_WIDTH : 0),
                y: p.y + PLAYER_HEIGHT / 2,
                vx: Math.cos(angle) * power * dirMultiplier,
                vy: Math.sin(angle) * power,
                fuse: GRENADE_FUSE,
                ownerId: p.id
            });
        } else { // ak or awm
            playSound(`${p.gun}_fire`);
            const fireCount = p.isHacker ? 20 : 1;
            for(let i = 0; i < fireCount; i++) {
              bulletsRef.current.push({
                  id: `${now}-${Math.random()}-${i}`,
                  x: p.x + (p.dir === 'right' ? PLAYER_WIDTH : -8),
                  y: p.y + (PLAYER_HEIGHT / 2 - 10) + (Math.random() * 20 - 10), // slight vertical spread
                  dir: p.dir === 'right' ? 1 : -1,
                  gun: p.gun,
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
    toggleMute: () => {
        setIsMuted(prev => !prev);
    },
    selectGun: (gun: GunChoice) => {
        if (playerStateRef.current) {
            if (gun === 'awm') {
                // If switching to AWM, start showing cooldown immediately if it's running
                const awmTimeLeft = (lastFireTimeRef.current + GUNS.awm.cooldown) - Date.now();
                setAwmCooldown(awmTimeLeft > 0 ? Math.ceil(awmTimeLeft / 1000) : 0);
            }
            playerStateRef.current.gun = gun;
        }
    }
  };

  return { player: playerUI, opponent: opponentUI, gameStatus, winner, actions, cheaterDetected, isMuted, grenadeCooldown, awmCooldown };
}
