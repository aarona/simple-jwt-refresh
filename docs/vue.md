# Vue Integration Guide

This guide shows how to integrate `simple-jwt-refresh` with Vue 3 applications using the Composition API.

## Installation

```bash
npm install simple-jwt-refresh
```

## Vue 3 Composition API Setup

### 1. Create a Composable for Authentication

```typescript
// composables/useAuth.ts
import { ref, onMounted } from 'vue';
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
    // Redirect to login when refresh fails
    window.location.href = '/login';
  }
});

export function useAuth() {
  const isAuthenticated = ref(false);
  const loading = ref(true);

  const checkAuth = async () => {
    try {
      if (!jwtManager.hasValidAccessToken()) {
        await jwtManager.refreshAccessToken();
      }
      isAuthenticated.value = true;
    } catch (error) {
      isAuthenticated.value = false;
    } finally {
      loading.value = false;
    }
  };

  const login = (accessToken: string) => {
    jwtManager.setAccessToken(accessToken);
    isAuthenticated.value = true;
  };

  const logout = () => {
    jwtManager.clearAccessToken();
    isAuthenticated.value = false;
  };

  const makeRequest = (config: any) => {
    return jwtManager.request(config);
  };

  onMounted(checkAuth);

  return {
    isAuthenticated,
    loading,
    login,
    logout,
    makeRequest
  };
}
```

### 2. Use in Components

```vue
<!-- components/Dashboard.vue -->
<template>
  <div>
    <div v-if="loading">Loading...</div>
    <div v-else-if="!isAuthenticated">
      <button @click="handleLogin">Login</button>
    </div>
    <div v-else>
      <h1>Dashboard</h1>
      <button @click="fetchProtectedData">Fetch Protected Data</button>
      <button @click="logout">Logout</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '../composables/useAuth';

const { isAuthenticated, loading, login, logout, makeRequest } = useAuth();

const handleLogin = async () => {
  try {
    // Call your login endpoint
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
      credentials: 'include' // Important for httpOnly cookies
    });
    
    const data = await response.json();
    login(data.access_token);
  } catch (error) {
    console.error('Login failed:', error);
  }
};

const fetchProtectedData = async () => {
  try {
    const response = await makeRequest({
      url: '/api/protected-data',
      method: 'GET'
    });
    console.log('Protected data:', response.data);
  } catch (error) {
    console.error('Failed to fetch protected data:', error);
  }
};
</script>
```

## Vue 3 with Pinia (State Management)

### 1. Create an Auth Store

```typescript
// stores/auth.ts
import { defineStore } from 'pinia';
import { JWTManager } from 'simple-jwt-refresh';

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
    useAuthStore().logout();
  }
});

export const useAuthStore = defineStore('auth', {
  state: () => ({
    isAuthenticated: false,
    loading: true,
    user: null as any
  }),

  actions: {
    async initAuth() {
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
    },

    async login(accessToken: string) {
      jwtManager.setAccessToken(accessToken);
      this.isAuthenticated = true;
    },

    logout() {
      jwtManager.clearAccessToken();
      this.isAuthenticated = false;
      this.user = null;
    },

    async makeRequest(config: any) {
      return await jwtManager.request(config);
    }
  }
});
```

### 2. Use the Store in Components

```vue
<!-- components/Dashboard.vue -->
<template>
  <div>
    <div v-if="authStore.loading">Loading...</div>
    <div v-else-if="!authStore.isAuthenticated">
      <button @click="handleLogin">Login</button>
    </div>
    <div v-else>
      <h1>Dashboard</h1>
      <button @click="fetchProtectedData">Fetch Protected Data</button>
      <button @click="authStore.logout">Logout</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

onMounted(() => {
  authStore.initAuth();
});

const handleLogin = async () => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
      credentials: 'include'
    });
    
    const data = await response.json();
    await authStore.login(data.access_token);
  } catch (error) {
    console.error('Login failed:', error);
  }
};

const fetchProtectedData = async () => {
  try {
    const response = await authStore.makeRequest({
      url: '/api/protected-data',
      method: 'GET'
    });
    console.log('Protected data:', response.data);
  } catch (error) {
    console.error('Failed to fetch protected data:', error);
  }
};
</script>
```

## Vue Router Integration

### Protected Routes

```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  
  if (authStore.loading) {
    await authStore.initAuth();
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login');
  } else {
    next();
  }
});

export default router;
```

## Advanced Patterns

### Custom Composable for API Requests

```typescript
// composables/useApi.ts
import { ref } from 'vue';
import { useAuth } from './useAuth';

export function useApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const { makeRequest } = useAuth();

  const request = async (config: any) => {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await makeRequest(config);
      return response.data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Request failed';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return { request, loading, error };
}
```

### Global Error Handling

```typescript
// plugins/errorHandler.ts
import { App } from 'vue';
import { TokenRefreshError, NoValidTokenError } from 'simple-jwt-refresh';

export default {
  install(app: App) {
    app.config.errorHandler = (error) => {
      if (error instanceof NoValidTokenError) {
        // Redirect to login
        window.location.href = '/login';
      } else if (error instanceof TokenRefreshError) {
        // Handle token refresh errors
        console.error('Token refresh failed:', error);
      }
    };
  }
};
```

## TypeScript Support

The library is fully typed for Vue:

```typescript
import { JWTManager, JWTToken, TokenRefreshError } from 'simple-jwt-refresh';

// Use in your Vue composables
const handleError = (error: unknown) => {
  if (error instanceof TokenRefreshError) {
    console.error('Token refresh failed:', error.message);
  }
};
```

## Next Steps

- [React Integration Guide](./react.md)
- [Svelte Integration Guide](./svelte.md)
- [Express.js Integration Guide](./express.md)
- [Next.js Integration Guide](./nextjs.md)
- [Rails Integration Guide](./rails.md)