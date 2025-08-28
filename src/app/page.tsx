'use client';

import { useState } from 'react';
import { JoinGameForm } from '@/components/game/JoinGameForm';
import { Game } from '@/components/game/Game';

export default function Home() {
  const [gameConfig, setGameConfig] = useState<{ room: string; name: string; username: string } | null>(null);

  const handleStartGame = (room: string, name: string, username: string) => {
    setGameConfig({ room, name, username });
  };

  const handleExit = () => {
    setGameConfig(null);
    // This will effectively reload the page to the join screen state.
    window.location.reload();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-body" style={{ backgroundImage: `url('https://i.postimg.cc/y8ZBRDXQ/mmm.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="z-10 w-full max-w-5xl text-center text-white bg-black/60 backdrop-blur-sm rounded-lg p-4 sm:p-8 border border-primary/50">
        {!gameConfig ? (
          <JoinGameForm onStartGame={handleStartGame} />
        ) : (
          <Game roomCode={gameConfig.room} playerName={gameConfig.name} playerUsername={gameConfig.username} onExit={handleExit} />
        )}
      </div>
    </main>
  );
}
