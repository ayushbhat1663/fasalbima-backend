const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
require('dotenv').config();

// 1. Transporter for Insurance Emails (Gmail) - Render-compatible SMTPS configuration
// Using port 465 (SMTPS with implicit TLS) instead of port 587 (STARTTLS)
// Reason: Render blocks STARTTLS TLS negotiation. SMTPS (implicit TLS) is Render-safe.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,                 // Changed from 587 → 465 (SMTPS, implicit TLS)
  secure: true,              // Changed from false → true (implicit TLS from connection start)
  requireTLS: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  },
  connectionTimeout: 15000,  // 15s timeout for Render's slower network
  socketTimeout: 15000,
  greetingTimeout: 8000,
  pool: {
    maxConnections: 1,
    maxMessages: 5,
    rateDelta: 20000,
    rateLimit: 5
  },
  logger: true,              // Enable detailed logging
  debug: true                // Enable debug output
});

// 2. SendGrid API Key for OTP emails (REST API - Render-safe)
const SENDGRID_API_KEY = process.env.SMTP_PASS; // The API key is stored in SMTP_PASS
const SENDGRID_FROM_EMAIL = process.env.SMTP_FROM || 'FasalBima <noreply@fasalbima.com>';

// Verify SendGrid API key is available
if (!SENDGRID_API_KEY || !SENDGRID_API_KEY.startsWith('SG.')) {
  console.warn('⚠️ Warning: SendGrid API key not properly configured. OTP delivery may fail.');
}


/**
 * Send OTP Email via SendGrid REST API
 * @param {string} email - Destination email
 * @param {string} otp - 6-digit code
 * @returns {Promise}
 */
async function sendOTPEmail(email, otp) {
  if (!SENDGRID_API_KEY || !SENDGRID_API_KEY.startsWith('SG.')) {
    const error = 'SendGrid API key not configured';
    console.error('❌ OTP Email Error:', error);
    throw new Error(error);
  }

  const mailData = {
    personalizations: [
      {
        to: [
          {
            email: email
          }
        ]
      }
    ],
    from: {
      email: SENDGRID_FROM_EMAIL.match(/<(.+)>/) ? SENDGRID_FROM_EMAIL.match(/<(.+)>/)[1] : SENDGRID_FROM_EMAIL,
      name: 'FasalBima'
    },
    subject: '🔐 Your FasalBima Verification Code',
    content: [
      {
        type: 'text/html',
        value: `
          <div style="font-family: sans-serif; padding: 20px; color: #1a2e1a;">
              <h2 style="color: #2e7d32;">FasalBima Verification</h2>
              <p>Namaste! Use the following 6-digit code to log in to your FasalBima account.</p>
              <div style="background: #f1f8e9; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2e7d32; border: 1px solid #c8e6c9;">
                  ${otp}
              </div>
              <p style="font-size: 14px; color: #5d7451; margin-top: 20px;">
                  This code will expire in 5 minutes. If you did not request this, please ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #e8f5e9; margin: 20px 0;">
              <p style="font-size: 12px; color: #bdbdbd;">FasalBima AI Crop Insurance · Government of India Initiative</p>
          </div>
        `
      }
    ]
  };

  try {
    console.log('📤 Sending OTP email via SendGrid API to:', email);
    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', mailData, {
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log('✅ OTP Email sent successfully via SendGrid API');
    return { success: true, messageId: 'sendgrid-' + Date.now() };
  } catch (error) {
    const errorMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
    console.error('❌ SendGrid API Error in sendOTPEmail:', errorMsg);
    console.error('   Status:', error.response?.status);
    console.error('   Details:', error.response?.data);
    throw new Error(`OTP delivery failed: ${errorMsg}`);
  }
}

/**
 * Helper: Convert Nodemailer attachments (file paths) to SendGrid format (base64)
 * @param {Array} attachments - Array of {filename, path}
 * @returns {Promise<Array>} Array of {filename, content, type, disposition}
 */
async function encodeAttachmentsForSendGrid(attachments) {
    if (!attachments || attachments.length === 0) {
        return [];
    }
    
    const encodedAttachments = [];
    for (const attachment of attachments) {
        if (attachment.path && fs.existsSync(attachment.path)) {
            try {
                const fileContent = await fs.promises.readFile(attachment.path);
                encodedAttachments.push({
                    filename: attachment.filename,
                    content: fileContent.toString('base64'),
                    type: 'application/pdf',
                    disposition: 'attachment'
                });
                console.log(`📎 Encoded for SendGrid: ${attachment.filename}`);
            } catch (readErr) {
                console.error(`❌ Failed to encode attachment: ${attachment.filename} - ${readErr.message}`);
                throw readErr;
            }
        }
    }
    return encodedAttachments;
}

