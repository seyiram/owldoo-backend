# Owldoo Backend Commands and Guidelines

## Build Commands
- `npm run dev` - Start development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run compiled JavaScript
- `npm run migrate:status` - Check migration status
- `npm run migrate:up` - Run database migrations
- `npm run migrate:down` - Revert last migration

## Code Style Guidelines
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces/types, prefix interfaces with 'I'
- **File Structure**: lowercase filenames with dot notation (auth.controller.ts)
- **Typing**: Use TypeScript strict mode with explicit types for parameters and return values
- **Error Handling**: Use try/catch in all async functions with instanceof Error type checks
- **State Management**: Use singleton pattern for services (export const serviceName = new ServiceClass())
- **Authentication**: Auth middleware verifies user token before controller actions
- **MongoDB/Mongoose**: Define schemas with proper types and validation rules
- **Async**: Use async/await pattern consistently (not Promises with then/catch)
- **Comments**: Add clear comments for function descriptions and complex logic
- **Formatting**: 2-space indentation

## Error Response Format
Always return consistent error format: `{ error: string, message: string }`