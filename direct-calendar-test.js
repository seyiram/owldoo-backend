// Direct test of calendar API without going through controllers
require('dotenv').config();

// We need to use a different approach for importing the ES modules
async function importModules() {
  // Import mongoose first to ensure it's initialized
  const mongoose = await import('mongoose');
  
  try {
    await mongoose.default.connect('mongodb://localhost:27017/owldoo', {
      // Use options compatible with your MongoDB version
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
  
  // Import our services
  const { default: googleCalendarService } = await import('./dist/services/googleCalendar.service.js');
  const { default: nlpService } = await import('./dist/services/nlp.service.js');
  
  return { googleCalendarService, nlpService };
}

async function testCalendarIntegration() {
  console.log('Starting direct calendar integration test...');

  try {
    // Import modules
    const { googleCalendarService, nlpService } = await importModules();
    
    // Check if authenticated
    const isAuth = await googleCalendarService.isUserAuthenticated();
    console.log('Authentication status:', isAuth);

    if (!isAuth) {
      console.log('Not authenticated. Please authenticate first.');
      const authUrl = await googleCalendarService.getAuthUrl();
      console.log('Auth URL:', authUrl);
      return;
    }

    // Parse a command directly with the NLP service
    const command = "Schedule a meeting about project status tomorrow at 2pm";
    console.log('Parsing command:', command);
    
    const parsedCommand = await nlpService.parseCommand(command);
    console.log('Parsed command:', JSON.stringify(parsedCommand, null, 2));

    // Execute the command directly with the calendar service
    console.log('Executing command...');
    const result = await googleCalendarService.handleCommand(parsedCommand);
    
    console.log('Command execution result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ EVENT CREATED SUCCESSFULLY!');
      console.log(`Event: ${result.event?.summary}`);
      console.log(`Start: ${result.event?.start?.dateTime}`);
      console.log(`End: ${result.event?.end?.dateTime}`);
    } else {
      console.log('\n❌ EVENT CREATION FAILED');
      console.log(`Error: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error in calendar test:', error);
  }
}

// Run the test
testCalendarIntegration();