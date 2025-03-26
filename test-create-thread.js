// Updated test script to create a new thread and test our fixes
const mongoose = require('mongoose');
require('./dist/models/Thread'); // Load the Thread model

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/owldoo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  // Get the message from command line arguments
  const message = process.argv[2] || "Test message created at " + new Date().toISOString();
  const userId = process.argv[3] || "65f3a19f34d92b50b3c3fb3a"; // Default userId - replace with a valid one
  
  try {
    // Get the Thread model
    const Thread = mongoose.model('Thread');
    
    console.log(`Creating thread with message: "${message}" for user: ${userId}`);
    
    // Create a new thread with all required fields
    const thread = await Thread.create({
      userId: new mongoose.Types.ObjectId(userId),
      messages: [
        {
          sender: 'user',
          content: message,
          timestamp: new Date().toISOString()
        },
        {
          sender: 'assistant', // Use assistant instead of bot to test the enum fix
          content: `Response to: ${message}`,
          timestamp: new Date().toISOString()
        }
      ],
      createdAt: new Date(),
      conversationId: "test-conversation-" + Date.now(),
      processingSteps: [] // Initialize with empty array
    });
    
    console.log(`Thread created with ID: ${thread._id}`);
    console.log('Thread details:');
    console.log('Messages:');
    thread.messages.forEach((message, index) => {
      console.log(`[${index}] [${message.sender}]: ${message.content}`);
    });
    
    // Now let's retrieve the thread to verify it exists
    const retrievedThread = await Thread.findById(thread._id);
    console.log('\nRetrieved thread from database:');
    if (retrievedThread) {
      console.log(`- ID: ${retrievedThread._id}`);
      console.log(`- Conversation ID: ${retrievedThread.conversationId}`);
      console.log(`- Number of messages: ${retrievedThread.messages.length}`);
      console.log(`- Processing steps: ${JSON.stringify(retrievedThread.processingSteps)}`);
    } else {
      console.error('Failed to retrieve thread!');
    }
    
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