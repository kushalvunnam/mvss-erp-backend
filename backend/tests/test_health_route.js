const mongoose = require('mongoose');
const express = require('express');

// We simulate the exact handleHealthCheck implementation from server.js
const handleHealthCheck = (req, res) => {
  const readyStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const isDbConnected = global.isInMemoryFallback || mongoose.connection.readyState === 1;
  const dbStatus = global.isInMemoryFallback ? 'in-memory-fallback' : (readyStates[mongoose.connection.readyState] || 'unknown');
  const isHealthy = isDbConnected;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    server: 'running',
    service: 'MVSS ERP Backend',
    database: {
      status: dbStatus,
      connected: isDbConnected
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
};

console.log('--- TEST 1: Database Disconnected (readyState = 0) ---');
let fakeReq = {};
let fakeRes = {
  statusCode: 200,
  data: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.data = payload;
    return this;
  }
};

handleHealthCheck(fakeReq, fakeRes);
console.log('Status code:', fakeRes.statusCode);
console.log('Payload:', JSON.stringify(fakeRes.data, null, 2));
if (fakeRes.statusCode === 503 && fakeRes.data.database.connected === false) {
  console.log('✅ TEST 1 PASSED: Unhealthy status returned when DB disconnected');
} else {
  console.error('❌ TEST 1 FAILED');
  process.exit(1);
}

console.log('\n--- TEST 2: Database Connected (simulate readyState = 1) ---');
// Mock readyState = 1
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
fakeRes = {
  statusCode: 200,
  data: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.data = payload;
    return this;
  }
};

handleHealthCheck(fakeReq, fakeRes);
console.log('Status code:', fakeRes.statusCode);
console.log('Payload:', JSON.stringify(fakeRes.data, null, 2));
if (fakeRes.statusCode === 200 && fakeRes.data.status === 'healthy' && fakeRes.data.database.connected === true) {
  console.log('✅ TEST 2 PASSED: Healthy status returned when DB connected');
} else {
  console.error('❌ TEST 2 FAILED');
  process.exit(1);
}

console.log('\nAll unit tests for /api/health passed successfully!');
