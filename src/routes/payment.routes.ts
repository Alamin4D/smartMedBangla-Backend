import { Router } from "express";
import { z } from "zod";
import { paymentController } from "../controllers/payment.controller.js";
import { authenticate, authorize, requireVerifiedEmail } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.get("/plans", paymentController.plans);
router.get("/me", authenticate, paymentController.mine);
router.post(
  "/init",
  authenticate,
  authorize("PATIENT", "CAREGIVER"),
  requireVerifiedEmail,
  validate({ body: z.object({ months: z.coerce.number().int().refine((m) => [1, 6, 12].includes(m), "Unknown plan") }) }),
  paymentController.init,
);

// Gateway callbacks (form-encoded POSTs from SSLCommerz)
router.post("/success/:tranId", paymentController.success);
router.post("/fail/:tranId", paymentController.fail);
router.post("/cancel/:tranId", paymentController.cancel);
router.post("/ipn", paymentController.ipn);

export default router;
