const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

// 1. Transporter for Login / OTP (SendGrid)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

/**
 * Send OTP Email
 * @param {string} email - Destination email
 * @param {string} otp - 6-digit code
 * @returns {Promise}
 */
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: process.env.GMAIL_FROM,
        to: email,
        subject: '🔐 Your FasalBima Verification Code',
        html: `
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
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email Sent successfully:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ SMTP Error in mailer.js:', error.stack || error.message);
        throw error; // Rethrow to handle in routes
    }
}

/**
 * Send Insurance Request Email (via Gmail)
 * @param {Object} data - Claim details
 * @returns {Promise}
 */
async function sendInsuranceRequestEmail(data) {
    const adminEmail = '2022a1r030@mietjammu.in';
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
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Insurance request email sent:', info.messageId);
            return info;
        } catch (error) {
            console.error('❌ Gmail transporter error in mailer.js:', error.stack || error.message);
            throw error;
        }
    }

module.exports = {
    sendOTPEmail,
    sendInsuranceRequestEmail
};

