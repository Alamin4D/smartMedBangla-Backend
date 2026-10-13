import { Router } from "express";
import { inventoryController } from "../controllers/inventory.controller.js";
import { authenticate, requireVerifiedEmail } from "../middlewares/auth.middleware.js";
import { patientScope } from "../middlewares/patientScope.middleware.js";
import { aiLimiter } from "../middlewares/rateLimit.middleware.js";
import { imageUpload } from "../middlewares/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { idParam } from "../validators/common.validator.js";
import { inventoryValidator } from "../validators/inventory.validator.js";

const router = Router();

router.use(authenticate, patientScope);

router.get("/", validate({ query: inventoryValidator.listQuery }), inventoryController.list);
router.post("/scan", requireVerifiedEmail, aiLimiter, imageUpload.single("image"), inventoryController.scan);
router.post("/", validate({ body: inventoryValidator.create }), inventoryController.create);
router.patch("/:id", validate({ params: idParam, body: inventoryValidator.update }), inventoryController.update);
router.delete("/:id", validate({ params: idParam }), inventoryController.remove);

export default router;
