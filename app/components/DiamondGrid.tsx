'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { type GridTile, type TileType } from '@/app/utils/gridConfig'

const TILE_SIZE = 96
const TILE_MARGIN = 2
const GRID_PADDING = 16
const KONAMI_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'] as const

type PipeKind =
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

type Direction = 'top' | 'right' | 'bottom' | 'left'
type PlacementSource = 'palette'
type DragSource = PlacementSource | 'delete'

interface PipePlacement {
  row: number
  col: number
  kind: PipeKind
}

interface PortalNode {
  row: number
  col: number
}

interface PortalLink {
  entranceKey: string
  exitKey: string
}

interface FlowState {
  activePipeKeys: string[]
  activeVentKeys: string[]
  ventSprayTileKeys: string[]
  damagedVentKeys: string[]
}

type RoundEventOutcome = 'help' | 'hinder' | 'nothing'
type RoundEventEffect = 'reduce-heat' | 'magic-item' | 'break-pipe' | 'none'

interface RoundEvent {
  outcome: RoundEventOutcome
  effect: RoundEventEffect
  headline: string
  message: string
}

interface PaletteEntry {
  kind: PipeKind
  brokenOriginalKind?: PipeKind
}

interface GridApiState {
  tiles: GridTile[]
  pipes: PipePlacement[]
  flow: FlowState
  portalEntrances: PortalNode[]
  portalExits: PortalNode[]
  portalLinks: PortalLink[]
  roundEvent: RoundEvent | null
  round: number
  palette: PaletteEntry[]
  brokenPipeKinds?: Array<[string, PipeKind]>
}

function isGridApiState(payload: unknown): payload is GridApiState {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as Partial<GridApiState>
  return Array.isArray(value.tiles) && Array.isArray(value.pipes)
}

function normalizeGridStatePayload(payload: unknown): GridApiState | null {
  if (isGridApiState(payload)) return payload
  if (payload && typeof payload === 'object' && 'tiles' in payload) {
    const nested = (payload as { tiles?: unknown }).tiles
    if (isGridApiState(nested)) return nested
  }
  return null
}

interface PipeOption {
  kind: PipeKind
  label: string
  symbol: string
  brokenOriginalKind?: PipeKind
}

interface DragState {
  pipeKind: PipeKind
  brokenOriginalKind?: PipeKind
  symbol: string
  source: DragSource
  paletteIndex: number | null
  x: number
  y: number
  hoveredTileKey: string | null
  isOverGrid: boolean
}

interface PortalLinkDragState {
  fromExitKey: string
  cursorX: number
  cursorY: number
  hoveredEntranceKey: string | null
}

const pipeOptions: PipeOption[] = [
  { kind: 'horizontal', label: 'Horizontal Pipe', symbol: '─' },
  { kind: 'vertical', label: 'Vertical Pipe', symbol: '│' },
  { kind: 'corner-left-bottom', label: 'Left Bottom Corner', symbol: '┐' },
  { kind: 'corner-right-bottom', label: 'Right Bottom Corner', symbol: '┌' },
  { kind: 'corner-right-top', label: 'Right Top Corner', symbol: '└' },
  { kind: 'corner-left-top', label: 'Left Top Corner', symbol: '┘' },
  { kind: 't-open-top', label: 'T Open Top', symbol: '┴' },
  { kind: 't-open-bottom', label: 'T Open Bottom', symbol: '┬' },
  { kind: 't-open-left', label: 'T Open Left', symbol: '┤' },
  { kind: 't-open-right', label: 'T Open Right', symbol: '├' },
  { kind: 'cross', label: 'Cross Pipe', symbol: '┼' },
  { kind: 'broken', label: 'Broken Pipe', symbol: 'X' },
  { kind: 'portal-entrance', label: 'Portal Entrance', symbol: 'IN' },
  { kind: 'portal-exit', label: 'Portal Exit', symbol: 'OUT' },
  { kind: 'quench-vent', label: 'Quench Vent', symbol: 'Q' },
]

const pipeSymbolByKind: Record<PipeKind, string> = Object.fromEntries(
  pipeOptions.map(option => [option.kind, option.symbol]),
) as Record<PipeKind, string>

const pipeOptionByKind: Record<PipeKind, PipeOption> = Object.fromEntries(
  pipeOptions.map(option => [option.kind, option]),
) as Record<PipeKind, PipeOption>

function keyFor(row: number, col: number): string {
  return `${row},${col}`
}

const directions: Direction[] = ['top', 'right', 'bottom', 'left']
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
    case 'portal-entrance':
    case 'portal-exit':
    case 'quench-vent':
      return ['top', 'right', 'bottom', 'left']
    case 'broken':
    default:
      return []
  }
}

function getTileColors(type: TileType): { bg: string; border: string; text: string } {
  switch (type) {
    case 'lava':         return { bg: '#ff6b35', border: '#ff4500', text: '#fff' }
    case 'water-source': return { bg: '#7a5e32', border: '#5d4a2f', text: '#efe6d6' }
    case 'molten-gold':  return { bg: '#FFC107', border: '#FF8F00', text: '#333' }
    case 'bedrock':      return { bg: '#3d2f1f', border: '#2a1f10', text: '#8B7355' }
    case 'empty':        return { bg: '#231b12', border: '#16100a', text: '#d6c6ac' }
    default:             return { bg: '#3d2f1f', border: '#2a1f10', text: '#8B7355' }
  }
}

const SPRITE_IMAGE_URL = "url('/tile-sprites.png')"
const WATER_TILE_IMAGE_URL = "url('/water.png')"
const LAVA_TILE_IMAGE_URL = "url('/lava.png')"
const CLOSED_Q_IMAGE_URL = "url('/closed-q.png')"
const PIPE_SPRITE_DEFAULT_SIZE = '486px 294px'

// Default atlas geometry for entries that do not need manual per-sprite overrides.
const PIPE_SPRITE_X_START = -2
const PIPE_SPRITE_Y_START = -1
const PIPE_SPRITE_X_STEP = 95
const PIPE_SPRITE_Y_STEP = 98
const pipeSpriteAt = (col: number, row: number): string =>
  `${PIPE_SPRITE_X_START - (col * PIPE_SPRITE_X_STEP)}px ${PIPE_SPRITE_Y_START - (row * PIPE_SPRITE_Y_STEP)}px`

type SpriteConfig = {
  position: string
  size?: string
}

const PIPE_SPRITE_CONFIG: Record<PipeKind, SpriteConfig> = {
  horizontal: { position: '-2px -1px', size: '486px 294px' },
  vertical: { position: pipeSpriteAt(0, 0) },
  'corner-left-top': { position: pipeSpriteAt(1, 0) },
  'corner-left-bottom': { position: pipeSpriteAt(1, 0) },
  'corner-right-top': { position: pipeSpriteAt(1, 0) },
  'corner-right-bottom': { position: pipeSpriteAt(1, 0) },
  't-open-left': { position: '-192px -1px' },
  't-open-right': { position: '-193px -2px' },
  't-open-top': { position: '-192px -1px' },
  't-open-bottom': { position: '-192px 0px' },
  cross: { position: '-288px -1px' },
  broken: { position: '-386px -1px' },
  'quench-vent': { position: '-3px -192px', size: '486px 294px' },
  'portal-entrance': { position: pipeSpriteAt(3, 1) },
  'portal-exit': { position: '-387px -98px' },
}

const BROKEN_PIPE_SPRITE_CONFIG: Record<PipeKind, string | undefined> = {
  horizontal: undefined,
  vertical: '-386px -2px',
  // Base broken corner is "right-bottom"; other corners rotate from this sprite.
  'corner-left-top': '-1px -97px',
  'corner-left-bottom': '-1px -97px',
  'corner-right-top': '-1px -97px',
  'corner-right-bottom': '-1px -97px',
  // Base broken T is "down"; other T directions rotate from this sprite.
  't-open-left': '-99px -97px',
  't-open-right': '-99px -97px',
  't-open-top': '-99px -97px',
  't-open-bottom': '-99px -97px',
  cross: '-194px -98px',
  broken: '-386px -1px',
  'quench-vent': undefined,
  'portal-entrance': undefined,
  'portal-exit': undefined,
}

