// ─── LEVEL DATA ───────────────────────────────────────────────────────────────
// Fallback levels used only when levels.js fails to load. Edit levels.js instead.
const DEFAULT_LEVELS = [
  {
    id: "proto-25",
    name: "Temple Causeway 25x25",
    rows: 25,
    cols: 25,
    start: { side: "top", index: 13 },
    end: { side: "bottom", index: 13 },
    baseFlow: 8,
    tiles: { straight: 5, corner: 5, junction: 5, sluice: 5, bridge: 5 },
    obstacles: []
  },
  {
    id: "narrow-18",
    name: "Jaguar Corridor 18x18",
    rows: 18,
    cols: 18,
    start: { side: "left", index: 8 },
    end: { side: "right", index: 9 },
    baseFlow: 9,
    tiles: { straight: 6, corner: 6, junction: 4, sluice: 5, bridge: 4 },
    obstacles: [
      { row: 8, col: 5, type: "wall" },
      { row: 8, col: 6, type: "wall" },
      { row: 8, col: 7, type: "wall" },
      { row: 7, col: 11, type: "rock" },
      { row: 8, col: 11, type: "rock" },
      { row: 9, col: 11, type: "rock" }
    ]
  }
];

const LEVELS = Array.isArray(window.WATER_LEVELS) && window.WATER_LEVELS.length > 0
  ? window.WATER_LEVELS
  : DEFAULT_LEVELS;
// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  tiles: [],
  grid: [],
  flowPath: [],
  currentLevelId: LEVELS[0].id,
  flowAnimationTimer: null,
  currentCellSize: CELL_SIZE,
  tileEls: new Map(),
  tilePositions: new Map()
};

// ─── DOM REFERENCES ───────────────────────────────────────────────────────────
const gridEl = document.getElementById("grid");
const inMarkerEl = document.getElementById("inMarker");
const outMarkerEl = document.getElementById("outMarker");
const statusTextEl = document.getElementById("statusText");
const levelSelectEl = document.getElementById("levelSelect");
const reloadLevelBtnEl = document.getElementById("reloadLevelBtn");
const clearBtnEl = document.getElementById("clearBtn");
const flowMeterFillEl = document.getElementById("flowMeterFill");
const flowMeterValueEl = document.getElementById("flowMeterValue");
const flowMeterScaleEl = document.getElementById("flowMeterScale");

// ─── FLOW METER ───────────────────────────────────────────────────────────────
function getFlowMeterMax(level) {
  const base = Number.isFinite(level.baseFlow) ? level.baseFlow : 1;
  return Math.max(8, base + 8);
}

function getStartFlow(level) {
  const base = Number.isFinite(level.baseFlow) ? level.baseFlow : 1;
  return Math.max(0, Math.round(base));
}

function renderFlowMeterScale(meterMax) {
  if (!flowMeterScaleEl) {
    return;
  }

  const lastMax = Number(flowMeterScaleEl.dataset.max || "0");
  if (lastMax === meterMax && flowMeterScaleEl.childElementCount > 0) {
    return;
  }

  flowMeterScaleEl.innerHTML = "";
  const step = Math.max(1, Math.round(meterMax / 7));
  for (let value = meterMax; value >= 0; value -= step) {
    const tick = document.createElement("span");
    tick.textContent = String(value);
    flowMeterScaleEl.appendChild(tick);
  }

  if (Number(flowMeterScaleEl.lastElementChild?.textContent || "-1") !== 0) {
    const zeroTick = document.createElement("span");
    zeroTick.textContent = "0";
    flowMeterScaleEl.appendChild(zeroTick);
  }

  flowMeterScaleEl.dataset.max = String(meterMax);
}

