import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const matrix = JSON.parse(await readFile('docs/security/asvs-5.0.0-l2.json', 'utf8'));
assert.equal(matrix.version, '5.0.0');
assert.equal(matrix.target_level, 2);
const ids = new Set<string>(),
  counts: Record<string, number> = {};
for (const row of matrix.requirements) {
  assert.match(row.id, /^V\d+\.\d+\.\d+$/);
  assert.ok(!ids.has(row.id));
  ids.add(row.id);
  assert.ok(
    [
      'pending',
      'implemented_unverified',
      'verified_local',
      'pending_activation',
      'verified_production',
      'not_applicable',
      'blocked',
    ].includes(row.status),
  );
  assert.ok([1, 2].includes(row.level));
  if (row.status === 'not_applicable') assert.ok(row.rationale.length > 20);
  if (row.status.startsWith('verified')) {
    assert.ok(row.control.length);
    assert.ok(row.evidence.length);
  }
  counts[row.status] = (counts[row.status] || 0) + 1;
}
console.log(
  JSON.stringify(
    { standard: matrix.standard, version: matrix.version, requirements: ids.size, counts },
    null,
    2,
  ),
);
if (process.argv.includes('--strict'))
  assert.ok(
    matrix.requirements.every((r: any) =>
      ['verified_local', 'verified_production', 'not_applicable'].includes(r.status),
    ),
    'L2 verification is incomplete; unresolved requirements are a release gate.',
  );
