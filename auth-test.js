// Simple script to test Google auth
const http = require('http');

console.log('Running auth test script...');

// Test auth status
function checkAuthStatus() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/status',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('RESPONSE:', data);
      
      // If not authenticated, get auth URL
      if (data.includes('false')) {
        getAuthUrl();
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.end();
}

// Get auth URL
function getAuthUrl() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/google/connect',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Auth URL:', data);
      console.log('\nOpen this URL in your browser to authenticate with Google');
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.end();
}

// Start the test
checkAuthStatus();