function updateFlowMeter(flowValue) {
  const level = getCurrentLevel();
  const meterMax = getFlowMeterMax(level);
  const safeFlow = Number.isFinite(flowValue) ? Math.max(0, flowValue) : 0;
  const ratio = Math.min(1, safeFlow / meterMax);

  if (flowMeterFillEl) {
    flowMeterFillEl.style.height = `${ratio * 100}%`;
  }
  if (flowMeterValueEl) {
    flowMeterValueEl.textContent = String(Math.round(safeFlow));
  }
  renderFlowMeterScale(meterMax);
}

// ─── LEVEL HELPERS ────────────────────────────────────────────────────────────
function getCurrentLevel() {
  return LEVELS.find((level) => level.id === state.currentLevelId) || LEVELS[0];
}

function getConnectors(type) {
  return TYPE_CONNECTORS[type] || [];
}

function getEndpointCell(side, index, rows, cols) {
  if (side === "top") {
    return { row: 0, col: Math.max(0, Math.min(cols - 1, index)) };
  }
  if (side === "bottom") {
    return { row: rows - 1, col: Math.max(0, Math.min(cols - 1, index)) };
  }
  if (side === "left") {
    return { row: Math.max(0, Math.min(rows - 1, index)), col: 0 };
  }
  return { row: Math.max(0, Math.min(rows - 1, index)), col: cols - 1 };
}

function getLevelEndpoints(level) {
  const startCell = getEndpointCell(level.start.side, level.start.index, level.rows, level.cols);
  const endCell = getEndpointCell(level.end.side, level.end.index, level.rows, level.cols);
  return {
    startCell,
    endCell,
    startEntry: SIDE_TO_ENTRY[level.start.side],
    endExit: SIDE_TO_ENTRY[level.end.side]
  };
}

function createEmptyGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      row.push({ row: r, col: c, obstacle: "none", fixed: false, tileId: null });
    }
    grid.push(row);
  }
  return grid;
}

// ─── TILE DATA ────────────────────────────────────────────────────────────────
function createTiles(tileDefs) {
  state.tiles = [];
  let id = 1;

  if (Array.isArray(tileDefs)) {
    tileDefs.forEach((def) => {
      state.tiles.push({ id: String(id), type: def.type, rotation: def.rotation || 0, placedAt: null });
      id += 1;
    });
  } else {
    TILE_TYPES.forEach((type) => {
      const legacyPumpCount = type === "sluice" ? tileDefs.pump || 0 : 0;
      const amount = tileDefs[type] || legacyPumpCount || 0;
      for (let i = 0; i < amount; i += 1) {
        state.tiles.push({ id: String(id), type, rotation: 0, placedAt: null });
        id += 1;
      }
    });
  }
}

function getTileById(id) {
  return state.tiles.find((tile) => tile.id === id);
}

function createTileEl(tile) {
  const meta = TYPE_META[tile.type];
  const decay = FLOW_DECAY_BY_TILE[tile.type] ?? 1;
  const netFlow = meta.flowBoost - decay;
  const tileEl = document.createElement("div");
  tileEl.className = `tile ${tile.type}`;
  tileEl.dataset.tileId = tile.id;
  tileEl.title = `${meta.name} (rot ${tile.rotation})`;

  const glyph = document.createElement("div");
  glyph.className = "glyph";
  glyph.textContent = meta.glyph;
  glyph.style.transform = `rotate(${tile.rotation * 90}deg)`;
  tileEl.appendChild(glyph);

  const label = document.createElement("div");
  label.className = "tile-name";
  label.textContent = meta.name;
  tileEl.appendChild(label);

  const flowCost = document.createElement("div");
  flowCost.className = "tile-cost";
  flowCost.textContent = `Flow ${netFlow >= 0 ? "+" : ""}${netFlow}`;
  tileEl.appendChild(flowCost);

  return tileEl;
}

function renderRack() {
  // Tiles are now loose elements positioned freely on the right side of the page.
}

