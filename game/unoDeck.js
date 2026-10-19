// Official UNO Deck Generator with Classic (108) and Modern (112) support
const COLORS = ['red', 'blue', 'green', 'yellow'];

function createDeck(includeSpecialWilds = false) {
  const deck = [];
  let idCounter = 1;

  for (const color of COLORS) {
    // One '0' card per color
    deck.push({
      id: `c_${idCounter++}`,
      color,
      type: 'number',
      value: '0',
      score: 0
    });

    // Two of each 1-9 per color
    for (let v = 1; v <= 9; v++) {
      const valStr = v.toString();
      for (let i = 0; i < 2; i++) {
        deck.push({
          id: `c_${idCounter++}`,
          color,
          type: 'number',
          value: valStr,
          score: v
        });
      }
    }

    // Two of each Action card per color: Skip, Reverse, Draw Two (+2)
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: `c_${idCounter++}`,
        color,
        type: 'skip',
        value: 'skip',
        score: 20
      });
      deck.push({
        id: `c_${idCounter++}`,
        color,
        type: 'reverse',
        value: 'reverse',
        score: 20
      });
      deck.push({
        id: `c_${idCounter++}`,
        color,
        type: 'draw2',
        value: '+2',
        score: 20
      });
    }
  }

  // 4 Wild cards and 4 Wild Draw Four (+4) cards
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `c_${idCounter++}`,
      color: 'wild',
      type: 'wild',
      value: 'wild',
      score: 50
    });
    deck.push({
      id: `c_${idCounter++}`,
      color: 'wild',
      type: 'wild4',
      value: '+4',
      score: 50
    });
  }

  // Optional 112-card edition: 1 Wild Swap Hands, 1 Wild Shuffle Hands, 2 Wild Custom
  if (includeSpecialWilds) {
    deck.push({
      id: `c_${idCounter++}`,
      color: 'wild',
      type: 'wild_swap',
      value: 'swap',
      score: 40
    });
    deck.push({
      id: `c_${idCounter++}`,
      color: 'wild',
      type: 'wild_shuffle',
      value: 'shuffle',
      score: 40
    });
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: `c_${idCounter++}`,
        color: 'wild',
        type: 'wild_custom',
        value: 'custom',
        score: 40
      });
    }
  }

  return deck;
}

function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isValidPlay(card, topCard, activeColor) {
  if (!card || !topCard) return false;

  // Wild cards can always be played
  if (card.color === 'wild' || card.type.startsWith('wild')) {
    return true;
  }

  const effectiveColor = activeColor || topCard.color;

  // Match color
  if (card.color === effectiveColor) {
    return true;
  }

  // Match number value
  if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) {
    return true;
  }

  // Match action type (Skip on Skip, Reverse on Reverse, Draw2 on Draw2)
  if (card.type !== 'number' && card.type === topCard.type) {
    return true;
  }

  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLORS,
    createDeck,
    shuffle,
    isValidPlay
  };
}
if (typeof window !== 'undefined') {
  window.UnoDeck = {
    COLORS,
    createDeck,
    shuffle,
    isValidPlay
  };
}
