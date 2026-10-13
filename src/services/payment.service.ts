import { env, features } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PaymentModel } from "../models/payment.model.js";
import { UserModel } from "../models/user.model.js";
import type { AuthUser } from "../types/express.js";
import { ApiError } from "../utils/ApiError.js";
import { transactionId } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";
import { emailTemplates } from "../views/emails/templates.js";
import { sendEmail } from "./email.service.js";
import { notify } from "./notification.service.js";

const SSLC_BASE = () => (env.SSLC_IS_LIVE ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");

export const PLANS = [
  { months: 1, label: "Monthly", discount: 0 },
  { months: 6, label: "6 months", discount: 0.1 },
  { months: 12, label: "Yearly", discount: 0.2 },
].map((p) => ({ ...p, price: Math.round(env.PREMIUM_PRICE_BDT * p.months * (1 - p.discount)) }));

export const PREMIUM_FEATURES = [
  "Unlimited AI prescription & medicine strip scans",
  "Up to 10 caregivers per patient",
  "Priority AI processing",
  "Detailed adherence insights for the whole family",
];

/** Server-to-server check with SSLCommerz – never trust the browser redirect alone. */
async function validateWithGateway(valId: string) {
  const url = new URL(`${SSLC_BASE()}/validator/api/validationserverAPI.php`);
  url.search = new URLSearchParams({
    val_id: valId,
    store_id: env.SSLC_STORE_ID!,
    store_passwd: env.SSLC_STORE_PASSWORD!,
    format: "json",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Validation HTTP ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

export const paymentService = {
  plans: () => ({ enabled: features.sslcommerz, currency: "BDT", plans: PLANS, features: PREMIUM_FEATURES }),

  myPayments: (userId: string) => PaymentModel.listForUser(userId),

  async init(user: AuthUser, months: number) {
    if (!features.sslcommerz) throw ApiError.unavailable("Online payment is not configured yet", "PAYMENT_DISABLED");
    const plan = PLANS.find((p) => p.months === months);
    if (!plan) throw ApiError.badRequest("Unknown plan");

    const profile = await UserModel.findById(user.id);
    const tranId = transactionId();
    await PaymentModel.create({ userId: user.id, tranId, amount: plan.price, months, currency: "BDT" });

    const callback = (kind: string) => `${env.API_PUBLIC_URL}/api/payments/${kind}/${tranId}`;
    const body = new URLSearchParams({
      store_id: env.SSLC_STORE_ID!,
      store_passwd: env.SSLC_STORE_PASSWORD!,
      total_amount: plan.price.toFixed(2),
      currency: "BDT",
      tran_id: tranId,
      success_url: callback("success"),
      fail_url: callback("fail"),
      cancel_url: callback("cancel"),
      ipn_url: `${env.API_PUBLIC_URL}/api/payments/ipn`,
      shipping_method: "NO",
      product_name: `SmartMed Premium (${plan.label})`,
      product_category: "Subscription",
      product_profile: "non-physical-goods",
      cus_name: profile?.name ?? user.name,
      cus_email: user.email,
      cus_phone: profile?.phone ?? "01700000000",
      cus_add1: "Bangladesh",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      value_a: user.id,
    });

    const res = await fetch(`${SSLC_BASE()}/gwprocess/v4/api.php`, { method: "POST", body, signal: AbortSignal.timeout(20_000) });
    const data = (await res.json().catch(() => ({}))) as { status?: string; GatewayPageURL?: string; failedreason?: string };
    if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
      logger.error("SSLCommerz init failed:", data.failedreason);
      await prisma.payment.update({ where: { tranId }, data: { status: "FAILED", gatewayResponse: data as Prisma.InputJsonValue } });
      throw ApiError.unavailable("Payment gateway is not responding. Please try again.");
    }
    return { gatewayUrl: data.GatewayPageURL, tranId };
  },

  /**
   * Handles success/IPN callbacks. Idempotent: a payment is only activated once,
   * and only after SSLCommerz confirms the val_id and amount.
   */
  async complete(tranId: string, valId: string | undefined) {
    const payment = await PaymentModel.findByTranId(tranId);
    if (!payment) throw ApiError.notFound("Payment not found");
    if (payment.status === "SUCCESS") return payment;
    if (!valId) throw ApiError.badRequest("Missing validation id");

    const validation = await validateWithGateway(valId);
    const valid =
      ["VALID", "VALIDATED"].includes(validation.status ?? "") &&
      validation.tran_id === tranId &&
      Math.abs(Number(validation.amount) - Number(payment.amount)) < 0.01;

    if (!valid) {
      await PaymentModel.update(payment.id, { status: "FAILED", valId, gatewayResponse: validation as Prisma.InputJsonValue });
      throw ApiError.badRequest("Payment could not be verified");
    }

    const user = await UserModel.findById(payment.userId);
    const base = user?.planExpiresAt && user.planExpiresAt > new Date() ? user.planExpiresAt : new Date();
    const planExpiresAt = new Date(base);
    planExpiresAt.setMonth(planExpiresAt.getMonth() + payment.months);

    const [updated] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCESS", valId, cardType: validation.card_type, gatewayResponse: validation as Prisma.InputJsonValue },
      }),
      prisma.user.update({ where: { id: payment.userId }, data: { plan: "PREMIUM", planExpiresAt } }),
    ]);

    const amount = `৳${Number(payment.amount).toFixed(0)}`;
    const until = planExpiresAt.toDateString();
    await notify(payment.userId, {
      type: "PAYMENT",
      title: { en: "Premium activated 🎉", bn: "প্রিমিয়াম চালু হয়েছে 🎉" },
      message: {
        en: `Payment of ${amount} received. Premium is active until ${until}.`,
        bn: `${amount} পেমেন্ট পাওয়া গেছে। প্রিমিয়াম চালু থাকবে ${planExpiresAt.toLocaleDateString("bn-BD")} পর্যন্ত।`,
      },
      url: "/dashboard/billing",
    });
    if (user) await sendEmail(user.email, emailTemplates.paymentSuccess(user.name, amount, until));
    return updated;
  },

  async markClosed(tranId: string, status: "FAILED" | "CANCELLED") {
    const payment = await PaymentModel.findByTranId(tranId);
    if (payment && payment.status === "PENDING") await PaymentModel.update(payment.id, { status });
  },
};
