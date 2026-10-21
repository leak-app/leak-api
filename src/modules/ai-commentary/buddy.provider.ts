import { ConfigService } from '@nestjs/config';
import { createGeminiClient } from '@/common/gemini/gemini.config';
import { BuddyGenerator } from './buddy.generator';

/**
 * The Buddy is off unless AI_BUDDY_ENABLED=true *and* the Gemini key and model are set,
 * so quick-log can run on Gemini without the Buddy ever sending a transaction note.
 */
export function createBuddyGenerator(config: ConfigService): BuddyGenerator {
  if (config.get<string>('AI_BUDDY_ENABLED')?.trim() !== 'true') {
    return new BuddyGenerator(null);
  }
  return new BuddyGenerator(createGeminiClient(config));
}
