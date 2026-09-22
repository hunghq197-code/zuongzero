import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const configPath = join(process.cwd(), 'wrangler.cloudflare.jsonc');
const parsed = ts.parseConfigFileTextToJson(
  configPath,
  readFileSync(configPath, 'utf8'),
);
assert.equal(parsed.error, undefined);
const config = parsed.config;

test('staging cannot use production storage or scheduled email', () => {
  const staging = config.env.staging;

  assert.equal(staging.name, 'royalty-dashboard-staging');
  assert.equal(staging.vars.AUTH_PROVIDER, 'app-session');
  assert.equal(staging.vars.DEPLOYMENT_ENV, 'staging');
  assert.equal(staging.workers_dev, true);
  assert.deepEqual(staging.triggers.crons, []);
  assert.equal(staging.d1_databases.length, 1);
  assert.equal(staging.r2_buckets.length, 1);
  assert.equal(staging.d1_databases[0].binding, 'DB');
  assert.equal(staging.r2_buckets[0].binding, 'FILES');
  assert.notEqual(
    staging.d1_databases[0].database_id,
    config.d1_databases[0].database_id,
  );
  assert.notEqual(
    staging.r2_buckets[0].bucket_name,
    config.r2_buckets[0].bucket_name,
  );
  assert.ok(staging.vars.APP_BASE_URL.includes('staging'));
  assert.equal(staging.vars.RESEND_API_KEY, undefined);
  assert.equal(staging.vars.SUPER_ADMIN_PASSWORD, undefined);
});
