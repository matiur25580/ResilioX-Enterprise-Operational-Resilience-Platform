import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.SHOWCASE_BASE_URL;
const email = process.env.SHOWCASE_EMAIL;
const password = process.env.SHOWCASE_PASSWORD;
const organization = process.env.SHOWCASE_TENANT;
if (!baseURL || !email || !password || !organization) {
  throw new Error('Set SHOWCASE_BASE_URL, SHOWCASE_EMAIL, SHOWCASE_PASSWORD and SHOWCASE_TENANT before capturing screenshots.');
}
const output = path.resolve('docs/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(15000);
async function shot(name, description, fullPage = true) {
  await page.screenshot({ path: path.join(output, name), fullPage });
  process.stdout.write(`Captured ${name} — ${description}\n`);
}
async function open(label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(700);
}
try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Organization workspace').fill(organization);
  await page.getByRole('button', { name: /sign in securely/i }).click();
  await page.getByText('Business service portfolio').waitFor();
  await page.waitForTimeout(1000);
  await shot('01-command-center.png', 'Executive resilience overview and portfolio KPIs');
  await page.getByLabel('Search services').fill('critical');
  await page.waitForTimeout(300);
  await shot('02-service-portfolio.png', 'Searchable service inventory and criticality overview');
  await page.getByLabel('Search services').fill('');
  await open('Impact analysis');
  await shot('03-business-impact-analysis.png', 'Recovery objectives and impact assessment workspace');
  await open('Dependencies');
  await shot('04-dependency-intelligence.png', 'Tenant dependency register and relationship assurance');
  await page.getByRole('button', { name: /add dependency|new relationship/i }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await shot('05-dependency-workflow.png', 'Relationship capture and verification workflow');
  await open('Risk & controls');
  await shot('06-risk-register.png', 'Inherent and residual operational risk posture');
  await page.getByRole('button', { name: /new risk/i }).click();
  await page.waitForTimeout(300);
  await shot('07-risk-identification.png', 'Risk intake with service and dependency mapping');
  await page.getByRole('button', { name: /close form/i }).first().click().catch(() => {});
  await page.getByRole('button', { name: /add control/i }).click();
  await page.waitForTimeout(300);
  await shot('08-control-assurance.png', 'Control library and evidence-backed testing');
  await open('Continuity plans');
  await shot('09-continuity-workspace.png', 'Continuity posture, approved plans and exercise schedule');
  await page.getByRole('button', { name: /create continuity plan/i }).click();
  await page.waitForTimeout(300);
  await shot('10-continuity-plan-builder.png', 'Plan authoring with activation, recovery and communication sections');
  await page.getByRole('button', { name: /close form/i }).first().click().catch(() => {});
  const approvedPlan = page.locator('.continuity-plan').filter({ has: page.getByText('APPROVED', { exact: true }) }).first();
  if (await approvedPlan.count()) {
    await approvedPlan.getByRole('button', { name: /schedule exercise/i }).click().catch(() => {});
    await page.waitForTimeout(300);
    await shot('11-exercise-management.png', 'Approved-plan exercise scheduling and scenario objectives');
    await page.locator('.continuity-plan').first().scrollIntoViewIfNeeded();
    await shot('12-remediation-tracker.png', 'Exercise findings, owners, due dates and remediation status');
  } else {
    await shot('11-exercise-management.png', 'Exercise scheduling workspace; add an approved demo plan to show populated state');
    await shot('12-remediation-tracker.png', 'Remediation tracker workspace; add a completed demo exercise to show populated actions');
  }
} finally {
  await browser.close();
}
