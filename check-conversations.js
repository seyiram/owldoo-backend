// Script to check conversations
const mongoose = require('mongoose');
require('./dist/models/Conversation');

mongoose.connect('mongodb://localhost:27017/owldoo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  const Conversation = mongoose.model('Conversation');
  
  // Get all conversations
  const conversations = await Conversation.find().sort({ lastActivityTime: -1 });
  
  if (conversations.length > 0) {
    console.log(`Found ${conversations.length} conversations:`);
    conversations.forEach((conv, idx) => {
      console.log(`\nConversation #${idx + 1}:`);
      console.log(`- ID: ${conv._id}`);
      console.log(`- Conversation ID: ${conv.conversationId}`);
      console.log(`- Thread ID: ${conv.threadId || 'None'}`);
      console.log(`- Start time: ${conv.startTime}`);
      console.log(`- Last activity: ${conv.lastActivityTime}`);
      console.log(`- Is active: ${conv.isActive}`);
      console.log(`- Turns: ${conv.turns.length}`);
      
      if (conv.turns.length > 0) {
        console.log(`- First user message: ${conv.turns.find(t => t.speaker === 'user')?.content || 'N/A'}`);
        console.log(`- Last message: ${conv.turns[conv.turns.length - 1]?.content || 'N/A'}`);
      }
    });
  } else {
    console.log('No conversations found');
  }
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Error:', err);
  mongoose.disconnect();
});