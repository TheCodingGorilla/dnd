import { bankTile, getGridState, type PipeKind } from '../store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface BankBody {
  pipeKind?: unknown
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

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as BankBody

  if (!isPipeKind(body.pipeKind)) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const banked = bankTile(body.pipeKind)
  if (!banked) {
    return Response.json({ error: 'Tile cannot be banked' }, { status: 400 })
  }

  return Response.json(getGridState())
}
