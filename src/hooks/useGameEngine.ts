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
const AIRSTRIKE_DELAY = 2000; // 2 seconds

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
  },
  airstrike: {
      damage: 185, // per bomb
      blastRadius: 80,
  }
};

const HACKER_CODE_225 = '#225';
const HACKER_CODE_226 = '#226';

const WAITING_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const AFK_TIMEOUT = 40 * 1000; // 40 seconds

export enum GameStatus {
  WAITING,
  PLAYING,
  ENDED,
}

export type GunChoice = 'ak' | 'awm' | 'grenade' | 'airstrike';

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
  airstrikeUsed: boolean;
  airstrikeTarget: number | null;
  explosions?: Omit<Explosion, 'id' | 'life'>[];
}

interface OpponentState extends Omit<PlayerState, 'vy' | 'vx' | 'lastGrenadeTime'> {
    bullets?: Bullet[];
    grenades?: Grenade[];
    lastGrenadeTime?: number;
    explosions?: Omit<Explosion, 'id' | 'life'>[];
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

interface Plane {
    id: string;
    x: number;
    y: number;
    vx: number;
    targetX: number;
    bombsDropped: boolean;
    ownerId: string;
}

interface Bomb {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    ownerId: string;
}

interface Explosion {
    id: string;
    x: number;
    y: number;
    radius: number;
    life: number; // Time to live in frames
    ownerId: string;
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
  const planesRef = useRef<Plane[]>([]);
  const bombsRef = useRef<Bomb[]>([]);
  const airstrikeMarkerRef = useRef<number | null>(null);
  const lastOpponentBulletCount = useRef(0);
  const lastOpponentGrenadeCount = useRef(0);
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
  const [playerUI, setPlayerUI] = useState({ name: playerName, hp: INITIAL_HP, gun: 'ak' as GunChoice, airstrikeUsed: false });
  const [opponentUI, setOpponentUI] = useState({ name: 'Opponent', hp: INITIAL_HP, gun: 'ak' as GunChoice, bullets: [], grenades: [], airstrikeUsed: false, airstrikeTarget: null as number | null });
  const [isMuted, setIsMuted] = useState(false);
  const [grenadeCooldown, setGrenadeCooldown] = useState(0);
  const [awmCooldown, setAwmCooldown] = useState(0);
  const [isTargetingAirstrike, setIsTargetingAirstrike] = useState(false);
  
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const player1ImgRef = useRef<HTMLImageElement | null>(null);
  const player2ImgRef = useRef<HTMLImageElement | null>(null);
  const grenadeImgRef = useRef<HTMLImageElement | null>(null);
  const planeImgRef = useRef<HTMLImageElement | null>(null);
  const bombImgRef = useRef<HTMLImageElement | null>(null);

  const audioRefs = useRef<{
    ak_fire?: HTMLAudioElement;
    awm_fire?: HTMLAudioElement;
    airstrike_alert?: HTMLAudioElement;
    grenade_explode?: HTMLAudioElement;
  }>({});

