#!/usr/bin/env tsx
/**
 * CLI runner for eval suites.
 *
 * Usage:
 *   pnpm --filter @nexuszero/eval test:eval
 *
 * Place eval suite definitions in packages/eval/suites/*.ts
 */

import { runMultipleSuites, formatSuiteReport, type EvalSuite } from './index.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const suitesDir = join(__dirname, '..', 'suites');

async function main() {
  let suiteFiles: string[];
  try {
    suiteFiles = (await readdir(suitesDir)).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  } catch {
    console.log('No suites found in packages/eval/suites/. Create .ts files exporting { suite, handler }.');
    process.exit(0);
  }

  const suites: EvalSuite[] = [];
  const handlers: Record<string, (input: any) => Promise<string>> = {};

  for (const file of suiteFiles) {
    try {
      const mod = await import(join(suitesDir, file));
      if (mod.suite) suites.push(mod.suite);
      if (mod.handler && mod.suite) {
        const key = `${mod.suite.agentType}:${mod.suite.taskType}`;
        handlers[key] = mod.handler;
      }
    } catch (e) {
      console.warn(`Failed to load suite ${file}:`, (e as Error).message);
    }
  }

  if (suites.length === 0) {
    console.log('No eval suites loaded.');
    process.exit(0);
  }

  console.log(`Running ${suites.length} eval suites...\n`);
  const results = await runMultipleSuites(suites, handlers);

  for (const r of results.results) {
    console.log(formatSuiteReport(r));
  }

  console.log(`\n═══ OVERALL ═══`);
  console.log(`Suites: ${results.totalSuites} | Passed: ${results.passedSuites} | Pass Rate: ${results.overallPassRate}%`);
  console.log(`Total Duration: ${results.durationMs}ms`);

  if (results.overallPassRate < 80) {
    console.error('\n❌ Eval pass rate below 80% threshold');
    process.exit(1);
  }

  console.log('\n✅ All eval suites pass threshold');
}

main().catch((e) => {
  console.error('Eval runner failed:', e);
  process.exit(1);
});