// ─── TILE DOM ELEMENTS ────────────────────────────────────────────────────────
function applyHomePosition(tileEl, tileId) {
  const pos = state.tilePositions.get(tileId);
  if (!pos) return;
  tileEl.style.position = "fixed";
  tileEl.style.left = `${pos.x}px`;
  tileEl.style.top = `${pos.y}px`;
  tileEl.style.width = `${pos.w}px`;
  tileEl.style.height = `${pos.h}px`;
  tileEl.style.margin = "0";
  tileEl.style.zIndex = String(pos.z);
  tileEl.style.transform = `rotate(${pos.rotation}deg)`;
  tileEl.style.opacity = "";
  tileEl.classList.remove("placed");
}

function initTileElements() {
  state.tileEls.forEach((el) => { if (el.parentNode) el.parentNode.removeChild(el); });
  state.tileEls.clear();
  state.tilePositions.clear();

  const tileW = 96;
  const tileH = 82;
  const cols = 2;
  const colGap = 14;
  const rowGap = 14;
  const rightPad = 20;
  const startTop = 130;

  state.tiles.forEach((tile, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const jitterX = (Math.random() - 0.5) * 24;
    const jitterY = (Math.random() - 0.5) * 16;
    const rotation = (Math.random() - 0.5) * 14;
    const x = window.innerWidth - rightPad - (cols - col) * (tileW + colGap) + jitterX;
    const y = startTop + row * (tileH + rowGap) + jitterY;

    state.tilePositions.set(tile.id, { x, y, w: tileW, h: tileH, rotation, z: 10 + index });

    const tileEl = createTileEl(tile);
    tileEl.style.position = "fixed";
    tileEl.style.left = `${x}px`;
    tileEl.style.top = `${y}px`;
    tileEl.style.width = `${tileW}px`;
    tileEl.style.height = `${tileH}px`;
    tileEl.style.margin = "0";
    tileEl.style.zIndex = String(10 + index);
    tileEl.style.transform = `rotate(${rotation}deg)`;
    document.body.appendChild(tileEl);
    state.tileEls.set(tile.id, tileEl);
  });
}

function syncUnplacedTiles() {
  state.tiles.forEach((tile) => {
    if (!tile.placedAt) {
      const tileEl = state.tileEls.get(tile.id);
      if (tileEl && tileEl.parentNode !== document.body) {
        document.body.appendChild(tileEl);
        applyHomePosition(tileEl, tile.id);
      }
    }
  });
}

function setCellTile(row, col, tileId) {
  const cell = state.grid[row][col];
  const currentId = cell.tileId;

  if (currentId) {
    const currentTile = getTileById(currentId);
    currentTile.placedAt = null;
  }

  if (!tileId) {
    cell.tileId = null;
    return;
  }

  const tile = getTileById(tileId);
  if (tile.placedAt) {
    const prev = state.grid[tile.placedAt.row][tile.placedAt.col];
    prev.tileId = null;
  }

  cell.tileId = tileId;
  tile.placedAt = { row, col };
}

