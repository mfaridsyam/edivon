import { existsSync, readdirSync } from 'node:fs';
import { FIXTURE_DIR, generateFixtures } from './fixtures';

/** Membuat video contoh sekali saja; berkasnya tidak disimpan di repo. */
export default async function globalSetup() {
  const ready = existsSync(FIXTURE_DIR) && readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('contoh-')).length >= 2;
  if (!ready) await generateFixtures();
}
