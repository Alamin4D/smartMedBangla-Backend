import type { Request, Response } from "express";
import { medicineService } from "../services/medicine.service.js";
import { sendResponse } from "../utils/response.js";

export const medicineController = {
  async list(req: Request, res: Response) {
    const { active, search } = req.query as { active?: boolean; search?: string };
    sendResponse(res, { data: await medicineService.list(req.patientId!, { active, search }) });
  },

  async get(req: Request, res: Response) {
    sendResponse(res, { data: await medicineService.get(req.patientId!, req.params.id as string) });
  },

  async create(req: Request, res: Response) {
    sendResponse(res, { statusCode: 201, message: "Medicine added", data: await medicineService.create(req.patientId!, req.body) });
  },

  async update(req: Request, res: Response) {
    sendResponse(res, { message: "Medicine updated", data: await medicineService.update(req.patientId!, req.params.id as string, req.body) });
  },

  async remove(req: Request, res: Response) {
    await medicineService.remove(req.patientId!, req.params.id as string);
    sendResponse(res, { message: "Medicine deleted" });
  },
};
