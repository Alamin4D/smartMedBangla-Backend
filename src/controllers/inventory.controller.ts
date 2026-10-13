import type { Request, Response } from "express";
import { inventoryService } from "../services/inventory.service.js";
import { ApiError } from "../utils/ApiError.js";
import { sendResponse } from "../utils/response.js";

export const inventoryController = {
  async list(req: Request, res: Response) {
    const { status } = req.query as { status: "all" | "active" | "expiring" | "expired" | "disposed" };
    sendResponse(res, { data: await inventoryService.list(req.patientId!, status) });
  },

  async scan(req: Request, res: Response) {
    if (!req.file) throw ApiError.badRequest("Please attach a photo of the medicine strip");
    const result = await inventoryService.scan(req.user!, req.file);
    sendResponse(res, {
      message: result.expiryDate ? "Expiry date detected. Please confirm the details." : "We could not read the expiry date. Please enter it manually.",
      data: result,
    });
  },

  async create(req: Request, res: Response) {
    sendResponse(res, { statusCode: 201, message: "Added to your medicine cabinet", data: await inventoryService.create(req.patientId!, req.body) });
  },

  async update(req: Request, res: Response) {
    sendResponse(res, { message: "Item updated", data: await inventoryService.update(req.patientId!, req.params.id as string, req.body) });
  },

  async remove(req: Request, res: Response) {
    await inventoryService.remove(req.patientId!, req.params.id as string);
    sendResponse(res, { message: "Item removed" });
  },
};
