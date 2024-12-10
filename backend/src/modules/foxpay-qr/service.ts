import {
  AbstractPaymentProvider,
  MedusaError
} from "@medusajs/framework/utils"
import {
  PaymentProviderError,
  PaymentProviderSessionResponse,
  PaymentSessionStatus,
  CreatePaymentProviderSession,
  UpdatePaymentProviderSession,
  WebhookActionResult
} from "@medusajs/framework/types"

type InjectedDependencies = {
  logger: any
}

type Options = {
  apiKey: string,
  foxpayBaseUrl?: string
}

class FoxPayProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "foxpay"

  protected logger_: any
  protected options_: Options
  protected baseUrl: string

  constructor({ logger }: InjectedDependencies, options: Options) {
    // @ts-ignore
    super(...arguments)
    this.logger_ = logger
    this.options_ = options
    this.baseUrl = options.foxpayBaseUrl || "https://api.foxpay.com"
  }

  static validateOptions(options: Record<string, any>) {
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "FoxPay: Missing API key in provider options."
      )
    }
  }

  /**
   * Initiates a payment session with FoxPay.
   * @param context The context: includes amount, currency_code, cart/customer details.
   */
  async initiatePayment(
    context: CreatePaymentProviderSession
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
    const { amount, currency_code, context: paymentContext } = context

    // Convert amount to cents if necessary. Assume `amount` is in smallest currency unit already.
    // Verwendungszweck could be derived from order/cart data. For example:
    const verwendungszweck = `Order #${paymentContext?.cart_id ?? "unknown"}`

    const payload = {
      amount: amount, // assumed to be in cents
      currency: currency_code.toUpperCase(),
      verwendungszweck: verwendungszweck
    }

    try {
      const res = await fetch(`${this.baseUrl}/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options_.apiKey}`
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorDetail = await res.text()
        return {
          error: new Error(`FoxPay initiation failed: ${errorDetail}`),
          code: "init_failed",
          detail: errorDetail
        }
      }

      const data = await res.json()

      // Assume FoxPay returns something like:
      // { "id": "fp_abc123", "qr_code_url": "https://..." }

      return {
        ...data,
        data: {
          id: data.id,             // store ID for future actions
          qr_code_url: data.qr_code_url,
          verwendungszweck: verwendungszweck
        }
      }
    } catch (e) {
      return {
        error: e,
        code: "unknown",
        detail: e
      }
    }
  }

  /**
   * Authorizes a payment session. For FoxPay, this might mean verifying the payment or waiting for webhook.
   */
  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<PaymentProviderError | { status: PaymentSessionStatus; data: Record<string, unknown> }> {
    const externalId = paymentSessionData.id as string

    // In some QR providers, payment is authorized after the customer scans the QR and completes the transfer.
    // This may be an asynchronous process (webhooks). For simplicity, we’ll just simulate a check.
    try {
      const statusRes = await fetch(`${this.baseUrl}/status/${externalId}`, {
        headers: {
          "Authorization": `Bearer ${this.options_.apiKey}`
        }
      })

      if (!statusRes.ok) {
        const detail = await statusRes.text()
        return { error: new Error(`FoxPay status check failed: ${detail}`), code: "status_failed", detail }
      }

      const statusData = await statusRes.json()
      // Assume FoxPay returns { "status": "authorized" | "pending" | "failed" }

      if (statusData.status === "authorized") {
        return {
          status: "authorized",
          data: {
            ...paymentSessionData
          }
        }
      }

      // If not yet authorized, we could return pending. The storefront may need to poll or rely on webhooks.
      return {
        error: new Error("Payment not yet authorized"),
        code: "not_authorized",
        detail: "Still pending user action"
      }
    } catch (e) {
      return {
        error: e,
        code: "unknown",
        detail: e
      }
    }
  }

  /**
   * Capture the payment. For FoxPay, this might mean finalizing the transaction.
   */
  async capturePayment(
    paymentData: Record<string, unknown>
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const externalId = paymentData.id as string

    try {
      const res = await fetch(`${this.baseUrl}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options_.apiKey}`
        },
        body: JSON.stringify({ id: externalId })
      })

      if (!res.ok) {
        const detail = await res.text()
        return { error: new Error(`FoxPay capture failed: ${detail}`), code: "capture_failed", detail }
      }

      const newData = await res.json()
      return {
        ...paymentData,
        ...newData
      }
    } catch (e) {
      return { error: e, code: "unknown", detail: e }
    }
  }

  /**
   * Cancels the payment.
   */
  async cancelPayment(
    paymentData: Record<string, unknown>
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const externalId = paymentData.id as string

    try {
      const res = await fetch(`${this.baseUrl}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options_.apiKey}`
        },
        body: JSON.stringify({ id: externalId })
      })

      if (!res.ok) {
        const detail = await res.text()
        return { error: new Error(`FoxPay cancel failed: ${detail}`), code: "cancel_failed", detail }
      }

      const data = await res.json()
      return { ...paymentData, ...data }
    } catch (e) {
      return { error: e, code: "unknown", detail: e }
    }
  }

  /**
   * Deletes a payment session if it’s not authorized yet.
   */
  async deletePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const externalId = paymentSessionData.id as string
    // We can reuse cancel since it's effectively deleting a non-authorized payment.
    return this.cancelPayment({ id: externalId })
  }

  /**
   * Gets the status of a payment session.
   */
  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    const externalId = paymentSessionData.id as string

    try {
      const res = await fetch(`${this.baseUrl}/status/${externalId}`, {
        headers: {
          "Authorization": `Bearer ${this.options_.apiKey}`
        }
      })

      if (!res.ok) {
        return "error"
      }

      const data = await res.json()
      // Map FoxPay statuses to Medusa statuses
      switch (data.status) {
        case "authorized":
          return "authorized"
        case "captured":
          return "captured"
        case "canceled":
          return "canceled"
        default:
          return "pending"
      }
    } catch {
      return "error"
    }
  }

  /**
   * Refund a previously captured payment.
   */
  async refundPayment(
    paymentData: Record<string, unknown>,
    refundAmount: number
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const externalId = paymentData.id as string

    try {
      const res = await fetch(`${this.baseUrl}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options_.apiKey}`
        },
        body: JSON.stringify({
          id: externalId,
          amount: refundAmount
        })
      })

      if (!res.ok) {
        const detail = await res.text()
        return { error: new Error(`FoxPay refund failed: ${detail}`), code: "refund_failed", detail }
      }

      const newData = await res.json()
      return {
        ...paymentData,
        ...newData
      }
    } catch (e) {
      return { error: e, code: "unknown", detail: e }
    }
  }

  /**
   * Retrieves the full payment details from FoxPay.
   */
  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentProviderError | Record<string, unknown>> {
    const externalId = paymentSessionData.id as string

    try {
      const res = await fetch(`${this.baseUrl}/retrieve/${externalId}`, {
        headers: {
          "Authorization": `Bearer ${this.options_.apiKey}`
        }
      })

      if (!res.ok) {
        const detail = await res.text()
        return { error: new Error(`FoxPay retrieve failed: ${detail}`), code: "retrieve_failed", detail }
      }

      const data = await res.json()
      return data
    } catch (e) {
      return { error: e, code: "unknown", detail: e }
    }
  }

  /**
   * Updates a payment session if necessary.
   */
  async updatePayment(
    context: UpdatePaymentProviderSession
  ): Promise<PaymentProviderError | PaymentProviderSessionResponse> {
    const { amount, currency_code, context: paymentContext, data } = context
    const externalId = data.id as string
    const verwendungszweck = `Order Update #${paymentContext?.cart_id ?? "unknown"}`

    try {
      const res = await fetch(`${this.baseUrl}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options_.apiKey}`
        },
        body: JSON.stringify({
          id: externalId,
          amount: amount,
          currency: currency_code.toUpperCase(),
          verwendungszweck: verwendungszweck
        })
      })

      if (!res.ok) {
        const detail = await res.text()
        return { error: new Error(`FoxPay update failed: ${detail}`), code: "update_failed", detail }
      }

      const response = await res.json()
      return {
        ...response,
        data: {
          id: response.id,
          verwendungszweck: verwendungszweck
        }
      }
    } catch (e) {
      return { error: e, code: "unknown", detail: e }
    }
  }

  /**
   * Handles webhook events from FoxPay.
   */
  async getWebhookActionAndData(
    payload: { data: Record<string, unknown>; rawData: string | Buffer; headers: Record<string, unknown> }
  ): Promise<WebhookActionResult> {
    const { data } = payload;

    try {
      switch (data.event_type) {
        case "payment_authorized":
          return {
            action: "authorized",
            data: {
              session_id: data.session_id,
              amount: data.amount,
            },
          };
        case "payment_captured":
          return {
            action: "captured",
            data: {
              session_id: data.session_id,
              amount: data.amount,
            },
          };
        default:
          return {
            action: "not_supported",
          };
      }
    } catch (e) {
      return {
        action: "failed",
        data: {
          session_id: data.session_id,
          amount: data.amount,
        },
      };
    }
  }
}
export default FoxPayProviderService
