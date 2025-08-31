'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, off } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { ShieldAlert, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { GameStatus } from '@/hooks/useGameEngine';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 60;

type SpectatorProps = {
  roomCode: string;
  onExit: () => void;
};

interface PlayerState {
  x: number;
  y: number;
  hp: number;
  name: string;
  dir: 'left' | 'right';
  bullets: Bullet[];
  id: 'player1' | 'player2';
}

interface Bullet {
  x: number;
  y: number;
}

const sanitizeKey = (key: string) => key.replace(/[.#$[\]]/g, '_');

export function Spectator({ roomCode, onExit }: SpectatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sRoomCode = sanitizeKey(roomCode);
  const roomPathRef = useRef(ref(db, sRoomCode));
  
  const [player1, setPlayer1] = useState<PlayerState | null>(null);
  const [player2, setPlayer2] = useState<PlayerState | null>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.PLAYING);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const player1ImgRef = useRef<HTMLImageElement | null>(null);
  const player2ImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    bgImgRef.current = new Image();
    bgImgRef.current.src = 'https://i.postimg.cc/y8ZBRDXQ/mmm.png';
    player1ImgRef.current = new Image();
    player1ImgRef.current.src = 'https://i.postimg.cc/6qbwrRmS/Player1.png';
    player2ImgRef.current = new Image();
    player2ImgRef.current.src = 'https://i.postimg.cc/BnxjBkg4/1756607104764.png';

    const handleRoomValue = (snapshot: any) => {
        const roomData = snapshot.val();
        if (!roomData) {
            setGameStatus(GameStatus.ENDED);
            return;
        }

        if (roomData.player1) setPlayer1({...roomData.player1, id: 'player1' });
        if (roomData.player2) setPlayer2({...roomData.player2, id: 'player2' });
        
        if (roomData.winner) {
            setWinnerName(roomData.winner.name);
            setGameStatus(GameStatus.ENDED);
        }
    };
    
    onValue(roomPathRef.current, handleRoomValue);

    return () => {
        off(roomPathRef.current, 'value', handleRoomValue);
    };
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
    
    const drawEntity = (entity: PlayerState | null) => {
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
        ctx.fillStyle = '#00FFFF';
        ctx.fillRect(entity.x, entity.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      }
    };
    
    const drawBullets = (bullets: Bullet[] | undefined) => {
        if (!bullets) return;
        ctx.fillStyle = 'red';
        bullets.forEach(b => ctx.fillRect(b.x, b.y, 8, 4));
    }

    drawEntity(player1);
    drawEntity(player2);
    drawBullets(player1?.bullets);
    drawBullets(player2?.bullets);

  }, [player1, player2]);

  useEffect(() => {
    let animationFrameId: number;
    const gameLoop = () => {
      draw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };
    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [draw]);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="w-full flex justify-between items-center text-sm sm:text-base px-2">
        <div className="flex flex-col items-start gap-1">
          <p className="font-headline text-primary truncate max-w-32 sm:max-w-48">{player1?.name || 'Player 1'}</p>
          <Progress value={((player1?.hp || 0) / 1800) * 100} className="w-32 sm:w-48 h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {player1?.hp ?? 'N/A'}</p>
        </div>
        <div className="font-headline text-xl text-accent">SPECTATING</div>
        <div className="flex flex-col items-end gap-1 text-right">
           <div className="flex items-center gap-2">
            <p className="font-headline text-primary truncate max-w-32 sm:max-w-48">{player2?.name || 'Player 2'}</p>
          </div>
          <Progress value={((player2?.hp || 0) / 1800) * 100} className="w-32 sm:w-48 h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {player2?.hp ?? 'N/A'}</p>
        </div>
      </div>
      
      <div className="relative w-full aspect-video max-w-4xl border-2 border-primary shadow-2xl shadow-primary/30 rounded-lg overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" width={800} height={450} />
        {gameStatus === GameStatus.ENDED && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center p-4">
            <p className="text-3xl font-headline text-white animate-pulse">Match Over</p>
            {winnerName && <p className="text-xl font-body text-primary mt-2">{winnerName} is the winner!</p>}
          </div>
        )}
      </div>

      <div className="flex space-x-2">
        <Button onClick={onExit} variant="destructive" className="font-headline" size="lg">
            <XCircle /> Exit
        </Button>
      </div>
    </div>
  );
}
