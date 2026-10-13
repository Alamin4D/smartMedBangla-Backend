import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { authValidator } from "../validators/auth.validator.js";
import { idParam } from "../validators/common.validator.js";

const router = Router();

router.post("/register", authLimiter, validate({ body: authValidator.register }), authController.register);
router.post("/login", authLimiter, validate({ body: authValidator.login }), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

router.post("/verify-email", authLimiter, validate({ body: authValidator.verifyEmail }), authController.verifyEmail);
router.post("/resend-otp", authLimiter, validate({ body: authValidator.resendOtp }), authController.resendOtp);
router.post("/forgot-password", authLimiter, validate({ body: authValidator.forgotPassword }), authController.forgotPassword);
router.post("/reset-password", authLimiter, validate({ body: authValidator.resetPassword }), authController.resetPassword);

router.get("/me", authenticate, authController.me);
router.patch("/change-password", authenticate, validate({ body: authValidator.changePassword }), authController.changePassword);
router.get("/sessions", authenticate, authController.sessions);
router.delete("/sessions", authenticate, authController.revokeOtherSessions);
router.delete("/sessions/:id", authenticate, validate({ params: idParam }), authController.revokeSession);

export default router;
