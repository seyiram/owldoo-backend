# Owldoo Backend Commands and Guidelines

## Build Commands
- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run compiled JavaScript
- `npm run migrate:status` - Check migration status
- `npm run migrate:up` - Run database migrations
- `npm run migrate:down` - Revert last migration

## API and Authentication
- **NEVER hardcode URLs**: Use configurable base URLs and environment variables
- **Route Consistency**: Ensure route paths match exactly between frontend and backend
  - Mounted routes (/api, /calendar) must be considered in path matching
  - Root-level routes (/health) must be explicitly documented for frontend proxy configuration
- **Route Documentation**: Document all route paths in a consistent location
- **Cookies**: Use HTTP-only cookies for auth tokens with proper expiry and security settings
- **Auth Headers**: Include explicit auth header checks in middleware
- **CORS Configuration**: Set CORS with proper origin, credentials, and methods
- **Response Format**: Maintain consistent response format across all endpoints
  - Success: `{ success: true, data: any }`
  - Error: `{ error: string, message: string }`
- **Status Codes**: Use appropriate HTTP status codes consistently (401 for auth errors, etc)
- **Expiry Information**: Always include token expiry information in auth responses

## Error Handling and Logging
- **Try/Catch**: Use try/catch in all async controller methods
- **Error Types**: Use instanceof Error for proper error type checking
- **Response Safety**: Never expose internal errors directly to clients
- **Logging**: Use detailed logging with context information
- **Request Tracing**: Include request IDs in logs for traceability
- **Recovery**: Implement graceful recovery paths for auth failures
- **Validation**: Validate all request inputs before processing

## Code Style Guidelines
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces/types, prefix interfaces with 'I'
- **File Structure**: lowercase filenames with dot notation (auth.controller.ts)
- **Typing**: Use TypeScript strict mode with explicit types for parameters and return values
- **State Management**: Use singleton pattern for services (export const serviceName = new ServiceClass())
- **Authentication**: Auth middleware verifies user token before controller actions
- **MongoDB/Mongoose**: Define schemas with proper types and validation rules
- **Async**: Use async/await pattern consistently (not Promises with then/catch)
- **Comments**: Add clear comments for function descriptions and complex logic
- **Formatting**: 2-space indentation

## Google Calendar Integration
- **Token Management**: Store tokens securely with proper refresh handling
- **Auth Separation**: Keep Google Calendar auth separate from application auth
- **Error Recovery**: Implement robust error handling for API failures
- **Status Endpoints**: Provide dedicated endpoints for checking auth status
- **Session Management**: Use sessions to track authentication state

## Debugging Authentication
- Debug cookie presence with `req.cookies` logging
- Check token validity and expiration
- Verify CORS headers on responses
- Test endpoint access with and without authentication
- Monitor token refresh operations
- Check localStorage and cookie synchronization with frontend

## Connection & Route Debugging
- Verify all routes are properly defined and mounted in app.ts
- Ensure route paths in controllers match frontend API calls exactly
- Check CORS settings for all necessary origins, methods, and headers
- Verify that root-level routes are documented for frontend proxy configuration
- Test all endpoints directly with tools like curl or Postman
- For 404 errors, double-check route mounting and proxy configurations
- Log all incoming requests in development mode with URL path and method