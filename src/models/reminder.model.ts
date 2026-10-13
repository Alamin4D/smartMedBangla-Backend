import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { notDraft } from "./medicine.model.js";

export const ReminderModel = {
  create: (data: Prisma.ReminderUncheckedCreateInput) => prisma.reminder.create({ data }),

  update: (id: string, data: Prisma.ReminderUncheckedUpdateInput) => prisma.reminder.update({ where: { id }, data }),

  delete: (id: string) => prisma.reminder.delete({ where: { id } }),

  findForPatient: (id: string, patientId: string) => prisma.reminder.findFirst({ where: { id, patientId } }),

  /** Active reminders of active, non-draft medicines that are running during [dayStart, dayEnd). */
  listSchedulable: (patientId: string, dayStart: Date, dayEnd: Date) =>
    prisma.reminder.findMany({
      where: {
        patientId,
        isActive: true,
        medicine: {
          isActive: true,
          startDate: { lt: dayEnd },
          OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
          AND: [notDraft],
        },
      },
      select: { id: true, medicineId: true, time: true, daysOfWeek: true },
    }),
};
