const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { randomInt } = require("crypto");
const { execFileSync } = require("child_process");
const { compliments } = require("./compliments");

const screenshotFolder = path.join(__dirname, "screenshots");
if (!fs.existsSync(screenshotFolder)) fs.mkdirSync(screenshotFolder);
let lastScreenshotAt = 0;
const usedComplimentsPath = path.join(__dirname, "used-compliments.json");
let usedComplimentsCache = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
const AUTO_GIT_FILES = (process.env.AUTO_GIT_FILES || "used-compliments.json,compliments.js")
  .split(",")
  .map(item => item.trim())
  .filter(Boolean);
const CAJUN_RICE_PICK_CHANCE = (() => {
  const raw = readEnvFloat("CAJUN_RICE_PICK_CHANCE");
  if (raw === null) return 0;
  return Math.min(Math.max(raw, 0), 1);
})();

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
    execFileSync(nordPath, args, {
      cwd: path.dirname(nordPath),
      stdio: "ignore"
    });
    return true;
  } catch (err) {
    console.log(`WARN NordVPN ${label} failed:`, err.message);
    return false;
  }
}

function getNordVpnStatus() {
  const nordPath = resolveNordVpnPath();
  if (!nordPath) return null;
  try {
    const raw = execFileSync(nordPath, ["status"], {
      cwd: path.dirname(nordPath),
      stdio: ["ignore", "pipe", "ignore"]
    }).toString();
    if (/Status:\s*Connected/i.test(raw)) return "connected";
    if (/Status:\s*Disconnected/i.test(raw)) return "disconnected";
    return "unknown";
  } catch {
    return null;
  }
}

async function waitForNordVpnConnected() {
  for (let i = 0; i <= NORDVPN_STATUS_RETRIES; i++) {
    const status = getNordVpnStatus();
    if (status === "connected") return true;
    if (i < NORDVPN_STATUS_RETRIES) {
      await sleep(NORDVPN_STATUS_DELAY_MS);
    }
  }
  return false;
}

async function connectNordVpn() {
  if (!NORDVPN_AUTO) return;
  const ok = runNordVpn(buildNordVpnConnectArgs(), "connect");
  if (ok && NORDVPN_WAIT_MS > 0) {
    await sleep(NORDVPN_WAIT_MS);
  }
  if (ok) {
    const connected = await waitForNordVpnConnected();
    if (!connected) {
      console.log("WARN NordVPN status not connected after retries.");
    }
  }
}

function disconnectNordVpn() {
  if (!NORDVPN_AUTO || !NORDVPN_DISCONNECT) return;
  runNordVpn(["-d"], "disconnect");
}

process.on("SIGINT", async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("INFO Caught SIGINT, closing browser...");
  if (activeBrowser) {
    try {
      await activeBrowser.close();
    } catch {
      // Best-effort shutdown.
    }
  }
  process.exit(0);
});

function randInt(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return randomInt(low, high + 1);
}

function randomFloat() {
  return randomInt(1_000_000) / 1_000_000;
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

async function humanDelay(minMs = 200, maxMs = 900) {
  await sleep(randInt(minMs, maxMs));
}

async function inputDelay(minMs = 1200, maxMs = 2600) {
  const min = minMs + INPUT_DELAY_EXTRA_MS;
  const max = maxMs + INPUT_DELAY_EXTRA_MS;
  await humanDelay(min, Math.max(min, max));
}

async function typeHuman(page, selector, text) {
  await inputDelay(2200, 3600);
  for (const ch of text) {
    await page.type(selector, ch, { delay: randInt(60, 180) });
    if (randomFloat() < 0.08) await humanDelay(220, 700);
  }
}

async function takeScreenshot(page, label) {
  if (process.env.NO_SCREENSHOTS === "1") return;
  if (label.startsWith("page-loop") && process.env.VERBOSE_SCREENSHOTS !== "1") return;
  const throttleMs = parseInt(process.env.SCREENSHOT_THROTTLE_MS || "0", 10);
  if (throttleMs > 0 && Date.now() - lastScreenshotAt < throttleMs) return;
  const filepath = path.join(screenshotFolder, `${Date.now()}-${label}.png`);
  const fullPage = process.env.FULLPAGE_SCREENSHOTS === "1";
  await page.screenshot({ path: filepath, fullPage });
  lastScreenshotAt = Date.now();
  console.log("dY", label, "->", filepath);
}

async function clickContinue(page, postClickWaitMs = 1200) {
  await takeScreenshot(page, `before-continue-${Date.now()}`);
  await inputDelay(2500, 4200);
  for (let i = 0; i < 3; i++) {
    const clicked = await page.evaluate(() => {
      const isVisible = (el) => el && el.offsetParent !== null;
      const isEnabled = (el) =>
        !el.hasAttribute("disabled") &&
        el.getAttribute("aria-disabled") !== "true";

      const cont = Array.from(document.querySelectorAll("button, div, span"))
        .find(el => el.innerText?.trim() === "Continue" && isVisible(el));
      if (cont) {
        const btn = cont.closest("button, div") || cont;
        if (!isEnabled(btn)) return false;
        btn.scrollIntoView({ block: "center" });
        btn.click();
        return true;
      }
      const antBtn = document.querySelector("button.ant-btn-primary");
      if (antBtn && isVisible(antBtn) && isEnabled(antBtn)) {
        antBtn.scrollIntoView({ block: "center" });
        antBtn.click();
        return true;
      }
      const arrow = document.querySelector("div.btn-circle");
      if (arrow && isVisible(arrow) && isEnabled(arrow)) {
        arrow.scrollIntoView({ block: "center" });
        arrow.click();
        return true;
      }
      return false;
    });
    if (clicked) {
      await Promise.race([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: postClickWaitMs })
          .catch(() => null),
        waitForReadyToContinue(page, postClickWaitMs)
      ]);
      return;
    }
    await sleep(200);
  }
  throw new Error("Continue/Next button not found");
}

function readyToContinueCheck() {
  const isVisible = (el) => el && el.offsetParent !== null;
  const hasLoading = Array.from(
    document.querySelectorAll(
      ".ant-spin-spinning, .ant-spin, .loading, .loader, .spinner, [aria-busy='true']"
    )
  ).some(isVisible);
  if (hasLoading) return false;

  const hasOpenDropdown = Array.from(document.querySelectorAll(".ant-select-open"))
    .some(isVisible);
  if (hasOpenDropdown) return false;

  const hasRequiredError = Array.from(
    document.querySelectorAll(".ant-form-item-explain-error, .error, .required")
  ).some(el => el.textContent?.toLowerCase().includes("required"));
  if (hasRequiredError) return false;

  const requiredLabels = Array.from(document.querySelectorAll(".required"))
    .filter(el => el.offsetParent !== null);

  for (const label of requiredLabels) {
    const container = label.closest("section, form, div") || label.parentElement;
    if (!container) continue;

    const select = container.querySelector(".ant-select");
    if (select) {
      const selected = select.querySelector(".ant-select-selection-item");
      const text = selected?.textContent?.trim() || "";
      if (!text || text === "Select") return false;
    }

    const input = container.querySelector("input[type='text'], input[type='search'], textarea");
    if (input && !input.value.trim()) return false;
  }

  return true;
}

