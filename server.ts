import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateWordSequence } from './src/game/words.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlayerState {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  combo: number;
  highestCombo: number;
  wpm: number;
  accuracy: number;
  lives: number;
  maxLives: number;
  wordIndex: number;
  wordsCompleted: number;
  typedLength: number;
  targetLength: number;
  finished: boolean;
  finishReason: string | null;
}

interface RoomConfig {
  difficulty: 'all' | 'easy' | 'medium' | 'hard';
  duration: number;
  lives: number;
}

interface Room {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  config: RoomConfig;
  wordSequence: Array<{ word: string; difficulty: string }>;
  players: Map<string, PlayerState>;
  sockets: Map<string, WebSocket>;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function serializeRoom(room: Room) {
  return {
    roomCode: room.roomCode,
    status: room.status,
    config: room.config,
    wordSequence: room.wordSequence,
    players: Array.from(room.players.values())
  };
}

function broadcastToRoom(room: Room, message: object, excludePlayerId?: string) {
  const payload = JSON.stringify(message);
  for (const [playerId, ws] of room.sockets.entries()) {
    if (excludePlayerId && playerId === excludePlayerId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function createInitialPlayer(
  id: string,
  name: string,
  isHost: boolean,
  config: RoomConfig
): PlayerState {
  return {
    id,
    name: (name || (isHost ? 'Player 1' : 'Player 2')).trim().slice(0, 18) || 'Player',
    isHost,
    score: 0,
    combo: 0,
    highestCombo: 0,
    wpm: 0,
    accuracy: 100,
    lives: config.lives,
    maxLives: config.lives,
    wordIndex: 0,
    wordsCompleted: 0,
    typedLength: 0,
    targetLength: 5,
    finished: false,
    finishReason: null
  };
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  app.use(express.json());

  // Health/Room status endpoint
  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(serializeRoom(room));
  });

  wss.on('connection', (ws: WebSocket) => {
    let boundRoomCode: string | null = null;
    let boundPlayerId: string | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const { type, payload = {} } = msg;

        if (type === 'room:create') {
          const playerId = String(payload.playerId || `p_${Math.random().toString(36).slice(2, 9)}`);
          const playerName = String(payload.playerName || 'Player 1');
          const rawConfig = payload.config || {};
          const config: RoomConfig = {
            difficulty: ['all', 'easy', 'medium', 'hard'].includes(rawConfig.difficulty)
              ? rawConfig.difficulty
              : 'all',
            duration: [30, 60, 90].includes(Number(rawConfig.duration))
              ? Number(rawConfig.duration)
              : 60,
            lives: [3, 5].includes(Number(rawConfig.lives)) ? Number(rawConfig.lives) : 3
          };

          const roomCode = generateRoomCode();
          const room: Room = {
            roomCode,
            status: 'waiting',
            config,
            wordSequence: [],
            players: new Map(),
            sockets: new Map(),
            createdAt: Date.now()
          };

          const hostPlayer = createInitialPlayer(playerId, playerName, true, config);
          room.players.set(playerId, hostPlayer);
          room.sockets.set(playerId, ws);
          rooms.set(roomCode, room);

          boundRoomCode = roomCode;
          boundPlayerId = playerId;

          ws.send(
            JSON.stringify({
              type: 'room:state',
              payload: serializeRoom(room)
            })
          );
          return;
        }

        if (type === 'room:join') {
          const roomCode = String(payload.roomCode || '')
            .trim()
            .toUpperCase();
          const playerId = String(payload.playerId || `p_${Math.random().toString(36).slice(2, 9)}`);
          const playerName = String(payload.playerName || 'Player 2');

          const room = rooms.get(roomCode);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                payload: { message: `Room "${roomCode}" was not found.` }
              })
            );
            return;
          }

          if (!room.players.has(playerId) && room.players.size >= 2) {
            ws.send(
              JSON.stringify({
                type: 'room:error',
                payload: { message: `Room "${roomCode}" already has 2 players.` }
              })
            );
            return;
          }

          const existing = room.players.get(playerId);
          if (existing) {
            existing.name = playerName.trim().slice(0, 18) || existing.name;
          } else {
            const isHost = room.players.size === 0;
            let resolvedName = playerName.trim().slice(0, 18) || (isHost ? 'Player 1' : 'Player 2');
            const existingNames = Array.from(room.players.values()).map((p) =>
              p.name.toLowerCase()
            );
            if (existingNames.includes(resolvedName.toLowerCase())) {
              resolvedName = `${resolvedName.slice(0, 13)} (P2)`;
            }
            const newPlayer = createInitialPlayer(playerId, resolvedName, isHost, room.config);
            room.players.set(playerId, newPlayer);
          }

          room.sockets.set(playerId, ws);
          boundRoomCode = roomCode;
          boundPlayerId = playerId;

          broadcastToRoom(room, {
            type: 'room:state',
            payload: serializeRoom(room)
          });
          return;
        }

