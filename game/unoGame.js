const { createDeck, shuffle, isValidPlay, COLORS } = require('./unoDeck');

class UnoGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = []; // { id, name, avatar, isBot, cards: [], hasSaidUno: false, connected: true, isHost: boolean, hasFinished: boolean, finishRank: null }
    this.deck = [];
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
    this.activeColor = null;
    this.status = 'lobby'; // 'lobby', 'playing', 'game_over'
    
    // Custom House Rules:
    // 1. Stack rule (+4 pe +2 allowed, +2 pe +4, etc.)
    this.drawStack = 0;
    this.pendingStackTargetId = null;

    // 2. UNO Catch penalty: equal to total active players in match
    this.unoCatchWindow = null; // { playerId, expiresAt, timeoutId }

    this.pendingDrawnCard = null; // { playerId, card }
    this.lastAction = null;
    
    // Winners Podium System (No points!)
    this.winners = []; // Array of finished players in order: [{ id, name, avatar, rank }]
    this.maxWinners = 1; // Calculated based on player count

    this.turnTimerSeconds = 25;
    this.turnExpiresAt = null;
    this.turnTimeoutId = null;
    this.botDecisionTimeout = null;
    this.onStateChange = null;
    this.onBotAction = null;
  }

  calculateMaxWinners() {
    const total = this.players.length;
    if (total <= 2) return 1;
    if (total <= 5) return 2; // e.g. 5 players -> 2 winners
    return 3; // 6-8 players -> 3 winners
  }

  addPlayer(id, name, avatar = '🦊', isBot = false) {
    if (this.players.length >= 8) {
      return { success: false, message: 'Room is full (max 8 players)' };
    }
    if (this.status !== 'lobby') {
      return { success: false, message: 'Game already in progress' };
    }

    const isHost = this.players.length === 0;
    const player = {
      id,
      name: name || `Player ${this.players.length + 1}`,
      avatar,
      isBot,
      cards: [],
      hasSaidUno: false,
      hasFinished: false,
      finishRank: null,
      connected: true,
      isHost
    };

    this.players.push(player);
    this.maxWinners = this.calculateMaxWinners();
    return { success: true, player };
  }

  removePlayer(id) {
    const index = this.players.findIndex(p => p.id === id);
    if (index === -1) return null;

    const removed = this.players[index];

    if (this.status === 'lobby') {
      this.players.splice(index, 1);
      this.maxWinners = this.calculateMaxWinners();
      if (removed.isHost && this.players.length > 0) {
        const nextHuman = this.players.find(p => !p.isBot) || this.players[0];
        nextHuman.isHost = true;
      }
    } else {
      removed.connected = false;
      removed.isBot = true;
      this.lastAction = `${removed.name} left the match.`;
      if (this.currentTurnIndex === index) {
        this.checkBotTurn();
      }
    }

    return removed;
  }

  getActivePlayers() {
    return this.players.filter(p => !p.hasFinished);
  }

  startRound() {
    if (this.players.length < 2) {
      return { success: false, message: 'At least 2 players required' };
    }

    this.maxWinners = this.calculateMaxWinners();
    this.winners = [];
    this.deck = shuffle(createDeck());
    this.discardPile = [];
    this.direction = 1;
    this.activeColor = null;
    this.unoCatchWindow = null;
    this.pendingDrawnCard = null;
    this.drawStack = 0;

    // Reset each player
    for (const player of this.players) {
      player.cards = this.drawCards(7);
      player.hasSaidUno = false;
      player.hasFinished = false;
      player.finishRank = null;
    }

    // Flip top card for discard pile
    let top = this.deck.pop();
    while (top.type === 'wild4') {
      this.deck.unshift(top);
      this.deck = shuffle(this.deck);
      top = this.deck.pop();
    }

    this.discardPile.push(top);
    this.status = 'playing';
    this.currentTurnIndex = 0;

    this.lastAction = `Match started! Top card is ${this.formatCardName(top)}. (${this.maxWinners} Winner${this.maxWinners > 1 ? 's' : ''} format).`;

    this.applyFirstCardEffect(top);
    this.resetTurnTimer();

    return { success: true };
  }

  applyFirstCardEffect(card) {
    const firstPlayer = this.getCurrentPlayer();
    if (!firstPlayer) return;

    if (card.type === 'wild') {
      this.activeColor = 'red';
      this.lastAction = `Wild card started the pile! Active color is Red.`;
    } else if (card.type === 'draw2') {
      this.drawStack = 2;
      this.lastAction = `Draw Two started the pile! ${firstPlayer.name} faces +2 cards (or can stack a +2 / +4!).`;
    } else if (card.type === 'skip') {
      this.lastAction = `Skip started the pile! ${firstPlayer.name} skips their turn.`;
      this.advanceTurn(1);
    } else if (card.type === 'reverse') {
      this.direction = -1;
      this.lastAction = `Reverse started the pile! Play direction reversed.`;
      const activeCount = this.getActivePlayers().length;
      if (activeCount === 2) {
        this.advanceTurn(1);
      } else {
        this.currentTurnIndex = this.players.length - 1;
      }
    } else {
      this.activeColor = card.color;
    }
  }

  drawCards(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        this.reshuffleDiscardIntoDeck();
      }
      if (this.deck.length > 0) {
        drawn.push(this.deck.pop());
      }
    }
    return drawn;
  }

  reshuffleDiscardIntoDeck() {
    if (this.discardPile.length <= 1) return;
    const topCard = this.discardPile.pop();
    const remaining = this.discardPile.map(c => {
      if (c.type === 'wild' || c.type === 'wild4') {
        return { ...c, color: 'wild' };
      }
      return c;
    });

    this.deck = shuffle(remaining);
    this.discardPile = [topCard];
    this.lastAction = 'Deck was empty. Discard pile reshuffled into Draw Deck!';
  }

  getTopCard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex] || null;
  }

  // Advance turn skipping finished players
  advanceTurn(step = 1) {
    const total = this.players.length;
    let nextIndex = this.currentTurnIndex;
    let iterations = 0;

    do {
      nextIndex = (nextIndex + (this.direction * Math.sign(step)) + (total * 10)) % total;
      iterations++;
    } while (this.players[nextIndex].hasFinished && iterations < total * 2);

    this.currentTurnIndex = nextIndex;

    // If step was 2 (Skip)
    if (Math.abs(step) === 2) {
      let skipIterations = 0;
      do {
        nextIndex = (nextIndex + (this.direction * Math.sign(step)) + (total * 10)) % total;
        skipIterations++;
      } while (this.players[nextIndex].hasFinished && skipIterations < total * 2);
      this.currentTurnIndex = nextIndex;
    }

    this.pendingDrawnCard = null;
    this.resetTurnTimer();
  }

  resetTurnTimer() {
    if (this.turnTimeoutId) {
      clearTimeout(this.turnTimeoutId);
      this.turnTimeoutId = null;
    }

    if (this.status !== 'playing') return;

    this.turnExpiresAt = Date.now() + (this.turnTimerSeconds * 1000);

    this.turnTimeoutId = setTimeout(() => {
      this.handleTurnTimeout();
    }, this.turnTimerSeconds * 1000);

    this.checkBotTurn();
  }

  handleTurnTimeout() {
    if (this.status !== 'playing') return;
    const player = this.getCurrentPlayer();
    if (!player || player.hasFinished) return;

    if (this.drawStack > 0) {
      const penalty = this.drawStack;
      this.drawStack = 0;
      const drawn = this.drawCards(penalty);
      player.cards.push(...drawn);
      this.lastAction = `${player.name} timed out and drew +${penalty} stacked cards!`;
    } else {
      const drawn = this.drawCards(1);
      player.cards.push(...drawn);
      this.lastAction = `${player.name}'s turn timed out! Automatic draw 1 card.`;
    }

    this.advanceTurn(1);
    this.emitState();
  }

  canPlayCardInContext(card) {
    if (!card) return false;
    if (this.drawStack > 0) {
      return card.type === 'draw2' || card.type === 'wild4';
    }
    return isValidPlay(card, this.getTopCard(), this.activeColor);
  }

  playCard(playerId, cardId, chosenColor = null) {
    if (this.status !== 'playing') {
      return { success: false, message: 'Game is not playing' };
    }

    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.currentTurnIndex) {
      return { success: false, message: 'Not your turn' };
    }

    const player = this.players[playerIndex];
    if (player.hasFinished) {
      return { success: false, message: 'You have already finished!' };
    }

    const cardIndex = player.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, message: 'Card not in hand' };
    }

    const card = player.cards[cardIndex];

    if (!this.canPlayCardInContext(card)) {
      if (this.drawStack > 0) {
        return { success: false, message: `Attack of +${this.drawStack} cards active! Counter with +2 or +4, or take draw penalty.` };
      }
      return { success: false, message: 'Invalid card play' };
    }

    if ((card.type === 'wild' || card.type === 'wild4') && !chosenColor) {
      return { success: false, message: 'Choose a color for Wild card', needsColor: true };
    }

    // Remove card
    player.cards.splice(cardIndex, 1);
    this.pendingDrawnCard = null;

    if (card.type === 'wild' || card.type === 'wild4') {
      this.activeColor = chosenColor.toLowerCase();
    } else {
      this.activeColor = card.color;
    }

    this.discardPile.push(card);

    // UNO Check: 1 card left
    if (player.cards.length === 1) {
      if (player.hasSaidUno) {
        this.lastAction = `💥 ${player.name} played ${this.formatCardName(card)} and shouted "UNO!"`;
      } else {
        this.lastAction = `⚠️ ${player.name} played ${this.formatCardName(card)} and has 1 card left WITHOUT calling UNO!`;
        this.openUnoCatchWindow(player.id);
      }
    } else {
      this.lastAction = `${player.name} played ${this.formatCardName(card)}.`;
      player.hasSaidUno = false;
    }

    // CHECK IF PLAYER FINISHED CARDS (0 cards left)
    if (player.cards.length === 0) {
      this.handlePlayerFinished(player, card);
      this.emitState();
      return { success: true, finished: true };
    }

    this.executeCardAction(card);
    this.emitState();
    return { success: true };
  }

  handlePlayerFinished(player, winningCard) {
    const rank = this.winners.length + 1;
    const rankSuffix = rank === 1 ? '1st Place 🥇' : rank === 2 ? '2nd Place 🥈' : rank === 3 ? '3rd Place 🥉' : `${rank}th Place`;

    player.hasFinished = true;
    player.finishRank = rank;
    this.winners.push({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      rank,
      rankTitle: rankSuffix
    });

    this.lastAction = `🎉 ${player.name} has finished all cards and secured ${rankSuffix}!`;

    // If winning card had pending draw stack, next active player takes it
    if (this.drawStack > 0) {
      this.advanceTurn(1);
      const nextPlayer = this.getCurrentPlayer();
      if (nextPlayer) {
        nextPlayer.cards.push(...this.drawCards(this.drawStack));
        this.lastAction += ` ${nextPlayer.name} took the +${this.drawStack} cards attack!`;
      }
      this.drawStack = 0;
    }

    const remainingActive = this.getActivePlayers();

    // Check if match is complete:
    // Match ends if required winners reached OR only 1 player remains
    if (this.winners.length >= this.maxWinners || remainingActive.length <= 1) {
      this.status = 'game_over';
      if (this.turnTimeoutId) clearTimeout(this.turnTimeoutId);
      if (this.unoCatchWindow) clearTimeout(this.unoCatchWindow.timeoutId);
      this.lastAction = `🏆 Match Finished! ${this.winners.map(w => `${w.rankTitle}: ${w.name}`).join(' • ')}`;
    } else {
      // Continue game with remaining players
      this.advanceTurn(1);
    }
  }

  executeCardAction(card) {
    const activePlayers = this.getActivePlayers();
    const activeCount = activePlayers.length;

    if (card.type === 'draw2') {
      this.drawStack += 2;
      this.lastAction += ` ⚡ +2 Added to Draw Stack! (Total: +${this.drawStack} cards). Counter with +2 or +4!`;
      this.advanceTurn(1);
    } else if (card.type === 'wild4') {
      this.drawStack += 4;
      this.lastAction += ` ⚡ Color set to ${this.activeColor.toUpperCase()}! +4 Added to Draw Stack! (Total: +${this.drawStack} cards). Counter with +2 or +4!`;
      this.advanceTurn(1);
    } else if (card.type === 'skip') {
      this.advanceTurn(2);
    } else if (card.type === 'reverse') {
      if (activeCount === 2) {
        this.advanceTurn(2);
      } else {
        this.direction *= -1;
        this.lastAction += ` ⇄ Play direction reversed!`;
        this.advanceTurn(1);
      }
    } else if (card.type === 'wild') {
      this.lastAction += ` 🌈 Color changed to ${this.activeColor.toUpperCase()}!`;
      this.advanceTurn(1);
    } else {
      this.advanceTurn(1);
    }
  }

  playerDrawCard(playerId) {
    if (this.status !== 'playing') {
      return { success: false, message: 'Game not active' };
    }
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.currentTurnIndex) {
      return { success: false, message: 'Not your turn' };
    }

    const player = this.players[playerIndex];

    if (this.drawStack > 0) {
      const penaltyCount = this.drawStack;
      this.drawStack = 0;
      const drawn = this.drawCards(penaltyCount);
      player.cards.push(...drawn);
      this.lastAction = `💥 ${player.name} couldn't counter and drew +${penaltyCount} cards! Turn skipped.`;
      this.advanceTurn(1);
      this.emitState();
      return { success: true, count: penaltyCount, stacked: true };
    }

    const drawn = this.drawCards(1);
    if (drawn.length === 0) {
      return { success: false, message: 'No cards left in deck' };
    }

    const card = drawn[0];
    player.cards.push(card);

    const canPlay = this.canPlayCardInContext(card);
    if (canPlay) {
      this.pendingDrawnCard = { playerId, card };
      this.lastAction = `${player.name} drew a card and can choose to play it.`;
    } else {
      this.lastAction = `${player.name} drew a card. Turn passes.`;
      this.advanceTurn(1);
    }

    this.emitState();
    return { success: true, card, canPlay };
  }

  passTurn(playerId) {
    if (this.status !== 'playing') return { success: false };
    if (this.getCurrentPlayer()?.id !== playerId) return { success: false };

    if (this.drawStack > 0) {
      return this.playerDrawCard(playerId);
    }

    this.lastAction = `${this.getCurrentPlayer().name} passed their turn.`;
    this.advanceTurn(1);
    this.emitState();
    return { success: true };
  }

  sayUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.hasFinished) return { success: false };

    if (player.cards.length <= 2) {
      player.hasSaidUno = true;
      if (this.unoCatchWindow && this.unoCatchWindow.playerId === playerId) {
        clearTimeout(this.unoCatchWindow.timeoutId);
        this.unoCatchWindow = null;
      }
      this.lastAction = `📢 ${player.name} called "UNO!" 🔥`;
      this.emitState();
      return { success: true, message: 'Called UNO!' };
    }

    return { success: false, message: 'You can only call UNO when you have 1 or 2 cards!' };
  }

  catchUno(catcherId) {
    const catcher = this.players.find(p => p.id === catcherId);
    if (!catcher) return { success: false };

    let vulnerable = null;
    if (this.unoCatchWindow) {
      vulnerable = this.players.find(p => p.id === this.unoCatchWindow.playerId);
    } else {
      vulnerable = this.players.find(p => !p.hasFinished && p.cards.length === 1 && !p.hasSaidUno && p.id !== catcherId);
    }

    if (vulnerable && vulnerable.id !== catcherId) {
      return this.penalizeUnoFailure(vulnerable, catcher);
    }

    return { success: false, message: 'No one forgot to call UNO right now!' };
  }

  openUnoCatchWindow(playerId) {
    if (this.unoCatchWindow && this.unoCatchWindow.timeoutId) {
      clearTimeout(this.unoCatchWindow.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      this.unoCatchWindow = null;
      this.emitState();
    }, 7000);

    this.unoCatchWindow = {
      playerId,
      expiresAt: Date.now() + 7000,
      timeoutId
    };
  }

  penalizeUnoFailure(vulnerable, catcher) {
    if (this.unoCatchWindow && this.unoCatchWindow.timeoutId) {
      clearTimeout(this.unoCatchWindow.timeoutId);
      this.unoCatchWindow = null;
    }

    // USER SPECIFIC RULE:
    // Penalty cards = number of active players in the match!
    const penaltyCardCount = this.getActivePlayers().length;
    const penaltyCards = this.drawCards(penaltyCardCount);
    vulnerable.cards.push(...penaltyCards);
    vulnerable.hasSaidUno = false;

    this.lastAction = `🚨 ${catcher.name} CAUGHT ${vulnerable.name} for NOT calling UNO! Penalty: +${penaltyCardCount} cards (1 per player in match)! 😱`;
    this.emitState();
    return { success: true, penalized: vulnerable.name, catcher: catcher.name, penaltyCount: penaltyCardCount };
  }

  nextRound() {
    return this.startRound();
  }

  checkBotTurn() {
    if (this.status !== 'playing') return;
    const player = this.getCurrentPlayer();
    if (!player || !player.isBot || player.hasFinished) return;

    if (this.botDecisionTimeout) clearTimeout(this.botDecisionTimeout);

    const delay = Math.floor(Math.random() * 800) + 1000;
    this.botDecisionTimeout = setTimeout(() => {
      if (this.status !== 'playing') return;
      if (this.onBotAction) {
        this.onBotAction(player);
      }
    }, delay);
  }

  formatCardName(card) {
    if (!card) return 'Empty';
    if (card.type === 'wild') return 'Wild Card';
    if (card.type === 'wild4') return 'Wild Draw 4 (+4)';
    const colorCap = card.color.charAt(0).toUpperCase() + card.color.slice(1);
    if (card.type === 'skip') return `${colorCap} Skip`;
    if (card.type === 'reverse') return `${colorCap} Reverse`;
    if (card.type === 'draw2') return `${colorCap} Draw Two (+2)`;
    return `${colorCap} ${card.value}`;
  }

  getStateForPlayer(playerId) {
    const topCard = this.getTopCard();
    const currentPlayer = this.getCurrentPlayer();

    return {
      roomCode: this.roomCode,
      status: this.status,
      maxWinners: this.maxWinners,
      winners: this.winners,
      direction: this.direction,
      activeColor: this.activeColor,
      drawStack: this.drawStack,
      topCard: topCard ? {
        id: topCard.id,
        color: topCard.color,
        type: topCard.type,
        value: topCard.value
      } : null,
      drawPileCount: this.deck.length,
      discardPileCount: this.discardPile.length,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: currentPlayer ? currentPlayer.id : null,
      turnExpiresAt: this.turnExpiresAt,
      unoCatchActive: Boolean(this.unoCatchWindow && this.unoCatchWindow.playerId !== playerId),
      vulnerablePlayerName: this.unoCatchWindow ? (this.players.find(p => p.id === this.unoCatchWindow.playerId)?.name || null) : null,
      lastAction: this.lastAction,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.isHost,
        cardCount: p.cards.length,
        hasSaidUno: p.hasSaidUno,
        hasFinished: p.hasFinished,
        finishRank: p.finishRank,
        connected: p.connected,
        isCurrentTurn: idx === this.currentTurnIndex && !p.hasFinished
      })),
      myCards: (this.players.find(p => p.id === playerId)?.cards || []).map(c => ({
        ...c,
        isPlayable: this.status === 'playing' && currentPlayer?.id === playerId && this.canPlayCardInContext(c)
      })),
      pendingDrawnCard: this.pendingDrawnCard && this.pendingDrawnCard.playerId === playerId ? this.pendingDrawnCard.card : null
    };
  }

  emitState() {
    if (this.onStateChange) {
      this.onStateChange();
    }
  }
}

module.exports = UnoGame;
