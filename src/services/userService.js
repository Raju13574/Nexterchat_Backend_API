const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

// ... other user service functions ...

async function validatePaymentMethod(userId, paymentMethodId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Retrieve the payment method to ensure it exists and is valid
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod) {
      throw new Error('Invalid payment method');
    }

    // Attach the payment method to the customer if it's not already attached
    if (paymentMethod.customer !== user.stripeCustomerId) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.stripeCustomerId,
      });
    }

    // Optionally, set this as the default payment method for the customer
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return { isValid: true, message: 'Payment method is valid and has been set as default' };
  } catch (error) {
    console.error('Payment method validation error:', error);
    return { isValid: false, message: error.message };
  }
}

async function deleteAccount(userId) {
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new Error('User not found');
    }
    // Additional cleanup if needed (e.g., deleting associated data)
    return true;
  } catch (error) {
    console.error('Error in deleteAccount:', error);
    throw error;
  }
}

module.exports = {
  // ... other exported functions ...
  validatePaymentMethod,
  deleteAccount,
};