import type { Request, Response } from "express";
import { prescriptionService } from "../services/prescription.service.js";
import { ApiError } from "../utils/ApiError.js";
import { langOf, translate } from "../utils/i18n.js";
import { sendResponse } from "../utils/response.js";

/** `failureReason` is stored in English; show it in the reader's language. */
const localize = <T extends { failureReason?: string | null }>(req: Request, rx: T): T =>
  rx.failureReason ? { ...rx, failureReason: translate(rx.failureReason, langOf(req)) } : rx;

export const prescriptionController = {
  async upload(req: Request, res: Response) {
    if (!req.file) throw ApiError.badRequest("Please attach a prescription photo");
    const prescription = localize(req, await prescriptionService.upload(req.user!, req.patientId!, req.file, req.body.title));
    sendResponse(res, {
      statusCode: 201,
      message:
        prescription.status === "PROCESSED"
          ? "Prescription read successfully. Please review the medicines."
          : (prescription.failureReason ?? "Prescription saved"),
      data: prescription,
    });
  },

  async list(req: Request, res: Response) {
    const { items, meta } = await prescriptionService.list(req.patientId!, req.query);
    sendResponse(res, { data: items.map((rx) => localize(req, rx)), meta });
  },

  async get(req: Request, res: Response) {
    sendResponse(res, { data: localize(req, await prescriptionService.get(req.patientId!, req.params.id as string)) });
  },

  async update(req: Request, res: Response) {
    sendResponse(res, { message: "Prescription updated", data: await prescriptionService.update(req.patientId!, req.params.id as string, req.body) });
  },

  async confirm(req: Request, res: Response) {
    const prescription = await prescriptionService.confirm(req.patientId!, req.params.id as string, req.body);
    sendResponse(res, { message: "Prescription verified. Reminders are now active.", data: prescription });
  },

  async reprocess(req: Request, res: Response) {
    const prescription = await prescriptionService.reprocess(req.user!, req.patientId!, req.params.id as string);
    sendResponse(res, { message: "Prescription re-processed", data: localize(req, prescription) });
  },

  async remove(req: Request, res: Response) {
    await prescriptionService.remove(req.patientId!, req.params.id as string);
    sendResponse(res, { message: "Prescription deleted" });
  },
};
