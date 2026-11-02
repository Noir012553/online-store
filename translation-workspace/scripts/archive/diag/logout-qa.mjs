export default async function run(page, ui) {
  const result = {};
  // Session is already on the admin page, logged in.
  await page.waitForTimeout(3000);
  result.startUrl = page.url();

  // Sidebar logout button may be offscreen (collapsed sidebar) — dispatch click on it via DOM
  result.afterLogoutUrl = await page.evaluate(async () => {
    const btn =
      document.querySelector('button[title="Đăng xuất"]') ||
      [...document.querySelectorAll("aside button")].find((b) =>
        /đăng xuất/i.test(b.textContent || ""),
      );
    if (!btn) return "NO_BUTTON";
    btn.click();
    // Wait up to 15s for the URL to become /login
    await new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (
          location.pathname.startsWith("/login") ||
          Date.now() - started > 15000
        )
          return resolve();
        setTimeout(tick, 300);
      };
      tick();
    });
    return location.href;
  });
  await page.waitForTimeout(4000);
  result.finalUrl = page.url();
  result.finalText = (await page.locator("body").innerText()).slice(0, 250);
  // Check leftover state
  result.sessionFlag = await page.evaluate(() =>
    sessionStorage.getItem("auth_session_active"),
  );
  result.cartLeft = await page.evaluate(() => localStorage.getItem("cart"));
  result.refreshBlock = await page.evaluate(() =>
    localStorage.getItem("laptopstore_refresh_blocked_until"),
  );
  return result;
}
