import { getGridState, linkPortal } from '../store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PortalLinkBody {
  entranceRow?: unknown
  entranceCol?: unknown
  exitRow?: unknown
  exitCol?: unknown
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as PortalLinkBody

  if (
    !isNumber(body.entranceRow)
    || !isNumber(body.entranceCol)
    || !isNumber(body.exitRow)
    || !isNumber(body.exitCol)
  ) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const linked = linkPortal(body.entranceRow, body.entranceCol, body.exitRow, body.exitCol)
  if (!linked) {
    return Response.json({ error: 'Portal link is invalid' }, { status: 400 })
  }

  return Response.json(getGridState())
}
