const assert = require('assert');
const path = require('path');

process.env.META_WA_ACCESS_TOKEN = 'mock_valid_token_abc';
process.env.META_WA_PHONE_NUMBER_ID = '1391083524077434';
process.env.META_WA_BUSINESS_ACCOUNT_ID = '1070579342641923';

const { dynamicTemplateMap } = require('../services/whatsappService');
dynamicTemplateMap.set('mvss_feedback_request', { name: 'mvss_feedback_request', language: 'en', status: 'APPROVED', paramCount: 2 });

console.log('--- Starting Feedback Reminder Service Unit Tests ---');

// Mock in-memory database storage for FeedbackReminder, GatePass, JobCard, and Notification
const inMemoryReminders = new Map();
const inMemoryGatePasses = new Map();
const inMemoryJobCards = new Map();
const inMemoryNotifications = [];

const FeedbackReminder = require('../models/FeedbackReminder');
const GatePass = require('../models/GatePass');
const JobCard = require('../models/JobCard');
const Notification = require('../models/Notification');
const WhatsAppLog = require('../models/WhatsAppLog');

WhatsAppLog.findOne = async () => null;
WhatsAppLog.prototype.save = async function() { return this; };

FeedbackReminder.findOne = function(query) {
  const list = Array.from(inMemoryReminders.values());
  let match = null;

  if (query.$or) {
    for (const condition of query.$or) {
      if (condition.gatePassId) {
        match = list.find(rem => String(rem.gatePassId) === String(condition.gatePassId));
      }
      if (!match && condition.idempotencyKey) {
        match = inMemoryReminders.get(condition.idempotencyKey) || null;
      }
      if (match) break;
    }
  }

  if (!match && query.customerMobile) {
    if (query.customerMobile.$in) {
      match = list.find(r => (!query.status || r.status === query.status) && query.customerMobile.$in.includes(r.customerMobile));
    }
    if (!match && query.customerMobile.$regex) {
      match = list.find(r => (!query.status || r.status === query.status) && query.customerMobile.$regex.test(r.customerMobile));
    }
  }

  return {
    sort: () => match,
    then: (resolve) => resolve(match)
  };
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

JobCard.findOne = async function(query) {
  if (query.jobCardNumber) {
    return inMemoryJobCards.get(query.jobCardNumber) || null;
  }
  return null;
};

JobCard.prototype.save = async function() {
  if (this.jobCardNumber) {
    inMemoryJobCards.set(this.jobCardNumber, this);
  }
  return this;
};

Notification.create = async function(data) {
  inMemoryNotifications.push(data);
  return data;
};

const {
  getFeedbackPrompt,
  parseCustomerFeedback,
  handleInboundFeedbackReply,
  scheduleFeedbackReminder,
  cancelFeedbackReminder,
  processPendingFeedbackReminders
} = require('../services/feedbackReminderService');

const mongoose = require('mongoose');

async function testFeedbackFlow() {
  // =========================================================================
  // Test 1: Verify getFeedbackPrompt replaces URLs with 1-5 star rating request
  // =========================================================================
  const prompt1 = getFeedbackPrompt('TS09AB1234');
  assert.ok(prompt1.includes('1 to 5 stars'));
  assert.ok(prompt1.includes('TS09AB1234'));
  assert.ok(!prompt1.includes('http'));
  assert.ok(!prompt1.includes('mvssautomobiles.com/feedback'));
  console.log('✔ Test 1 Passed: getFeedbackPrompt returns 1-5 star rating prompt without any URL link.');

  // =========================================================================
  // Test 2: Unit test parseCustomerFeedback across multiple formats & edge cases
  // =========================================================================
  const r1 = parseCustomerFeedback('5');
  assert.strictEqual(r1.valid, true);
  assert.strictEqual(r1.rating, 5);
  assert.strictEqual(r1.feedbackText, '');

  const r2 = parseCustomerFeedback('4 / 5');
  assert.strictEqual(r2.valid, true);
  assert.strictEqual(r2.rating, 4);

  const r3 = parseCustomerFeedback('5 - Outstanding body work and fast delivery!');
  assert.strictEqual(r3.valid, true);
  assert.strictEqual(r3.rating, 5);
  assert.strictEqual(r3.feedbackText, 'Outstanding body work and fast delivery!');

  const r4 = parseCustomerFeedback('Rating: 4. Good service but billing took time');
  assert.strictEqual(r4.valid, true);
  assert.strictEqual(r4.rating, 4);
  assert.strictEqual(r4.feedbackText, 'Good service but billing took time');

  const r5 = parseCustomerFeedback('⭐⭐⭐⭐⭐ Excellent work by the mechanic');
  assert.strictEqual(r5.valid, true);
  assert.strictEqual(r5.rating, 5);
  assert.strictEqual(r5.feedbackText, 'Excellent work by the mechanic');

  const r6 = parseCustomerFeedback('1 - Very dissatisfied with delayed delivery');
  assert.strictEqual(r6.valid, true);
  assert.strictEqual(r6.rating, 1);
  assert.strictEqual(r6.feedbackText, 'Very dissatisfied with delayed delivery');

  // Negative / invalid cases
  assert.strictEqual(parseCustomerFeedback('0').valid, false);
  assert.strictEqual(parseCustomerFeedback('6').valid, false);
  assert.strictEqual(parseCustomerFeedback('hello there').valid, false);
  assert.strictEqual(parseCustomerFeedback(null).valid, false);
  console.log('✔ Test 2 Passed: parseCustomerFeedback accurately handles stars, numbers, descriptions, and rejects invalid ratings.');

  // =========================================================================
  // Test 3: Schedule reminder
  // =========================================================================
  const id1 = new mongoose.Types.ObjectId();
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

  // Setup linked JobCard in memory
  const jobCard1 = new JobCard({
    jobCardNumber: 'MVSS/JC/26-27/053',
    customerName: 'Kushal Vunnam',
    customerMobile: '8008092742',
    vehicleNumber: 'TS09AB1234',
    customerSatisfaction: {}
  });
  inMemoryJobCards.set('MVSS/JC/26-27/053', jobCard1);

  const reminder = await scheduleFeedbackReminder({ gatePass: gatePass1, delayMs: -1000 }); // scheduled in past
  assert.strictEqual(reminder.status, 'pending');
  assert.strictEqual(reminder.gatePassNo, 'MVSS/GP/26-27/001');
  console.log('✔ Test 3 Passed: scheduleFeedbackReminder created pending reminder.');

  // =========================================================================
  // Test 4: Duplicate scheduling prevention
  // =========================================================================
  const dupReminder = await scheduleFeedbackReminder({ gatePass: gatePass1 });
  assert.strictEqual(dupReminder.idempotencyKey, reminder.idempotencyKey);
  console.log('✔ Test 4 Passed: Duplicate scheduling safely skipped and returned existing reminder.');

  // =========================================================================
  // Test 5: Process pending reminders (verifying parameter 2 is prompt without URL)
  // =========================================================================
  let sentPayload = null;
  const mockAxios = {
    post: async (url, payload) => {
      sentPayload = payload;
      return { status: 200, data: { messages: [{ id: 'wamid.FEEDBACK_SENT_001' }] } };
    }
  };

  const processStats = await processPendingFeedbackReminders(mockAxios);
  assert.strictEqual(processStats.sent, 1);
  assert.strictEqual(reminder.status, 'sent');
  assert.strictEqual(reminder.messageId, 'wamid.FEEDBACK_SENT_001');
  assert.strictEqual(sentPayload.template.components[0].parameters.length, 2);
  assert.ok(sentPayload.template.components[0].parameters[1].text.includes('1 to 5 stars'));
  assert.ok(!sentPayload.template.components[0].parameters[1].text.includes('mvssautomobiles.com/feedback'));
  console.log('✔ Test 5 Passed: processPendingFeedbackReminders sent reminder with 1-5 star rating prompt and no URL link.');

  // =========================================================================
  // Test 6: Inbound customer reply processing (updating FeedbackReminder & JobCard)
  // =========================================================================
  const inboundReplyRes = await handleInboundFeedbackReply({
    fromPhone: '918008092742',
    messageText: '5 - Superb car servicing, highly recommended!',
    messageId: 'wamid.INBOUND_FEEDBACK_001'
  });

  assert.strictEqual(inboundReplyRes.processed, true);
  assert.strictEqual(reminder.responseReceived, true);
  assert.strictEqual(reminder.rating, 5);
  assert.strictEqual(reminder.feedbackText, 'Superb car servicing, highly recommended!');
  assert.ok(reminder.respondedAt instanceof Date);

  // Check JobCard update
  assert.strictEqual(inboundReplyRes.jobCardUpdated, true);
  assert.strictEqual(jobCard1.customerSatisfaction.rating, 5);
  assert.strictEqual(jobCard1.customerSatisfaction.feedback, 'Superb car servicing, highly recommended!');
  assert.strictEqual(jobCard1.customerSatisfaction.source, 'WhatsApp');

  // Check Staff Notification
  assert.strictEqual(inMemoryNotifications.length, 1);
  assert.strictEqual(inMemoryNotifications[0].type, 'feedback');
  assert.ok(inMemoryNotifications[0].title.includes('5★'));
  console.log('✔ Test 6 Passed: Inbound reply parsed rating and description, updated FeedbackReminder and JobCard, and notified staff.');

  // =========================================================================
  // Test 7: Cancellation of returned gate pass
  // =========================================================================
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
  console.log('✔ Test 7 Passed: cancelFeedbackReminder successfully cancelled pending reminder.');

  console.log('\n=== ALL FEEDBACK REMINDER SERVICE TESTS PASSED ===');
  process.exit(0);
}

testFeedbackFlow().catch(err => {
  console.error('Feedback Test Failed:', err);
  process.exit(1);
});
