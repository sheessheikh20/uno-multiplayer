// Clean, Robust UNO Multiplayer Client Logic
const socket = io();

// State
let myPlayerId = null;
let currentRoomCode = null;
let gameState = null;
let pendingWildCardId = null;
let selectedAvatar = localStorage.getItem('uno_avatar') || '🦊';
let myUsername = localStorage.getItem('uno_username') || 'Player';
let turnTimerInterval = null;

// DOM Elements
const ambientGlow = document.getElementById('ambient-glow');
const toastContainer = document.getElementById('toast-container');
const confettiCanvas = document.getElementById('confetti-canvas');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const lobbySetup = document.getElementById('lobby-setup');
const lobbyWaiting = document.getElementById('lobby-waiting');
const navRoomCode = document.getElementById('nav-room-code');
const roomCodePill = document.getElementById('room-code-pill');
const lobbyRoomCode = document.getElementById('lobby-room-code');
const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
const slotsCount = document.getElementById('slots-count');
const btnStartGame = document.getElementById('btn-start-game');
const waitingStatusText = document.getElementById('waiting-status-text');

// User Nav Profile elements
const navUserPill = document.getElementById('nav-user-pill');
const navUserAvatar = document.getElementById('nav-user-avatar');
const navUserName = document.getElementById('nav-user-name');
const usernameModal = document.getElementById('username-modal');
const modalUsernameInput = document.getElementById('modal-username-input');
const btnSaveUsername = document.getElementById('btn-save-username');
const closeUsernameBtn = document.getElementById('close-username-btn');

// Gameplay DOM
const opponentsZone = document.getElementById('opponents-zone');
const playerHand = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const drawPileBtn = document.getElementById('draw-pile-btn');
const drawCountBadge = document.getElementById('draw-count-badge');
const tickerText = document.getElementById('ticker-text');
const directionRing = document.getElementById('direction-ring');
const drawStackAlert = document.getElementById('draw-stack-alert');
const stackCount = document.getElementById('stack-count');
const btnCallUno = document.getElementById('btn-call-uno');
const btnCatchUno = document.getElementById('btn-catch-uno');
const catchVictimName = document.getElementById('catch-victim-name');
const btnPassTurn = document.getElementById('btn-pass-turn');
const turnTimerBar = document.getElementById('turn-timer-bar');
const myTurnIndicator = document.getElementById('my-turn-indicator');
const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const activeColorLabel = document.getElementById('active-color-label');

// Modals
const colorPickerModal = document.getElementById('color-picker-modal');
const roundOverModal = document.getElementById('round-over-modal');
const rulesModal = document.getElementById('rules-modal');
const fxComicShout = document.getElementById('fx-comic-shout');
const comicBubbleText = document.getElementById('comic-bubble-text');

function updateProfileUI() {
  if (navUserName) navUserName.textContent = myUsername;
  if (navUserAvatar) navUserAvatar.textContent = selectedAvatar;
  const inputEl = document.getElementById('player-name-input');
  if (inputEl) inputEl.value = myUsername;
}

function syncModalAvatarSelection() {
  document.querySelectorAll('#modal-avatar-grid .avatar-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.avatar === selectedAvatar);
  });
}