const BEDROCK_SPRITE_CONFIG: SpriteConfig = {
  position: '-292px -192px',
  size: '486px 294px',
}

const ROOM_SPRITE_CONFIG: SpriteConfig = {
  position: '-194px -192px',
  size: '486px 294px',
}

function getSpriteBackgroundPosition(pipeKind: PipeKind | undefined, type: TileType, brokenPipeKinds?: Map<string, PipeKind>, tileKey?: string): { backgroundImage: string; backgroundPosition: string; backgroundSize: string; backgroundRepeat: string } | null {
  if (pipeKind) {
    // If this is a broken pipe, use the broken sprite for its original kind
    if (pipeKind === 'broken' && brokenPipeKinds && tileKey) {
      const originalKind = brokenPipeKinds.get(tileKey)
      if (originalKind && originalKind !== 'broken') {
        const brokenPosition = BROKEN_PIPE_SPRITE_CONFIG[originalKind]
        if (brokenPosition) {
          return {
            backgroundImage: SPRITE_IMAGE_URL,
            backgroundPosition: brokenPosition,
            backgroundSize: PIPE_SPRITE_DEFAULT_SIZE,
            backgroundRepeat: 'no-repeat',
          }
        }
      }
    }
    
    const config = PIPE_SPRITE_CONFIG[pipeKind]
    return {
      backgroundImage: SPRITE_IMAGE_URL,
      backgroundPosition: config.position,
      backgroundSize: config.size ?? PIPE_SPRITE_DEFAULT_SIZE,
      backgroundRepeat: 'no-repeat',
    }
  }

  // Base tiles with sprites
  if (type === 'normal') {
    return {
      backgroundImage: SPRITE_IMAGE_URL,
      backgroundPosition: ROOM_SPRITE_CONFIG.position,
      backgroundSize: ROOM_SPRITE_CONFIG.size ?? PIPE_SPRITE_DEFAULT_SIZE,
      backgroundRepeat: 'no-repeat',
    }
  }

  if (type === 'bedrock') {
    return {
      backgroundImage: SPRITE_IMAGE_URL,
      backgroundPosition: BEDROCK_SPRITE_CONFIG.position,
      backgroundSize: BEDROCK_SPRITE_CONFIG.size ?? PIPE_SPRITE_DEFAULT_SIZE,
      backgroundRepeat: 'no-repeat'
    }
  }

  if (type === 'water-source') {
    return {
      backgroundImage: WATER_TILE_IMAGE_URL,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
    }
  }

  if (type === 'molten-gold') {
    return {
      backgroundImage: LAVA_TILE_IMAGE_URL,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
    }
  }

  return null
}

function getSpriteRotation(pipeKind: PipeKind | undefined): string | undefined {
  if (!pipeKind) return undefined
  switch (pipeKind) {
    case 'vertical':
      return 'rotate(90deg)'
    case 'corner-right-bottom':
      return undefined
    case 'corner-left-bottom':
      return 'rotate(90deg)'
    case 'corner-left-top':
      return 'rotate(180deg)'
    case 'corner-right-top':
      return 'rotate(270deg)'
    case 't-open-bottom':
      return undefined
    case 't-open-left':
      return 'rotate(90deg)'
    case 't-open-top':
      return 'rotate(180deg)'
    case 't-open-right':
      return 'rotate(270deg)'
    default:
      return undefined
  }
}

interface GridTileProps {
  row: number
  col: number
  type: TileType
  pipeKind?: PipeKind
  brokenPipeKinds: Map<string, PipeKind>
  isFlowActive: boolean
  isVentActive: boolean
  isVentSprayAdjacent: boolean
  isDamagedVent: boolean
  isValidDropSlot: boolean
  isDropTarget: boolean
}

const GridTileView: React.FC<GridTileProps> = ({ row, col, type, pipeKind, brokenPipeKinds, isFlowActive, isVentActive, isVentSprayAdjacent, isDamagedVent, isValidDropSlot, isDropTarget }) => {
  const colors = getTileColors(type)
  const isQuenchVent = pipeKind === 'quench-vent'
  const tileKey = keyFor(row, col)
  const originalBrokenKind = pipeKind === 'broken' ? brokenPipeKinds.get(tileKey) : undefined
  const brokenOriginalRotation =
    pipeKind === 'broken' && originalBrokenKind
      ? getSpriteRotation(originalBrokenKind)
      : undefined
  const spriteStyle = isQuenchVent
    ? (isDamagedVent
      ? {
          backgroundImage: CLOSED_Q_IMAGE_URL,
          backgroundPosition: 'center',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
        }
      : isVentActive
        ? getSpriteBackgroundPosition(pipeKind, type, brokenPipeKinds, tileKey)
        : {
            backgroundImage: SPRITE_IMAGE_URL,
            backgroundPosition: '-100px -192px',
            backgroundSize: PIPE_SPRITE_DEFAULT_SIZE,
            backgroundRepeat: 'no-repeat',
          })
    : getSpriteBackgroundPosition(pipeKind, type, brokenPipeKinds, tileKey)
  const usesAtlasSprite = Boolean(pipeKind || type === 'normal' || type === 'bedrock')
  const spriteRotation = brokenOriginalRotation ?? getSpriteRotation(pipeKind)
  const hasPlacedPipe = Boolean(pipeKind)
  const showEmptySlotOverlay = type === 'empty' && !hasPlacedPipe
  const canAcceptPipe = (type === 'normal' || type === 'empty') && !isQuenchVent
  const quenchBackground = isDamagedVent ? '#7f1d1d' : '#8B6F47'
  
  return (
    <div
      className={`absolute flex items-center justify-center rounded select-none text-xs font-mono overflow-hidden${type === 'bedrock' ? ' pointer-events-none' : ' cursor-default'}`}
      data-tile-key={tileKey}
      data-row={row}
      data-col={col}
      data-can-accept-pipe={canAcceptPipe ? 'true' : 'false'}
      style={{
        top: GRID_PADDING + row * (TILE_SIZE + TILE_MARGIN),
        left: GRID_PADDING + col * (TILE_SIZE + TILE_MARGIN),
        width: TILE_SIZE,
        height: TILE_SIZE,
        backgroundColor: spriteStyle ? 'transparent' : (isQuenchVent ? quenchBackground : colors.bg),
        border: isDropTarget
          ? '1px solid #d4a85a'
          : isValidDropSlot
            ? '1px solid #FFD700'
            : 'none',
        backgroundImage: spriteStyle ? spriteStyle.backgroundImage : undefined,
        backgroundPosition: spriteStyle ? spriteStyle.backgroundPosition : undefined,
        backgroundSize: spriteStyle ? spriteStyle.backgroundSize : undefined,
        backgroundRepeat: spriteStyle ? spriteStyle.backgroundRepeat : undefined,
        imageRendering: spriteStyle && usesAtlasSprite ? 'pixelated' : undefined,
        transform: spriteStyle && spriteRotation ? spriteRotation : undefined,
        transformOrigin: spriteStyle && spriteRotation ? 'center' : undefined,
        boxShadow: hasPlacedPipe
          ? undefined
          : isDropTarget
          ? '0 0 10px rgba(212, 168, 90, 0.95), inset 0 0 6px rgba(212, 168, 90, 0.35)'
          : isValidDropSlot
            ? '0 0 9px rgba(255, 215, 0, 0.65), inset 0 0 5px rgba(255, 215, 0, 0.25)'
          : isDamagedVent
            ? '0 0 11px rgba(248, 113, 113, 0.65), inset 0 0 8px rgba(127, 29, 29, 0.55)'
          : isVentActive
            ? '0 0 10px rgba(212, 168, 90, 0.95), inset 0 0 8px rgba(230, 194, 116, 0.45)'
          : isFlowActive
            ? '0 0 8px rgba(201, 146, 52, 0.9)'
            : undefined,
        color: isQuenchVent ? '#062f36' : colors.text,
      }}
    >
      {showEmptySlotOverlay ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 1,
            opacity: 0.1,
            backgroundImage: SPRITE_IMAGE_URL,
            backgroundPosition: ROOM_SPRITE_CONFIG.position,
            backgroundSize: ROOM_SPRITE_CONFIG.size ?? PIPE_SPRITE_DEFAULT_SIZE,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />
      ) : null}

      {isVentSprayAdjacent ? (
        <div className="vent-water-overlay" aria-hidden="true" />
      ) : null}

      {isQuenchVent && isDamagedVent ? (
        <div className="disabled-q-cross" aria-hidden="true" />
      ) : null}

      {pipeKind === 'broken' ? (
        <div className="disabled-q-cross" aria-hidden="true" />
      ) : null}

      {pipeKind && !spriteStyle ? (
        <span
          className="font-bold"
          style={{
            color: isQuenchVent ? (isDamagedVent ? '#fecaca' : isVentActive ? '#efe6d6' : '#3d3020') : isVentActive ? '#efe6d6' : isFlowActive ? '#efe6d6' : '#efe6d6',
            textShadow: isFlowActive ? '0 0 6px rgba(212, 168, 90, 0.85)' : 'none',
          }}
        >
          {pipeSymbolByKind[pipeKind]}
        </span>
      ) : null}
    </div>
  )
}

