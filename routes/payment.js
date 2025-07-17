const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const PaymentService = require('../services/paymentService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Create Stripe checkout session
router.post('/create-session', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    const result = await PaymentService.createCheckoutSession(req.user._id, plan);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        url: result.url
      }
    });
  } catch (error) {
    console.error('Payment session creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment session'
    });
  }
});

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await PaymentService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handling error:', error);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
});

// Get payment status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    let subscriptionStatus = 'inactive';
    let nextBillingDate = null;
    
    if (user.isPremium) {
      subscriptionStatus = 'active';
      nextBillingDate = user.premiumExpiresAt;
      
      // Check if subscription is expired
      if (user.premiumExpiresAt && user.premiumExpiresAt < new Date()) {
        subscriptionStatus = 'expired';
      }
    }

    res.json({
      success: true,
      data: {
        isPremium: user.isPremium,
        status: subscriptionStatus,
        nextBillingDate,
        features: {
          aiChat: user.isPremium,
          advancedAnalytics: user.isPremium,
          customTasks: user.isPremium,
          exportData: user.isPremium
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status'
    });
  }
});

// Get payment history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const Payment = require('../models/Payment');
    
    const payments = await Payment.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
});

module.exports = router;