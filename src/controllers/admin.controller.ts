import type { Request, Response } from "express";
import { adminService } from "../services/admin.service.js";
import { sendResponse } from "../utils/response.js";

export const adminController = {
  async stats(_req: Request, res: Response) {
    sendResponse(res, { data: await adminService.stats() });
  },

  async users(req: Request, res: Response) {
    const { items, meta } = await adminService.users(req.query);
    sendResponse(res, { data: items, meta });
  },

  async updateUser(req: Request, res: Response) {
    sendResponse(res, { message: "User updated", data: await adminService.updateUser(req.user!, req.params.id as string, req.body) });
  },

  async deleteUser(req: Request, res: Response) {
    await adminService.deleteUser(req.user!, req.params.id as string);
    sendResponse(res, { message: "User deleted" });
  },

  async forceLogout(req: Request, res: Response) {
    const result = await adminService.forceLogout(req.user!, req.params.id as string);
    sendResponse(res, { message: `${result.revoked} session(s) revoked`, data: result });
  },

  async prescriptions(req: Request, res: Response) {
    const { items, meta } = await adminService.prescriptions(req.query);
    sendResponse(res, { data: items, meta });
  },

  async deletePrescription(req: Request, res: Response) {
    await adminService.deletePrescription(req.user!, req.params.id as string, req.body?.reason);
    sendResponse(res, { message: "Prescription removed" });
  },

  async payments(req: Request, res: Response) {
    const { items, meta } = await adminService.payments(req.query);
    sendResponse(res, { data: items, meta });
  },

  async aiLogs(req: Request, res: Response) {
    const { items, meta } = await adminService.aiLogs(req.query);
    sendResponse(res, { data: items, meta });
  },

  async auditLogs(req: Request, res: Response) {
    const { items, meta } = await adminService.auditLogs(req.query);
    sendResponse(res, { data: items, meta });
  },

  async broadcast(req: Request, res: Response) {
    const result = await adminService.broadcast(req.user!, req.body);
    sendResponse(res, { message: `Announcement sent to ${result.recipients} user(s)`, data: result });
  },
};
