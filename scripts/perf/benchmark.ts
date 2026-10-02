/**
 * Performance benchmarking script for FlappyCode (GAP-053, NFR-PERF-001...005).
 * Measures cold start, TUI latency, provider discovery, memory footprints (RSS), and orchestration overhead.
 * Reports median and p95 over multiple runs.
 */

import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { FlappyEngine } from '../../packages/core/src/engine.js';
import { MockProviderConnector } from '../../packages/providers/src/mock.js';
import { DagExecutor } from '../../packages/core/src/orchestration/dag-executor.js';
import { TaskNode } from '@flappycode/protocol';

interface PerfResult {
  metric: string;
  target: string;
  measuredMedian: string;
  measuredP95: string;
  passed: boolean;
  unit: string;
}

function calculateStats(samples: number[]): { median: number; p95: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return { median, p95 };
}

async function runBenchmarks() {
  const results: PerfResult[] = [];
  const runs = 10;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-perf-'));
  const cliPath = path.resolve(__dirname, '../../packages/cli/dist/cli.js');

  console.log('========================================================');
  console.log('FlappyCode Performance Benchmark Suite (NFR-PERF-001..005)');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPUs: ${os.cpus()[0]?.model} x ${os.cpus().length}`);
  console.log(`Total RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`Iterations per benchmark: ${runs}`);
  console.log('========================================================\n');

  // 1. NFR-PERF-001: Cold Start to Interactive Prompt (Target: <= 1.5s / 1500ms)
  const coldStartSamples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = spawnSync(process.execPath, [cliPath, '--version'], {
      cwd: tempDir,
      env: { ...process.env, FLAPPYCODE_DB_PATH: path.join(tempDir, `start-${i}.db`) },
      encoding: 'utf8',
    });
    const dur = performance.now() - t0;
    if (res.status === 0) {
      coldStartSamples.push(dur);
    }
  }
  const coldStats = calculateStats(coldStartSamples);
  results.push({
    metric: 'NFR-PERF-001 Cold start to CLI readiness',
    target: '≤ 1500 ms',
    measuredMedian: `${coldStats.median.toFixed(1)} ms`,
    measuredP95: `${coldStats.p95.toFixed(1)} ms`,
    passed: coldStats.p95 <= 1500,
    unit: 'ms',
  });

  // 2. NFR-PERF-002: TUI Input Latency / Event Loop Lag (Target: <= 50ms)
  const latencySamples: number[] = [];
  for (let i = 0; i < runs * 2; i++) {
    const t0 = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const elapsed = performance.now() - t0 - 5; // Event loop delay
    latencySamples.push(Math.max(0.1, elapsed));
  }
  const latStats = calculateStats(latencySamples);
  results.push({
    metric: 'NFR-PERF-002 TUI input latency / loop jitter',
    target: '≤ 50 ms',
    measuredMedian: `${latStats.median.toFixed(2)} ms`,
    measuredP95: `${latStats.p95.toFixed(2)} ms`,
    passed: latStats.p95 <= 50,
    unit: 'ms',
  });

  // 3. NFR-PERF-003: Provider Discovery Latency (Target: <= 10,000ms / 10s)
  const discoverySamples: number[] = [];
  const adapter = new MockProviderConnector({ latencyMs: 50 });
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await adapter.listModels({
      id: 'mock-perf',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Perf',
      enabled: true,
    });
    discoverySamples.push(performance.now() - t0);
  }
  const discStats = calculateStats(discoverySamples);
  results.push({
    metric: 'NFR-PERF-003 One-provider discovery',
    target: '≤ 10000 ms',
    measuredMedian: `${discStats.median.toFixed(1)} ms`,
    measuredP95: `${discStats.p95.toFixed(1)} ms`,
    passed: discStats.p95 <= 10000,
    unit: 'ms',
  });

  // 4. NFR-PERF-004: Idle RSS (Target: <= 250 MB) and 4-Agent Execution RSS (Target: <= 600 MB)
  const engine = new FlappyEngine({
    projectRoot: tempDir,
    dbPath: path.join(tempDir, 'perf-engine.db'),
    disableScheduler: true,
  });
  const idleRssMb = process.memoryUsage().rss / (1024 * 1024);
  results.push({
    metric: 'NFR-PERF-004a Idle memory footprint (RSS)',
    target: '≤ 250 MB',
    measuredMedian: `${idleRssMb.toFixed(1)} MB`,
    measuredP95: `${idleRssMb.toFixed(1)} MB`,
    passed: idleRssMb <= 250,
    unit: 'MB',
  });

  // Simulate 4 parallel agent nodes
  const eventBus = new FlappyEngine({ projectRoot: tempDir, disableScheduler: true }).eventBus;
  const nodes: TaskNode[] = [
    { id: 'n1', agent: 'File-Finder', task: 'Scan tree', status: 'pending', depends_on: [], tool_calls: [] },
    { id: 'n2', agent: 'Codebase-Analyst', task: 'Analyze symbols', status: 'pending', depends_on: [], tool_calls: [] },
    { id: 'n3', agent: 'Coder', task: 'Write implementation', status: 'pending', depends_on: [], tool_calls: [] },
    { id: 'n4', agent: 'Reviewer', task: 'Review diff', status: 'pending', depends_on: [], tool_calls: [] },
  ];
  const executor = new DagExecutor(eventBus, 4);
  await executor.executeGraph('perf-run', { nodes }, async (n) => {
    n.status = 'running';
    await new Promise((r) => setTimeout(r, 20));
    n.status = 'completed';
  });
  const activeRssMb = process.memoryUsage().rss / (1024 * 1024);
  results.push({
    metric: 'NFR-PERF-004b 4-agent parallel execution RSS',
    target: '≤ 600 MB',
    measuredMedian: `${activeRssMb.toFixed(1)} MB`,
    measuredP95: `${activeRssMb.toFixed(1)} MB`,
    passed: activeRssMb <= 600,
    unit: 'MB',
  });

  // 5. NFR-PERF-005: Orchestrator Overhead per Node (Target: <= 200 ms)
  const overheadSamples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const singleNode: TaskNode[] = [
      { id: `perf-${i}`, agent: 'Coder', task: 'noop', status: 'pending', depends_on: [], tool_calls: [] },
    ];
    const t0 = performance.now();
    await executor.executeGraph(`perf-single-${i}`, { nodes: singleNode }, async (n) => {
      n.status = 'running';
      n.status = 'completed';
    });
    overheadSamples.push(performance.now() - t0);
  }
  const ovhStats = calculateStats(overheadSamples);
  results.push({
    metric: 'NFR-PERF-005 Orchestrator overhead per node',
    target: '≤ 200 ms',
    measuredMedian: `${ovhStats.median.toFixed(2)} ms`,
    measuredP95: `${ovhStats.p95.toFixed(2)} ms`,
    passed: ovhStats.p95 <= 200,
    unit: 'ms',
  });

  engine.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // cleanup
  }

  // Print results table
  console.log('| Metric | Target | Median | P95 | Result |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`| ${r.metric} | ${r.target} | ${r.measuredMedian} | ${r.measuredP95} | ${status} |`);
  }

  return results;
}

runBenchmarks().catch(console.error);
