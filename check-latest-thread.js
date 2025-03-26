// Script to check the most recent thread
const mongoose = require('mongoose');
require('./dist/models/Thread');

mongoose.connect('mongodb://localhost:27017/owldoo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  const Thread = mongoose.model('Thread');
  
  // Get most recent thread
  const thread = await Thread.findOne().sort({ createdAt: -1 });
  
  if (thread) {
    console.log('Most recent thread:');
    console.log(`- ID: ${thread._id}`);
    console.log(`- Conversation ID: ${thread.conversationId}`);
    console.log(`- Created at: ${thread.createdAt}`);
    console.log(`- Messages: ${thread.messages.length}`);
    thread.messages.forEach((msg, idx) => {
      console.log(`  [${idx}] [${msg.sender}]: ${msg.content}`);
    });
    console.log(`- Processing steps: ${thread.processingSteps ? thread.processingSteps.length : 0}`);
  } else {
    console.log('No threads found');
  }
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Error:', err);
  mongoose.disconnect();
});