window.WATER_LEVELS = [
  {
    id: "level-1",
    name: "Level 1 - Temple Trial 5x5",
    rows: 5,
    cols: 5,
    start: { side: "top", index: 1 },
    end: { side: "right", index: 3 },
    baseFlow: 6,
    tiles: [
      { type: "straight-v" },
      { type: "corner-ne" },
      { type: "straight-h" },
      { type: "corner-sw" },
      { type: "bridge-v" },
      { type: "corner-ne" },
      { type: "straight-h" }
    ],
    obstacles: [
      { row: 0, col: 2, type: "wall" },
      { row: 1, col: 0, type: "wall" },
      { row: 2, col: 1, type: "wall" },
      { row: 2, col: 2, type: "wall" },
      { row: 4, col: 2, type: "wall" },
      { row: 2, col: 3, type: "rock" }
    ]
  },
    {
    id:       "level-new",
    name:     "New Level",
    rows:     3,
    cols:     8,
    start:    { side: "top", index: 1 },
    end:      { side: "right",   index: 1 },
    baseFlow: 9,
    tiles: [
      { type: "bridge-v" },
      { type: "corner-ne" },
      { type: "corner-sw" },
      { type: "corner-ne" },
      { type: "straight-h" },
      { type: "corner-wn" },
      { type: "corner-es" },
      { type: "bridge-h" },
      { type: "bridge-h" },
      { type: "bridge-h" }
    ],
    obstacles: [
      { row: 1, col: 6, type: "wall" },
      { row: 0, col: 6, type: "wall" },
      { row: 2, col: 6, type: "rock" },
      { row: 0, col: 2, type: "rock" },
      { row: 1, col: 2, type: "wall" },
      { row: 0, col: 0, type: "wall" },
      { row: 1, col: 0, type: "wall" },
      { row: 1, col: 1, type: "wall" },
      { row: 2, col: 2, type: "wall" },
      { row: 1, col: 3, type: "rock" },
      { row: 0, col: 4, type: "wall" },
      { row: 1, col: 4, type: "wall" },
      { row: 2, col: 4, type: "rock" },
      { row: 1, col: 5, type: "wall" }
    ]
  }
];
