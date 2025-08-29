'use client';

import { useState } from 'react';
import { JoinGameForm } from '@/components/game/JoinGameForm';
import { Game } from '@/components/game/Game';
import { Spectator } from '@/components/game/Spectator';

export default function Home() {
  const [gameConfig, setGameConfig] = useState<{ room: string; name: string; username: string } | null>(null);
  const [spectatorConfig, setSpectatorConfig] = useState<{ room: string } | null>(null);

  const handleStartGame = (room: string, name: string, username: string) => {
    setGameConfig({ room, name, username });
    setSpectatorConfig(null);
  };

  const handleStartSpectating = (room: string) => {
    setSpectatorConfig({ room });
    setGameConfig(null);
  }

  const handleExit = () => {
    setGameConfig(null);
    setSpectatorConfig(null);
  };

  return (
    <main className="h-screen w-screen flex flex-col bg-background font-body bg-cover bg-center" style={{ backgroundImage: `url('https://i.postimg.cc/y8ZBRDXQ/mmm.png')` }}>
      <div className="flex-1 flex flex-col items-center justify-center text-center text-white bg-black/60 backdrop-blur-sm p-4 sm:p-8">
        {!gameConfig && !spectatorConfig ? (
          <JoinGameForm onStartGame={handleStartGame} onStartSpectating={handleStartSpectating} />
        ) : gameConfig ? (
          <Game roomCode={gameConfig.room} playerName={gameConfig.name} playerUsername={gameConfig.username} onExit={handleExit} />
        ) : (
          <Spectator roomCode={spectatorConfig!.room} onExit={handleExit} />
        )}
      </div>
    </main>
  );
}
