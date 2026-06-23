// ─── TILE TYPE NAMES ─────────────────────────────────────────────────────────
// Add new types here and mirror them in TYPE_META, TYPE_CONNECTORS, and FLOW_DECAY_BY_TILE.

const TILE_TYPES = [
  "straight-v", "straight-h",
  "corner-ne",  "corner-es",  "corner-sw", "corner-wn",
  "sluice-v",   "sluice-h",
  "bridge-v",   "bridge-h"
];

// ─── TILE DISPLAY & FLOW METADATA ────────────────────────────────────────────
// name    : shown in the tile rack label
// glyph   : single unicode character drawn on the tile
// flowBoost : added to flow when water passes through (before decay is applied)

const TYPE_META = {
  "straight-v": { name: "Straight \u2195", glyph: "\u2502", flowBoost: 0 },
  "straight-h": { name: "Straight \u2194", glyph: "\u2500", flowBoost: 0 },
  "corner-ne":  { name: "Turn \u21b1",      glyph: "\u2514", flowBoost: 0 },
  "corner-es":  { name: "Turn \u21b4",      glyph: "\u250c", flowBoost: 0 },
  "corner-sw":  { name: "Turn \u21b2",      glyph: "\u2510", flowBoost: 0 },
  "corner-wn":  { name: "Turn \u21b0",      glyph: "\u2518", flowBoost: 0 },
  "sluice-v":   { name: "Sluice \u2195",   glyph: "S",      flowBoost: 3 },
  "sluice-h":   { name: "Sluice \u2194",   glyph: "S",      flowBoost: 3 },
  "bridge-v":   { name: "Bridge \u2195",   glyph: "\u2551", flowBoost: 0 },
  "bridge-h":   { name: "Bridge \u2194",   glyph: "\u2550", flowBoost: 0 }
};

// ─── DIRECTION HELPERS ───────────────────────────────────────────────────────
// dr/dc   : row/col delta when stepping in that direction
// opposite: the direction you were travelling from when arriving at this face

const DIRS = {
  N: { dr: -1, dc:  0, opposite: "S" },
  E: { dr:  0, dc:  1, opposite: "W" },
  S: { dr:  1, dc:  0, opposite: "N" },
  W: { dr:  0, dc: -1, opposite: "E" }
};

// Maps the level config "side" string to a compass entry direction
const SIDE_TO_ENTRY = { top: "N", right: "E", bottom: "S", left: "W" };

// ─── TILE CONNECTORS ─────────────────────────────────────────────────────────
// Lists which faces each tile type opens to. Water can only enter/exit through
// listed faces.

const TYPE_CONNECTORS = {
  "straight-v": ["N", "S"],
  "straight-h": ["E", "W"],
  "corner-ne":  ["N", "E"],
  "corner-es":  ["E", "S"],
  "corner-sw":  ["S", "W"],
  "corner-wn":  ["W", "N"],
  "sluice-v":   ["N", "S"],
  "sluice-h":   ["E", "W"],
  "bridge-v":   ["N", "S"],
  "bridge-h":   ["E", "W"]
};

// ─── FLOW DECAY ───────────────────────────────────────────────────────────────
// How much flow each tile drains when water passes through it.
// Net flow change per tile = TYPE_META[type].flowBoost - FLOW_DECAY_BY_TILE[type]

const FLOW_DECAY_BY_TILE = {
  "straight-v": 1, "straight-h": 1,
  "corner-ne":  1, "corner-es":  1, "corner-sw": 1, "corner-wn": 1,
  "sluice-v":   0, "sluice-h":   0,
  "bridge-v":   1, "bridge-h":   1
};

// ─── GRID & ANIMATION SIZING ─────────────────────────────────────────────────
const CELL_SIZE    = 24;   // default cell px (overridden per level size)
const CELL_GAP     = 2;    // px gap between cells
const GRID_PAD_X   = 44;   // board-stage horizontal padding
const GRID_PAD_Y   = 32;   // board-stage vertical padding
const FLOW_STEP_MS = 140;  // ms between each animated flow step
