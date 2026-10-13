import { Router } from "express";
import { prescriptionController } from "../controllers/prescription.controller.js";
import { authenticate, requireVerifiedEmail } from "../middlewares/auth.middleware.js";
import { patientScope } from "../middlewares/patientScope.middleware.js";
import { aiLimiter } from "../middlewares/rateLimit.middleware.js";
import { imageUpload } from "../middlewares/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { idParam } from "../validators/common.validator.js";
import { prescriptionValidator } from "../validators/prescription.validator.js";

const router = Router();

router.use(authenticate, patientScope);

router.get("/", validate({ query: prescriptionValidator.listQuery }), prescriptionController.list);
router.post(
  "/",
  requireVerifiedEmail,
  aiLimiter,
  imageUpload.single("image"),
  validate({ body: prescriptionValidator.upload }),
  prescriptionController.upload,
);
router.get("/:id", validate({ params: idParam }), prescriptionController.get);
router.patch("/:id", validate({ params: idParam, body: prescriptionValidator.update }), prescriptionController.update);
router.post("/:id/confirm", validate({ params: idParam, body: prescriptionValidator.confirm }), prescriptionController.confirm);
router.post("/:id/reprocess", requireVerifiedEmail, aiLimiter, validate({ params: idParam }), prescriptionController.reprocess);
router.delete("/:id", validate({ params: idParam }), prescriptionController.remove);

export default router;
