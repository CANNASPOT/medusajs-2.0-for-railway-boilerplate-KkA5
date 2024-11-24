const { PaymentService } = require('medusa-interfaces');
const axios = require('axios');

class CustomPaymentProviderService extends PaymentService {
  static identifier = 'custom-payment-provider';

  constructor(
    {
      manager,
      customerService,
      totalsService,
      regionService,
      cartService,
      paymentProviderRepository,
    },
    options
  ) {
    super(...arguments);

    // Initialize required properties
    this.manager_ = manager;
    this.customerService_ = customerService;
    this.totalsService_ = totalsService;
    this.regionService_ = regionService;
    this.cartService_ = cartService;
    this.paymentProviderRepository_ = paymentProviderRepository;

    this.apiUrl = process.env.PAYMENT_PROVIDER_API_URL || 'https://api.wlpis.io';
    this.authUrl = process.env.PAYMENT_PROVIDER_AUTH_URL || 'https://auth.wlpis.io';
    this.accessKey = process.env.PAYMENT_PROVIDER_ACCESS_KEY;
    this.secretKey = process.env.PAYMENT_PROVIDER_SECRET_KEY;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Authenticates with the payment provider API and stores the access token.
   */
  async authenticate() {
    try {
      const response = await axios.post(
        `${this.authUrl}/api/token/project`,
        {
          projectAccessKey: this.accessKey,
          projectSecretKey: this.secretKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const { accessToken, expiresIn } = response.data;
      this.accessToken = accessToken;
      this.tokenExpiry = Date.now() + expiresIn * 1000;
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Ensures that the access token is valid and refreshes it if necessary.
   */
  async ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Creates a payment session with the payment provider.
   *
   * @param {object} cart - The cart object from MedusaJS.
   * @returns {object} - Payment session data.
   */
  async createPayment(cart) {
    await this.ensureAuthenticated();

    const amount = cart.total / 100; // Assuming cart.total is in cents
    const currency = cart.region.currency_code.toUpperCase();

    try {
      const response = await axios.post(
        `${this.apiUrl}/api/payment/onlineBankTransfer`,
        {
          amount,
          currency,
          paymentUsage: `Order ${cart.id}`,
          notificationUrl: `${process.env.BACKEND_URL}/payment/webhook`,
          onlineBankTransferOptions: {
            requireInstantPayment: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const { transactionId, status } = response.data;

      // Return payment session data as per MedusaJS requirements
      return {
        provider_id: CustomPaymentProviderService.identifier,
        data: {
          transactionId,
          status,
        },
        amount: cart.total,
        currency_code: cart.region.currency_code,
      };
    } catch (error) {
      throw new Error(`Payment creation failed: ${error.message}`);
    }
  }

  /**
   * Retrieves a payment session.
   *
   * @param {object} paymentData - The payment data stored in MedusaJS.
   * @returns {object} - The payment data.
   */
  async retrievePayment(paymentData) {
    return paymentData;
  }

  /**
   * Updates the payment data if necessary.
   *
   * @param {object} paymentSessionData - Existing payment session data.
   * @param {object} update - Data to update.
   * @returns {object} - Updated payment data.
   */
  async updatePaymentData(paymentSessionData, update) {
    // Implement logic if the payment data needs to be updated
    return Object.assign({}, paymentSessionData, update);
  }

  /**
   * Authorizes the payment and returns the status.
   *
   * @param {object} paymentSession - The payment session object.
   * @param {object} context - Additional context.
   * @returns {object} - The payment session with updated status.
   */
  async authorizePayment(paymentSession, context = {}) {
    // For this payment provider, authorization is handled externally
    // We can assume the payment is authorized when created
    return {
      status: 'authorized',
      data: paymentSession.data,
    };
  }

  /**
   * Captures a payment. Not needed if payment is captured during authorization.
   *
   * @param {object} payment - The payment object.
   * @returns {object} - Result of the capture operation.
   */
  async capturePayment(payment) {
    // Implement capture logic if the payment provider supports it
    // For our case, we can assume payment is captured during authorization
    return { status: 'captured', data: payment.data };
  }

  /**
   * Refunds a payment.
   *
   * @param {object} payment - The payment object.
   * @param {number} amount - The amount to refund.
   * @returns {object} - Result of the refund operation.
   */
  async refundPayment(payment, amount) {
    await this.ensureAuthenticated();

    try {
      const response = await axios.post(
        `${this.apiUrl}/api/payment/refund`,
        {
          paymentTransactionId: payment.data.transactionId,
          amount: amount / 100, // Convert to currency units
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const { status } = response.data;

      return {
        status: status.toLowerCase(),
        data: payment.data,
      };
    } catch (error) {
      throw new Error(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Cancels a payment if possible.
   *
   * @param {object} paymentData - The payment data.
   * @returns {object} - Updated payment data.
   */
  async cancelPayment(paymentData) {
    // Implement cancellation logic if supported by the provider
    // For now, we can set the status to 'cancelled' in MedusaJS
    return {
      ...paymentData,
      status: 'cancelled',
    };
  }

  /**
   * Gets the status of a payment transaction.
   *
   * @param {object} paymentData - The payment data stored in MedusaJS.
   * @returns {string} - The status of the payment.
   */
  async getStatus(paymentData) {
    await this.ensureAuthenticated();

    try {
      const response = await axios.get(`${this.apiUrl}/api/payment/query`, {
        params: {
          paymentTransactionId: paymentData.data.transactionId,
        },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      const { queryResult } = response.data;
      const transaction = queryResult.find(
        (t) => t.paymentTransactionId === paymentData.data.transactionId
      );

      if (transaction) {
        return transaction.status.toLowerCase();
      } else {
        throw new Error('Transaction not found');
      }
    } catch (error) {
      throw new Error(`Failed to get payment status: ${error.message}`);
    }
  }

  /**
   * Updates the payment session status based on external events.
   *
   * @param {object} data - The data containing updated status.
   * @returns {object} - Updated payment session.
   */
  async updatePayment(paymentSessionData, data) {
    return {
      ...paymentSessionData,
      data: {
        ...paymentSessionData.data,
        ...data,
      },
    };
  }
}

module.exports = CustomPaymentProviderService;
