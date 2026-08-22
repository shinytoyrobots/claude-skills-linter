#!/usr/bin/env node
/**
 * Flow eval runner — spec+eval mode conformance suite.
 *
 * Runs the linter build against fixture skills and checks each dataset task's
 * `expect` assertions. Deterministic; no LLM. This is the executable form of the
 * graded conformance suite described in evals/harness.yaml.
 *
 * Usage:  node evals/run.mjs [dimension ...]   (default: correctness)
 *
 * Task schema (one JSON object per JSONL line):
 *   { id, cmd: "lint"|"graph", level?: 0..3, mode?: "portable",
 *     fixture: "<slug under evals/fixtures>", expect: {
 *       errors?: [],                         // [] asserts no error-severity findings
 *       must_contain?: [{rule, severity?}],  // each must be present
 *       must_not_contain_rule?: ["rule", …]  // none may be present
 *     } }
 *
 * Exit code: 0 if every task in every requested dimension passes, else 1.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CLI = join(REPO, 'bin', 'cli.js');
const FIXTURES = join(HERE, 'fixtures');

const DIM_DATASETS = {
  correctness: ['correctness-real-v1.jsonl', 'correctness-adv-v1.jsonl'],
  'cross-boundary': ['cross-boundary-real-v1.jsonl'],
};

function runLinter(task) {
  const fixtureDir = join(FIXTURES, task.fixture);
  const args = [CLI, task.cmd, fixtureDir, '--format', 'json'];
  if (task.level !== undefined) args.push('--level', String(task.level));
  if (task.mode === 'portable') args.push('--portable');
  const r = spawnSync('node', args, { encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
  let findings = null;
  try {
    findings = JSON.parse(r.stdout || '[]');
  } catch {
    findings = null; // non-JSON stdout (e.g. unknown flag) → treated as runner error below
  }
  return { findings, exitCode: r.status, stderr: r.stderr };
}

function evaluate(task, run) {
  const reasons = [];
  if (run.findings === null) {
    reasons.push(`CLI produced no parseable JSON (exit ${run.exitCode})` +
      (run.stderr ? `: ${run.stderr.trim().split('\n')[0]}` : ''));
    return { pass: false, reasons };
  }
  const findings = run.findings;
  const has = (rule, sev) => findings.some((f) => f.rule === rule && (sev === undefined || f.severity === sev));
  const e = task.expect || {};
  if (Array.isArray(e.errors) && e.errors.length === 0) {
    const errs = findings.filter((f) => f.severity === 'error');
    if (errs.length) reasons.push(`expected no errors, got: ${errs.map((f) => f.rule).join(', ')}`);
  }
  for (const m of e.must_contain || []) {
    if (!has(m.rule, m.severity)) reasons.push(`missing expected finding: ${m.rule}${m.severity ? '/' + m.severity : ''}`);
  }
  for (const rule of e.must_not_contain_rule || []) {
    if (has(rule)) reasons.push(`unexpected finding present: ${rule}`);
  }
  return { pass: reasons.length === 0, reasons };
}

function loadTasks(file) {
  const p = join(HERE, 'datasets', file);
  return readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const dims = process.argv.slice(2).length ? process.argv.slice(2) : ['correctness', 'cross-boundary'];
let total = 0, passed = 0;
const failures = [];

for (const dim of dims) {
  const files = DIM_DATASETS[dim];
  if (!files) { console.error(`unknown dimension: ${dim}`); process.exit(2); }
  console.log(`\n### ${dim}`);
  for (const file of files) {
    for (const task of loadTasks(file)) {
      total++;
      const run = runLinter(task);
      const res = evaluate(task, run);
      if (res.pass) { passed++; console.log(`  PASS  ${file}#${task.id} (${task.sr || task.guards || ''})`); }
      else { failures.push({ file, task, res }); console.log(`  FAIL  ${file}#${task.id} (${task.sr || task.guards || ''}) — ${res.reasons.join('; ')}`); }
    }
  }
}

console.log(`\n${passed}/${total} tasks pass`);
if (failures.length) {
  console.log(`\n${failures.length} failing (RED — pending implementation or genuine gap):`);
  for (const f of failures) console.log(`  - ${f.file}#${f.task.id}: ${f.res.reasons.join('; ')}`);
}
process.exit(failures.length ? 1 : 0);
