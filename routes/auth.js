const express = require('express');
const router = express.Router();
const { sendOTPEmail } = require('../services/mailer');

// OTP Storage: { email: { otp, expiresAt } }
const otpStore = new Map();

/**
 * Endpoint: POST /api/auth/send-otp
 */
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    try {
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Store OTP (overwrites old one if exists)
        otpStore.set(email, { otp, expiresAt });

        // Send Email
        await sendOTPEmail(email, otp);

        res.json({ success: true, message: 'OTP sent to email successfully' });
    } catch (error) {
        console.error('❌ Error in /send-otp route:', error.message);
        res.status(500).json({ success: false, message: 'Failed to send OTP. Check server logs.' });
    }
});

/**
 * Endpoint: POST /api/auth/verify-otp
 */
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP required' });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
        return res.status(401).json({ success: false, message: 'OTP not found for this email' });
    }

    // Check Expiry
    if (Date.now() > storedData.expiresAt) {
        otpStore.delete(email);
        return res.status(401).json({ success: false, message: 'OTP expired (5 min limit exceeded)' });
    }

    // Check Match
    if (storedData.otp !== otp) {
        return res.status(401).json({ success: false, message: 'Invalid OTP code' });
    }

    // Success!
    otpStore.delete(email); // One-time use
    res.json({ success: true, message: 'Auth success', token: 'mock-jwt-token-' + Date.now() });
});

module.exports = router;
