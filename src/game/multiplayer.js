/**
 * Type Rush — Real-Time 1v1 Multiplayer Client Module (Vanilla JS)
 * Supports two automatic transports:
 * 1. Authoritative WebSocket Server (/ws) when hosted on a Node.js server.
 * 2. Serverless P2P / BroadcastChannel fallback when hosted on static hosts like GitHub Pages!
 */

import { generateWordSequence } from './words.js';

const PLAYER_NAME_KEY = 'type_rush_player_name';
const SESSION_PLAYER_ID_KEY = 'type_rush_session_player_id';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'typerush-1v1-room-';

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

function generateStaticRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function createPlayerModel(id, name, isHost) {
  return {
    id,
    name: (name || (isHost ? 'Player 1' : 'Player 2')).trim().slice(0, 18) || 'Player',
    isHost,
    score: 0,
    combo: 0,
    highestCombo: 0,
    wpm: 0,
    accuracy: 100,
    wordIndex: 0,
    wordsCompleted: 0,
    typedLength: 0,
    targetLength: 5,
    finished: false,
    finishReason: null
  };
}

export function createMultiplayerClient(handlers = {}) {
  const playerId = getOrCreatePlayerId();
  let socket = null;
  let pendingQueue = [];
  let currentRoom = null;
  let useStaticFallback = false;

  // Static fallback state (BroadcastChannel + optional PeerJS for GitHub Pages)
  let bcChannel = null;
  let peerInstance = null;
  let peerConn = null;
  let isStaticHost = false;

  function handleIncomingServerMessage(msg) {
    const { type, payload } = msg || {};
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
  }

  // ==========================================
  // STATIC HOST FALLBACK (GitHub Pages P2P + BroadcastChannel)
  // ==========================================
  function cleanupStaticTransport() {
    if (bcChannel) {
      try {
        bcChannel.close();
      } catch {
        // Ignore
      }
      bcChannel = null;
    }
    if (peerConn) {
      try {
        peerConn.close();
      } catch {
        // Ignore
      }
      peerConn = null;
    }
    if (peerInstance) {
      try {
        peerInstance.destroy();
      } catch {
        // Ignore
      }
      peerInstance = null;
    }
  }

  function sendOverStaticTransport(msg) {
    if (bcChannel) {
      try {
        bcChannel.postMessage(msg);
      } catch {
        // Ignore
      }
    }
    if (peerConn && peerConn.open) {
      try {
        peerConn.send(msg);
      } catch {
        // Ignore
      }
    }
  }

  function handleStaticPeerMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (isStaticHost && currentRoom) {
      if (msg.type === 'static:join_request') {
        const guestId = String(msg.payload?.playerId || 'guest');
        let guestName = String(msg.payload?.playerName || 'Player 2').trim().slice(0, 18);
        const existing = currentRoom.players.find((p) => p.id === guestId);
        if (!existing && currentRoom.players.length >= 2) {
          sendOverStaticTransport({
            type: 'room:error',
            targetId: guestId,
            payload: { message: `Room "${currentRoom.roomCode}" already has 2 players.` }
          });
          return;
        }
        if (!existing) {
          const hostName = currentRoom.players[0]?.name?.toLowerCase();
          if (hostName && guestName.toLowerCase() === hostName) {
            guestName = `${guestName.slice(0, 13)} (P2)`;
          }
          currentRoom.players.push(createPlayerModel(guestId, guestName, false));
        }
        const stateMsg = { type: 'room:state', payload: currentRoom };
        sendOverStaticTransport(stateMsg);
        handleIncomingServerMessage(stateMsg);
        return;
      }

      if (msg.type === 'match:rematch' || msg.type === 'match:start') {
        startStaticMatchOnHost();
        return;
      }

      if (msg.type === 'player:progress') {
        const p = currentRoom.players.find((item) => item.id === msg.payload?.playerId);
        if (p) {
          Object.assign(p, msg.payload);
          const oppMsg = { type: 'opponent:progress', payload: { player: p } };
          sendOverStaticTransport(oppMsg);
          handleIncomingServerMessage(oppMsg);
        }
        return;
      }

      if (msg.type === 'player:finished') {
        const p = currentRoom.players.find((item) => item.id === msg.payload?.playerId);
        if (p) {
          Object.assign(p, msg.payload, { finished: true, finishReason: msg.payload?.reason || 'time' });
          const oppMsg = { type: 'opponent:progress', payload: { player: p } };
          sendOverStaticTransport(oppMsg);
          handleIncomingServerMessage(oppMsg);

          const allFinished = currentRoom.players.every((item) => item.finished);
          if (allFinished || msg.payload?.reason === 'time') {
            currentRoom.status = 'finished';
            const finMsg = { type: 'match:finished', payload: currentRoom };
            sendOverStaticTransport(finMsg);
            handleIncomingServerMessage(finMsg);
          }
        }
        return;
      }
    } else {
      // Guest receiving messages from Host
      if (msg.type === 'room:error' && (!msg.targetId || msg.targetId === playerId)) {
        handleIncomingServerMessage(msg);
        return;
      }
      if (
        msg.type === 'room:state' ||
        msg.type === 'match:started' ||
        msg.type === 'match:finished' ||
        msg.type === 'opponent:left'
      ) {
        handleIncomingServerMessage(msg);
        return;
      }
      if (msg.type === 'opponent:progress' && msg.payload?.player?.id !== playerId) {
        handleIncomingServerMessage(msg);
      }
    }
  }

  function startStaticMatchOnHost() {
    if (!currentRoom) return;
    const sharedWords = generateWordSequence(140, currentRoom.config?.difficulty || 'all');
    currentRoom.wordSequence = sharedWords;
    currentRoom.status = 'playing';
    const firstLen = sharedWords[0]?.word?.length || 5;
    for (const p of currentRoom.players) {
      p.score = 0;
      p.combo = 0;
      p.highestCombo = 0;
      p.wpm = 0;
      p.accuracy = 100;
      p.wordIndex = 0;
      p.wordsCompleted = 0;
      p.typedLength = 0;
      p.targetLength = firstLen;
      p.finished = false;
      p.finishReason = null;
    }
    const startMsg = { type: 'match:started', payload: currentRoom };
    sendOverStaticTransport(startMsg);
    handleIncomingServerMessage(startMsg);
  }

  async function initPeerJsIfAvailable(roomCode, asHost, onConnected) {
    try {
      const mod = await import('https://esm.sh/peerjs@1.5.4');
      const Peer = mod.Peer || mod.default;
      if (!Peer) return;

      if (asHost) {
        peerInstance = new Peer(`${PEER_PREFIX}${roomCode}`);
        peerInstance.on('connection', (conn) => {
          peerConn = conn;
          conn.on('data', (data) => handleStaticPeerMessage(data));
        });
      } else {
        peerInstance = new Peer();
        peerInstance.on('open', () => {
          const conn = peerInstance.connect(`${PEER_PREFIX}${roomCode}`, { reliable: true });
          peerConn = conn;
          conn.on('open', () => {
            onConnected?.();
          });
          conn.on('data', (data) => handleStaticPeerMessage(data));
        });
      }
    } catch {
      // BroadcastChannel still works even if offline / CDN blocked
    }
  }

  function executeStaticAction(type, payload) {
    if (type === 'room:create') {
      cleanupStaticTransport();
      isStaticHost = true;
      const roomCode = generateStaticRoomCode();
      const rawConfig = payload.config || {};
      const config = {
        difficulty: ['all', 'easy', 'medium', 'hard'].includes(rawConfig.difficulty)
          ? rawConfig.difficulty
          : 'all',
        duration: [30, 60, 90].includes(Number(rawConfig.duration))
          ? Number(rawConfig.duration)
          : 60
      };
      const hostPlayer = createPlayerModel(playerId, payload.playerName || 'Player 1', true);
      currentRoom = {
        roomCode,
        status: 'waiting',
        config,
        wordSequence: [],
        players: [hostPlayer]
      };

      if (typeof window.BroadcastChannel !== 'undefined') {
        bcChannel = new window.BroadcastChannel(`${PEER_PREFIX}${roomCode}`);
        bcChannel.onmessage = (ev) => handleStaticPeerMessage(ev.data);
      }
      initPeerJsIfAvailable(roomCode, true);
      handleIncomingServerMessage({ type: 'room:state', payload: currentRoom });
      return;
    }

    if (type === 'room:join') {
      cleanupStaticTransport();
      isStaticHost = false;
      const roomCode = String(payload.roomCode || '').trim().toUpperCase();
      const joinReq = {
        type: 'static:join_request',
        payload: {
          playerId,
          playerName: payload.playerName || 'Player 2'
        }
      };

      if (typeof window.BroadcastChannel !== 'undefined') {
        bcChannel = new window.BroadcastChannel(`${PEER_PREFIX}${roomCode}`);
        bcChannel.onmessage = (ev) => handleStaticPeerMessage(ev.data);
        bcChannel.postMessage(joinReq);
      }
      initPeerJsIfAvailable(roomCode, false, () => {
        sendOverStaticTransport(joinReq);
      });
      return;
    }

    if (type === 'match:start' || type === 'match:rematch') {
      if (isStaticHost) {
        startStaticMatchOnHost();
      } else {
        sendOverStaticTransport({ type, payload });
      }
      return;
    }

    if (type === 'player:progress') {
      if (isStaticHost && currentRoom) {
        const me = currentRoom.players.find((p) => p.id === playerId);
        if (me) {
          Object.assign(me, payload);
          sendOverStaticTransport({ type: 'opponent:progress', payload: { player: me } });
        }
      } else {
        sendOverStaticTransport({ type: 'player:progress', payload });
      }
      return;
    }

    if (type === 'player:finished') {
      if (isStaticHost && currentRoom) {
        handleStaticPeerMessage({ type: 'player:finished', payload });
      } else {
        sendOverStaticTransport({ type: 'player:finished', payload });
      }
      return;
    }

    if (type === 'room:leave') {
      cleanupStaticTransport();
      currentRoom = null;
    }
  }

  function switchToStaticFallback() {
    if (useStaticFallback) return;
    useStaticFallback = true;
    socket = null;
    const queue = [...pendingQueue];
    pendingQueue = [];
    for (const item of queue) {
      executeStaticAction(item.type, item.payload);
    }
  }

  function ensureConnected() {
    if (useStaticFallback) return null;
    if (typeof window === 'undefined' || !window.WebSocket) {
      switchToStaticFallback();
      return null;
    }
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return socket;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      socket = new WebSocket(wsUrl);
    } catch {
      switchToStaticFallback();
      return null;
    }

    const fallbackTimer = setTimeout(() => {
      if (socket && socket.readyState !== WebSocket.OPEN) {
        try {
          socket.close();
        } catch {
          // Ignore
        }
        switchToStaticFallback();
      }
    }, 1800);

    socket.addEventListener('open', () => {
      clearTimeout(fallbackTimer);
      const queue = [...pendingQueue];
      pendingQueue = [];
      for (const item of queue) {
        socket.send(JSON.stringify(item));
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleIncomingServerMessage(msg);
      } catch {
        // Ignore invalid messages
      }
    });

    socket.addEventListener('error', () => {
      clearTimeout(fallbackTimer);
      if (!currentRoom) {
        switchToStaticFallback();
      }
    });

    socket.addEventListener('close', () => {
      clearTimeout(fallbackTimer);
      if (!currentRoom && pendingQueue.length > 0) {
        switchToStaticFallback();
      } else {
        socket = null;
      }
    });

    return socket;
  }

  function send(type, payload = {}) {
    const fullPayload = { ...payload, playerId };
    if (useStaticFallback) {
      executeStaticAction(type, fullPayload);
      return;
    }

    const ws = ensureConnected();
    if (useStaticFallback) {
      executeStaticAction(type, fullPayload);
      return;
    }

    const message = { type, payload: fullPayload };
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
