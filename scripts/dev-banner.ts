import { renderBanner } from '../packages/tui/src/banner/index.js';

console.log('\n======================================================');
console.log('FLAPPYCODE BANNER PREVIEW (Task P1-G2)');
console.log('======================================================\n');

console.log('--- Tier 1: Full Banner (Width >= 100, here 120 cols) ---');
console.log(renderBanner({ width: 120, height: 30, colorMode: 'truecolor' }));

console.log('\n--- Tier 2: Wordmark Banner (70 <= Width < 100, here 85 cols) ---');
console.log(renderBanner({ width: 85, height: 30, colorMode: 'truecolor' }));

console.log('\n--- Tier 3: Compact Banner (45 <= Width < 70, here 55 cols) ---');
console.log(renderBanner({ width: 55, height: 30, colorMode: 'truecolor' }));

console.log('\n--- Tier 4: Minimal / Small Terminal (Width < 45, here 38 cols) ---');
console.log(renderBanner({ width: 38, height: 10, colorMode: 'truecolor' }));

console.log('\n--- Color Mode: ASCII Fallback (Width 110 cols) ---');
console.log(renderBanner({ width: 110, height: 30, colorMode: 'ascii' }));

console.log('\n--- Color Mode: ANSI 16 Fallback (Width 80 cols) ---');
console.log(renderBanner({ width: 80, height: 30, colorMode: 'ansi16' }));

console.log('\n✅ Banner rendering preview complete!\n');
