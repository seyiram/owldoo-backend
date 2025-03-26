// Test script to verify conversation-thread relationship
const mongoose = require('mongoose');
require('./dist/models/Thread'); // Load the Thread model
require('./dist/models/Conversation'); // Load the Conversation model

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/owldoo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  // Get the userId from command line arguments
  const userId = process.argv[2] || "65f3a19f34d92b50b3c3fb3a"; // Default userId - replace with a valid one
  
  try {
    // Get the Thread and Conversation models
    const Thread = mongoose.model('Thread');
    const Conversation = mongoose.model('Conversation');
    
    // Create a unique conversation ID for testing
    const conversationId = `test-conversation-${Date.now()}`;
    
    console.log(`Creating conversation with ID: ${conversationId} for user: ${userId}`);
    
    // 1. Create a test conversation
    const conversation = await Conversation.create({
      userId: new mongoose.Types.ObjectId(userId),
      conversationId,
      startTime: new Date(),
      lastActivityTime: new Date(),
      turns: [
        {
          speaker: 'user',
          content: 'This is a test message',
          timestamp: new Date()
        },
        {
          speaker: 'assistant',
          content: 'This is a test response',
          timestamp: new Date()
        }
      ],
      context: {
        activeEntities: {},
        referencedEvents: [],
        goals: [],
        environmentContext: {
          timezone: 'UTC'
        }
      },
      isActive: true
    });
    
    console.log(`Conversation created: ${conversation._id}`);
    
    // 2. Create a thread linked to this conversation
    const thread = await Thread.create({
      userId: new mongoose.Types.ObjectId(userId),
      messages: [
        {
          sender: 'user',
          content: 'This is a test message in thread',
          timestamp: new Date().toISOString()
        },
        {
          sender: 'assistant', // Using assistant instead of bot to test the enum fix
          content: 'This is a test response in thread',
          timestamp: new Date().toISOString()
        }
      ],
      createdAt: new Date(),
      conversationId, // Link to the conversation
      processingSteps: [] // Initialize with empty array
    });
    
    console.log(`Thread created with ID: ${thread._id}`);
    
    // 3. Update the conversation with the threadId
    await Conversation.findByIdAndUpdate(
      conversation._id,
      { $set: { threadId: thread._id } }
    );
    
    console.log(`Updated conversation with threadId: ${thread._id}`);
    
    // 4. Verify the link works both ways
    const fetchedConversation = await Conversation.findOne({ conversationId });
    const fetchedThread = await Thread.findById(thread._id);
    
    console.log('\nVerification Results:');
    
    if (fetchedConversation && fetchedConversation.threadId) {
      console.log(`✅ Conversation -> Thread link works: ${fetchedConversation.threadId}`);
    } else {
      console.log('❌ Conversation -> Thread link FAILED');
    }
    
    if (fetchedThread && fetchedThread.conversationId === conversationId) {
      console.log(`✅ Thread -> Conversation link works: ${fetchedThread.conversationId}`);
    } else {
      console.log('❌ Thread -> Conversation link FAILED');
    }
    
    // 5. Count existing threads and conversations
    const threadCount = await Thread.countDocuments();
    const conversationCount = await Conversation.countDocuments();
    
    console.log(`\nDatabase stats:`);
    console.log(`Total threads in database: ${threadCount}`);
    console.log(`Total conversations in database: ${conversationCount}`);
    
    // 6. Check if all threads have conversationId
    const threadsWithoutConversation = await Thread.countDocuments({ conversationId: { $exists: false } });
    const conversationsWithoutThread = await Conversation.countDocuments({ threadId: { $exists: false } });
    
    console.log(`Threads missing conversationId: ${threadsWithoutConversation}`);
    console.log(`Conversations missing threadId: ${conversationsWithoutThread}`);
    
    // Disconnect from MongoDB
    mongoose.disconnect();
  } catch (err) {
    console.error('Error creating thread:', err);
    mongoose.disconnect();
  }
})
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
});