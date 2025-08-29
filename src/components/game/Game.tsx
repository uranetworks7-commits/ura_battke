'use client';

import { useRef, useEffect } from 'react';
import { useGameEngine, GameStatus } from '@/hooks/useGameEngine';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp, Zap, ShieldAlert, XCircle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';

type GameProps = {
  roomCode: string;
  playerName: string;
  playerUsername: string;
  onExit: () => void;
};

export function Game({ roomCode, playerName, playerUsername, onExit }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { player, opponent, gameStatus, winner, actions, cheaterDetected } = useGameEngine(canvasRef, roomCode, playerName, playerUsername);

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
    <div className="h-full w-full flex flex-col items-center justify-between gap-4">
      {/* Top Bar: Players Info */}
      <div className="w-full flex justify-between items-center text-sm sm:text-base px-2 pt-2">
        <div className="flex flex-col items-start gap-1 w-2/5">
          <p className="font-headline text-primary truncate ">{player?.name || 'Player'}</p>
          <Progress value={(player.hp / 1800) * 100} className="w-full h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {player.hp}</p>
        </div>
        <div className="font-headline text-2xl text-accent">VS</div>
        <div className="flex flex-col items-end gap-1 text-right w-2/5">
           <div className="flex items-center justify-end gap-2 w-full">
             {gameStatus === GameStatus.PLAYING && opponent.name !== 'Opponent' && (
                <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/20 hover:text-red-400 h-7 w-7" onClick={actions.reportOpponent}>
                    <ShieldAlert size={16} />
                </Button>
             )}
            <p className="font-headline text-primary truncate">{gameStatus === GameStatus.WAITING ? 'Waiting...' : opponent?.name}</p>
          </div>
          <Progress value={(opponent.hp / 1800) * 100} className="w-full h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {opponent.hp}</p>
        </div>
      </div>
      
      {/* Game Canvas */}
      <div className="relative w-full flex-1 max-w-4xl mx-auto my-2">
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full border-2 border-primary shadow-2xl shadow-primary/30 rounded-lg" width={800} height={450} />
        {gameStatus === GameStatus.WAITING && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <p className="text-2xl font-headline text-white animate-pulse">Waiting for opponent...</p>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="w-full flex justify-between items-center p-2">
        <div className="flex space-x-2">
          <Button onPointerDown={actions.moveLeft} className="bg-accent hover:bg-accent/80 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowLeft size={32} /></Button>
          <Button onPointerDown={actions.moveRight} className="bg-accent hover:bg-accent/80 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowRight size={32} /></Button>
        </div>
        <div className="flex space-x-2">
          <Button onPointerDown={actions.jump} className="bg-accent hover:bg-accent/80 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowUp size={32} /></Button>
          <Button onPointerDown={actions.fire} className="bg-primary hover:bg-primary/80 text-background select-none h-20 w-20 sm:h-24 sm:w-24 rounded-full text-lg"><Zap size={40} /></Button>
        </div>
      </div>

      <AlertDialog open={gameStatus === GameStatus.ENDED && !!winner}>
        <AlertDialogContent className="bg-background border-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary font-headline text-3xl">
              {winner === player.name ? "🎉 You Won! 🎉" : "😞 You Lost 😞"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {winner === player.name
                ? `Congratulations, ${winner}! You have proven your skill.`
                : `The winner is ${winner}. Better luck next time!`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <Button onClick={onExit} className="w-full font-headline bg-primary hover:bg-primary/80 text-background">
                <XCircle className="mr-2" /> Exit Game
             </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cheaterDetected}>
        <AlertDialogContent className="bg-red-900/90 border-red-500 animate-pulse">
            <AlertDialogHeader>
                <AlertDialogTitle className="text-red-400 font-headline text-3xl text-center">
                    Cheater Detected!
                </AlertDialogTitle>
                <AlertDialogDescription className="text-red-200 text-center">
                    This match has been terminated.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogAction onClick={onExit} className="w-full bg-red-600 hover:bg-red-700 text-white">
                    Exit
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
