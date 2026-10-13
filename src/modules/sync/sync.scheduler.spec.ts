import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import type { PrismaService } from '@/common/prisma.service';
import { SyncTrigger } from '@/generated/prisma/client';
import { SyncScheduler } from './sync.scheduler';
import type { SyncConfig } from './sync.config';
import type { SyncService } from './sync.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

function createScheduler(
  options: { available?: boolean; userIds?: string[] } = {},
) {
  const { available = true, userIds = ['u1', 'u2', 'u3'] } = options;
  const prisma = {
    googleSheetsConnection: {
      findMany: jest
        .fn()
        .mockResolvedValue(userIds.map((userId) => ({ userId }))),
    },
  };
  const sync = {
    runForUser: jest.fn().mockResolvedValue({ id: 'run' }),
    failInterruptedRuns: jest.fn().mockResolvedValue(0),
  };
  const config = { isAvailable: available };
  const scheduler = new SyncScheduler(
    prisma as unknown as PrismaService,
    config as unknown as SyncConfig,
    sync as unknown as SyncService,
  );
  return { scheduler, prisma, sync };
}

describe('SyncScheduler', () => {
  it('runs at midnight Asia/Ho_Chi_Minh', () => {
    const options = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      SyncScheduler.prototype.handleNightlySync,
    );
    expect(options).toMatchObject({
      cronTime: '0 0 * * *',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('syncs only users whose toggle is on and whose connection is healthy', async () => {
    const { scheduler, prisma, sync } = createScheduler();

    await scheduler.handleNightlySync();

    expect(prisma.googleSheetsConnection.findMany).toHaveBeenCalledWith({
      where: { syncEnabled: true, needsReconnect: false },
      select: { userId: true },
    });
    expect(sync.runForUser.mock.calls).toEqual([
      ['u1', SyncTrigger.CRON],
      ['u2', SyncTrigger.CRON],
      ['u3', SyncTrigger.CRON],
    ]);
  });

  it('processes users one at a time, in order', async () => {
    const { scheduler, sync } = createScheduler();
    let active = 0;
    let maxActive = 0;
    sync.runForUser.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { id: 'run' };
    });

    await scheduler.handleNightlySync();
    expect(maxActive).toBe(1);
  });

  it('keeps going when one user fails, including when their access was revoked mid-run', async () => {
    const { scheduler, sync } = createScheduler();
    sync.runForUser.mockImplementation((userId: string) =>
      userId === 'u2'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ id: 'run' }),
    );

    await expect(scheduler.handleNightlySync()).resolves.toBeUndefined();
    expect(sync.runForUser).toHaveBeenCalledTimes(3);
  });

  it('never throws when listing the connections fails', async () => {
    const { scheduler, prisma, sync } = createScheduler();
    prisma.googleSheetsConnection.findMany.mockRejectedValue(
      new Error('db down'),
    );

    await expect(scheduler.handleNightlySync()).resolves.toBeUndefined();
    expect(sync.runForUser).not.toHaveBeenCalled();
  });

  it('does nothing when the feature is not configured', async () => {
    const { scheduler, prisma, sync } = createScheduler({ available: false });

    await scheduler.handleNightlySync();
    expect(prisma.googleSheetsConnection.findMany).not.toHaveBeenCalled();
    expect(sync.runForUser).not.toHaveBeenCalled();
  });

  describe('onModuleInit', () => {
    it('fails runs left RUNNING by a crash', async () => {
      const { scheduler, sync } = createScheduler();
      await scheduler.onModuleInit();
      expect(sync.failInterruptedRuns).toHaveBeenCalledTimes(1);
    });

    it('never blocks boot when the cleanup fails', async () => {
      const { scheduler, sync } = createScheduler();
      sync.failInterruptedRuns.mockRejectedValue(new Error('db down'));
      await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
