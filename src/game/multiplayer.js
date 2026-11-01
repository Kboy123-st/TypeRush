/**
 * Type Rush — Real-Time 1v1 Multiplayer Client Module (Vanilla JS)
 *
 * Supports two seamless real-time transports:
 * 1. Local/Cloud Run WebSocket Server (/ws) when running with server.ts.
 * 2. Serverless Cross-Device WebSocket Relay (MQTT over WSS + BroadcastChannel)
 *    for static deployments such as GitHub Pages (*.github.io), Netlify, or Vercel!
 */

import { generateWordSequence } from './words.js';

const PLAYER_NAME_KEY = 'type_rush_player_name';
const SESSION_PLAYER_ID_KEY = 'type_rush_session_player_id';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOPIC_PREFIX = 'typerush/v2/room/';

const PUBLIC_WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];

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

let cachedMqttLibPromise = null;
function loadMqttLibrary() {
  if (!cachedMqttLibPromise) {
    cachedMqttLibPromise = import(/* @vite-ignore */ 'https://esm.sh/mqtt@5.10.3').then(
      (mod) => mod.default || mod
    );
  }
  return cachedMqttLibPromise;
}

function isKnownStaticHost() {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return (
    host.endsWith('.github.io') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.vercel.app') ||
    window.location.protocol === 'file:'
  );
}

