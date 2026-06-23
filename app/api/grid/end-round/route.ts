import { endRound, getGridState } from '../store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(): Promise<Response> {
  endRound()
  return Response.json(getGridState())
}
