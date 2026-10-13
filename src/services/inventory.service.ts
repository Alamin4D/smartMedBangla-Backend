import type { Prisma } from "../generated/prisma/client.js";
import { InventoryModel } from "../models/inventory.model.js";
import type { AuthUser } from "../types/express.js";
import { ApiError } from "../utils/ApiError.js";
import { addDays } from "../utils/time.js";
import { aiService } from "./ai/ai.service.js";
import { deleteImage, uploadImage } from "./upload.service.js";

export const EXPIRY_WARNING_DAYS = 7;

type Status = "all" | "active" | "expiring" | "expired" | "disposed";

function statusFilter(status: Status): Prisma.InventoryItemWhereInput {
  const now = new Date();
  switch (status) {
    case "active":
      return { isDisposed: false };
    case "expiring":
      return { isDisposed: false, expiryDate: { gte: now, lte: addDays(now, EXPIRY_WARNING_DAYS) } };
    case "expired":
      return { isDisposed: false, expiryDate: { lt: now } };
    case "disposed":
      return { isDisposed: true };
    default:
      return {};
  }
}

const withState = <T extends { expiryDate: Date; isDisposed: boolean }>(item: T) => {
  const daysLeft = Math.ceil((item.expiryDate.getTime() - Date.now()) / 86_400_000);
  const state = item.isDisposed ? "DISPOSED" : daysLeft < 0 ? "EXPIRED" : daysLeft <= EXPIRY_WARNING_DAYS ? "EXPIRING" : "OK";
  return { ...item, daysLeft, state };
};

async function getOwned(patientId: string, id: string) {
  const item = await InventoryModel.findForPatient(id, patientId);
  if (!item) throw ApiError.notFound("Item not found");
  return item;
}

export const inventoryService = {
  async list(patientId: string, status: Status) {
    const items = await InventoryModel.list(patientId, statusFilter(status));
    const all = await InventoryModel.list(patientId, { isDisposed: false });
    const summary = { total: all.length, expired: 0, expiring: 0, ok: 0 };
    for (const i of all.map(withState)) {
      if (i.state === "EXPIRED") summary.expired++;
      else if (i.state === "EXPIRING") summary.expiring++;
      else summary.ok++;
    }
    return { items: items.map(withState), summary };
  },

  /** Uploads the strip photo and lets the AI read the expiry date – the user confirms before saving. */
  async scan(user: AuthUser, file: Express.Multer.File) {
    await aiService.assertScanQuota(user);
    const [stored, { data }] = await Promise.all([
      uploadImage(file.buffer, "medicine-strips"),
      aiService.scanMedicineStrip(user.id, { mimeType: file.mimetype, data: file.buffer.toString("base64") }),
    ]);
    return { ...data, imageUrl: stored.url, imagePublicId: stored.publicId };
  },

  async create(patientId: string, data: Omit<Prisma.InventoryItemUncheckedCreateInput, "patientId">) {
    return withState(await InventoryModel.create({ ...data, patientId }));
  },

  async update(patientId: string, id: string, data: Prisma.InventoryItemUncheckedUpdateInput) {
    const current = await getOwned(patientId, id);
    // A new expiry date means a fresh alert should be sent later.
    const resetAlert = data.expiryDate && new Date(data.expiryDate as Date).getTime() !== current.expiryDate.getTime();
    return withState(await InventoryModel.update(id, { ...data, ...(resetAlert ? { expiryAlertSentAt: null } : {}) }));
  },

  async remove(patientId: string, id: string) {
    const item = await getOwned(patientId, id);
    await InventoryModel.delete(id);
    await deleteImage(item.imagePublicId);
  },
};
