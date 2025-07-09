import {
  JWTManagerConfig,
  JWTToken,
  RequestConfig,
  AuthenticatedResponse,
  TokenRefreshError,
  NoValidTokenError
} from './types'
import { isTokenExpired, createJWTToken, isValidJWTFormat } from './utils'

/**
 * Simple JWT Token Manager for frontend applications
 * Assumes refresh tokens are stored in httpOnly cookies
 */
export class JWTManager {
  private config: Required<JWTManagerConfig>
  private accessToken: JWTToken | null = null;
  private refreshPromise: Promise<JWTToken> | null = null;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: JWTManagerConfig) {
    this.config = {
      refreshBuffer: 6000, // Default: 6 seconds before expiration
      fetch: typeof fetch !== 'undefined' ? fetch : this.defaultFetch,
      onTokenRefresh: () => { },
      onTokenRefreshError: () => { },
      onAuthFailure: () => { },
      ...config
    }

    this.validateConfig()
  }

  /**
   * Validate the configuration
   */
  private validateConfig(): void {
    if (!this.config.refreshConfig.url) {
      throw new Error('Refresh URL is required')
    }

    if (typeof this.config.refreshConfig.extractAccessToken !== 'function') {
      throw new Error('extractAccessToken function is required')
    }
  }

  /**
   * Default fetch implementation that throws an error
   */
  private defaultFetch(): Promise<Response> {
    throw new Error('Fetch is not available. Please provide a fetch implementation in the config.')
  }

  /**
   * Set the initial access token (e.g., from login response)
   */
  public setAccessToken(token: string | JWTToken): void {
    if (typeof token === 'string') {
      if (!isValidJWTFormat(token)) {
        throw new Error('Invalid JWT token format')
      }
      this.accessToken = createJWTToken(token)
    } else {
      this.accessToken = token
    }

    this.scheduleTokenRefresh()
  }

  /**
   * Get current access token, refreshing if necessary
   */
  public async getAccessToken(): Promise<string> {
    // If no token, try to refresh (might have httpOnly refresh cookie)
    if (!this.accessToken) {
      try {
        const newToken = await this.refreshAccessToken()
        return newToken.token
      } catch (error) {
        throw new NoValidTokenError('No access token available and refresh failed')
      }
    }

    if (isTokenExpired(this.accessToken, this.config.refreshBuffer)) {
      try {
        const newToken = await this.refreshAccessToken()
        return newToken.token
      } catch (error) {
        throw new NoValidTokenError('Access token expired and refresh failed')
      }
    }

    return this.accessToken.token
  }

  /**
   * Get current access token without automatic refresh
   */
  public getCurrentAccessToken(): JWTToken | null {
    return this.accessToken
  }

  /**
   * Check if we have a valid access token
   */
  public hasValidAccessToken(): boolean {
    return this.accessToken !== null && !isTokenExpired(this.accessToken)
  }

  /**
   * Refresh the access token using httpOnly refresh cookie
   */
  public refreshAccessToken(): Promise<JWTToken> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = (async () => {
      try {
        const newToken = await this.performTokenRefresh()
        this.setAccessToken(newToken)
        this.config.onTokenRefresh(newToken)
        return newToken
      } catch (error) {
        const refreshError = error instanceof TokenRefreshError ? error :
          new TokenRefreshError('Token refresh failed', error as Error)

        this.config.onTokenRefreshError(refreshError)
        throw refreshError
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  /**
   * Perform the actual token refresh request
   */
  private async performTokenRefresh(): Promise<JWTToken> {
    const { refreshConfig } = this.config

    try {
      const response = await this.config.fetch(refreshConfig.url, {
        method: refreshConfig.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...refreshConfig.headers
        },
        credentials: 'include'
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.clearAccessToken()
          this.config.onAuthFailure()
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const newAccessToken = refreshConfig.extractAccessToken(data)

      if (!newAccessToken || !isValidJWTFormat(newAccessToken.token)) {
        throw new Error('Invalid access token received from refresh endpoint')
      }

      return newAccessToken
    } catch (error) {
      throw new TokenRefreshError('Failed to refresh access token', error as Error)
    }
  }

  /**
   * Make an authenticated HTTP request
   */
  public async request<T = any>(config: RequestConfig): Promise<AuthenticatedResponse<T>> {
    const accessToken = await this.getAccessToken()

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      ...config.headers
    }

    try {
      const response = await this.config.fetch(config.url, {
        method: config.method || 'GET',
        headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        credentials: 'include', // Include cookies for potential refresh
        ...config.options
      })

      // Handle 401 - token might have expired during request
      if (response.status === 401) {
        try {
          // Try to refresh and retry the request
          const newAccessToken = await this.refreshAccessToken()

          const retryResponse = await this.config.fetch(config.url, {
            method: config.method || 'GET',
            headers: {
              ...headers,
              'Authorization': `Bearer ${newAccessToken.token}`
            },
            body: config.body ? JSON.stringify(config.body) : undefined,
            credentials: 'include',
            ...config.options
          })

          const retryData = retryResponse.headers.get('content-type')?.includes('application/json')
            ? await retryResponse.json()
            : await retryResponse.text()

          return {
            data: retryData,
            status: retryResponse.status,
            headers: retryResponse.headers,
            ok: retryResponse.ok
          }
        } catch (refreshError) {
          // Refresh failed, clear token and notify
          this.clearAccessToken()
          this.config.onAuthFailure()
          throw new NoValidTokenError('Authentication required')
        }
      }

      const data = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text()

      return {
        data,
        status: response.status,
        headers: response.headers,
        ok: response.ok
      }
    } catch (error) {
      if (error instanceof NoValidTokenError) {
        throw error
      }
      throw new Error(`Request failed: ${error}`)
    }
  }

  /**
   * Clear the current access token
   */
  public clearAccessToken(): void {
    this.clearRefreshTimeout()
    this.accessToken = null
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    this.clearRefreshTimeout()

    if (!this.accessToken) {
      return
    }

    const now = Date.now()
    const timeUntilRefresh = this.accessToken.expiresAt - now - this.config.refreshBuffer

    if (timeUntilRefresh > 0) {
      this.refreshTimeoutId = setTimeout(() => {
        this.refreshAccessToken().catch(error => {
          console.warn('Scheduled token refresh failed:', error)
        })
      }, timeUntilRefresh)
    }
  }

  /**
   * Clear the refresh timeout
   */
  private clearRefreshTimeout(): void {
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId)
      this.refreshTimeoutId = null
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.clearRefreshTimeout()
    this.accessToken = null
    this.refreshPromise = null
  }
}