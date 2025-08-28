'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Loader2 } from 'lucide-react';

type JoinGameFormProps = {
  onStartGame: (room: string, name: string, username: string) => void;
};

const validUsernames = new Set([
  'utkarshx', 'rehan@24', 'ayush@5926', 'Saumy', 'saumy', 'ayush@558', 'rehan ali', 'xrehan', 's', 'arpit', 
  'o', 'gg', 'kk', 'sajid', 'VLC179', 'b', 'k', 'h', 'm', 'ayush@559', 'romitverma', 'romit verma', 'cv', 
  'ff', 'test12345678@c.us', 'ij', 'jj', 'CSK', 'bb', 'suraj@23', 'arman@45', 'oo', 'vijomc', 'vv', 'main', 'yyt', 'uu'
]);

const sanitizeKey = (key: string) => key.replace(/[.#$[\]]/g, '_');

export function JoinGameForm({ onStartGame }: JoinGameFormProps) {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    if (room.trim() && name.trim()) {
      const sRoomCode = sanitizeKey(room.trim());
      const roomRef = ref(db, sRoomCode);
      try {
        const snapshot = await get(roomRef);
        const roomData = snapshot.val();
        if (roomData && roomData.player1 && roomData.player2) {
            toast({
                title: 'Room is Full',
                description: 'This room already has two players.',
                variant: 'destructive',
            });
        } else {
            onStartGame(room.trim(), name.trim(), username.trim());
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

  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      <div className="text-center">
        <h1 className="text-5xl font-headline font-bold text-primary animate-pulse">1v1 Arena Duel</h1>
        <p className="text-muted-foreground mt-2">Enter a room code and nickname to begin.</p>
      </div>

      <Card className="w-full max-w-sm bg-card/80 border-primary/30">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="font-headline text-primary">Join Game</CardTitle>
            <CardDescription>Enter a room code to join or create a match.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room" className="text-accent">Room Code</Label>
              <Input
                id="room"
                placeholder="e.g., 'arena-123'"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="font-body"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-accent">Your Nickname</Label>
              <Input
                id="name"
                placeholder="e.g., 'Duelist_7'"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-body"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-accent">Enter Your Username</Label>
              <Input
                id="username"
                placeholder="Enter your username to join"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="font-body"
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full font-headline bg-primary hover:bg-primary/80 text-background" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : 'Start'}
            </Button>
          </CardFooter>
        </form>
      </Card>
      
      <div className="text-left max-w-md p-4 bg-muted/20 rounded-lg border border-accent/20">
        <h3 className="font-headline text-accent mb-2 text-lg">🎮 Game Manual</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
            <li>Each player has 1800 HP.</li>
            <li>A single bullet deals 24 damage.</li>
            <li>Hacker bullet deals 100 damage.</li>
            <li>The first player to reduce their opponent's HP to 0 wins.</li>
            <li>Use on-screen controls or keyboard (Arrows/WASD, Space, Enter/F).</li>
        </ul>
      </div>
    </div>
  );
}
