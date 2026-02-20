const ORDINALS = ['1st', '2nd', '3rd', '4th'];
const ITEM_ICONS = {
  mushroom:  '🍄',
  shell:     '🐚',
  shield:    '🛡️',
  banana:    '🍌',
  lightning: '⚡',
};
const MONSTER_DISPLAY = ['Gremlock', 'Purplow', 'Blazork', 'Zappie'];

export class HUD {
  constructor() {
    this._positionEl   = document.getElementById('hud-position');
    this._lapEl        = document.getElementById('hud-lap');
    this._speedEl      = document.getElementById('hud-speed');
    this._coinsEl      = document.getElementById('hud-coins');
    this._itemEl       = document.getElementById('hud-item');
    this._countdownEl  = document.getElementById('hud-countdown');
    this._messageEl    = document.getElementById('hud-message');

    this._lastCountdown = null;
  }

  /**
   * Update all HUD elements each frame.
   * @param {Kart}   playerKart
   * @param {Array}  allKarts
   * @param {object} gameState  { phase, countdown, totalLaps }
   */
  update(playerKart, allKarts, gameState) {
    if (!playerKart) return;

    // Compute rank
    const sorted = [...allKarts].sort((a, b) => b.getRaceScore() - a.getRaceScore());
    const rank   = sorted.indexOf(playerKart) + 1;

    // Position
    const ord = ORDINALS[Math.min(rank - 1, 3)];
    this._positionEl.innerHTML = `${rank}<span class="ordinal">${ord.slice(-2)}</span>`;

    // Lap
    const lap = Math.min(playerKart.laps + 1, gameState.totalLaps);
    this._lapEl.textContent = `Lap ${lap} / ${gameState.totalLaps}`;

    // Speed (convert units/sec to rough km/h display)
    const kmh = Math.round(Math.abs(playerKart.speed) * 4.5);
    this._speedEl.textContent = kmh;

    // Coins
    this._coinsEl.textContent = `🪙 × ${playerKart.coins}`;

    // Held item
    const icon = playerKart.heldItem ? (ITEM_ICONS[playerKart.heldItem] || playerKart.heldItem) : '—';
    this._itemEl.textContent = icon;

    // Countdown phase
    if (gameState.phase === 'countdown') {
      const val = Math.ceil(gameState.countdown);
      if (val !== this._lastCountdown) {
        this._lastCountdown = val;
        this._showCountdown(val > 0 ? String(val) : 'GO!');
      }
    } else if (gameState.phase === 'racing' && this._lastCountdown !== 'go') {
      this._lastCountdown = 'go';
      this._showMessage('GO!');
      this._countdownEl.classList.add('hidden');
    }
  }

  _showCountdown(text) {
    this._countdownEl.textContent = text;
    this._countdownEl.classList.remove('hidden');
    // Re-trigger animation
    this._countdownEl.style.animation = 'none';
    void this._countdownEl.offsetWidth;
    this._countdownEl.style.animation = '';
  }

  _showMessage(text) {
    this._messageEl.textContent = text;
    this._messageEl.classList.remove('hidden');
    // Re-trigger animation
    this._messageEl.style.animation = 'none';
    void this._messageEl.offsetWidth;
    this._messageEl.style.animation = '';
    setTimeout(() => this._messageEl.classList.add('hidden'), 2000);
  }

  showItemMessage(text) {
    this._showMessage(text);
  }

  /**
   * Populate the finish screen standings.
   * @param {Array}  sortedKarts  Karts sorted 1st→last
   * @param {Kart}   playerKart
   */
  showFinishScreen(sortedKarts, playerKart) {
    const container = document.getElementById('finish-standings');
    container.innerHTML = '';

    sortedKarts.forEach((kart, idx) => {
      const row = document.createElement('div');
      row.className = `standing-row rank-${idx + 1}`;

      const medals = ['🥇', '🥈', '🥉', '4️⃣'];

      row.innerHTML = `
        <span class="standing-rank">${medals[idx] || (idx + 1)}</span>
        <span class="standing-name">${kart.name}</span>
        ${kart === playerKart ? '<span class="standing-player-tag">YOU</span>' : ''}
        <span class="standing-laps">${kart.laps} laps</span>
      `;
      container.appendChild(row);
    });

    document.getElementById('finish-screen').classList.remove('hidden');
  }
}