// ─── GRID RENDERING ───────────────────────────────────────────────────────────
function renderGrid() {
  gridEl.innerHTML = "";

  const level = getCurrentLevel();
  const maxDim = Math.max(level.rows, level.cols);
  if (maxDim <= 5) {
    state.currentCellSize = 56;
  } else if (maxDim <= 10) {
    state.currentCellSize = 42;
  } else if (maxDim <= 15) {
    state.currentCellSize = 34;
  } else if (maxDim <= 20) {
    state.currentCellSize = 28;
  } else if (maxDim <= 25) {
    state.currentCellSize = 24;
  } else {
    state.currentCellSize = 20;
  }

  gridEl.style.setProperty("--cell-size", `${state.currentCellSize}px`);
  gridEl.style.setProperty("--grid-cols", String(level.cols));

  state.grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);

      if (cell.obstacle === "wall") {
        cellEl.classList.add("obstacle-wall");
      } else if (cell.obstacle === "rock") {
        cellEl.classList.add("obstacle-rock");
      }

      if (cell.tileId) {
        const tileEl = state.tileEls.get(cell.tileId);
        if (tileEl) {
          tileEl.style.position = "";
          tileEl.style.left = "";
          tileEl.style.top = "";
          tileEl.style.width = "";
          tileEl.style.height = "";
          tileEl.style.margin = "";
          tileEl.style.zIndex = "";
          tileEl.style.transform = "";
          tileEl.style.opacity = "";
          tileEl.classList.add("placed");
          tileEl.querySelector(".rotate-tile-btn")?.remove();
          tileEl.ondblclick = null;
          tileEl.oncontextmenu = null;
          cellEl.appendChild(tileEl);
        }
      }

      gridEl.appendChild(cellEl);
    });
  });

  // Single grid-level drop zone using pointer position.
  function getCellFromPointer(clientX, clientY) {
    const rect = gridEl.getBoundingClientRect();
    const cellStep = state.currentCellSize + CELL_GAP;
    const col = Math.floor((clientX - rect.left - 6) / cellStep);
    const row = Math.floor((clientY - rect.top - 6) / cellStep);
    return {
      row: Math.max(0, Math.min(level.rows - 1, row)),
      col: Math.max(0, Math.min(level.cols - 1, col))
    };
  }

}

// ─── FLOW ANIMATION ───────────────────────────────────────────────────────────
function stopFlowAnimation() {
  if (state.flowAnimationTimer) {
    window.clearInterval(state.flowAnimationTimer);
    state.flowAnimationTimer = null;
  }
}

function clearFlowVisuals(resetPath = true) {
  stopFlowAnimation();
  if (resetPath) {
    state.flowPath = [];
    updateFlowMeter(getStartFlow(getCurrentLevel()));
  }
  document
    .querySelectorAll(".cell.flow, .cell.flow-trace, .cell.flow-live")
    .forEach((cell) => cell.classList.remove("flow", "flow-trace", "flow-live"));
}

function animateFlowPath(resultText) {
  clearFlowVisuals(false);

  if (state.flowPath.length === 0) {
    updateStatus(resultText);
    updateFlowMeter(getStartFlow(getCurrentLevel()));
    return;
  }

  let index = 0;
  state.flowAnimationTimer = window.setInterval(() => {
    const prevNode = state.flowPath[index - 1];
    if (prevNode) {
      const prevSelector = `.cell[data-row='${prevNode.row}'][data-col='${prevNode.col}']`;
      const prevCell = document.querySelector(prevSelector);
      if (prevCell) {
        prevCell.classList.remove("flow-live");
        prevCell.classList.add("flow", "flow-trace");
      }
    }

    const node = state.flowPath[index];
    if (!node) {
      stopFlowAnimation();
      updateStatus(resultText);
      const endFlow = state.flowPath[state.flowPath.length - 1]?.flow ?? 0;
      updateFlowMeter(endFlow);
      return;
    }

    const selector = `.cell[data-row='${node.row}'][data-col='${node.col}']`;
    const cell = document.querySelector(selector);
    if (cell) {
      cell.classList.add("flow", "flow-trace", "flow-live");
    }
    updateFlowMeter(node.flow);

    index += 1;
  }, FLOW_STEP_MS);
}

function triggerSourceSplash(level) {
  const { startCell } = getLevelEndpoints(level);
  const startNode = state.grid[startCell.row]?.[startCell.col];
  if (!startNode || !startNode.tileId) {
    return;
  }

  const selector = `.cell[data-row='${startCell.row}'][data-col='${startCell.col}']`;
  const sourceCell = document.querySelector(selector);
  if (!sourceCell) {
    return;
  }

  sourceCell.classList.add("source-splash");
  window.setTimeout(() => {
    sourceCell.classList.remove("source-splash");
  }, 450);
}

