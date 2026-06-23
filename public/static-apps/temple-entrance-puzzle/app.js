const tiles = Array.from(document.querySelectorAll('.tile'));
const slots = Array.from(document.querySelectorAll('.slot'));
console.info('dnd puzzle app version: 2026-06-20-b');
const tileCosts = {
  KUBAZAN: 1,
  NANGNANG: 4,
  IJIN: 8,
  WONGO: 7,
  MOA: 5,
  UNKH: 3,
  PAPAZOTL: 6,
  SHAGAMBI: 9,
  OBOLAKA: 2,
};
const rowTargets = [13, 15, 17];
const colTargets = [14, 18, 13];
const rowMarkers = [
  document.querySelector('.numeral-right-1'),
  document.querySelector('.numeral-right-2'),
  document.querySelector('.numeral-right-3'),
];
const colMarkers = [
  document.querySelector('.numeral-bottom-1'),
  document.querySelector('.numeral-bottom-2'),
  document.querySelector('.numeral-bottom-3'),
];

const storageKey = 'dndPuzzleTilePlacement';
let audioUnlocked = false;

// Audio for tile moves
const tileMoveAudio = new Audio('tile-move.wav');
tileMoveAudio.volume = 0.1;
tileMoveAudio.loop = true;

const tileSlotAudio = new Audio('tile-slot.wav');
tileSlotAudio.volume = 0.5;
tileSlotAudio.preload = 'auto';

const correctAudio = new Audio('correct.mp3');
correctAudio.volume = 0.7;
correctAudio.preload = 'auto';

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  [tileMoveAudio, tileSlotAudio, correctAudio].forEach(sound => {
    try {
      sound.muted = true;
      sound.currentTime = 0;
      const p = sound.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          sound.pause();
          sound.currentTime = 0;
          sound.muted = false;
        }).catch(() => {
          sound.muted = false;
        });
      } else {
        sound.pause();
        sound.currentTime = 0;
        sound.muted = false;
      }
    } catch (e) {
      sound.muted = false;
    }
  });
}

function playOneShot(sound, volume) {
  sound.pause();
  sound.currentTime = 0;
  sound.volume = volume;
  sound.play().catch(() => {});
}



let tileMovePlaying = false;

function playTileMoveSound() {
  if (tileMovePlaying) return;
  tileMovePlaying = true;
  tileMoveAudio.currentTime = 0;
  tileMoveAudio.play().catch(() => { tileMovePlaying = false; });
}

function stopTileMoveSound() {
  if (!tileMovePlaying) return;
  tileMovePlaying = false;
  tileMoveAudio.pause();
  tileMoveAudio.currentTime = 0;
}

function playTileSlotSound() {
  stopTileMoveSound();
  playOneShot(tileSlotAudio, 0.5);
}

function resetTileInlineStyles(tile) {
  tile.style.position = '';
  tile.style.left = '';
  tile.style.top = '';
  tile.style.width = '';
  tile.style.height = '';
  tile.style.margin = '';
  tile.style.zIndex = '';
  tile.style.pointerEvents = '';
  tile.classList.remove('dragging');
}

function savePlacement() {
  const placements = tiles.map(tile => {
    const slotIndex = slots.indexOf(tile.parentElement);
    const rotation = tile.style.getPropertyValue('--tile-rotation') || '0deg';
    if (slotIndex !== -1) {
      return { id: tile.dataset.position, slotIndex, rotation };
    }
    return {
      id: tile.dataset.position,
      slotIndex: null,
      left: parseInt(tile.style.left, 10) || 0,
      top: parseInt(tile.style.top, 10) || 0,
      width: parseInt(tile.style.width, 10) || tile.offsetWidth,
      height: parseInt(tile.style.height, 10) || tile.offsetHeight,
      zIndex: tile.style.zIndex || 1,
      rotation,
    };
  });
  localStorage.setItem(storageKey, JSON.stringify(placements));
}

