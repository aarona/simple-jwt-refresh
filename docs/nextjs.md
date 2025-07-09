# Next.js Integration

This guide shows how to set up backend API routes in Next.js that work with `simple-jwt-refresh`.

## Installation

```bash
npm install jsonwebtoken cookie
```

## Key Requirements

Your Next.js API routes need to provide:
1. **Login endpoint** - Returns access token and sets httpOnly refresh cookie
2. **Refresh endpoint** - Uses httpOnly cookie to issue new access token
3. **Logout endpoint** - Clears the refresh cookie
4. **Protected endpoints** - Validate access tokens

## API Routes Setup

### Login Route

```typescript
// pages/api/auth/login.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { serialize } from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;
    
    // Validate credentials
    const user = await validateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: '7d' }
    );
    
    // Set httpOnly cookie
    const cookie = serialize('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/'
    });
    
    res.setHeader('Set-Cookie', cookie);
    
    res.json({
      access_token: accessToken,
      expires_in: 15 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function (implement based on your database)
async function validateUser(email: string, password: string) {
  // Your user validation logic here
  // Return user object if valid, null if invalid
}
```

### Refresh Route

```typescript
// pages/api/auth/refresh.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token not provided' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as any;
    
    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' }
    );
    
    res.json({
      access_token: newAccessToken,
      expires_in: 15 * 60
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}
```

### Logout Route

```typescript
// pages/api/auth/logout.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear the refresh token cookie
  const cookie = serialize('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/'
  });
  
  res.setHeader('Set-Cookie', cookie);
  res.json({ message: 'Logged out successfully' });
}
```

### Protected Route Example

```typescript
// pages/api/protected-data.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;
    
    res.json({
      message: 'This is protected data',
      user: decoded,
      data: [1, 2, 3, 4, 5]
    });
  } catch (error) {
    res.status(403).json({ error: 'Invalid access token' });
  }
}
```

## Authentication Middleware

Create a reusable middleware for protected routes:

```typescript
// lib/auth-middleware.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends NextApiRequest {
  user: {
    userId: string;
    email: string;
  };
}

export function withAuth(handler: (req: AuthenticatedRequest, res: NextApiResponse) => void) {
  return (req: NextApiRequest, res: NextApiResponse) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;
      (req as AuthenticatedRequest).user = decoded;
      return handler(req as AuthenticatedRequest, res);
    } catch (error) {
      return res.status(403).json({ error: 'Invalid access token' });
    }
  };
}
```

### Using the Middleware

```typescript
// pages/api/user.ts
import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../lib/auth-middleware';

export default withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
  try {
    // Access user data from req.user
    const user = await getUserById(req.user.userId);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Helper function
async function getUserById(userId: string) {
  // Your user fetching logic here
  // Return user object
}
```

## App Router (Next.js 13+)

For the new App Router, create route handlers:

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    // Validate credentials
    const user = await validateUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: '7d' }
    );
    
    // Create response
    const response = NextResponse.json({
      access_token: accessToken,
      expires_in: 15 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
    
    // Set httpOnly cookie
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });
    
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Environment Variables

Create a `.env.local` file:

```env
ACCESS_TOKEN_SECRET=your-super-secret-access-token-key
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key
```

## CORS Configuration

For cross-origin requests, add CORS headers:

```typescript
// lib/cors.ts
import { NextApiResponse } from 'next';

export function setCorsHeaders(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export function withCors(handler: (req: any, res: NextApiResponse) => void) {
  return (req: any, res: NextApiResponse) => {
    setCorsHeaders(res);
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    return handler(req, res);
  };
}
```

## Testing the API

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# Access protected endpoint
curl -X GET http://localhost:3000/api/protected-data \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt

# Refresh token
curl -X POST http://localhost:3000/api/auth/refresh \
  -b cookies.txt
```

## Next Steps

- [React Integration Guide](./react.md)
- [Vue Integration Guide](./vue.md)
- [Svelte Integration Guide](./svelte.md)
- [Express.js Integration Guide](./express.md)
- [Rails Integration Guide](./rails.md)
