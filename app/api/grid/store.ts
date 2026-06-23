import { fullGridTiles, type GridTile } from '@/app/utils/gridConfig'

export type Direction = 'top' | 'right' | 'bottom' | 'left'

export type PipeKind =
  | 'horizontal'
  | 'vertical'
  | 'corner-left-bottom'
  | 'corner-right-bottom'
  | 'corner-right-top'
  | 'corner-left-top'
  | 't-open-top'
  | 't-open-bottom'
  | 't-open-left'
  | 't-open-right'
  | 'cross'
  | 'broken'
  | 'quench-vent'
  | 'portal-entrance'
  | 'portal-exit'

export interface PipePlacement {
  row: number
  col: number
  kind: PipeKind
}

export interface FlowState {
  activePipeKeys: string[]
  activeVentKeys: string[]
  ventSprayTileKeys: string[]
  damagedVentKeys: string[]
}

export interface PortalNode {
  row: number
  col: number
}

export interface PortalLink {
  entranceKey: string
  exitKey: string
}

export type RoundEventOutcome = 'help' | 'hinder' | 'nothing'
export type RoundEventEffect = 'reduce-heat' | 'magic-item' | 'break-pipe' | 'none'

export interface RoundEvent {
  outcome: RoundEventOutcome
  effect: RoundEventEffect
  headline: string
  message: string
}

export interface GridState {
  tiles: GridTile[]
  pipes: PipePlacement[]
  flow: FlowState
  portalEntrances: PortalNode[]
  portalExits: PortalNode[]
  portalLinks: PortalLink[]
  roundEvent: RoundEvent | null
  round: number
  palette: PipeKind[]
  tileBank: PipeKind | null
}

export type PlacementSource = 'palette' | 'bank'

type GridListener = (state: GridState) => void

const keyFor = (row: number, col: number): string => `${row},${col}`

const initialGridMap = new Map<string, GridTile>(
  fullGridTiles.map(tile => [keyFor(tile.row, tile.col), { ...tile }]),
)

const fixedQuenchVentPlacements: PipePlacement[] = [
  { row: 2, col: 7, kind: 'quench-vent' },
  { row: 2, col: 12, kind: 'quench-vent' },
  { row: 5, col: 3, kind: 'quench-vent' },
  { row: 5, col: 16, kind: 'quench-vent' },
  { row: 8, col: 1, kind: 'quench-vent' },
  { row: 8, col: 17, kind: 'quench-vent' },
  { row: 11, col: 1, kind: 'quench-vent' },
  { row: 11, col: 17, kind: 'quench-vent' },
  { row: 14, col: 3, kind: 'quench-vent' },
  { row: 14, col: 16, kind: 'quench-vent' },
  { row: 17, col: 7, kind: 'quench-vent' },
  { row: 17, col: 12, kind: 'quench-vent' },
]

const fixedQuenchVentKeys = new Set(
  fixedQuenchVentPlacements.map(placement => keyFor(placement.row, placement.col)),
)

const initialPipeMap = new Map<string, PipeKind>(
  fixedQuenchVentPlacements.map(placement => [keyFor(placement.row, placement.col), placement.kind]),
)

const roundPaletteSize = 6
const brokenPipeChance = 0.7
const mustSeePortalEntranceBeforeRound = 4
const mustSeePortalExitBeforeRound = 9

const ventActiveRounds = 1
const ventIdleState = 0
const ventDamagedState = -1

const placeableNonBrokenPipeKinds: PipeKind[] = [
  'horizontal',
  'vertical',
  'corner-left-bottom',
  'corner-right-bottom',
  'corner-right-top',
  'corner-left-top',
  't-open-top',
  't-open-bottom',
  't-open-left',
  't-open-right',
  'cross',
]

function maxCountForPipe(kind: PipeKind): number {
  if (kind === 'broken') return 2
  if (kind === 'portal-entrance' || kind === 'portal-exit') return 1
  return 6 // all other pipes can appear multiple times
}

