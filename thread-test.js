// Test script to create a thread using the built-in http module
const http = require('http');

console.log('Running thread creation test');

// Create a thread through the conversation API
async function createTestThread() {
  try {
    // Create the request data
    const data = JSON.stringify({
      message: 'I need to set up a meeting with the team at 2pm tomorrow',
      conversationId: null // Create a new conversation
    });
    
    // Create the request options
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/conversation/message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    // Create a promise to handle the HTTP request
    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(data);
      req.end();
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.threadId) {
      console.log(`SUCCESS! Thread created with ID: ${response.data.threadId}`);
      
      // Test fetching the thread
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a second
      
      try {
        // Create a new request to fetch the thread
        const threadResponse = await new Promise((resolve, reject) => {
          const threadOptions = {
            hostname: 'localhost',
            port: 3000,
            path: `/api/conversation/thread/${response.data.threadId}`,
            method: 'GET'
          };
          
          const req = http.request(threadOptions, (res) => {
            let threadData = '';
            
            res.on('data', (chunk) => {
              threadData += chunk;
            });
            
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  resolve({
                    status: res.statusCode,
                    data: JSON.parse(threadData)
                  });
                } catch (e) {
                  reject(new Error(`Failed to parse thread response: ${e.message}`));
                }
              } else {
                reject(new Error(`Thread fetch failed with status: ${res.statusCode}`));
              }
            });
          });
          
          req.on('error', (error) => {
            reject(error);
          });
          
          req.end();
        });
        
        console.log('Thread fetch status:', threadResponse.status);
        
        // Check which field exists
        if (threadResponse.data.processingSteps) {
          console.log('Thread has processingSteps field with', 
            threadResponse.data.processingSteps.length, 'items');
        } else if (threadResponse.data.processingSteps) {
          console.log('Thread has processingSteps field with', 
            threadResponse.data.processingSteps.length, 'items');
        } else {
          console.log('MISSING BOTH processing steps fields!');
        }
        
        console.log('Thread API response:', JSON.stringify(threadResponse.data, null, 2));
      } catch (threadError) {
        console.error('Error fetching thread:', threadError.message);
      }
    } else {
      console.error('Failed to create thread - no threadId returned');
    }
  } catch (error) {
    console.error('Error creating thread:', error.message);
  }
}

// Execute the test
createTestThread();