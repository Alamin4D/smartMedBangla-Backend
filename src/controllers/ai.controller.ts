import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import type { Language } from "../generated/prisma/enums.js";
import { aiService } from "../services/ai/ai.service.js";
import { sendResponse } from "../utils/response.js";

/** Answers follow the language the user picked in their preferences unless overridden. */
async function languageOf(req: Request): Promise<Language> {
  if (req.body?.language === "bn" || req.body?.language === "en") return req.body.language;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { language: true } });
  return user?.language ?? "bn";
}

export const aiController = {
  async usage(req: Request, res: Response) {
    sendResponse(res, { data: await aiService.scanUsage(req.user!) });
  },

  async medicineInfo(req: Request, res: Response) {
    sendResponse(res, { data: await aiService.medicineInfo(req.user!.id, req.body.name, await languageOf(req)) });
  },

  async interactions(req: Request, res: Response) {
    const report = await aiService.checkInteractions(req.user!.id, req.patientId!, req.body.medicines ?? [], await languageOf(req));
    sendResponse(res, { data: report });
  },

  async chatHistory(req: Request, res: Response) {
    sendResponse(res, { data: await aiService.chatHistory(req.user!.id) });
  },

  async chat(req: Request, res: Response) {
    sendResponse(res, { data: await aiService.chat(req.user!, req.body.message, await languageOf(req)) });
  },

  async clearChat(req: Request, res: Response) {
    await aiService.clearChat(req.user!.id);
    sendResponse(res, { message: "Conversation cleared" });
  },

  async adherenceInsight(req: Request, res: Response) {
    sendResponse(res, { data: await aiService.adherenceInsight(req.user!.id, req.patientId!, await languageOf(req)) });
  },
};