export function createMultiplayerClient(handlers = {}) {
  const playerId = getOrCreatePlayerId();
  let socket = null;
  let pendingQueue = [];
  let currentRoom = null;
  let useStaticFallback = isKnownStaticHost();

  // Static relay state (MQTT over WSS + BroadcastChannel)
  let bcChannel = null;
  let mqttClient = null;
  let activeRoomCode = null;
  let isStaticHost = false;
  let joinRetryInterval = null;
  let joinTimeoutTimer = null;

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
  // STATIC RELAY TRANSPORT (GitHub Pages Cross-Device WSS + BroadcastChannel)
  // ==========================================
  function clearJoinTimers() {
    if (joinRetryInterval) {
      clearInterval(joinRetryInterval);
      joinRetryInterval = null;
    }
    if (joinTimeoutTimer) {
      clearTimeout(joinTimeoutTimer);
      joinTimeoutTimer = null;
    }
  }

  function cleanupStaticTransport() {
    clearJoinTimers();
    if (bcChannel) {
      try {
        bcChannel.close();
      } catch {
        // Ignore
      }
      bcChannel = null;
    }
    if (mqttClient) {
      try {
        mqttClient.end(true);
      } catch {
        // Ignore
      }
      mqttClient = null;
    }
    activeRoomCode = null;
  }

  function publishStaticEvent(msg, retainState = false) {
    if (!activeRoomCode) return;
    const envelope = { ...msg, senderId: playerId, ts: Date.now() };

    if (bcChannel) {
      try {
        bcChannel.postMessage(envelope);
      } catch {
        // Ignore
      }
    }

    if (mqttClient && mqttClient.connected) {
      const baseTopic = `${TOPIC_PREFIX}${activeRoomCode}`;
      const json = JSON.stringify(envelope);
      try {
        mqttClient.publish(`${baseTopic}/events`, json, { qos: 1 });
        if (retainState) {
          mqttClient.publish(`${baseTopic}/state`, json, { qos: 1, retain: true });
        }
      } catch {
        // Ignore publish errors
      }
    }
  }

  function handleStaticRelayMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.senderId === playerId) return;

    if (isStaticHost && currentRoom) {
      if (msg.type === 'static:join_request') {
        const guestId = String(msg.payload?.playerId || 'guest');
        let guestName = String(msg.payload?.playerName || 'Player 2').trim().slice(0, 18);
        const existing = currentRoom.players.find((p) => p.id === guestId);

        if (!existing && currentRoom.players.length >= 2) {
          publishStaticEvent({
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
        publishStaticEvent(stateMsg, true);
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
          publishStaticEvent(oppMsg, false);
          handleIncomingServerMessage(oppMsg);
        }
        return;
      }

      if (msg.type === 'player:finished') {
        const p = currentRoom.players.find((item) => item.id === msg.payload?.playerId);
        if (p) {
          Object.assign(p, msg.payload, {
            finished: true,
            finishReason: msg.payload?.reason || 'time'
          });
          const oppMsg = { type: 'opponent:progress', payload: { player: p } };
          publishStaticEvent(oppMsg, false);
          handleIncomingServerMessage(oppMsg);

          const allFinished = currentRoom.players.every((item) => item.finished);
          if (allFinished || msg.payload?.reason === 'time') {
            currentRoom.status = 'finished';
            const finMsg = { type: 'match:finished', payload: currentRoom };
            publishStaticEvent(finMsg, true);
            handleIncomingServerMessage(finMsg);
          }
        }
        return;
      }

      if (msg.type === 'room:leave') {
        const leavingId = msg.payload?.playerId;
        currentRoom.players = currentRoom.players.filter((p) => p.id !== leavingId);
        currentRoom.status = 'waiting';
        const leftMsg = { type: 'opponent:left', payload: currentRoom };
        publishStaticEvent(leftMsg, true);
        handleIncomingServerMessage(leftMsg);
      }
    } else {
      // Guest receiving messages from Host
      if (msg.type === 'room:error' && (!msg.targetId || msg.targetId === playerId)) {
        clearJoinTimers();
        handleIncomingServerMessage(msg);
        return;
      }

      if (msg.type === 'room:state' && msg.payload?.roomCode === activeRoomCode) {
        const amIInRoom = (msg.payload.players || []).some((p) => p.id === playerId);
        if (amIInRoom) {
          clearJoinTimers();
          handleIncomingServerMessage(msg);
        }
        return;
      }

      if (
        msg.type === 'match:started' ||
        msg.type === 'match:finished' ||
        msg.type === 'opponent:left'
      ) {
        clearJoinTimers();
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
    publishStaticEvent(startMsg, true);
    handleIncomingServerMessage(startMsg);
  }

  async function connectStaticRelay(roomCode, onReady) {
    activeRoomCode = roomCode;

    if (typeof window.BroadcastChannel !== 'undefined') {
      bcChannel = new window.BroadcastChannel(`${TOPIC_PREFIX}${roomCode}`);
      bcChannel.onmessage = (ev) => handleStaticRelayMessage(ev.data);
    }

    try {
      const mqtt = await loadMqttLibrary();
      const baseTopic = `${TOPIC_PREFIX}${roomCode}`;
      const client = mqtt.connect(PUBLIC_WSS_BROKERS[0], {
        keepalive: 30,
        reconnectPeriod: 1500,
        connectTimeout: 5000
      });
      mqttClient = client;

      client.on('connect', () => {
        if (mqttClient !== client) return;
        client.subscribe([`${baseTopic}/events`, `${baseTopic}/state`], { qos: 1 }, () => {
          onReady?.();
        });
      });

      client.on('message', (_topic, payloadBuf) => {
        try {
          const parsed = JSON.parse(payloadBuf.toString());
          handleStaticRelayMessage(parsed);
        } catch {
          // Ignore malformed payload
        }
      });
    } catch {
      // BroadcastChannel still works locally even if offline
      onReady?.();
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

      handleIncomingServerMessage({ type: 'room:state', payload: currentRoom });
      connectStaticRelay(roomCode, () => {
        if (currentRoom && isStaticHost) {
          publishStaticEvent({ type: 'room:state', payload: currentRoom }, true);
        }
      });
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

      connectStaticRelay(roomCode, () => {
        publishStaticEvent(joinReq, false);
      });

      // Immediately broadcast over BroadcastChannel for same-browser tabs
      publishStaticEvent(joinReq, false);

      // Retry join request every 600ms until host acknowledges
      joinRetryInterval = setInterval(() => {
        if (currentRoom && (currentRoom.players || []).some((p) => p.id === playerId)) {
          clearJoinTimers();
          return;
        }
        publishStaticEvent(joinReq, false);
      }, 600);

      joinTimeoutTimer = setTimeout(() => {
        if (!currentRoom || !(currentRoom.players || []).some((p) => p.id === playerId)) {
          clearJoinTimers();
          handleIncomingServerMessage({
            type: 'room:error',
            payload: { message: `Room "${roomCode}" was not found or host is offline.` }
          });
        }
      }, 8000);
      return;
    }

    if (type === 'room:config') {
      if (isStaticHost && currentRoom) {
        const rawConfig = payload.config || {};
        if (['all', 'easy', 'medium', 'hard'].includes(rawConfig.difficulty)) {
          currentRoom.config.difficulty = rawConfig.difficulty;
        }
        if ([30, 60, 90].includes(Number(rawConfig.duration))) {
          currentRoom.config.duration = Number(rawConfig.duration);
        }
        const stateMsg = { type: 'room:state', payload: currentRoom };
        publishStaticEvent(stateMsg, true);
        handleIncomingServerMessage(stateMsg);
      }
      return;
    }

    if (type === 'match:start' || type === 'match:rematch') {
      if (isStaticHost) {
        startStaticMatchOnHost();
      } else {
        publishStaticEvent({ type, payload }, false);
      }
      return;
    }

    if (type === 'player:progress') {
      if (isStaticHost && currentRoom) {
        const me = currentRoom.players.find((p) => p.id === playerId);
        if (me) {
          Object.assign(me, payload);
          publishStaticEvent({ type: 'opponent:progress', payload: { player: me } }, false);
        }
      } else {
        publishStaticEvent({ type: 'player:progress', payload }, false);
      }
      return;
    }

    if (type === 'player:finished') {
      if (isStaticHost && currentRoom) {
        const me = currentRoom.players.find((p) => p.id === playerId);
        if (me) {
          Object.assign(me, payload, {
            finished: true,
            finishReason: payload?.reason || 'time'
          });
          publishStaticEvent({ type: 'opponent:progress', payload: { player: me } }, false);
          const allFinished = currentRoom.players.every((item) => item.finished);
          if (allFinished || payload?.reason === 'time') {
            currentRoom.status = 'finished';
            const finMsg = { type: 'match:finished', payload: currentRoom };
            publishStaticEvent(finMsg, true);
            handleIncomingServerMessage(finMsg);
          }
        }
      } else {
        publishStaticEvent({ type: 'player:finished', payload }, false);
      }
      return;
    }

    if (type === 'room:leave') {
      publishStaticEvent({ type: 'room:leave', payload }, false);
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

    let wsInstance = null;
    try {
      wsInstance = new WebSocket(wsUrl);
      socket = wsInstance;
    } catch {
      switchToStaticFallback();
      return null;
    }

    const fallbackTimer = setTimeout(() => {
      if (wsInstance && wsInstance.readyState !== WebSocket.OPEN) {
        try {
          wsInstance.close();
        } catch {
          // Ignore
        }
        switchToStaticFallback();
      }
    }, 900);

    wsInstance.addEventListener('open', () => {
      clearTimeout(fallbackTimer);
      const queue = [...pendingQueue];
      pendingQueue = [];
      for (const item of queue) {
        wsInstance.send(JSON.stringify(item));
      }
    });

    wsInstance.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleIncomingServerMessage(msg);
      } catch {
        // Ignore invalid messages
      }
    });

    wsInstance.addEventListener('error', () => {
      clearTimeout(fallbackTimer);
      if (!currentRoom) {
        switchToStaticFallback();
      }
    });

    wsInstance.addEventListener('close', () => {
      clearTimeout(fallbackTimer);
      if (!currentRoom && pendingQueue.length > 0) {
        switchToStaticFallback();
      } else if (socket === wsInstance) {
        socket = null;
      }
    });

    return wsInstance;
  }

  function send(type, payload = {}) {
    const fullPayload = { ...payload, playerId };
    if (useStaticFallback) {
      executeStaticAction(type, fullPayload);
      return;
    }

    // Push to pendingQueue BEFORE calling ensureConnected so synchronous errors still flush it!
    const message = { type, payload: fullPayload };
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }

    pendingQueue.push(message);
    ensureConnected();
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
