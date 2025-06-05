# Owldoo Backend

An AI calendar management system that enables natural language interaction for managing your calendar events and schedules.

## Features

- 🤖 Conversational AI interface for calendar management
- 🔐 Google Authentication integration
- 📅 Google Calendar integration
- 📊 MongoDB database with migration support
- 📝 Natural language processing for event parsing
- 🔄 Real-time calendar updates

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB
- **Authentication**: Google OAuth
- **Calendar Integration**: Google Calendar API
- **AI Integration**: Anthropic Claude
- **Logging**: Winston

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Google Cloud Platform account (for Calendar API and OAuth)
- Anthropic API key

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd owldoo-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
MONGODB_URI=your_mongodb_uri
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
ANTHROPIC_API_KEY=your_anthropic_api_key
```

4. Run database migrations:
```bash
npm run migrate:up
```

## Development

Start the development server:
```bash
npm run dev
```

## Production

Build and start the production server:
```bash
npm run build
npm start
```

## API Documentation

The API endpoints are organized into the following categories:

- `/auth` - Google OAuth endpoints
- `/calendar` - Calendar management endpoints
- `/ai` - Natural language processing endpoints

## Database Migrations

- Check migration status: `npm run migrate:status`
- Apply migrations: `npm run migrate:up`
- Rollback migrations: `npm run migrate:down`

## Project Structure

```
src/
├── config/     # Configuration files
├── controllers/# Request handlers
├── middleware/ # Express middleware
├── models/     # Database models
├── routes/     # API routes
├── services/   # Business logic
├── types/      # TypeScript type definitions
└── utils/      # Utility functions
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