function restorePlacement() {
  const data = localStorage.getItem(storageKey);
  if (!data) return false;

  let placements;
  try {
    placements = JSON.parse(data);
  } catch (error) {
    return false;
  }

  if (!Array.isArray(placements) || placements.length !== tiles.length) {
    return false;
  }

  const placementMap = Object.fromEntries(placements.map(p => [p.id, p]));

  tiles.forEach(tile => {
    const placement = placementMap[tile.dataset.position];
    if (!placement) return;

    tile.classList.remove('placed');
    resetTileInlineStyles(tile);

    if (placement.slotIndex !== null && slots[placement.slotIndex] && !slots[placement.slotIndex].querySelector('.tile')) {
      slots[placement.slotIndex].appendChild(tile);
      tile.style.setProperty('--tile-rotation', placement.rotation || '0deg');
    } else {
      document.body.appendChild(tile);
      tile.style.position = 'fixed';
      tile.style.left = `${placement.left}px`;
      tile.style.top = `${placement.top}px`;
      tile.style.width = `${placement.width}px`;
      tile.style.height = `${placement.height}px`;
      tile.style.margin = '0';
      tile.style.zIndex = placement.zIndex;
      tile.style.setProperty('--tile-rotation', placement.rotation || '0deg');
    }
    tile.classList.add('placed');
  });

  updateMarkers();
  return true;
}

tiles.forEach(tile => {
  tile.dataset.cost = tileCosts[tile.dataset.position] ?? 0;
  const debugLabel = document.createElement('span');
  debugLabel.className = 'debug-cost';
  debugLabel.textContent = tile.dataset.cost;
  tile.appendChild(debugLabel);
});

let draggedTile = null;
let hoveredSlot = null;
let originalParent = null;
let activePointerId = null;
let offsetX = 0;
let offsetY = 0;

function clearHoveredSlot() {
  if (hoveredSlot) {
    hoveredSlot.classList.remove('hovered');
    hoveredSlot = null;
  }
}

function updateMarkers() {
  const grid = [
    [slots[0], slots[1], slots[2]],
    [slots[3], slots[4], slots[5]],
    [slots[6], slots[7], slots[8]],
  ];

  let newlyCorrect = 0;

  grid.forEach((row, rowIndex) => {
    const sum = row.reduce((total, slot) => {
      const tile = slot.querySelector('.tile');
      return total + (tile ? Number(tile.dataset.cost || 0) : 0);
    }, 0);
    const wasGlowing = rowMarkers[rowIndex].classList.contains('glow');
    const isCorrect = sum === rowTargets[rowIndex];
    rowMarkers[rowIndex].classList.toggle('glow', isCorrect);
    if (isCorrect && !wasGlowing) newlyCorrect++;
  });

  for (let colIndex = 0; colIndex < 3; colIndex++) {
    const sum = grid.reduce((total, row) => {
      const tile = row[colIndex].querySelector('.tile');
      return total + (tile ? Number(tile.dataset.cost || 0) : 0);
    }, 0);
    const wasGlowing = colMarkers[colIndex].classList.contains('glow');
    const isCorrect = sum === colTargets[colIndex];
    colMarkers[colIndex].classList.toggle('glow', isCorrect);
    if (isCorrect && !wasGlowing) newlyCorrect++;
  }

  if (newlyCorrect > 0) {
    playOneShot(correctAudio, 0.7);
  }

  // After updating glows, check for full puzzle solve
  checkSolved();

}
function placeTileInSlot(slot) {
  stopTileMoveSound();
  slot.appendChild(draggedTile);
  draggedTile.classList.add('placed', 'in-slot');
  draggedTile.classList.remove('dragging');
  draggedTile.style.setProperty('--tile-rotation', '0deg');
  draggedTile.style.position = '';
  draggedTile.style.left = '';
  draggedTile.style.top = '';
  draggedTile.style.width = '';
  draggedTile.style.height = '';
  draggedTile.style.margin = '';
  draggedTile.style.zIndex = '';
  draggedTile.style.pointerEvents = '';
  clearHoveredSlot();
  playTileSlotSound();
  updateMarkers();
  savePlacement();
}

let solvedCelebrated = false;
let _confettiCanvas = null;
let _confettiFrame = null;
let _confettiResizeHandler = null;
let _celebrateTimeout = null;
let _resetTimeout = null;

function isSolved() {
  const rowsOk = rowMarkers.every(m => m && m.classList.contains('glow'));
  const colsOk = colMarkers.every(m => m && m.classList.contains('glow'));
  return rowsOk && colsOk;
}

