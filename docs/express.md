# Express.js / Node.js Integration

This guide shows how to set up backend endpoints in Express.js that work with `simple-jwt-refresh`.

## Installation

```bash
npm install express jsonwebtoken cookie-parser cors
```

## Key Requirements

Your backend needs to provide:
1. **Login endpoint** - Returns access token and sets httpOnly refresh cookie
2. **Refresh endpoint** - Uses httpOnly cookie to issue new access token
3. **Logout endpoint** - Clears the refresh cookie
4. **Protected endpoints** - Validate access tokens

## Complete Auth Setup

```javascript
// server.js
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true // Important for cookies
}));

// Secret keys (use environment variables in production)
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'your-access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret';

// Token storage (use Redis or database in production)
const refreshTokens = new Set();

// Helper functions
const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email },
    REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
};

// Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate credentials (implement your logic)
    const user = await validateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Store refresh token
    refreshTokens.add(refreshToken);
    
    // Set httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({
      access_token: accessToken,
      expires_in: 15 * 60, // 15 minutes in seconds
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token not provided' });
  }
  
  if (!refreshTokens.has(refreshToken)) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    const user = { id: decoded.userId, email: decoded.email };
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user);
    
    res.json({
      access_token: newAccessToken,
      expires_in: 15 * 60 // 15 minutes
    });
  } catch (error) {
    // Remove invalid refresh token
    refreshTokens.delete(refreshToken);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (refreshToken) {
    refreshTokens.delete(refreshToken);
  }
  
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
});

// Middleware to verify access token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid access token' });
    }
    req.user = user;
    next();
  });
};

// Protected routes
app.get('/api/protected-data', authenticateToken, (req, res) => {
  res.json({
    message: 'This is protected data',
    user: req.user,
    data: [1, 2, 3, 4, 5]
  });
});

app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    // Fetch user data from database
    const user = await getUserById(req.user.userId);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Helper functions (implement based on your database)
async function validateUser(email, password) {
  // Your user validation logic here
  // Return user object if valid, null if invalid
}

async function getUserById(userId) {
  // Your user fetching logic here
  // Return user object
}

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
```

## Security Best Practices

### 1. Token Expiration
```javascript
// Short-lived access tokens
const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' });

// Longer-lived refresh tokens
const refreshToken = jwt.sign(payload, secret, { expiresIn: '7d' });
```

### 2. Cookie Security
```javascript
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,           // Prevents XSS
  secure: true,             // HTTPS only in production
  sameSite: 'strict',       // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

### 3. CORS Configuration
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true // Required for cookies
}));
```

### 4. Token Blacklisting
```javascript
// Store refresh tokens in Redis/Database
const refreshTokens = new Map();

// On logout, remove from store
app.post('/logout', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  refreshTokens.delete(refreshToken);
  res.clearCookie('refreshToken');
});
```

### 5. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts'
});

app.post('/api/auth/login', loginLimiter, loginHandler);
```

## Environment Variables

Create a `.env` file:

```env
ACCESS_TOKEN_SECRET=your-super-secret-access-token-key
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

## Testing the API

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# Access protected endpoint
curl -X GET http://localhost:3001/api/protected-data \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt

# Refresh token
curl -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt
```

## Next Steps

- [React Integration Guide](./react.md)
- [Vue Integration Guide](./vue.md)
- [Svelte Integration Guide](./svelte.md)
- [Next.js Integration Guide](./nextjs.md)
- [Rails Integration Guide](./rails.md)
