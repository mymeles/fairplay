import type { Prisma, PrismaClient } from '@prisma/client';
import type { DefaultArgs } from '@prisma/client/runtime/library';

// A PrismaClient narrowed to what's safe to call inside a `$transaction(fn)`
// callback. Repositories accept this so they can be reused either with the
// root client or with a transactional client.
export type PrismaTxn = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
