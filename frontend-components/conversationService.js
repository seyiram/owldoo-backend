/**
 * API service for conversation-related operations
 */
class ConversationService {
  /**
   * Base URL for conversation API
   * @type {string}
   */
  baseUrl = '/api/conversation';

  /**
   * Send a message to the conversation API
   * @param {Object} params Request parameters
   * @param {string} params.message Message content
   * @param {string} [params.conversationId] Conversation ID for existing conversations
   * @returns {Promise<Object>} Response from the server
   */
  async sendConversationMessage({ message, conversationId }) {
    try {
      const response = await fetch(`${this.baseUrl}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversationId
        }),
        credentials: 'include' // Include cookies for authentication
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      
      // Log the response for debugging
      console.log('Response from sendConversationMessage:', data);
      
      return data;
    } catch (error) {
      console.error('Error in sendConversationMessage:', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   * @param {string} conversationId Conversation ID
   * @returns {Promise<Object>} Conversation history
   */
  async getConversationHistory(conversationId) {
    try {
      const response = await fetch(`${this.baseUrl}/${conversationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get conversation history');
      }

      return await response.json();
    } catch (error) {
      console.error('Error in getConversationHistory:', error);
      throw error;
    }
  }

  /**
   * Get conversation by thread ID
   * @param {string} threadId Thread ID
   * @returns {Promise<Object>} Conversation data
   */
  async getConversationByThread(threadId) {
    try {
      const response = await fetch(`${this.baseUrl}/thread/${threadId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get conversation by thread');
      }

      return await response.json();
    } catch (error) {
      console.error('Error in getConversationByThread:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const conversationService = new ConversationService();
export default conversationService;