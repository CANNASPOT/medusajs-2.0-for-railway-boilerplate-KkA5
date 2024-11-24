// src/api/routes/store/payment.js

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.post('/payment/webhook', async (req, res) => {
  const payload = JSON.stringify(req.body);
  const signature = req.headers['x-hmac-sha384'];
  const webhookSecret = process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET;

  // Verify HMAC signature
  const hmac = crypto.createHmac('sha384', webhookSecret).update(payload).digest('hex');

  if (hmac !== signature) {
    return res.status(401).send('Invalid signature');
  }

  const { paymentTransactionId, updatedStatus } = req.body;

  try {
    // Update payment session and order status
    // Implement logic to update the payment session and corresponding order

    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
