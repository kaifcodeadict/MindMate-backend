const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Payment = require('../models/Payment');

class PaymentService {
  static async createCheckoutSession(userId, plan) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const prices = {
        monthly: { amount: 999, description: 'Monthly Premium Plan' }, // $9.99
        yearly: { amount: 9999, description: 'Yearly Premium Plan' } // $99.99
      };

      const priceInfo = prices[plan];
      if (!priceInfo) {
        throw new Error('Invalid plan selected');
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Mental Health App Premium',
                description: priceInfo.description,
              },
              unit_amount: priceInfo.amount,
              recurring: {
                interval: plan === 'monthly' ? 'month' : 'year',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/premium/cancel`,
        customer_email: user.email,
        client_reference_id: userId,
        metadata: {
          userId,
          plan,
        },
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url
      };
    } catch (error) {
      console.error('Payment Service Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async handleWebhook(event) {
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleSuccessfulPayment(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handleSubscriptionRenewal(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancellation(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Webhook handling error:', error);
      throw error;
    }
  }

  static async handleSuccessfulPayment(session) {
    try {
      const userId = session.metadata.userId;
      const plan = session.metadata.plan;
      
      // Calculate expiration date
      const expiresAt = new Date();
      if (plan === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      // Update user premium status
      await User.findByIdAndUpdate(userId, {
        isPremium: true,
        premiumExpiresAt: expiresAt
      });

      // Create payment record
      await Payment.create({
        userId,
        provider: 'stripe',
        plan,
        amount: session.amount_total,
        currency: session.currency,
        status: 'paid',
        transactionId: session.id,
        stripeSessionId: session.id,
        expiresAt
      });

      console.log(`Premium activated for user ${userId}`);
    } catch (error) {
      console.error('Error handling successful payment:', error);
      throw error;
    }
  }

  static async handleSubscriptionRenewal(invoice) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const customer = await stripe.customers.retrieve(subscription.customer);
      
      // Find user by email
      const user = await User.findOne({ email: customer.email });
      if (!user) {
        console.error('User not found for subscription renewal');
        return;
      }

      // Update expiration date
      const expiresAt = new Date(subscription.current_period_end * 1000);
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        premiumExpiresAt: expiresAt
      });

      console.log(`Subscription renewed for user ${user._id}`);
    } catch (error) {
      console.error('Error handling subscription renewal:', error);
      throw error;
    }
  }

  static async handleSubscriptionCancellation(subscription) {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      const user = await User.findOne({ email: customer.email });
      
      if (!user) {
        console.error('User not found for subscription cancellation');
        return;
      }

      // Update user premium status
      await User.findByIdAndUpdate(user._id, {
        isPremium: false,
        premiumExpiresAt: null
      });

      console.log(`Premium cancelled for user ${user._id}`);
    } catch (error) {
      console.error('Error handling subscription cancellation:', error);
      throw error;
    }
  }
}

module.exports = PaymentService;