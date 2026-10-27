// Clears runtime state (app state + FIS posting overlay). The static DB is untouched.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

rmSync(fileURLToPath(new URL('../data/runtime/', import.meta.url)), { recursive: true, force: true });
console.log('Runtime state cleared. The next server start begins from the static DB.');
