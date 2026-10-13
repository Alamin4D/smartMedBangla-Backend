import { prisma } from "../config/prisma.js";
import { MedicineModel } from "../models/medicine.model.js";
import { ApiError } from "../utils/ApiError.js";
import { addDays } from "../utils/time.js";
import type { MedicineCreateInput, MedicineUpdateInput, ReminderInput } from "../validators/medicine.validator.js";
import { rescheduleToday } from "./dose.service.js";

const endDateFrom = (start: Date, durationDays?: number | null, endDate?: Date | null) =>
  endDate !== undefined ? endDate : durationDays ? addDays(start, durationDays) : null;

/**
 * Brings a medicine's reminders in line with the submitted list.
 * Reminders that already have dose history are deactivated instead of deleted so history is kept.
 */
async function syncReminders(medicineId: string, patientId: string, incoming: ReminderInput[]) {
  const existing = await prisma.reminder.findMany({
    where: { medicineId },
    select: { id: true, _count: { select: { doseLogs: true } } },
  });
  const existingIds = new Set(existing.map((r) => r.id));
  const keepIds = new Set(incoming.filter((r) => r.id && existingIds.has(r.id)).map((r) => r.id!));

  await prisma.$transaction([
    ...incoming.map((r) =>
      r.id && existingIds.has(r.id)
        ? prisma.reminder.update({
            where: { id: r.id },
            data: { time: r.time, quantity: r.quantity, daysOfWeek: r.daysOfWeek, isActive: r.isActive },
          })
        : prisma.reminder.create({
            data: { medicineId, patientId, time: r.time, quantity: r.quantity, daysOfWeek: r.daysOfWeek, isActive: r.isActive },
          }),
    ),
    ...existing
      .filter((r) => !keepIds.has(r.id))
      .map((r) =>
        r._count.doseLogs > 0
          ? prisma.reminder.update({ where: { id: r.id }, data: { isActive: false } })
          : prisma.reminder.delete({ where: { id: r.id } }),
      ),
  ]);
}

export const medicineService = {
  list: (patientId: string, filter: { active?: boolean; search?: string }) => MedicineModel.list(patientId, filter),

  async get(patientId: string, id: string) {
    const medicine = await MedicineModel.findForPatient(id, patientId);
    if (!medicine) throw ApiError.notFound("Medicine not found");
    return medicine;
  },

  async create(patientId: string, input: MedicineCreateInput) {
    const { reminders, ...fields } = input;
    const startDate = fields.startDate ?? new Date();
    const medicine = await prisma.medicine.create({
      data: {
        ...fields,
        patientId,
        startDate,
        endDate: endDateFrom(startDate, fields.durationDays, fields.endDate),
        reminders: {
          create: reminders.map((r) => ({ patientId, time: r.time, quantity: r.quantity, daysOfWeek: r.daysOfWeek, isActive: r.isActive })),
        },
      },
    });
    await rescheduleToday(patientId, { medicineId: medicine.id });
    return this.get(patientId, medicine.id);
  },

  async update(patientId: string, id: string, input: MedicineUpdateInput) {
    const current = await this.get(patientId, id);
    const { reminders, ...fields } = input;

    const startDate = fields.startDate ?? current.startDate;
    const endDate =
      fields.endDate !== undefined || fields.durationDays !== undefined
        ? endDateFrom(startDate, fields.durationDays ?? current.durationDays, fields.endDate)
        : undefined;

    await MedicineModel.update(id, { ...fields, ...(endDate !== undefined ? { endDate } : {}) });
    if (reminders) await syncReminders(id, patientId, reminders);
    await rescheduleToday(patientId, { medicineId: id });
    return this.get(patientId, id);
  },

  async remove(patientId: string, id: string) {
    await this.get(patientId, id);
    await MedicineModel.delete(id);
  },
};
