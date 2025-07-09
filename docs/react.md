# React Integration Guide

This guide shows how to integrate `simple-jwt-refresh` with React applications using the Context API.

## Installation

```bash
npm install simple-jwt-refresh
```

## React Context Setup

### 1. Create an Authentication Context

```typescript
// contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { JWTManager } from 'simple-jwt-refresh';

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  login: (accessToken: string) => void;
  logout: () => void;
  makeRequest: (config: any) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we have a valid token or can refresh
    const checkAuth = async () => {
      try {
        const hasToken = jwtManager.hasValidAccessToken();
        if (!hasToken) {
          // Try to refresh using httpOnly cookie
          await jwtManager.refreshAccessToken();
        }
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (accessToken: string) => {
    jwtManager.setAccessToken(accessToken);
    setIsAuthenticated(true);
  };

  const logout = () => {
    jwtManager.clearAccessToken();
    setIsAuthenticated(false);
  };

  const makeRequest = async (config: any) => {
    return await jwtManager.request(config);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      loading,
      login,
      logout,
      makeRequest
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

### 2. Wrap Your App

```typescript
// App.tsx
import { AuthProvider } from './contexts/AuthContext';
import { Dashboard } from './components/Dashboard';

function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}

export default App;
```

### 3. Use in Components

```typescript
// components/Dashboard.tsx
import { useAuth } from '../contexts/AuthContext';

export const Dashboard = () => {
  const { isAuthenticated, loading, login, logout, makeRequest } = useAuth();

  const handleLogin = async () => {
    try {
      // Call your login endpoint
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
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

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <button onClick={handleLogin}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <button onClick={fetchProtectedData}>Fetch Protected Data</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};
```

## Advanced Patterns

### Custom Hook for API Requests

```typescript
// hooks/useApi.ts
import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { makeRequest } = useAuth();

  const request = useCallback(async (config: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await makeRequest(config);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [makeRequest]);

  return { request, loading, error };
};
```

### Protected Route Component

```typescript
// components/ProtectedRoute.tsx
import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export const ProtectedRoute = ({ children, fallback = <div>Please login</div> }: ProtectedRouteProps) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : <>{fallback}</>;
};
```

## TypeScript Support

The library is fully typed, so you'll get complete IntelliSense support:

```typescript
import { JWTManager, JWTToken, TokenRefreshError } from 'simple-jwt-refresh';

// All interfaces are exported for your use
const handleError = (error: unknown) => {
  if (error instanceof TokenRefreshError) {
    // Handle token refresh specific errors
    console.error('Token refresh failed:', error.message);
  }
};
```

## Next Steps

- [Vue Integration Guide](./vue.md)
- [Svelte Integration Guide](./svelte.md)
- [Express.js Integration Guide](./express.md)
- [Next.js Integration Guide](./nextjs.md)
- [Rails Integration Guide](./rails.md)