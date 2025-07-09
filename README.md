# Simple JWT Refresh

A lightweight, framework-agnostic library for managing JWT access tokens in frontend applications. Designed for scenarios where refresh tokens are stored in httpOnly cookies and you only need to manage the access token.

[![npm version](https://badge.fury.io/js/simple-jwt-refresh.svg)](https://badge.fury.io/js/simple-jwt-refresh)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

## Features

- 🔄 **Automatic Token Refresh** - Proactively refreshes tokens before expiration
- 🛡️ **401 Error Handling** - Automatically retries requests after token refresh
- 🍪 **httpOnly Cookie Support** - Works with secure refresh token storage
- 🏗️ **Framework Agnostic** - Works with React, Vue, Angular, or vanilla JavaScript
- 🔒 **TypeScript Support** - Full type safety with comprehensive TypeScript definitions
- 📡 **Simple Configuration** - Easy setup with minimal configuration
- 🧪 **Well Tested** - Comprehensive test coverage
- 📦 **Zero Dependencies** - No external dependencies
- ⚡ **Lightweight** - Minimal bundle size

## Installation

```bash
npm install simple-jwt-refresh
```

```bash
yarn add simple-jwt-refresh
```

## Quick Start

```typescript
import { JWTManager } from 'simple-jwt-refresh';

// Configure the JWT manager
const jwtManager = new JWTManager({
  refreshConfig: {
    url: 'https://your-api.com/auth/refresh',
    extractAccessToken: (response) => ({
      token: response.access_token,
      expiresAt: Date.now() + (response.expires_in * 1000)
    })
  },
  refreshBuffer: 60000, // Refresh 1 minute before expiration
  onAuthFailure: () => {
    // Redirect to login when refresh fails
    window.location.href = '/login';
  }
});

// Set initial access token (e.g., after login)
jwtManager.setAccessToken('your-jwt-access-token');

// Make authenticated requests
try {
  const response = await jwtManager.request({
    url: 'https://your-api.com/protected-endpoint',
    method: 'GET'
  });
  console.log(response.data);
} catch (error) {
  console.error('Request failed:', error);
}
```

## Configuration

### JWTManagerConfig

```typescript
interface JWTManagerConfig {
  refreshConfig: RefreshConfig;
  refreshBuffer?: number; // Default: 6000 (6 seconds)
  fetch?: typeof fetch;
  onTokenRefresh?: (accessToken: JWTToken) => void;
  onTokenRefreshError?: (error: Error) => void;
  onAuthFailure?: () => void;
}
```

### RefreshConfig

```typescript
interface RefreshConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH'; // Default: 'POST'
  headers?: Record<string, string>;
  extractAccessToken: (response: any) => JWTToken;
}
```

## API Reference

### JWTManager

#### Constructor
```typescript
new JWTManager(config: JWTManagerConfig)
```

#### Methods

##### `setAccessToken(token: string | JWTToken): void`
Sets the access token. Can accept either a JWT string or a JWTToken object.

##### `getAccessToken(): Promise<string>`
Returns a valid access token, automatically refreshing if necessary.

##### `getCurrentAccessToken(): JWTToken | null`
Returns the current access token without automatic refresh.

##### `hasValidAccessToken(): boolean`
Checks if there's a valid (non-expired) access token.

##### `refreshAccessToken(): Promise<JWTToken>`
Manually refresh the access token using the httpOnly refresh cookie.

##### `request<T>(config: RequestConfig): Promise<AuthenticatedResponse<T>>`
Makes an authenticated HTTP request with automatic token refresh on 401 errors.

##### `clearAccessToken(): void`
Clears the current access token.

##### `destroy(): void`
Cleans up resources and cancels scheduled refreshes.

## Framework Integrations

Detailed integration guides are available for popular frameworks:

> **💡 Tip**: After installing the package, these guides are also available locally at `node_modules/simple-jwt-refresh/docs/`

### Frontend Frameworks
- **[React Context API](docs/react.md)** - React Context setup with hooks
- **[Vue 3 Composition API](docs/vue.md)** - Vue 3 integration with Pinia store
- **[Svelte 5 with Runes](docs/svelte.md)** - Modern Svelte integration

### Backend Frameworks
- **[Express.js / Node.js](docs/express.md)** - Complete Express.js setup with security best practices
- **[Next.js API Routes](docs/nextjs.md)** - Next.js API routes with App Router support
- **[Ruby on Rails](docs/rails.md)** - Rails API with CORS and JWT gem integration

## Error Handling

The library provides specific error types for different scenarios:

```typescript
import { TokenRefreshError, NoValidTokenError } from 'simple-jwt-refresh';

try {
  const response = await jwtManager.request({ url: '/api/data' });
} catch (error) {
  if (error instanceof NoValidTokenError) {
    // No valid token available - redirect to login
    window.location.href = '/login';
  } else if (error instanceof TokenRefreshError) {
    // Token refresh failed - handle accordingly
    console.error('Token refresh failed:', error);
  } else {
    // Other request errors
    console.error('Request failed:', error);
  }
}
```

## Security Considerations

1. **Refresh Token Storage**: This library assumes refresh tokens are stored in httpOnly cookies set by your backend server. This is the most secure approach for web applications.

2. **HTTPS Only**: Always use HTTPS in production to prevent token interception.

3. **Token Expiration**: Set appropriate expiration times:
   - Access tokens: 15-60 minutes
   - Refresh tokens: 7-30 days

4. **CORS Configuration**: Ensure your backend properly handles CORS for the refresh endpoint and includes credentials.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```