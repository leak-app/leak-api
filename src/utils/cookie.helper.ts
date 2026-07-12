import type { Response } from 'express';

export function setCookie(
  res: Response,
  data: { [key: string]: string },
  maxAge: number = 30 * 24 * 60 * 60 * 1000 /** Default 30 days */,
) {
  for (const key in data) {
    res.cookie(key, data[key], {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge,
    });
  }
}

export function clearCookie(res: Response, key: string) {
  res.clearCookie(key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}
