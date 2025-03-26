// Test script for time range parsing
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/owldoo')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import necessary modules
const NLPService = require('./dist/services/nlp.service').default;

async function testTimeRangeParsing() {
  try {
    console.log('Testing time range parsing...');
    
    // Test case 1 - Explicit AM/PM for both times
    console.log('\n===== Test Case 1: Explicit AM/PM for both times =====');
    const result1 = await NLPService.parseCommand('schedule a meeting from 3:30pm to 4:30pm today');
    console.log('Command: schedule a meeting from 3:30pm to 4:30pm today');
    console.log('Start time:', result1.startTime.toLocaleTimeString());
    console.log('Duration:', result1.duration, 'minutes');
    
    // Test case 2 - Only end time has AM/PM (the problematic case)
    console.log('\n===== Test Case 2: Only end time has AM/PM =====');
    const result2 = await NLPService.parseCommand('call Davidson from 3:30 to 4pm today');
    console.log('Command: call Davidson from 3:30 to 4pm today');
    console.log('Start time:', result2.startTime.toLocaleTimeString());
    console.log('Duration:', result2.duration, 'minutes');
    
    // Test case 3 - Different phrases for time range
    console.log('\n===== Test Case 3: Different phrase for time range =====');
    const result3 = await NLPService.parseCommand('schedule a meeting 10:30 until 11:30am tomorrow');
    console.log('Command: schedule a meeting 10:30 until 11:30am tomorrow');
    console.log('Start time:', result3.startTime.toLocaleTimeString());
    console.log('Duration:', result3.duration, 'minutes');
    
    console.log('\nTest completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error testing time range parsing:', error);
    process.exit(1);
  }
}

testTimeRangeParsing();