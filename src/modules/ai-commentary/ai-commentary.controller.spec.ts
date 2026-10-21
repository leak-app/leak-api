import type { User } from '@/generated/prisma/client';
import { AiCommentaryController } from './ai-commentary.controller';
import type { AiCommentaryService } from './ai-commentary.service';

describe('AiCommentaryController', () => {
  it('asks for the caller’s own transaction only', async () => {
    const view = { status: 'NONE', comment: null, sentiment: null };
    const service = { findForTransaction: jest.fn().mockResolvedValue(view) };
    const controller = new AiCommentaryController(
      service as unknown as AiCommentaryService,
    );

    await expect(
      controller.findForTransaction({ id: 'u1' } as User, 't1'),
    ).resolves.toBe(view);
    expect(service.findForTransaction).toHaveBeenCalledWith('u1', 't1');
  });
});
