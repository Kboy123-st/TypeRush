/**
 * Type Rush — Real-Time 1v1 Multiplayer Client Module (Vanilla JS)
 * Connects to the authoritative WebSocket room server on /ws (port 3000)
 * and synchronizes lobby state, shared word sequences, live opponent progress,
 * and head-to-head match outcomes.
 */

const PLAYER_NAME_KEY = 'type_rush_player_name';
const SESSION_PLAYER_ID_KEY = 'type_rush_session_player_id';

export function getOrCreatePlayerId() {
  try {
    let id = window.sessionStorage.getItem(SESSION_PLAYER_ID_KEY);
    if (!id) {
      id = `tr_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return `tr_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function loadSavedPlayerName() {
  try {
    return window.localStorage.getItem(PLAYER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name) {
  const cleaned = String(name || '').trim().slice(0, 18);
  try {
    if (cleaned) {
      window.localStorage.setItem(PLAYER_NAME_KEY, cleaned);
    }
  } catch {
    // Ignore storage errors
  }
  return cleaned;
}

export function createMultiplayerClient(handlers = {}) {
  const playerId = getOrCreatePlayerId();
  let socket = null;
  let pendingQueue = [];
  let currentRoom = null;

  function ensureConnected() {
    if (typeof window === 'undefined' || !window.WebSocket) return null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return socket;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      const queue = [...pendingQueue];
      pendingQueue = [];
      for (const item of queue) {
        socket.send(JSON.stringify(item));
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, payload } = msg;

        if (type === 'room:state') {
          currentRoom = payload;
          handlers.onRoomState?.(payload);
        } else if (type === 'room:error') {
          handlers.onRoomError?.(payload?.message || 'Unable to join room.');
        } else if (type === 'match:started') {
          currentRoom = payload;
          handlers.onMatchStarted?.(payload);
        } else if (type === 'opponent:progress') {
          if (currentRoom && payload?.player) {
            const idx = currentRoom.players.findIndex((p) => p.id === payload.player.id);
            if (idx >= 0) {
              currentRoom.players[idx] = payload.player;
            }
          }
          handlers.onOpponentProgress?.(payload?.player);
        } else if (type === 'match:finished') {
          currentRoom = payload;
          handlers.onMatchFinished?.(payload);
        } else if (type === 'opponent:left') {
          currentRoom = payload;
          handlers.onOpponentLeft?.(payload);
        }
      } catch {
        // Ignore invalid messages
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
    });

    return socket;
  }

  function send(type, payload = {}) {
    const ws = ensureConnected();
    const message = { type, payload: { ...payload, playerId } };
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      pendingQueue.push(message);
    }
  }

  return {
    getPlayerId: () => playerId,
    getCurrentRoom: () => currentRoom,

    createRoom(playerName, config) {
      const savedName = savePlayerName(playerName) || 'Player 1';
      send('room:create', { playerName: savedName, config });
    },

    joinRoom(roomCode, playerName) {
      const cleanedCode = String(roomCode || '').trim().toUpperCase();
      const savedName = savePlayerName(playerName) || 'Player 2';
      send('room:join', { roomCode: cleanedCode, playerName: savedName });
    },

    updateConfig(config) {
      send('room:config', { config });
    },

    startMatch() {
      send('match:start', {});
    },

    requestRematch() {
      send('match:rematch', {});
    },

    sendProgress(stats) {
      send('player:progress', stats);
    },

    sendFinished(stats) {
      send('player:finished', stats);
    },

    leaveRoom() {
      if (currentRoom) {
        send('room:leave', { roomCode: currentRoom.roomCode });
      }
      currentRoom = null;
    }
  };
}
