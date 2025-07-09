import {
  decodeJWT,
  getTokenExpiration,
  createJWTToken,
  isTokenExpired,
  isValidJWTFormat
} from '../utils'

import { ONE_HOUR_IN_MS, ONE_HOUR_IN_SECONDS, TO_MS } from './constants'

// Mock JWT token for testing (expires in 1 hour)
const mockHeader = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
const mockJWTPayload = { exp: Math.floor(Date.now() / TO_MS) + ONE_HOUR_IN_SECONDS, sub: 'user123' }
const mockJWTToken = `${mockHeader}.${btoa(JSON.stringify(mockJWTPayload))}.signature`

describe('Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('decodeJWT', () => {
    it('should decode a valid JWT token', () => {
      const decoded = decodeJWT(mockJWTToken)
      expect(decoded.sub).toBe('user123')
      expect(decoded.exp).toBe(mockJWTPayload.exp)
    })

    it('should throw error for invalid JWT format', () => {
      expect(() => decodeJWT('invalid.token')).toThrow('Invalid JWT token format')
      expect(() => decodeJWT('invalid')).toThrow('Invalid JWT token format')
    })

    it('should throw error for invalid base64', () => {
      expect(() => decodeJWT('header.invalid-base64.signature')).toThrow('Failed to decode JWT token')
    })
  })

  describe('getTokenExpiration', () => {
    it('should extract expiration time from JWT', () => {
      const expiration = getTokenExpiration(mockJWTToken)
      expect(expiration).toBe(mockJWTPayload.exp * TO_MS)
    })

    it('should throw error if token has no expiration', () => {
      const noExpToken = `${mockHeader}.${btoa(JSON.stringify({ sub: 'user' }))}.signature`
      expect(() => getTokenExpiration(noExpToken)).toThrow('Token does not contain expiration time')
    })
  })

  describe('createJWTToken', () => {
    it('should create JWTToken object', () => {
      const jwtToken = createJWTToken(mockJWTToken)
      expect(jwtToken.token).toBe(mockJWTToken)
      expect(jwtToken.expiresAt).toBe(mockJWTPayload.exp * TO_MS)
    })
  })

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const futureExp = Date.now() + ONE_HOUR_IN_MS
      const token = { token: 'test', expiresAt: futureExp }
      expect(isTokenExpired(token)).toBe(false)
    })

    it('should return true for expired token', () => {
      const pastExp = Date.now() - ONE_HOUR_IN_MS
      const token = { token: 'test', expiresAt: pastExp }
      expect(isTokenExpired(token)).toBe(true)
    })

    it('should consider buffer time', () => {
      const nearExp = Date.now() + 30 * TO_MS
      const token = { token: 'test', expiresAt: nearExp }
      expect(isTokenExpired(token, 60 * TO_MS)).toBe(true)
      expect(isTokenExpired(token, 10 * TO_MS)).toBe(false)
    })
  })

  describe('isValidJWTFormat', () => {
    it('should return true for valid JWT format', () => {
      expect(isValidJWTFormat('header.payload.signature')).toBe(true)
    })

    it('should return false for invalid formats', () => {
      expect(isValidJWTFormat('invalid')).toBe(false)
      expect(isValidJWTFormat('header.payload')).toBe(false)
      expect(isValidJWTFormat('header..signature')).toBe(false)
      expect(isValidJWTFormat('')).toBe(false)
      expect(isValidJWTFormat(null as any)).toBe(false)
      expect(isValidJWTFormat(undefined as any)).toBe(false)
    })
  })
})