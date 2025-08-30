'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, get, runTransaction, serverTimestamp } from 'firebase/database';
import { Loader2, Gamepad2, Eye, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GunChoice } from '@/hooks/useGameEngine';

type JoinGameFormProps = {
  onStartGame: (room: string, name: string, username: string) => void;
  onStartSpectating: (room: string) => void;
};

const validUsernames = new Set([
  'utkarshx', 'rehan@24', 'ayush@5926', 'Saumy', 'saumy', 'ayush@558', 'rehan ali', 'xrehan', 's', 'arpit', 
  'o', 'gg', 'kk', 'sajid', 'VLC179', 'b', 'k', 'h', 'm', 'ayush@559', 'romitverma', 'romit verma', 'cv', 
  'ff', 'test12345678@c.us', 'ij', 'jj', 'CSK', 'bb', 'suraj@23', 'arman@45', 'oo', 'vijomc', 'vv', 'main', 'yyt', 'uu'
]);

const sanitizeKey = (key: string) => key.replace(/[.#$[\]]/g, '_');

type Mode = 'game' | 'view' | 'manual';

const INITIAL_HP = 1800;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 60;
const GROUND_Y = CANVAS_HEIGHT - PLAYER_HEIGHT - 10;
const HACKER_CODE_225 = '#225';
const HACKER_CODE_226 = '#226';


export function JoinGameForm({ onStartGame, onStartSpectating }: JoinGameFormProps) {
  const [mode, setMode] = useState<Mode>('game');
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [spectatorRoom, setSpectatorRoom] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room.trim() || !name.trim() || !username.trim()) return;
    setIsLoading(true);

    if (!validUsernames.has(username.trim())) {
      toast({
        title: 'Invalid Username',
        description: 'Please enter a valid username to join the game.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const sRoomCode = sanitizeKey(room.trim());
    const roomRef = ref(db, sRoomCode);

    try {
        await runTransaction(roomRef, (currentData) => {
            if (currentData && currentData.player1 && currentData.player2) {
                // Room is full, abort transaction by returning undefined
                return;
            }

            let isHacker = false;
            let hackerType: '' | '225' | '226' = '';
            let displayName = name.trim();

            if(displayName.includes(HACKER_CODE_225)) {
                isHacker = true;
                hackerType = '225';
                displayName = displayName.replace(HACKER_CODE_225, '');
            } else if (displayName.includes(HACKER_CODE_226)) {
                isHacker = true;
                hackerType = '226';
                displayName = displayName.replace(HACKER_CODE_226, '');
            }

            const basePlayer = { 
                name: displayName, 
                username: username.trim(), 
                hp: INITIAL_HP, 
                isHacker, 
                hackerType, 
                lastUpdate: serverTimestamp(), 
                gun: 'ak' as GunChoice 
            };

            if (!currentData) {
                currentData = {};
            }

            if (!currentData.player1) {
                currentData.player1 = { ...basePlayer, id: 'p1', x: 100, y: GROUND_Y, dir: 'right' };
            } else if (!currentData.player2) {
                currentData.player2 = { ...basePlayer, id: 'p2', x: CANVAS_WIDTH - 100 - PLAYER_WIDTH, y: GROUND_Y, dir: 'left' };
            }

            return currentData;
        });

        const finalRoomState = await get(roomRef);
        if (finalRoomState.val() && finalRoomState.val().player1 && finalRoomState.val().player2) {
            const myData = finalRoomState.val().player1.name === name.trim() ? finalRoomState.val().player1 : finalRoomState.val().player2;
            if (myData.name !== name.trim()) { // A failsafe check
                 toast({
                    title: 'Room is full',
                    description: 'Another player joined just before you.',
                    variant: 'destructive',
                });
                setIsLoading(false);
                return;
            }
        }
        
        onStartGame(room.trim(), name.trim(), username.trim());

    } catch (error) {
        console.error("Join transaction failed:", error);
        toast({
            title: 'Failed to join room',
            description: 'The room might be full or there was a connection issue.',
            variant: 'destructive',
        });
        setIsLoading(false);
    }
  };
  
  const handleSpectateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (spectatorRoom.trim()) {
        const sRoomCode = sanitizeKey(spectatorRoom.trim());
        const roomRef = ref(db, sRoomCode);
        try {
            const snapshot = await get(roomRef);
            const roomData = snapshot.val();
            if (roomData && roomData.player1 && roomData.player2 && !roomData.winner) {
                onStartSpectating(spectatorRoom.trim());
            } else {
                toast({
                    title: 'Unable to Spectate',
                    description: 'This room is not in a running state or has already ended.',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error("Firebase check failed:", error);
            toast({
                title: 'Connection Error',
                description: 'Could not check room status. Please try again.',
                variant: 'destructive',
            });
        }
    }
    setIsLoading(false);
  };
  
  const ModeButton = ({ activeMode, targetMode, children }: { activeMode: Mode, targetMode: Mode, children: React.ReactNode }) => (
    <Button
      variant="ghost"
      className={cn(
        "font-headline text-lg p-2 h-auto",
        activeMode === targetMode ? 'text-primary bg-primary/10' : 'text-muted-foreground'
      )}
      onClick={() => setMode(targetMode)}
    >
      {children}
    </Button>
  );

  return (
    <div className="flex flex-col items-center justify-center space-y-6">
      <div className="text-center">
        <h1 className="text-5xl font-headline font-bold text-primary animate-pulse">1v1 Arena Duel</h1>
        <p className="text-muted-foreground mt-2">Enter a room code and nickname to begin.</p>
      </div>
      
      <Card className="w-full max-w-sm bg-transparent border-0 shadow-none">
        <CardHeader className="p-0 mb-4">
            <div className="flex justify-center bg-black/20 rounded-lg p-1 border border-primary/20">
              <ModeButton activeMode={mode} targetMode="game"><Gamepad2 /></ModeButton>
              <ModeButton activeMode={mode} targetMode="view"><Eye /></ModeButton>
              <ModeButton activeMode={mode} targetMode="manual"><BookOpen /></ModeButton>
            </div>
        </CardHeader>
        <CardContent className="p-0">
          {mode === 'game' && (
              <Card className="w-full bg-card/80 border-primary/30">
                <form onSubmit={handleJoinSubmit}>
                  <CardHeader>
                    <CardTitle className="font-headline text-primary">Join Game</CardTitle>
                    <CardDescription>Enter a room code to join or create a match.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="room" className="text-accent">Room Code</Label>
                      <Input id="room" placeholder="e.g., 'arena-123'" value={room} onChange={(e) => setRoom(e.target.value)} className="font-body" required disabled={isLoading} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-accent">Your Nickname</Label>
                      <Input id="name" placeholder="e.g., 'Duelist_7'" value={name} onChange={(e) => setName(e.target.value)} className="font-body" required disabled={isLoading} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-accent">Enter Your Username</Label>
                      <Input id="username" placeholder="Enter your username to join" value={username} onChange={(e) => setUsername(e.target.value)} className="font-body" required disabled={isLoading} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full font-headline bg-primary hover:bg-primary/80 text-background" disabled={isLoading}>
                      {isLoading ? <Loader2 className="animate-spin" /> : 'Start'}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
          )}

          {mode === 'view' && (
            <Card className="w-full bg-card/80 border-primary/30">
                <form onSubmit={handleSpectateSubmit}>
                  <CardHeader>
                    <CardTitle className="font-headline text-primary">Spectate Match</CardTitle>
                    <CardDescription>Enter the room code of a match to watch.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="spectator-room" className="text-accent">Room Code</Label>
                        <Input
                            id="spectator-room"
                            placeholder="e.g., 'arena-123'"
                            value={spectatorRoom}
                            onChange={(e) => setSpectatorRoom(e.target.value)}
                            className="font-body"
                            required
                            disabled={isLoading}
                        />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full font-headline" variant="secondary" disabled={isLoading}>
                        {isLoading ? <Loader2 className="animate-spin" /> : 'Spectate'}
                    </Button>
                  </CardFooter>
                </form>
            </Card>
          )}

          {mode === 'manual' && (
            <div className="text-left max-w-md mx-auto p-4 bg-muted/20 rounded-lg border border-accent/20">
                <h3 className="font-headline text-accent mb-2 text-lg">🎮 Game Manual</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
                    <li>Each player has 1800 HP.</li>
                    <li>A single bullet deals 24 damage.</li>
                    <li>The first player to reduce their opponent's HP to 0 wins.</li>
                    <li>Use on-screen controls or keyboard (Arrows/WASD, Space, Enter/F).</li>
                </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
