// Test script for the 3:30-4pm time slot issue
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/owldoo')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import necessary modules
const NLPService = require('./dist/services/nlp.service').default;
const GoogleCalendarService = require('./dist/services/googleCalendar.service').default;

async function testCalendarAvailability() {
  try {
    console.log('Testing 3:30-4pm time slot availability...');
    
    // Parse a command for this time slot
    const parsedCommand = await NLPService.parseCommand('call Davidson from 3:30 to 4pm today');
    
    console.log('\nCommand details:');
    console.log('Title:', parsedCommand.title);
    console.log('Start time:', parsedCommand.startTime.toLocaleTimeString());
    console.log('Duration:', parsedCommand.duration, 'minutes');
    
    console.log('\nTesting event overlap function directly...');
    
    // Create event times for testing
    const now = new Date();
    now.setHours(15, 30, 0, 0); // 3:30pm
    
    const start1 = new Date(now); // 3:30pm
    const end1 = new Date(now);
    end1.setMinutes(end1.getMinutes() + 30); // 4:00pm
    
    // Create a fake event at 4:00pm to test the boundary case
    const start2 = new Date(now);
    start2.setHours(16, 0, 0, 0); // 4:00pm
    const end2 = new Date(start2);
    end2.setMinutes(end2.getMinutes() + 30); // 4:30pm
    
    console.log(`Event 1: ${start1.toLocaleTimeString()} - ${end1.toLocaleTimeString()}`);
    console.log(`Event 2: ${start2.toLocaleTimeString()} - ${end2.toLocaleTimeString()}`);
    
    // Access the private eventsOverlap function
    // Note: This is a hack for testing - in production you'd use the public API
    const eventsOverlap = Object.getPrototypeOf(GoogleCalendarService).eventsOverlap;
    if (eventsOverlap) {
      // Call the eventsOverlap function directly
      const overlaps = eventsOverlap.call(GoogleCalendarService, start1, end1, start2, end2);
      console.log(`Events overlap: ${overlaps}`);
    } else {
      console.log('Could not access the eventsOverlap function directly.');
    }
    
    // Use the public API to check availability
    console.log('\nChecking availability via the API...');
    const isAvailable = await GoogleCalendarService.checkAvailability(start1, end1);
    console.log(`Time slot is available: ${isAvailable}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing calendar availability:', error);
    process.exit(1);
  }
}

testCalendarAvailability();