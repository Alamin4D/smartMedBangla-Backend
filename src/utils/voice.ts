/**
 * Builds the sentence the browser speaks aloud with the Web Speech API,
 * e.g. "দাদু, এখন আপনার ভরা পেটে নাপা এক্সটেন্ড ১টি খাওয়ার সময় হয়েছে।"
 */
import type { Language, MealTiming } from "../generated/prisma/enums.js";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export const toBanglaDigits = (value: string) => value.replace(/\d/g, (d) => BN_DIGITS[Number(d)] as string);

const MEAL_BN: Record<MealTiming, string> = {
  BEFORE_MEAL: "খালি পেটে ",
  AFTER_MEAL: "ভরা পেটে ",
  WITH_MEAL: "খাবারের সাথে ",
  ANY: "",
};

const MEAL_EN: Record<MealTiming, string> = {
  BEFORE_MEAL: " before your meal",
  AFTER_MEAL: " after your meal",
  WITH_MEAL: " with your meal",
  ANY: "",
};

export const mealTimingLabel = (meal: MealTiming, lang: Language) =>
  lang === "bn" ? MEAL_BN[meal].trim() || "যেকোনো সময়" : MEAL_EN[meal].trim() || "any time";

export function buildDoseSpeech(input: {
  language: Language;
  honorific?: string | null;
  patientName: string;
  medicineName: string;
  quantity: string;
  mealTiming: MealTiming;
}) {
  const firstName = input.patientName.split(" ")[0] ?? input.patientName;
  if (input.language === "bn") {
    const who = input.honorific?.trim() || firstName;
    const qty = /^\d+$/.test(input.quantity) ? `${toBanglaDigits(input.quantity)}টি ` : `${toBanglaDigits(input.quantity)} `;
    return `${who}, এখন আপনার ${MEAL_BN[input.mealTiming]}${input.medicineName} ${qty}খাওয়ার সময় হয়েছে। খাওয়ার পর "খেয়েছি" বোতামে চাপ দিন।`;
  }
  const who = input.honorific?.trim() || firstName;
  return `${who}, it is time to take ${input.quantity} ${input.medicineName}${MEAL_EN[input.mealTiming]}. Please press "Taken" after you take it.`;
}
