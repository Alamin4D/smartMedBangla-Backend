import { Router } from "express";
import { z } from "zod";
import { adminController } from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { adminValidator } from "../validators/admin.validator.js";
import { idParam } from "../validators/common.validator.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/stats", adminController.stats);

router.get("/users", validate({ query: adminValidator.usersQuery }), adminController.users);
router.patch("/users/:id", validate({ params: idParam, body: adminValidator.updateUser }), adminController.updateUser);
router.delete("/users/:id", validate({ params: idParam }), adminController.deleteUser);
router.post("/users/:id/force-logout", validate({ params: idParam }), adminController.forceLogout);

router.get("/prescriptions", validate({ query: adminValidator.listQuery }), adminController.prescriptions);
router.delete(
  "/prescriptions/:id",
  validate({ params: idParam, body: z.object({ reason: z.string().trim().max(300).optional() }).optional() }),
  adminController.deletePrescription,
);

router.get("/payments", validate({ query: adminValidator.listQuery }), adminController.payments);
router.get("/ai-logs", validate({ query: adminValidator.listQuery }), adminController.aiLogs);
router.get("/audit-logs", validate({ query: adminValidator.listQuery }), adminController.auditLogs);
router.post("/broadcast", validate({ body: adminValidator.broadcast }), adminController.broadcast);

export default router;
