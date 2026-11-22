import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
const webBase = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:4173';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const credentials = {
  email: `browser-${suffix}@example.test`,
  password: 'Browser-test-password-2026!',
  displayName: 'Browser Workflow Owner',
  organizationName: `Browser Workflow ${suffix}`,
  organizationSlug: `browser-workflow-${suffix}`,
};
const supplierName = `Browser Verified Supplier ${suffix}`;
const contractReference = `BROWSER-CONTRACT-${suffix}`;
const assessmentRationale = 'Browser workflow test assessment with recorded evidence for review.';

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/health/ready`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('API readiness check did not succeed within 40 seconds.');
}

await waitForApi();
const registration = await fetch(`${apiBase}/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(credentials),
});
if (registration.status !== 201) {
  throw new Error(`Test tenant registration failed (${registration.status}): ${await registration.text()}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  await page.goto(webBase, { waitUntil: 'networkidle' });
  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByLabel('Organization workspace').fill(credentials.organizationSlug);
  await page.getByRole('button', { name: /Sign in securely/ }).click();
  await page.getByRole('button', { name: 'Suppliers' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Suppliers' }).click();
  await page.getByRole('heading', { name: 'Supplier resilience & assurance' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });

  const unnamedControls = await page.locator('.supplier-page input:not([type="hidden"]), .supplier-page select, .supplier-page textarea').evaluateAll(elements =>
    elements.filter(element => !element.labels?.length && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby'))
      .map(element => element.outerHTML),
  );
  assert.deepEqual(unnamedControls, [], 'Every supplier form control must have an accessible label.');

  const addSupplier = page.getByRole('button', { name: /Add supplier/ });
  await addSupplier.click();
  assert.equal(await addSupplier.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#supplier-register-form').count(), 1);
  await addSupplier.focus();
  await page.keyboard.press('Tab');
  const nextFocusLabel = await page.evaluate(() => document.activeElement?.closest('label')?.textContent?.trim());
  assert.match(nextFocusLabel ?? '', /Supplier name/, 'Keyboard focus should enter the expanded supplier form in DOM order.');
  const focusOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(focusOutline, 'solid', 'Keyboard focus must have a visible outline.');

  await page.getByLabel('Supplier name').fill(supplierName);
  await page.getByLabel('Website').fill('https://supplier.example.test');
  await page.getByLabel('Contact email').fill(credentials.email);
  await page.getByRole('button', { name: 'Save supplier' }).click();
  await page.getByRole('heading', { name: supplierName }).waitFor();

  const contractToggle = page.getByRole('button', { name: 'Contract' });
  await contractToggle.click();
  assert.equal(await contractToggle.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('#' + await contractToggle.getAttribute('aria-controls')).count());

  await page.getByLabel('Contract reference').fill(contractReference);
  await page.getByLabel('Contract owner').fill('Browser test owner');
  await page.getByLabel('Contractual RTO (hours)').fill('4');
  await page.getByLabel('Contractual RPO (minutes)').fill('30');
  await page.getByRole('button', { name: 'Save contract' }).click();
  await page.getByText(contractReference).waitFor();

  const assessmentToggle = page.getByRole('button', { name: 'Assess' });
  await assessmentToggle.click();
  assert.equal(await assessmentToggle.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('#' + await assessmentToggle.getAttribute('aria-controls')).count());

  await page.getByLabel('Assessment owner').fill('Browser test reviewer');
  await page.getByLabel('Assessment rationale').fill(assessmentRationale);
  await page.getByRole('button', { name: 'Save assessment draft' }).click();
  await page.getByText(assessmentRationale).waitFor();

  const evidenceToggle = page.getByRole('button', { name: 'Evidence' });
  await evidenceToggle.click();
  assert.equal(await evidenceToggle.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('#' + await evidenceToggle.getAttribute('aria-controls')).count());

  await page.getByLabel('Title').fill('Independent resilience review');
  await page.getByLabel('Reference / URI').fill('https://evidence.example.test/review.pdf');
  await page.getByRole('button', { name: 'Record evidence' }).click();
  await page.getByText('Independent resilience review').waitFor();

  await page.getByRole('button', { name: 'Submit review' }).click();
  await page.getByText('IN_REVIEW').waitFor();
  const supplierOverflow = await page.locator('.supplier-page').evaluate(element => element.scrollWidth > element.clientWidth);
  assert.equal(supplierOverflow, false, 'Supplier workspace should not overflow horizontally at a 390px viewport.');
  const reducedMotionDuration = await page.locator('.supplier-page button').first().evaluate(element => getComputedStyle(element).transitionDuration);
  assert.ok(Number.parseFloat(reducedMotionDuration) <= 0.00001, 'Reduced-motion preference should minimize supplier transitions.');
  if (pageErrors.length) throw new Error(`Browser runtime errors: ${pageErrors.join('; ')}`);
  console.log('Browser supplier workflow passed: login, supplier registration, contract, assessment, evidence and review submission.');
} catch (error) {
  await page.screenshot({ path: '/tmp/resiliox-supplier-workflow-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
