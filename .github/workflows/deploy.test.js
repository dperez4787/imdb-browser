// IMDB-12 acceptance guard for .github/workflows/deploy.yml (tester-authored).
//
// The workflow only executes on push to main, so its invariants can't be
// covered by the app test suites. This file pins the statically-checkable
// acceptance criteria and provisioning literals so a later edit that breaks
// one fails loudly. Dependency-free by design (no YAML parser): run it with
//
//   node --test .github/workflows/deploy.test.js
//
// GitHub Actions ignores non-YAML files in .github/workflows/, so this file
// is never parsed as a workflow.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const yml = readFileSync(join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');

// Provisioning literals from docs/architecture.md § "GCP provisioning for this
// repo" (executed and verified 2026-07-11).
const PROJECT = 'project-d60a83c1-2c60-4d51-ad0';
const REGION = 'us-central1';
const SITE = 'dfp-imdb-browser';

test('triggers only on push to main', () => {
  assert.match(yml, /on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
  assert.doesNotMatch(yml, /pull_request|workflow_dispatch|schedule:/);
});

test('every job carries per-job id-token: write (OIDC/WIF, no inherited perms)', () => {
  const jobsSection = yml.slice(yml.indexOf('\njobs:'));
  const jobCount = (jobsSection.match(/^ {2}\w[\w-]*:\s*$/gm) ?? []).length;
  const idTokenCount = (jobsSection.match(/^ {6}id-token: write$/gm) ?? []).length;
  assert.equal(jobCount, 2, 'expected exactly the chat and frontend jobs');
  assert.equal(idTokenCount, jobCount, 'each job must declare id-token: write itself');
});

test('auth is WIF via repo secrets — no service-account key JSON anywhere', () => {
  assert.match(yml, /workload_identity_provider: \$\{\{ secrets\.WIF_PROVIDER \}\}/);
  assert.match(yml, /service_account: \$\{\{ secrets\.DEPLOY_SA \}\}/);
  assert.doesNotMatch(yml, /credentials_json|GOOGLE_CREDENTIALS|\.json.*key|BEGIN PRIVATE KEY/i);
});

test('image is the provisioned AR path tagged by commit SHA, never latest', () => {
  assert.match(
    yml,
    new RegExp(
      `IMAGE: ${REGION}-docker\\.pkg\\.dev/${PROJECT}/imdb-browser/chat:\\$\\{\\{ github\\.sha \\}\\}`,
    ),
  );
  // The only ":latest" allowed is the Secret Manager version alias; an image
  // tag ":latest" (on the AR path) must never appear.
  const imageLatest = yml.match(/docker\.pkg\.dev\/[^\s"']*:latest/g) ?? [];
  assert.deepEqual(imageLatest, [], 'image must never be tagged latest');
});

test('Cloud Run deploy matches provisioning: service, region, runtime SA, secret', () => {
  assert.match(yml, /SERVICE: imdb-browser-chat$/m);
  assert.match(yml, new RegExp(`RUNTIME_SA: imdb-browser-run@${PROJECT}\\.iam\\.gserviceaccount\\.com`));
  assert.match(yml, /--set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest/);
  assert.doesNotMatch(yml, /sk-ant-/, 'no literal Anthropic key material');
});

test('--allow-unauthenticated is present and justified in a comment', () => {
  assert.match(yml, /--allow-unauthenticated/);
  assert.match(yml, /# .*--allow-unauthenticated.*(explicit|by design)/);
});

test('firebase-tools is pinned to an exact version and used for the deploy', () => {
  const pin = yml.match(/FIREBASE_TOOLS_VERSION: (\S+)/);
  assert.ok(pin, 'FIREBASE_TOOLS_VERSION env var must exist');
  assert.match(pin[1], /^\d+\.\d+\.\d+$/, `"${pin[1]}" must be an exact semver, no range/tag`);
  assert.match(yml, /npm install -g firebase-tools@"\$FIREBASE_TOOLS_VERSION"/);
});

test('firebase deploy runs from the repo root against only the named hosting target', () => {
  const deployStep = yml.slice(yml.indexOf('- name: Deploy to Firebase Hosting'));
  assert.match(deployStep, new RegExp(`firebase deploy --only hosting:${SITE} --project "\\$PROJECT_ID"`));
  assert.doesNotMatch(deployStep, /working-directory/, 'must run where firebase.json lives');
  assert.doesNotMatch(yml, /--only hosting\s*$/m, 'a bare hosting deploy would touch the default (linear-example) site');
});

test('chat URL handoff: describe → fail-fast on empty → step output → Vite build env', () => {
  assert.match(yml, /needs: chat/, 'frontend must wait for the service to exist');
  assert.match(yml, /id: chat-url/);
  assert.match(yml, /gcloud run services describe "\$CHAT_SERVICE"[\s\S]{0,120}--format 'value\(status\.url\)'/);
  assert.match(yml, /test -n "\$CHAT_URL" \|\| \{ echo "empty chat service URL"; exit 1; \}/);
  assert.match(yml, /echo "url=\$CHAT_URL" >> "\$GITHUB_OUTPUT"/);
  assert.match(yml, /VITE_CHAT_URL: \$\{\{ steps\.chat-url\.outputs\.url \}\}/);
});

test('firebase.json and .firebaserc agree on the named target → provisioned site', () => {
  const firebaseJson = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8'));
  const firebaserc = JSON.parse(readFileSync(join(repoRoot, '.firebaserc'), 'utf8'));
  assert.equal(firebaseJson.hosting.target, SITE);
  assert.equal(firebaseJson.hosting.public, 'app/frontend/dist');
  assert.equal(firebaserc.projects.default, PROJECT);
  assert.deepEqual(firebaserc.targets[PROJECT].hosting[SITE], [SITE]);
});