// --- Initialization & Setup ---
document.addEventListener('DOMContentLoaded', () => {
  updateProfileUI();

  // Check URL query for auto-join room (e.g. ?room=ABCD)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const joinCodeInput = document.getElementById('join-code-input');
    if (joinCodeInput) {
      joinCodeInput.value = roomParam.toUpperCase();
    }
  }

  // Profile modal handlers
  navUserPill?.addEventListener('click', () => {
    if (modalUsernameInput) modalUsernameInput.value = myUsername;
    syncModalAvatarSelection();
    usernameModal?.classList.add('active');
  });

  closeUsernameBtn?.addEventListener('click', () => {
    usernameModal?.classList.remove('active');
  });

  btnSaveUsername?.addEventListener('click', () => {
    const newName = modalUsernameInput ? modalUsernameInput.value.trim() : '';
    if (newName) {
      myUsername = newName;
      localStorage.setItem('uno_username', myUsername);
    }
    localStorage.setItem('uno_avatar', selectedAvatar);
    updateProfileUI();
    usernameModal?.classList.remove('active');
    showToast('Profile updated!');
  });

  // Modal avatar selection
  document.querySelectorAll('#modal-avatar-grid .avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modal-avatar-grid .avatar-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAvatar = btn.dataset.avatar;
    });
  });

  // Lobby avatar selection
  document.querySelectorAll('#avatar-grid .avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#avatar-grid .avatar-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAvatar = btn.dataset.avatar;
      localStorage.setItem('uno_avatar', selectedAvatar);
      updateProfileUI();
    });
  });

  const playerNameInput = document.getElementById('player-name-input');
  if (playerNameInput) {
    playerNameInput.value = myUsername;
    playerNameInput.addEventListener('input', (e) => {
      myUsername = e.target.value.trim() || 'Player';
      localStorage.setItem('uno_username', myUsername);
      updateProfileUI();
    });
  }

  // Sound toggle
  const soundBtn = document.getElementById('sound-btn');
  soundBtn?.addEventListener('click', () => {
    const isMuted = window.soundEngine.toggleMute();
    soundBtn.textContent = isMuted ? '🔇' : '🔊';
    showToast(isMuted ? 'Sound Muted' : 'Sound Enabled');
  });

  // Rules toggle
  document.getElementById('rules-btn')?.addEventListener('click', () => {
    rulesModal?.classList.add('active');
  });
  document.getElementById('close-rules-btn')?.addEventListener('click', () => {
    rulesModal?.classList.remove('active');
  });

  // Copy Room Code
  const copyRoomCodeAction = () => {
    if (!currentRoomCode) return;
    const shareUrl = `${window.location.origin}?room=${currentRoomCode}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast(`Room link copied! (${currentRoomCode})`);
      }).catch(() => {
        showToast(`Room code: ${currentRoomCode}`);
      });
    } else {
      showToast(`Room code: ${currentRoomCode}`);
    }
  };

  roomCodePill?.addEventListener('click', copyRoomCodeAction);
  document.getElementById('btn-copy-code')?.addEventListener('click', copyRoomCodeAction);

  // Create Room
  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    const playerName = myUsername || 'Player';
    socket.emit('create-room', { playerName, avatar: selectedAvatar });
  });

  // Join Room
  document.getElementById('btn-join-room')?.addEventListener('click', () => {
    const playerName = myUsername || 'Player';
    const roomCodeInput = document.getElementById('join-code-input');
    const roomCode = roomCodeInput ? roomCodeInput.value.trim().toUpperCase() : '';
    if (!roomCode) {
      return showToast('Please enter a 4-letter room code!');
    }
    socket.emit('join-room', { roomCode, playerName, avatar: selectedAvatar });
  });

  // Add Player
  document.getElementById('btn-add-bot')?.addEventListener('click', () => {
    socket.emit('add-bot');
  });

  // Start Game
  btnStartGame?.addEventListener('click', () => {
    socket.emit('start-game');
  });

  // Draw Card Click
  drawPileBtn?.addEventListener('click', () => {
    if (!isMyTurn()) return;
    socket.emit('draw-card');
  });

  // Pass Turn Click
  btnPassTurn?.addEventListener('click', () => {
    socket.emit('pass-turn');
    if (btnPassTurn) btnPassTurn.style.display = 'none';
  });

  // Call UNO Click
  btnCallUno?.addEventListener('click', () => {
    socket.emit('say-uno');
  });

  // Catch UNO Click
  btnCatchUno?.addEventListener('click', () => {
    socket.emit('catch-uno');
  });

  // Color Picker buttons
  document.querySelectorAll('.color-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const chosenColor = btn.dataset.color;
      if (pendingWildCardId) {
        socket.emit('play-card', { cardId: pendingWildCardId, chosenColor });
        pendingWildCardId = null;
      }
      colorPickerModal?.classList.remove('active');
    });
  });

  // Play Again Click
  document.getElementById('btn-next-round')?.addEventListener('click', () => {
    roundOverModal?.classList.remove('active');
    socket.emit('next-round');
  });

});

function isMyTurn() {
  return gameState && gameState.status === 'playing' && gameState.currentTurnPlayerId === myPlayerId;
}

function showToast(text) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = text;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function triggerComicShout(text) {
  if (!comicBubbleText || !fxComicShout) return;
  comicBubbleText.textContent = text;
  fxComicShout.classList.add('active');
  setTimeout(() => {
    fxComicShout.classList.remove('active');
  }, 1600);
}

// --- Socket Events ---
socket.on('connect', () => {
  myPlayerId = socket.id;
});

socket.on('error-msg', (msg) => {
  showToast(`⚠️ ${msg}`);
});

socket.on('room-created', ({ roomCode, playerId, state }) => {
  myPlayerId = playerId;
  currentRoomCode = roomCode;
  onEnterRoom(roomCode, state);
  showToast(`Room created! Code: ${roomCode}`);
});

socket.on('room-joined', ({ roomCode, playerId, state }) => {
  myPlayerId = playerId;
  currentRoomCode = roomCode;
  onEnterRoom(roomCode, state);
  showToast(`Joined Room ${roomCode}!`);
});

function onEnterRoom(roomCode, state) {
  if (lobbySetup) lobbySetup.style.display = 'none';
  if (lobbyWaiting) lobbyWaiting.style.display = 'flex';
  if (roomCodePill) roomCodePill.style.display = 'inline-flex';
  if (navRoomCode) navRoomCode.textContent = roomCode;
  if (lobbyRoomCode) lobbyRoomCode.textContent = roomCode;
  updateGameState(state);
}

socket.on('game-state', (state) => {
  updateGameState(state);
});

socket.on('card-played-fx', () => {
  window.soundEngine?.playCard();
});

socket.on('card-drawn-fx', ({ count, stacked }) => {
  if (stacked) {
    window.soundEngine?.catchSiren();
    triggerComicShout(`+${count} CARDS!`);
  } else {
    window.soundEngine?.drawCard();
  }
});

socket.on('uno-shout-fx', ({ playerName }) => {
  window.soundEngine?.unoShout();
  triggerComicShout(`${playerName} SHOUTED UNO! 🔥`);
  createConfettiBurst(25);
});

socket.on('uno-caught-fx', (result) => {
  window.soundEngine?.catchSiren();
  triggerComicShout(`🚨 CAUGHT! +${result.penaltyCount} CARDS!`);
});



// --- State Renderer ---
function updateGameState(state) {
  if (!state) return;
  gameState = state;

  // Active theme color
  if (state.activeColor) {
    document.body.className = `theme-${state.activeColor}`;
    if (activeColorLabel) activeColorLabel.textContent = state.activeColor.toUpperCase();
  } else {
    document.body.className = 'color-theme-neutral';
  }

  // Switch Screen Views
  if (state.status === 'lobby') {
    lobbyScreen?.classList.add('active');
    gameScreen?.classList.remove('active');
    renderLobby(state);
  } else {
    lobbyScreen?.classList.remove('active');
    gameScreen?.classList.add('active');
    renderGame(state);
  }
}

function renderLobby(state) {
  if (slotsCount) slotsCount.textContent = state.players.length;
  if (!lobbyPlayersGrid) return;

  lobbyPlayersGrid.innerHTML = '';
  const me = state.players.find(p => p.id === myPlayerId);
  const isHost = me ? me.isHost : false;

  state.players.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-slot-card ${p.id === myPlayerId ? 'is-you' : ''}`;
    card.innerHTML = `
      <div class="slot-avatar">${p.avatar}</div>
      <div class="slot-name">${escapeHtml(p.name)} ${p.id === myPlayerId ? '(You)' : ''}</div>
      ${p.isHost ? '<span class="slot-badge host">👑 HOST</span>' : ''}
    `;
    lobbyPlayersGrid.appendChild(card);
  });

  if (isHost && btnStartGame) {
    btnStartGame.style.display = 'inline-flex';
    if (state.players.length >= 2) {
      btnStartGame.disabled = false;
      if (waitingStatusText) waitingStatusText.textContent = 'Ready! Click START MATCH to begin.';
    } else {
      btnStartGame.disabled = true;
      if (waitingStatusText) waitingStatusText.textContent = 'Add at least 1 friend or player to start (min 2 players).';
    }
  } else if (btnStartGame) {
    btnStartGame.style.display = 'none';
    if (waitingStatusText) waitingStatusText.textContent = 'Waiting for host to start the match...';
  }
}

