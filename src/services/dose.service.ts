import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { DoseStatus } from "../generated/prisma/enums.js";
import { DoseLogModel } from "../models/doseLog.model.js";
import { ReminderModel } from "../models/reminder.model.js";
import { ApiError } from "../utils/ApiError.js";
import { addDays, getZonedParts, localDateKey, localDayRange, parseHHmm, zonedToUtc } from "../utils/time.js";

export async function getPatientTimezone(patientId: string) {
  const patient = await prisma.user.findUnique({ where: { id: patientId }, select: { timezone: true } });
  if (!patient) throw ApiError.notFound("Patient not found");
  return patient.timezone;
}

/**
 * Creates the PENDING dose rows for one local day from the patient's active reminders.
 * Idempotent thanks to the (reminderId, scheduledFor) unique constraint.
 */
export async function materializeDay(patientId: string, timeZone: string, day: Date = new Date()) {
  const { start, end, parts } = localDayRange(day, timeZone);
  const reminders = await ReminderModel.listSchedulable(patientId, start, end);
  const rows: Prisma.DoseLogCreateManyInput[] = [];

  for (const reminder of reminders) {
    if (reminder.daysOfWeek.length && !reminder.daysOfWeek.includes(parts.weekday)) continue;
    const { hour, minute } = parseHHmm(reminder.time);
    rows.push({
      reminderId: reminder.id,
      medicineId: reminder.medicineId,
      patientId,
      scheduledFor: zonedToUtc(parts.year, parts.month, parts.day, hour, minute, timeZone),
    });
  }
  if (rows.length) await DoseLogModel.createMany(rows);
  return rows.length;
}

/** Re-creates today's future doses after reminders change. */
export async function rescheduleToday(patientId: string, where: Prisma.DoseLogWhereInput) {
  await DoseLogModel.deleteFuturePending({ ...where, patientId });
  await materializeDay(patientId, await getPatientTimezone(patientId));
}

const ADHERENCE_COUNTED: DoseStatus[] = ["TAKEN", "MISSED", "SKIPPED"];

const slotOf = (hour: number) => (hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night");

export const doseService = {
  async today(patientId: string) {
    const timeZone = await getPatientTimezone(patientId);
    await materializeDay(patientId, timeZone);
    const { start, end } = localDayRange(new Date(), timeZone);
    const doses = await DoseLogModel.listInRange(patientId, start, end);
    const summary = { total: doses.length, taken: 0, missed: 0, skipped: 0, pending: 0 };
    for (const d of doses) summary[d.status.toLowerCase() as keyof typeof summary]++;
    const next = doses.find((d) => d.status === "PENDING" && d.scheduledFor >= new Date(Date.now() - 30 * 60_000));
    return { date: localDateKey(new Date(), timeZone), timeZone, summary, nextDoseId: next?.id ?? null, doses };
  },

  async history(patientId: string, from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? addDays(end, -7);
    if (end.getTime() - start.getTime() > 92 * 86_400_000) throw ApiError.badRequest("Date range cannot exceed 3 months");
    return DoseLogModel.listInRange(patientId, start, end);
  },

  async updateStatus(patientId: string, doseId: string, status: "TAKEN" | "SKIPPED" | "PENDING") {
    const dose = await DoseLogModel.findForPatient(doseId, patientId);
    if (!dose) throw ApiError.notFound("Dose not found");
    const now = Date.now();
    if (dose.scheduledFor.getTime() > now + 2 * 3_600_000) {
      throw ApiError.badRequest("You can only mark a dose up to 2 hours before its time");
    }
    if (dose.scheduledFor.getTime() < now - 48 * 3_600_000) {
      throw ApiError.badRequest("Doses older than 48 hours can no longer be changed");
    }
    return DoseLogModel.updateStatus(doseId, status);
  },

  async stats(patientId: string, days = 30) {
    const timeZone = await getPatientTimezone(patientId);
    const { end } = localDayRange(new Date(), timeZone);
    const start = addDays(end, -days);
    const logs = await DoseLogModel.listForStats(patientId, start, end);

    const totals = { taken: 0, missed: 0, skipped: 0, pending: 0 };
    const daily = new Map<string, { date: string; taken: number; missed: number; skipped: number; pending: number }>();
    const byMedicine = new Map<string, { medicineId: string; name: string; taken: number; total: number }>();
    const bySlot = new Map<string, { slot: string; taken: number; total: number }>();

    for (const log of logs) {
      const key = log.status.toLowerCase() as keyof typeof totals;
      totals[key]++;

      const date = localDateKey(log.scheduledFor, timeZone);
      const day = daily.get(date) ?? { date, taken: 0, missed: 0, skipped: 0, pending: 0 };
      day[key]++;
      daily.set(date, day);

      if (!ADHERENCE_COUNTED.includes(log.status)) continue;
      const med = byMedicine.get(log.medicine.id) ?? { medicineId: log.medicine.id, name: log.medicine.name, taken: 0, total: 0 };
      med.total++;
      if (log.status === "TAKEN") med.taken++;
      byMedicine.set(log.medicine.id, med);

      const slot = slotOf(getZonedParts(log.scheduledFor, timeZone).hour);
      const s = bySlot.get(slot) ?? { slot, taken: 0, total: 0 };
      s.total++;
      if (log.status === "TAKEN") s.taken++;
      bySlot.set(slot, s);
    }

    const counted = totals.taken + totals.missed + totals.skipped;
    const rate = (taken: number, total: number) => (total ? Math.round((taken / total) * 100) : null);

    // Current streak: consecutive past days (newest first) where every counted dose was taken.
    let streakDays = 0;
    const sortedDays = [...daily.values()].sort((a, b) => b.date.localeCompare(a.date));
    for (const day of sortedDays) {
      const dayCounted = day.taken + day.missed + day.skipped;
      if (dayCounted === 0) continue;
      if (day.missed === 0 && day.skipped === 0) streakDays++;
      else break;
    }

    return {
      days,
      timeZone,
      totals: { ...totals, total: logs.length },
      adherenceRate: rate(totals.taken, counted),
      streakDays,
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      byMedicine: [...byMedicine.values()].map((m) => ({ ...m, rate: rate(m.taken, m.total) })).sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0)),
      byTimeOfDay: ["morning", "afternoon", "evening", "night"]
        .map((slot) => bySlot.get(slot))
        .filter(Boolean)
        .map((s) => ({ ...s!, rate: rate(s!.taken, s!.total) })),
    };
  },
};
