// Quick test to validate date handling
const GoogleCalendarService = require('./dist/services/googleCalendar.service').default;
const NLPService = require('./dist/services/nlp.service').default;

async function testEventCreation() {
  try {
    console.log("Current time:", new Date().toLocaleString());
    console.log("Testing event creation for 6:30pm to 7pm today");
    
    // Test parsing with NLP service
    const parsedCommand = await NLPService.parseCommand("schedule pack things for moving from 6:30pm to 7pm today");
    
    console.log("\nParsed command:");
    console.log("- Title:", parsedCommand.title);
    console.log("- Start time:", parsedCommand.startTime.toLocaleString());
    console.log("- Duration:", parsedCommand.duration, "minutes");
    console.log("- Day of week:", parsedCommand.startTime.toLocaleDateString('en-US', { weekday: 'long' }));
    console.log("- Action:", parsedCommand.action);
    
    // Create an event with the calendar service
    console.log("\nAttempting to create calendar event...");
    const result = await GoogleCalendarService.handleCommand(parsedCommand);
    
    if (result.success) {
      console.log("\nEvent created successfully!");
      console.log("- Event summary:", result.event.summary);
      console.log("- Event start:", new Date(result.event.start.dateTime).toLocaleString());
      console.log("- Event end:", new Date(result.event.end.dateTime).toLocaleString());
    } else {
      console.error("\nFailed to create event:", result.error);
    }
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

// Run the test
testEventCreation();