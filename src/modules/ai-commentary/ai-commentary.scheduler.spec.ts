import { AiCommentaryScheduler } from './ai-commentary.scheduler';
import type { AiCommentaryService } from './ai-commentary.service';

function setup(
  overrides: Partial<{ isEnabled: boolean; processDue: jest.Mock }> = {},
) {
  const service = {
    isEnabled: true,
    processDue: jest.fn().mockResolvedValue(0),
    purgeFinished: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
  return {
    service,
    scheduler: new AiCommentaryScheduler(
      service as unknown as AiCommentaryService,
    ),
  };
}

describe('AiCommentaryScheduler', () => {
  it('does nothing while the Buddy is off', async () => {
    const { scheduler, service } = setup({ isEnabled: false });
    await scheduler.tick();
    expect(service.processDue).not.toHaveBeenCalled();
  });

  it('never runs two ticks at once', async () => {
    let release!: () => void;
    const processDue = jest.fn(
      () => new Promise<number>((resolve) => (release = () => resolve(0))),
    );
    const { scheduler } = setup({ processDue });

    const first = scheduler.tick();
    await scheduler.tick(); // skipped: the first is still running
    release();
    await first;

    expect(processDue).toHaveBeenCalledTimes(1);
  });

  it('survives a crash and runs again on the next tick', async () => {
    const processDue = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(0);
    const { scheduler } = setup({ processDue });

    await expect(scheduler.tick()).resolves.toBeUndefined();
    await scheduler.tick();

    expect(processDue).toHaveBeenCalledTimes(2);
  });

  it('purges old jobs without failing the app when it errors', async () => {
    const { scheduler, service } = setup();
    service.purgeFinished.mockRejectedValue(new Error('boom'));
    await expect(scheduler.purge()).resolves.toBeUndefined();
  });
});
