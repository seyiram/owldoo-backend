const mongoose = require('mongoose');
require('./dist/models/index.js');

async function debugThreads() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/owldoo');
    console.log('Connected to MongoDB');
    
    // Get all threads
    const Thread = mongoose.model('Thread');
    const allThreads = await Thread.find({});
    
    console.log(`===== THREAD DEBUG INFO =====`);
    console.log(`Total threads in database: ${allThreads.length}`);
    
    // Get details of each thread
    allThreads.forEach((thread, index) => {
      console.log(`\nTHREAD #${index + 1}:`);
      console.log(`ID: ${thread._id}`);
      console.log(`User ID: ${thread.userId}`);
      console.log(`Conversation ID: ${thread.conversationId || 'NONE'}`);
      console.log(`Created At: ${thread.createdAt}`);
      console.log(`Messages: ${thread.messages.length}`);
      
      // Print first message of each thread
      if (thread.messages && thread.messages.length > 0) {
        const firstMessage = thread.messages[0];
        console.log(`First message: ${firstMessage.content.substring(0, 50)}...`);
        console.log(`First message sender: ${firstMessage.sender}`);
      }
    });
    
    // Get all conversations
    const Conversation = mongoose.model('Conversation');
    const allConversations = await Conversation.find({});
    
    console.log(`\n===== CONVERSATION DEBUG INFO =====`);
    console.log(`Total conversations in database: ${allConversations.length}`);
    
    // Get details of each conversation
    allConversations.forEach((conv, index) => {
      console.log(`\nCONVERSATION #${index + 1}:`);
      console.log(`ID: ${conv._id}`);
      console.log(`Conversation ID: ${conv.conversationId}`);
      console.log(`User ID: ${conv.userId}`);
      console.log(`Thread ID: ${conv.threadId || 'NONE'}`);
      console.log(`Created At: ${conv.createdAt}`);
    });
    
    // Count threads missing conversationId
    const threadsWithoutConversation = allThreads.filter(t => !t.conversationId);
    console.log(`\nThreads missing conversationId: ${threadsWithoutConversation.length}`);
    
    // Count conversations missing threadId
    const conversationsWithoutThread = allConversations.filter(c => !c.threadId);
    console.log(`Conversations missing threadId: ${conversationsWithoutThread.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error debugging threads:', error);
    process.exit(1);
  }
}

debugThreads();