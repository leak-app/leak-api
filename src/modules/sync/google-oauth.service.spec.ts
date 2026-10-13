import { JwtService } from '@nestjs/jwt';
import type { SyncConfig } from './sync.config';
import {
  ConnectFailedError,
  DRIVE_FILE_SCOPE,
  GoogleOAuthService,
  InvalidStateError,
} from './google-oauth.service';

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://leak.example/api/sync/google-sheets/callback',
  jwtSecret: 'login-jwt-secret',
} as unknown as SyncConfig;

function createService() {
  return new GoogleOAuthService(config, new JwtService({}));
}

function stateFromUrl(url: string): string {
  return new URL(url).searchParams.get('state');
}

describe('GoogleOAuthService.buildAuthUrl', () => {
  it('requests offline access, forced consent and exactly the three scopes', async () => {
    const url = new URL(await createService().buildAuthUrl('user-1'));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    // The OAuth client is shared with Google sign-in: never merge earlier grants into this one.
    expect(url.searchParams.get('include_granted_scopes')).toBe('false');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope').split(' ').sort()).toEqual(
      [DRIVE_FILE_SCOPE, 'email', 'openid'].sort(),
    );
  });
});

describe('GoogleOAuthService state', () => {
  it('round-trips the user id', async () => {
    const service = createService();
    const state = stateFromUrl(await service.buildAuthUrl('user-1'));
    await expect(service.verifyState(state)).resolves.toBe('user-1');
  });

  it('rejects a tampered state', async () => {
    const service = createService();
    const state = stateFromUrl(await service.buildAuthUrl('user-1'));
    await expect(
      service.verifyState(state.slice(0, -2) + 'xx'),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('rejects an expired state', async () => {
    const service = createService();
    const jwt = new JwtService({});
    const derived = (
      service as unknown as { _stateSecret(): string }
    )._stateSecret();
    const expired = await jwt.signAsync(
      { sub: 'user-1', purpose: 'sheets-connect' },
      { secret: derived, expiresIn: -10 },
    );
    await expect(service.verifyState(expired)).rejects.toBeInstanceOf(
      InvalidStateError,
    );
  });

  it('rejects a login-style token signed with JWT_SECRET', async () => {
    const loginToken = await new JwtService({}).signAsync(
      { sub: 'user-1', purpose: 'sheets-connect' },
      { secret: config.jwtSecret },
    );
    await expect(
      createService().verifyState(loginToken),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('rejects a state with the wrong purpose', async () => {
    const service = createService();
    const derived = (
      service as unknown as { _stateSecret(): string }
    )._stateSecret();
    const wrong = await new JwtService({}).signAsync(
      { sub: 'user-1', purpose: 'something-else' },
      { secret: derived },
    );
    await expect(service.verifyState(wrong)).rejects.toBeInstanceOf(
      InvalidStateError,
    );
  });

  it('produces a state that cannot be used as a login bearer token', async () => {
    const state = stateFromUrl(await createService().buildAuthUrl('user-1'));
    // JwtStrategy verifies with JWT_SECRET: the state must fail that check.
    await expect(
      new JwtService({}).verifyAsync(state, { secret: config.jwtSecret }),
    ).rejects.toThrow();
  });
});

describe('GoogleOAuthService.exchangeCode', () => {
  function withClient(client: {
    getToken: jest.Mock;
    verifyIdToken?: jest.Mock;
  }) {
    const service = createService();
    jest.spyOn(service, 'createClient').mockReturnValue(client as never);
    return service;
  }

  const goodTokens = {
    refresh_token: 'r-token',
    id_token: 'id-token',
    scope: `openid email ${DRIVE_FILE_SCOPE}`,
  };

  it('returns the refresh token and the Google account email', async () => {
    const service = withClient({
      getToken: jest.fn().mockResolvedValue({ tokens: goodTokens }),
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({ email: 'user@gmail.com' }),
      }),
    });
    await expect(service.exchangeCode('code')).resolves.toEqual({
      refreshToken: 'r-token',
      googleEmail: 'user@gmail.com',
    });
  });

  it('fails with reason "token" when Google rejects the code', async () => {
    const service = withClient({
      getToken: jest.fn().mockRejectedValue(new Error('invalid_grant')),
    });
    await expect(service.exchangeCode('code')).rejects.toMatchObject({
      reason: 'token',
    });
  });

  it('fails with reason "token" when no refresh token is returned', async () => {
    const service = withClient({
      getToken: jest.fn().mockResolvedValue({
        tokens: { ...goodTokens, refresh_token: undefined },
      }),
    });
    await expect(service.exchangeCode('code')).rejects.toBeInstanceOf(
      ConnectFailedError,
    );
  });

  it('fails with reason "scope" when the Drive permission was unticked', async () => {
    const service = withClient({
      getToken: jest.fn().mockResolvedValue({
        tokens: { ...goodTokens, scope: 'openid email' },
      }),
    });
    await expect(service.exchangeCode('code')).rejects.toMatchObject({
      reason: 'scope',
    });
  });

  it('fails with reason "token" when the ID token has no email', async () => {
    const service = withClient({
      getToken: jest.fn().mockResolvedValue({ tokens: goodTokens }),
      verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => ({}) }),
    });
    await expect(service.exchangeCode('code')).rejects.toMatchObject({
      reason: 'token',
    });
  });
});

describe('GoogleOAuthService.revoke', () => {
  it('revokes the refresh token at Google', async () => {
    const service = createService();
    const revokeToken = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(service, 'createClient')
      .mockReturnValue({ revokeToken } as never);

    await service.revoke('r-token');
    expect(revokeToken).toHaveBeenCalledWith('r-token');
  });
});
