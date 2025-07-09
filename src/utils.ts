import { JWTToken } from './types'

/**
 * Decode JWT token payload without verification
 * @param token JWT token string
 * @returns Decoded payload object
 */
export function decodeJWT(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format')
    }

    const payload = parts[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid JWT token format') {
      throw error
    }
    throw new Error('Failed to decode JWT token')
  }
}

/**
 * Extract expiration time from JWT token
 * @param token JWT token string
 * @returns Expiration timestamp in milliseconds
 */
export function getTokenExpiration(token: string): number {
  const payload = decodeJWT(token)
  if (!payload.exp) {
    throw new Error('Token does not contain expiration time')
  }

  // Convert from seconds to milliseconds
  return payload.exp * 1000
}

/**
 * Create a JWTToken object from a token string
 * @param token JWT token string
 * @returns JWTToken object with token and expiration
 */
export function createJWTToken(token: string): JWTToken {
  return {
    token,
    expiresAt: getTokenExpiration(token)
  }
}

/**
 * Check if a token is expired or will expire soon
 * @param token JWTToken object
 * @param bufferMs Buffer time in milliseconds to consider token expired early
 * @returns True if token is expired or will expire within buffer time
 */
export function isTokenExpired(token: JWTToken, bufferMs: number = 0): boolean {
  const now = Date.now()
  return now >= (token.expiresAt - bufferMs)
}

/**
 * Validate that a token string is properly formatted
 * @param token Token string to validate
 * @returns True if token appears to be valid JWT format
 */
export function isValidJWTFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false
  }

  const parts = token.split('.')
  return parts.length === 3 && parts.every(part => part.length > 0)
}