import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';
let authToken = '';

// Test login endpoint
async function testLogin() {
  try {
    console.log('Testing login endpoint...');
    const response = await axios.post(\`\${API_BASE}/auth/login\`, {
      username: 'admin',
      password: 'admin123'
    });
    console.log('Login successful:', response.data);
    authToken = response.data.token;
    return true;
  } catch (error) {
    console.error('Login failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Test get users endpoint
async function testGetUsers() {
  try {
    console.log('Testing get users endpoint...');
    const response = await axios.get(\`\${API_BASE}/users\`, {
      headers: { Authorization: \`Bearer \${authToken}\` }
    });
    console.log('Get users successful:', response.data);
    return true;
  } catch (error) {
    console.error('Get users failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Test get pedidos endpoint
async function testGetPedidos() {
  try {
    console.log('Testing get pedidos endpoint...');
    const response = await axios.get(\`\${API_BASE}/pedidos\`, {
      headers: { Authorization: \`Bearer \${authToken}\` }
    });
    console.log('Get pedidos successful:', response.data.length + ' items found');
    return true;
  } catch (error) {
    console.error('Get pedidos failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Test get aportes endpoint
async function testGetAportes() {
  try {
    console.log('Testing get aportes endpoint...');
    const response = await axios.get(\`\${API_BASE}/aportes\`, {
      headers: { Authorization: \`Bearer \${authToken}\` }
    });
    console.log('Get aportes successful:', response.data.length + ' items found');
    return true;
  } catch (error) {
    console.error('Get aportes failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Test get manhwas endpoint
async function testGetManhwas() {
  try {
    console.log('Testing get manhwas endpoint...');
    const response = await axios.get(\`\${API_BASE}/manhwas\`, {
      headers: { Authorization: \`Bearer \${authToken}\` }
    });
    console.log('Get manhwas successful:', response.data.length + ' items found');
    return true;
  } catch (error) {
    console.error('Get manhwas failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Test get groups endpoint
async function testGetGroups() {
  try {
    console.log('Testing get groups endpoint...');
    const response = await axios.get(\`\${API_BASE}/groups\`, {
      headers: { Authorization: \`Bearer \${authToken}\` }
    });
    console.log('Get groups successful:', response.data.length + ' items found');
    return true;
  } catch (error) {
    console.error('Get groups failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Test get config endpoint
async function testGetConfig() {
  try {
    console.log('Testing get config endpoint...');
    const response = await axios.get(\`\${API_BASE}/config\`, {
      headers: { Authorization: \`Bearer \${authToken}\` }
    });
    console.log('Get config successful:', Object.keys(response.data).length + ' config items found');
    return true;
  } catch (error) {
    console.error('Get config failed:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('Starting API tests...\\n');

  // Test login first
  const loginSuccess = await testLogin();
  if (!loginSuccess) {
    console.log('Cannot proceed with other tests without login');
    return;
  }

  // Run all other tests
  const tests = [
    testGetUsers,
    testGetPedidos,
    testGetAportes,
    testGetManhwas,
    testGetGroups,
    testGetConfig
  ];

  let passedTests = 0;
  for (const test of tests) {
    try {
      const result = await test();
      if (result) passedTests++;
    } catch (error) {
      console.error('Test failed with error:', error.message);
    }
  }

  console.log(\`\\nTests completed: \${passedTests}/\${tests.length} passed\`);
}

runTests();
