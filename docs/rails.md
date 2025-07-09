# Rails Integration

This guide shows how to set up backend endpoints in Ruby on Rails that work with `simple-jwt-refresh`.

## Installation

Add these gems to your `Gemfile`:

```ruby
# Gemfile
gem 'jwt', '~> 2.7'
gem 'rack-cors', '~> 2.0'
```

Then run:

```bash
bundle install
```

## CORS Configuration

Configure CORS to allow credentials (required for httpOnly cookies):

```ruby
# config/initializers/cors.rb
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV['FRONTEND_URL'] || 'http://localhost:3000'
    
    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      credentials: true,
      expose: ['Authorization']
  end
end
```

## Key Requirements

Your Rails API needs to provide:
1. **Login endpoint** - Returns access token and sets httpOnly refresh cookie
2. **Refresh endpoint** - Uses httpOnly cookie to issue new access token
3. **Logout endpoint** - Clears the refresh cookie
4. **Protected endpoints** - Validate access tokens

## Authentication Controller

```ruby
# app/controllers/auth_controller.rb
class AuthController < ApplicationController
  skip_before_action :authenticate_user!, only: [:login, :refresh]
  
  def login
    user = User.find_by(email: params[:email])
    
    if user&.authenticate(params[:password])
      access_token = generate_access_token(user)
      refresh_token = generate_refresh_token(user)
      
      # Set httpOnly cookie
      cookies[:refresh_token] = {
        value: refresh_token,
        httponly: true,
        secure: Rails.env.production?,
        same_site: :strict,
        expires: 7.days.from_now
      }
      
      render json: {
        access_token: access_token,
        expires_in: 15.minutes.to_i,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    else
      render json: { error: 'Invalid credentials' }, status: :unauthorized
    end
  end
  
  def refresh
    refresh_token = cookies[:refresh_token]
    
    if refresh_token.blank?
      render json: { error: 'Refresh token not provided' }, status: :unauthorized
      return
    end
    
    begin
      decoded = JWT.decode(refresh_token, jwt_secret, true, { algorithm: 'HS256' })
      user_id = decoded[0]['user_id']
      user = User.find(user_id)
      
      new_access_token = generate_access_token(user)
      
      render json: {
        access_token: new_access_token,
        expires_in: 15.minutes.to_i
      }
    rescue JWT::DecodeError => e
      render json: { error: 'Invalid refresh token' }, status: :unauthorized
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'User not found' }, status: :unauthorized
    end
  end
  
  def logout
    cookies.delete(:refresh_token)
    render json: { message: 'Logged out successfully' }
  end
  
  private
  
  def generate_access_token(user)
    JWT.encode(
      { 
        user_id: user.id, 
        email: user.email, 
        exp: 15.minutes.from_now.to_i 
      },
      jwt_secret,
      'HS256'
    )
  end
  
  def generate_refresh_token(user)
    JWT.encode(
      { 
        user_id: user.id, 
        email: user.email, 
        exp: 7.days.from_now.to_i 
      },
      jwt_secret,
      'HS256'
    )
  end
  
  def jwt_secret
    Rails.application.secret_key_base
  end
end
```

## Application Controller with Authentication

```ruby
# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  before_action :authenticate_user!
  
  private
  
  def authenticate_user!
    token = request.headers['Authorization']&.split(' ')&.last
    
    if token.blank?
      render json: { error: 'Access token required' }, status: :unauthorized
      return
    end
    
    begin
      decoded = JWT.decode(token, jwt_secret, true, { algorithm: 'HS256' })
      @current_user = User.find(decoded[0]['user_id'])
    rescue JWT::DecodeError => e
      render json: { error: 'Invalid access token' }, status: :unauthorized
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'User not found' }, status: :unauthorized
    end
  end
  
  def current_user
    @current_user
  end
  
  def jwt_secret
    Rails.application.secret_key_base
  end
end
```

## Protected Controller Example

```ruby
# app/controllers/api/users_controller.rb
class Api::UsersController < ApplicationController
  def show
    render json: { user: current_user }
  end
  
  def profile
    render json: {
      user: current_user,
      profile_data: {
        last_login: current_user.last_login_at,
        created_at: current_user.created_at
      }
    }
  end
end
```

```ruby
# app/controllers/api/protected_data_controller.rb
class Api::ProtectedDataController < ApplicationController
  def index
    render json: {
      message: 'This is protected data',
      user: current_user,
      data: [1, 2, 3, 4, 5]
    }
  end
end
```

## Routes Configuration

```ruby
# config/routes.rb
Rails.application.routes.draw do
  # Authentication routes
  post '/auth/login', to: 'auth#login'
  post '/auth/refresh', to: 'auth#refresh'
  post '/auth/logout', to: 'auth#logout'
  
  # Protected API routes
  namespace :api do
    resources :users, only: [:show] do
      get :profile, on: :member
    end
    
    resources :protected_data, only: [:index]
  end
  
  # Health check
  get '/health', to: 'application#health'
end
```

