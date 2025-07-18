const express = require('express');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const router = express.Router();
const EmotionalContext = require('../models/EmotionalContext');

// POST /api/onboarding-step
router.post('/', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { question, response } = req.body;

    // Basic validation
    if (!question || !Array.isArray(response)) {
      return res.status(400).json({ success: false, message: 'Invalid payload. "question" and "response" are required.' });
    }

    // DB logic
    let doc = await EmotionalContext.findOne({ userId });
    if (!doc) {
      // Create new document
      doc = new EmotionalContext({
        userId,
        responses: [{ question, response }]
      });
      await doc.save();
      return res.status(201).json({ success: true, message: 'Onboarding response saved.' });
    } else {
      // Check for existing question
      const existingIdx = doc.responses.findIndex(r => r.question === question);
      if (existingIdx !== -1) {
        // Update existing response
        doc.responses[existingIdx].response = response;
      } else {
        // Append new question-response
        doc.responses.push({ question, response });
      }
      await doc.save();
      return res.status(200).json({ success: true, message: 'Onboarding response updated.' });
    }
  } catch (err) {
    console.log('Onboarding step request received');
    console.log(err);
    console.error('Error in onboarding-step:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;