function renderEndpointMarkers() {
  const level = getCurrentLevel();
  const { startCell, endCell } = getLevelEndpoints(level);
  const cellSize = state.currentCellSize;

  const gridWidth = level.cols * (cellSize + CELL_GAP) - CELL_GAP;
  const gridHeight = level.rows * (cellSize + CELL_GAP) - CELL_GAP;

  const startX = GRID_PAD_X + startCell.col * (cellSize + CELL_GAP) + cellSize / 2;
  const startY = GRID_PAD_Y + startCell.row * (cellSize + CELL_GAP) + cellSize / 2;
  const endX = GRID_PAD_X + endCell.col * (cellSize + CELL_GAP) + cellSize / 2;
  const endY = GRID_PAD_Y + endCell.row * (cellSize + CELL_GAP) + cellSize / 2;

  if (level.start.side === "top") {
    inMarkerEl.style.left = `${startX - 17}px`;
    inMarkerEl.style.top = "6px";
  } else if (level.start.side === "bottom") {
    inMarkerEl.style.left = `${startX - 17}px`;
    inMarkerEl.style.top = `${GRID_PAD_Y + gridHeight + 8}px`;
  } else if (level.start.side === "left") {
    inMarkerEl.style.left = "8px";
    inMarkerEl.style.top = `${startY - 10}px`;
  } else {
    inMarkerEl.style.left = `${GRID_PAD_X + gridWidth + 10}px`;
    inMarkerEl.style.top = `${startY - 10}px`;
  }

  if (level.end.side === "top") {
    outMarkerEl.style.left = `${endX - 19}px`;
    outMarkerEl.style.top = "6px";
  } else if (level.end.side === "bottom") {
    outMarkerEl.style.left = `${endX - 19}px`;
    outMarkerEl.style.top = `${GRID_PAD_Y + gridHeight + 8}px`;
  } else if (level.end.side === "left") {
    outMarkerEl.style.left = "8px";
    outMarkerEl.style.top = `${endY - 10}px`;
  } else {
    outMarkerEl.style.left = `${GRID_PAD_X + gridWidth + 10}px`;
    outMarkerEl.style.top = `${endY - 10}px`;
  }
}

// ─── FLOW SIMULATION ──────────────────────────────────────────────────────────
function chooseExit(connectors, entrySide, currentDirection) {
  const exits = connectors.filter((d) => d !== entrySide);
  if (exits.length === 0) {
    return null;
  }

  if (exits.includes(currentDirection)) {
    return currentDirection;
  }

  return exits[0];
}

function canTileHandleObstacle(tile, obstacle) {
  if (obstacle === "none") {
    return true;
  }
  if (obstacle === "rock") {
    return tile.type === "bridge-v" || tile.type === "bridge-h";
  }
  return false;
}