async function isReadyToContinue(page) {
  return page.evaluate(readyToContinueCheck);
}

async function waitForReadyToContinue(page, timeoutMs) {
  try {
    await page.waitForFunction(readyToContinueCheck, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

function randomFrom(arr) {
  return arr[randomInt(arr.length)];
}

function loadUsedCompliments() {
  if (usedComplimentsCache !== null) return usedComplimentsCache;
  try {
    if (!fs.existsSync(usedComplimentsPath)) {
      usedComplimentsCache = new Set();
      return usedComplimentsCache;
    }
    const raw = fs.readFileSync(usedComplimentsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      usedComplimentsCache = new Set();
      return usedComplimentsCache;
    }
    usedComplimentsCache = new Set(parsed.map(String));
    return usedComplimentsCache;
  } catch {
    usedComplimentsCache = new Set();
    return usedComplimentsCache;
  }
}

function scheduleGitUpdate(reason) {
  if (!AUTO_GIT_UPDATE) return;
  if (gitUpdateTimer) return;
  gitUpdateTimer = setTimeout(() => {
    gitUpdateTimer = null;
    runGitUpdate(reason);
  }, AUTO_GIT_DELAY_MS);
}

function runGitUpdate(reason) {
  if (!AUTO_GIT_UPDATE || gitUpdateInProgress) return;
  if (AUTO_GIT_FILES.length === 0) return;
  gitUpdateInProgress = true;
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: __dirname,
      stdio: "ignore"
    });
    execFileSync("git", ["pull", "--rebase", "--autostash", AUTO_GIT_REMOTE, AUTO_GIT_BRANCH], {
      cwd: __dirname,
      stdio: "ignore"
    });
    const statusBefore = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...AUTO_GIT_FILES],
      { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }
    ).toString().trim();
    if (!statusBefore) return;
    execFileSync("git", ["add", "--", ...AUTO_GIT_FILES], { cwd: __dirname, stdio: "ignore" });
    const statusAfter = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...AUTO_GIT_FILES],
      { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }
    ).toString().trim();
    if (!statusAfter) return;
    const message = reason ? `${AUTO_GIT_MESSAGE} (${reason})` : AUTO_GIT_MESSAGE;
    execFileSync("git", ["commit", "-m", message], { cwd: __dirname, stdio: "ignore" });
    execFileSync("git", ["push", AUTO_GIT_REMOTE, AUTO_GIT_BRANCH], {
      cwd: __dirname,
      stdio: "ignore"
    });
  } catch (err) {
    console.log("WARN auto git update failed:", err.message);
  } finally {
    gitUpdateInProgress = false;
  }
}

function saveUsedCompliments(usedSet) {
  try {
    usedComplimentsCache = usedSet;
    fs.writeFileSync(usedComplimentsPath, JSON.stringify([...usedSet], null, 2));
    scheduleGitUpdate("used-compliments");
  } catch {
    // Best-effort persistence; ignore write errors.
  }
}

function pickPersistentCompliment(list) {
  const used = loadUsedCompliments();
  const available = list.filter(item => !used.has(item));
  if (available.length === 0) {
    used.clear();
  }
  const pick = randomFrom(available.length > 0 ? available : list);
  used.add(pick);
  saveUsedCompliments(used);
  return pick;
}

function pickWeighted(options) {
  const total = options.reduce((sum, opt) => sum + opt.weight, 0);
  let roll = randomFloat() * total;
  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) return opt.text;
  }
  return options[options.length - 1].text;
}

function randomDateTime() {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, 13));
  const date = d.toISOString().split("T")[0];
  const hour24 = randInt(10, 22); // 10:00-22:59
  const h = ((hour24 + 11) % 12) + 1;
  const m = randInt(0, 59).toString().padStart(2, "0");
  const ampm = hour24 >= 12 ? "pm" : "am";
  return { date, time: `${h}:${m} ${ampm}` };
}

function randomPrice() {
  return (randomFloat() * 20 + 5).toFixed(2);
}

