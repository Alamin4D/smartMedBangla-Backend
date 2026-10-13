import type { Request, Response } from "express";
import { doseService } from "../services/dose.service.js";
import { sendResponse } from "../utils/response.js";

export const doseController = {
  async today(req: Request, res: Response) {
    sendResponse(res, { data: await doseService.today(req.patientId!) });
  },

  async history(req: Request, res: Response) {
    const { from, to } = req.query as { from?: Date; to?: Date };
    sendResponse(res, { data: await doseService.history(req.patientId!, from, to) });
  },

  async stats(req: Request, res: Response) {
    const { days } = req.query as { days?: number };
    sendResponse(res, { data: await doseService.stats(req.patientId!, days) });
  },

  async updateStatus(req: Request, res: Response) {
    const dose = await doseService.updateStatus(req.patientId!, req.params.id as string, req.body.status);
    const message = { TAKEN: "Great! Dose marked as taken.", SKIPPED: "Dose skipped", PENDING: "Dose reset" }[req.body.status as string];
    sendResponse(res, { message, data: dose });
  },
};
