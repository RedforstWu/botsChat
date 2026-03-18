#!/usr/bin/env node
/**
 * E2E test: CLI browser login flow via CDP
 *
 * Flow: CLI starts HTTP server → browser opens http://127.0.0.1:PORT/start →
 * redirects to BotsChat HTTPS → user logs in → browser redirects back to
 * http://127.0.0.1:PORT/callback → CLI saves credentials → success page.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CONFIG_PATH = join(homedir(), ".botschat", "config.json");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TEMP_PROFILE = join(homedir(), ".botschat", "chrome-test-profile");

if (existsSync(CONFIG_PATH)) rmSync(CONFIG_PATH);
if (existsSync(TEMP_PROFILE)) rmSync(TEMP_PROFILE, { recursive: true, force: true });

let pass = 0, fail = 0;
function ok(msg) { pass++; console.log(`  PASS  ${msg}`); }
function ng(msg) { fail++; console.log(`  FAIL  ${msg}`); }

console.log("=== CLI Browser Login E2E Test ===\n");

// Step 1: Start CLI login
console.log("[1] Starting CLI login...");
const cli = spawn("node", ["packages/cli/dist/index.js", "login", "--no-open"], {
  stdio: ["pipe", "pipe", "pipe"],
});
let cliOutput = "";
cli.stdout.on("data", (d) => { cliOutput += d.toString(); });
cli.stderr.on("data", (d) => { cliOutput += d.toString(); });

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (cliOutput.includes("127.0.0.1")) { clearInterval(check); resolve(); }
  }, 200);
  setTimeout(() => { clearInterval(check); resolve(); }, 10000);
});

// Parse the start URL (http://127.0.0.1:PORT/start)
const startMatch = cliOutput.match(/(http:\/\/127\.0\.0\.1:\d+\/start)/);
if (!startMatch) {
  ng("Could not parse start URL");
  console.log("CLI output:", cliOutput);
  cli.kill();
  process.exit(1);
}
const startUrl = startMatch[1];
ok(`CLI server started: ${startUrl}`);

// Step 2: Launch Chrome
console.log("\n[2] Launching Chrome...");
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-first-run", "--no-default-browser-check", `--user-data-dir=${TEMP_PROFILE}`],
});
const page = await browser.newPage();
const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

// Step 3: Open the local start URL (HTTP → redirects to HTTPS login)
console.log("\n[3] Opening local start URL...");
await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 20000 });
await new Promise((r) => setTimeout(r, 2000));

const currentUrl = page.url();
let bodyText = await page.evaluate(() => document.body.innerText);
console.log(`   Landed at: ${currentUrl.slice(0, 80)}`);

if (currentUrl.includes("console.botschat.app")) {
  ok("Redirected to BotsChat login page");
} else {
  ng(`Expected BotsChat URL, got: ${currentUrl}`);
}

if (bodyText.includes("Sign in") || bodyText.includes("Continue with")) {
  ok("Login page rendered");
} else {
  ng(`Unexpected page content: ${bodyText.slice(0, 100)}`);
}

// Step 4: Click "Try Demo"
console.log("\n[4] Logging in via Demo...");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button"))
    .find((b) => b.textContent?.includes("Try Demo"));
  if (btn) btn.click();
});

console.log("   Waiting for login + redirect back to CLI...");
let flowComplete = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));

  // Handle consent modal
  bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes("Continue") && bodyText.includes("Data") && bodyText.includes("review")) {
    console.log("   Consent modal detected, clicking Continue...");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => b.textContent?.trim() === "Continue");
      if (btn) btn.click();
    });
    continue;
  }

  if (cliOutput.includes("Logged in as")) {
    flowComplete = true;
    break;
  }
}

if (flowComplete) {
  ok("Login flow completed");
} else {
  ng("Login flow timed out");
  console.log(`   CLI output: ${cliOutput}`);
}

await new Promise((r) => setTimeout(r, 2000));

// Step 5: Check results
console.log("\n[5] Results:");

const loginLine = cliOutput.split("\n").find((l) => l.includes("Logged in"));
if (loginLine) ok(`CLI: ${loginLine.trim()}`);
else ng(`CLI missing login message`);

if (existsSync(CONFIG_PATH)) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  if (config.token && config.userId) {
    ok(`Config: userId=${config.userId}`);
  } else ng("Config missing token/userId");
} else ng("No config file");

// Check browser final state
const finalUrl = page.url();
bodyText = await page.evaluate(() => document.body.innerText);
if (bodyText.includes("CLI Login Successful") || bodyText.includes("close this tab")) {
  ok("Browser shows success page");
} else if (finalUrl.includes("127.0.0.1")) {
  ok(`Browser on callback page: ${finalUrl.slice(0, 60)}`);
} else {
  console.log(`   Final URL: ${finalUrl}`);
  console.log(`   Body: ${bodyText.slice(0, 150)}`);
  ng("Unexpected browser state");
}

await page.screenshot({ path: "/tmp/cli-login-test.png", fullPage: true });

// Summary
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log("=== ALL TESTS PASSED ===");
else {
  console.log("=== SOME TESTS FAILED ===");
  console.log("\n--- Browser console (errors only) ---");
  for (const log of consoleLogs) {
    if (log.includes("error") || log.includes("ERROR") || log.includes("FAIL") || log.includes("PAGE_ERROR")) {
      console.log(`  ${log}`);
    }
  }
}

await browser.close();
cli.kill();
if (existsSync(TEMP_PROFILE)) rmSync(TEMP_PROFILE, { recursive: true, force: true });
process.exit(fail > 0 ? 1 : 0);