async function withRetry(action, label) {
  let lastErr = null;
  for (let i = 0; i <= RETRY_ATTEMPTS; i++) {
    try {
      return await action();
    } catch (err) {
      lastErr = err;
      const remaining = RETRY_ATTEMPTS - i;
      if (remaining <= 0) break;
      console.log(`WARN ${label} failed, retrying (${remaining} left)...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

const DROPDOWN_QUESTIONS = [
  {
    text: "Including yourself, how many people were in your party",
    options: [
      { text: "One", weight: 2 },
      { text: "Two", weight: 3 },
      { text: "Three", weight: 3 },
      { text: "Four", weight: 2 },
      { text: "Five or more", weight: 1 }
    ]
  },
  {
    text: "Including this visit, how many times have you visited this Popeyes",
    options: [
      { text: "One", weight: 4 },
      { text: "Two", weight: 3 },
      { text: "Three", weight: 2 },
      { text: "Four", weight: 1 }
    ]
  },
  {
    text: "Please indicate your gender",
    options: [
      { text: "Female", weight: 1 },
      { text: "Male", weight: 1 }
    ]
  },
  {
    text: "Please indicate your age",
    options: [
      { text: "Under 18", weight: 1 },
      { text: "18 to 24", weight: 3 },
      { text: "25 to 34", weight: 4 },
      { text: "35 to 49", weight: 3 },
      { text: "50 to 64", weight: 1 }
    ]
  },
  {
    text: "Please indicate your annual household income",
    options: [
      { text: "Under $25,000", weight: 1 },
      { text: "$25,000 to $44,999", weight: 1 },
      { text: "$45,000 to $59,999", weight: 1 },
      { text: "$60,000 to $74,999", weight: 1 },
      { text: "$75,000 to $99,999", weight: 1 },
      { text: "$100,000 or more", weight: 1 }
    ]
  },
  {
    text: "Please indicate which of the following best describes your background",
    options: [
      { text: "White or Caucasian", weight: 6 },
      { text: "Hispanic or Latino", weight: 3 },
      { text: "Black or African American", weight: 2 },
      { text: "Asian", weight: 1 },
      { text: "American Indian or Alaska Native", weight: 1 },
      { text: "Native Hawaiian or other Pacific Islander", weight: 1 }
    ]
  }
];

const LIKELIHOOD_QUESTIONS = [
  "How likely are you to return to this Popeyes",
  "How likely are you to recommend this Popeyes"
];

const WEIGHTED_SINGLE_CHOICE_QUESTIONS = [
  {
    text: "How did you place your order",
    options: [
      { text: "Delivery partner", weight: 1 },
      { text: "Drive-thru speaker", weight: 4 },
      { text: "Front counter", weight: 4 },
      { text: "Popeyes mobile app", weight: 2 },
      { text: "Popeyes mobile website", weight: 2 },
      { text: "Self-service kiosk", weight: 2 }
    ]
  }
];

const MENU_QUESTION_MATCHES = [
  "Which of the following Sides did you order",
  "Which of the following Boneless Chicken did you order",
  "Which of the following Seafood did you order",
  "Which of the following Sandwiches did you order",
  "Which of the following Bone-in Chicken did you order",
  "Which of the following Wraps did you order",
  "Which of the following Desserts did you order",
  "Which of the following Beverages did you order"
];

const GRID_QUESTION_TEXTS = [
  ...LIKELIHOOD_QUESTIONS,
  ...MENU_QUESTION_MATCHES
];

const QUESTION_TEXTS = Array.from(new Set([
  ...DROPDOWN_QUESTIONS.map(q => q.text),
  ...LIKELIHOOD_QUESTIONS,
  ...WEIGHTED_SINGLE_CHOICE_QUESTIONS.map(q => q.text),
  ...MENU_QUESTION_MATCHES,
  ...GRID_QUESTION_TEXTS,
  "Was your order for",
  "Which of the following menu items did you order"
]));

async function buildQuestionCache(page, questionTexts) {
  await page.evaluate((texts) => {
    const nodes = Array.from(
      document.querySelectorAll("label, [data-testid], [aria-label], h1, h2, h3, p, span, div")
    );
    window.__surveyTextCache = nodes;
    window.__surveyQuestionMap = {};

    const addMatch = (questionText, node) => {
      const container =
        node.closest("[data-testid], [aria-label], section, form, div") ||
        node.parentElement;
      if (!container) return;
      const testId = container.getAttribute("data-testid") || node.getAttribute("data-testid") || "";
      const ariaLabel = container.getAttribute("aria-label") || node.getAttribute("aria-label") || "";
      const id = container.id || node.id || "";
      window.__surveyQuestionMap[questionText] = { testId, ariaLabel, id };
    };

    for (const node of nodes) {
      const text = node.textContent?.trim();
      if (!text) continue;
      for (const questionText of texts) {
        if (!window.__surveyQuestionMap[questionText] && text.startsWith(questionText)) {
          addMatch(questionText, node);
        }
      }
    }
  }, questionTexts);
}

async function fillVisibleDropdowns(page) {
  return page.evaluate(async () => {
    const isVisible = (el) => el && el.offsetParent !== null;
    const selects = Array.from(document.querySelectorAll(".ant-select"))
      .filter(isVisible);
    let selectedCount = 0;

    for (const select of selects) {
      const selectedText = select.querySelector(".ant-select-selection-item");
      const text = selectedText?.textContent?.trim() || "";
      if (text && text !== "Select") continue;

      const selector = select.querySelector(".ant-select-selector") || select;
      selector.scrollIntoView({ block: "center" });
      selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      selector.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      selector.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));

      const dropdown = document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
      if (!dropdown) continue;

      const options = Array.from(dropdown.querySelectorAll(".ant-select-item-option"))
        .filter(opt => !opt.classList.contains("ant-select-item-option-disabled"));
      if (options.length === 0) continue;

      const choice = options[Math.floor(Math.random() * options.length)];
      choice.click();
      selectedCount++;
      await new Promise(r => setTimeout(r, 120));
    }

    return selectedCount;
  });
}

async function fillLikelyScale(page) {
  return page.evaluate(() => {
    const isVisible = (el) => el && el.offsetParent !== null;
    const questions = Array.from(document.querySelectorAll("div, p, h1, h2, h3, label, span"))
      .filter(el => el.textContent?.trim().startsWith("How likely are you"));
    let clicked = 0;

    for (const questionEl of questions) {
      const container =
        questionEl.closest("section, form, div") || questionEl.parentElement;
      if (!container || !isVisible(container)) continue;

      const alreadySelected = container.querySelector(
        "input[type='checkbox']:checked, input[type='radio']:checked, [aria-checked='true']"
      );
      if (alreadySelected) continue;

      const rows = Array.from(container.querySelectorAll("div, li, label"))
        .filter(isVisible);
      const match = rows.find(row =>
        row.textContent?.trim() === "Highly Likely" ||
        row.textContent?.trim() === "Likely"
      );
      if (!match) continue;

      const input = match.querySelector("input[type='checkbox'], input[type='radio']");
      if (input) {
        input.click();
        clicked++;
        continue;
      }

      const roleOption = match.querySelector("[role='checkbox'], [role='radio']");
      if (roleOption) {
        roleOption.click();
        clicked++;
        continue;
      }

      match.click();
      clicked++;
    }

    return clicked;
  });
}

async function selectVisitDate(page, dateStr) {
  const inputSelector =
    "#date, input[placeholder*='Select date'], input[aria-label*='date'], .ant-picker-input input, input[type='date']";
  const input = await page.$(inputSelector);
  if (!input) return false;
  await input.evaluate(el => el.scrollIntoView({ block: "center", inline: "center" }));
  await humanDelay(120, 420);
  await input.focus();
  const box = await input.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 20 });
  } else {
    await input.click({ delay: 20 });
  }

  const ok = await page.waitForSelector(
    ".ant-picker-dropdown .ant-picker-panel, .ant-calendar-picker-container, .react-datepicker, .rdp, .datepicker, .calendar",
    { timeout: 5000 }
  ).then(() => true).catch(() => false);
  if (!ok) return false;

  await humanDelay(120, 420);
  const directCell = await page.$(
    `.ant-picker-dropdown td.ant-picker-cell[title='${dateStr}'] .ant-picker-cell-inner`
  );
  if (directCell) {
    await directCell.click();
    return true;
  }

  return page.evaluate((targetIso) => {
    const targetDate = new Date(`${targetIso}T00:00:00`);
    const targetY = targetDate.getFullYear();
    const targetM = targetDate.getMonth();
    const targetD = targetDate.getDate();
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const container =
      document.querySelector(".ant-picker-dropdown") ||
      document.querySelector(".ant-calendar-picker-container") ||
      document.querySelector(".react-datepicker") ||
      document.querySelector(".rdp") ||
      document.querySelector(".datepicker") ||
      document.querySelector(".calendar") ||
      document.body;

    const findHeaderText = () => {
      const header =
        container.querySelector(".ant-picker-header-view") ||
        container.querySelector(".react-datepicker__current-month") ||
        container.querySelector(".rdp-caption_label") ||
        container.querySelector(".datepicker-switch") ||
        container.querySelector(".calendar-header");
      return header ? header.textContent.trim() : "";
    };

    const parseHeader = (text) => {
      const parts = text.replace(",", " ").split(/\s+/).filter(Boolean);
      if (parts.length < 2) return null;
      const monthText = parts[0].slice(0, 3);
      const year = parseInt(parts[1], 10);
      const month = months.indexOf(monthText);
      if (Number.isNaN(year) || month < 0) return null;
      return { year, month };
    };

    const clickNav = (dir) => {
      const selectors = dir === "prev"
        ? [
          ".ant-picker-header-super-prev-btn",
          "button[aria-label*='Previous']",
          ".ant-picker-header-prev-btn",
          ".react-datepicker__navigation--previous",
          ".rdp-nav_button_previous",
          ".prev",
          ".calendar-prev"
        ]
        : [
          ".ant-picker-header-super-next-btn",
          "button[aria-label*='Next']",
          ".ant-picker-header-next-btn",
          ".react-datepicker__navigation--next",
          ".rdp-nav_button_next",
          ".next",
          ".calendar-next"
        ];
      for (const sel of selectors) {
        const btn = container.querySelector(sel);
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    };

    const trySelect = () => {
      const iso = targetIso;
      const byTitle =
        container.querySelector(`td.ant-picker-cell[title='${iso}']`) ||
        container.querySelector(`[title='${iso}']`) ||
        container.querySelector(`[data-date='${iso}']`) ||
        container.querySelector(`[aria-label='${iso}']`);
      if (byTitle) {
        const inner = byTitle.querySelector(".ant-picker-cell-inner") || byTitle;
        inner.click();
        return true;
      }

      const inViewCells = Array.from(
        container.querySelectorAll(
          "td.ant-picker-cell.ant-picker-cell-in-view .ant-picker-cell-inner," +
          ".ant-picker-cell-in-view .ant-picker-cell-inner," +
          ".react-datepicker__day--in-range, .react-datepicker__day," +
          ".rdp-day, .datepicker-days td, .calendar-day"
        )
      );
      const match = inViewCells.find(el => {
        const text = el.textContent.trim();
        return text === String(targetD) && !el.classList.contains("disabled");
      });
      if (match) {
        match.click();
        return true;
      }
      return false;
    };

    for (let i = 0; i < 6; i++) {
      if (trySelect()) return true;
      const headerText = findHeaderText();
      const parsed = parseHeader(headerText);
      if (!parsed) break;
      const diff = (targetY - parsed.year) * 12 + (targetM - parsed.month);
      if (diff === 0) break;
      if (diff < 0) {
        if (!clickNav("prev")) break;
      } else {
        if (!clickNav("next")) break;
      }
    }
    return trySelect();
  }, dateStr);
}

async function selectOrderType(page) {
  const choice = pickWeighted([
    { text: "Takeout/Pickup", weight: 5 },
    { text: "Dine-In", weight: 4 },
    { text: "Delivery", weight: 1 },
    { text: "Catering", weight: 1 }
  ]);
  console.log("ðŸ½ Order type:", choice);

  await page.waitForSelector(".select-option-txt", { timeout: 15000 });
  await humanDelay(150, 600);
  await page.evaluate(choice => {
    const items = Array.from(document.querySelectorAll(".select-option"));
    const found = items.find(el =>
      el.querySelector(".select-option-txt")?.textContent.trim() === choice
    );
    if (found) found.click();
  }, choice);

  await waitForReadyToContinue(page, 5000);
}

async function runSurvey() {
  const launchArgs = ["--start-maximized"];
  if (process.env.USE_FAST_LAUNCH === "1") {
    launchArgs.push("--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage");
  }
  if (PROXY) {
    launchArgs.push(`--proxy-server=${PROXY}`);
    if (PROXY_BYPASS) {
      launchArgs.push(`--proxy-bypass-list=${PROXY_BYPASS}`);
    } else {
      launchArgs.push("--proxy-bypass-list=<-loopback>");
    }
  }
  if (VPN_SAFE) {
    launchArgs.push(
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--enable-features=WebRtcHideLocalIpsWithMdns"
    );
  }
  const chromePath = resolveChromePath();
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: launchArgs,
    defaultViewport: null,
  });
  activeBrowser = browser;
  const page = await browser.newPage();
  if (PROXY && (PROXY_USERNAME || PROXY_PASSWORD)) {
    await page.authenticate({
      username: PROXY_USERNAME || "",
      password: PROXY_PASSWORD || ""
    });
  }
  if (USER_AGENT) {
    await page.setUserAgent(USER_AGENT);
  }
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const blockAssets = process.env.BLOCK_ASSETS !== "0";
  console.log(`INFO Asset blocking: ${blockAssets ? "on" : "off"}`);
  if (blockAssets) {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "image" || type === "media" || type === "font") {
        req.abort();
        return;
      }
      req.continue();
    });
  }
  let hasTypedText = false;
  const handledQuestions = new Set();
  const handledDropdowns = new Set();
  const summary = {
    pagesVisited: 0,
    textareasFilled: 0,
    emojisClicked: 0,
    dropdownsPicked: 0,
    likelihoodPicked: 0,
    menuPicked: 0,
    starsPicked: 0,
    gridPicked: 0,
    noThanksClicked: 0
  };

  try {
    await withRetry(
      () => page.goto(SURVEY_URL, { waitUntil: "networkidle2" }),
      "page.goto"
    );
    await takeScreenshot(page, "start");

    await page.evaluate(() => {
      const el = document.querySelector("button, div[role='button'], span[role='button']");
      if (el) el.click();
    });

    await page.waitForSelector("#storeId", { timeout: 15000 });
    const { date, time } = randomDateTime();
    await typeHuman(page, "#storeId", STORE_ID);

    await selectVisitDate(page, date);

    await humanDelay(150, 650);
    const forcedTotal = readEnvFloat("ORDER_TOTAL");
    const totalValue = forcedTotal !== null ? forcedTotal.toFixed(2) : randomPrice();
    await page.evaluate((t, total) => {
      const inputs = Array.from(document.querySelectorAll("input"));
      if (inputs.length >= 4) {
        inputs[2].value = t;
        inputs[3].value = total;
        inputs.forEach(i => i.dispatchEvent(new Event("input", { bubbles: true })));
      }
    }, time, totalValue);

    await takeScreenshot(page, "order-info");
    await withRetry(() => clickContinue(page), "clickContinue");
    await takeScreenshot(page, "order-type-screen");
    await selectOrderType(page);

    // ===== MAIN LOOP =====
    let more = true;
    let iteration = 0;

    while (more && iteration < 40) {
      iteration++;
      await takeScreenshot(page, `page-loop-${iteration}`);
      let didSomething = false;
      await buildQuestionCache(page, QUESTION_TEXTS);

      // --- TEXTAREA ONCE ---
      const textArea = await page.$("textarea");
      if (textArea && !hasTypedText) {
        await humanDelay(200, 900);
        await typeHuman(page, "textarea", pickPersistentCompliment(compliments));
        hasTypedText = true;
        summary.textareasFilled++;
        await takeScreenshot(page, `textarea-filled-${iteration}`);
        didSomething = true;
      }

      // --- EMOJIS (inject + simulate) ---
      const emojiResult = await page.evaluate(async () => {
        const rows = Array.from(document.querySelectorAll("span.emoji-container"));
        const clicked = [];

        for (let i = 0; i < rows.length; i++) {
          const emojis = rows[i].querySelectorAll("span.emoji");
          if (emojis.length < 5) continue;

          const target = emojis[4];
          const fire = (el, type) => {
            el.dispatchEvent(new PointerEvent(type, { bubbles: true }));
            el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
          };

          fire(target, "pointerdown");
          fire(target, "mousedown");
          fire(target, "pointerup");
          fire(target, "mouseup");
          fire(target, "click");

          await new Promise(r => setTimeout(r, 300));
          clicked.push(i + 1);
        }

        return clicked;
      });

      if (emojiResult.length > 0) {
        console.log(`ðŸ™‚ Emoji rows clicked: ${emojiResult.join(", ")}`);
        summary.emojisClicked += emojiResult.length;
        await takeScreenshot(page, `emoji-final-${iteration}`);
        didSomething = true;
      }

      // --- WEIGHTED SINGLE-CHOICE QUESTIONS ---
      for (const q of WEIGHTED_SINGLE_CHOICE_QUESTIONS) {
        const choiceText = pickWeighted(q.options);
        const result = await page.evaluate((questionText, selectedTextValue) => {
          const normalize = (value) =>
            (value || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim();
          const map = window.__surveyQuestionMap || {};
          const cssEscape = (value) =>
            (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
          const resolveContainer = (text) => {
            const meta = map[text];
            if (!meta) return null;
            if (meta.testId) {
              const el = document.querySelector(`[data-testid="${cssEscape(meta.testId)}"]`);
              if (el) return el;
            }
            if (meta.ariaLabel) {
              const el = document.querySelector(`[aria-label="${cssEscape(meta.ariaLabel)}"]`);
              if (el) return el;
            }
            if (meta.id) {
              const el = document.getElementById(meta.id);
              if (el) return el;
            }
            return null;
          };

          let container = resolveContainer(questionText);
          if (!container) {
            const textNodes = window.__surveyTextCache || Array.from(
              document.querySelectorAll("div, p, h1, h2, h3, label, span")
            );
            const questionEl = textNodes.find(el =>
              el.textContent?.trim().startsWith(questionText)
            );
            if (!questionEl) return { clicked: false, seen: false };
            container = questionEl.closest("section, form, div") || questionEl.parentElement;
          }
          if (!container) return { clicked: false, seen: false };

          if (container.getAttribute("data-handled-weighted") === "1") {
            return { clicked: false, seen: true };
          }

          const alreadySelected = container.querySelector(
            "input[type='checkbox']:checked, input[type='radio']:checked, [aria-checked='true']"
          );
          if (alreadySelected) {
            container.setAttribute("data-handled-weighted", "1");
            return { clicked: false, seen: true };
          }

          const normalizedChoice = normalize(selectedTextValue);
          let options = Array.from(container.querySelectorAll("div.sc-iTONeN"));
          if (options.length === 0) {
            options = Array.from(
              container.querySelectorAll("label, li, .ant-checkbox-wrapper, .ant-radio-wrapper")
            );
          }

          const match = options.find(option => {
            const label = option.querySelector("div.sc-efBctP") ||
              option.querySelector("span") ||
              option;
            const text = normalize(label.textContent || "");
            if (!text) return false;
            return text === normalizedChoice ||
              text.startsWith(normalizedChoice) ||
              text.includes(normalizedChoice);
          });

          if (!match) return { clicked: false, seen: true };

          const input = match.querySelector("input[type='checkbox'], input[type='radio']");
          const roleOption = match.querySelector("[role='checkbox'], [role='radio']");
          if (input) {
            input.click();
          } else if (roleOption) {
            roleOption.click();
          } else {
            match.click();
          }
          container.setAttribute("data-handled-weighted", "1");
          return { clicked: true, seen: true };
        }, q.text, choiceText);

        if (result.seen && result.clicked) {
          console.log(`INFO Weighted pick: ${q.text} -> ${choiceText}`);
          await takeScreenshot(page, `weighted-${iteration}`);
          didSomething = true;
        }
      }

      // --- DROPDOWNS (ANT SELECTS) ---
      for (const q of DROPDOWN_QUESTIONS) {
        if (handledDropdowns.has(q.text)) continue;

        const choiceText = pickWeighted(q.options);
        const dropdownResult = await page.evaluate(async (questionText, selectedTextValue) => {
          const map = window.__surveyQuestionMap || {};
          const cssEscape = (value) =>
            (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
          const resolveContainer = (text) => {
            const meta = map[text];
            if (!meta) return null;
            if (meta.testId) {
              const el = document.querySelector(`[data-testid="${cssEscape(meta.testId)}"]`);
              if (el) return el;
            }
            if (meta.ariaLabel) {
              const el = document.querySelector(`[aria-label="${cssEscape(meta.ariaLabel)}"]`);
              if (el) return el;
            }
            if (meta.id) {
              const el = document.getElementById(meta.id);
              if (el) return el;
            }
            return null;
          };

          let container = resolveContainer(questionText);
          if (!container) {
            const textNodes = window.__surveyTextCache || Array.from(
              document.querySelectorAll("div, p, h1, h2, h3, label, span")
            );
            const questionEl = textNodes.find(el =>
              el.textContent?.trim().startsWith(questionText)
            );
            if (!questionEl) return { selected: false, seen: false };
            container = questionEl.closest("section, form, div") || questionEl.parentElement;
          }
          if (!container) return { selected: false, seen: false };

          const select = container.querySelector(".ant-select");
          if (!select) return { selected: false, seen: true };

          const selectedText = select.querySelector(".ant-select-selection-item");
          if (selectedText && selectedText.textContent.trim() === selectedTextValue) {
            return { selected: true, seen: true };
          }

          const selector = select.querySelector(".ant-select-selector") || select;
          const fire = (el, type) =>
            el.dispatchEvent(new MouseEvent(type, { bubbles: true }));

          fire(selector, "mousedown");
          fire(selector, "mouseup");
          fire(selector, "click");
          await new Promise(r => setTimeout(r, 250));

          const isOpen = select.classList.contains("ant-select-open");
          if (!isOpen) return { selected: false, seen: true };

          const dropdown =
            select.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)") ||
            document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
          if (!dropdown) return { selected: false, seen: true };

          const options = Array.from(dropdown.querySelectorAll(".ant-select-item-option"));
          const match = options.find(el => {
            const content = el.querySelector(".ant-select-item-option-content") || el;
            return content.textContent.trim() === selectedTextValue;
          });

          if (!match) return { selected: false, seen: true };

          match.click();
          return { selected: true, seen: true };
        }, q.text, choiceText);

        if (dropdownResult.seen && dropdownResult.selected) {
          handledDropdowns.add(q.text);
          summary.dropdownsPicked++;
          await takeScreenshot(page, `dropdown-${q.max}-${iteration}`);
          didSomething = true;
        }
      }

      const filledSelects = await fillVisibleDropdowns(page);
      if (filledSelects > 0) {
        console.log(`INFO Filled selects: ${filledSelects}`);
        summary.dropdownsPicked += filledSelects;
        await takeScreenshot(page, `selects-filled-${iteration}`);
        didSomething = true;
      }

      // --- LIKELIHOOD QUESTION (TEXT OPTIONS) ---
      {
        const handledIds = Array.from(handledQuestions);
        const likelihoodResult = await page.evaluate((ids, questionTexts) => {
          const map = window.__surveyQuestionMap || {};
          const cssEscape = (value) =>
            (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
          const resolveContainer = (text) => {
            const meta = map[text];
            if (!meta) return null;
            if (meta.testId) {
              const el = document.querySelector(`[data-testid="${cssEscape(meta.testId)}"]`);
              if (el) return el;
            }
            if (meta.ariaLabel) {
              const el = document.querySelector(`[aria-label="${cssEscape(meta.ariaLabel)}"]`);
              if (el) return el;
            }
            if (meta.id) {
              const el = document.getElementById(meta.id);
              if (el) return el;
            }
            return null;
          };

          const questionContainers = questionTexts
            .map(resolveContainer)
            .filter(Boolean);

          const textNodes = window.__surveyTextCache || Array.from(
            document.querySelectorAll("div, p, h1, h2, h3, label, span")
          );
          const questionEls = questionContainers.length > 0
            ? questionContainers
            : textNodes.filter(el =>
              questionTexts.some(text => el.textContent?.trim().startsWith(text))
            );

          const result = { clickedIds: [], seenIds: [] };

          for (const questionEl of questionEls) {
            const container = questionEl.matches?.("[data-question-type='single-choice']")
              ? questionEl
              : questionEl.closest?.("[data-question-type='single-choice']") ||
                questionEl.closest?.("section, form, div") ||
                questionEl.parentElement;
            if (!container) continue;

            if (container.getAttribute("data-handled-likelihood") === "1") {
              continue;
            }

            const questionId = container.getAttribute("data-testid") || null;
            if (questionId) result.seenIds.push(questionId);
            if (questionId && ids.includes(questionId)) {
              container.setAttribute("data-handled-likelihood", "1");
              continue;
            }

            const alreadySelected = container.querySelector(
              "input[type='checkbox']:checked, [aria-checked='true'], .ant-checkbox-checked"
            );
            if (alreadySelected) {
              container.setAttribute("data-handled-likelihood", "1");
              continue;
            }

            const option = Array.from(container.querySelectorAll("div.sc-iTONeN"))
              .find(row =>
                row.querySelector("div.sc-efBctP")?.textContent?.trim() === "Highly Likely"
              );

            if (!option) continue;

            const checkbox = option.querySelector("input.ant-checkbox-input");
            if (!checkbox) continue;

            checkbox.click();
            container.setAttribute("data-handled-likelihood", "1");
            if (questionId) result.clickedIds.push(questionId);
          }

          return result;
        }, handledIds, LIKELIHOOD_QUESTIONS);

        for (const id of likelihoodResult.seenIds) {
          handledQuestions.add(id);
        }

        if (likelihoodResult.clickedIds.length > 0) {
          console.log("dY% Selected: Highly Likely");
          summary.likelihoodPicked += likelihoodResult.clickedIds.length;
          await takeScreenshot(page, `likelihood-high-${iteration}`);
          didSomething = true;
        }
      }

      const filledLikely = await fillLikelyScale(page);
      if (filledLikely > 0) {
        console.log(`INFO Filled likely scale: ${filledLikely}`);
        summary.likelihoodPicked += filledLikely;
        await takeScreenshot(page, `likelihood-filled-${iteration}`);
        didSomething = true;
      }

      // --- MENU ITEM FOLLOW-UPS ---
      const menuResult = await page.evaluate(async (cajunRiceChance) => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const map = window.__surveyQuestionMap || {};
        const cssEscape = (value) =>
          (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
        const resolveContainer = (match) => {
          const meta = map[match];
          if (meta?.testId) {
            const el = document.querySelector(`[data-testid="${cssEscape(meta.testId)}"]`);
            if (el) return el;
          }
          if (meta?.ariaLabel) {
            const el = document.querySelector(`[aria-label="${cssEscape(meta.ariaLabel)}"]`);
            if (el) return el;
          }
          if (meta?.id) {
            const el = document.getElementById(meta.id);
            if (el) return el;
          }

          const textNodes = window.__surveyTextCache || Array.from(
            document.querySelectorAll("div, p, h1, h2, h3, label, span")
          );
          const questionEl = textNodes.find(el => el.textContent?.trim().startsWith(match));
          if (!questionEl) return null;
          return questionEl.closest("section, form, div") || questionEl.parentElement;
        };

        const normalize = (value) => (value || "").toLowerCase().trim();
        const isCajunRice = (text) => normalize(text) === "cajun rice";
        const configs = [
          {
            key: "Sides",
            match: "Which of the following Sides did you order",
            allow: (text) => !isCajunRice(text) || Math.random() < cajunRiceChance
          },
          {
            key: "Boneless Chicken",
            match: "Which of the following Boneless Chicken did you order",
            allow: () => true
          },
          {
            key: "Seafood",
            match: "Which of the following Seafood did you order",
            allow: () => true
          },
          {
            key: "Sandwiches",
            match: "Which of the following Sandwiches did you order",
            allow: () => true
          },
          {
            key: "Bone-in Chicken",
            match: "Which of the following Bone-in Chicken did you order",
            allow: () => true
          },
          {
            key: "Wraps",
            match: "Which of the following Wraps did you order",
            allow: () => true
          },
          {
            key: "Desserts",
            match: "Which of the following Desserts did you order",
            allow: () => true
          },
          {
            key: "Beverages",
            match: "Which of the following Beverages did you order",
            allow: () => true
          }
        ];

        const extractOptions = (container) => {
          const scopedOptions = Array.from(
            container.querySelectorAll("div.sc-efBctP.izbzVo")
          );
          if (scopedOptions.length > 0) return scopedOptions;

          const checkboxInputs = Array.from(
            container.querySelectorAll(
              "input[type='checkbox'], [role='checkbox'], .ant-checkbox-input, .ant-checkbox"
            )
          );
          const rows = checkboxInputs
            .map(input => input.closest("label") || input.closest("div") || input.parentElement)
            .filter(Boolean);
          const unique = [];
          rows.forEach(row => {
            if (!unique.includes(row)) unique.push(row);
          });
          return unique;
        };

        const getOptionText = (el) => {
          const textNode = el.querySelector(".sc-efBctP") || el;
          const raw = (textNode.textContent || "").replace(/\s+/g, " ").trim();
          return raw.replace(/^\d+\s+/, "");
        };

        const clickOption = (el) => {
          if (!el) return;
          const checkbox =
            el.querySelector("input[type='checkbox']") ||
            el.querySelector("[role='checkbox']") ||
            el.querySelector(".ant-checkbox-input") ||
            el.querySelector(".ant-checkbox");
          const label = checkbox && (checkbox.closest("label") ||
            (checkbox.id && el.querySelector(`label[for='${checkbox.id}']`)));
          const antCheckbox =
            el.querySelector(".ant-checkbox-input") ||
            el.querySelector(".ant-checkbox-inner") ||
            el.querySelector(".ant-checkbox");

          const target = label || antCheckbox || checkbox || el;
          const rect = target.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const atPoint = document.elementFromPoint(x, y);
          if (atPoint) {
            atPoint.click();
          } else {
            target.click();
          }

          const isInput = checkbox && checkbox.tagName?.toLowerCase() === "input";
          if (isInput && checkbox && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("input", { bubbles: true }));
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (checkbox && !isInput && checkbox.getAttribute("aria-checked") !== "true") {
            checkbox.setAttribute("aria-checked", "true");
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          }
        };

        for (const config of configs) {
          const container = resolveContainer(config.match);
          if (!container) continue;

          if (container.getAttribute("data-handled-menu") === "1") {
            return { clicked: false, key: config.key };
          }

          await sleep(rand(4000, 6000));
          const options = extractOptions(container);
          const allowed = options.filter(el =>
            config.allow(getOptionText(el))
          );

          if (allowed.length === 0) {
            container.setAttribute("data-handled-menu", "1");
            return { clicked: false, key: config.key };
          }

          const maxSelect = Math.min(allowed.length, 4);
          const totalToSelect = Math.floor(Math.random() * maxSelect) + 1;
          const shuffled = allowed.sort(() => 0.5 - Math.random());
          for (let i = 0; i < totalToSelect; i++) {
            const choice = shuffled[i];
            const clickTarget =
              choice.closest("div.sc-iTONeN") || choice;
            clickOption(clickTarget);
            await sleep(rand(4500, 5500));
          }
          const checked = container.querySelectorAll(
            "input[type='checkbox']:checked, [role='checkbox'][aria-checked='true']"
          );
          let didCheck = checked.length > 0;

          if (!didCheck) {
            const firstCheckbox =
              container.querySelector("input[type='checkbox']") ||
              container.querySelector("[role='checkbox']") ||
              container.querySelector(".ant-checkbox-input") ||
              container.querySelector(".ant-checkbox");
            if (firstCheckbox) {
              const label = firstCheckbox.closest("label") ||
                (firstCheckbox.id && container.querySelector(`label[for='${firstCheckbox.id}']`));
              const antCheckbox =
                container.querySelector(".ant-checkbox-input") ||
                container.querySelector(".ant-checkbox-inner") ||
                container.querySelector(".ant-checkbox");
              const target = label || antCheckbox || firstCheckbox;
              const rect = target.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              const atPoint = document.elementFromPoint(x, y);
              if (atPoint) {
                atPoint.click();
              } else {
                target.click();
              }

              const isInput = firstCheckbox.tagName?.toLowerCase() === "input";
              if (isInput && !firstCheckbox.checked) {
                firstCheckbox.checked = true;
                firstCheckbox.dispatchEvent(new Event("input", { bubbles: true }));
                firstCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
              }
              if (!isInput && firstCheckbox.getAttribute("aria-checked") !== "true") {
                firstCheckbox.setAttribute("aria-checked", "true");
                firstCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }

            const rechecked = container.querySelectorAll(
              "input[type='checkbox']:checked, [role='checkbox'][aria-checked='true']"
            );
            didCheck = rechecked.length > 0;
          }
          if (didCheck) {
            container.setAttribute("data-handled-menu", "1");
          }
          return { clicked: didCheck, key: config.key };
        }

        return { clicked: false, key: null };
      }, CAJUN_RICE_PICK_CHANCE);

      if (menuResult.clicked) {
        console.log(`dY% Selected menu item for: ${menuResult.key}`);
        summary.menuPicked++;
        await takeScreenshot(page, `menu-${menuResult.key}-${iteration}`);
        didSomething = true;
      } else {
        const visibleCheckbox = await page.$(
          "input[type='checkbox']:not([disabled]), .ant-checkbox-input, [role='checkbox']"
        );
        if (visibleCheckbox) {
          await visibleCheckbox.evaluate(el => el.scrollIntoView({ block: "center" }));
          await visibleCheckbox.click({ delay: 20 });
          await sleep(200);
          didSomething = true;
        }
      }

      // --- STAR RATINGS ---
      const starGroups = await page.$$(`ul[role='radiogroup']`);

      if (starGroups.length > 0) {
        console.log(`ðŸŒŸ Found ${starGroups.length} star rating groups`);

        for (let group of starGroups) {
          const alreadyFilled = await group.evaluate(el =>
            el.querySelector("div[role='radio'].ant-radio-button-wrapper-checked")
          );

          if (alreadyFilled) {
            console.log("Star group already selected; skipping");
            continue;
          }

          const radios = await group.$$(`li div[role='radio']`);
          if (radios.length >= 5) {
            const star = radios[4];
            await star.evaluate(el => el.scrollIntoView({ block: "center" }));
            await star.click({ delay: 20 });
            summary.starsPicked++;
            console.log("â­ Clicked 5th star");
            await sleep(150);
          }
        }

        didSomething = true;
      }

      // --- GRID SELECTION ---
      const gridMeta = await page.evaluate((gridQuestionTexts, cajunRiceChance) => {
        const map = window.__surveyQuestionMap || {};
        const cssEscape = (value) =>
          (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
        const resolveContainer = (text) => {
          const meta = map[text];
          if (meta?.testId) {
            const el = document.querySelector(`[data-testid="${cssEscape(meta.testId)}"]`);
            if (el) return el;
          }
          if (meta?.ariaLabel) {
            const el = document.querySelector(`[aria-label="${cssEscape(meta.ariaLabel)}"]`);
            if (el) return el;
          }
          if (meta?.id) {
            const el = document.getElementById(meta.id);
            if (el) return el;
          }
          return null;
        };

        const containers = gridQuestionTexts
          .map(resolveContainer)
          .filter(Boolean);

        const textNodes = window.__surveyTextCache || Array.from(
          document.querySelectorAll("div, p, h1, h2, h3, label, span")
        );
        const questionEls = containers.length > 0
          ? containers
          : textNodes.filter(el =>
            gridQuestionTexts.some(text => el.textContent?.trim().startsWith(text))
          );

        for (const questionEl of questionEls) {
          const container = questionEl.matches?.("[data-question-type='single-choice']")
            ? questionEl
            : questionEl?.closest("[data-question-type='single-choice']") ||
              questionEl?.closest("section, form, div") ||
              questionEl?.parentElement;

          if (!container) continue;

          container
            .querySelectorAll("div.sc-efBctP.izbzVo")
            .forEach(el => el.setAttribute("data-skip-grid", "1"));
        }

        const otherEntrees = Array.from(
          document.querySelectorAll("div.sc-efBctP.izbzVo")
        ).filter(el => el.textContent?.trim() === "Other Entrees");
        otherEntrees.forEach(el => el.setAttribute("data-skip-grid", "1"));

        const allowCajunRice = Math.random() < cajunRiceChance;
        if (!allowCajunRice) {
          const cajunRiceOptions = Array.from(
            document.querySelectorAll("div.sc-efBctP.izbzVo")
          ).filter(el => el.textContent?.trim().toLowerCase() === "cajun rice");
          cajunRiceOptions.forEach(el => el.setAttribute("data-skip-grid", "1"));
        }

        const competitorOptions = Array.from(
          document.querySelectorAll("div.sc-efBctP.izbzVo")
        );
        const hasCompetitors = competitorOptions.some(el =>
          ["Chick-fil-a", "Zaxby's", "Bojangles"].includes(el.textContent?.trim())
        );

        if (hasCompetitors) {
          competitorOptions
            .filter(el =>
              ["Zaxby's", "Bojangles"].includes(el.textContent?.trim())
            )
            .forEach(el => el.setAttribute("data-skip-grid", "1"));
          return { min: 1, max: 5 };
        }

        const menuQuestionMeta = map["Which of the following menu items did you order"];
        const menuQuestion =
          (menuQuestionMeta?.testId &&
            document.querySelector(`[data-testid="${cssEscape(menuQuestionMeta.testId)}"]`)) ||
          (menuQuestionMeta?.ariaLabel &&
            document.querySelector(`[aria-label="${cssEscape(menuQuestionMeta.ariaLabel)}"]`)) ||
          (menuQuestionMeta?.id && document.getElementById(menuQuestionMeta.id)) ||
          textNodes.find(el =>
            el.textContent?.trim().startsWith(
              "Which of the following menu items did you order"
            )
          );

        if (menuQuestion) {
          return { min: 1, max: 4 };
        }

        return { min: 1, max: 1 };
      }, GRID_QUESTION_TEXTS, CAJUN_RICE_PICK_CHANCE);
      const gridItems = await page.$$("div.sc-efBctP.izbzVo:not([data-skip-grid='1'])");
      if (gridItems.length > 0) {
        console.log("Selecting grid items...");
        const maxAllowed = Math.min(gridItems.length, gridMeta.max);
        const minAllowed = Math.min(maxAllowed, gridMeta.min);
        const totalToSelect = randInt(minAllowed, maxAllowed);
        const indices = shuffleInPlace([...Array(gridItems.length).keys()])
          .slice(0, totalToSelect);

        for (const i of indices) {
          const item = gridItems[i];
          if (item) {
            await item.click({ delay: 20 });
            await sleep(300);
          }
        }

        summary.gridPicked += indices.length;
        await takeScreenshot(page, `grid-picked-${iteration}`);
        didSomething = true;
      }

      // --- NO THANK YOU (GOOGLE REVIEW PROMPT) ---
      const noThanksClicked = await page.evaluate(() => {
        const targetText = "No, thank you";
        const el = Array.from(document.querySelectorAll("button, div, span, a"))
          .find(node => node.textContent?.trim() === targetText);
        if (!el) return false;
        if (el.offsetParent === null) return false;
        el.click();
        return true;
      });

      if (noThanksClicked) {
        console.log("dY% Clicked: No, thank you");
        summary.noThanksClicked++;
        await takeScreenshot(page, `no-thanks-${iteration}`);
        didSomething = true;
      }

      // --- CONTINUE ---
      try {
        const ready = await isReadyToContinue(page);
        if (!ready) {
          await waitForReadyToContinue(page, 3000);
          continue;
        }
        await withRetry(() => clickContinue(page), "clickContinue");
        summary.pagesVisited = iteration;
      } catch {
        if (!didSomething) more = false;
      }
    }

    await takeScreenshot(page, "survey-complete");
    console.log("INFO Summary:", JSON.stringify(summary));
    console.log("ðŸŽ‰ Survey automation finished!");
  } catch (err) {
    console.error("âŒ Automation error:", err.message);
    await takeScreenshot(page, "fatal-error");
  }

  await browser.close();
  activeBrowser = null;
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
  const envRuns = parsePositiveInt(process.env.RUNS || "", 1);
  const batchMin = parsePositiveInt(process.env.RUN_BATCH_MIN || "", 1);
  const batchMax = parsePositiveInt(process.env.RUN_BATCH_MAX || "", 1);
  return {
    runs: runs ?? envRuns,
    delayMs,
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
  const defaultBatchMin = args.batchMin ?? 2;
  const defaultBatchMax = Math.max(args.batchMax ?? 3, defaultBatchMin);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const runs = await promptNumber(rl, `Runs? [${defaultRuns}]: `, defaultRuns, 1);
  const delayMs = await promptNumber(
    rl,
    `Delay between runs in ms? [${defaultDelay}]: `,
    defaultDelay,
    MIN_RUN_DELAY_MS
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
  return { runs, delayMs, batchMin, batchMax };
}

async function runMultiple() {
  if (AUTO_GIT_UPDATE) {
    console.log("dY>> Auto git sync before runs...");
    runGitUpdate("startup");
  }
  const { runs, delayMs, batchMin, batchMax } = await getRunConfig();
  let remaining = runs;
  let runIndex = 1;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, randInt(batchMin, batchMax));
    console.log(`dY>> Starting batch (${batchSize} run${batchSize === 1 ? "" : "s"})`);
    for (let i = 0; i < batchSize; i++) {
      console.log(`dY>> Starting run ${runIndex} of ${runs}`);
      try {
        await connectNordVpn();
        await runSurvey();
      } finally {
        disconnectNordVpn();
      }
      runIndex += 1;
      remaining -= 1;
    }
    if (remaining > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

runMultiple();
