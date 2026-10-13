import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type Credentials, OAuth2Client } from 'google-auth-library';
import { SyncConfig } from './sync.config';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SHEETS_SCOPES = [
  DRIVE_FILE_SCOPE,
  'openid',
  'email',
] as const;

const STATE_PURPOSE = 'sheets-connect';
const STATE_TTL_SECONDS = 600; // 10 minutes

export class InvalidStateError extends Error {
  constructor() {
    super('Invalid or expired state');
    this.name = 'InvalidStateError';
  }
}

export type ConnectFailureReason = 'token' | 'scope';

export class ConnectFailedError extends Error {
  constructor(readonly reason: ConnectFailureReason) {
    super(`Google connect failed: ${reason}`);
    this.name = 'ConnectFailedError';
  }
}

export interface GoogleGrant {
  refreshToken: string;
  googleEmail: string;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly _config: SyncConfig,
    private readonly _jwt: JwtService,
  ) {}

  createClient(): OAuth2Client {
    return new OAuth2Client(
      this._config.clientId,
      this._config.clientSecret,
      this._config.redirectUri,
    );
  }

  async buildAuthUrl(userId: string): Promise<string> {
    const state = await this._jwt.signAsync(
      { sub: userId, purpose: STATE_PURPOSE },
      { secret: this._stateSecret(), expiresIn: STATE_TTL_SECONDS },
    );
    return this.createClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      // The OAuth client is shared with Google sign-in: never merge earlier grants into this one.
      include_granted_scopes: false,
      scope: [...GOOGLE_SHEETS_SCOPES],
      state,
    });
  }

  /** Returns the user id the state was issued for, or throws InvalidStateError. */
  async verifyState(state: string): Promise<string> {
    try {
      const payload = await this._jwt.verifyAsync<{
        sub?: string;
        purpose?: string;
      }>(state, { secret: this._stateSecret() });
      if (payload.purpose !== STATE_PURPOSE || !payload.sub) {
        throw new Error('Wrong purpose');
      }
      return payload.sub;
    } catch {
      throw new InvalidStateError();
    }
  }

  async exchangeCode(code: string): Promise<GoogleGrant> {
    const client = this.createClient();

    let tokens: Credentials;
    try {
      ({ tokens } = await client.getToken(code));
    } catch {
      throw new ConnectFailedError('token');
    }

    if (!tokens.refresh_token || !tokens.id_token) {
      throw new ConnectFailedError('token');
    }
    if (!(tokens.scope ?? '').split(' ').includes(DRIVE_FILE_SCOPE)) {
      throw new ConnectFailedError('scope');
    }

    let email: string | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this._config.clientId,
      });
      email = ticket.getPayload()?.email;
    } catch {
      throw new ConnectFailedError('token');
    }
    if (!email) throw new ConnectFailedError('token');

    return { refreshToken: tokens.refresh_token, googleEmail: email };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.createClient().revokeToken(refreshToken);
  }

  /**
   * The state travels in URLs, and JwtStrategy accepts any token signed with JWT_SECRET, so
   * signing the state with JWT_SECRET itself would turn a leaked state into a login token.
   */
  private _stateSecret(): string {
    return createHmac('sha256', this._config.jwtSecret)
      .update('leak:sheets-connect-state')
      .digest('hex');
  }
}
