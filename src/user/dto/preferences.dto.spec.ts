import { updatePreferencesSchema } from './preferences.dto';

describe('updatePreferencesSchema', () => {
  it.each(['SAVAGE', 'GENTLE', 'MUTE'])('accepts %s', (buddyMode) =>
    expect(updatePreferencesSchema.safeParse({ buddyMode }).success).toBe(true),
  );

  it.each([{}, { buddyMode: 'LOUD' }, { buddyMode: 'MUTE', extra: 1 }])(
    'rejects %j',
    (body) =>
      expect(updatePreferencesSchema.safeParse(body).success).toBe(false),
  );
});
