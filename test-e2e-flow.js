// Mock the authentication for testing
require('./dist/models/User');

const mongoose = require('mongoose');
const { conversationService } = require('./dist/services/conversation.service');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/owldoo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Get a valid userId from command line or use default
    const userId = process.argv[2] || "65f3a19f34d92b50b3c3fb3a";
    
    // Test message
    const testMessage = "Test e2e flow: Schedule a meeting at 2pm tomorrow";
    
    console.log(`Sending message to conversation service: "${testMessage}"`);
    console.log(`Using userId: ${userId}`);
    
    // Count threads before creating new one
    const Thread = mongoose.model('Thread');
    const threadsBefore = await Thread.countDocuments();
    console.log(`Thread count before test: ${threadsBefore}`);
    
    // Process a message through the conversation service
    const response = await conversationService.processUserMessage(
      userId,
      testMessage
    );
    
    console.log('\nResponse from conversation service:');
    console.log(`- Conversation ID: ${response.conversationId}`);
    console.log(`- Thread ID: ${response.threadId || 'None'}`);
    console.log(`- Content: ${response.content}`);
    
    // If we got a threadId, check that thread in the database
    if (response.threadId) {
      console.log(`\nLooking up thread ${response.threadId} in database...`);
      const thread = await Thread.findById(response.threadId);
      
      if (thread) {
        console.log('Thread found:');
        console.log(`- ID: ${thread._id}`);
        console.log(`- Conversation ID: ${thread.conversationId}`);
        console.log(`- Messages: ${thread.messages.length}`);
        
        thread.messages.forEach((msg, idx) => {
          console.log(`  [${idx}] [${msg.sender}]: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
        });
      } else {
        console.error('Thread not found despite having threadId in response!');
      }
    } else {
      console.warn('No threadId returned in the response');
    }
    
    // Count threads after creating new one
    const threadsAfter = await Thread.countDocuments();
    console.log(`\nThread count after test: ${threadsAfter}`);
    console.log(`New threads created: ${threadsAfter - threadsBefore}`);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Disconnect from MongoDB
    mongoose.disconnect();
  }
})
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
});