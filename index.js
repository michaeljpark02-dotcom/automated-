const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { randomInt } = require("crypto");
const { execFileSync } = require("child_process");
const { compliments, getComplimentPoolForVisit, getVisitTone } = require("./compliments");

const screenshotFolder = path.join(__dirname, "screenshots");
if (!fs.existsSync(screenshotFolder)) fs.mkdirSync(screenshotFolder);
let lastScreenshotAt = 0;
const usedComplimentsPath = path.join(__dirname, "used-compliments.json");
const lastTonePath = path.join(__dirname, "last-compliment-tone.json");
const recentComplimentsPath = path.join(__dirname, "recent-compliments.json");
const recentTopicsPath = path.join(__dirname, "recent-compliment-topics.json");
const recentItemsPath = path.join(__dirname, "recent-compliment-items.json");
const recentOpenersPath = path.join(__dirname, "recent-compliment-openers.json");
const recentOpenerTypesPath = path.join(__dirname, "recent-compliment-opener-types.json");
const recentLengthBandsPath = path.join(__dirname, "recent-compliment-length-bands.json");
const recentConnectorsPath = path.join(__dirname, "recent-compliment-connectors.json");
const lastSynonymPath = path.join(__dirname, "last-compliment-synonym.json");
const recentTemplateFamiliesPath = path.join(__dirname, "recent-compliment-template-families.json");
const selectorHealthPath = path.join(__dirname, \"selector-health.jsonl\");
const runSummaryDir = path.join(__dirname, \"run-summaries\");
let usedComplimentsCache = null;
let lastToneCache = null;
let recentComplimentsCache = null;
let recentTopicsCache = null;
let recentItemsCache = null;
let recentOpenersCache = null;
let recentOpenerTypesCache = null;
let recentLengthBandsCache = null;
let recentConnectorsCache = null;
let lastSynonymCache = null;
let recentTemplateFamiliesCache = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout(task, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return task;
  let timer = null;
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([Promise.resolve(task), timeoutPromise]);
  if (timer) clearTimeout(timer);
  if (result && result.timedOut) {
    console.log(`WARN ${label} timed out after ${timeoutMs}ms; continuing.`);
  }
  return result;
}

function readEnvInt(name, fallback = 0) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const num = parseInt(String(raw).trim(), 10);
  return Number.isNaN(num) ? fallback : num;
}

function readEnvFloat(name) {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const num = parseFloat(String(raw).trim());
  return Number.isNaN(num) ? null : num;
}

function readEnvBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

const SURVEY_URL = process.env.SURVEY_URL ||
  "https://us-restaurant.momos.io/popeyes-8c7ih/popeyes-survey/c8931c44-bce5-40ee-9d5a-6725c5557c08";
const STORE_ID = process.env.STORE_ID || "14276";
const HEADLESS = readEnvBool("HEADLESS", false);
const USER_AGENT = process.env.USER_AGENT;
const PROXY = process.env.PROXY;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;
const PROXY_BYPASS = process.env.PROXY_BYPASS;
const VPN_SAFE = readEnvBool("VPN_SAFE", true);
const NORDVPN_AUTO = readEnvBool("NORDVPN_AUTO", false);
const NORDVPN_PATH = process.env.NORDVPN_PATH ||
  "C:\\Program Files\\NordVPN\\nordvpn.exe";
const NORDVPN_SERVER_NAME = process.env.NORDVPN_SERVER_NAME;
const NORDVPN_GROUP = process.env.NORDVPN_GROUP;
const NORDVPN_COUNTRY = process.env.NORDVPN_COUNTRY;
const NORDVPN_WAIT_MS = Math.max(0, readEnvInt("NORDVPN_WAIT_MS", 8000));
const NORDVPN_DISCONNECT = readEnvBool("NORDVPN_DISCONNECT", true);
const NORDVPN_STATUS_RETRIES = Math.max(0, readEnvInt("NORDVPN_STATUS_RETRIES", 3));
const NORDVPN_STATUS_DELAY_MS = Math.max(0, readEnvInt("NORDVPN_STATUS_DELAY_MS", 2000));
const NORDVPN_CMD_TIMEOUT_MS = Math.max(0, readEnvInt("NORDVPN_CMD_TIMEOUT_MS", 20000));
const NORDVPN_TOTAL_TIMEOUT_MS = Math.max(0, readEnvInt("NORDVPN_TOTAL_TIMEOUT_MS", 30000));
const RETRY_ATTEMPTS = readEnvInt("RETRY_ATTEMPTS", 2);
const RETRY_DELAY_MS = readEnvInt("RETRY_DELAY_MS", 1200);
const INPUT_DELAY_EXTRA_MS = Math.max(0, readEnvInt("INPUT_DELAY_EXTRA_MS", 0));
const CHROME_PATH = process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_PATH_X86 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_PATH_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AUTO_GIT_UPDATE = readEnvBool("AUTO_GIT_UPDATE", false);
const AUTO_GIT_REMOTE = process.env.AUTO_GIT_REMOTE || "origin";
const AUTO_GIT_BRANCH = process.env.AUTO_GIT_BRANCH || "main";
const AUTO_GIT_MESSAGE = process.env.AUTO_GIT_MESSAGE || "Update compliments usage";
const AUTO_GIT_DELAY_MS = Math.max(0, readEnvInt("AUTO_GIT_DELAY_MS", 1200));
const AUTO_GIT_FILES = (process.env.AUTO_GIT_FILES || "used-compliments.json,compliments.js,last-compliment-tone.json,recent-compliments.json,recent-compliment-topics.json,recent-compliment-items.json,recent-compliment-openers.json,recent-compliment-opener-types.json,recent-compliment-length-bands.json,recent-compliment-connectors.json,last-compliment-synonym.json,recent-compliment-template-families.json")
  .split(",")
  .map(item => item.trim())
  .filter(Boolean);
const RECENT_COMPLIMENTS_LIMIT = Math.max(0, readEnvInt("RECENT_COMPLIMENTS_LIMIT", 200));
const TOPIC_COOLDOWN = Math.max(0, readEnvInt("TOPIC_COOLDOWN", 3));
const ITEM_COOLDOWN = Math.max(0, readEnvInt("ITEM_COOLDOWN", 5));
const OPENING_COOLDOWN = Math.max(0, readEnvInt("OPENING_COOLDOWN", 4));
const OPENING_TYPE_COOLDOWN = Math.max(0, readEnvInt("OPENING_TYPE_COOLDOWN", 2));
const OPEN_SLOT_RATE = readEnvFloat("OPEN_SLOT_RATE") ?? 0.06;
const TIME_OF_DAY_RATE = readEnvFloat("TIME_OF_DAY_RATE") ?? 0.08;
const STYLE_NOISE_RATE = readEnvFloat("STYLE_NOISE_RATE") ?? 0.2;
const QUIRK_RATE = readEnvFloat("QUIRK_RATE") ?? 0.03;
const TYPO_RATE = readEnvFloat("TYPO_RATE") ?? 0.07;
const LENGTH_BAND_SHORT_MAX = 80;
const LENGTH_BAND_MEDIUM_MAX = 120;
const LENGTH_BAND_WINDOW = Math.max(0, readEnvInt("LENGTH_BAND_WINDOW", 3));
const LENGTH_BAND_STREAK = Math.max(0, readEnvInt("LENGTH_BAND_STREAK", 2));
const OPENING_THE_WINDOW = Math.max(0, readEnvInt("OPENING_THE_WINDOW", 5));
const OPENING_THE_LIMIT = Math.max(0, readEnvInt("OPENING_THE_LIMIT", 2));
const TEMPLATE_FAMILY_WINDOW = Math.max(0, readEnvInt("TEMPLATE_FAMILY_WINDOW", 3));
const READY_TIMEOUT_BASE_MS = Math.max(0, readEnvInt(\"READY_TIMEOUT_BASE_MS\", 3000));
const READY_TIMEOUT_MIN_MS = Math.max(500, readEnvInt(\"READY_TIMEOUT_MIN_MS\", 1500));
const READY_TIMEOUT_MAX_MS = Math.max(READY_TIMEOUT_MIN_MS, readEnvInt(\"READY_TIMEOUT_MAX_MS\", 12000));
const READY_TIMEOUT_GROW = readEnvFloat(\"READY_TIMEOUT_GROW\") ?? 1.25;
const READY_TIMEOUT_SHRINK = readEnvFloat(\"READY_TIMEOUT_SHRINK\") ?? 0.9;
const READY_TIMEOUT_SLOW_THRESHOLD = readEnvFloat(\"READY_TIMEOUT_SLOW_THRESHOLD\") ?? 0.75;
const READY_TIMEOUT_FAST_THRESHOLD = readEnvFloat(\"READY_TIMEOUT_FAST_THRESHOLD\") ?? 0.25;
const CAJUN_RICE_PICK_CHANCE = (() => {
  const raw = readEnvFloat("CAJUN_RICE_PICK_CHANCE");
  if (raw === null) return 0;
  return Math.min(Math.max(raw, 0), 1);
})();

let adaptiveReadyTimeoutMs = READY_TIMEOUT_BASE_MS;
let lastReadyElapsedMs = null;
let readyTimeoutAdjustments = 0;

let activeBrowser = null;
let shuttingDown = false;
let gitUpdateTimer = null;
let gitUpdateInProgress = false;

function resolveChromePath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(CHROME_PATH_X86)) return CHROME_PATH_X86;
  if (fs.existsSync(CHROME_PATH_MAC)) return CHROME_PATH_MAC;
  return null;
}

function resolveNordVpnPath() {
  if (fs.existsSync(NORDVPN_PATH)) return NORDVPN_PATH;
  return null;
}

function buildNordVpnConnectArgs() {
  if (NORDVPN_SERVER_NAME) return ["-c", "-n", NORDVPN_SERVER_NAME];
  if (NORDVPN_GROUP) return ["-c", "-g", NORDVPN_GROUP];
  if (NORDVPN_COUNTRY) return ["-c", "-g", NORDVPN_COUNTRY];
  return ["-c"];
}

function runNordVpn(args, label) {
  const nordPath = resolveNordVpnPath();
  if (!nordPath) {
    console.log("WARN NordVPN CLI not found; skipping", label);
    return false;
  }
  try {
    console.log(`INFO NordVPN ${label}...`);
    execFileSync(nordPath, args, {
      cwd: path.dirname(nordPath),
      stdio: "ignore",
      timeout: NORDVPN_CMD_TIMEOUT_MS
    });
    console.log(`INFO NordVPN ${label} done`);
    return true;
  } catch (err) {
  } finally {
    summary.finishedAt = new Date().toISOString();
    summary.durationMs = Date.now() - runStartedAt;
    summary.readyTimeoutMs = adaptiveReadyTimeoutMs;
    summary.readyTimeoutAdjustments = readyTimeoutAdjustments;
    summary.lastReadyElapsedMs = lastReadyElapsedMs;
    try {
      ensureDir(runSummaryDir);
      const summaryPath = path.join(runSummaryDir, `${runId}.json`);
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      console.log("INFO Run summary ->", summaryPath);
    } catch (err) {
      console.log("WARN Failed to write run summary:", err.message);
    }
    try {
      await browser.close();
    } catch {
      // ignore
    }
    activeBrowser = null;
  }
}


function parsePositiveInt(value, min = 1) {
  const num = parseInt(String(value || "").trim(), 10);
  if (Number.isNaN(num)) return null;
  if (num < min) return null;
  return num;
}

function getRunArgs() {
  const argIndex = process.argv.findIndex(arg => arg === "--runs");
  const runs =
    argIndex >= 0 ? parsePositiveInt(process.argv[argIndex + 1], 1) : null;
  const delayMs = parsePositiveInt(process.env.RUN_DELAY_MS || "", 0);
  const delayMinMs = parsePositiveInt(process.env.RUN_DELAY_MIN_MS || "", 0);
  const delayMaxMs = parsePositiveInt(process.env.RUN_DELAY_MAX_MS || "", 0);
  const envRuns = parsePositiveInt(process.env.RUNS || "", 1);
  const batchMin = parsePositiveInt(process.env.RUN_BATCH_MIN || "", 1);
  const batchMax = parsePositiveInt(process.env.RUN_BATCH_MAX || "", 1);
  return {
    runs: runs ?? envRuns,
    delayMs,
    delayMinMs,
    delayMaxMs,
    batchMin,
    batchMax
  };
}

async function promptNumber(rl, label, defaultVal, min = 0) {
  return new Promise(resolve => {
    const ask = () => {
      rl.question(label, answer => {
        const trimmed = answer.trim();
        if (!trimmed) return resolve(defaultVal);
        const parsed = parsePositiveInt(trimmed, min);
        if (parsed === null) return ask();
        resolve(parsed);
      });
    };
    ask();
  });
}

async function getRunConfig() {
  const args = getRunArgs();
  const defaultRuns = args.runs ?? 1;
  const MIN_RUN_DELAY_MS = 60000;
  const defaultDelay = Math.max(args.delayMs ?? 2000, MIN_RUN_DELAY_MS);
  const defaultDelayMin = Math.max(args.delayMinMs ?? defaultDelay, MIN_RUN_DELAY_MS);
  const defaultDelayMax = Math.max(args.delayMaxMs ?? defaultDelayMin, defaultDelayMin);
  const defaultBatchMin = args.batchMin ?? 2;
  const defaultBatchMax = Math.max(args.batchMax ?? 3, defaultBatchMin);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const runs = await promptNumber(rl, `Runs? [${defaultRuns}]: `, defaultRuns, 1);
  const delayMinMs = await promptNumber(
    rl,
    `Delay between runs (min ms)? [${defaultDelayMin}]: `,
    defaultDelayMin,
    MIN_RUN_DELAY_MS
  );
  const delayMaxMs = await promptNumber(
    rl,
    `Delay between runs (max ms)? [${defaultDelayMax}]: `,
    defaultDelayMax,
    delayMinMs
  );
  const batchMin = await promptNumber(
    rl,
    `Runs per batch (min)? [${defaultBatchMin}]: `,
    defaultBatchMin,
    1
  );
  const batchMax = await promptNumber(
    rl,
    `Runs per batch (max)? [${defaultBatchMax}]: `,
    defaultBatchMax,
    batchMin
  );
  rl.close();
  return { runs, delayMinMs, delayMaxMs, batchMin, batchMax };
}

async function runMultiple() {
  if (AUTO_GIT_UPDATE) {
    console.log("dY>> Auto git sync before runs...");
    runGitUpdate("startup");
  }
  const { runs, delayMinMs, delayMaxMs, batchMin, batchMax } = await getRunConfig();
  let remaining = runs;
  let runIndex = 1;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, randInt(batchMin, batchMax));
    console.log(`dY>> Starting batch (${batchSize} run${batchSize === 1 ? "" : "s"})`);
    for (let i = 0; i < batchSize; i++) {
      console.log(`dY>> Starting run ${runIndex} of ${runs}`);
      try {
        await withTimeout(connectNordVpn(), NORDVPN_TOTAL_TIMEOUT_MS, "NordVPN connect");
        await runSurvey();
      } finally {
        await withTimeout(
          Promise.resolve(disconnectNordVpn()),
          NORDVPN_TOTAL_TIMEOUT_MS,
          "NordVPN disconnect"
        );
      }
      runIndex += 1;
      remaining -= 1;
    }
    if (remaining > 0 && delayMaxMs > 0) {
      const delayMs = randInt(delayMinMs, delayMaxMs);
      await sleep(delayMs);
    }
  }
}

runMultiple();