function getPipePreviewStyle(kind: PipeKind, brokenOriginalKind?: PipeKind): React.CSSProperties {
  if (kind === 'broken' && brokenOriginalKind) {
    const brokenPosition = BROKEN_PIPE_SPRITE_CONFIG[brokenOriginalKind]
    if (brokenPosition) {
      return {
        backgroundImage: SPRITE_IMAGE_URL,
        backgroundPosition: brokenPosition,
        backgroundSize: PIPE_SPRITE_DEFAULT_SIZE,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        transform: getSpriteRotation(brokenOriginalKind),
        transformOrigin: getSpriteRotation(brokenOriginalKind) ? 'center' : undefined,
      }
    }
  }

  const config = PIPE_SPRITE_CONFIG[kind]
  return {
    backgroundImage: SPRITE_IMAGE_URL,
    backgroundPosition: config.position,
    backgroundSize: config.size ?? PIPE_SPRITE_DEFAULT_SIZE,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    transform: getSpriteRotation(kind),
    transformOrigin: getSpriteRotation(kind) ? 'center' : undefined,
  }
}

async function sendPipeUpdate(
  row: number,
  col: number,
  pipeKind: PipeKind,
  source: PlacementSource,
  brokenOriginalKind?: PipeKind,
): Promise<GridApiState | null> {
  const response = await fetch('/api/grid/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col, pipeKind, source, brokenOriginalKind }),
  })
  if (!response.ok) return null
  try {
    const payload = await response.json()
    return normalizeGridStatePayload(payload)
  } catch {
    return null
  }
}

async function sendDeletePipe(row: number, col: number): Promise<GridApiState | null> {
  const response = await fetch('/api/grid/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row, col }),
  })
  if (!response.ok) return null
  try {
    const payload = await response.json()
    return normalizeGridStatePayload(payload)
  } catch {
    return null
  }
}

