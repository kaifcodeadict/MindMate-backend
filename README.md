# Mental Health App Backend

A comprehensive Node.js backend for an AI-powered mental health and wellness application.

## Features

- **User Authentication**: Google OAuth integration with session management
- **Mood Tracking**: Daily mood check-ins with analytics and history
- **Analytics**: Mood trends, task completion stats, and insights
- **Rate Limiting**: Protection against API abuse
- **Security**: Helmet.js, CORS, and input validation

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Clerk
- **Payments**: Razor Pay
- **AI**: Openrouter mistralai/mistral-7b-instruct:free
- **Security**: Helmet, CORS, Rate Limiting

## Installation

1. **Clone and Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Required Environment Variables**
   ```
   MONGODB_URI=mongodb://localhost:27017/mental-health-app
   JWT_SECRET=your-jwt-secret
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   SESSION_SECRET=your-session-secret
   OPENAI_API_KEY=your-openai-api-key
   STRIPE_SECRET_KEY=your-stripe-secret-key
   STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
   FRONTEND_URL=http://localhost:5173
   ```

4. **Database Setup**
   - Install MongoDB locally or use MongoDB Atlas
   - Update MONGODB_URI in .env file

5. **Start Development Server**
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `GET /api/auth/google` - Start Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/preferences` - Update user preferences
- `POST /api/auth/logout` - Logout user

### Mood Tracking
- `POST /api/mood/check-in` - Submit daily mood
- `GET /api/mood/today` - Get today's mood
- `GET /api/mood/history` - Get mood history
- `GET /api/mood/analytics` - Get mood analytics

### Task Management
- `POST /api/task/daily` - Generate daily task
- `GET /api/task/:date` - Get task for date
- `PATCH /api/task/step/:stepId` - Update step completion
- `PATCH /api/task/:taskId/complete` - Mark task complete
- `GET /api/task/calendar/:year/:month` - Get calendar data
- `GET /api/task/stats/overview` - Get task statistics

### AI Chat (Premium)
- `POST /api/chat/send` - Send message to AI
- `GET /api/chat/history` - Get chat history
- `GET /api/chat/session/:sessionId` - Get specific session
- `DELETE /api/chat/session/:sessionId` - Delete session
- `GET /api/chat/analytics` - Get chat analytics

### Payments
- `POST /api/payment/create-session` - Create Stripe session
- `POST /api/payment/webhook` - Handle Stripe webhooks
- `GET /api/payment/status` - Get payment status
- `GET /api/payment/history` - Get payment history

### Onboarding (Emotional Context)
- `POST /api/onboarding-step` - Submit onboarding emotional response (authenticated, Clerk). Payload: `{ "question": "Question text", "response": ["Selected", "Answers"] }`. Stores/updates user's emotional onboarding answers.

## Database Models

### User
- Google OAuth profile info
- Premium subscription status
- Streak tracking
- User preferences

### Mood
- Daily mood entries
- Mood scores and factors
- Analytics and trends

### Task
- AI-generated daily tasks
- Step-by-step completion tracking
- Task categories and difficulty

### Chat
- AI conversation history
- Mood detection from messages
- Session management

### Payment
- Stripe transaction records
- Subscription management
- Payment history

### EmotionalContext
- Stores onboarding emotional responses per user (one document per user, identified by clerkId)
- `clerkId`: Clerk user ID
- `responses`: Array of `{ question: String, response: [String] }` pairs

## AI Integration

### Task Generation
- Personalized tasks based on mood
- Contextual difficulty adjustment
- Category-based recommendations

### Chat Assistant
- Empathetic mental health support
- Mood detection and analysis
- Crisis intervention awareness

## Security Features

- **Rate Limiting**: API endpoint protection
- **CORS**: Cross-origin request handling
- **Helmet**: Security headers
- **Input Validation**: Request sanitization
- **Authentication**: JWT and session-based auth
- **Premium Protection**: Feature access control

## Development

### Running Tests
```bash
npm test
```

### Seed Sample Data
```bash
node scripts/seedData.js
```

### Code Structure
```
backend/
├── controllers/     # Request handlers
├── models/         # Database schemas
├── routes/         # API endpoints
├── middleware/     # Auth, validation, etc.
├── services/       # Business logic
├── config/         # Configuration files
├── scripts/        # Utility scripts
└── app.js          # Express app setup
```

## Deployment

### Production Setup
1. Set NODE_ENV=production
2. Use environment variables for all secrets
3. Enable SSL/HTTPS
4. Configure reverse proxy (nginx)
5. Set up process manager (PM2)

### Database
- Use MongoDB Atlas for production
- Set up proper indexes
- Configure backup strategy

### Monitoring
- Log aggregation
- Error tracking
- Performance monitoring
- Health checks

## Contributing

1. Follow the established code structure
2. Add proper error handling
3. Include input validation
4. Write comprehensive tests
5. Update documentation

## License

MIT License
