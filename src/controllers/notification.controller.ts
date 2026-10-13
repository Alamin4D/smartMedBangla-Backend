import type { Request, Response } from "express";
import { notificationService } from "../services/notification.service.js";
import { sendResponse } from "../utils/response.js";

export const notificationController = {
  async list(req: Request, res: Response) {
    const { items, unread, meta } = await notificationService.list(req.user!.id, req.query);
    sendResponse(res, { data: { items, unread }, meta });
  },

  async unreadCount(req: Request, res: Response) {
    sendResponse(res, { data: { count: await notificationService.unreadCount(req.user!.id) } });
  },

  async speakable(req: Request, res: Response) {
    const { minutes } = req.query as { minutes?: number };
    sendResponse(res, { data: await notificationService.speakable(req.user!.id, minutes ?? 10) });
  },

  async markRead(req: Request, res: Response) {
    await notificationService.markRead(req.user!.id, req.params.id as string);
    sendResponse(res, { message: "Marked as read" });
  },

  async markAllRead(req: Request, res: Response) {
    const { count } = await notificationService.markAllRead(req.user!.id);
    sendResponse(res, { message: `${count} notification(s) marked as read` });
  },

  async remove(req: Request, res: Response) {
    await notificationService.remove(req.user!.id, req.params.id as string);
    sendResponse(res, { message: "Notification deleted" });
  },

  pushConfig(_req: Request, res: Response) {
    sendResponse(res, { data: notificationService.pushConfig() });
  },

  async subscribePush(req: Request, res: Response) {
    await notificationService.subscribePush(req.user!.id, req.body);
    sendResponse(res, { statusCode: 201, message: "Browser notifications enabled" });
  },

  async unsubscribePush(req: Request, res: Response) {
    await notificationService.unsubscribePush(req.user!.id, req.body.endpoint);
    sendResponse(res, { message: "Browser notifications disabled" });
  },
};
