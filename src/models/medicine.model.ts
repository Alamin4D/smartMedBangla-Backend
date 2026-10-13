import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

/**
 * Medicines extracted from a prescription stay as drafts until the patient verifies the prescription.
 * Drafts are excluded from every "real" medicine query.
 */
export const notDraft: Prisma.MedicineWhereInput = {
  OR: [{ prescriptionId: null }, { prescription: { status: "VERIFIED" } }],
};

export const MedicineModel = {
  create: (data: Prisma.MedicineUncheckedCreateInput) =>
    prisma.medicine.create({ data, include: { reminders: true } }),

  update: (id: string, data: Prisma.MedicineUncheckedUpdateInput) =>
    prisma.medicine.update({ where: { id }, data, include: { reminders: { orderBy: { time: "asc" } } } }),

  delete: (id: string) => prisma.medicine.delete({ where: { id } }),

  findForPatient: (id: string, patientId: string) =>
    prisma.medicine.findFirst({
      where: { id, patientId },
      include: {
        reminders: { orderBy: { time: "asc" } },
        prescription: { select: { id: true, title: true, doctorName: true, prescribedDate: true } },
      },
    }),

  list: (patientId: string, filter: { active?: boolean; search?: string }) =>
    prisma.medicine.findMany({
      where: {
        patientId,
        AND: [notDraft],
        ...(filter.active !== undefined ? { isActive: filter.active } : {}),
        ...(filter.search ? { name: { contains: filter.search, mode: "insensitive" } } : {}),
      },
      include: {
        reminders: { orderBy: { time: "asc" } },
        prescription: { select: { id: true, title: true, doctorName: true } },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),

  listActiveNames: (patientId: string) =>
    prisma.medicine.findMany({
      where: { patientId, isActive: true, AND: [notDraft] },
      select: { name: true, genericName: true, strength: true, dosagePattern: true, mealTiming: true },
    }),

  /** Auto-deactivate medicines whose course has finished. */
  deactivateFinished: () =>
    prisma.medicine.updateMany({ where: { isActive: true, endDate: { lt: new Date() } }, data: { isActive: false } }),
};
