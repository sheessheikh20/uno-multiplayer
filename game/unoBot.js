// Smart AI Bot Controller for UNO
const { COLORS } = require('./unoDeck');

class UnoBot {
  constructor(game) {
    this.game = game;
  }

  handleBotTurn(botPlayer) {
    if (!botPlayer || !botPlayer.isBot || this.game.status !== 'playing') return;
    if (this.game.getCurrentPlayer().id !== botPlayer.id) return;

    // Check if any opponent has 1 card and forgot to say UNO -> Bot can catch them!
    const vulnerable = this.game.players.find(p => p.cards.length === 1 && !p.hasSaidUno && p.id !== botPlayer.id);
    if (vulnerable && Math.random() < 0.75) {
      // 75% chance bot catches player
      this.game.catchUno(botPlayer.id);
    }

    // Determine playable cards
    const playableCards = botPlayer.cards.filter(c => this.game.canPlayCardInContext(c));

    // Handle Active Draw Stack (+4 / +2 attacks)
    if (this.game.drawStack > 0) {
      if (playableCards.length > 0) {
        // Prefer playing +2 over +4 if available, or whatever stack card available
        const counterCard = playableCards.find(c => c.type === 'draw2') || playableCards[0];
        this.executeBotPlay(botPlayer, counterCard);
        return;
      } else {
        // Bot has no counter -> must accept draw stack penalty
        this.game.playerDrawCard(botPlayer.id);
        return;
      }
    }

    // Normal play
    if (playableCards.length > 0) {
      // Strategy:
      // 1. If opponent on next turn has <= 2 cards, prioritize action cards (Skip, Reverse, Draw Two, Wild 4) to disrupt them!
      const nextIndex = (this.game.currentTurnIndex + this.game.direction + this.game.players.length) % this.game.players.length;
      const nextPlayer = this.game.players[nextIndex];
      const nextPlayerThreat = nextPlayer && nextPlayer.cards.length <= 2;

      let chosenCard = null;

      if (nextPlayerThreat) {
        chosenCard = playableCards.find(c => c.type === 'draw2' || c.type === 'wild4' || c.type === 'skip' || c.type === 'reverse') || playableCards[0];
      }

      if (!chosenCard) {
        // Save Wild cards for emergency if number or action card of color is playable
        const nonWilds = playableCards.filter(c => !c.type.startsWith('wild'));
        if (nonWilds.length > 0) {
          // Play highest score card or matching color
          chosenCard = nonWilds.sort((a, b) => b.score - a.score)[0];
        } else {
          chosenCard = playableCards[0];
        }
      }

      this.executeBotPlay(botPlayer, chosenCard);
    } else {
      // No playable cards -> Draw 1 card
      const drawResult = this.game.playerDrawCard(botPlayer.id);
      if (drawResult && drawResult.canPlay && drawResult.card) {
        // Drawn card can be played! Bot plays it after a brief pause
        setTimeout(() => {
          if (this.game.status === 'playing' && this.game.getCurrentPlayer()?.id === botPlayer.id) {
            this.executeBotPlay(botPlayer, drawResult.card);
          }
        }, 800);
      }
    }
  }

  executeBotPlay(botPlayer, card) {
    // If bot has 2 cards (meaning it will have 1 after this play):
    // 90% chance bot calls UNO!
    if (botPlayer.cards.length === 2 && Math.random() < 0.92) {
      this.game.sayUno(botPlayer.id);
    }

    // If Wild card, pick the color the bot holds the most of
    let chosenColor = null;
    if (card.type.startsWith('wild')) {
      const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
      for (const c of botPlayer.cards) {
        if (colorCounts[c.color] !== undefined) {
          colorCounts[c.color]++;
        }
      }
      chosenColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0][0] || 'red';
    }

    this.game.playCard(botPlayer.id, card.id, chosenColor);
  }
}

module.exports = UnoBot;
