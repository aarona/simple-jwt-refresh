/**
 * JWT Token structure
 */
export interface JWTToken {
  /** The JWT token string */
  token: string
  /** Token expiration timestamp in milliseconds */
  expiresAt: number
}

/**
 * Configuration for token refresh endpoint
 */
export interface RefreshConfig {
  /** URL endpoint for token refresh */
  url: string
  /** HTTP method for refresh request (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH'
  /** Custom headers for refresh request */
  headers?: Record<string, string>
  /** Function to extract access token from refresh response */
  extractAccessToken: (response: any) => JWTToken
}

/**
 * Configuration for the JWT Token Manager
 */
export interface JWTManagerConfig {
  /** Token refresh configuration */
  refreshConfig: RefreshConfig
  /** Buffer time in milliseconds before token expiry to trigger refresh (default: 60000 = 1 minute) */
  refreshBuffer?: number
  /** Custom fetch implementation (default: global fetch) */
  fetch?: typeof fetch
  /** Callback for successful token refresh */
  onTokenRefresh?: (accessToken: JWTToken) => void
  /** Callback for token refresh errors */
  onTokenRefreshError?: (error: Error) => void
  /** Callback for authentication failures (when refresh fails) */
  onAuthFailure?: () => void
}

/**
 * HTTP request configuration
 */
export interface RequestConfig {
  /** Request URL */
  url: string
  /** HTTP method (default: GET) */
  method?: string
  /** Request headers */
  headers?: Record<string, string>
  /** Request body */
  body?: any
  /** Additional fetch options */
  options?: RequestInit
}

/**
 * Response from an authenticated request
 */
export interface AuthenticatedResponse<T = any> {
  /** Response data */
  data: T
  /** HTTP status code */
  status: number
  /** Response headers */
  headers: Headers
  /** Whether the request was successful */
  ok: boolean
}

/**
 * Error thrown when token refresh fails
 */
export class TokenRefreshError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

/**
 * Error thrown when no valid access token is available
 */
export class NoValidTokenError extends Error {
  constructor(message: string = 'No valid access token available') {
    super(message)
    this.name = 'NoValidTokenError'
  }
}