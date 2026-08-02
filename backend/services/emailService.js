const { Resend } = require('resend');

/**
 * Sends an email notification using Resend API SDK
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML content
 * @param {string} [options.from] - Sender address
 * @returns {Promise<{ success: boolean, data?: any, error?: any }>}
 */
async function sendEmail({ to, subject, html, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  const senderEmail = from || process.env.RESEND_FROM_EMAIL;
  const recipientEmail = to !== undefined ? to : process.env.ADMIN_EMAIL;

  // 1. Check if RESEND_FROM_EMAIL is missing from environment
  if (!process.env.RESEND_FROM_EMAIL) {
    const errorMsg = "RESEND_FROM_EMAIL environment variable is missing.";
    console.error(`[EMAIL SERVICE ERROR] ${errorMsg}`);
    return {
      success: false,
      error: { message: errorMsg }
    };
  }

  // 2. Validate other required environment variables before sending
  const missingEnvVars = [];
  if (!apiKey) missingEnvVars.push('RESEND_API_KEY');
  if (!recipientEmail) missingEnvVars.push('ADMIN_EMAIL');

  if (missingEnvVars.length > 0) {
    const errorMsg = `Required environment variable(s) missing: ${missingEnvVars.join(', ')}`;
    console.error(`[EMAIL SERVICE ERROR] ${errorMsg}`);
    return {
      success: false,
      error: { message: errorMsg, missingVariables: missingEnvVars }
    };
  }

  // 3. Logging details
  console.log('[EMAIL SERVICE] Email send started');
  console.log(`[EMAIL SERVICE] Sender email: ${senderEmail}`);
  console.log(`[EMAIL SERVICE] Recipient email: ${recipientEmail}`);
  console.log(`[EMAIL SERVICE] Subject: ${subject}`);

  try {
    const resend = new Resend(apiKey);

    const response = await resend.emails.send({
      from: senderEmail,
      to: recipientEmail,
      subject,
      html
    });

    // 4. Log Resend response
    console.log('[EMAIL SERVICE] Resend response:', JSON.stringify(response, null, 2));

    // 5. Handle response errors
    if (response.error) {
      console.error('[EMAIL SERVICE ERROR] Full error response if sending fails:', JSON.stringify(response.error, null, 2));
      
      // Check for suppression or bounce errors from Resend
      const errorMsg = response.error.message || '';
      const errorType = response.error.name || response.error.type || '';
      if (
        errorMsg.toLowerCase().includes('suppress') || 
        errorType.toLowerCase().includes('suppress') ||
        errorMsg.toLowerCase().includes('bounce') ||
        errorType.toLowerCase().includes('bounce')
      ) {
        console.warn(`[EMAIL SERVICE WARNING] Suppression/Bounce error detected for recipient: ${recipientEmail}. Details:`, JSON.stringify(response.error, null, 2));
      }
      
      return { success: false, error: response.error };
    }

    if (response.data && response.data.id) {
      console.log(`[EMAIL SERVICE SUCCESS] Email ID on success: ${response.data.id}`);
      return { success: true, data: response.data, emailId: response.data.id };
    } else {
      const err = { message: 'Unexpected API response structure (missing email ID).' };
      console.error('[EMAIL SERVICE ERROR] Complete error object on failure:', err);
      return { success: false, error: err };
    }
  } catch (err) {
    console.error('[EMAIL SERVICE EXCEPTION] Full error response if sending fails:', err);
    return {
      success: false,
      error: { message: err.message || String(err) }
    };
  }
}

module.exports = {
  sendEmail
};
