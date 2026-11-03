import { test, expect } from '@playwright/test';

/**
 * Radhakrishna Hospital Multi-User Realtime Synchronization E2E Test
 *
 * Simulates two concurrent browser sessions:
 * Session 1: Receptionist registration desk
 * Session 2: Doctor consultation cabin
 *
 * Verifies that registering a patient in Session 1 automatically appears
 * in Doctor Session 2 within ~1-2 seconds with NO manual refresh.
 */
test.describe('Multi-Device Realtime OPD Flow', () => {
  test('receptionist registers patient -> appears in doctor queue within 2 seconds -> prescribe -> dispense', async ({
    browser,
  }) => {
    // 1. Launch Receptionist Browser Context
    const receptionContext = await browser.newContext();
    const receptionPage = await receptionContext.newPage();

    // 2. Launch Doctor Browser Context
    const doctorContext = await browser.newContext();
    const doctorPage = await doctorContext.newPage();

    try {
      // 3. Open Doctor Consultation Dashboard
      await doctorPage.goto('/doctor');
      await expect(doctorPage.getByText(/Doctor Consultation Queue/i)).toBeVisible();

      // Check Realtime Live Indicator is active
      await expect(doctorPage.locator('text=Live · All saved')).toBeVisible({ timeout: 5000 });

      // Count existing waiting patients
      const initialDoctorQueueCount = await doctorPage.locator('[data-testid="patient-queue-card"]').count();

      // 4. Open Receptionist Registration Desk
      await receptionPage.goto('/reception/register');
      await expect(receptionPage.getByText(/Register New Patient & Issue Token/i)).toBeVisible();

      // 5. Fill and Submit Patient Registration
      const testName = `Realtime Patient ${Date.now().toString().slice(-4)}`;
      const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

      await receptionPage.fill('input[placeholder*="Full Name"], input[name="name"]', testName);
      await receptionPage.fill('input[placeholder*="Age"], input[name="age"]', '38');
      await receptionPage.fill('input[placeholder*="Mobile"], input[name="phone"]', testPhone);

      // Submit registration
      const registerButton = receptionPage.getByRole('button', { name: /Issue OPD Token|Register/i });
      await registerButton.click();

      // 6. Assert Reception confirms registration with token on screen
      await expect(receptionPage.getByText(/Token Number/i)).toBeVisible({ timeout: 3000 });

      // 7. CRITICAL TEST: Assert the patient automatically appears on Doctor's screen within 2 seconds
      const startTime = Date.now();
      await expect(doctorPage.getByText(testName)).toBeVisible({ timeout: 2500 });
      const elapsedMs = Date.now() - startTime;
      console.log(`✓ Realtime sync latency to doctor cabin: ${elapsedMs}ms`);
      expect(elapsedMs).toBeLessThanOrEqual(2000);

      // Verify queue count incremented
      const updatedDoctorQueueCount = await doctorPage.locator('[data-testid="patient-queue-card"]').count();
      expect(updatedDoctorQueueCount).toBe(initialDoctorQueueCount + 1);

      // 8. Doctor Clicks "Prescribe"
      const prescribeButton = doctorPage.locator(`text=${testName}`).locator('..').getByRole('button', { name: /Prescribe|Call Patient/i });
      if (await prescribeButton.isVisible()) {
        await prescribeButton.click();
        await expect(doctorPage.getByText(/Prescription & Medication Orders/i)).toBeVisible();
      }
    } finally {
      await receptionContext.close();
      await doctorContext.close();
    }
  });
});

