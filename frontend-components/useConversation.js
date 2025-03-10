import { useState, useCallback } from 'react';

/**
 * Custom hook to manage conversation state and interactions
 * @param {Object} options Configuration options
 * @param {Function} options.onSendMessage Function to call when sending a message
 * @returns {Object} Hook methods and state
 */
const useConversation = ({ onSendMessage }) => {
  // Conversation state
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);

  /**
   * Send a message to the backend
   * @param {string} content Message content
   * @param {boolean} isFromSuggestion Whether the message is from clicking a suggestion
   */
  const sendMessage = useCallback(async (content, isFromSuggestion = false) => {
    if (!content.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Add user message to the list
      const userMessage = {
        id: Date.now().toString(),
        content,
        sender: 'user',
        timestamp: new Date().toISOString(),
        isFromSuggestion
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // Send to backend
      const response = await onSendMessage({
        message: content,
        conversationId
      });
      
      // Handle response
      if (response) {
        // Update conversation and thread IDs
        if (response.conversationId) {
          setConversationId(response.conversationId);
        }
        
        if (response.threadId) {
          setThreadId(response.threadId);
        }
        
        // Add bot message to the list
        const botMessage = {
          id: response.id || Date.now().toString() + '-bot',
          content: response.content,
          sender: 'bot',
          timestamp: new Date().toISOString(),
          intent: response.intent,
          action: response.action
        };
        
        setMessages(prev => [...prev, botMessage]);
        
        // Update suggestions and follow-up questions
        setSuggestions(response.suggestions || []);
        setFollowUpQuestions(response.followUpQuestions || []);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  }, [conversationId, onSendMessage]);

  /**
   * Handle when a suggestion or follow-up question is clicked
   * @param {string} text Suggestion text
   */
  const handleSuggestionClick = useCallback((text) => {
    // Send the suggestion text as a new user message
    sendMessage(text, true);
    
    // Clear suggestions and follow-up questions after clicking
    setSuggestions([]);
    setFollowUpQuestions([]);
  }, [sendMessage]);

  /**
   * Reset the conversation
   */
  const resetConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setThreadId(null);
    setSuggestions([]);
    setFollowUpQuestions([]);
    setError(null);
  }, []);

  return {
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
  };
};

export default useConversation;