  useEffect(() => {
    audioRefs.current.ak_fire = new Audio('https://files.catbox.moe/uxsgkh.mp3');
    audioRefs.current.awm_fire = new Audio('https://files.catbox.moe/dvxhe8.mp3');
    audioRefs.current.airstrike_alert = new Audio('https://files.catbox.moe/6yek7i.mp3');
    audioRefs.current.grenade_explode = new Audio('https://files.catbox.moe/dvxhe8.mp3');
    
    Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.volume = 0.5;
          audio.load();
        }
    });
  }, []);

  const playSound = useCallback((sound: keyof typeof audioRefs.current) => {
    const audio = audioRefs.current[sound];
    if(audio && !isMuted) {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Sound play interrupted:', e));
    }
  }, [isMuted]);

  useEffect(() => {
     Object.values(audioRefs.current).forEach(audio => {
        if (audio) audio.muted = isMuted;
    });
  }, [isMuted]);

  const declareWinner = useCallback((winnerDetails: PlayerDetails, reason: WinnerInfo['reason']) => {
      const winnerRef = ref(db, `${sRoomCode}/winner`);
      runTransaction(winnerRef, (currentData) => {
          if (currentData === null) {
              const finalWinnerInfo: WinnerInfo = { winner: winnerDetails, reason };
              return finalWinnerInfo;
          }
          return; // Abort transaction if winner is already declared
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

     const drawPlanes = (planes: Plane[] | undefined) => {
        if (!planes || !planeImgRef.current?.complete) return;
        planes.forEach(p => {
            ctx.save();
            const flip = p.vx > 0;
            ctx.translate(p.x + (flip ? 120 : 0), p.y);
            if (!flip) ctx.scale(-1, 1);
            ctx.drawImage(planeImgRef.current!, 0, 0, 120, 60);
            ctx.restore();
        });
    }

    const drawBombs = (bombs: Bomb[] | undefined) => {
        if (!bombs || !bombImgRef.current?.complete) return;
        bombs.forEach(b => {
            ctx.drawImage(bombImgRef.current!, b.x - 10, b.y - 15, 20, 30);
        });
    }

    const drawAirstrikeMarker = () => {
        if (airstrikeMarkerRef.current !== null) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(airstrikeMarkerRef.current, 0);
            ctx.lineTo(airstrikeMarkerRef.current, CANVAS_HEIGHT);
            ctx.stroke();
        }
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
    drawPlanes(planesRef.current);
    drawBombs(bombsRef.current);
    drawAirstrikeMarker();
    drawExplosions();
    drawTrajectory();
    drawDamageIndicators();

  }, [canvasRef, gameStatus, opponentUI]);
  
  const handleExplosion = useCallback((explosion: Omit<Explosion, 'id' | 'life'>, isOwner: boolean) => {
    const soundType = explosion.radius > 100 ? 'grenade_explode' : 'awm_fire';
    playSound(soundType);
    explosionsRef.current.push({ ...explosion, id: `exp-${Date.now()}`, life: 30, ownerId: explosion.ownerId }); // 0.5s explosion effect

    if (!isOwner) return; // Only the owner of the explosion calculates damage

    const { x, y, radius, ownerId } = explosion;
    const player = playerStateRef.current;
    const opponent = opponentStateRef.current;

    const updates: { [key: string]: any } = {};
    let playerHp = player?.hp ?? INITIAL_HP;
    let opponentHp = opponent?.hp ?? INITIAL_HP;

    const damagePlayer = (p: PlayerState | OpponentState) => {
        const dist = Math.hypot(p.x + PLAYER_WIDTH / 2 - x, p.y + PLAYER_HEIGHT / 2 - y);
        if (dist < radius) {
            const damageType = radius > 100 ? 'grenade' : 'airstrike';
            const damage = Math.round(GUNS[damageType].damage * (1 - (dist / radius)));
            if (damage > 0) {
                 if (p.id === player?.id) {
                     playerHp = Math.max(0, playerHp - damage);
                 } else {
                     opponentHp = Math.max(0, opponentHp - damage);
                     damageIndicatorsRef.current.push({ id: `dmg-${Date.now()}`, amount: damage, x: p.x + PLAYER_WIDTH / 2, y: p.y - 10, life: 60 });
                 }
            }
        }
    };
    
    if (player) damagePlayer(player);
    if (opponent) damagePlayer(opponent);
    
    if (player) updates[`${sRoomCode}/${player.id}/hp`] = playerHp;
    if (opponent) updates[`${sRoomCode}/${opponent.id}/hp`] = opponentHp;
    
    if(Object.keys(updates).length > 0) {
        update(ref(db), updates);
    }

    if (player && opponent) {
        if (playerHp <= 0 && opponentHp > 0) declareWinner({ name: opponent.name, username: opponent.username }, 'elimination');
        else if (opponentHp <= 0 && playerHp > 0) declareWinner({ name: player.name, username: player.username }, 'elimination');
    }
  }, [sRoomCode, playSound, declareWinner]);

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
    planeImgRef.current = new Image();
    planeImgRef.current.src = 'https://i.postimg.cc/wMdHdzrd/1756758625266.png';
    bombImgRef.current = new Image();
    bombImgRef.current.src = 'https://i.postimg.cc/QtXTD7xf/1756717866307.png';


    const handleRoomValue = (snapshot: any) => {
        const roomData = snapshot.val();
        if (!roomData && gameStatus !== GameStatus.WAITING) return;
        const myRole = roleRef.current;

        if (roomData?.winner) {
            if (winner) return;
            const winnerInfo = roomData.winner;
            setWinner(winnerInfo.winner.name);
            setGameStatus(GameStatus.ENDED);
            off(roomPathRef.current);
            return;
        }

        if (!myRole) {
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

            const basePlayer = { name: displayName, username: playerUsername, hp: INITIAL_HP, isHacker, hackerType, lastUpdate: serverTimestamp(), gun: 'ak' as GunChoice, lastGrenadeTime: 0, airstrikeUsed: false, airstrikeTarget: null, explosions: [] };
            
            const p1 = roomData?.player1;
            const p2 = roomData?.player2;

            let assignedRole: 'player1' | 'player2' | null = null;
            if (p1 && p1.name === displayName && p1.username === playerUsername) {
                assignedRole = 'player1';
            } else if (p2 && p2.name === displayName && p2.username === playerUsername) {
                assignedRole = 'player2';
            } else if (!p1) {
                assignedRole = 'player1';
            } else if (!p2) {
                assignedRole = 'player2';
            } else {
                 console.error("Room is full or player data mismatch.");
                 return;
            }
            roleRef.current = assignedRole;
            
            const existingData = roomData?.[assignedRole];

            if (existingData) { // Reconnecting
                 playerStateRef.current = { 
                     ...existingData, 
                     id: assignedRole,
                     vx: 0, 
                     vy: 0,
                };
            } else { // New player
                 const startingX = assignedRole === 'player1' ? 100 : CANVAS_WIDTH - 100 - PLAYER_WIDTH;
                 const startingDir = assignedRole === 'player1' ? 'right' : 'left';
                 playerStateRef.current = { ...basePlayer, id: assignedRole, x: startingX, y: GROUND_Y, vx: 0, vy: 0, dir: startingDir };
            }

            const myRef = ref(db, `${sRoomCode}/${assignedRole}`);
            onDisconnect(myRef).remove();
            const { id, vy, vx, ...playerData } = playerStateRef.current || {};
            set(myRef, playerData);
        }

        const opponentRole = myRole === 'player1' ? 'player2' : 'player1';
        const myData = roomData?.[myRole!];
        const opponentData = roomData?.[opponentRole];

        if (myData && playerStateRef.current) {
            playerStateRef.current.hp = myData.hp;
            playerStateRef.current.lastGrenadeTime = myData.lastGrenadeTime || 0;
            playerStateRef.current.airstrikeUsed = myData.airstrikeUsed || false;
        }
        setPlayerUI({ name: playerStateRef.current?.name || playerName, hp: playerStateRef.current?.hp || INITIAL_HP, gun: playerStateRef.current?.gun || 'ak', airstrikeUsed: playerStateRef.current?.airstrikeUsed || false });
        
        if (opponentData) {
            const hadOpponent = !!opponentStateRef.current;
            const previousOpponentData = opponentStateRef.current;
            opponentStateRef.current = { id: opponentRole, ...opponentData };
            
            if (hadOpponent && myRole) {
                if (opponentData.explosions && opponentData.explosions.length > (previousOpponentData?.explosions?.length || 0)) {
                    const newExplosions = opponentData.explosions.slice(previousOpponentData?.explosions?.length || 0);
                    newExplosions.forEach((exp: Omit<Explosion, 'id' | 'life'>) => {
                        const soundType = exp.radius > 100 ? 'grenade_explode' : 'awm_fire';
                        playSound(soundType);
                        explosionsRef.current.push({ ...exp, id: `exp-opp-${Date.now()}`, life: 30 });
                    });
                }


                if (opponentData.airstrikeTarget && !previousOpponentData?.airstrikeTarget) {
                    if (planesRef.current.every(p => p.ownerId !== opponentRole)) {
                        playSound('airstrike_alert');
                        setTimeout(() => {
                             const planeGoesLeft = opponentData.x > CANVAS_WIDTH / 2;
                             planesRef.current.push({
                                id: `plane-opp-${Date.now()}`,
                                x: planeGoesLeft ? CANVAS_WIDTH : -120,
                                y: 30,
                                vx: planeGoesLeft ? -3 : 3,
                                targetX: opponentData.airstrikeTarget,
                                bombsDropped: false,
                                ownerId: opponentRole
                            });
                        }, AIRSTRIKE_DELAY);
                    }
                }
            }


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
                grenades: opponentData.grenades || [],
                airstrikeUsed: opponentData.airstrikeUsed || false,
                airstrikeTarget: opponentData.airstrikeTarget || null,
            });
        } else {
            opponentStateRef.current = null;
            setOpponentUI({ name: 'Opponent', hp: INITIAL_HP, gun: 'ak', bullets: [], grenades: [], airstrikeUsed: false, airstrikeTarget: null });
            lastOpponentBulletCount.current = 0;
            lastOpponentGrenadeCount.current = 0;
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
    };
  }, [sRoomCode, playerName, playerUsername, toast, declareWinner, gameStatus, winner, playSound, handleExplosion]);
  
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

  useEffect(() => {
    let animationFrameId: number;
    const gameLoop = () => {
      const player = playerStateRef.current;
      if (!player) {
        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
      }
      
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
              const explosionData = { x: g.x, y: g.y, radius: GUNS.grenade.blastRadius, ownerId: g.ownerId };
              const isOwner = g.ownerId === player.id;
              handleExplosion(explosionData, isOwner);
              if (isOwner) {
                 const myExistingExplosions = (playerStateRef.current?.explosions || []).map(({id, life, ...rest}) => rest);
                 update(ref(db, `${sRoomCode}/${roleRef.current}`), { explosions: [...myExistingExplosions, explosionData] });
              }
          }
      });
      grenadesRef.current = grenadesRef.current.filter(g => g.fuse > 0);

      planesRef.current.forEach(p => {
        p.x += p.vx;
        if (!p.bombsDropped && ((p.vx > 0 && p.x >= p.targetX) || (p.vx < 0 && p.x <= p.targetX))) {
            p.bombsDropped = true;
            for (let i = 0; i < 4; i++) {
                bombsRef.current.push({
                    id: `bomb-${p.id}-${i}`,
                    x: p.x + (Math.random() * 80 - 40) + (p.vx * 5),
                    y: p.y + 30,
                    vx: p.vx * 0.8 + (Math.random() - 0.5), // Inherit most of plane velocity
                    vy: 3 + Math.random() * 2,
                    ownerId: p.ownerId,
                });
            }
        }
      });
      planesRef.current = planesRef.current.filter(p => p.x > -150 && p.x < CANVAS_WIDTH + 150);

      bombsRef.current.forEach(b => {
          b.vy += GRAVITY / 4; // Bombs fall slower than players
          b.y += b.vy;
          b.x += b.vx;
          if (b.y >= GROUND_Y + PLAYER_HEIGHT / 2) {
              const explosionData = { x: b.x, y: b.y - 10, radius: GUNS.airstrike.blastRadius, ownerId: b.ownerId };
              const isOwner = b.ownerId === player.id;
              handleExplosion(explosionData, isOwner);
              if (isOwner) {
                const myExistingExplosions = (playerStateRef.current?.explosions || []).map(({id, life, ...rest}) => rest);
                update(ref(db, `${sRoomCode}/${roleRef.current}`), { explosions: [...myExistingExplosions, explosionData] });
              }
          }
      });
      bombsRef.current = bombsRef.current.filter(b => b.y < GROUND_Y + PLAYER_HEIGHT / 2);


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
        const { id, vy, hp, explosions, ...playerData } = player;
        update(ref(db, `${sRoomCode}/${roleRef.current}`), {
          x: playerData.x,
          y: playerData.y,
          dir: playerData.dir,
          gun: playerData.gun,
          bullets: bulletsRef.current,
          grenades: grenadesRef.current,
          lastGrenadeTime: playerData.lastGrenadeTime,
          airstrikeUsed: playerData.airstrikeUsed,
          airstrikeTarget: playerData.airstrikeTarget,
          lastUpdate: serverTimestamp()
        });
      }

      draw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameStatus, draw, sRoomCode, declareWinner, handleExplosion]);
  
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
        
        if (p.gun === 'airstrike') {
            return; // Airstrike is triggered by setAirstrikeTarget
        }

        const gunInfo = GUNS[p.gun as 'ak' | 'awm' | 'grenade'];
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
                id: `${now}-${Math.random()}`.replace('.', ''),
                x: p.x + (p.dir === 'right' ? PLAYER_WIDTH : 0),
                y: p.y + PLAYER_HEIGHT / 2,
                vx: Math.cos(angle) * power * dirMultiplier,
                vy: Math.sin(angle) * power,
                fuse: GRENADE_FUSE,
                ownerId: p.id
            });
        } else { // ak or awm
            playSound(`${p.gun}_fire` as 'ak_fire' | 'awm_fire');
            const fireCount = p.isHacker ? 20 : 1;
            for(let i = 0; i < fireCount; i++) {
              bulletsRef.current.push({
                  id: `${now}-${Math.random()}-${i}`.replace(/[.#$[\]]/g, ''),
                  x: p.x + (p.dir === 'right' ? PLAYER_WIDTH : -8),
                  y: p.y + (PLAYER_HEIGHT / 2 - 10) + (Math.random() * 20 - 10), // slight vertical spread
                  dir: p.dir === 'right' ? 1 : -1,
                  gun: p.gun,
              });
            }
        }
    },
    setAirstrikeTarget: (x: number) => {
        const p = playerStateRef.current;
        if (!p || p.airstrikeUsed || gameStatus !== GameStatus.PLAYING) return;
        
        p.airstrikeUsed = true;
        p.airstrikeTarget = x;
        airstrikeMarkerRef.current = x;
        setIsTargetingAirstrike(false);
        playSound('airstrike_alert');

        setTimeout(() => {
            airstrikeMarkerRef.current = null;
            if (planesRef.current.every(pl => pl.ownerId !== p.id)) {
                const planeGoesLeft = p.x > CANVAS_WIDTH / 2;
                planesRef.current.push({
                   id: `plane-${p.id}-${Date.now()}`,
                   x: planeGoesLeft ? CANVAS_WIDTH : -120, // Start off-screen
                   y: 30, // Fly at a height of 30px
                   vx: planeGoesLeft ? -3 : 3,
                   targetX: x,
                   bombsDropped: false,
                   ownerId: p.id,
               });
            }
        }, AIRSTRIKE_DELAY);
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
            if (gun === 'airstrike') {
                if (playerStateRef.current.airstrikeUsed) return;
                setIsTargetingAirstrike(true);
            } else {
                setIsTargetingAirstrike(false);
            }

            if (gun === 'awm') {
                // If switching to AWM, start showing cooldown immediately if it's running
                const awmTimeLeft = (lastFireTimeRef.current + GUNS.awm.cooldown) - Date.now();
                setAwmCooldown(awmTimeLeft > 0 ? Math.ceil(awmTimeLeft / 1000) : 0);
            }
            playerStateRef.current.gun = gun;
        }
    }
  };

  return { player: playerUI, opponent: opponentUI, gameStatus, winner, actions, cheaterDetected, isMuted, grenadeCooldown, awmCooldown, airstrikeUsed: playerUI.airstrikeUsed, isTargetingAirstrike };
}