function createRoundPalette(round: number, hasSeenPortalEntrance: boolean, hasSeenPortalExit: boolean): PipeKind[] {
  const nextPalette: PipeKind[] = []
  const counts = new Map<PipeKind, number>()

  const addCandidate = (kind: PipeKind): boolean => {
    const currentCount = counts.get(kind) ?? 0
    if (currentCount >= maxCountForPipe(kind)) return false
    nextPalette.push(kind)
    counts.set(kind, currentCount + 1)
    return true
  }

  // Add broken pipe (70% chance)
  if (Math.random() < brokenPipeChance) {
    addCandidate('broken')
  }

  let addedPortalThisRound = false

  // Add entrance (probabilistic if not seen, before round 4)
  if (!hasSeenPortalEntrance && round < mustSeePortalEntranceBeforeRound && !addedPortalThisRound) {
    const isLastRound = round === mustSeePortalEntranceBeforeRound - 1
    const roundsUntilDeadline = mustSeePortalEntranceBeforeRound - round
    const probability = isLastRound ? 1.0 : Math.pow(0.15, Math.max(1, roundsUntilDeadline - 1))
    if (Math.random() < probability) {
      addCandidate('portal-entrance')
      addedPortalThisRound = true
    }
  }

  // Add exit (probabilistic if entrance seen, before round 9, not both in round)
  if (!hasSeenPortalExit && hasSeenPortalEntrance && !addedPortalThisRound && round < mustSeePortalExitBeforeRound) {
    const isLastRound = round === mustSeePortalExitBeforeRound - 1
    const roundsUntilDeadline = mustSeePortalExitBeforeRound - round
    const probability = isLastRound ? 1.0 : Math.pow(0.15, Math.max(1, roundsUntilDeadline - 1))
    if (Math.random() < probability) {
      addCandidate('portal-exit')
      addedPortalThisRound = true
    }
  }

  // Fillers are always non-portal pipes to keep portal timing controlled by probability logic.
  const candidatePool = placeableNonBrokenPipeKinds

  // Fill palette to 6 tiles with random pipes
  while (nextPalette.length < roundPaletteSize) {
    const randomIndex = Math.floor(Math.random() * candidatePool.length)
    const candidate = candidatePool[randomIndex]
    addCandidate(candidate)
  }

  // Shuffle palette
  for (let i = nextPalette.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = nextPalette[i]
    nextPalette[i] = nextPalette[j]
    nextPalette[j] = temp
  }

  return nextPalette
}

const deltas: Record<Direction, { row: number; col: number }> = {
  top: { row: -1, col: 0 },
  right: { row: 0, col: 1 },
  bottom: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
}

const orthogonalDeltas = [
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
]

const opposite: Record<Direction, Direction> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

function getConnections(kind: PipeKind): Direction[] {
  switch (kind) {
    case 'horizontal':
      return ['left', 'right']
    case 'vertical':
      return ['top', 'bottom']
    case 'corner-left-bottom':
      return ['left', 'bottom']
    case 'corner-right-bottom':
      return ['right', 'bottom']
    case 'corner-right-top':
      return ['right', 'top']
    case 'corner-left-top':
      return ['left', 'top']
    case 't-open-top':
      return ['left', 'right', 'top']
    case 't-open-bottom':
      return ['left', 'right', 'bottom']
    case 't-open-left':
      return ['top', 'bottom', 'left']
    case 't-open-right':
      return ['top', 'bottom', 'right']
    case 'cross':
    case 'quench-vent':
    case 'portal-entrance':
    case 'portal-exit':
      return ['top', 'right', 'bottom', 'left']
    case 'broken':
    default:
      return []
  }
}

function sortGrid(a: GridTile, b: GridTile): number {
  if (a.row !== b.row) return a.row - b.row
  return a.col - b.col
}

function sortPipes(a: PipePlacement, b: PipePlacement): number {
  if (a.row !== b.row) return a.row - b.row
  return a.col - b.col
}

function parseKey(key: string): { row: number; col: number } {
  const [row, col] = key.split(',').map(Number)
  return { row, col }
}

function createInitialVentRoundMap(): Map<string, number> {
  return new Map(fixedQuenchVentPlacements.map(placement => [keyFor(placement.row, placement.col), ventIdleState]))
}

function getDamagedVentKeySet(ventRoundMap: Map<string, number>): Set<string> {
  return new Set(
    Array.from(ventRoundMap.entries())
      .filter(([, roundsLeft]) => roundsLeft === ventDamagedState)
      .map(([key]) => key),
  )
}

function prunePortalLinks(pipeMap: Map<string, PipeKind>, portalLinks: Map<string, string>): Map<string, string> {
  const result = new Map(portalLinks)
  for (const [entranceKey, exitKey] of portalLinks) {
    if (!pipeMap.has(entranceKey) || !pipeMap.has(exitKey)) {
      result.delete(entranceKey)
    }
  }
  return result
}

