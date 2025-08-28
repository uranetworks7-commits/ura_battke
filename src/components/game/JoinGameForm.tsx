'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

type JoinGameFormProps = {
  onStartGame: (room: string, name: string) => void;
};

export function JoinGameForm({ onStartGame }: JoinGameFormProps) {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (room.trim() && name.trim()) {
      onStartGame(room.trim(), name.trim());
    }
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
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full font-headline bg-primary hover:bg-primary/80 text-background">
              Start
            </Button>
          </CardFooter>
        </form>
      </Card>
      
      <div className="text-left max-w-md p-4 bg-muted/20 rounded-lg border border-accent/20">
        <h3 className="font-headline text-accent mb-2 text-lg">🎮 Game Manual</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
            <li>Each player has 1800 HP.</li>
            <li>A single bullet deals 24 damage.</li>
            <li>The first player to reduce their opponent's HP to 0 wins.</li>
            <li>Use on-screen controls or keyboard (Arrows/WASD, Space, Enter/F).</li>
        </ul>
      </div>
    </div>
  );
}
