const mongoose = require('mongoose');
require('./dist/models/index.js');

async function clearDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/owldoo');
    console.log('Connected to MongoDB');
    
    // Clear threads
    const Thread = mongoose.model('Thread');
    const threadResult = await Thread.deleteMany({});
    console.log(`Deleted ${threadResult.deletedCount} threads`);
    
    // Clear conversations
    const Conversation = mongoose.model('Conversation');
    const conversationResult = await Conversation.deleteMany({});
    console.log(`Deleted ${conversationResult.deletedCount} conversations`);
    
    console.log('Database cleared successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  }
}

clearDatabase();