interface GridStore {
  gridMap: Map<string, GridTile>
  pipeMap: Map<string, PipeKind>
  quenchVentRoundMap: Map<string, number>
  portalLinks: Map<string, string>
  latestRoundEvent: RoundEvent | null
  listeners: Set<GridListener>
  round: number
  palette: PipeKind[]
  tileBank: PipeKind | null
  hasSeenPortalEntrance: boolean
  hasSeenPortalExit: boolean
}

declare global {
  // eslint-disable-next-line no-var
  var __epicAwesomeBossFightGridStore: GridStore | undefined
}

function readGlobalStore(): GridStore | undefined {
  return globalThis.__epicAwesomeBossFightGridStore
}

function writeGlobalStore(store: GridStore | undefined): void {
  globalThis.__epicAwesomeBossFightGridStore = store
}

function createStore(listeners: Set<GridListener> = new Set<GridListener>()): GridStore {
  const store: GridStore = {
    gridMap: new Map(initialGridMap),
    pipeMap: new Map(initialPipeMap),
    quenchVentRoundMap: createInitialVentRoundMap(),
    portalLinks: new Map<string, string>(),
    latestRoundEvent: null,
    listeners,
    round: 1,
    palette: [],
    tileBank: null,
    hasSeenPortalEntrance: false,
    hasSeenPortalExit: false,
  }

  store.palette = createRoundPalette(store.round, store.hasSeenPortalEntrance, store.hasSeenPortalExit)
  if (store.palette.includes('portal-entrance')) {
    store.hasSeenPortalEntrance = true
  }
  if (store.palette.includes('portal-exit')) {
    store.hasSeenPortalExit = true
  }

  return store
}

function getStore(): GridStore {
  const existing = readGlobalStore()
  if (!existing) {
    const created = createStore()
    writeGlobalStore(created)
    return created
  }

  // Recover from legacy vent-state bug where all fixed vents could be marked damaged.
  // Keep currently connected vents damaged and reset disconnected vents to idle.
  const allVentsDamaged = Array.from(existing.quenchVentRoundMap.values()).every(
    state => state === ventDamagedState,
  )
  const shouldRecoverLegacyVentState =
    existing.quenchVentRoundMap.size === fixedQuenchVentPlacements.length
    && allVentsDamaged

  if (shouldRecoverLegacyVentState) {
    const connectedVentKeys = new Set<string>()

    for (const placement of fixedQuenchVentPlacements) {
      const ventKey = keyFor(placement.row, placement.col)

      const hasAdjacentNetworkPipe = orthogonalDeltas.some(delta => {
        const neighborKey = keyFor(placement.row + delta.row, placement.col + delta.col)
        const neighborKind = existing.pipeMap.get(neighborKey)
        return Boolean(neighborKind && neighborKind !== 'quench-vent' && neighborKind !== 'broken')
      })

      if (hasAdjacentNetworkPipe) {
        connectedVentKeys.add(ventKey)
      }
    }

    const recoveredVentMap = new Map(existing.quenchVentRoundMap)
    for (const key of recoveredVentMap.keys()) {
      recoveredVentMap.set(key, connectedVentKeys.has(key) ? ventDamagedState : ventIdleState)
    }
    existing.quenchVentRoundMap = recoveredVentMap
  }

  return existing
}

function notifyListeners(): void {
  const store = getStore()
  const state = getGridState()
  for (const listener of store.listeners) {
    listener(state)
  }
}

export function subscribe(listener: GridListener): () => void {
  addListener(listener)
  return () => removeListener(listener)
}

export function broadcastGrid(): void {
  notifyListeners()
}

