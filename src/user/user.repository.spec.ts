import type { PrismaService } from '@/common/prisma.service';
import { AccountType } from '@/generated/prisma/client';
import { UserRepository } from './user.repository';

describe('UserRepository.create', () => {
  it('creates a default "Tiền mặt" LIQUID wallet with the user', async () => {
    const prisma = {
      user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
    };
    const repository = new UserRepository(prisma as unknown as PrismaService);

    await repository.create({ email: 'a@b.c', password: 'hash', name: 'A' });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'a@b.c',
        password: 'hash',
        name: 'A',
        accounts: {
          create: {
            name: 'Tiền mặt',
            type: AccountType.LIQUID,
            initialBalance: 0,
            currentBalance: 0,
          },
        },
      },
    });
  });
});