function renderGame(state) {
  const yourTurnBanner = document.getElementById('your-turn-banner');
  const itsMyTurn = state.currentTurnPlayerId === myPlayerId;
  const currentTurnPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);

  // Status Ticker
  if (tickerText) {
    if (itsMyTurn) {
      tickerText.innerHTML = `👉 <strong style="color: #fde047;">YOUR TURN TO PLAY!</strong> Choose a card or tap DRAW.`;
    } else if (currentTurnPlayer) {
      tickerText.innerHTML = `⏳ <strong>${escapeHtml(currentTurnPlayer.name)}'s turn to play...</strong>`;
    } else if (state.lastAction) {
      tickerText.textContent = state.lastAction;
    }
  }

  // Stacking attack banner
  if (drawStackAlert && stackCount) {
    if (state.drawStack > 0) {
      drawStackAlert.style.display = 'flex';
      stackCount.textContent = `+${state.drawStack}`;
    } else {
      drawStackAlert.style.display = 'none';
    }
  }

  // Direction indicator
  if (directionRing) {
    directionRing.className = state.direction === 1 ? 'direction-ring clockwise' : 'direction-ring counter-clockwise';
  }

  // Discard Pile Top Card
  renderTopDiscardCard(state.topCard);

  // Draw Pile count
  if (drawCountBadge) drawCountBadge.textContent = state.drawPileCount;
  if (drawPileBtn) {
    if (itsMyTurn) {
      drawPileBtn.classList.add('pulse-draw-turn');
    } else {
      drawPileBtn.classList.remove('pulse-draw-turn');
    }
  }

  // Me
  const me = state.players.find(p => p.id === myPlayerId);
  if (me && myAvatar && myName) {
    myAvatar.textContent = me.avatar;
    myName.textContent = `${me.name} (${me.cardCount} cards)`;
  }

  if (myTurnIndicator) myTurnIndicator.style.display = itsMyTurn ? 'inline-block' : 'none';

  // Your Turn Banner
  if (yourTurnBanner) {
    yourTurnBanner.style.display = itsMyTurn ? 'flex' : 'none';
  }

  updateTurnTimer(state.turnExpiresAt);

  // UNO shout button
  if (btnCallUno) {
    if (me && me.cardCount <= 2 && !me.hasSaidUno) {
      btnCallUno.classList.add('pulse-uno');
      btnCallUno.style.opacity = '1';
    } else {
      btnCallUno.classList.remove('pulse-uno');
      btnCallUno.style.opacity = me?.hasSaidUno ? '0.5' : '0.8';
    }
  }

  // Catch UNO button
  if (btnCatchUno) {
    if (state.unoCatchActive) {
      btnCatchUno.style.display = 'inline-flex';
      if (catchVictimName) catchVictimName.textContent = state.vulnerablePlayerName ? `(${state.vulnerablePlayerName})` : '';
    } else {
      btnCatchUno.style.display = 'none';
    }
  }

  // Pass Turn button
  if (btnPassTurn) {
    btnPassTurn.style.display = (itsMyTurn && state.pendingDrawnCard) ? 'inline-flex' : 'none';
  }

  renderOpponents(state.players.filter(p => p.id !== myPlayerId), state.currentTurnPlayerId);
  renderMyHand(state.myCards);

  // Winner Podium Modal
  if (state.status === 'game_over') {
    showVictoryModal(state);
  } else {
    roundOverModal?.classList.remove('active');
  }
}

