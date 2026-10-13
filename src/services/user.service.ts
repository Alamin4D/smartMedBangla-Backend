import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AuditLogModel } from "../models/auditLog.model.js";
import { InventoryModel } from "../models/inventory.model.js";
import { MedicineModel, notDraft } from "../models/medicine.model.js";
import { NotificationModel } from "../models/notification.model.js";
import { PrescriptionModel } from "../models/prescription.model.js";
import { UserModel } from "../models/user.model.js";
import type { AuthUser } from "../types/express.js";
import { ApiError } from "../utils/ApiError.js";
import { randomToken } from "../utils/crypto.js";
import { addDays } from "../utils/time.js";
import { doseService } from "./dose.service.js";
import { deleteImage, uploadImage } from "./upload.service.js";

export const userService = {
  async getProfile(userId: string) {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.notFound("User not found");
    return user;
  },

  updateProfile: (userId: string, data: Prisma.UserUpdateInput) => UserModel.update(userId, data),

  updatePreferences: (userId: string, data: Prisma.UserUpdateInput) => UserModel.update(userId, data),

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const current = await UserModel.findByIdWithSecrets(userId);
    const stored = await uploadImage(file.buffer, "avatars");
    const user = await UserModel.update(userId, { avatarUrl: stored.url, avatarPublicId: stored.publicId });
    await deleteImage(current?.avatarPublicId);
    return user;
  },

  /** Creates a read-only link a patient can show to any new doctor. */
  async createShareLink(userId: string, expiresInDays: number | null) {
    const user = await UserModel.update(userId, {
      shareToken: randomToken(18),
      shareExpiresAt: expiresInDays ? addDays(new Date(), expiresInDays) : null,
    });
    return { token: user.shareToken, expiresAt: user.shareExpiresAt, url: `${env.CLIENT_URL}/share/${user.shareToken}` };
  },

  revokeShareLink: (userId: string) => UserModel.update(userId, { shareToken: null, shareExpiresAt: null }),

  /** Public doctor view – medical history only, no contact or account data. */
  async sharedProfile(token: string) {
    const user = await UserModel.findByShareToken(token);
    if (!user || user.status !== "ACTIVE" || (user.shareExpiresAt && user.shareExpiresAt < new Date())) {
      throw ApiError.notFound("This share link is invalid or has expired");
    }
    const [prescriptions, medicines, adherence] = await Promise.all([
      prisma.prescription.findMany({
        where: { patientId: user.id, status: { in: ["VERIFIED", "PROCESSED"] } },
        orderBy: [{ prescribedDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          title: true,
          doctorName: true,
          hospital: true,
          prescribedDate: true,
          diagnosis: true,
          advice: true,
          imageUrl: true,
          status: true,
          createdAt: true,
          medicines: { select: { name: true, strength: true, dosagePattern: true, durationDays: true, mealTiming: true } },
        },
      }),
      MedicineModel.list(user.id, { active: true }),
      doseService.stats(user.id, 30),
    ]);
    return {
      patient: {
        name: user.name,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        bloodGroup: user.bloodGroup,
        allergies: user.allergies,
        chronicConditions: user.chronicConditions,
      },
      expiresAt: user.shareExpiresAt,
      currentMedicines: medicines.map((m) => ({
        name: m.name,
        genericName: m.genericName,
        strength: m.strength,
        dosagePattern: m.dosagePattern,
        mealTiming: m.mealTiming,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      prescriptions,
      adherence: { rate: adherence.adherenceRate, totals: adherence.totals },
    };
  },

  async deleteAccount(user: AuthUser, password: string) {
    const record = await UserModel.findByIdWithSecrets(user.id);
    if (!record || !(await bcrypt.compare(password, record.passwordHash))) throw ApiError.badRequest("Password is incorrect");
    if (record.role === "ADMIN") throw ApiError.forbidden("Admin accounts cannot be self-deleted");
    await UserModel.delete(user.id);
    await AuditLogModel.create({ action: "USER_SELF_DELETED", targetType: "User", targetId: user.id, meta: { email: user.email } });
  },

  /** Patient home dashboard – a single round trip with everything the overview needs. */
  async dashboard(patientId: string) {
    const [today, weekly, activeMedicines, prescriptions, cabinet, unread] = await Promise.all([
      doseService.today(patientId),
      doseService.stats(patientId, 7),
      prisma.medicine.count({ where: { patientId, isActive: true, AND: [notDraft] } }),
      PrescriptionModel.countForPatient(patientId),
      InventoryModel.list(patientId, { isDisposed: false, expiryDate: { lte: addDays(new Date(), 7) } }),
      NotificationModel.unreadCount(patientId),
    ]);
    return {
      today,
      weekly: { adherenceRate: weekly.adherenceRate, streakDays: weekly.streakDays, daily: weekly.daily, totals: weekly.totals },
      counts: { activeMedicines, prescriptions, expiringItems: cabinet.length, unreadNotifications: unread },
      expiringItems: cabinet.slice(0, 5),
    };
  },
};
