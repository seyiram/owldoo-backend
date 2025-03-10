import React, { useState, useRef, useEffect } from 'react';
import './ConversationComponent.css';
import ConversationSuggestions from './ConversationSuggestions';
import useConversation from './useConversation';
import conversationService from './conversationService';

/**
 * Main conversation component with message input, history, and suggestions
 * @returns {JSX.Element} Rendered component
 */
const ConversationComponent = () => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  
  // Initialize conversation hook with the conversation service
  const {
    messages,
    loading,
    error,
    conversationId,
    threadId,
    suggestions,
    followUpQuestions,
    sendMessage,
    handleSuggestionClick,
    resetConversation
  } = useConversation({
    onSendMessage: conversationService.sendConversationMessage.bind(conversationService)
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  // Render a message
  const renderMessage = (message) => {
    const isUser = message.sender === 'user';
    
    return (
      <div 
        key={message.id} 
        className={`message ${isUser ? 'user-message' : 'bot-message'} ${message.isFromSuggestion ? 'from-suggestion' : ''}`}
      >
        <div className="message-bubble">
          {message.content}
        </div>
        <div className="message-timestamp">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    );
  };

  // State for processing steps
  const [processingSteps, setProcessingSteps] = useState([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  
  // Fetch thread with processing steps when threadId changes
  useEffect(() => {
    if (!threadId) return;
    
    const fetchProcessingSteps = async () => {
      setLoadingSteps(true);
      try {
        const threadData = await conversationService.getConversationByThread(threadId);
        if (threadData && threadData.processingSteps) {
          setProcessingSteps(threadData.processingSteps);
        }
      } catch (error) {
        console.error('Error fetching thread processing steps:', error);
      } finally {
        setLoadingSteps(false);
      }
    };
    
    fetchProcessingSteps();
    
    // Periodically refresh steps to show updated status
    const intervalId = setInterval(fetchProcessingSteps, 5000);
    return () => clearInterval(intervalId);
  }, [threadId]);
  
  // Render processing steps
  const renderProcessingSteps = () => {
    // Skip rendering if no steps or no thread
    if (!threadId || processingSteps.length === 0) {
      return loadingSteps ? <div className="loading-steps">Loading processing steps...</div> : null;
    }
    
    // Render the processing steps
    return (
      <div className="process-steps">
        <h4>Processing Steps</h4>
        {processingSteps.map((step, index) => (
          <div key={index} className="process-step">
            <div className={`step-icon ${step.stepType.toLowerCase()}`}>
              {step.stepType === 'STARTED' && '▶️'}
              {step.stepType === 'PROGRESS' && '⏳'}
              {step.stepType === 'COMPLETED' && '✅'}
              {step.stepType === 'ERROR' && '❌'}
            </div>
            <div className="step-content">
              <div className="step-description">{step.description}</div>
              <div className="step-timestamp">
                {new Date(step.timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  second: '2-digit' 
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="conversation-container">
      <div className="conversation-header">
        <h2>Owldoo Assistant</h2>
        {conversationId && (
          <button className="reset-button" onClick={resetConversation}>
            New Conversation
          </button>
        )}
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h3>How can I help you today?</h3>
            <p>Try asking me to schedule a meeting or check your calendar.</p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        
        {renderProcessingSteps()}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {/* Element to scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions component */}
      <ConversationSuggestions
        suggestions={suggestions}
        followUpQuestions={followUpQuestions}
        onSuggestionClick={handleSuggestionClick}
      />

      {/* Message input */}
      <form className="message-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Type a message..."
          disabled={loading}
          className="message-input"
        />
        <button 
          type="submit" 
          disabled={loading || !inputValue.trim()} 
          className="send-button"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
      
      {/* Debug info for development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info">
          <details>
            <summary>Debug Info</summary>
            <p>Conversation ID: {conversationId || 'None'}</p>
            <p>Thread ID: {threadId || 'None'}</p>
            <p>Messages: {messages.length}</p>
            <p>Suggestions: {suggestions.length}</p>
            <p>Follow-up Questions: {followUpQuestions.length}</p>
          </details>
        </div>
      )}
    </div>
  );
};

export default ConversationComponent;