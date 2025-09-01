'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { useGameEngine, GameStatus, GunChoice } from '@/hooks/useGameEngine';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp, Zap, ShieldAlert, XCircle, Volume2, VolumeX, Wifi } from 'lucide-react';
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
  const { player, opponent, gameStatus, winner, actions, cheaterDetected, isMuted, grenadeCooldown, awmCooldown, isTargetingAirstrike } = useGameEngine(canvasRef, roomCode, playerName, playerUsername);

  const handleGunSelect = (gun: GunChoice) => {
    actions.selectGun(gun);
  }

  const handleFirePress = () => {
    actions.startFire();
  };

  const handleFireRelease = () => {
    actions.fire();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isTargetingAirstrike) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = event.clientX - rect.left;
        // Scale click coordinates to canvas coordinates
        const canvasX = (x / rect.width) * canvasRef.current!.width;
        actions.setAirstrikeTarget(canvasX);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        switch (e.key.toLowerCase()) {
            case 'arrowleft':
            case 'a':
                actions.startMoveLeft();
                break;
            case 'arrowright':
            case 'd':
                actions.startMoveRight();
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
                actions.startFire();
                break;
        }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        switch (e.key.toLowerCase()) {
            case 'arrowleft':
            case 'a':
                actions.stopMoveLeft();
                break;
            case 'arrowright':
            case 'd':
                actions.stopMoveRight();
                break;
            case 'f':
            case 'enter':
                e.preventDefault();
                actions.fire();
                break;
        }
    };


    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [actions]);

  const gunIconClass = "p-1 rounded-md cursor-pointer border-2 bg-white w-[40px] h-[28px] flex items-center justify-center";

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
            <Wifi size={18} className="text-green-500" />
          </div>
          <Progress value={(player.hp / 1800) * 100} className="w-full h-3 bg-red-500/20 [&>div]:bg-red-500" />
          <p className="font-mono text-xs">HP: {player.hp}</p>
          <div className="flex flex-col items-start gap-2 mt-2">
            <div className="flex items-end gap-2">
                <div
                className={cn(
                    gunIconClass,
                    player.gun === 'ak' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
                )}
                onClick={() => handleGunSelect('ak')}
                >
                <Image src="https://i.postimg.cc/gJcNdRMB/1756463704515.png" alt="Ak" width={40} height={20} className="w-10 h-5 object-contain" />
                </div>
                <div
                  className={cn(
                    gunIconClass, 'relative',
                    player.gun === 'awm' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
                  )}
                  onClick={() => handleGunSelect('awm')}
                >
                  <Image src="https://i.postimg.cc/JnDCPFfR/1756465348663.png" alt="AWM" width={40} height={20} className="w-10 h-5 object-contain" />
                   {awmCooldown > 0 && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center font-bold text-white text-base">
                            {awmCooldown}
                        </div>
                    )}
                </div>
                <div
                    className={cn(
                        gunIconClass, 'relative',
                        player.gun === 'grenade' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
                    )}
                    onClick={() => handleGunSelect('grenade')}
                >
                    <Image src="https://i.postimg.cc/FRLXP1mf/1756586440631.png" alt="Grenade" width={24} height={24} className="object-contain" />
                    {grenadeCooldown > 0 && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center font-bold text-white text-base">
                            {grenadeCooldown}
                        </div>
                    )}
                </div>
            </div>
            <div
                className={cn(
                    gunIconClass, 'relative',
                    isTargetingAirstrike ? 'border-red-500 animate-pulse' : (player.gun === 'airstrike' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'),
                    player.airstrikesLeft === 0 ? 'opacity-20 cursor-not-allowed' : ''
                )}
                onClick={() => player.airstrikesLeft > 0 && handleGunSelect('airstrike')}
                >
                <Image src="https://i.postimg.cc/wMdHdzrd/1756758625266.png" alt="Airstrike" width={28} height={28} className="object-contain" />
                {player.airstrikesLeft > 0 && (
                    <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">{player.airstrikesLeft}</span>
                )}
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
          <div className="flex flex-col items-end gap-2 mt-2">
            <div className="flex items-end justify-end gap-2">
                <div
                    className={cn(
                      gunIconClass, 'relative',
                      opponent.gun === 'grenade' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
                    )}>
                      <Image src="https://i.postimg.cc/FRLXP1mf/1756586440631.png" alt="Grenade" width={24} height={24} className="object-contain" />
                </div>
                <div
                  className={cn(
                    gunIconClass,
                    opponent.gun === 'awm' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
                  )}
                >
                  <Image src="https://i.postimg.cc/JnDCPFfR/1756465348663.png" alt="AWM" width={40} height={20} className="w-10 h-5 object-contain" />
                </div>
                <div
                  className={cn(
                    gunIconClass,
                    opponent.gun === 'ak' ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60'
                  )}
                >
                  <Image src="https://i.postimg.cc/gJcNdRMB/1756463704515.png" alt="Ak" width={40} height={20} className="w-10 h-5 object-contain" />
                </div>
            </div>
             <div
                className={cn(
                    gunIconClass, 'relative',
                    (opponent.gun === 'airstrike' || opponent.airstrikeTarget) ? 'border-primary bg-opacity-100' : 'border-transparent opacity-60',
                    opponent.airstrikesLeft === 0 ? 'opacity-20' : ''
                )}
                >
                <Image src="https://i.postimg.cc/wMdHdzrd/1756758625266.png" alt="Airstrike" width={28} height={28} className="object-contain" />
                 {opponent.airstrikesLeft > 0 && (
                    <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">{opponent.airstrikesLeft}</span>
                )}
            </div>
          </div>
          )}
        </div>
      </div>
      
      {/* Game Canvas */}
      <div className="relative w-full flex-1 max-w-4xl mx-auto my-2">
        <canvas 
          ref={canvasRef} 
          className={cn(
            "absolute top-0 left-0 w-full h-full border-2 border-primary shadow-2xl shadow-primary/30 rounded-lg",
            isTargetingAirstrike ? "cursor-crosshair" : ""
            )} 
          width={800} 
          height={450} 
          onClick={handleCanvasClick}
          />
        {gameStatus === GameStatus.WAITING && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <p className="text-2xl font-headline text-white animate-pulse">Waiting for opponent...</p>
          </div>
        )}
        {isTargetingAirstrike && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg pointer-events-none">
            <p className="font-bold text-red-500 animate-pulse text-2xl tracking-widest">MARK AIRSTRIKE LOCATION</p>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
       <div className="w-full max-w-lg mx-auto flex justify-between items-center p-2">
        <div className="flex gap-2">
          <Button 
            onPointerDown={actions.startMoveLeft}
            onPointerUp={actions.stopMoveLeft}
            onMouseLeave={actions.stopMoveLeft}
            className="bg-primary/80 hover:bg-primary/90 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"
          >
            <ArrowLeft size={32} />
          </Button>
          <Button 
            onPointerDown={actions.startMoveRight}
            onPointerUp={actions.stopMoveRight}
            onMouseLeave={actions.stopMoveRight}
            className="bg-primary/80 hover:bg-primary/90 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"
          >
            <ArrowRight size={32} />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onPointerDown={actions.jump} className="bg-primary/80 hover:bg-primary/90 text-background select-none h-14 w-14 sm:h-16 sm:w-16 rounded-full"><ArrowUp size={32} /></Button>
          <Button 
            onPointerDown={handleFirePress}
            onPointerUp={handleFireRelease}
            onMouseLeave={handleFireRelease}
            onTouchStart={(e) => { e.preventDefault(); handleFirePress(); }}
            onTouchEnd={(e) => { e.preventDefault(); handleFireRelease(); }}
            className="bg-red-600 hover:bg-red-700 text-white select-none h-20 w-20 sm:h-24 sm:w-24 rounded-full text-lg"
          ><Zap size={40} /></Button>
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
