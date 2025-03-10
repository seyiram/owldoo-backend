# Owldoo Frontend Components

This directory contains React components for implementing the conversation UI in the Owldoo frontend application. These components handle suggestions, follow-up questions, and agent processing steps.

## Components Overview

### 1. ConversationComponent

The main component that renders the conversation UI including:
- Message history
- Processing steps
- Suggestions and follow-up questions
- Message input

### 2. ConversationSuggestions

A reusable component that displays suggestions and follow-up questions from the backend as clickable buttons.

## Services and Hooks

### useConversation Hook

A custom React hook that manages conversation state and provides methods for:
- Sending messages
- Handling suggestion clicks
- Managing conversation state

### conversationService

A service that handles API calls to the backend for:
- Sending messages
- Getting conversation history
- Getting thread data with processing steps

## Integration Instructions

1. Copy these components into your React frontend project
2. Install required dependencies:
   ```
   npm install react react-dom
   ```
3. Import and use the ConversationComponent in your app:
   ```jsx
   import ConversationComponent from './path/to/ConversationComponent';
   
   function App() {
     return (
       <div className="app">
         <ConversationComponent />
       </div>
     );
   }
   ```

## Features

- **Suggestions and Follow-up Questions**: Clickable suggestions that send the text as a user message
- **Real-time Processing Steps**: Displays agent processing steps with status indicators
- **Responsive Design**: Works on mobile and desktop
- **Auto-scroll**: Automatically scrolls to the latest message
- **Debug Info**: Shows useful debug information in development mode

## API Integration

The components expect the backend to return responses in the following format:

```json
{
  "content": "Response text",
  "intent": {
    "primaryIntent": "create",
    "confidence": 0.8,
    "entities": {}
  },
  "action": {
    "type": "create",
    "parameters": {},
    "status": "completed"
  },
  "suggestions": [
    "Would you like to add attendees to this event?",
    "Do you want to make this a recurring event?"
  ],
  "followUpQuestions": [
    "Would you like me to send a notification?"
  ],
  "conversationId": "conversation-id",
  "threadId": "thread-id"
}
```

When suggestions are clicked, they're sent as regular user messages to the backend.

## Customization

You can customize the appearance by modifying the CSS files:
- `ConversationComponent.css` - Main conversation UI styling
- `ConversationSuggestions.css` - Styling for suggestions and follow-up questions