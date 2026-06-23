import { getGridState, resetGridState } from '../store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(): Promise<Response> {
  resetGridState()
  return Response.json(getGridState())
}
