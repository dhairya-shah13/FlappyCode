#!/usr/bin/env node

if (process.env.FLAPPYCODE_ALLOW_PUBLISH !== '1') {
  console.error('\n[BLOCKED] Direct npm publish is disabled during Phase 1 development.');
  console.error('The package owner will claim the npm name flappycode post-Phase 1.');
  console.error('To override for local packaging tests, set FLAPPYCODE_ALLOW_PUBLISH=1.\n');
  process.exit(1);
}
