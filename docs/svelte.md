# Svelte 5 Integration Guide

This guide shows how to integrate `simple-jwt-refresh` with Svelte 5 applications using runes and modern patterns.

## Installation

```bash
npm install simple-jwt-refresh
```

## Svelte 5 Setup with Runes

### 1. Create an Authentication Composable

```typescript
// lib/auth.svelte.ts
import { JWTManager } from 'simple-jwt-refresh';

// Create JWT Manager instance
const jwtManager = new JWTManager({
  refreshConfig: {
    url: '/api/auth/refresh',
    extractAccessToken: (response) => ({
      token: response.access_token,
      expiresAt: Date.now() + (response.expires_in * 1000)
    })
  },
  onAuthFailure: () => {
    // Handle auth failure
    authState.logout();
  }
});

// Global auth state using runes
class AuthState {
  isAuthenticated = $state(false);
  loading = $state(true);
  user = $state<any>(null);

  async init() {
    try {
      if (!jwtManager.hasValidAccessToken()) {
        await jwtManager.refreshAccessToken();
      }
      this.isAuthenticated = true;
    } catch (error) {
      this.isAuthenticated = false;
    } finally {
      this.loading = false;
    }
  }

  async login(accessToken: string) {
    jwtManager.setAccessToken(accessToken);
    this.isAuthenticated = true;
  }

  logout() {
    jwtManager.clearAccessToken();
    this.isAuthenticated = false;
    this.user = null;
  }

  async makeRequest(config: any) {
    return await jwtManager.request(config);
  }

  setUser(userData: any) {
    this.user = userData;
  }
}

export const authState = new AuthState();
```

### 2. Initialize Auth in Your App

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { authState } from './lib/auth.svelte.js';
  import Dashboard from './components/Dashboard.svelte';
  import Login from './components/Login.svelte';

  onMount(() => {
    authState.init();
  });
</script>

<main>
  {#if authState.loading}
    <div class="loading">Loading...</div>
  {:else if authState.isAuthenticated}
    <Dashboard />
  {:else}
    <Login />
  {/if}
</main>

<style>
  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
  }
</style>
```

### 3. Use in Components

```svelte
<!-- components/Dashboard.svelte -->
<script lang="ts">
  import { authState } from '../lib/auth.svelte.js';

  let protectedData = $state(null);
  let loading = $state(false);

  const fetchProtectedData = async () => {
    loading = true;
    try {
      const response = await authState.makeRequest({
        url: '/api/protected-data',
        method: 'GET'
      });
      protectedData = response.data;
    } catch (error) {
      console.error('Failed to fetch protected data:', error);
    } finally {
      loading = false;
    }
  };

  const handleLogout = () => {
    authState.logout();
  };
</script>

