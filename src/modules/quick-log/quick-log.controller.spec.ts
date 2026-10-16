import { type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { QuickLogController } from './quick-log.controller';
import { QuickLogService } from './quick-log.service';

describe('POST /transactions/parse', () => {
  let app: INestApplication;
  const parse = jest.fn().mockResolvedValue({ amount: 55_000 });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [QuickLogController],
      providers: [{ provide: QuickLogService, useValue: { parse } }],
    }).compile();
    app = moduleRef.createNestApplication();
    // The real app gets the user from JwtAuthGuard; stand in for it here.
    app.use(
      (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
        req.user = { id: 'user-1' };
        next();
      },
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('passes the trimmed text and the user id to the service', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/transactions/parse')
      .send({ text: '  55k phở bò  ' })
      .expect(201);

    expect(res.body).toEqual({ amount: 55_000 });
    expect(parse).toHaveBeenCalledWith('user-1', { text: '55k phở bò' });
  });

  it.each([
    [{ text: '' }, 'Vui lòng nhập nội dung giao dịch'],
    [{ text: '   ' }, 'Vui lòng nhập nội dung giao dịch'],
    [{ text: 'x'.repeat(201) }, 'Nội dung giao dịch quá dài'],
    [{}, undefined],
  ])('rejects %j with 400 and never reaches the service', async (body, msg) => {
    parse.mockClear();
    const res = await request(app.getHttpServer() as Server)
      .post('/transactions/parse')
      .send(body)
      .expect(400);

    if (msg) expect(JSON.stringify(res.body)).toContain(msg);
    expect(parse).not.toHaveBeenCalled();
  });
});