function getGridState(): GridState {
  const store = getStore()
  const damagedVentKeys = getDamagedVentKeySet(store.quenchVentRoundMap)
  store.portalLinks = prunePortalLinks(store.pipeMap, store.portalLinks)

  const tiles = Array.from(store.gridMap.values()).sort(sortGrid)
  const pipes = Array.from(store.pipeMap.entries())
    .map(([key, kind]) => {
      const { row, col } = parseKey(key)
      return { row, col, kind }
    })
    .sort(sortPipes)

  const portalEntrances: PortalNode[] = pipes
    .filter(p => p.kind === 'portal-entrance')
    .map(p => ({ row: p.row, col: p.col }))

  const portalExits: PortalNode[] = pipes
    .filter(p => p.kind === 'portal-exit')
    .map(p => ({ row: p.row, col: p.col }))

  // Auto-link the single IN/OUT portal pair (if both exist).
  const autoPortalLinkByEntrance = new Map<string, string>()
  if (portalEntrances.length > 0 && portalExits.length > 0) {
    const entranceKey = keyFor(portalEntrances[0].row, portalEntrances[0].col)
    const exitKey = keyFor(portalExits[0].row, portalExits[0].col)
    autoPortalLinkByEntrance.set(entranceKey, exitKey)
  }

  // Calculate water flow from water sources
  const activePipeKeys = new Set<string>()
  const activeVentKeys = new Set<string>()
  const ventSprayTileKeys = new Set<string>()
  
  // BFS from each water source
  const waterSourceTiles = tiles.filter(t => t.type === 'water-source')
  const visited = new Set<string>()
  const queue: string[] = []
  
  // Start from each water source
  for (const source of waterSourceTiles) {
    const sourceKey = keyFor(source.row, source.col)
    queue.push(sourceKey)
  }
  
  while (queue.length > 0) {
    const currentKey = queue.shift()!
    if (visited.has(currentKey)) continue
    visited.add(currentKey)
    
    const { row, col } = parseKey(currentKey)
    const pipe = store.pipeMap.get(currentKey)
    const tile = store.gridMap.get(currentKey)
    
    // If it's a quench-vent, mark it as active vent (not as a pipe)
    if (pipe === 'quench-vent') {
      const isActive = !damagedVentKeys.has(currentKey)
      if (isActive) {
        activeVentKeys.add(currentKey)
        // Mark surrounding tiles (orthogonal + diagonal) as being sprayed.
        const sprayDeltas = [
          { row: -1, col: -1 },
          { row: -1, col: 0 },
          { row: -1, col: 1 },
          { row: 0, col: -1 },
          { row: 0, col: 1 },
          { row: 1, col: -1 },
          { row: 1, col: 0 },
          { row: 1, col: 1 },
        ]
        for (const delta of sprayDeltas) {
          const sprayKey = keyFor(row + delta.row, col + delta.col)
          const sprayTile = store.gridMap.get(sprayKey)
          if (sprayTile && sprayTile.type !== 'bedrock') {
            ventSprayTileKeys.add(sprayKey)
          }
        }
      }
    } else if (pipe) {
      // Handle regular pipes
      if (pipe === 'broken') continue
      
      activePipeKeys.add(currentKey)
      
      // Handle portals - follow to exit
      if (pipe === 'portal-entrance') {
        const exitKey = autoPortalLinkByEntrance.get(currentKey)
        if (exitKey && !visited.has(exitKey)) {
          queue.push(exitKey)
        }
        continue
      }
      
      // Get connections from this pipe and continue flow
      const connections = getConnections(pipe)
      for (const dir of connections) {
        const delta = deltas[dir]
        const nextKey = keyFor(row + delta.row, col + delta.col)
        
        if (visited.has(nextKey)) continue
        
        const nextPipe = store.pipeMap.get(nextKey)
        const nextTile = store.gridMap.get(nextKey)
        
        // Water can flow to adjacent water sources and pipes
        if (nextTile) {
          if (nextTile.type === 'water-source') {
            // Water can flow into water source - but don't continue
            visited.add(nextKey)
          } else if (nextPipe === 'quench-vent') {
            // Water can activate quench vents
            queue.push(nextKey)
          } else if (nextPipe && nextPipe !== 'broken') {
            // Check if the next pipe connects back in the opposite direction
            const oppositeDir = opposite[dir]
            const nextConnections = getConnections(nextPipe)
            if (nextConnections.includes(oppositeDir)) {
              queue.push(nextKey)
            }
          }
        }
      }
    } else if (tile?.type === 'water-source') {
      // From water source, look for adjacent pipes
      for (const dir of ['top', 'right', 'bottom', 'left'] as const) {
        const delta = deltas[dir]
        const adjacentKey = keyFor(row + delta.row, col + delta.col)
        
        if (visited.has(adjacentKey)) continue
        
        const adjacentPipe = store.pipeMap.get(adjacentKey)
        const adjacentConnections = adjacentPipe ? getConnections(adjacentPipe) : []
        
        // Water source connects to pipes that face it
        const oppositeDir = opposite[dir]
        if (adjacentPipe && adjacentConnections.includes(oppositeDir)) {
          queue.push(adjacentKey)
        }
      }
  }
  }
  
  const flow: FlowState = {
    activePipeKeys: Array.from(activePipeKeys),
    activeVentKeys: Array.from(activeVentKeys),
    ventSprayTileKeys: Array.from(ventSprayTileKeys),
    damagedVentKeys: Array.from(damagedVentKeys),
  }

  // Convert auto portal links to array for client rendering.
  const portalLinks: PortalLink[] = Array.from(autoPortalLinkByEntrance.entries()).map(([entranceKey, exitKey]) => ({
    entranceKey,
    exitKey,
  }))

  return {
    tiles,
    pipes,
    flow,
    portalEntrances,
    portalExits,
    portalLinks,
    roundEvent: store.latestRoundEvent,
    round: store.round,
    palette: store.palette,
    tileBank: store.tileBank,
  }
}

