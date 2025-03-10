// Test script for extracting calendar event parameters
const http = require('http');

console.log('Running event extraction test...');

// Function to extract event parameters
function extractEventParameters() {
  const eventData = JSON.stringify({
    input: "Schedule a meeting about project status tomorrow at 2pm"
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/agent/extract',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': eventData.length
    }
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('RESPONSE:', data);
      
      try {
        const parsedData = JSON.parse(data);
        console.log('\nExtracted event parameters:');
        console.log(JSON.stringify(parsedData, null, 2));
        
        // If successful extraction, try to create the event
        if (parsedData && parsedData.success && parsedData.parameters) {
          const parsedCommand = {
            action: 'create',
            title: parsedData.parameters.title,
            startTime: parsedData.parameters.startTime,
            duration: parsedData.parameters.duration || 30,
            location: parsedData.parameters.location
          };
          
          executeCalendarCommand(parsedCommand);
        }
      } catch (e) {
        console.error('Error parsing response:', e);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(eventData);
  req.end();
}

// Function to execute the calendar command
function executeCalendarCommand(parsedCommand) {
  const commandData = JSON.stringify({ 
    command: `Create an event called ${parsedCommand.title} tomorrow at 2pm`,
    parsedCommand: parsedCommand 
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/calendar/command',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': commandData.length
    }
  };

  const req = http.request(options, (res) => {
    console.log(`\nCALENDAR EXECUTION STATUS: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('CALENDAR RESPONSE:');
      try {
        const parsedData = JSON.parse(data);
        console.log(JSON.stringify(parsedData, null, 2));
        
        if (parsedData.success) {
          console.log('\n✅ EVENT CREATED SUCCESSFULLY!');
          console.log(`Event: ${parsedData.event?.summary}`);
          console.log(`Start: ${parsedData.event?.start?.dateTime}`);
          console.log(`End: ${parsedData.event?.end?.dateTime}`);
        } else {
          console.log('\n❌ EVENT CREATION FAILED');
          console.log(`Error: ${parsedData.error || 'Unknown error'}`);
        }
      } catch (e) {
        console.error('Error parsing calendar response:', e);
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with calendar request: ${e.message}`);
  });

  req.write(commandData);
  req.end();
}

// Start the test
extractEventParameters();