async function sendEndRound(): Promise<GridApiState | null> {
  const response = await fetch('/api/grid/end-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) return null
  return normalizeGridStatePayload(await response.json())
}

async function sendResetState(): Promise<GridApiState | null> {
  const response = await fetch('/api/grid/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) return null
  return normalizeGridStatePayload(await response.json())
}

async function sendPortalLink(entranceRow: number, entranceCol: number, exitRow: number, exitCol: number): Promise<boolean> {
  const response = await fetch('/api/grid/portal-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entranceRow, entranceCol, exitRow, exitCol }),
  })
  return response.ok
}

const DiamondGrid: React.FC = () => {
  const [tiles, setTiles] = useState<GridTile[]>([])
  const [pipesByKey, setPipesByKey] = useState<Map<string, PipeKind>>(new Map())
  const [brokenPipeKinds, setBrokenPipeKinds] = useState<Map<string, PipeKind>>(new Map())
  const [flow, setFlow] = useState<FlowState>({ activePipeKeys: [], activeVentKeys: [], ventSprayTileKeys: [], damagedVentKeys: [] })
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [round, setRound] = useState(1)
  const [heatLevel, setHeatLevel] = useState(0)
  const [activePlayerIndex, setActivePlayerIndex] = useState(0)
  const [magicItemCount, setMagicItemCount] = useState(0)
  const [showRoundAnnouncement, setShowRoundAnnouncement] = useState(false)
  const [roundAnnouncementTitle, setRoundAnnouncementTitle] = useState('')
  const [roundAnnouncementText, setRoundAnnouncementText] = useState('')
  const [roundAnnouncementOutcome, setRoundAnnouncementOutcome] = useState<RoundEventOutcome>('nothing')
  const [showHeatWarning, setShowHeatWarning] = useState(false)
  const [heatWarningText, setHeatWarningText] = useState('')
  const [showHeatRoundLockWarning, setShowHeatRoundLockWarning] = useState(false)
  const [pendingEndRoundAfterHeatWarning, setPendingEndRoundAfterHeatWarning] = useState(false)
  const [isResetUnlocked, setIsResetUnlocked] = useState(false)
  const [roundPipeOptions, setRoundPipeOptions] = useState<PipeOption[]>([])
  const [portalLinks, setPortalLinks] = useState<PortalLink[]>([])
  const [portalLinkDrag, setPortalLinkDrag] = useState<PortalLinkDragState | null>(null)
  const [isLoadingState, setIsLoadingState] = useState(true)
  const [gridZoom, setGridZoom] = useState(1)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const gridViewportRef = useRef<HTMLDivElement | null>(null)
  const gridPanRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startScrollLeft: number
    startScrollTop: number
  } | null>(null)
  const hasCenteredOnSourceRef = useRef(false)
  const previousRoundRef = useRef<number | null>(null)
  const heatLevelRef = useRef(0)
  const heatWarningStartTimeoutRef = useRef<number | null>(null)
  const heatWarningTimeoutRef = useRef<number | null>(null)
  const moveAudioRef = useRef<HTMLAudioElement | null>(null)
  const slotAudioRef = useRef<HTMLAudioElement | null>(null)
  const bombAudioRef = useRef<HTMLAudioElement | null>(null)
  const laughingGodAudioRef = useRef<HTMLAudioElement | null>(null)
  const audioUnlockedRef = useRef(false)
  const movePlayingRef = useRef(false)
  const konamiIndexRef = useRef(0)
  const [isPanningGrid, setIsPanningGrid] = useState(false)

  const playerLabels = ['Player 1', 'Player 2', 'Player 3', 'Player 4'] as const

  const roundAnnouncementImageByOutcome: Record<RoundEventOutcome, { src: string; alt: string }> = {
    hinder: { src: '/laughing-god.png', alt: 'Laughing god' },
    nothing: { src: '/busy-god.png', alt: 'Busy god' },
    help: { src: '/pleased-god.png', alt: 'Pleased god' },
  }

  const applyState = (state: GridApiState) => {
    const nextRoundEvent = state.roundEvent ?? null
    const previousRound = previousRoundRef.current
    const nextRound = state.round

    if (previousRound === null) {
      previousRoundRef.current = nextRound
    } else if (nextRound < previousRound) {
      previousRoundRef.current = nextRound
      heatLevelRef.current = 0
      setHeatLevel(0)
      setActivePlayerIndex(0)
      setMagicItemCount(0)
      setShowRoundAnnouncement(false)
      setRoundAnnouncementOutcome('nothing')
      setShowHeatWarning(false)
      setShowHeatRoundLockWarning(false)
      setPendingEndRoundAfterHeatWarning(false)
      if (heatWarningStartTimeoutRef.current !== null) {
        window.clearTimeout(heatWarningStartTimeoutRef.current)
        heatWarningStartTimeoutRef.current = null
      }
      if (heatWarningTimeoutRef.current !== null) {
        window.clearTimeout(heatWarningTimeoutRef.current)
        heatWarningTimeoutRef.current = null
      }
    } else if (nextRound > previousRound) {
      const roundDelta = nextRound - previousRound
      let nextHeatLevel = heatLevelRef.current + roundDelta

      if (nextRoundEvent?.effect === 'reduce-heat') {
        nextHeatLevel = Math.max(0, nextHeatLevel - 1)
      }
      if (nextRoundEvent?.effect === 'magic-item') {
        setMagicItemCount(count => count + 1)
      }

      heatLevelRef.current = nextHeatLevel
      setHeatLevel(nextHeatLevel)

      const announcementTitle = nextRoundEvent?.headline ?? 'The Gods Are Too Busy To Care'
      const announcementText = nextRoundEvent?.message ?? 'No omen stirs this round.'
      const announcementOutcome = nextRoundEvent?.outcome ?? 'nothing'
      setRoundAnnouncementTitle(announcementTitle)
      setRoundAnnouncementText(announcementText)
      setRoundAnnouncementOutcome(announcementOutcome)
      setShowRoundAnnouncement(true)
      if (announcementOutcome === 'hinder') {
        playLaughingGodSound()
      }

      if (nextHeatLevel > 5) {
        setHeatWarningText('You are succumbing to the heat of the room and must leave before you perish!')
        setShowHeatWarning(false)
        if (heatWarningStartTimeoutRef.current !== null) {
          window.clearTimeout(heatWarningStartTimeoutRef.current)
          heatWarningStartTimeoutRef.current = null
        }
        if (heatWarningTimeoutRef.current !== null) {
          window.clearTimeout(heatWarningTimeoutRef.current)
          heatWarningTimeoutRef.current = null
        }
        heatWarningStartTimeoutRef.current = window.setTimeout(() => {
          setShowHeatWarning(true)
          heatWarningStartTimeoutRef.current = null
          heatWarningTimeoutRef.current = window.setTimeout(() => {
            setShowHeatWarning(false)
            heatWarningTimeoutRef.current = null
          }, 2500)
        }, 2550)
      }

      previousRoundRef.current = nextRound
    }

    setTiles(state.tiles)
    setFlow(state.flow)
    setRound(nextRound)
    setPortalLinks(Array.isArray(state.portalLinks) ? state.portalLinks : [])
    setBrokenPipeKinds(new Map(state.brokenPipeKinds || []))
    setRoundPipeOptions(
      state.palette
        .map(entry => {
          const kind = typeof entry === 'string' ? entry : entry.kind
          const baseOption = pipeOptionByKind[kind]
          if (!baseOption) return null
          if (kind !== 'broken') return baseOption

          const brokenOriginalKind = typeof entry === 'string' ? undefined : entry.brokenOriginalKind
          const brokenLabel = brokenOriginalKind
            ? `Broken ${pipeOptionByKind[brokenOriginalKind]?.label ?? 'Pipe'}`
            : 'Broken Pipe'

          return {
            ...baseOption,
            label: brokenLabel,
            brokenOriginalKind,
          }
        })
        .filter((option): option is PipeOption => Boolean(option && option.kind !== 'quench-vent')),
    )
    setPipesByKey(
      new Map(state.pipes.map(pipe => [keyFor(pipe.row, pipe.col), pipe.kind])),
    )
    setIsLoadingState(false)
  }

  const handleSwitchPlayer = () => {
    setActivePlayerIndex(current => (current + 1) % playerLabels.length)
    heatLevelRef.current = 0
    setHeatLevel(0)
    setShowHeatWarning(false)
    setShowHeatRoundLockWarning(false)
    setPendingEndRoundAfterHeatWarning(false)
    if (heatWarningStartTimeoutRef.current !== null) {
      window.clearTimeout(heatWarningStartTimeoutRef.current)
      heatWarningStartTimeoutRef.current = null
    }
    if (heatWarningTimeoutRef.current !== null) {
      window.clearTimeout(heatWarningTimeoutRef.current)
      heatWarningTimeoutRef.current = null
    }
  }

  const unlockAudio = () => {
    if (audioUnlockedRef.current) return
    audioUnlockedRef.current = true

    const sounds = [moveAudioRef.current, slotAudioRef.current, bombAudioRef.current, laughingGodAudioRef.current]
    sounds.forEach(sound => {
      if (!sound) return
      try {
        sound.muted = true
        sound.currentTime = 0
        const playPromise = sound.play()
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              sound.pause()
              sound.currentTime = 0
              sound.muted = false
            })
            .catch(() => {
              sound.muted = false
            })
        } else {
          sound.pause()
          sound.currentTime = 0
          sound.muted = false
        }
      } catch {
        sound.muted = false
      }
    })
  }

  const playTileMoveSound = () => {
    const sound = moveAudioRef.current
    if (!sound || movePlayingRef.current) return
    movePlayingRef.current = true
    sound.currentTime = 0
    sound.play().catch(() => {
      movePlayingRef.current = false
    })
  }

  const stopTileMoveSound = () => {
    const sound = moveAudioRef.current
    if (!sound || !movePlayingRef.current) return
    movePlayingRef.current = false
    sound.pause()
    sound.currentTime = 0
  }

  const playTileSlotSound = () => {
    const sound = slotAudioRef.current
    if (!sound) return
    stopTileMoveSound()
    sound.pause()
    sound.currentTime = 0
    sound.volume = 0.5
    sound.play().catch(() => {})
  }

  const playBombSound = () => {
    const sound = bombAudioRef.current
    if (!sound) return
    stopTileMoveSound()
    sound.pause()
    sound.currentTime = 0
    sound.play().catch(() => {})
  }

  const playLaughingGodSound = () => {
    const sound = laughingGodAudioRef.current
    if (!sound) return
    sound.pause()
    sound.currentTime = 0
    sound.play().catch(() => {})
  }

  useEffect(() => {
    const moveAudio = new Audio('/tile-move.wav')
    moveAudio.volume = 0.1
    moveAudio.loop = true
    moveAudioRef.current = moveAudio

    const slotAudio = new Audio('/tile-slot.wav')
    slotAudio.volume = 0.5
    slotAudio.preload = 'auto'
    slotAudioRef.current = slotAudio

    const bombAudio = new Audio('/bomb.mp3')
    bombAudio.volume = 0.6
    bombAudio.preload = 'auto'
    bombAudioRef.current = bombAudio

    const laughingGodAudio = new Audio('/laughing-god.mp3')
    laughingGodAudio.volume = 0.6
    laughingGodAudio.preload = 'auto'
    laughingGodAudioRef.current = laughingGodAudio

    return () => {
      stopTileMoveSound()
      moveAudioRef.current = null
      slotAudioRef.current = null
      bombAudioRef.current = null
      laughingGodAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    let eventSource: EventSource | null = null

    const loadInitialGrid = async () => {
      try {
        const response = await fetch('/api/grid', { cache: 'no-store' })
        const data = (await response.json()) as GridApiState
        if (Array.isArray(data.tiles) && Array.isArray(data.pipes)) {
          applyState(data)
        }
      } catch {
        // Keep loading state if server is unavailable.
      }
    }

    void loadInitialGrid()

    eventSource = new EventSource('/api/grid/stream')
    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data) as GridApiState
        if (Array.isArray(data.tiles) && Array.isArray(data.pipes)) {
          applyState(data)
        }
      } catch {
        // Ignore malformed stream messages.
      }
    }

    return () => {
      eventSource?.close()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (heatWarningStartTimeoutRef.current !== null) {
        window.clearTimeout(heatWarningStartTimeoutRef.current)
      }
      if (heatWarningTimeoutRef.current !== null) {
        window.clearTimeout(heatWarningTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isResetUnlocked) return

      const target = event.target as HTMLElement | null
      if (
        target
        && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable
        )
      ) {
        return
      }

      const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const expectedKey = KONAMI_SEQUENCE[konamiIndexRef.current]

      if (normalizedKey === expectedKey) {
        konamiIndexRef.current += 1
        if (konamiIndexRef.current === KONAMI_SEQUENCE.length) {
          setIsResetUnlocked(true)
          konamiIndexRef.current = 0
        }
        return
      }

      konamiIndexRef.current = normalizedKey === KONAMI_SEQUENCE[0] ? 1 : 0
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isResetUnlocked])

  const { containerWidth, containerHeight } = useMemo(() => {
    const maxCol = tiles.reduce((max, t) => Math.max(max, t.col), 0)
    const maxRow = tiles.reduce((max, t) => Math.max(max, t.row), 0)
    return {
      containerWidth: GRID_PADDING * 2 + (maxCol + 1) * (TILE_SIZE + TILE_MARGIN),
      containerHeight: GRID_PADDING * 2 + (maxRow + 1) * (TILE_SIZE + TILE_MARGIN),
    }
  }, [tiles])

  useEffect(() => {
    if (isLoadingState || hasCenteredOnSourceRef.current) return

    const viewport = gridViewportRef.current
    const firstSource = tiles.find(tile => tile.type === 'water-source')
    if (!viewport || !firstSource) return

    const centerX = GRID_PADDING + firstSource.col * (TILE_SIZE + TILE_MARGIN) + TILE_SIZE / 2
    const centerY = GRID_PADDING + firstSource.row * (TILE_SIZE + TILE_MARGIN) + TILE_SIZE / 2

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const targetLeft = Math.max(0, Math.min(maxScrollLeft, centerX - viewport.clientWidth / 2))
    const targetTop = Math.max(0, Math.min(maxScrollTop, centerY - viewport.clientHeight / 2))

    viewport.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' })
    hasCenteredOnSourceRef.current = true
  }, [isLoadingState, tiles, containerWidth, containerHeight])

  const placePipe = async (
    row: number,
    col: number,
    pipeKind: PipeKind,
    source: PlacementSource,
    brokenOriginalKind?: PipeKind,
  ): Promise<GridApiState | null> => {
    const targetTile = tiles.find(tile => tile.row === row && tile.col === col)
    if (!targetTile || !(targetTile.type === 'normal' || targetTile.type === 'empty')) return null

    if (pipeKind === 'portal-exit') {
      const hasAdjacentBedrock = orthogonalDeltas.some(delta =>
        tiles.some(neighbor =>
          neighbor.row === row + delta.row
          && neighbor.col === col + delta.col
          && neighbor.type === 'bedrock',
        ),
      )
      if (!hasAdjacentBedrock) return null
    }

    return sendPipeUpdate(row, col, pipeKind, source, brokenOriginalKind)
  }

  const endRoundNow = async () => {
    const nextState = await sendEndRound()
    if (nextState) {
      applyState(nextState)
    }
  }

  const handleEndRound = async () => {
    if (heatLevelRef.current === 4) {
      setShowHeatRoundLockWarning(true)
      setPendingEndRoundAfterHeatWarning(true)
      return
    }
    await endRoundNow()
  }

  const handleDismissHeatRoundLockWarning = async () => {
    setShowHeatRoundLockWarning(false)
    if (!pendingEndRoundAfterHeatWarning) return
    setPendingEndRoundAfterHeatWarning(false)
    await endRoundNow()
  }

  const handleResetState = async () => {
    const nextState = await sendResetState()
    if (nextState) {
      applyState(nextState)
    }
  }

  const zoomPercent = Math.round(gridZoom * 100)

  const adjustGridZoom = (delta: number) => {
    setGridZoom(current => {
      const next = Number((current + delta).toFixed(2))
      return Math.min(1.8, Math.max(0.6, next))
    })
  }

  const resetGridZoom = () => {
    setGridZoom(1)
  }

  const clientToGridPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: (clientX - rect.left) / gridZoom,
      y: (clientY - rect.top) / gridZoom,
    }
  }

  const handleGridViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    const target = event.target as HTMLElement | null
    const startedOnInteractive = Boolean(target?.closest('button, input, textarea, select, [role="button"], [data-no-grid-pan="true"]'))
    if (startedOnInteractive) return

    const viewport = gridViewportRef.current
    if (!viewport) return

    gridPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    }
    setIsPanningGrid(true)
    viewport.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handleGridViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = gridPanRef.current
    const viewport = gridViewportRef.current
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return

    const deltaX = event.clientX - pan.startClientX
    const deltaY = event.clientY - pan.startClientY
    viewport.scrollLeft = pan.startScrollLeft - deltaX
    viewport.scrollTop = pan.startScrollTop - deltaY
    event.preventDefault()
  }

  const endGridViewportPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = gridPanRef.current
    const viewport = gridViewportRef.current
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
    gridPanRef.current = null
    setIsPanningGrid(false)
  }

  const handleGridViewportWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const viewport = gridViewportRef.current
    if (!viewport) return

    if (!event.ctrlKey) {
      return
    }

    event.preventDefault()

    const rect = viewport.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const zoomDelta = -event.deltaY * 0.0025

    setGridZoom(current => {
      const next = Math.min(1.8, Math.max(0.6, Number((current + zoomDelta).toFixed(2))))
      if (next === current) return current

      const worldX = (viewport.scrollLeft + cursorX) / current
      const worldY = (viewport.scrollTop + cursorY) / current

      window.requestAnimationFrame(() => {
        viewport.scrollLeft = worldX * next - cursorX
        viewport.scrollTop = worldY * next - cursorY
      })

      return next
    })
  }

  const getPortalDotPosition = (tileKey: string, kind: 'portal-entrance' | 'portal-exit'): { x: number; y: number } => {
    const [row, col] = tileKey.split(',').map(Number)
    const tileLeft = GRID_PADDING + col * (TILE_SIZE + TILE_MARGIN)
    const tileTop = GRID_PADDING + row * (TILE_SIZE + TILE_MARGIN)
    return {
      x: kind === 'portal-exit' ? tileLeft + TILE_SIZE + 3 : tileLeft - 3,
      y: tileTop + TILE_SIZE / 2,
    }
  }

  const buildPortalCurvePath = (from: { x: number; y: number }, to: { x: number; y: number }): string => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const bend = Math.min(120, Math.max(40, distance * 0.28))
    const cp1x = from.x + bend
    const cp1y = from.y - bend * 0.2
    const cp2x = to.x - bend
    const cp2y = to.y + bend * 0.2
    return `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`
  }

  const completePortalLinkToEntrance = async (entranceKey: string) => {
    if (!portalLinkDrag) return

    const [entranceRow, entranceCol] = entranceKey.split(',').map(Number)
    const [exitRow, exitCol] = portalLinkDrag.fromExitKey.split(',').map(Number)
    if (!Number.isFinite(entranceRow) || !Number.isFinite(entranceCol) || !Number.isFinite(exitRow) || !Number.isFinite(exitCol)) {
      setPortalLinkDrag(null)
      return
    }

    const linked = await sendPortalLink(entranceRow, entranceCol, exitRow, exitCol)
    if (linked) {
      playTileSlotSound()
    }
    setPortalLinkDrag(null)
  }

  useEffect(() => {
    if (!portalLinkDrag) return

    const handleMove = (event: PointerEvent) => {
      const point = clientToGridPoint(event.clientX, event.clientY)
      if (!point) return
      setPortalLinkDrag(current => current ? { ...current, cursorX: point.x, cursorY: point.y } : null)
    }

    const handleUp = () => {
      const hoveredEntranceKey = portalLinkDrag.hoveredEntranceKey
      if (hoveredEntranceKey) {
        void completePortalLinkToEntrance(hoveredEntranceKey)
        return
      }
      setPortalLinkDrag(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [portalLinkDrag])

  const buildValidDropKeySet = (pipeKind: PipeKind, source: DragSource): Set<string> => {
    const keys = new Set<string>()
    if (source === 'delete') {
      for (const [tileKey, kind] of pipesByKey.entries()) {
        if (kind !== 'quench-vent') {
          keys.add(tileKey)
        }
      }
      return keys
    }

    const draggedConnections = new Set(getConnections(pipeKind))

    const sourceKeySet = new Set(
      tiles
        .filter(tile => tile.type === 'water-source')
        .map(tile => keyFor(tile.row, tile.col)),
    )

    if (pipeKind === 'portal-exit') {
      for (const tile of tiles) {
        const tileKey = keyFor(tile.row, tile.col)
        const pipe = pipesByKey.get(tileKey)
        const isQuenchVent = pipe === 'quench-vent'
        const canAcceptPipe = (tile.type === 'normal' || tile.type === 'empty') && !isQuenchVent
        if (!canAcceptPipe) continue
        if (pipe) continue
        const hasAdjacentBedrock = orthogonalDeltas.some(delta =>
          tiles.some(neighbor =>
            neighbor.row === tile.row + delta.row
            && neighbor.col === tile.col + delta.col
            && neighbor.type === 'bedrock',
          ),
        )
        if (!hasAdjacentBedrock) continue
        keys.add(tileKey)
      }
      return keys
    }

    if (pipeKind === 'portal-entrance') {
      const hasExistingEntrance = Array.from(pipesByKey.values()).some(kind => kind === 'portal-entrance')
      if (hasExistingEntrance) return keys
    }

    for (const tile of tiles) {
      const tileKey = keyFor(tile.row, tile.col)
      const pipe = pipesByKey.get(tileKey)
      const isQuenchVent = pipe === 'quench-vent'
      const canAcceptPipe = (tile.type === 'normal' || tile.type === 'empty') && !isQuenchVent
      if (!canAcceptPipe) continue
      if (pipe) continue

      if (pipeKind === 'broken') continue

      let hasMatchedOpenConnection = false
      let hasMatchedBuildConnection = false
      let hasMismatch = false

      for (const dir of directions) {
        const delta = deltas[dir]
        const neighborKey = keyFor(tile.row + delta.row, tile.col + delta.col)
        const neighborPipeKind = pipesByKey.get(neighborKey)
        const isNeighborSource = sourceKeySet.has(neighborKey)
        if (neighborPipeKind === 'quench-vent') continue
        if (!neighborPipeKind && !isNeighborSource) continue

        const thisOpen = draggedConnections.has(dir)
        const neighborOpen = isNeighborSource
          ? true
          : getConnections(neighborPipeKind as PipeKind).includes(opposite[dir])

        if (thisOpen !== neighborOpen) {
          hasMismatch = true
          break
        }

        if (thisOpen && neighborOpen) {
          hasMatchedOpenConnection = true
          hasMatchedBuildConnection = true
        }
      }

      if (!hasMismatch && hasMatchedOpenConnection && hasMatchedBuildConnection) {
        keys.add(tileKey)
      }
    }

    return keys
  }

  const findDropTarget = (clientX: number, clientY: number, validKeys: Set<string>): { key: string; row: number; col: number } | null => {
    const elements = document.elementsFromPoint(clientX, clientY)
    for (const element of elements) {
      const tileElement = element as HTMLElement
      const tileKey = tileElement.dataset.tileKey
      if (!tileKey) continue
      if (tileElement.dataset.canAcceptPipe !== 'true') return null
      if (!validKeys.has(tileKey)) return null

      const row = Number(tileElement.dataset.row)
      const col = Number(tileElement.dataset.col)
      if (!Number.isFinite(row) || !Number.isFinite(col)) return null
      return { key: tileKey, row, col }
    }
    return null
  }

  const isPointerOverGridTile = (clientX: number, clientY: number): boolean => {
    const elements = document.elementsFromPoint(clientX, clientY)
    return elements.some(element => {
      const el = element as HTMLElement
      return (
        (typeof el.dataset.tileKey === 'string' && el.dataset.tileKey.length > 0)
        || el.dataset.gridDropZone === 'true'
      )
    })
  }

  const startPipeDrag = (option: PipeOption, source: DragSource, paletteIndex: number | null, startX: number, startY: number) => {
    unlockAudio()
    playTileMoveSound()

    const dragValidDropKeys = buildValidDropKeySet(option.kind, source)

    setDragState({
      pipeKind: option.kind,
        brokenOriginalKind: option.brokenOriginalKind,
      symbol: option.symbol,
      source,
      paletteIndex,
      x: startX,
      y: startY,
      hoveredTileKey: null,
      isOverGrid: false,
    })

    const handlePointerMove = (event: PointerEvent) => {
      const isOverGrid = isPointerOverGridTile(event.clientX, event.clientY)
      const target = findDropTarget(event.clientX, event.clientY, dragValidDropKeys)
      setDragState(current =>
        current
          ? {
              ...current,
              x: event.clientX,
              y: event.clientY,
              hoveredTileKey: target ? target.key : null,
              isOverGrid,
            }
          : null,
      )
    }

    const finishDrag = (event: PointerEvent) => {
      stopTileMoveSound()

      const target = findDropTarget(event.clientX, event.clientY, dragValidDropKeys)

      if (source === 'delete' && target) {
        void (async () => {
          const nextState = await sendDeletePipe(target.row, target.col)
          if (nextState) {
            applyState(nextState)
            playBombSound()
          }
        })()
      } else if (target) {
        void (async () => {
          const nextState = await placePipe(
            target.row,
            target.col,
            option.kind,
            source as PlacementSource,
            option.brokenOriginalKind,
          )
          if (nextState) {
            applyState(nextState)
            playTileSlotSound()
          }
        })()
      }

      setDragState(null)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
  }

  const validDropKeySet = useMemo(() => {
    if (!dragState) return new Set<string>()
    return buildValidDropKeySet(dragState.pipeKind, dragState.source)
  }, [dragState, tiles, pipesByKey, flow.damagedVentKeys])

  const activePipeKeySet = useMemo(() => new Set(flow.activePipeKeys), [flow.activePipeKeys])
  const activeVentKeySet = useMemo(() => new Set(flow.activeVentKeys), [flow.activeVentKeys])
  const ventSprayTileKeySet = useMemo(() => new Set(flow.ventSprayTileKeys), [flow.ventSprayTileKeys])
  const damagedVentKeySet = useMemo(() => new Set(flow.damagedVentKeys), [flow.damagedVentKeys])
  const waterSourceKeySet = useMemo(
    () => new Set(tiles.filter(tile => tile.type === 'water-source').map(tile => keyFor(tile.row, tile.col))),
    [tiles],
  )
  const visibleFlowKeySet = useMemo(() => {
    if (activePipeKeySet.size > 0) {
      return new Set<string>([...Array.from(activePipeKeySet), ...Array.from(activeVentKeySet)])
    }
    return new Set(
      Array.from(pipesByKey.entries())
        .filter(([, kind]) => kind !== 'broken')
        .map(([key]) => key),
    )
  }, [activePipeKeySet, activeVentKeySet, pipesByKey])

  const parseTileKey = (key: string): { row: number; col: number } | null => {
    const [rowText, colText] = key.split(',')
    const row = Number(rowText)
    const col = Number(colText)
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    return { row, col }
  }

  const activeFlowSegments = useMemo(() => {
    const segments: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = []
    const directionFromTo = (fromKey: string, toKey: string): Direction | null => {
      const from = parseTileKey(fromKey)
      const to = parseTileKey(toKey)
      if (!from || !to) return null
      const rowDelta = to.row - from.row
      const colDelta = to.col - from.col
      if (rowDelta === -1 && colDelta === 0) return 'top'
      if (rowDelta === 1 && colDelta === 0) return 'bottom'
      if (rowDelta === 0 && colDelta === -1) return 'left'
      if (rowDelta === 0 && colDelta === 1) return 'right'
      return null
    }

    const centerFor = (row: number, col: number) => ({
      x: GRID_PADDING + col * (TILE_SIZE + TILE_MARGIN) + TILE_SIZE / 2,
      y: GRID_PADDING + row * (TILE_SIZE + TILE_MARGIN) + TILE_SIZE / 2,
    })

    const canFlowBetween = (fromKey: string, toKey: string): boolean => {
      const dir = directionFromTo(fromKey, toKey)
      if (!dir) return false

      const fromIsSource = waterSourceKeySet.has(fromKey)
      const toIsSource = waterSourceKeySet.has(toKey)
      // Sources should feed connected pipes, not draw flow links to each other.
      if (fromIsSource && toIsSource) return false

      const fromConnections = fromIsSource
        ? directions
        : (() => {
            const fromKind = pipesByKey.get(fromKey)
            if (!fromKind || fromKind === 'broken') return [] as Direction[]
            return getConnections(fromKind)
          })()

      const toConnections = toIsSource
        ? directions
        : (() => {
            const toKind = pipesByKey.get(toKey)
            if (!toKind || toKind === 'broken') return [] as Direction[]
            return getConnections(toKind)
          })()

      return fromConnections.includes(dir) && toConnections.includes(opposite[dir])
    }

    const connectedSourceKeys = new Set(
      Array.from(waterSourceKeySet).filter(sourceKey => {
        const source = parseTileKey(sourceKey)
        if (!source) return false
        return orthogonalDeltas.some(delta => {
          const neighborKey = keyFor(source.row + delta.row, source.col + delta.col)
          return visibleFlowKeySet.has(neighborKey) && canFlowBetween(sourceKey, neighborKey)
        })
      }),
    )

    const nodeKeys = new Set<string>([...Array.from(visibleFlowKeySet), ...Array.from(connectedSourceKeys)])
    const adjacency = new Map<string, Set<string>>()
    const ensureAdjacency = (key: string): Set<string> => {
      const existing = adjacency.get(key)
      if (existing) return existing
      const created = new Set<string>()
      adjacency.set(key, created)
      return created
    }

    for (const nodeKey of nodeKeys) {
      const tile = parseTileKey(nodeKey)
      if (!tile) continue
      for (const delta of orthogonalDeltas) {
        const neighborKey = keyFor(tile.row + delta.row, tile.col + delta.col)
        if (!nodeKeys.has(neighborKey)) continue
        if (!canFlowBetween(nodeKey, neighborKey)) continue
        ensureAdjacency(nodeKey).add(neighborKey)
        ensureAdjacency(neighborKey).add(nodeKey)
      }
    }

    const distance = new Map<string, number>()
    const queue: string[] = []
    for (const sourceKey of connectedSourceKeys) {
      distance.set(sourceKey, 0)
      queue.push(sourceKey)
    }

    while (queue.length > 0) {
      const currentKey = queue.shift()
      if (!currentKey) continue
      const currentDistance = distance.get(currentKey)
      if (currentDistance === undefined) continue

      for (const neighborKey of adjacency.get(currentKey) ?? []) {
        if (distance.has(neighborKey)) continue
        distance.set(neighborKey, currentDistance + 1)
        queue.push(neighborKey)
      }
    }

    const addDirectedSegment = (fromKey: string, toKey: string) => {
      const from = parseTileKey(fromKey)
      const to = parseTileKey(toKey)
      if (!from || !to) return

      const fromPoint = centerFor(from.row, from.col)
      const toPoint = centerFor(to.row, to.col)
      segments.push({
        x1: fromPoint.x,
        y1: fromPoint.y,
        x2: toPoint.x,
        y2: toPoint.y,
        key: `${fromKey}->${toKey}`,
      })
    }

    for (const [nodeKey, neighbors] of adjacency.entries()) {
      for (const neighborKey of neighbors) {
        if (nodeKey > neighborKey) continue
        const nodeDistance = distance.get(nodeKey) ?? Number.POSITIVE_INFINITY
        const neighborDistance = distance.get(neighborKey) ?? Number.POSITIVE_INFINITY

        if (nodeDistance === neighborDistance) {
          const node = parseTileKey(nodeKey)
          const neighbor = parseTileKey(neighborKey)
          if (!node || !neighbor) continue
          const nodeSort = node.row * 1000 + node.col
          const neighborSort = neighbor.row * 1000 + neighbor.col
          if (nodeSort <= neighborSort) {
            addDirectedSegment(nodeKey, neighborKey)
          } else {
            addDirectedSegment(neighborKey, nodeKey)
          }
          continue
        }

        if (nodeDistance < neighborDistance) {
          addDirectedSegment(nodeKey, neighborKey)
        } else {
          addDirectedSegment(neighborKey, nodeKey)
        }
      }
    }

    return segments
  }, [visibleFlowKeySet, waterSourceKeySet, pipesByKey])
  const activeFlowPoints = useMemo(() => {
    const points: Array<{ x: number; y: number; key: string }> = []
    const pointKeys = new Set<string>()
    const addPoint = (row: number, col: number, key: string) => {
      if (pointKeys.has(key)) return
      pointKeys.add(key)
      points.push({
        key,
        x: GRID_PADDING + col * (TILE_SIZE + TILE_MARGIN) + TILE_SIZE / 2,
        y: GRID_PADDING + row * (TILE_SIZE + TILE_MARGIN) + TILE_SIZE / 2,
      })
    }

    for (const key of visibleFlowKeySet) {
      const tile = parseTileKey(key)
      if (!tile) continue
      const row = tile.row
      const col = tile.col
      addPoint(row, col, key)
    }

    for (const sourceKey of waterSourceKeySet) {
      const source = parseTileKey(sourceKey)
      if (!source) continue
      const row = source.row
      const col = source.col

      const hasFlowNeighbor = orthogonalDeltas.some(delta => {
        const neighborKey = keyFor(row + delta.row, col + delta.col)
        if (!visibleFlowKeySet.has(neighborKey)) return false
        const neighborKind = pipesByKey.get(neighborKey)
        if (!neighborKind || neighborKind === 'broken') return false
        return getConnections(neighborKind).includes(opposite[
          delta.row === -1 ? 'top' : delta.row === 1 ? 'bottom' : delta.col === -1 ? 'left' : 'right'
        ])
      })

      if (hasFlowNeighbor) addPoint(row, col, sourceKey)
    }

    return points
  }, [visibleFlowKeySet, waterSourceKeySet, pipesByKey])

  const reservedGridWidth = Math.max(containerWidth, 1100)
  const reservedGridHeight = Math.max(containerHeight, 620)
  const heatPercent = Math.min(100, Math.round((heatLevel / 5) * 100))
  const roundAnnouncementImage = roundAnnouncementImageByOutcome[roundAnnouncementOutcome]

  return (
    <div className="h-dvh overflow-hidden box-border p-2 relative">
      {showRoundAnnouncement ? (
        <div className="round-event-overlay" aria-live="polite">
          <div className="round-event-banner">
            <img
              src={roundAnnouncementImage.src}
              alt={roundAnnouncementImage.alt}
              className="round-event-god-image"
            />
            <p className="round-event-title">{roundAnnouncementTitle}</p>
            <p className="round-event-text">{roundAnnouncementText}</p>
            <button
              type="button"
              onClick={() => setShowRoundAnnouncement(false)}
              className="round-event-dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {showHeatWarning ? (
        <>
          <div className="heat-danger-flash" aria-hidden="true" />
          <div className="heat-warning-overlay" aria-live="assertive">
            <div className="heat-warning-banner">{heatWarningText}</div>
          </div>
        </>
      ) : null}

      {showHeatRoundLockWarning ? (
        <div className="heat-round-lock-overlay" aria-live="assertive">
          <div className="heat-round-lock-banner">
            <img src="/too-hot.png" alt="Too hot warning" className="heat-round-lock-image" />
            <p className="heat-round-lock-title">Too Hot</p>
            <p className="heat-round-lock-text">You have 1 more round before you start taking damage.</p>
            <button
              type="button"
              onClick={() => {
                void handleDismissHeatRoundLockWarning()
              }}
              className="round-event-dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex h-full min-h-0 flex-col max-w-[1600px] gap-2">
        <div className="flex items-center justify-between rounded-lg border border-amber-700 bg-[#1a1410] p-2">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-amber-200">Round</p>
              <p className="text-xl font-bold" style={{ color: '#d4a85a' }}>{round}</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-amber-200">Active Player</p>
              <p className="text-lg font-bold" style={{ color: '#9ee4ff' }}>{playerLabels[activePlayerIndex]}</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-amber-200">Magic Items</p>
              <p className="text-lg font-bold" style={{ color: '#b8f7ff' }}>{magicItemCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-sm font-semibold text-amber-200">Heat</p>
              <div className="flex items-center gap-2">
                <div className="h-4 overflow-hidden rounded bg-[#2a1f14]" style={{ width: '200px' }}>
                  <div
                    className={`h-full transition-all duration-300 ${heatLevel > 5 ? 'bg-red-600' : 'bg-amber-500'}`}
                    style={{ width: `${heatPercent}%` }}
                  />
                </div>
                <p className="text-base font-bold" style={{ color: heatLevel > 5 ? '#f87171' : '#e6c274', minWidth: '32px' }}>{heatLevel}/5</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-amber-700 bg-[#2a1f14] px-2 py-1">
              <button
                onClick={() => adjustGridZoom(-0.1)}
                className="rounded border border-amber-700 bg-[#1a1410] px-2 text-sm font-bold text-amber-200 transition hover:border-amber-500 hover:text-amber-100"
                aria-label="Zoom out"
              >
                -
              </button>
              <button
                onClick={resetGridZoom}
                className="rounded border border-amber-700 bg-[#1a1410] px-2 text-xs font-semibold text-amber-200 transition hover:border-amber-500 hover:text-amber-100"
                aria-label="Reset zoom"
              >
                {zoomPercent}%
              </button>
              <button
                onClick={() => adjustGridZoom(0.1)}
                className="rounded border border-amber-700 bg-[#1a1410] px-2 text-sm font-bold text-amber-200 transition hover:border-amber-500 hover:text-amber-100"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <button
              onClick={handleSwitchPlayer}
              className="rounded-lg border border-sky-600 bg-sky-950 px-3 py-1.5 text-sm font-semibold text-sky-200 transition hover:border-sky-400 hover:bg-sky-900"
            >
              Switch Player
            </button>
            <button
              onClick={handleResetState}
              className="rounded-lg border border-amber-500 bg-amber-900 px-3 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-800 hover:text-amber-200"
            >
              Reset State
            </button>
            <button
              onClick={handleEndRound}
              className="rounded-lg px-4 py-1.5 text-sm font-semibold transition"
              style={{
                borderColor: '#d4a85a',
                backgroundColor: 'rgb(139, 111, 71)',
                color: '#e6c274',
                border: '1px solid #d4a85a'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(120, 95, 60)'
                e.currentTarget.style.color = '#f0e6d6'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(139, 111, 71)'
                e.currentTarget.style.color = '#e6c274'
              }}
            >
              End Round
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 w-full overflow-hidden rounded-lg border border-amber-700 bg-[#1a1410]">
          <div
            ref={gridViewportRef}
            className={`custom-scrollbar h-full w-full overflow-auto ${isPanningGrid ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
            onPointerDown={handleGridViewportPointerDown}
            onPointerMove={handleGridViewportPointerMove}
            onPointerUp={endGridViewportPan}
            onPointerCancel={endGridViewportPan}
            onWheel={handleGridViewportWheel}
          >
            <div className="mx-auto w-max">
              <div
                style={{
                  width: (isLoadingState ? reservedGridWidth : containerWidth) * gridZoom,
                  height: (isLoadingState ? reservedGridHeight : containerHeight) * gridZoom,
                }}
              >
                <div
                  ref={gridRef}
                  className="relative"
                  data-grid-drop-zone="true"
                  style={{
                    width: isLoadingState ? reservedGridWidth : containerWidth,
                    height: isLoadingState ? reservedGridHeight : containerHeight,
                    transform: `scale(${gridZoom})`,
                    transformOrigin: 'top left',
                  }}
                >
            {isLoadingState ? (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="w-full max-w-xl overflow-hidden rounded-lg border border-amber-700 bg-amber-900">
                  <div className="h-3 w-full animate-pulse bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
                </div>
              </div>
            ) : (
              tiles.map((tile, index) => (
                <GridTileView
                  key={`${tile.row}-${tile.col}-${index}`}
                  row={tile.row}
                  col={tile.col}
                  type={tile.type}
                  pipeKind={pipesByKey.get(keyFor(tile.row, tile.col))}
                  brokenPipeKinds={brokenPipeKinds}
                  isFlowActive={activePipeKeySet.has(keyFor(tile.row, tile.col))}
                  isVentActive={activeVentKeySet.has(keyFor(tile.row, tile.col))}
                  isVentSprayAdjacent={ventSprayTileKeySet.has(keyFor(tile.row, tile.col))}
                  isDamagedVent={damagedVentKeySet.has(keyFor(tile.row, tile.col))}
                  isValidDropSlot={Boolean(dragState) && validDropKeySet.has(keyFor(tile.row, tile.col))}
                  isDropTarget={dragState?.hoveredTileKey === keyFor(tile.row, tile.col)}
                />
              ))
            )}

            <svg
              className="absolute inset-0 pointer-events-none z-20"
              width={isLoadingState ? reservedGridWidth : containerWidth}
              height={isLoadingState ? reservedGridHeight : containerHeight}
              viewBox={`0 0 ${isLoadingState ? reservedGridWidth : containerWidth} ${isLoadingState ? reservedGridHeight : containerHeight}`}
            >
              {activeFlowSegments.map(segment => (
                <g key={segment.key}>
                  <line
                    x1={segment.x1}
                    y1={segment.y1}
                    x2={segment.x2}
                    y2={segment.y2}
                    className="flow-network-base"
                  />
                  <line
                    x1={segment.x1}
                    y1={segment.y1}
                    x2={segment.x2}
                    y2={segment.y2}
                    className="flow-network-dots"
                  />
                </g>
              ))}

              {activeFlowPoints.map(point => (
                <g key={`flow-dot-${point.key}`}>
                  <circle cx={point.x} cy={point.y} r={7} className="flow-node-glow" />
                  <circle cx={point.x} cy={point.y} r={3.5} className="flow-node-dot" />
                </g>
              ))}


              {portalLinks.map(link => {
                const from = getPortalDotPosition(link.entranceKey, 'portal-entrance')
                const to = getPortalDotPosition(link.exitKey, 'portal-exit')
                const path = buildPortalCurvePath(from, to)
                return (
                  <g key={`${link.exitKey}-${link.entranceKey}`}>
                    <path d={path} className="portal-link-string" />
                    <path d={path} className="portal-link-flow" />
                  </g>
                )
              })}
            </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <aside className="min-w-0 flex-1 rounded-lg border border-amber-700 bg-[#1a1410] p-2">
            <div className="custom-scrollbar max-h-24 overflow-auto pr-1">
              <div className="grid grid-cols-6 gap-1">
                {isLoadingState
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`palette-skeleton-${index}`}
                        className="h-24 w-24 rounded border border-amber-700 bg-amber-900 animate-pulse"
                      />
                    ))
                  : roundPipeOptions.map((option, index) => (
                      <div key={`${option.kind}-${index}`} className="relative h-24 w-24">
                        <button
                          type="button"
                          onPointerDown={event => {
                            event.preventDefault()
                            startPipeDrag(option, 'palette', index, event.clientX, event.clientY)
                          }}
                          className="relative flex h-24 w-24 items-end justify-center overflow-hidden rounded bg-amber-900 p-2 text-left text-amber-100 transition flex-col gap-1"
                          style={{
                            ...(dragState?.source === 'palette' && dragState.paletteIndex === index ? {
                              position: 'fixed',
                              left: dragState.x,
                              top: dragState.y,
                              transform: 'translate(-50%, -50%)',
                              width: dragState.isOverGrid ? TILE_SIZE * gridZoom : undefined,
                              height: dragState.isOverGrid ? TILE_SIZE * gridZoom : undefined,
                              zIndex: 1000,
                              pointerEvents: 'none',
                              boxShadow: '0 0 12px rgba(212,168,90,0.75)',
                              borderColor: '#d4a85a',
                            } : {}),
                          }}
                        >
                          <div
                            className="absolute inset-0"
                            style={{
                              backgroundColor: '#2a1f14',
                              ...getPipePreviewStyle(option.kind, option.brokenOriginalKind),
                            }}
                          />
                          {option.kind === 'broken' ? (
                            <div className="disabled-q-cross" aria-hidden="true" />
                          ) : null}
                        </button>
                      </div>
                    ))}
              </div>
            </div>
          </aside>

          <aside className="w-[120px] shrink-0 rounded-lg border border-amber-700 bg-[#1a1410] p-2">
            <div className="mx-auto h-24 w-24">
              <button
                type="button"
                onPointerDown={event => {
                  event.preventDefault()
                  startPipeDrag({ kind: 'broken', label: 'Destroy Pipe', symbol: '💣' }, 'delete', null, event.clientX, event.clientY)
                }}
                className="relative flex h-24 w-24 items-end justify-center overflow-hidden rounded border border-rose-600 bg-rose-950 p-2 text-rose-200 transition hover:border-rose-400 flex-col gap-1"
                style={dragState?.source === 'delete' ? {
                  position: 'fixed',
                  left: dragState.x,
                  top: dragState.y,
                  transform: 'translate(-50%, -50%)',
                  width: dragState.isOverGrid ? TILE_SIZE * gridZoom : undefined,
                  height: dragState.isOverGrid ? TILE_SIZE * gridZoom : undefined,
                  zIndex: 1000,
                  pointerEvents: 'none',
                  boxShadow: '0 0 12px rgba(251,113,133,0.75)',
                  borderColor: '#fb7185',
                } : undefined}
              >
                <img src="/bomb.png" alt="Destroy" className="absolute inset-0 h-full w-full object-cover" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default DiamondGrid