function canPlacePipeAt(row: number, col: number, kind: PipeKind, pipeMap: Map<string, PipeKind>, gridMap: Map<string, GridTile>): boolean {
  const key = keyFor(row, col)

  // Only one portal IN and one portal OUT can exist on the board.
  if (kind === 'portal-entrance') {
    const alreadyHasEntrance = Array.from(pipeMap.values()).some(existing => existing === 'portal-entrance')
    if (alreadyHasEntrance) return false
  }
  if (kind === 'portal-exit') {
    const alreadyHasExit = Array.from(pipeMap.values()).some(existing => existing === 'portal-exit')
    if (alreadyHasExit) return false
  }

  // Already has pipe
  if (pipeMap.has(key)) return false

  // Tile must exist
  const tile = gridMap.get(key)
  if (!tile) return false

  // Can't place on bedrock
  if (tile.type === 'bedrock') return false

  // For non-portal pipes, need at least one adjacent connection (to a pipe or water-source)
  if (kind !== 'portal-entrance' && kind !== 'portal-exit' && kind !== 'broken') {
    const connections = getConnections(kind)
    const hasConnection = connections.some(dir => {
      const delta = deltas[dir]
      const neighborKey = keyFor(row + delta.row, col + delta.col)
      const neighborTile = gridMap.get(neighborKey)
      
      // Can connect to water-source tiles
      if (neighborTile?.type === 'water-source') return true
      
      // Or can connect to pipes with matching connections
      const neighbor = pipeMap.get(neighborKey)
      if (!neighbor) return false
      if (neighbor === 'quench-vent') return false
      const neighborConnections = getConnections(neighbor)
      return neighborConnections.includes(opposite[dir])
    })
    if (!hasConnection) return false
  }

  // OUT portal must be adjacent to bedrock
  if (kind === 'portal-exit') {
    const hasBedrock = orthogonalDeltas.some(delta => {
      const neighborKey = keyFor(row + delta.row, col + delta.col)
      const neighbor = gridMap.get(neighborKey)
      return neighbor?.type === 'bedrock'
    })
    if (!hasBedrock) return false
  }

  return true
}

export function placePipe(row: number, col: number, kind: PipeKind, source: PlacementSource): boolean {
  const store = getStore()

  if (!canPlacePipeAt(row, col, kind, store.pipeMap, store.gridMap)) {
    return false
  }

  const key = keyFor(row, col)
  store.pipeMap.set(key, kind)

  if (source === 'palette') {
    const index = store.palette.indexOf(kind)
    if (index > -1) {
      store.palette.splice(index, 1)
    }
    // placing from palette clears bank
    store.tileBank = null
  }

  if (source === 'bank') {
    if (store.tileBank !== kind) return false
    store.tileBank = null
  }

  // If we placed a portal, mark it as seen
  if (kind === 'portal-entrance') {
    store.hasSeenPortalEntrance = true
  }
  if (kind === 'portal-exit') {
    store.hasSeenPortalExit = true
  }

  notifyListeners()
  return true
}

export function deletePipe(row: number, col: number): boolean {
  const store = getStore()
  const key = keyFor(row, col)
  const existing = store.pipeMap.get(key)

  if (!existing) return false
  if (fixedQuenchVentKeys.has(key)) return false

  store.pipeMap.delete(key)
  if (existing === 'portal-entrance') {
    store.portalLinks.delete(key)
  }
  if (existing === 'portal-exit') {
    for (const [entranceKey, exitKey] of Array.from(store.portalLinks.entries())) {
      if (exitKey === key) {
        store.portalLinks.delete(entranceKey)
      }
    }
  }

  notifyListeners()
  return true
}

export function bankTile(pipeKind: PipeKind): boolean {
  const store = getStore()

  // If there's already a banked tile, it's discarded (removed from game)
  const index = store.palette.indexOf(pipeKind)
  if (index < 0) return false

  store.palette.splice(index, 1)
  store.tileBank = pipeKind

  notifyListeners()
  return true
}

