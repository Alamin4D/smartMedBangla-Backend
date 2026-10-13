import type { Plan, Role } from "../generated/prisma/enums.js";

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
  plan: Plan;
  timezone: string;
  isEmailVerified: boolean;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Patient whose data the request operates on (self, or a linked patient for caregivers). */
      patientId?: string;
    }
  }
}

export {};
