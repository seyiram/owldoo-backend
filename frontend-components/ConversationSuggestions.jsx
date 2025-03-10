import React from 'react';
import './ConversationSuggestions.css';

/**
 * Component to display suggestions and follow-up questions in the chat UI
 * @param {Object} props Component props
 * @param {Array} props.suggestions Array of suggestion strings
 * @param {Array} props.followUpQuestions Array of follow-up question strings
 * @param {Function} props.onSuggestionClick Function to handle when a suggestion is clicked
 * @returns {JSX.Element} Rendered component
 */
const ConversationSuggestions = ({ 
  suggestions = [], 
  followUpQuestions = [], 
  onSuggestionClick 
}) => {
  // Skip rendering if there are no suggestions or questions
  if (suggestions.length === 0 && followUpQuestions.length === 0) {
    return null;
  }

  // Handle click on a suggestion or follow-up question
  const handleClick = (text) => {
    if (onSuggestionClick) {
      onSuggestionClick(text);
    }
  };

  return (
    <div className="conversation-suggestions-container">
      {/* Render suggestions with a different style than follow-up questions */}
      {suggestions.length > 0 && (
        <div className="suggestions-section">
          <h4>Suggestions</h4>
          <div className="suggestions-list">
            {suggestions.map((suggestion, index) => (
              <button
                key={`suggestion-${index}`}
                className="suggestion-button"
                onClick={() => handleClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Render follow-up questions */}
      {followUpQuestions.length > 0 && (
        <div className="followup-section">
          <h4>Follow-up Questions</h4>
          <div className="followup-list">
            {followUpQuestions.map((question, index) => (
              <button
                key={`followup-${index}`}
                className="followup-button"
                onClick={() => handleClick(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationSuggestions;