'use client';

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import { useGameEngine, GameStatus, GunChoice } from '@/hooks/useGameEngine';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp, Zap, ShieldAlert, XCircle, Volume2, VolumeX } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type GameProps = {
  roomCode: string;
  playerName: string;
  playerUsername: string;
  onExit: () => void;
};

export function Game({ roomCode, playerName, playerUsername, onExit }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { player, opponent, gameStatus, winner, actions, cheaterDetected, isMuted } = useGameEngine(canvasRef, roomCode, playerName, playerUsername);

  const handleGunSelect = (gun: GunChoice) => {
    actions.selectGun(gun);
  }

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
    <div className="flex-1 flex flex-col items-center justify-between p-2 sm:p-4 gap-4 w-full h-full max-w-7xl mx-auto">
      {/* Top Bar: Players Info & Gun Selection */}
      <div className="w-full flex justify-between items-start text-sm sm:text-base px-2 pt-2 gap-2">
        <div className="flex flex-col items-start gap-1 w-2/5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={actions.toggleMute} className="text-white hover:bg-white/10 h-7 w-7">
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
            <p className="font-headline text-primary truncate ">{player?.name || 'Player'}</p>
          </div>
          <Progress value={(player.hp / 1800) * 100} className="w-full h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {player.hp}</p>
          <div className="flex items-center gap-2 mt-2">
            <div
              className={cn(
                'p-1 rounded-md cursor-pointer border-2 bg-white',
                player.gun === 'ak' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
              )}
              onClick={() => handleGunSelect('ak')}
            >
              <Image src="https://i.postimg.cc/gJcNdRMB/1756463704515.png" alt="Ak" width={48} height={24} className="w-12 h-6 object-contain" />
            </div>
            <div
              className={cn(
                'p-1 rounded-md cursor-pointer border-2 bg-white',
                player.gun === 'awm' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
              )}
              onClick={() => handleGunSelect('awm')}
            >
              <Image src="https://i.postimg.cc/JnDCPFfR/1756465348663.png" alt="AWM" width={48} height={24} className="w-12 h-6 object-contain" />
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 text-center flex flex-col items-center gap-2 pt-2">
          <p className="font-headline text-2xl text-accent">VS</p>
        </div>

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
          {gameStatus === GameStatus.PLAYING && opponent.name !== 'Opponent' && (
          <div className="flex items-center justify-end gap-2 mt-2">
            <div
              className={cn(
                'p-1 rounded-md border-2 bg-white',
                opponent.gun === 'ak' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
              )}
            >
              <Image src="https://i.postimg.cc/gJcNdRMB/1756463704515.png" alt="Ak" width={48} height={24} className="w-12 h-6 object-contain" />
            </div>
            <div
              className={cn(
                'p-1 rounded-md border-2 bg-white',
                opponent.gun === 'awm' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
              )}
            >
              <Image src="https://i.postimg.cc/JnDCPFfR/1756465348663.png" alt="AWM" width={48} height={24} className="w-12 h-6 object-contain" />
            </div>
          </div>
          )}
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
       <div className="w-full max-w-lg mx-auto flex justify-between items-center p-2">
        <div className="flex gap-2">
          <Button onPointerDown={actions.moveLeft} className="bg-primary/80 hover:bg-primary/90 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowLeft size={32} /></Button>
          <Button onPointerDown={actions.moveRight} className="bg-primary/80 hover:bg-primary/90 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowRight size={32} /></Button>
        </div>
        <div className="flex gap-2">
          <Button onPointerDown={actions.jump} className="bg-primary/80 hover:bg-primary/90 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowUp size={32} /></Button>
          <Button onPointerDown={actions.fire} className="bg-red-600 hover:bg-red-700 text-white select-none h-20 w-20 sm:h-24 sm:w-24 rounded-full text-lg"><Zap size={40} /></Button>
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
