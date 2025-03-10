// Debug script to check a specific thread in the database
const mongoose = require('mongoose');
require('./dist/models/Thread'); // Load the Thread model

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/owldoo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  
  // Get the thread ID from command line arguments
  const threadId = process.argv[2];
  
  if (!threadId) {
    console.error('Please provide a thread ID as a command line argument');
    process.exit(1);
  }
  
  // Get the Thread model
  const Thread = mongoose.model('Thread');
  
  // Find the thread
  Thread.findById(threadId)
    .then(thread => {
      if (thread) {
        console.log('Thread found:');
        console.log('Creation time:', thread.createdAt);
        console.log('Message count:', thread.messages.length);
        console.log('Messages:');
        
        // Print each message
        thread.messages.forEach((message, index) => {
          console.log(`[${index}] [${message.sender}] [${message.timestamp}]: ${message.content}`);
        });
      } else {
        console.log('Thread not found');
      }
      
      // Disconnect from MongoDB
      mongoose.disconnect();
    })
    .catch(err => {
      console.error('Error finding thread:', err);
      mongoose.disconnect();
    });
})
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
});