function renderTopDiscardCard(topCard) {
  if (!discardPile) return;
  discardPile.innerHTML = '';
  if (!topCard) return;

  const cardEl = createCardElement(topCard, false, false);
  discardPile.appendChild(cardEl);
}

function renderOpponents(opponents, currentTurnPlayerId) {
  if (!opponentsZone) return;
  opponentsZone.innerHTML = '';

  opponents.forEach(opp => {
    const isTurn = opp.id === currentTurnPlayerId;
    const cardEl = document.createElement('div');
    cardEl.className = `opponent-card ${isTurn ? 'is-active-turn' : ''}`;

    cardEl.innerHTML = `
      <div class="opponent-avatar">
        ${opp.avatar}
        ${opp.hasSaidUno ? '<span class="opponent-uno-badge">UNO!</span>' : ''}
      </div>
      <div class="opponent-meta">
        <div class="opponent-name-row">
          <span class="opponent-name">${escapeHtml(opp.name)}</span>
          ${isTurn ? '<span class="turn-tag playing">⚡ PLAYING</span>' : '<span class="turn-tag wait">Wait</span>'}
        </div>
        <div class="opponent-cards-badge">
          <span>🃏 ${opp.cardCount} cards</span>
        </div>
      </div>
    `;
    opponentsZone.appendChild(cardEl);
  });
}

