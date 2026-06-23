import { deletePipe, getGridState } from '../store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface DeleteBody {
  row?: unknown
  col?: unknown
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as DeleteBody

  if (!isNumber(body.row) || !isNumber(body.col)) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const deleted = deletePipe(body.row, body.col)
  if (!deleted) {
    return Response.json({ error: 'Tile cannot be deleted' }, { status: 400 })
  }

  return Response.json(getGridState())
}
