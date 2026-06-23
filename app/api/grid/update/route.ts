import { getGridState, placePipe, type PipeKind, type PlacementSource } from '../store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface UpdateBody {
  row?: unknown
  col?: unknown
  pipeKind?: unknown
  source?: unknown
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPipeKind(value: unknown): value is PipeKind {
  return (
    value === 'horizontal' ||
    value === 'vertical' ||
    value === 'corner-left-bottom' ||
    value === 'corner-right-bottom' ||
    value === 'corner-right-top' ||
    value === 'corner-left-top' ||
    value === 't-open-top' ||
    value === 't-open-bottom' ||
    value === 't-open-left' ||
    value === 't-open-right' ||
    value === 'cross' ||
    value === 'broken' ||
    value === 'quench-vent' ||
    value === 'portal-entrance' ||
    value === 'portal-exit'
  )
}

function isPlacementSource(value: unknown): value is PlacementSource {
  return value === 'palette' || value === 'bank'
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as UpdateBody

  if (!isNumber(body.row) || !isNumber(body.col) || !isPipeKind(body.pipeKind)) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const source: PlacementSource = isPlacementSource(body.source) ? body.source : 'palette'

  const placement = placePipe(body.row, body.col, body.pipeKind, source)
  if (!placement) {
    return Response.json({ error: 'Tile cannot accept a pipe' }, { status: 400 })
  }

  return Response.json(getGridState())
}
