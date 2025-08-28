'use client';

import { useRef, useEffect } from 'react';
import { useGameEngine, GameStatus } from '@/hooks/useGameEngine';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp, Zap } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';

type GameProps = {
  roomCode: string;
  playerName: string;
  onExit: () => void;
};

export function Game({ roomCode, playerName, onExit }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { player, opponent, gameStatus, winner, actions } = useGameEngine(canvasRef, roomCode, playerName);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'arrowleft':
        case 'a':
          actions.moveLeft();
          break;
        case 'arrowright':
        case 'd':
          actions.moveRight();
          break;
        case 'arrowup':
        case 'w':
        case ' ':
          e.preventDefault();
          actions.jump();
          break;
        case 'f':
        case 'enter':
          e.preventDefault();
          actions.fire();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [actions]);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="w-full flex justify-between items-center text-sm sm:text-base px-2">
        <div className="flex flex-col items-start gap-1">
          <p className="font-headline text-primary truncate max-w-32 sm:max-w-48">{player?.name || 'Player'}</p>
          <Progress value={(player.hp / 1800) * 100} className="w-32 sm:w-48 h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {player.hp}</p>
        </div>
        <div className="font-headline text-xl text-accent">VS</div>
        <div className="flex flex-col items-end gap-1">
          <p className="font-headline text-primary truncate max-w-32 sm:max-w-48">{gameStatus === GameStatus.WAITING ? 'Waiting...' : opponent?.name}</p>
          <Progress value={(opponent.hp / 1800) * 100} className="w-32 sm:w-48 h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {opponent.hp}</p>
        </div>
      </div>
      
      <div className="relative w-full aspect-video max-w-4xl border-2 border-primary shadow-2xl shadow-primary/30 rounded-lg overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" width={800} height={450} />
        {gameStatus === GameStatus.WAITING && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <p className="text-2xl font-headline text-white animate-pulse">Waiting for opponent...</p>
          </div>
        )}
      </div>

      <div className="flex space-x-2">
        <Button onPointerDown={actions.moveLeft} className="bg-accent hover:bg-accent/80 text-background select-none"><ArrowLeft /></Button>
        <Button onPointerDown={actions.jump} className="bg-accent hover:bg-accent/80 text-background select-none"><ArrowUp /></Button>
        <Button onPointerDown={actions.moveRight} className="bg-accent hover:bg-accent/80 text-background select-none"><ArrowRight /></Button>
        <Button onPointerDown={actions.fire} className="bg-primary hover:bg-primary/80 text-background select-none" size="lg"><Zap /> Fire</Button>
      </div>

      <AlertDialog open={gameStatus === GameStatus.ENDED}>
        <AlertDialogContent className="bg-background border-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary font-headline text-3xl">
              {winner === playerName ? "🎉 You Won! 🎉" : "😞 You Lost 😞"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {winner === playerName
                ? `Congratulations, ${winner}! You have proven your skill.`
                : `The winner is ${winner}. Better luck next time!`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onExit} className="w-full bg-primary hover:bg-primary/80 text-background">
              Exit Game
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