## User Model Setup

Make sure your User model has password authentication:

```ruby
# app/models/user.rb
class User < ApplicationRecord
  has_secure_password
  
  validates :email, presence: true, uniqueness: true
  validates :name, presence: true
  
  before_save :downcase_email
  
  private
  
  def downcase_email
    self.email = email.downcase
  end
end
```

## Environment Variables

Add to your `.env` file:

```env
FRONTEND_URL=http://localhost:3000
RAILS_ENV=development
```

## Advanced Authentication Features

### Token Blacklisting

```ruby
# app/models/refresh_token.rb
class RefreshToken < ApplicationRecord
  belongs_to :user
  
  validates :token, presence: true, uniqueness: true
  validates :expires_at, presence: true
  
  scope :active, -> { where('expires_at > ?', Time.current) }
  
  def expired?
    expires_at < Time.current
  end
end
```

```ruby
# Enhanced auth_controller.rb with token storage
class AuthController < ApplicationController
  def login
    user = User.find_by(email: params[:email])
    
    if user&.authenticate(params[:password])
      access_token = generate_access_token(user)
      refresh_token = generate_refresh_token(user)
      
      # Store refresh token in database
      user.refresh_tokens.create!(
        token: refresh_token,
        expires_at: 7.days.from_now
      )
      
      # Set httpOnly cookie
      cookies[:refresh_token] = {
        value: refresh_token,
        httponly: true,
        secure: Rails.env.production?,
        same_site: :strict,
        expires: 7.days.from_now
      }
      
      render json: {
        access_token: access_token,
        expires_in: 15.minutes.to_i,
        user: user_response(user)
      }
    else
      render json: { error: 'Invalid credentials' }, status: :unauthorized
    end
  end
  
  def refresh
    refresh_token = cookies[:refresh_token]
    
    if refresh_token.blank?
      render json: { error: 'Refresh token not provided' }, status: :unauthorized
      return
    end
    
    # Verify token exists in database and is not expired
    stored_token = RefreshToken.active.find_by(token: refresh_token)
    
    if stored_token.blank?
      render json: { error: 'Invalid refresh token' }, status: :unauthorized
      return
    end
    
    begin
      decoded = JWT.decode(refresh_token, jwt_secret, true, { algorithm: 'HS256' })
      user = stored_token.user
      
      new_access_token = generate_access_token(user)
      
      render json: {
        access_token: new_access_token,
        expires_in: 15.minutes.to_i
      }
    rescue JWT::DecodeError => e
      # Remove invalid token from database
      stored_token&.destroy
      render json: { error: 'Invalid refresh token' }, status: :unauthorized
    end
  end
  
  def logout
    refresh_token = cookies[:refresh_token]
    
    if refresh_token.present?
      # Remove token from database
      RefreshToken.find_by(token: refresh_token)&.destroy
    end
    
    cookies.delete(:refresh_token)
    render json: { message: 'Logged out successfully' }
  end
  
  private
  
  def user_response(user)
    {
      id: user.id,
      email: user.email,
      name: user.name,
      created_at: user.created_at
    }
  end
end
```

### Rate Limiting

```ruby
# Gemfile
gem 'rack-attack', '~> 6.6'
```

```ruby
# config/initializers/rack_attack.rb
class Rack::Attack
  # Throttle login attempts
  throttle('login/email', limit: 5, period: 15.minutes) do |req|
    if req.path == '/auth/login' && req.post?
      req.params['email']&.downcase
    end
  end
  
  # Throttle refresh attempts
  throttle('refresh/ip', limit: 10, period: 1.minute) do |req|
    req.ip if req.path == '/auth/refresh' && req.post?
  end
end
```

## Testing the API

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# Access protected endpoint
curl -X GET http://localhost:3000/api/protected_data \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt

# Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -b cookies.txt
```

## Security Considerations

1. **Use Environment Variables**: Never hardcode secrets in your code
2. **HTTPS in Production**: Always use HTTPS in production environments
3. **Token Expiration**: Use short-lived access tokens (15 minutes)
4. **Refresh Token Rotation**: Consider rotating refresh tokens on each use
5. **Rate Limiting**: Implement rate limiting on authentication endpoints
6. **Database Indexing**: Add indexes on frequently queried fields

```ruby
# db/migrate/add_indexes_to_refresh_tokens.rb
class AddIndexesToRefreshTokens < ActiveRecord::Migration[7.0]
  def change
    add_index :refresh_tokens, :token, unique: true
    add_index :refresh_tokens, :user_id
    add_index :refresh_tokens, :expires_at
  end
end
```

## Next Steps

- [React Integration Guide](./react.md)
- [Vue Integration Guide](./vue.md)
- [Svelte Integration Guide](./svelte.md)
- [Express.js Integration Guide](./express.md)
- [Next.js Integration Guide](./nextjs.md)
