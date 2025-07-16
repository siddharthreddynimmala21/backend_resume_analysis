// Test script to verify backend endpoints
// Run this with: node test-endpoints.js

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testEndpoint(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        //console.log(`Testing ${method} ${endpoint}...`);
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.text();
        
        //console.log(`Status: ${response.status}`);
        //console.log(`Response: ${data.substring(0, 200)}...`);
        //console.log('---');
        
        return response.ok;
    } catch (error) {
        //console.error(`Error testing ${endpoint}:`, error.message);
        //console.log('---');
        return false;
    }
}

async function runTests() {
    console.log('Testing backend endpoints...\n');
    
    // Test basic endpoints
    await testEndpoint('/');
    await testEndpoint('/test');
    
    // Test auth endpoints
    await testEndpoint('/api/auth/test');
    
    // Test resume endpoints
    await testEndpoint('/api/resume/test');
    
    console.log('Tests completed!');
}

runTests(); 