function runFlow() {
  clearFlowVisuals();

  const level = getCurrentLevel();
  const { startCell, endCell, startEntry, endExit } = getLevelEndpoints(level);
  const visited = new Set();

  let flow = Number.isFinite(level.baseFlow) && level.baseFlow > 0 ? level.baseFlow : 1;

  let row = startCell.row;
  let col = startCell.col;
  let entrySide = startEntry;
  let moveDir = DIRS[entrySide].opposite;
  let steps = 0;
  const stepLimit = level.rows * level.cols * 4;

  const startPlacedTile = state.grid[startCell.row]?.[startCell.col]?.tileId;
  if (startPlacedTile) {
    updateStatus("Sacred water is flowing...");
    triggerSourceSplash(level);
  }

  function finishRun(message) {
    animateFlowPath(message);
  }

  while (steps < stepLimit) {
    if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) {
      finishRun("Water escaped outside the board, but not through OUT.");
      return;
    }

    const cell = state.grid[row][col];

    if (cell.obstacle === "wall") {
      finishRun(`Water struck a wall at C${col + 1} R${row + 1}. Final rate ${flow}.`);
      return;
    }

    if (!cell.tileId) {
      finishRun(`Water stopped at C${col + 1} R${row + 1} because no tile was placed.`);
      return;
    }

    const tile = getTileById(cell.tileId);
    if (!canTileHandleObstacle(tile, cell.obstacle)) {
      finishRun(`Rock at C${col + 1} R${row + 1} needs a Bridge tile.`);
      return;
    }

    const connectors = getConnectors(tile.type, tile.rotation);
    if (!connectors.includes(entrySide)) {
      finishRun(
        `Water cannot enter ${TYPE_META[tile.type].name} at C${col + 1} R${row + 1}. Rotate the tile.`
      );
      return;
    }

    const visitKey = `${row}:${col}:${entrySide}`;
    if (visited.has(visitKey)) {
      finishRun(`Whirlpool loop detected at C${col + 1} R${row + 1}. Current flow ${flow}.`);
      return;
    }
    visited.add(visitKey);

    const tileBoost = TYPE_META[tile.type].flowBoost;
    const tileDecay = FLOW_DECAY_BY_TILE[tile.type] ?? 1;
    flow += tileBoost - tileDecay;
    flow = Math.max(0, flow);

    // Record post-tile flow so gauge drops/rises immediately at this tile.
    state.flowPath.push({ row, col, flow });

    if (flow <= 0) {
      finishRun(`Water ran out at C${col + 1} R${row + 1}.`);
      return;
    }

    const exitDir = chooseExit(connectors, entrySide, moveDir);
    if (!exitDir) {
      finishRun(`Water dead-ended at C${col + 1} R${row + 1}.`);
      return;
    }

    const nextRow = row + DIRS[exitDir].dr;
    const nextCol = col + DIRS[exitDir].dc;

    if (nextRow < 0 || nextRow >= level.rows || nextCol < 0 || nextCol >= level.cols) {
      if (row === endCell.row && col === endCell.col && exitDir === endExit) {
        finishRun(`Success: sacred flow reached OUT at ${flow} rate.`);
      } else {
        finishRun("Water left the grid at the wrong edge. Route to OUT.");
      }
      return;
    }

    row = nextRow;
    col = nextCol;
    moveDir = exitDir;
    entrySide = DIRS[moveDir].opposite;
    steps += 1;
  }

  finishRun("Ritual limit reached. Adjust the path to avoid loops.");
}

// ─── GAME ACTIONS ─────────────────────────────────────────────────────────────
function clearPlacedTiles() {
  state.tiles.forEach((tile) => {
    tile.placedAt = null;
    tile.rotation = 0;
    const tileEl = state.tileEls.get(tile.id);
    if (tileEl) {
      const glyphEl = tileEl.querySelector(".glyph");
      if (glyphEl) glyphEl.style.transform = "rotate(0deg)";
      const rotBtn = tileEl.querySelector(".rotate-tile-btn");
      if (rotBtn) rotBtn.remove();
    }
  });

  state.grid.forEach((row) => {
    row.forEach((cell) => {
      cell.tileId = null;
    });
  });

  clearFlowVisuals();
  renderBoard();
  updateStatus("All tiles returned to the field.");
}

function loadLevel(levelId) {
  const level = LEVELS.find((item) => item.id === levelId) || LEVELS[0];
  state.currentLevelId = level.id;

  state.grid = createEmptyGrid(level.rows, level.cols);
  level.obstacles.forEach((entry) => {
    if (entry.row >= 0 && entry.row < level.rows && entry.col >= 0 && entry.col < level.cols) {
      const cell = state.grid[entry.row][entry.col];
      cell.obstacle = entry.type;
      cell.fixed = true;
    }
  });

  const { startCell, endCell } = getLevelEndpoints(level);
  state.grid[startCell.row][startCell.col].obstacle = "none";
  state.grid[startCell.row][startCell.col].fixed = false;
  state.grid[endCell.row][endCell.col].obstacle = "none";
  state.grid[endCell.row][endCell.col].fixed = false;

  createTiles(level.tiles);
  clearFlowVisuals();
  updateFlowMeter(getStartFlow(level));
  initTileElements();
  renderBoard();
  updateStatus(`Loaded ${level.name}. Spring rate is set by level config (${level.baseFlow}).`);
  runFlow();
}