function checkSolved() {
  if (isSolved()) {
    celebrate();
  } else if (solvedCelebrated) {
    // stop immediately if user unsolves the puzzle
    cancelCelebration();
  }
}

function celebrate() {
  if (solvedCelebrated) return;
  solvedCelebrated = true;
  document.body.classList.add('solved');
  startConfetti();
  // schedule auto-stop but keep handles so we can cancel immediately
  _celebrateTimeout = setTimeout(() => {
    document.body.classList.remove('solved');
    cancelConfetti();
    _resetTimeout = setTimeout(() => { solvedCelebrated = false; }, 1200);
  }, 4800);
}

function cancelCelebration() {
  if (!solvedCelebrated) return;
  solvedCelebrated = false;
  document.body.classList.remove('solved');
  if (_celebrateTimeout) { clearTimeout(_celebrateTimeout); _celebrateTimeout = null; }
  if (_resetTimeout) { clearTimeout(_resetTimeout); _resetTimeout = null; }
  cancelConfetti();
}

function cancelConfetti() {
  if (_confettiFrame) { cancelAnimationFrame(_confettiFrame); _confettiFrame = null; }
  if (_confettiResizeHandler) { window.removeEventListener('resize', _confettiResizeHandler); _confettiResizeHandler = null; }
  if (_confettiCanvas && _confettiCanvas.parentElement) { _confettiCanvas.parentElement.removeChild(_confettiCanvas); }
  _confettiCanvas = null;
}

function startConfetti() {
  const count = 80;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = 99999;
  document.body.appendChild(canvas);
  _confettiCanvas = canvas;

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  _confettiResizeHandler = resize;
  window.addEventListener('resize', resize);

  const colors = ['#ffd166', '#f4a261', '#e76f51', '#2a9d8f', '#264653', '#e9c46a'];
  const pieces = Array.from({length: count}).map(() => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.2,
    vx: (Math.random() - 0.5) * 6,
    vy: 2 + Math.random() * 6,
    size: 6 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.2,
  }));

  let start = null;
  function step(ts) {
    if (!_confettiCanvas) return; // cancelled
    if (!start) start = ts;
    const elapsed = ts - start;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy + Math.sin((elapsed + p.x) * 0.01) * 0.5;
      p.vy += 0.02;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      ctx.restore();
    }
    if (elapsed < 4800) {
      _confettiFrame = requestAnimationFrame(step);
    } else {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      window.removeEventListener('resize', resize);
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
      _confettiCanvas = null;
      _confettiFrame = null;
      _confettiResizeHandler = null;
    }
  }
  _confettiFrame = requestAnimationFrame(step);
}

function getSlotUnderPoint(x, y) {
  draggedTile.style.pointerEvents = 'none';
  const elements = document.elementsFromPoint(x, y);
  draggedTile.style.pointerEvents = '';
  return elements.find(el => el.classList.contains('slot')) || null;
}

function endDrag(pointerEvent) {
  if (!draggedTile) return;
  if (activePointerId !== null && pointerEvent.pointerId !== activePointerId) return;
  const slot = getSlotUnderPoint(pointerEvent.clientX, pointerEvent.clientY);

  if (slot && !slot.querySelector('.tile')) {
    // snap into the slot
    placeTileInSlot(slot);
  } else {
    // leave the tile where it was dropped (keep fixed positioning)
    if (draggedTile) {
      draggedTile.classList.remove('dragging');
      draggedTile.classList.add('placed');
      draggedTile.style.pointerEvents = '';
      // if the tile was dragged out of a slot, keep its current drop position
      // but apply a small horizontal jitter and subtle rotation (scrabble-like)
      if (originalParent && originalParent.classList && originalParent.classList.contains('slot')) {
        // determine current position (prefer inline style if present)
        const curLeft = parseInt(draggedTile.style.left, 10) || (pointerEvent.clientX - offsetX);
        const curTop = parseInt(draggedTile.style.top, 10) || (pointerEvent.clientY - offsetY);
        const jitter = getRandomInt(-12, 12); // small horizontal nudge
        draggedTile.style.left = `${curLeft + jitter}px`;
        draggedTile.style.top = `${curTop}px`;
        const rotation = -8 + Math.random() * 16;
        draggedTile.style.setProperty('--tile-rotation', `${rotation}deg`);
      }
    }
    updateMarkers();
    stopTileMoveSound();
    savePlacement();
  }

  // cleanup
  draggedTile = null;
  originalParent = null;
  originalNextSibling = null;
  activePointerId = null;
  if (pointerEvent.currentTarget && pointerEvent.currentTarget.removeEventListener) {
    pointerEvent.currentTarget.removeEventListener('pointermove', onPointerMove);
    pointerEvent.currentTarget.removeEventListener('pointerup', onPointerUp);
    pointerEvent.currentTarget.removeEventListener('pointercancel', onPointerCancel);
  }
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', onPointerCancel);
}

