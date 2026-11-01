# Type Rush — Real-Time 1v1 Invite Friend Mode

Adds a live head-to-head **Invite Friend** mode where two players join a shared room via a short room code or invite link, race simultaneously through the exact same word sequence, watch each other's live score, combo, and letter progress in real time, and compete for the highest score.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following gameplay and UX decisions have been locked in based on your selections:

- **Confirmed Decision 1 — Shared Word Sequence with Independent Pace**: Both players receive the exact same server-seeded word list in the same order (`Word #1`, `Word #2`, `Word #3`, ...), advancing to their next word as soon as they complete their current word.
- **Confirmed Decision 2 — Highest Score Win Condition**: The match runs until the round timer expires or both players run out of hearts. If one player loses all hearts early, their score locks in while the remaining player can finish the remaining time (or end immediately if both finish), and the highest final score wins.
- **Confirmed Decision 3 — Live Opponent Progress Card**: During the match, a compact Cute Arcade **Opponent Progress Card** sits above the word stage showing your friend's nickname, live score, current combo badge, remaining hearts, word index, and a real-time letter progress bar for the word they are currently typing.
- **Real-Time Sync Infrastructure**: Uses a lightweight Node + WebSocket room relay integrated alongside Vite on port 3000 (plus automatic `BroadcastChannel` fallback for instant same-browser multi-tab testing) while keeping the frontend 100% vanilla HTML, CSS, and JavaScript.

---

## 1. Overview & Core Concept

- **What It Does**: Lets any player create a private 1v1 arcade room, copy a shareable invite link (`?room=ABCD`) or 4-character room code, wait in a cute sticker-styled lobby until their friend connects, and launch a synchronized countdown (`3 · 2 · 1 · RUSH!`) into a simultaneous same-word typing race.
- **Target Audience / Persona**: Friends, classmates, and coworkers who want a quick, playful 60-second typing duel in the browser without account sign-ups.
- **Key Value**: Transforms Type Rush from a solo high-score chaser into a social, competitive arcade party game while preserving the existing solo gameplay intact.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Home Screen Entry**: Next to **PLAY NOW (Solo)**, a prominent **INVITE FRIEND (1v1)** button opens the Multiplayer Lobby modal (or auto-joins directly when opening an invite URL `?room=XXXX`).
  2. **Lobby & Invite Flow**:
     - Enter a playful nickname (saved in `localStorage`).
     - **Create Room**: Generates a 4-letter room code (e.g., `RUSH`) and a one-click **Copy Invite Link** button (`?room=RUSH`), plus host settings for Round Duration (`30s / 60s / 90s`), Starting Hearts (`3 / 5`), and Difficulty (`All Mix / Easy / Medium / Hard`).
     - **Join Room**: Enter a friend's 4-letter room code or open their shared link directly to join their lobby slot.
     - **Ready & Countdown**: Once both players are in the room, the host clicks **START 1V1 MATCH**, triggering a synchronized `3 · 2 · 1 · GO!` overlay for both players.
  3. **Live 1v1 Race Screen**:
     - Retains the existing top HUD and center 3D keycap word stage.
     - Displays the **Live Opponent Progress Card** directly above the word stage showing: Friend's Name, Live Score (`tabular-nums`), Combo & Multiplier pill (`5x · 2x MULT`), Hearts remaining, Current Word `#`, and an animated progress bar filling as they type each letter of their word.
     - Shows a subtle lead indicator badge (`YOU LEAD +40` or `TIED!`) to build excitement without cluttering the typing area.
  4. **Head-to-Head Results Screen**:
     - Displays a **VICTORY! / DEFEAT! / DRAW!** banner at match end.
     - Shows a side-by-side comparison card (**You vs. Friend**) comparing Final Score, WPM, Accuracy %, Words Completed, and Highest Combo.
     - Includes a **REMATCH (Same Room)** button to immediately play another round with a fresh shared word seed, plus **HOME**.

