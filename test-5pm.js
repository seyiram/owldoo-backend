require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/owldoo')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import necessary modules
const GoogleCalendarService = require('./dist/services/googleCalendar.service').default;
const NLPService = require('./dist/services/nlp.service').default;

async function testScheduling() {
  try {
    console.log('Testing 5pm scheduling...');
    
    // Parse command using NLP service
    const parsedCommand = await NLPService.parseCommand('schedule a meeting at 5pm today');
    
    // Check to verify hour is correct (should be 17 for 5pm)
    const hour = parsedCommand.startTime.getHours();
    console.log('Hour in parsed command:', hour);
    
    // Check if the hour is correct
    if (hour !== 17) {
        console.error(`ERROR: Expected hour to be 17 (5pm) but got ${hour}`);
    } else {
        console.log('SUCCESS: Hour is correctly set to 17 (5pm)');
    }
    
    console.log('Parsed Command:', JSON.stringify(parsedCommand, null, 2));
    
    // Handle the command to create an event
    const result = await GoogleCalendarService.handleCommand(parsedCommand);
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    console.log('Event created!');
    process.exit(0);
  } catch (error) {
    console.error('Error testing scheduling:', error);
    process.exit(1);
  }
}

testScheduling();