function setupLevelSelect() {
  levelSelectEl.innerHTML = "";
  LEVELS.forEach((level) => {
    const option = document.createElement("option");
    option.value = level.id;
    option.textContent = `${level.name} (${level.rows}x${level.cols})`;
    levelSelectEl.appendChild(option);
  });
  levelSelectEl.value = state.currentLevelId;
}

function updateStatus(text) {
  statusTextEl.textContent = text;
}

function renderBoard() {
  renderGrid();
  renderEndpointMarkers();
  syncUnplacedTiles();
}

// ─── UI BINDINGS ──────────────────────────────────────────────────────────────
function bindUi() {
  clearBtnEl.addEventListener("click", clearPlacedTiles);
  reloadLevelBtnEl.addEventListener("click", () => loadLevel(state.currentLevelId));

  levelSelectEl.addEventListener("change", () => {
    loadLevel(levelSelectEl.value);
  });

}

// ─── POINTER DRAG ─────────────────────────────────────────────────────────────
function initPointerDrag() {
  let drag = null;

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const tileEl = event.target.closest(".tile");
    if (!tileEl || tileEl.classList.contains("tile-ghost")) return;
    const tileId = tileEl.dataset.tileId;
    const tile = getTileById(tileId);
    if (!tile) return;

    event.preventDefault();
    const rect = tileEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const ghost = tileEl.cloneNode(true);
    ghost.classList.add("tile-ghost");
    ghost.style.cssText = [
      `position:fixed`,
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      `margin:0`,
      `z-index:9999`,
      `pointer-events:none`,
      `opacity:0.94`,
      `transform:scale(1.08) rotate(-3deg)`,
      `box-shadow:0 14px 28px rgba(0,0,0,0.55)`,
      `transition:none`
    ].join(";");
    document.body.appendChild(ghost);

    tileEl.style.opacity = "0.25";
    document.body.style.cursor = "grabbing";

    drag = { tileId, tile, ghost, offsetX, offsetY, pointerId: event.pointerId, sourceTileEl: tileEl };
    tileEl.setPointerCapture(event.pointerId);
  });

  document.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;

    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    document.querySelectorAll(".cell.drag-over").forEach((el) => el.classList.remove("drag-over"));
    const cellEl = elements.find((el) => el.dataset && el.dataset.row !== undefined && el.dataset.col !== undefined);
    if (cellEl) {
      cellEl.classList.add("drag-over");
    }
  });

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const targetCellEl = elements.find((el) => el.dataset && el.dataset.row !== undefined && el.dataset.col !== undefined);

    drag.ghost.remove();
    drag.sourceTileEl.style.opacity = "";
    document.body.style.cursor = "";
    document.querySelectorAll(".cell.drag-over").forEach((el) => el.classList.remove("drag-over"));

    const savedDrag = drag;
    drag = null;

    if (targetCellEl) {
      const r = Number(targetCellEl.dataset.row);
      const c = Number(targetCellEl.dataset.col);
      const targetCell = state.grid[r]?.[c];

      if (targetCell && targetCell.obstacle !== "wall") {
        setCellTile(r, c, savedDrag.tileId);
        clearFlowVisuals();
        renderBoard();
        runFlow();
        return;
      }
    }

    // Dropped outside any valid target — return to home position
    if (savedDrag.tile.placedAt) {
      const { row, col } = savedDrag.tile.placedAt;
      state.grid[row][col].tileId = null;
      savedDrag.tile.placedAt = null;
      clearFlowVisuals();
      renderBoard();
      runFlow();
    } else {
      applyHomePosition(savedDrag.sourceTileEl, savedDrag.tileId);
    }
  }

  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  setupLevelSelect();
  bindUi();
  initPointerDrag();
  loadLevel(state.currentLevelId);
}

init();