- **Visual Identity & Theme**:
  - **Aesthetic Direction**: Matches the existing **Cute Colorful Sticker & Doodle Arcade** identity with soft rounded cards, `#2D2346` berry-ink outlines, tactile 3D button shadows, and pastel surface accents.
  - **Color Palette & Mood**:
    - `--surface-card` (`#FFFFFF`) & `--bg-canvas` (`#FFF6EC`)
    - Player 1 Accent: Sunny Gold (`#FFD43B`) & Mint (`#51CF66`)
    - Player 2 / Friend Accent: Sky Blue (`#38BDF8`) & Lavender (`#F3E8FF`)
    - Alert / Heart Accent: Strawberry Coral (`#FF6B8B`)
  - **Typography & Hierarchy**: `Fredoka` for arcade headers and versus badges, `Plus Jakarta Sans` for player names and lobby controls, and `JetBrains Mono` (`tabular-nums`) for all scores, timers, room codes, and WPM counters.

- **Interactive Feedback & Motion**:
  - Copy-link button transitions smoothly to `"COPIED!"` with a mint checkmark.
  - Opponent card pulses gently when your friend completes a word or hits a `5x / 10x / 20x` combo milestone.
  - If a player loses all hearts before the timer ends while the opponent is still alive, a non-blocking `"Spectating Friend — Waiting for Round End..."` banner appears on their word card until the opponent finishes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Pre-Generated Shared Word Sequence per Match**
  - *Chosen Approach*: When the host starts a match, the server generates an ordered sequence of 120 words from the selected difficulty pool and sends the sequence to both players in the `match:start` payload.
  - *Why*: Guarantees zero-latency transitions to the next word upon completion (no network round-trip wait between words) while ensuring both players type the exact same words in the exact same order.
  - *Alternatives Considered*: Requesting each next word over the network on completion, which would introduce noticeable typing lag between words on slower connections.

- **Decision 2 — Real-Time WebSocket Room Server with Same-Port Integration**
  - *Chosen Approach*: Attach a lightweight WebSocket room manager to the HTTP server on port 3000 so rooms work across different devices and browsers, supplemented by a client-side `BroadcastChannel` bridge so multi-tab local testing also works instantaneously.
  - *Why*: Provides true real-time multi-user state synchronization across devices while keeping the client code in clean, modular vanilla JavaScript.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Browser Client (Vanilla HTML/CSS/JS)                │
│                                                                         │
│  ┌────────────────────┐   ┌────────────────────┐   ┌─────────────────┐  │
│  │ Home & 1v1 Lobby   │   │ Gameplay & Live    │   │ 1v1 Versus      │  │
│  │ Modal (?room=XXXX) │──▶│ Opponent HUD Card  │──▶│ Results &       │  │
│  │ (Create/Join/Copy) │   │ + 3D Word Stage    │   │ Rematch Screen  │  │
│  └─────────┬──────────┘   └─────────┬──────────┘   └────────┬────────┘  │
│            │                        │                       │           │
│            ▼                        ▼                       ▼           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │        Game Rules & Deterministic Shared-Word Sequence Engine     │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
│                                     │                                   │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │      Multiplayer Client Sync Module (WebSocket + URL Room Hook)   │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │ WebSocket Events (Port 3000)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Authoritative Room Server (Port 3000 HTTP + WS)          │
│                                                                         │
│  • Room Registry (4-char Room Code, Host/Guest slots, Room Config)      │
│  • Match Lifecycle (Lobby -> Countdown -> Active Race -> Finished)      │
│  • Shared Word List Generator & Live Telemetry Broadcast Relay          │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Room State**: `roomCode` (4 uppercase chars), `status` (`'waiting' | 'countdown' | 'playing' | 'finished'`), `config` (`difficulty`, `duration`, `lives`), `wordSequence` (array of `{ word, difficulty }`), and `players` map (`id`, `name`, `isHost`, `score`, `combo`, `highestCombo`, `wpm`, `accuracy`, `lives`, `wordIndex`, `typedProgress`, `finished`, `finishReason`).

- **Interactive Component & State Mapping**:
  - **Invite Link Auto-Detection (`?room=XXXX`)**: On page load, if `?room=` is present in the URL, automatically opens the 1v1 Lobby modal pre-filled with that room code and connects to the room.
  - **Live Typing Delta Broadcast (`player:progress`)**: Every keystroke and word completion sends a compact delta (`score`, `combo`, `lives`, `wpm`, `accuracy`, `wordIndex`, `typedLength`, `targetLength`) to update the opponent's HUD card in real time.
  - **Match Completion & Rematch (`player:finished` / `match:rematch`)**: When both players finish (or the synchronized round timer reaches `0`), transitions both clients to the 1v1 Results screen and enables one-click **REMATCH**.
