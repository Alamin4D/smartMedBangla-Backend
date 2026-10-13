import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { paymentService } from "../services/payment.service.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../utils/response.js";

const billingUrl = (status: string, tranId?: string) =>
  `${env.CLIENT_URL}/dashboard/billing?status=${status}${tranId ? `&tran=${encodeURIComponent(tranId)}` : ""}`;

export const paymentController = {
  plans(_req: Request, res: Response) {
    sendResponse(res, { data: paymentService.plans() });
  },

  async mine(req: Request, res: Response) {
    sendResponse(res, { data: await paymentService.myPayments(req.user!.id) });
  },

  async init(req: Request, res: Response) {
    sendResponse(res, { message: "Redirecting to payment gateway", data: await paymentService.init(req.user!, req.body.months) });
  },

  /** SSLCommerz posts the browser back here; we validate server-side and bounce to the frontend. */
  async success(req: Request, res: Response) {
    const tranId = req.params.tranId as string;
    try {
      await paymentService.complete(tranId, req.body?.val_id);
      res.redirect(303, billingUrl("success", tranId));
    } catch (err) {
      logger.error("Payment success handler failed:", (err as Error).message);
      res.redirect(303, billingUrl("failed", tranId));
    }
  },

  async fail(req: Request, res: Response) {
    await paymentService.markClosed(req.params.tranId as string, "FAILED");
    res.redirect(303, billingUrl("failed", req.params.tranId as string));
  },

  async cancel(req: Request, res: Response) {
    await paymentService.markClosed(req.params.tranId as string, "CANCELLED");
    res.redirect(303, billingUrl("cancelled", req.params.tranId as string));
  },

  /** Instant Payment Notification – server-to-server, may arrive before or after the browser redirect. */
  async ipn(req: Request, res: Response) {
    const { tran_id: tranId, val_id: valId, status } = req.body ?? {};
    if (tranId && valId && status === "VALID") {
      await paymentService.complete(tranId, valId).catch((err) => logger.error("IPN failed:", err.message));
    }
    res.status(200).json({ received: true });
  },
};
