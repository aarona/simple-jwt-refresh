import { JWTManager } from '../jwt-manager'
import {
  JWTManagerConfig,
  JWTToken,
  TokenRefreshError,
  NoValidTokenError
} from '../types'

import { ONE_HOUR_AGO, ONE_HOUR_IN_MS, ONE_HOUR_IN_SECONDS, TO_MS, TWO_MINUTES_IN_MS } from './constants'

// Mock JWT tokens
const createMockToken = (expiresInMs: number) => {
  const exp = Math.floor((Date.now() + expiresInMs) / TO_MS)
  const payload = { exp, sub: 'user123' }
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))}.signature`
}

const mockAccessToken: JWTToken = {
  token: createMockToken(ONE_HOUR_IN_MS),
  expiresAt: Date.now() + ONE_HOUR_IN_MS
}

const mockExpiredToken: JWTToken = {
  token: createMockToken(ONE_HOUR_AGO),
  expiresAt: Date.now() - ONE_HOUR_IN_MS
}

describe('JWTManager', () => {
  let mockFetch: jest.Mock
  let config: JWTManagerConfig
  let manager: JWTManager

  beforeEach(() => {
    mockFetch = jest.fn()
    config = {
      refreshConfig: {
        url: 'https://api.example.com/auth/refresh',
        extractAccessToken: (response) => ({
          token: response.access_token,
          expiresAt: Date.now() + (response.expires_in * TO_MS)
        })
      },
      fetch: mockFetch
    }
  })

  afterEach(() => {
    if (manager) {
      manager.destroy()
    }
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  describe('constructor', () => {
    it('should create manager with valid config', () => {
      expect(() => new JWTManager(config)).not.toThrow()
    })

    it('should throw error for missing refresh URL', () => {
      const invalidConfig = { ...config }

      delete (invalidConfig.refreshConfig as any).url
      expect(() => new JWTManager(invalidConfig)).toThrow('Refresh URL is required')
    })

    it('should throw error for missing extractAccessToken function', () => {
      const invalidConfig = { ...config }

      delete (invalidConfig.refreshConfig as any).extractAccessToken
      expect(() => new JWTManager(invalidConfig)).toThrow('extractAccessToken function is required')
    })

    it('should use default values', () => {
      const minimalConfig = {
        refreshConfig: {
          url: 'https://api.example.com/refresh',
          extractAccessToken: () => mockAccessToken
        }
      }
      expect(() => new JWTManager(minimalConfig)).not.toThrow()
    })
  })

  describe('setAccessToken', () => {
    beforeEach(() => {
      manager = new JWTManager(config)
    })

    it('should set token from string', () => {
      const tokenString = createMockToken(ONE_HOUR_IN_MS)
      manager.setAccessToken(tokenString)

      const currentToken = manager.getCurrentAccessToken()
      expect(currentToken?.token).toBe(tokenString)
    })

    it('should set token from JWTToken object', () => {
      manager.setAccessToken(mockAccessToken)

      const currentToken = manager.getCurrentAccessToken()
      expect(currentToken).toEqual(mockAccessToken)
    })

    it('should throw error for invalid token format', () => {
      expect(() => manager.setAccessToken('invalid-token')).toThrow('Invalid JWT token format')
    })
  })

  describe('getAccessToken', () => {
    beforeEach(() => {
      manager = new JWTManager(config)
    })

    it('should return access token when valid', async () => {
      manager.setAccessToken(mockAccessToken)

      const token = await manager.getAccessToken()
      expect(token).toBe(mockAccessToken.token)
    })

    it('should refresh token when expired', async () => {
      const newTokenString = createMockToken(ONE_HOUR_IN_MS)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newTokenString,
          expires_in: 3600
        })
      })

      manager.setAccessToken(mockExpiredToken)
      const token = await manager.getAccessToken()

      expect(mockFetch).toHaveBeenCalledWith(
        config.refreshConfig.url,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      )
      expect(token).toBe(newTokenString)
    })

    it('should throw error when no token and refresh fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(manager.getAccessToken()).rejects.toThrow(NoValidTokenError)
    })
  })

  describe('refreshAccessToken', () => {
    beforeEach(() => {
      manager = new JWTManager(config)
    })

    it('should refresh token successfully', async () => {
      const newTokenString = createMockToken(ONE_HOUR_IN_MS)
      const onTokenRefresh = jest.fn()
      config.onTokenRefresh = onTokenRefresh
      manager = new JWTManager(config)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newTokenString,
          expires_in: 3600
        })
      })

      const refreshedToken = await manager.refreshAccessToken()

      expect(refreshedToken.token).toBe(newTokenString)
      expect(onTokenRefresh).toHaveBeenCalledWith(refreshedToken)
    })

    it('should handle 401 response and call onAuthFailure', async () => {
      const onAuthFailure = jest.fn()
      config.onAuthFailure = onAuthFailure
      manager = new JWTManager(config)

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      })

      await expect(manager.refreshAccessToken()).rejects.toThrow(TokenRefreshError)
      expect(onAuthFailure).toHaveBeenCalled()
      expect(manager.getCurrentAccessToken()).toBeNull()
    })

    it('should return existing refresh promise if in progress', async () => {
      let resolvePromise: (value: any) => void
      let callCount = 0

      mockFetch.mockImplementation(() => {
        callCount++
        const promise = new Promise(resolve => {
          resolvePromise = resolve
        })
        return promise
      })

      const promise1 = manager.refreshAccessToken()
      const promise2 = manager.refreshAccessToken()

      expect(promise1).toBe(promise2)

      resolvePromise!({
        ok: true,
        json: async () => ({
          access_token: createMockToken(ONE_HOUR_IN_MS),
          expires_in: 3600
        })
      })

      const result1 = await promise1
      const result2 = await promise2

      expect(callCount).toBe(1)
      expect(result1.token).toBe(result2.token)
    })

    it('should call onTokenRefreshError on failure', async () => {
      const onTokenRefreshError = jest.fn()
      config.onTokenRefreshError = onTokenRefreshError
      manager = new JWTManager(config)

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(manager.refreshAccessToken()).rejects.toThrow(TokenRefreshError)
      expect(onTokenRefreshError).toHaveBeenCalledWith(expect.any(TokenRefreshError))
    })
  })

  describe('request', () => {
    beforeEach(() => {
      manager = new JWTManager(config)
    })

    it('should make authenticated request', async () => {
      const responseData = { data: 'test' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => responseData
      })

      manager.setAccessToken(mockAccessToken)
      const response = await manager.request({
        url: 'https://api.example.com/data'
      })

      expect(response.data).toEqual(responseData)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockAccessToken.token}`
          }),
          credentials: 'include'
        })
      )
    })

    it('should handle 401 response with token refresh', async () => {
      const responseData = { data: 'test' }
      const newTokenString = createMockToken(ONE_HOUR_IN_MS)

      // First request returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      })

      // Refresh token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newTokenString,
          expires_in: 3600
        })
      })

      // Retry request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => responseData
      })

      manager.setAccessToken(mockAccessToken)
      const response = await manager.request({
        url: 'https://api.example.com/data'
      })

      expect(response.data).toEqual(responseData)

      // original + refresh + retry
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should clear token and call onAuthFailure when refresh fails after 401', async () => {
      const onAuthFailure = jest.fn()
      config.onAuthFailure = onAuthFailure
      manager = new JWTManager(config)

      // First request returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      })

      // Refresh token request fails
      mockFetch.mockRejectedValueOnce(new Error('Refresh failed'))

      manager.setAccessToken(mockAccessToken)
      await expect(manager.request({
        url: 'https://api.example.com/data'
      })).rejects.toThrow(NoValidTokenError)

      expect(onAuthFailure).toHaveBeenCalled()
      expect(manager.getCurrentAccessToken()).toBeNull()
    })
  })

  describe('hasValidAccessToken', () => {
    beforeEach(() => {
      manager = new JWTManager(config)
    })

    it('should return true when token is valid', () => {
      manager.setAccessToken(mockAccessToken)
      expect(manager.hasValidAccessToken()).toBe(true)
    })

    it('should return false when no token', () => {
      expect(manager.hasValidAccessToken()).toBe(false)
    })

    it('should return false when token is expired', () => {
      manager.setAccessToken(mockExpiredToken)
      expect(manager.hasValidAccessToken()).toBe(false)
    })
  })

  describe('clearAccessToken', () => {
    beforeEach(() => {
      manager = new JWTManager(config)
    })

    it('should clear the access token', () => {
      manager.setAccessToken(mockAccessToken)
      expect(manager.getCurrentAccessToken()).not.toBeNull()

      manager.clearAccessToken()
      expect(manager.getCurrentAccessToken()).toBeNull()
    })
  })

  describe('token scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      manager = new JWTManager(config)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should schedule automatic token refresh', async () => {
      const shortLivedToken = {
        token: createMockToken(TWO_MINUTES_IN_MS),
        expiresAt: Date.now() + TWO_MINUTES_IN_MS
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: createMockToken(ONE_HOUR_IN_MS),
          expires_in: ONE_HOUR_IN_SECONDS
        })
      })

      manager.setAccessToken(shortLivedToken)

      // Advance time to trigger refresh (2 minutes - 6 second buffer = 114 seconds)
      jest.advanceTimersByTime(114000)

      // Run any pending promises
      await Promise.resolve()

      expect(mockFetch).toHaveBeenCalledWith(
        config.refreshConfig.url,
        expect.any(Object)
      )
    })
  })
})