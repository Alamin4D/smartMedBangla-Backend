import { Router } from "express";
import { z } from "zod";
import { notificationController } from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { boolQuery, idParam } from "../validators/common.validator.js";

const router = Router();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  unread: boolQuery,
});
const pushSubscription = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

router.get("/push/config", notificationController.pushConfig);

router.use(authenticate);

router.get("/", validate({ query: listQuery }), notificationController.list);
router.get("/unread-count", notificationController.unreadCount);
router.get(
  "/speakable",
  validate({ query: z.object({ minutes: z.coerce.number().int().min(1).max(60).optional() }) }),
  notificationController.speakable,
);
router.patch("/read-all", notificationController.markAllRead);
router.patch("/:id/read", validate({ params: idParam }), notificationController.markRead);
router.delete("/:id", validate({ params: idParam }), notificationController.remove);

router.post("/push/subscribe", validate({ body: pushSubscription }), notificationController.subscribePush);
router.delete("/push/subscribe", validate({ body: z.object({ endpoint: z.url() }) }), notificationController.unsubscribePush);

export default router;