/**
 * Send Insurance Request Email via SendGrid REST API
 * Replaces Gmail SMTP to fix Render networking constraints
 * @param {Object} mailOptions - Nodemailer-format mail options
 * @returns {Promise}
 */
async function sendInsuranceEmailViaSendGrid(mailOptions) {
    console.log('🌐 Encoding attachments for SendGrid delivery...');
    const encodedAttachments = await encodeAttachmentsForSendGrid(mailOptions.attachments || []);
    
    // Extract email from "Name <email>" format
    const extractEmail = (emailString) => {
        const match = emailString.match(/<(.+)>/);
        return match ? match[1] : emailString;
    };
    
    const sendGridMailData = {
        personalizations: [
            {
                to: [
                    {
                        email: mailOptions.to
                    }
                ]
            }
        ],
        from: {
            email: mailOptions.to,
            name: 'FasalBima'
        },
        subject: mailOptions.subject,
        content: [
            {
                type: 'text/html',
                value: mailOptions.html
            }
        ],
        attachments: encodedAttachments
    };

    console.log(`🌐 Sending insurance email via SendGrid API to: ${mailOptions.to}`);
    
    try {
        const response = await axios.post('https://api.sendgrid.com/v3/mail/send', sendGridMailData, {
            headers: {
                'Authorization': `Bearer ${process.env.SMTP_PASS}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        // Return Nodemailer-compatible response object
        const messageId = 'sendgrid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        console.log(`✅ SendGrid Insurance Email sent successfully (MessageID: ${messageId})`);
        
        return {
            messageId: messageId,
            response: response.status
        };
    } catch (error) {
        const errorMsg = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
        console.error(`❌ SendGrid API Error in sendInsuranceEmailViaSendGrid: ${errorMsg}`);
        if (error.response?.data) {
            console.error(`   Status: ${error.response?.status}`);
            console.error(`   Details: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`SendGrid insurance email delivery failed: ${errorMsg}`);
    }
}

/**
 * Send Insurance Request Email (via SendGrid) - with retry logic
 * Previously used Gmail SMTP; now uses SendGrid REST API for Render compatibility
 * @param {Object} data - Claim details
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise}
 */
async function sendInsuranceRequestEmail(data, retryCount = 0) {
    const adminEmail = '2022a1r030@mietjammu.in';
    const maxRetries = 2;
    
    const mailOptions = {
        from: process.env.GMAIL_FROM,
        to: adminEmail,
        subject: '📋 New Crop Insurance Request',
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #1a2e1a; line-height: 1.6;">
                <h2 style="color: #2e7d32; border-bottom: 2px solid #e8f5e9; padding-bottom: 10px;">New Insurance Request</h2>
                <p>A new insurance request has been submitted by a farmer.</p>
                
                <div style="background: #f9f9f9; padding: 15px; border-radius: 12px; border: 1px solid #eee; margin: 20px 0;">
                    <p><strong>Claim ID:</strong> ${data.claim_id}</p>
                    <p><strong>Crop:</strong> ${data.crop_name}</p>
                    <p><strong>Season:</strong> ${data.season}</p>
                    <p><strong>Damage:</strong> ${data.damage_percent}%</p>
                    <p><strong>AI Summary:</strong> ${data.result_summary}</p>
                    <p><strong>Date:</strong> ${new Date(data.timestamp).toLocaleString('en-IN')}</p>
                </div>

                <div style="background: #fff8f1; padding: 15px; border-radius: 12px; border: 1px solid #ffe0b2; text-align: center;">
                    <p style="margin: 0; color: #e65100; font-weight: bold; font-size: 1.1rem;">Verification Code</p>
                    <div style="font-size: 28px; font-weight: bold; color: #bf360c; margin: 10px 0;">${data.verification_code}</div>
                    <p style="margin: 0; font-size: 0.85rem; color: #d84315;">Please verify this request on-site.</p>
                </div>

                <hr style="border: none; border-top: 1px solid #e8f5e9; margin: 20px 0;">
                <p style="font-size: 12px; color: #bdbdbd;">FasalBima AI Crop Insurance · Internal Admin Notification</p>
            </div>
        `
    };

    const attachments = Array.isArray(data.attachments) ? [...data.attachments] : [];

    if (data.pdfPath && typeof data.pdfPath === 'string') {
        attachments.push({ filename: `${data.claim_id || 'claim'}-summary.pdf`, path: data.pdfPath });
        console.log('📎 Claim summary attached');
    } else {
        console.warn('⚠️ No dynamic claim summary PDF path provided for email attachment');
    }

    const handbookPath = path.join(__dirname, '..', 'templates', 'fasalbima_field_verification_handbook.pdf');
    console.log('📁 Handbook path:', handbookPath);
    if (fs.existsSync(handbookPath)) {
        attachments.push({ filename: 'FasalBima_Field_Verification_Handbook.pdf', path: handbookPath });
        console.log('📎 Handbook PDF attached');
    } else {
        console.warn('⚠️ Handbook PDF not found, continuing without static handbook attachment:', handbookPath);
    }

    if (attachments.length) {
        attachments.forEach(a => {
            if (a.path) {
                const exists = fs.existsSync(a.path);
                console.log('📎 Attachment:', a.path, 'exists:', exists);
                if (!exists) {
                    throw new Error(`Attachment path not found: ${a.path}`);
                }
            }
        });
        mailOptions.attachments = attachments;
        console.log('📎 Mailer attachments:', attachments.map(a => a.path));
    }

    try {
        // PRE-FLIGHT CHECKS FOR SENDGRID DELIVERY
        console.log('\n🌐 ═══════════════════════════════════════════════════════════');
        console.log('🌐 INSURANCE EMAIL DELIVERY VIA SENDGRID');
        console.log('🌐 ═══════════════════════════════════════════════════════════');
        
        // LAYER 1: Configuration verification
        console.log('\n📋 LAYER 1: SendGrid Configuration:');
        console.log(`  • Provider: SendGrid REST API`);
        console.log(`  • Recipient: ${adminEmail}`);
        console.log(`  • From: ${adminEmail}`);
        console.log(`  • API Key: ${process.env.SMTP_PASS ? '✅ Configured' : '❌ MISSING'}`);
        console.log(`  • Claim ID: ${data.claim_id}`);
        console.log(`  • Attachments: ${attachments.length} file(s)`);
        
        // LAYER 2: SendGrid API key validation
        console.log('\n🔑 LAYER 2: SendGrid API Key Validation:');
        if (!process.env.SMTP_PASS) {
            throw new Error('SendGrid API key not configured (SMTP_PASS environment variable missing)');
        }
        if (!process.env.SMTP_PASS.startsWith('SG.')) {
            throw new Error('Invalid SendGrid API key format (should start with SG.)');
        }
        console.log(`✅ SendGrid API key is valid`);
        
        // LAYER 3: Prepare email for SendGrid delivery
        console.log('\n📧 LAYER 3: Preparing email for SendGrid delivery...');
        
        const info = await sendInsuranceEmailViaSendGrid(mailOptions);
        console.log('✅ Insurance request email sent:', info.messageId);
        return info;
    } catch (error) {
        const errorCode = error.code || error.name || 'UNKNOWN';
        const isTimeoutError = errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED' || errorCode === 'EHOSTUNREACH' || error.message.includes('timeout') || error.message.includes('Connection timeout') || error.message.includes('ENOTFOUND');
        
        console.error('\n❌ ═══════════════════════════════════════════════════════════');
        console.error(`❌ ERROR in sendInsuranceRequestEmail (${errorCode})`);
        console.error('❌ ═══════════════════════════════════════════════════════════');
        console.error(`Error Message: ${error.message}`);
        console.error(`Error Code: ${errorCode}`);
        console.error(`Full Stack: ${error.stack}`);
        console.error('\n🔍 DIAGNOSTIC INFO:');
        console.error(`  • SendGrid API Key Configured: ${process.env.SMTP_PASS ? '✅' : '❌'}`);
        console.error(`  • Sender Email: ${adminEmail}`);
        console.error(`  • Is Network Error: ${isTimeoutError ? '✅ YES' : '❌ NO'}`);
        console.error(`  • Attempt: ${retryCount + 1}/${maxRetries + 1}`);
        console.error('❌ ═══════════════════════════════════════════════════════════\n');
        
        // Retry on transient network errors
        if (isTimeoutError && retryCount < maxRetries) {
            console.warn(`⚠️ Transient network error detected. Retrying in 3 seconds... (Attempt ${retryCount + 2}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return sendInsuranceRequestEmail(data, retryCount + 1);
        }
        
        throw error;
    }
}

module.exports = {
    sendOTPEmail,
    sendInsuranceRequestEmail
};

