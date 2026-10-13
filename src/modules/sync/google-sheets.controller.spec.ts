import type { Response } from 'express';
import type { User } from '@/generated/prisma/client';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { GoogleSheetsController } from './google-sheets.controller';
import type { GoogleSheetsService } from './google-sheets.service';

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */

const user = { id: 'user-1' } as User;

function setup() {
  const order: string[] = [];
  const service = {
    getStatus: jest.fn().mockResolvedValue({ connected: false }),
    createConnectUrl: jest
      .fn()
      .mockResolvedValue('https://accounts.google.com/auth'),
    handleCallback: jest.fn().mockResolvedValue({
      redirectUrl: 'https://leak.example/profile?sheets=connected',
      firstSyncUserId: 'user-1',
    }),
    runConnectSync: jest.fn().mockImplementation(() => {
      order.push('sync');
      return Promise.resolve();
    }),
    setEnabled: jest.fn().mockResolvedValue({ syncEnabled: true }),
    runNow: jest.fn().mockResolvedValue({ connected: true }),
    disconnect: jest.fn().mockResolvedValue({ disconnected: true }),
  };
  const res = {
    redirect: jest.fn().mockImplementation(() => {
      order.push('redirect');
    }),
  };
  const controller = new GoogleSheetsController(
    service as unknown as GoogleSheetsService,
  );
  return {
    controller,
    service,
    res: res as unknown as Response & typeof res,
    order,
  };
}

describe('GoogleSheetsController', () => {
  it('delegates status, toggle, run and disconnect with the signed-in user id', async () => {
    const { controller, service } = setup();

    await controller.getStatus(user);
    await controller.toggle(user, { enabled: true });
    await controller.run(user);
    await controller.disconnect(user);

    expect(service.getStatus).toHaveBeenCalledWith('user-1');
    expect(service.setEnabled).toHaveBeenCalledWith('user-1', true);
    expect(service.runNow).toHaveBeenCalledWith('user-1');
    expect(service.disconnect).toHaveBeenCalledWith('user-1');
  });

  it('returns the consent URL wrapped as { url }', async () => {
    const { controller } = setup();
    await expect(controller.connect(user)).resolves.toEqual({
      url: 'https://accounts.google.com/auth',
    });
  });

  it('redirects from the callback first and only then starts the first sync', async () => {
    const { controller, service, res, order } = setup();

    await controller.callback({ code: 'c', state: 's' }, res);

    expect(service.handleCallback).toHaveBeenCalledWith({
      code: 'c',
      state: 's',
    });
    expect(res.redirect).toHaveBeenCalledWith(
      'https://leak.example/profile?sheets=connected',
    );
    expect(service.runConnectSync).toHaveBeenCalledWith('user-1');
    expect(order).toEqual(['redirect', 'sync']);
  });

  it('does not start a sync when the callback failed', async () => {
    const { controller, service, res } = setup();
    service.handleCallback.mockResolvedValue({
      redirectUrl: 'https://leak.example/profile?sheets=error&reason=denied',
      firstSyncUserId: null,
    });

    await controller.callback({ error: 'access_denied' }, res);

    expect(res.redirect).toHaveBeenCalled();
    expect(service.runConnectSync).not.toHaveBeenCalled();
  });

  it('exposes only the callback without authentication', () => {
    const isPublic = (handler: object) =>
      Reflect.getMetadata(IS_PUBLIC_KEY, handler);
    const proto = GoogleSheetsController.prototype;

    expect(isPublic(proto.callback)).toBe(true);
    for (const handler of [
      proto.getStatus,
      proto.connect,
      proto.toggle,
      proto.run,
      proto.disconnect,
    ]) {
      expect(isPublic(handler)).toBeUndefined();
    }
  });
});