        if (!boundRoomCode || !boundPlayerId) return;
        const room = rooms.get(boundRoomCode);
        if (!room) return;

        if (type === 'room:config') {
          const player = room.players.get(boundPlayerId);
          if (!player || !player.isHost) return;
          const rawConfig = payload.config || {};
          if (['all', 'easy', 'medium', 'hard'].includes(rawConfig.difficulty)) {
            room.config.difficulty = rawConfig.difficulty;
          }
          if ([30, 60, 90].includes(Number(rawConfig.duration))) {
            room.config.duration = Number(rawConfig.duration);
          }
          if ([3, 5].includes(Number(rawConfig.lives))) {
            room.config.lives = Number(rawConfig.lives);
          }
          for (const p of room.players.values()) {
            p.lives = room.config.lives;
            p.maxLives = room.config.lives;
          }
          broadcastToRoom(room, {
            type: 'room:state',
            payload: serializeRoom(room)
          });
          return;
        }

        if (type === 'match:start' || type === 'match:rematch') {
          const sharedWords = generateWordSequence(140, room.config.difficulty);
          room.wordSequence = sharedWords;
          room.status = 'playing';

          const firstWordLen = sharedWords[0]?.word?.length || 5;
          for (const p of room.players.values()) {
            p.score = 0;
            p.combo = 0;
            p.highestCombo = 0;
            p.wpm = 0;
            p.accuracy = 100;
            p.lives = room.config.lives;
            p.maxLives = room.config.lives;
            p.wordIndex = 0;
            p.wordsCompleted = 0;
            p.typedLength = 0;
            p.targetLength = firstWordLen;
            p.finished = false;
            p.finishReason = null;
          }

          broadcastToRoom(room, {
            type: 'match:started',
            payload: serializeRoom(room)
          });
          return;
        }

        if (type === 'player:progress') {
          const player = room.players.get(boundPlayerId);
          if (!player) return;

          player.score = Number(payload.score ?? player.score);
          player.combo = Number(payload.combo ?? player.combo);
          player.highestCombo = Number(payload.highestCombo ?? player.highestCombo);
          player.wpm = Number(payload.wpm ?? player.wpm);
          player.accuracy = Number(payload.accuracy ?? player.accuracy);
          player.lives = Number(payload.lives ?? player.lives);
          player.wordIndex = Number(payload.wordIndex ?? player.wordIndex);
          player.wordsCompleted = Number(payload.wordsCompleted ?? player.wordsCompleted);
          player.typedLength = Number(payload.typedLength ?? player.typedLength);
          player.targetLength = Math.max(1, Number(payload.targetLength ?? player.targetLength));

          broadcastToRoom(
            room,
            {
              type: 'opponent:progress',
              payload: { player }
            },
            boundPlayerId
          );
          return;
        }

        if (type === 'player:finished') {
          const player = room.players.get(boundPlayerId);
          if (!player) return;

          player.score = Number(payload.score ?? player.score);
          player.combo = Number(payload.combo ?? player.combo);
          player.highestCombo = Number(payload.highestCombo ?? player.highestCombo);
          player.wpm = Number(payload.wpm ?? player.wpm);
          player.accuracy = Number(payload.accuracy ?? player.accuracy);
          player.lives = Number(payload.lives ?? player.lives);
          player.wordsCompleted = Number(payload.wordsCompleted ?? player.wordsCompleted);
          player.finished = true;
          player.finishReason = String(payload.reason || 'time');

          // Notify opponent that this player finished (e.g. out of hearts or time up)
          broadcastToRoom(
            room,
            {
              type: 'opponent:progress',
              payload: { player }
            },
            boundPlayerId
          );

          // Check if all connected players in the room have finished
          const allPlayers = Array.from(room.players.values());
          const allFinished = allPlayers.length > 0 && allPlayers.every((p) => p.finished);
          if (allFinished || payload.reason === 'time') {
            room.status = 'finished';
            broadcastToRoom(room, {
              type: 'match:finished',
              payload: serializeRoom(room)
            });
          }
          return;
        }

        if (type === 'room:leave') {
          handleDisconnect();
        }
      } catch {
        // Ignore malformed messages
      }
    });

    function handleDisconnect() {
      if (!boundRoomCode || !boundPlayerId) return;
      const room = rooms.get(boundRoomCode);
      if (!room) return;

      room.players.delete(boundPlayerId);
      room.sockets.delete(boundPlayerId);

      if (room.players.size === 0) {
        rooms.delete(boundRoomCode);
      } else {
        // Promote remaining player to host
        const remaining = Array.from(room.players.values())[0];
        if (remaining) {
          remaining.isHost = true;
        }
        room.status = 'waiting';
        broadcastToRoom(room, {
          type: 'opponent:left',
          payload: serializeRoom(room)
        });
      }

      boundRoomCode = null;
      boundPlayerId = null;
    }

    ws.on('close', handleDisconnect);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Type Rush server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
