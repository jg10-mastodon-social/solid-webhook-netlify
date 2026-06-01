import { getAuthenticatedFetch } from '@soid/core'
import type { SolidFetch } from './types.js'

export async function createSolidFetch(webId: string, issuer: string): Promise<SolidFetch> {
  return getAuthenticatedFetch(webId, issuer)
}