<div class="dashboard">
  <h1>Dashboard</h1>
  
  {#if authState.user}
    <p>Welcome, {authState.user.name}!</p>
  {/if}
  
  <button onclick={fetchProtectedData} disabled={loading}>
    {loading ? 'Loading...' : 'Fetch Protected Data'}
  </button>
  
  {#if protectedData}
    <div class="data">
      <h2>Protected Data:</h2>
      <pre>{JSON.stringify(protectedData, null, 2)}</pre>
    </div>
  {/if}
  
  <button onclick={handleLogout}>Logout</button>
</div>

<style>
  .dashboard {
    padding: 20px;
  }
  
  .data {
    margin-top: 20px;
    padding: 10px;
    background: #f5f5f5;
    border-radius: 4px;
  }
  
  pre {
    white-space: pre-wrap;
  }
</style>
```

```svelte
<!-- components/Login.svelte -->
<script lang="ts">
  import { authState } from '../lib/auth.svelte.js';

  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  const handleLogin = async () => {
    loading = true;
    error = '';
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include' // Important for httpOnly cookies
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      await authState.login(data.access_token);
      
      // Optionally set user data
      authState.setUser(data.user);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Login failed';
    } finally {
      loading = false;
    }
  };
</script>

<div class="login">
  <h1>Login</h1>
  
  <form onsubmit={handleLogin}>
    <div class="field">
      <label for="email">Email:</label>
      <input 
        id="email" 
        type="email" 
        bind:value={email} 
        required 
        disabled={loading}
      />
    </div>
    
    <div class="field">
      <label for="password">Password:</label>
      <input 
        id="password" 
        type="password" 
        bind:value={password} 
        required 
        disabled={loading}
      />
    </div>
    
    {#if error}
      <div class="error">{error}</div>
    {/if}
    
    <button type="submit" disabled={loading}>
      {loading ? 'Logging in...' : 'Login'}
    </button>
  </form>
</div>

<style>
  .login {
    max-width: 400px;
    margin: 0 auto;
    padding: 20px;
  }
  
  .field {
    margin-bottom: 15px;
  }
  
  label {
    display: block;
    margin-bottom: 5px;
  }
  
  input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  
  .error {
    color: red;
    margin-bottom: 10px;
  }
  
  button {
    width: 100%;
    padding: 10px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
</style>
```

## SvelteKit Integration

### 1. Server-Side Auth Check

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Check for auth token in cookies
  const token = event.cookies.get('auth-token');
  
  if (token) {
    // Verify token and set user in locals
    try {
      // Your token verification logic here
      event.locals.user = { /* user data */ };
    } catch (error) {
      // Invalid token
      event.locals.user = null;
    }
  }

  return resolve(event);
};
```

### 2. Protected Routes

```typescript
// src/routes/dashboard/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return {
    user: locals.user
  };
};
```

### 3. Universal Auth State

```typescript
// src/lib/auth.svelte.ts
import { browser } from '$app/environment';
import { JWTManager } from 'simple-jwt-refresh';

let jwtManager: JWTManager;

if (browser) {
  jwtManager = new JWTManager({
    refreshConfig: {
      url: '/api/auth/refresh',
      extractAccessToken: (response) => ({
        token: response.access_token,
        expiresAt: Date.now() + (response.expires_in * 1000)
      })
    },
    onAuthFailure: () => {
      // Handle auth failure
      window.location.href = '/login';
    }
  });
}

class AuthState {
  isAuthenticated = $state(false);
  loading = $state(true);
  user = $state<any>(null);

  async makeRequest(config: any) {
    if (!browser) return null;
    return await jwtManager.request(config);
  }
  
  // ... rest of methods with browser checks
}

export const authState = new AuthState();
```

## Advanced Patterns

### Component-Level Auth State

```typescript
// lib/useAuth.svelte.ts
import { authState } from './auth.svelte.js';

export function useAuth() {
  let localLoading = $state(false);
  let localError = $state<string | null>(null);

  const login = async (email: string, password: string) => {
    localLoading = true;
    localError = null;
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      await authState.login(data.access_token);
    } catch (err) {
      localError = err instanceof Error ? err.message : 'Login failed';
      throw err;
    } finally {
      localLoading = false;
    }
  };

  return {
    get isAuthenticated() { return authState.isAuthenticated; },
    get user() { return authState.user; },
    get loading() { return localLoading; },
    get error() { return localError; },
    login,
    logout: () => authState.logout()
  };
}
```

### API Request Composable

```typescript
// lib/useApi.svelte.ts
import { authState } from './auth.svelte.js';

export function useApi() {
  let loading = $state(false);
  let error = $state<string | null>(null);
  let data = $state<any>(null);

  const request = async (config: any) => {
    loading = true;
    error = null;
    
    try {
      const response = await authState.makeRequest(config);
      data = response.data;
      return response.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Request failed';
      throw err;
    } finally {
      loading = false;
    }
  };

  const reset = () => {
    loading = false;
    error = null;
    data = null;
  };

  return {
    get loading() { return loading; },
    get error() { return error; },
    get data() { return data; },
    request,
    reset
  };
}
```

### Auth Guard Component

```svelte
<!-- components/AuthGuard.svelte -->
<script lang="ts">
  import { authState } from '../lib/auth.svelte.js';
  
  interface Props {
    fallback?: string;
    children: any;
  }
  
  let { fallback = 'Please login to continue', children }: Props = $props();
</script>

{#if authState.loading}
  <div class="loading">Loading...</div>
{:else if authState.isAuthenticated}
  {@render children()}
{:else}
  <div class="auth-required">
    {fallback}
  </div>
{/if}

<style>
  .loading, .auth-required {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
  }
</style>
```

## Effects for Side Effects

```typescript
// lib/auth.svelte.ts
import { untrack } from 'svelte';

class AuthState {
  isAuthenticated = $state(false);
  loading = $state(true);

  constructor() {
    // Effect to handle auth state changes
    $effect(() => {
      if (this.isAuthenticated) {
        // User just logged in - fetch user data
        untrack(() => {
          this.fetchUserData();
        });
      }
    });
  }

  private async fetchUserData() {
    try {
      const response = await this.makeRequest({
        url: '/api/user',
        method: 'GET'
      });
      this.user = response.data;
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    }
  }

  // ... rest of methods
}
```

## TypeScript Support

The library works seamlessly with TypeScript in Svelte 5:

```typescript
import { JWTManager, JWTToken, TokenRefreshError } from 'simple-jwt-refresh';

// Type your state
interface User {
  id: string;
  email: string;
  name: string;
}

class AuthState {
  user = $state<User | null>(null);
  
  // Type your methods
  async login(accessToken: string): Promise<void> {
    // ...
  }
}
```

## Migration from Svelte 4

If you're upgrading from Svelte 4, the main changes are:

- Replace `writable()` with `$state()`
- Replace `derived()` with `$derived()`
- Replace `onMount()` effects with `$effect()`
- Update event handlers from `on:click` to `onclick`
- Update form submission from `on:submit|preventDefault` to `onsubmit`

## Next Steps

- [React Integration Guide](./react.md)
- [Vue Integration Guide](./vue.md)
- [Express.js Integration Guide](./express.md)
- [Next.js Integration Guide](./nextjs.md)
- [Rails Integration Guide](./rails.md)