function renderMyHand(cards) {
  if (!playerHand) return;
  playerHand.innerHTML = '';
  const total = cards.length;

  cards.forEach((card, index) => {
    const isPlayable = card.isPlayable;
    const cardEl = createCardElement(card, isPlayable, true);

    if (isPlayable) {
      cardEl.addEventListener('click', () => {
        handleCardClick(card);
      });
    }

    playerHand.appendChild(cardEl);
  });
}

function handleCardClick(card) {
  if (!card.isPlayable) return;

  if (card.type.startsWith('wild')) {
    pendingWildCardId = card.id;
    colorPickerModal?.classList.add('active');
  } else {
    socket.emit('play-card', { cardId: card.id, chosenColor: null });
  }
}

function createCardElement(card, isPlayable, inHand = false) {
  const el = document.createElement('div');
  const colorClass = `card-${card.color}`;
  const playClass = inHand ? (isPlayable ? 'is-playable' : 'is-not-playable') : '';

  el.className = `uno-card ${colorClass} ${playClass}`;

  let symbolHtml = '';
  let cornerHtml = '';

  if (card.type === 'number') {
    symbolHtml = card.value;
    cornerHtml = card.value;
  } else if (card.type === 'skip') {
    symbolHtml = '⊘';
    cornerHtml = '⊘';
  } else if (card.type === 'reverse') {
    symbolHtml = '⇄';
    cornerHtml = '⇄';
  } else if (card.type === 'draw2') {
    symbolHtml = '+2';
    cornerHtml = '+2';
  } else if (card.type === 'wild') {
    symbolHtml = '🌈';
    cornerHtml = 'W';
  } else if (card.type === 'wild4') {
    symbolHtml = '+4';
    cornerHtml = '+4';
  }

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-corner-top">${cornerHtml}</div>
      <div class="card-oval">
        <div class="card-center-symbol">${symbolHtml}</div>
      </div>
      <div class="card-corner-bottom">${cornerHtml}</div>
    </div>
  `;

  return el;
}

function updateTurnTimer(expiresAt) {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  if (!expiresAt || !turnTimerBar) {
    if (turnTimerBar) turnTimerBar.style.width = '100%';
    return;
  }

  const totalDuration = (gameState.turnTimerSeconds || 25) * 1000;

  turnTimerInterval = setInterval(() => {
    const remaining = expiresAt - Date.now();
    const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
    turnTimerBar.style.width = `${pct}%`;

    if (remaining <= 0) {
      clearInterval(turnTimerInterval);
    }
  }, 100);
}

function showVictoryModal(state) {
  roundOverModal?.classList.add('active');
  window.soundEngine?.victory();
  createConfettiBurst(70);

  const table = document.getElementById('modal-scoreboard-table');
  if (!table) return;
  table.innerHTML = '';

  if (state.winners && state.winners.length > 0) {
    state.winners.forEach(w => {
      const row = document.createElement('div');
      row.className = 'podium-row winner';
      row.innerHTML = `
        <span class="podium-rank">${w.rankTitle}</span>
        <span class="podium-name">${w.avatar} ${escapeHtml(w.name)}</span>
        <span class="podium-tag safe">WINNER 🏆</span>
      `;
      table.appendChild(row);
    });
  }

  const unfinished = state.players.filter(p => !p.hasFinished);
  if (unfinished.length > 0) {
    unfinished.forEach(p => {
      const row = document.createElement('div');
      row.className = 'podium-row';
      row.innerHTML = `
        <span class="podium-rank" style="color: #94a3b8;">Out</span>
        <span class="podium-name">${p.avatar} ${escapeHtml(p.name)}</span>
        <span style="color: #ff3344; font-size: 13px; font-weight: 700;">${p.cardCount} cards left</span>
      `;
      table.appendChild(row);
    });
  }
}

function spawnFloatingEmoji(emoji) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;

  const randomLeft = Math.floor(Math.random() * (window.innerWidth - 80)) + 40;
  el.style.left = `${randomLeft}px`;
  el.style.bottom = `60px`;

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function createConfettiBurst(count = 50) {
  if (!confettiCanvas) return;
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#ff3344', '#0077ff', '#10cc60', '#ffb700', '#ffffff'];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10
    });
  }

  function frame() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = false;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4;
      p.alpha -= 0.012;
      p.rotation += p.vRot;

      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (alive) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  requestAnimationFrame(frame);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
