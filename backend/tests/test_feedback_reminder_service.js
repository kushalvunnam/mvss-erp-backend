const assert = require('assert');
const path = require('path');

process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';

const { dynamicTemplateMap } = require('../services/whatsappService');
dynamicTemplateMap.set('mvss_feedback_request', { name: 'mvss_feedback_request', language: 'en', status: 'APPROVED', paramCount: 2 });

console.log('--- Starting Feedback Reminder Service Unit Tests ---');

// Mock in-memory database storage for FeedbackReminder and GatePass
const inMemoryReminders = new Map();
const inMemoryGatePasses = new Map();

const FeedbackReminder = require('../models/FeedbackReminder');
const GatePass = require('../models/GatePass');
const WhatsAppLog = require('../models/WhatsAppLog');

WhatsAppLog.findOne = async () => null;
WhatsAppLog.prototype.save = async function() { return this; };

FeedbackReminder.findOne = async function(query) {
  if (query.$or) {
    for (const condition of query.$or) {
      if (condition.gatePassId) {
        for (const rem of inMemoryReminders.values()) {
          if (String(rem.gatePassId) === String(condition.gatePassId)) return rem;
        }
      }
      if (condition.idempotencyKey) {
        if (inMemoryReminders.has(condition.idempotencyKey)) return inMemoryReminders.get(condition.idempotencyKey);
      }
    }
  }
  return null;
};

FeedbackReminder.find = function(query) {
  return {
    sort: () => ({
      limit: () => {
        const matches = [];
        for (const rem of inMemoryReminders.values()) {
          if (query.status && rem.status !== query.status) continue;
          if (query.scheduledAt?.$lte && rem.scheduledAt > query.scheduledAt.$lte) continue;
          matches.push(rem);
        }
        return matches;
      }
    })
  };
};

FeedbackReminder.prototype.save = async function() {
  if (this.idempotencyKey) {
    inMemoryReminders.set(this.idempotencyKey, this);
  }
  return this;
};

FeedbackReminder.updateMany = async function(filter, update) {
  let count = 0;
  for (const rem of inMemoryReminders.values()) {
    if (String(rem.gatePassId) === String(filter.gatePassId) && rem.status === filter.status) {
      if (update.$set) {
        Object.assign(rem, update.$set);
      }
      count++;
    }
  }
  return { modifiedCount: count };
};

GatePass.findById = async function(id) {
  return inMemoryGatePasses.get(String(id)) || null;
};

const {
  scheduleFeedbackReminder,
  cancelFeedbackReminder,
  processPendingFeedbackReminders
} = require('../services/feedbackReminderService');

const mongoose = require('mongoose');

async function testFeedbackFlow() {
  const id1 = new mongoose.Types.ObjectId();
  // 1. Setup mock gate pass
  const gatePass1 = {
    _id: id1,
    gatePassNo: 'MVSS/GP/26-27/001',
    jobCardNumber: 'MVSS/JC/26-27/053',
    customerName: 'Kushal Vunnam',
    customerMobile: '8008092742',
    vehicleNumber: 'TS09AB1234',
    status: 'Issued'
  };
  inMemoryGatePasses.set(String(id1), gatePass1);

  // 2. Schedule reminder
  const reminder = await scheduleFeedbackReminder({ gatePass: gatePass1, delayMs: -1000 }); // scheduled in past for immediate test processing
  assert.strictEqual(reminder.status, 'pending');
  assert.strictEqual(reminder.gatePassNo, 'MVSS/GP/26-27/001');
  console.log('✔ Test 1 Passed: scheduleFeedbackReminder created pending reminder.');

  // 3. Test duplicate scheduling prevention
  const dupReminder = await scheduleFeedbackReminder({ gatePass: gatePass1 });
  assert.strictEqual(dupReminder.idempotencyKey, reminder.idempotencyKey);
  console.log('✔ Test 2 Passed: Duplicate scheduling safely skipped and returned existing reminder.');

  // 4. Process pending reminders
  let sentCount = 0;
  const mockAxios = {
    post: async () => {
      sentCount++;
      return { status: 200, data: { messages: [{ id: 'wamid.FEEDBACK_SENT_001' }] } };
    }
  };

  const processStats = await processPendingFeedbackReminders(mockAxios);
  assert.strictEqual(processStats.sent, 1);
  assert.strictEqual(sentCount, 1);
  assert.strictEqual(reminder.status, 'sent');
  assert.strictEqual(reminder.messageId, 'wamid.FEEDBACK_SENT_001');
  console.log('✔ Test 3 Passed: processPendingFeedbackReminders sent reminder and marked status as sent.');

  // 5. Test cancellation of returned gate pass
  const id2 = new mongoose.Types.ObjectId();
  const gatePass2 = {
    _id: id2,
    gatePassNo: 'MVSS/GP/26-27/002',
    customerName: 'Customer Two',
    customerMobile: '8008092742',
    vehicleNumber: 'TS09CD5678',
    status: 'Issued'
  };
  inMemoryGatePasses.set(String(id2), gatePass2);

  const reminder2 = await scheduleFeedbackReminder({ gatePass: gatePass2, delayMs: 10000 });
  assert.strictEqual(reminder2.status, 'pending');

  await cancelFeedbackReminder(gatePass2._id, 'Gate pass material returned');
  assert.strictEqual(reminder2.status, 'cancelled');
  console.log('✔ Test 4 Passed: cancelFeedbackReminder successfully cancelled pending reminder.');

  console.log('\n=== ALL FEEDBACK REMINDER SERVICE TESTS PASSED ===');
  process.exit(0);
}

testFeedbackFlow().catch(err => {
  console.error('Feedback Test Failed:', err);
  process.exit(1);
});
