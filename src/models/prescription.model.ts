import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

const medicineWithReminders = {
  include: { reminders: { orderBy: { time: "asc" } } },
  orderBy: { createdAt: "asc" },
} satisfies Prisma.Prescription$medicinesArgs;

export const PrescriptionModel = {
  create: (data: Prisma.PrescriptionUncheckedCreateInput) => prisma.prescription.create({ data }),

  update: (id: string, data: Prisma.PrescriptionUncheckedUpdateInput) => prisma.prescription.update({ where: { id }, data }),

  findForPatient: (id: string, patientId: string) =>
    prisma.prescription.findFirst({ where: { id, patientId }, include: { medicines: medicineWithReminders } }),

  list: async (where: Prisma.PrescriptionWhereInput, skip: number, take: number) => {
    const [items, total] = await prisma.$transaction([
      prisma.prescription.findMany({
        where,
        skip,
        take,
        orderBy: [{ prescribedDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        include: {
          medicines: { select: { id: true, name: true, strength: true, dosagePattern: true, isActive: true } },
          patient: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.prescription.count({ where }),
    ]);
    return { items, total };
  },

  delete: (id: string) => prisma.prescription.delete({ where: { id } }),

  countForPatient: (patientId: string) => prisma.prescription.count({ where: { patientId } }),
};