function onPointerMove(event) {
  if (!draggedTile) return;
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  draggedTile.style.left = `${event.clientX - offsetX}px`;
  draggedTile.style.top = `${event.clientY - offsetY}px`;

  const slot = getSlotUnderPoint(event.clientX, event.clientY);
  if (slot !== hoveredSlot) {
    clearHoveredSlot();
    if (slot && !slot.querySelector('.tile')) {
      hoveredSlot = slot;
      hoveredSlot.classList.add('hovered');
    }
  }
}

function onPointerUp(event) {
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  endDrag(event);
}

function onPointerCancel(event) {
  if (!draggedTile) return;
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  endDrag(event);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizeStartingTiles() {
  // Arrange bank as a tidy 3x3 rack on the right, with slight jitter and rotation
  const tileWidth = 110;
  const tileHeight = 64;
  const margin = 20;
  const rightZoneMin = Math.max(window.innerWidth - 380, Math.round(window.innerWidth * 0.55));
  const cols = 3;
  const rows = 3;
  const colGap = 26; // horizontal spacing between columns
  const rowGap = 22; // vertical spacing between rows

  // compute a centered top position for the 3-row stack within the viewport
  const totalHeight = rows * tileHeight + (rows - 1) * rowGap;
  const startTop = Math.max(margin, Math.round((window.innerHeight - totalHeight) / 2));
  const startLeft = rightZoneMin + 12;

  tiles.forEach((tile, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const rotation = -8 + Math.random() * 16; // subtle tilt
    const jitterX = getRandomInt(-10, 10);
    const jitterY = getRandomInt(-8, 8);

    const left = startLeft + col * (tileWidth + colGap) + jitterX;
    const top = startTop + row * (tileHeight + rowGap) + jitterY;

    tile.style.setProperty('--tile-rotation', `${rotation}deg`);
    tile.style.position = 'fixed';
    tile.style.left = `${left}px`;
    tile.style.top = `${top}px`;
    tile.style.width = `${tile.offsetWidth}px`;
    tile.style.height = `${tile.offsetHeight}px`;
    tile.style.margin = '0';
    tile.style.zIndex = 1 + index;
    tile.classList.add('placed');
    document.body.appendChild(tile);
  });
}

tiles.forEach(tile => {
  tile.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    unlockAudio();
    draggedTile = tile;
    activePointerId = event.pointerId;
    originalParent = tile.parentElement;
    originalNextSibling = tile.nextElementSibling;

    const rect = tile.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;

    event.preventDefault();
    tile.style.position = 'fixed';
    const baseLeft = event.clientX - offsetX;
    const baseTop = event.clientY - offsetY;
    tile.style.left = `${baseLeft}px`;
    tile.style.top = `${baseTop}px`;
    tile.style.width = `${tile.offsetWidth}px`;
    tile.style.height = `${tile.offsetHeight}px`;
    tile.style.margin = '0';
    tile.style.zIndex = '9999';
    tile.classList.add('dragging');
    if (originalParent && originalParent.classList && originalParent.classList.contains('slot')) {
      originalParent.classList.remove('correct');
    }
    document.body.appendChild(tile);

    playTileMoveSound();
    tile.addEventListener('pointermove', onPointerMove);
    tile.addEventListener('pointerup', onPointerUp);
    tile.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  });
});

function showTiles() {
  document.body.classList.remove('placement-loading');
}

if (!restorePlacement()) {
  randomizeStartingTiles();
}
showTiles();
