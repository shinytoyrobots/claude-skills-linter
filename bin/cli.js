#!/usr/bin/env node
import { basename } from 'node:path';

// Deprecation notice when invoked as the old binary name
const binName = basename(process.argv[1] || '');
if (binName === 'skill-lint') {
  process.stderr.write('Note: skill-lint is deprecated. Use claude-skill-lint instead.\n');
}

import '../dist/cli.js';
