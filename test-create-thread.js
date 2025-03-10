// Test script to create a new thread with a specific message
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
    
    // Create a new thread
    const thread = await Thread.create({
      userId: new mongoose.Types.ObjectId(userId),
      messages: [
        {
          sender: 'user',
          content: message,
          timestamp: new Date().toISOString()
        },
        {
          sender: 'bot',
          content: `Response to: ${message}`,
          timestamp: new Date().toISOString()
        }
      ],
      createdAt: new Date()
    });
    
    console.log(`Thread created with ID: ${thread._id}`);
    console.log('Thread details:');
    console.log('Messages:');
    thread.messages.forEach((message, index) => {
      console.log(`[${index}] [${message.sender}]: ${message.content}`);
    });
    
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