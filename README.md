# Popeyes Survey Bot

Automates the Popeyes survey flow using Puppeteer with human-like delays and
simple randomness. The script opens a real browser, fills the survey, and
clicks through common question types (dropdowns, checkboxes, grid items, star
ratings, emoji rows, and free-text feedback).

## Requirements
- Node.js 18+ (Puppeteer compatible)

## Setup
1) Install dependencies:
   - `npm install`
2) Run:
   - `node index.js`

## How it works
- Launches a Chromium instance via Puppeteer.
- Navigates to the survey URL and fills the store id, date/time, and total.
- Steps through pages, looking for visible questions and answering them:
  - Dropdowns (Ant Design selects) pick weighted options.
  - Likelihood questions choose a "Likely" option when present.
  - Menu item grids and follow-ups select a small random subset.
  - Star ratings click the highest star.
  - Text areas get a compliment that avoids repeats across runs.
- Screenshots are saved as the script progresses (unless disabled).

## Configuration (optional)
Set environment variables to override defaults:
- `SURVEY_URL` - survey URL to visit
- `STORE_ID` - store/receipt store number
- `ORDER_TOTAL` - override order total (e.g. `12.34`)
- `HEADLESS` - set to `1`/`true` to run headless
- `USER_AGENT` - custom user agent string
- `PROXY` - proxy server URL (e.g. `http://127.0.0.1:8888`)
- `CHROME_PATH` - path to Chrome executable (defaults to common Windows paths, plus `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS)
- `RETRY_ATTEMPTS` - retries for navigation/continue
- `RETRY_DELAY_MS` - delay between retries in ms
- `RUNS` - number of runs to execute
- `RUN_DELAY_MS` - delay between runs in ms
- `BLOCK_ASSETS` - set to `0` to load images/fonts/media
- `NO_SCREENSHOTS` - set to `1` to disable screenshots
- `VERBOSE_SCREENSHOTS` - set to `1` to capture page loop screenshots
- `FULLPAGE_SCREENSHOTS` - set to `1` for full-page shots
- `SCREENSHOT_THROTTLE_MS` - minimum ms between screenshots
- `INPUT_DELAY_EXTRA_MS` - add extra typing delay
- `AUTO_GIT_UPDATE` - set to `1` to auto pull/commit/push used compliments
- `AUTO_GIT_REMOTE` - git remote name (default `origin`)
- `AUTO_GIT_BRANCH` - git branch name (default `main`)
- `AUTO_GIT_MESSAGE` - commit message for auto updates
- `AUTO_GIT_DELAY_MS` - delay before auto git update (default `1200`)
- `AUTO_GIT_FILES` - comma-separated files to stage (default `used-compliments.json,compliments.js`)

## Run controls
The script prompts for run count and delay between runs unless you provide:
- `RUNS` - number of runs to execute
- `RUN_DELAY_MS` - delay between runs in ms (minimum 60000)
- `--runs <n>` - CLI override for run count

## Files
- `index.js` - main automation logic
- `compliments.js` - list of compliment strings
- `used-compliments.json` - persistence store to avoid repeats
- `screenshots/` - output folder for screenshots

## Troubleshooting
- If the survey UI changes, adjust selectors in `index.js`.
- If you see hangs between pages, increase `RETRY_ATTEMPTS` and `RETRY_DELAY_MS`.
- If the browser opens and closes too quickly, run with `HEADLESS=0` to watch.

### Example (PowerShell)
```powershell
$env:SURVEY_URL="https://example.com/survey"
$env:STORE_ID="12345"
$env:ORDER_TOTAL="12.34"
$env:HEADLESS="1"
$env:RETRY_ATTEMPTS="3"
$env:RETRY_DELAY_MS="2000"
node index.js
```

## Notes
- Screenshots are saved to `screenshots/` unless disabled.
- The bot will prompt for run count and delay if not provided.
- Auto git updates require `git` and saved credentials for the remote.
- When `AUTO_GIT_UPDATE=1`, the script pulls before starting runs to sync compliments.
