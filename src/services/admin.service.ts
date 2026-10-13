import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AiFeature, PaymentStatus, PrescriptionStatus, Role, UserStatus } from "../generated/prisma/enums.js";
import { AiInteractionModel } from "../models/aiInteraction.model.js";
import { AuditLogModel } from "../models/auditLog.model.js";
import { PaymentModel } from "../models/payment.model.js";
import { PrescriptionModel } from "../models/prescription.model.js";
import { SessionModel } from "../models/session.model.js";
import { UserModel } from "../models/user.model.js";
import type { AuthUser } from "../types/express.js";
import { ApiError } from "../utils/ApiError.js";
import { buildMeta, getPagination } from "../utils/response.js";
import { addDays } from "../utils/time.js";
import { cache } from "./cache.service.js";
import { deleteImage } from "./upload.service.js";

type ListQuery = { page?: number; limit?: number; search?: string; status?: string; feature?: string };

/** Groups rows by calendar day (UTC) for the last `days` days so charts have no gaps. */
function dailySeries(rows: { createdAt: Date }[], days: number) {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) buckets.set(addDays(new Date(), -i).toISOString().slice(0, 10), 0);
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export const adminService = {
  async publicStats() {
    const cached = await cache.get<unknown>("public:stats");
    if (cached) return cached;
    const [patients, caregivers, prescriptionsRead, dosesTaken] = await Promise.all([
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.user.count({ where: { role: "CAREGIVER" } }),
      prisma.prescription.count({ where: { status: { in: ["PROCESSED", "VERIFIED"] } } }),
      prisma.doseLog.count({ where: { status: "TAKEN" } }),
    ]);
    const result = { patients, caregivers, prescriptionsRead, dosesTaken };
    await cache.set("public:stats", result, 300);
    return result;
  },

  async stats() {
    const cached = await cache.get<unknown>("admin:stats");
    if (cached) return cached;

    const since = addDays(new Date(), -30);
    const [
      usersByRole,
      usersByStatus,
      premiumUsers,
      prescriptionsByStatus,
      activeMedicines,
      doseStatus,
      aiByFeature,
      aiFailures,
      revenue,
      recentUsers,
      recentPrescriptions,
      careLinks,
      inventoryExpired,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { plan: "PREMIUM" } }),
      prisma.prescription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.medicine.count({ where: { isActive: true } }),
      prisma.doseLog.groupBy({ by: ["status"], where: { scheduledFor: { gte: since } }, _count: { _all: true } }),
      prisma.aiInteraction.groupBy({ by: ["feature"], where: { createdAt: { gte: since } }, _count: { _all: true }, _avg: { latencyMs: true } }),
      prisma.aiInteraction.count({ where: { createdAt: { gte: since }, success: false } }),
      prisma.payment.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.prescription.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.careLink.count({ where: { status: "ACCEPTED" } }),
      prisma.inventoryItem.count({ where: { isDisposed: false, expiryDate: { lt: new Date() } } }),
    ]);

    const toMap = <K extends string>(rows: { _count: { _all: number } }[], key: K) =>
      Object.fromEntries(rows.map((r) => [(r as unknown as Record<K, string>)[key], r._count._all]));

    const doses = toMap(doseStatus, "status");
    const counted = (doses.TAKEN ?? 0) + (doses.MISSED ?? 0) + (doses.SKIPPED ?? 0);
    const aiTotal = aiByFeature.reduce((s, r) => s + r._count._all, 0);

    const result = {
      users: {
        total: usersByRole.reduce((s, r) => s + r._count._all, 0),
        byRole: toMap(usersByRole, "role"),
        byStatus: toMap(usersByStatus, "status"),
        premium: premiumUsers,
        newLast30Days: recentUsers.length,
        signupsDaily: dailySeries(recentUsers, 30),
      },
      prescriptions: {
        total: prescriptionsByStatus.reduce((s, r) => s + r._count._all, 0),
        byStatus: toMap(prescriptionsByStatus, "status"),
        uploadsDaily: dailySeries(recentPrescriptions, 30),
      },
      medicines: { active: activeMedicines },
      adherence: { last30Days: doses, rate: counted ? Math.round(((doses.TAKEN ?? 0) / counted) * 100) : null },
      ai: {
        totalLast30Days: aiTotal,
        failuresLast30Days: aiFailures,
        successRate: aiTotal ? Math.round(((aiTotal - aiFailures) / aiTotal) * 100) : null,
        byFeature: aiByFeature.map((r) => ({ feature: r.feature, count: r._count._all, avgLatencyMs: Math.round(r._avg.latencyMs ?? 0) })),
      },
      revenue: { totalBdt: Number(revenue._sum.amount ?? 0), successfulPayments: revenue._count._all },
      care: { activeLinks: careLinks },
      inventory: { expiredNotDisposed: inventoryExpired },
      generatedAt: new Date(),
    };
    await cache.set("admin:stats", result, 60);
    return result;
  },

  async users(query: ListQuery & { role?: Role }) {
    const { page, limit, skip } = getPagination(query);
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status as UserStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const { items, total } = await UserModel.list(where, skip, limit);
    return { items, meta: buildMeta(page, limit, total) };
  },

  async updateUser(admin: AuthUser, userId: string, data: Prisma.UserUpdateInput) {
    if (userId === admin.id && (data.role || data.status)) {
      throw ApiError.badRequest("You cannot change your own role or status");
    }
    const user = await UserModel.update(userId, data);
    if (data.status === "SUSPENDED") await SessionModel.revokeAllForUser(userId);
    await AuditLogModel.create({ actorId: admin.id, action: "USER_UPDATED", targetType: "User", targetId: userId, meta: data as Prisma.InputJsonValue });
    await cache.del("admin:stats");
    return user;
  },

  async deleteUser(admin: AuthUser, userId: string) {
    if (userId === admin.id) throw ApiError.badRequest("You cannot delete your own account");
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.notFound("User not found");
    await UserModel.delete(userId);
    await AuditLogModel.create({ actorId: admin.id, action: "USER_DELETED", targetType: "User", targetId: userId, meta: { email: user.email } });
    await cache.del("admin:stats");
  },

  async forceLogout(admin: AuthUser, userId: string) {
    const { count } = await SessionModel.revokeAllForUser(userId);
    await AuditLogModel.create({ actorId: admin.id, action: "USER_FORCE_LOGOUT", targetType: "User", targetId: userId });
    return { revoked: count };
  },

  async prescriptions(query: ListQuery) {
    const { page, limit, skip } = getPagination(query);
    const where: Prisma.PrescriptionWhereInput = {
      ...(query.status ? { status: query.status as PrescriptionStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { doctorName: { contains: query.search, mode: "insensitive" } },
              { patient: { name: { contains: query.search, mode: "insensitive" } } },
              { patient: { email: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const { items, total } = await PrescriptionModel.list(where, skip, limit);
    return { items, meta: buildMeta(page, limit, total) };
  },

  /** Moderation: remove an inappropriate / non-medical upload. */
  async deletePrescription(admin: AuthUser, id: string, reason?: string) {
    const prescription = await prisma.prescription.findUnique({ where: { id } });
    if (!prescription) throw ApiError.notFound("Prescription not found");
    if (prescription.status !== "VERIFIED") await prisma.medicine.deleteMany({ where: { prescriptionId: id } });
    await PrescriptionModel.delete(id);
    await deleteImage(prescription.imagePublicId);
    await AuditLogModel.create({
      actorId: admin.id,
      action: "PRESCRIPTION_REMOVED",
      targetType: "Prescription",
      targetId: id,
      meta: { patientId: prescription.patientId, reason: reason ?? null },
    });
  },

  async payments(query: ListQuery) {
    const { page, limit, skip } = getPagination(query);
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status as PaymentStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { tranId: { contains: query.search, mode: "insensitive" } },
              { user: { email: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const { items, total } = await PaymentModel.list(where, skip, limit);
    return { items, meta: buildMeta(page, limit, total) };
  },

  async aiLogs(query: ListQuery) {
    const { page, limit, skip } = getPagination(query);
    const where: Prisma.AiInteractionWhereInput = {
      ...(query.feature ? { feature: query.feature as AiFeature } : {}),
      ...(query.status === "failed" ? { success: false } : query.status === "success" ? { success: true } : {}),
    };
    const { items, total } = await AiInteractionModel.list(where, skip, limit);
    return { items, meta: buildMeta(page, limit, total) };
  },

  async auditLogs(query: ListQuery) {
    const { page, limit, skip } = getPagination(query);
    const { items, total } = await AuditLogModel.list(skip, limit);
    return { items, meta: buildMeta(page, limit, total) };
  },

  /** Sends an in-app system notification to every active user (optionally one role). */
  async broadcast(admin: AuthUser, input: { title: string; message: string; role?: Role }) {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", ...(input.role ? { role: input.role } : {}) },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: "SYSTEM" as const, title: input.title, message: input.message })),
    });
    await AuditLogModel.create({ actorId: admin.id, action: "BROADCAST_SENT", meta: { ...input, recipients: users.length } });
    return { recipients: users.length };
  },
};
