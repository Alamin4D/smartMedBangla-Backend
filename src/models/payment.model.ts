import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export const PaymentModel = {
  create: (data: Prisma.PaymentUncheckedCreateInput) => prisma.payment.create({ data }),

  findByTranId: (tranId: string) => prisma.payment.findUnique({ where: { tranId } }),

  update: (id: string, data: Prisma.PaymentUncheckedUpdateInput) => prisma.payment.update({ where: { id }, data }),

  listForUser: (userId: string) => prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),

  list: async (where: Prisma.PaymentWhereInput, skip: number, take: number) => {
    const [items, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tranId: true,
          amount: true,
          currency: true,
          status: true,
          plan: true,
          months: true,
          cardType: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);
    return { items, total };
  },
};
