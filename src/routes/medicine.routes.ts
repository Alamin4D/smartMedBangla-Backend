import { Router } from "express";
import { medicineController } from "../controllers/medicine.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { patientScope } from "../middlewares/patientScope.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { idParam } from "../validators/common.validator.js";
import { medicineValidator } from "../validators/medicine.validator.js";

const router = Router();

router.use(authenticate, patientScope);

router.get("/", validate({ query: medicineValidator.listQuery }), medicineController.list);
router.post("/", validate({ body: medicineValidator.create }), medicineController.create);
router.get("/:id", validate({ params: idParam }), medicineController.get);
router.patch("/:id", validate({ params: idParam, body: medicineValidator.update }), medicineController.update);
router.delete("/:id", validate({ params: idParam }), medicineController.remove);

export default router;