export function linkPortal(entranceRow: number, entranceCol: number, exitRow: number, exitCol: number): boolean {
  const store = getStore()
  const entranceKey = keyFor(entranceRow, entranceCol)
  const exitKey = keyFor(exitRow, exitCol)

  // Both must exist and be portals
  const entranceKind = store.pipeMap.get(entranceKey)
  const exitKind = store.pipeMap.get(exitKey)

  if (entranceKind !== 'portal-entrance' || exitKind !== 'portal-exit') {
    return false
  }

  store.portalLinks.set(entranceKey, exitKey)
  notifyListeners()
  return true
}

export function endRound(): void {
  const store = getStore()
  const currentState = getGridState()
  const activeVentKeySet = new Set(currentState.flow.activeVentKeys)
  store.round += 1
  store.palette = createRoundPalette(store.round, store.hasSeenPortalEntrance, store.hasSeenPortalExit)
  if (store.palette.includes('portal-entrance')) {
    store.hasSeenPortalEntrance = true
  }
  if (store.palette.includes('portal-exit')) {
    store.hasSeenPortalExit = true
  }
  store.tileBank = null

  // Trickster Old God event roll each round.
  const roll = Math.random()
  if (roll < 0.10) {
    // Help chance: reduce heat usually, very rare magical item message.
    if (Math.random() < 0.01) {
      store.latestRoundEvent = {
        outcome: 'help',
        effect: 'magic-item',
        headline: 'The Old Gods Help',
        message: 'The Gods award your persistance with a magic item, the DM will help you find out what the item is.',
      }
    } else {
      store.latestRoundEvent = {
        outcome: 'help',
        effect: 'reduce-heat',
        headline: 'The Old Gods Help',
        message: 'A cool blessing tempers the room. Heat reduced by 1.',
      }
    }
  } else if (roll < 0.35) {
    // Hinder chance: break one random placed non-fixed pipe.
    const breakableKeys = Array.from(store.pipeMap.entries())
      .filter(([key, kind]) => (
        !fixedQuenchVentKeys.has(key)
        && kind !== 'quench-vent'
        && kind !== 'broken'
        && kind !== 'portal-entrance'
        && kind !== 'portal-exit'
      ))
      .map(([key]) => key)

    if (breakableKeys.length > 0) {
      const randomKey = breakableKeys[Math.floor(Math.random() * breakableKeys.length)]
      store.pipeMap.set(randomKey, 'broken')
      store.portalLinks = prunePortalLinks(store.pipeMap, store.portalLinks)

      const { row, col } = parseKey(randomKey)
      store.latestRoundEvent = {
        outcome: 'hinder',
        effect: 'break-pipe',
        headline: 'The Old Gods Hinder',
        message: `A trickster curse shatters a pipe at ${row},${col}.`,
      }
    } else {
      store.latestRoundEvent = {
        outcome: 'hinder',
        effect: 'none',
        headline: 'The Old Gods Hinder',
        message: 'The Gods tried to sabotage your work, but found nothing to break.',
      }
    }
  } else {
    store.latestRoundEvent = {
      outcome: 'nothing',
      effect: 'none',
      headline: 'The Gods Are Too Busy To Care',
      message: 'No omen stirs this round.',
    }
  }

  // Update quench vents. Only consecutive active rounds should count toward breaking.
  const newVentRoundMap = new Map(store.quenchVentRoundMap)
  for (const [key, state] of newVentRoundMap) {
    if (state === ventDamagedState) {
      continue
    }

    if (!activeVentKeySet.has(key)) {
      newVentRoundMap.set(key, ventIdleState)
      continue
    }

    if (state === ventIdleState) {
      newVentRoundMap.set(key, ventActiveRounds)
    } else if (state === ventActiveRounds) {
      // After two consecutive active rounds, the vent breaks permanently.
      newVentRoundMap.set(key, ventDamagedState)
    }
  }
  store.quenchVentRoundMap = newVentRoundMap

  notifyListeners()
}

export function resetGridState(): void {
  const listeners = new Set(getStore().listeners)
  writeGlobalStore(createStore(listeners))
  notifyListeners()
}

export function addListener(listener: GridListener): void {
  getStore().listeners.add(listener)
}

export function removeListener(listener: GridListener): void {
  getStore().listeners.delete(listener)
}

export { getGridState, getStore }
