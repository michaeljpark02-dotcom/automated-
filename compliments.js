"use strict";

const TARGET_COUNT = 720;
const MAX_COMPLIMENT_LENGTH = 160;
const LENGTH_BANDS = Object.freeze({
  short: { max: 80, ratio: 0.4 },
  medium: { max: 120, ratio: 0.4 },
  long: { max: MAX_COMPLIMENT_LENGTH, ratio: 0.2 }
});
const MIN_POOL_SIZE = 300;
const SYNONYM_RATE = 0.12;
const EXCLAMATION_RATE = 0.06;
const COMMA_RATE = 0.06;
const CONNECTOR_RATE = 0.03;
const LOWERCASE_RATE = 0.04;
const STEM_LIMITS = new Map([
  ["kept things moving", 12],
  ["made the visit easy", 10],
  ["felt easy", 10],
  ["smooth", 24],
  ["hot and fresh", 12],
  ["alexander", 2],
  ["michael", 2],
  ["henry", 2]
]);
const SERVICE_KEYWORDS = [
  "drive-thru",
  "drive thru",
  "counter",
  "line",
  "service",
  "pickup",
  "window"
];
const NEGATION_REGEX = /\b(but|though|however|although|except|yet)\b/i;
const TODAY_REGEX = /\btoday\b/i;
const ORDER_TYPE_KEYWORDS = {
  dineIn: [
    "dine-in",
    "dining room",
    "lobby",
    "tables",
    "chairs",
    "restrooms",
    "condiment station",
    "counter area"
  ],
  pickup: [
    "pickup",
    "curbside",
    "pickup shelf",
    "pickup area",
    "mobile pickup"
  ],
  driveThru: [
    "drive-thru",
    "drive thru",
    "window line",
    "window"
  ]
};
const STAFF_NAMES = [
  "Alexander",
  "Michael",
  "Henry"
];
const CONNECTORS = [
  "Also,",
  "Plus,",
  "On top of that,",
  "Additionally,"
];
const SERVICE_PACE_PHRASES = [
  "moved quickly",
  "kept a steady pace",
  "stayed smooth",
  "ran smoothly",
  "was quick without feeling rushed",
  "kept the line moving",
  "handled the rush well",
  "no bottlenecks"
];
const SYNONYM_PAIRS = [
  ["quick", "fast"],
  ["smooth", "steady"],
  ["friendly", "welcoming"],
  ["calm", "composed"],
  ["tasty", "flavorful"]
];
const SEMANTIC_PATTERNS = [
  {
    key: "service-pace",
    regex: /^The .+ (moved quickly|kept a steady pace|stayed smooth|ran smoothly|was quick without feeling rushed|kept the line moving|handled the rush well|no bottlenecks)\.$/,
    limit: 8
  },
  {
    key: "service-pace-loved",
    regex: /^Loved how the .+ (moved quickly|kept a steady pace|stayed smooth|ran smoothly|was quick without feeling rushed|kept the line moving|handled the rush well|no bottlenecks)\.$/,
    limit: 6
  },
  {
    key: "service-pace-noticed",
    regex: /^Noticed the .+ (moved quickly|kept a steady pace|stayed smooth|ran smoothly|was quick without feeling rushed|kept the line moving|handled the rush well|no bottlenecks)\.$/,
    limit: 6
  },
  {
    key: "service-pace-time",
    regex: /^During (lunch|the rush|dinner time), the .+ (moved quickly|kept a steady pace|stayed smooth|ran smoothly|was quick without feeling rushed|kept the line moving|handled the rush well|no bottlenecks)\.$/,
    limit: 8
  },
  {
    key: "food-quality",
    regex: /^The .+ (was|were) (hot and fresh|crispy and not greasy|seasoned just right|warm and satisfying|cooked perfectly|served hot|not overcooked|nice and juicy|well seasoned)\.$/,
    limit: 12
  },
  {
    key: "food-loved",
    regex: /^Loved the .+; (it|they) (was|were) (hot and fresh|crispy and not greasy|seasoned just right|warm and satisfying|cooked perfectly|served hot|not overcooked|nice and juicy|well seasoned)\.$/,
    limit: 8
  }
];
const NGRAM_LIMIT_PROFILES = [
  { two: 1, three: 1 },
  { two: 2, three: 2 },
  { two: 3, three: 3 }
];
const SEED_ROTATION_DAYS = (() => {
  const raw = parseInt(process.env.COMPLIMENT_SEED_ROTATION_DAYS || "7", 10);
  if (Number.isNaN(raw) || raw <= 0) return 7;
  return raw;
})();

function capitalizeFirst(value) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function lowercaseFirst(value) {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PLURAL_VERB_FIXES = [
  "biscuits",
  "fries",
  "cajun fries",
  "nuggets",
  "tenders",
  "chicken tenders",
  "chicken pieces",
  "mashed potatoes",
  "red beans and rice",
  "popcorn shrimp",
  "wings"
];

function normalizeComplimentText(text) {
  if (!text) return text;
  let output = text;
  const pluralPattern = new RegExp(
    `\\b(${PLURAL_VERB_FIXES.map(escapeRegex).join("|")})\\s+was\\b`,
    "gi"
  );
  output = output.replace(pluralPattern, (_, item) => `${item} were`);
  return output;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getSeedEpochKey() {
  const override = process.env.COMPLIMENT_SEED_EPOCH;
  if (override && override.trim()) return override.trim();
  const bucketMs = SEED_ROTATION_DAYS * 24 * 60 * 60 * 1000;
  return `bucket-${Math.floor(Date.now() / bucketMs)}`;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const QUALITY_GATE_RULES = [
  /\b(?:was|were)\s+(?:tasted|hit the spot)\b/i,
  /\b(?:also|plus|additionally|on top of that),\s*[a-z]/,
  /,\s*,/,
  /\.\s*\./
];

function hasWordRun(text, maxRun = 3) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      run += 1;
      if (run >= maxRun) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

function passesQualityGate(text) {
  if (!text) return false;
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/^[^a-zA-Z0-9]+$/.test(normalized)) return false;
  if (hasWordRun(normalized, 3)) return false;
  return QUALITY_GATE_RULES.every(rule => !rule.test(normalized));
}

function shuffleArray(list, rng) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function replaceWord(text, from, to) {
  const regex = new RegExp(`\\b${from}\\b`, "i");
  if (!regex.test(text)) return null;
  return text.replace(regex, match => (
    match[0] === match[0].toUpperCase()
      ? capitalizeFirst(to)
      : to
  ));
}

function swapOneSynonym(text, rng) {
  const options = [];
  for (const [a, b] of SYNONYM_PAIRS) {
    if (new RegExp(`\\b${a}\\b`, "i").test(text)) options.push({ from: a, to: b });
    if (new RegExp(`\\b${b}\\b`, "i").test(text)) options.push({ from: b, to: a });
  }
  if (options.length === 0) return null;
  const choice = options[Math.floor(rng() * options.length)];
  return replaceWord(text, choice.from, choice.to);
}

function maybeSynonymize(text, rng) {
  if (rng() >= SYNONYM_RATE) return null;
  return swapOneSynonym(text, rng);
}

function maybePunctuate(text, rng) {
  const roll = rng();
  if (roll < EXCLAMATION_RATE) {
    if (text.endsWith(".")) return `${text.slice(0, -1)}!`;
    return `${text}!`;
  }
  if (roll < EXCLAMATION_RATE + COMMA_RATE) {
    if (text.includes(" and ") && !text.includes(",")) {
      return text.replace(" and ", ", and ");
    }
  }
  return null;
}

function maybeLowercase(text, rng) {
  if (rng() >= LOWERCASE_RATE) return null;
  if (!text) return null;
  const lower = text.toLowerCase();
  return lower === text ? null : lower;
}

function maybeConnector(text, rng) {
  if (rng() >= CONNECTOR_RATE) return null;
  if (CONNECTORS.some(connector => text.startsWith(connector))) return null;
  const sentenceMatch = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (!sentenceMatch) return null;
  const connector = CONNECTORS[Math.floor(rng() * CONNECTORS.length)];
  const firstSentence = sentenceMatch[1];
  const secondSentence = sentenceMatch[2];
  if (CONNECTORS.some(conn => secondSentence.startsWith(conn))) return null;
  return `${firstSentence} ${connector} ${lowercaseFirst(secondSentence)}`;
}

function generateVariants(text, rng) {
  const variants = [];
  const synonymized = maybeSynonymize(text, rng);
  if (synonymized && synonymized !== text) variants.push(synonymized);
  const punctuated = maybePunctuate(text, rng);
  if (punctuated && punctuated !== text) variants.push(punctuated);
  const lowercased = maybeLowercase(text, rng);
  if (lowercased && lowercased !== text) variants.push(lowercased);
  if (synonymized) {
    const punctuatedSynonym = maybePunctuate(synonymized, rng);
    if (punctuatedSynonym && punctuatedSynonym !== synonymized) {
      variants.push(punctuatedSynonym);
    }
    const lowercasedSynonym = maybeLowercase(synonymized, rng);
    if (lowercasedSynonym && lowercasedSynonym !== synonymized) {
      variants.push(lowercasedSynonym);
    }
  }
  return variants;
}

function extractStemHits(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const [stem] of STEM_LIMITS) {
    if (lower.includes(stem)) hits.push(stem);
  }
  return hits;
}

function extractSemanticHits(text) {
  const hits = [];
  for (const pattern of SEMANTIC_PATTERNS) {
    if (pattern.regex.test(text)) hits.push(pattern.key);
  }
  const lower = text.toLowerCase();
  for (const phrase of SERVICE_PACE_PHRASES) {
    if (lower.includes(phrase)) hits.push(`service-pace:${phrase}`);
  }
  return hits;
}

function isServiceLike(text) {
  const lower = text.toLowerCase();
  return SERVICE_KEYWORDS.some(keyword => lower.includes(keyword));
}

function containsKeyword(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(keyword => lower.includes(keyword));
}

function isPickupLike(text) {
  return containsKeyword(text, ORDER_TYPE_KEYWORDS.pickup);
}

function isDineInLike(text) {
  return containsKeyword(text, ORDER_TYPE_KEYWORDS.dineIn);
}

function canUseCompliment(text, stemCounts, semanticCounts) {
  if (!text || text.length > MAX_COMPLIMENT_LENGTH) return false;
  if (!passesQualityGate(text)) return false;
  const hits = extractStemHits(text);
  for (const stem of hits) {
    const limit = STEM_LIMITS.get(stem);
    const current = stemCounts.get(stem) || 0;
    if (limit !== undefined && current >= limit) return false;
  }
  const semanticHits = extractSemanticHits(text);
  for (const key of semanticHits) {
    const pattern = SEMANTIC_PATTERNS.find(item => item.key === key);
    if (pattern) {
      const current = semanticCounts.get(key) || 0;
      if (current >= pattern.limit) return false;
      continue;
    }
    if (key.startsWith("service-pace:")) {
      const current = semanticCounts.get(key) || 0;
      if (current >= 10) return false;
    }
  }
  return true;
}

function registerStemHits(text, stemCounts) {
  for (const stem of extractStemHits(text)) {
    stemCounts.set(stem, (stemCounts.get(stem) || 0) + 1);
  }
}

function registerSemanticHits(text, semanticCounts) {
  for (const key of extractSemanticHits(text)) {
    semanticCounts.set(key, (semanticCounts.get(key) || 0) + 1);
  }
}

function buildComplimentsForTone(shortSentences, seedSuffix) {
  const rng = mulberry32(hashString(`compliments-v4-${seedSuffix}-${getSeedEpochKey()}`));
  const compliments = new Set();
  const stemCounts = new Map();
  const semanticCounts = new Map();

  const serviceSentences = shuffleArray(buildServiceSentences(), rng);
  const staffSentences = shuffleArray(buildStaffSentences(), rng);
  const foodSentences = shuffleArray(buildFoodSentences(), rng);
  const cleanlinessSentences = shuffleArray(buildCleanlinessSentences(), rng);
  const accuracySentences = shuffleArray(buildAccuracySentences(), rng);
  const atmosphereSentences = shuffleArray(buildAtmosphereSentences(), rng);
  const valueSentences = shuffleArray(buildValueSentences(), rng);
  const pickupSentences = shuffleArray(buildPickupSentences(), rng);
  const shuffledShort = shuffleArray(shortSentences, rng);
  const rareSentences = shuffleArray(buildRareSentences(), rng);
  const brandSentences = shuffleArray(buildBrandSentences(), rng);
  const namedStaffSentences = shuffleArray(buildNamedStaffSentences(), rng);

  addSome(compliments, serviceSentences, 25, stemCounts, semanticCounts, rng);
  addSome(compliments, staffSentences, 25, stemCounts, semanticCounts, rng);
  addSome(compliments, foodSentences, 35, stemCounts, semanticCounts, rng);
  addSome(compliments, cleanlinessSentences, 20, stemCounts, semanticCounts, rng);
  addSome(compliments, accuracySentences, 20, stemCounts, semanticCounts, rng);
  addSome(compliments, atmosphereSentences, 20, stemCounts, semanticCounts, rng);
  addSome(compliments, valueSentences, 15, stemCounts, semanticCounts, rng);
  addSome(compliments, pickupSentences, 15, stemCounts, semanticCounts, rng);
  addSome(compliments, shuffledShort, 25, stemCounts, semanticCounts, rng);
  addSome(compliments, rareSentences, 8, stemCounts, semanticCounts, rng);
  addSome(compliments, brandSentences, 6, stemCounts, semanticCounts, rng);
  addSome(compliments, namedStaffSentences, 2, stemCounts, semanticCounts, rng);

  const pairings = [
    [serviceSentences, foodSentences],
    [staffSentences, foodSentences],
    [cleanlinessSentences, foodSentences],
    [serviceSentences, accuracySentences],
    [staffSentences, accuracySentences],
    [atmosphereSentences, foodSentences],
    [valueSentences, foodSentences],
    [pickupSentences, foodSentences],
    [serviceSentences, staffSentences],
    [cleanlinessSentences, atmosphereSentences],
    [serviceSentences, valueSentences],
    [pickupSentences, accuracySentences],
    [shuffledShort, foodSentences],
    [shuffledShort, staffSentences],
    [shuffledShort, serviceSentences]
  ];

  for (const [first, second] of pairings) {
    addPairings(compliments, first, second, TARGET_COUNT, stemCounts, semanticCounts, rng);
    if (compliments.size >= TARGET_COUNT) break;
  }

  const final = Array.from(compliments);
  const selected = selectWithLengthBands(final, rng);
  if (selected.length < TARGET_COUNT) {
    throw new Error(`Not enough unique compliments (${selected.length}).`);
  }
  return shuffleArray(selected.slice(0, TARGET_COUNT), rng);
}

function buildCompliments() {
  const byTone = buildComplimentsByTone();
  return byTone.any;
}

function addSome(set, list, max, stemCounts, semanticCounts, rng) {
  for (let i = 0; i < list.length && i < max; i++) {
    addIfValid(set, list[i], stemCounts, semanticCounts, rng);
  }
}

function addPairings(set, firstList, secondList, targetCount, stemCounts, semanticCounts, rng) {
  const secondLen = secondList.length;
  if (secondLen === 0) return;
  for (let i = 0; i < firstList.length && set.size < targetCount; i++) {
    const first = firstList[i];
    for (let j = 0; j < secondLen && set.size < targetCount; j += 3) {
      const second = secondList[(i * 7 + j) % secondLen];
      if (isServiceLike(first) && isServiceLike(second)) continue;
      if (isPickupLike(first) && isDineInLike(second)) continue;
      if (isDineInLike(first) && isPickupLike(second)) continue;
      addIfValid(set, combinePairingSentences(first, second, rng), stemCounts, semanticCounts, rng);
    }
  }
}

function stripTerminalPunctuation(text) {
  if (!text) return "";
  return text.replace(/[.!?]+$/, "");
}

function combinePairingSentences(first, second, rng) {
  if (!rng || rng() < 0.6) return `${first} ${second}`;
  const firstCore = stripTerminalPunctuation(first);
  const secondCore = stripTerminalPunctuation(second);
  if (!firstCore || !secondCore) return `${first} ${second}`;
  const firstHasVerb = /\b(is|are|was|were|be|been|being|feels?|felt|keeps?|kept|moves?|moved|runs?|ran|stays?|stayed|handles?|handled|looks?|looked|smells?|smelled|comes?|came|makes?|made|had|has|have)\b/i
    .test(firstCore);
  if (!firstHasVerb) return `${first} ${second}`;
  return `${firstCore}, and ${lowercaseFirst(secondCore)}.`;
}

function addIfValidBase(set, text, stemCounts, semanticCounts) {
  if (set.has(text)) return false;
  if (!canUseCompliment(text, stemCounts, semanticCounts)) return false;
  set.add(text);
  registerStemHits(text, stemCounts);
  registerSemanticHits(text, semanticCounts);
  return true;
}

function addIfValid(set, text, stemCounts, semanticCounts, rng) {
  const normalized = normalizeComplimentText(text);
  addIfValidBase(set, normalized, stemCounts, semanticCounts);
  if (!rng) return;
  const variants = generateVariants(normalized, rng);
  for (const variant of variants) {
    addIfValidBase(set, normalizeComplimentText(variant), stemCounts, semanticCounts);
  }
}

function lengthBandFor(text) {
  const len = text.length;
  if (len <= LENGTH_BANDS.short.max) return "short";
  if (len <= LENGTH_BANDS.medium.max) return "medium";
  return "long";
}

function buildBandTargets() {
  const shortTarget = Math.round(TARGET_COUNT * LENGTH_BANDS.short.ratio);
  const mediumTarget = Math.round(TARGET_COUNT * LENGTH_BANDS.medium.ratio);
  const longTarget = TARGET_COUNT - shortTarget - mediumTarget;
  return { short: shortTarget, medium: mediumTarget, long: longTarget };
}

function tokenizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function extractNgrams(tokens, size) {
  const grams = [];
  for (let i = 0; i <= tokens.length - size; i++) {
    grams.push(tokens.slice(i, i + size).join(" "));
  }
  return grams;
}

function canUseNgrams(text, ngramCounts, limits) {
  const tokens = tokenizeWords(text);
  const twos = extractNgrams(tokens, 2);
  const threes = extractNgrams(tokens, 3);
  for (const gram of twos) {
    const count = ngramCounts.get(gram) || 0;
    if (count >= limits.two) return false;
  }
  for (const gram of threes) {
    const count = ngramCounts.get(gram) || 0;
    if (count >= limits.three) return false;
  }
  return true;
}

function registerNgrams(text, ngramCounts) {
  const tokens = tokenizeWords(text);
  for (const gram of extractNgrams(tokens, 2)) {
    ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1);
  }
  for (const gram of extractNgrams(tokens, 3)) {
    ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1);
  }
}

function selectWithLengthBands(candidates, rng) {
  const bands = { short: [], medium: [], long: [] };
  for (const text of candidates) {
    bands[lengthBandFor(text)].push(text);
  }

  const targets = buildBandTargets();
  for (const limits of NGRAM_LIMIT_PROFILES) {
    const attempt = pickFromBands(bands, targets, rng, limits);
    if (attempt.length >= TARGET_COUNT) return attempt;
  }

  return pickFromBands(bands, targets, rng, { two: Infinity, three: Infinity });
}

function pickFromBands(bands, targets, rng, ngramLimits) {
  const selected = [];
  const selectedSet = new Set();
  const bandCounts = { short: 0, medium: 0, long: 0 };
  const ngramCounts = new Map();

  const bandOrder = ["short", "medium", "long"];
  for (const band of bandOrder) {
    const pool = shuffleArray(bands[band], rng);
    for (const text of pool) {
      if (bandCounts[band] >= targets[band]) break;
      if (selectedSet.has(text)) continue;
      if (!canUseNgrams(text, ngramCounts, ngramLimits)) continue;
      selected.push(text);
      selectedSet.add(text);
      bandCounts[band]++;
      registerNgrams(text, ngramCounts);
    }
  }

  if (selected.length < TARGET_COUNT) {
    const remaining = [];
    for (const band of bandOrder) {
      for (const text of bands[band]) {
        if (!selectedSet.has(text)) remaining.push(text);
      }
    }
    const shuffledRemaining = shuffleArray(remaining, rng);
    for (const text of shuffledRemaining) {
      if (selected.length >= TARGET_COUNT) break;
      if (!canUseNgrams(text, ngramCounts, ngramLimits)) continue;
      selected.push(text);
      selectedSet.add(text);
      registerNgrams(text, ngramCounts);
    }
  }

  return selected;
}

function buildServiceSentences() {
  const results = new Set();
  const targets = [
    "drive-thru line",
    "counter line",
    "counter service",
    "dine-in service",
    "pickup service",
    "window line",
    "front counter service",
    "drive-thru window",
    "mobile pickup",
    "curbside pickup",
    "pickup counter",
    "lobby line"
  ];
  const timeTargets = new Set([
    "drive-thru line",
    "counter line",
    "pickup service"
  ]);
  const paces = [
    "moved quickly",
    "kept a steady pace",
    "stayed smooth",
    "ran smoothly",
    "was quick without feeling rushed",
    "kept the line moving",
    "handled the rush well",
    "no bottlenecks"
  ];
  const quickHitStarters = [
    "Fast",
    "Smooth",
    "Quick",
    "Easy",
    "No delay",
    "Quick turnaround",
    "In and out",
    "Steady",
    "Well-paced"
  ];
  const times = [
    "lunch",
    "the rush",
    "dinner time"
  ];
  const outcomes = [
    "The handoff was quick and clear.",
    "The pickup handoff was smooth and easy to follow.",
    "The drive-thru speaker was clear and easy to hear.",
    "The order callout was clear.",
    "The counter line was managed well.",
    "The drive-thru window kept things organized."
  ];

  for (const target of targets) {
    for (const pace of paces) {
      results.add(`The ${target} ${pace}.`);
      results.add(`Loved how the ${target} ${pace}.`);
      results.add(`Noticed the ${target} ${pace}.`);
      results.add(`Appreciated how the ${target} ${pace}.`);
      results.add(`Stopped by and the ${target} ${pace}.`);
      results.add(`Came in and the ${target} ${pace}.`);
      results.add(`${capitalizeFirst(target)} kept moving.`);
      results.add(`No bottlenecks at the ${target}.`);
      if (timeTargets.has(target)) {
        for (const time of times) {
          results.add(`During ${time}, the ${target} ${pace}.`);
        }
      }
    }
    for (const starter of quickHitStarters) {
      results.add(`${starter} ${target}.`);
      results.add(`${starter} ${target} today.`);
    }
    results.add(`Stopped by and ${target} was easy to handle.`);
    results.add(`Came in and ${target} was easy to handle.`);
  }

  for (const outcome of outcomes) {
    results.add(outcome);
  }

  return Array.from(results);
}

function buildStaffSentences() {
  const results = new Set();
  const pluralStaff = [
    "staff",
    "crew",
    "team",
    "window staff",
    "front counter team",
    "dining room staff",
    "pickup team",
    "kitchen team"
  ];
  const singularStaff = [
    "cashier",
    "manager",
    "window attendant",
    "counter attendant",
    "shift lead"
  ];
  const traits = [
    "friendly",
    "polite",
    "patient",
    "helpful",
    "upbeat",
    "focused",
    "kind",
    "professional",
    "attentive",
    "courteous",
    "efficient"
  ];
  const actions = [
    "greeted me with a smile",
    "answered my questions",
    "kept things organized",
    "handled the rush well",
    "made the visit easy",
    "kept the line moving",
    "checked that everything was correct",
    "made sure I had what I needed",
    "kept things moving without rushing",
    "called out orders clearly",
    "double-checked the bag",
    "made pickup easy",
    "kept the handoff smooth",
    "confirmed the order before I left",
    "moved the line along smoothly",
    "kept the pace steady",
    "pointed me to the pickup shelf",
    "checked in to make sure everything was right",
    "checked in without hovering",
    "handled a quick request without fuss",
    "explained the wait time clearly",
    "made sure sauces were included",
    "kept the counter area flowing",
    "stayed calm and friendly",
    "flagged my order before I asked",
    "noticed I was waiting and checked in"
  ];

  for (const staff of pluralStaff) {
    for (const trait of traits) {
      results.add(`The ${staff} were ${trait}.`);
      results.add(`The ${staff} felt ${trait} today.`);
    }
    for (const action of actions) {
      results.add(`The ${staff} ${action}.`);
      results.add(`It was nice that the ${staff} ${action}.`);
      results.add(`Quick thanks to the ${staff} who ${action}.`);
      results.add(`Glad the ${staff} ${action}.`);
      results.add(`Felt easy to ask the ${staff} a question.`);
      results.add(`The ${staff} made it easy to ask a question.`);
      results.add(`The ${staff} helped without hovering.`);
    }
  }

  for (const staff of singularStaff) {
    for (const trait of traits) {
      results.add(`The ${staff} was ${trait}.`);
      results.add(`The ${staff} felt ${trait} today.`);
    }
    for (const action of actions) {
      results.add(`The ${staff} ${action}.`);
      results.add(`Glad the ${staff} ${action}.`);
      results.add(`It was easy to ask the ${staff} a question.`);
      results.add(`The ${staff} helped without hovering.`);
    }
  }

  return Array.from(results);
}

function buildFoodSentences() {
  const results = new Set();
  const pluralItems = new Set([
    "boneless wings",
    "tenders",
    "classic tenders",
    "spicy tenders",
    "fries",
    "cajun fries",
    "chicken pieces",
    "biscuits",
    "mashed potatoes",
    "red beans and rice",
    "chicken tenders",
    "wings",
    "bbq wings",
    "signature hot wings",
    "sweet and spicy wings"
  ]);
  const hotItems = [
    "spicy chicken sandwich",
    "classic chicken sandwich",
    "chicken sandwich combo",
    "ghost pepper sandwich",
    "bone-in chicken",
    "signature chicken",
    "boneless wings",
    "tenders",
    "classic tenders",
    "spicy tenders",
    "chicken tenders",
    "blackened tenders",
    "biscuits",
    "fries",
    "cajun fries",
    "wings",
    "bbq wings",
    "signature hot wings",
    "sweet and spicy wings",
    "red beans and rice",
    "coleslaw",
    "mashed potatoes",
    "mac and cheese",
    "chicken pieces",
    "apple pie",
    "strawberry pie",
    "chicken family bundle"
  ];
  const drinkItems = [
    "sweet tea",
    "lemonade",
    "unsweet tea"
  ];
  const itemQualities = new Map([
    ["spicy chicken sandwich", ["hot and fresh", "well seasoned", "cooked perfectly", "hot and well seasoned"]],
    ["classic chicken sandwich", ["hot and fresh", "well seasoned", "cooked perfectly", "nicely seasoned"]],
    ["chicken sandwich combo", ["hot and fresh", "well seasoned", "cooked perfectly", "hot and well seasoned"]],
    ["ghost pepper sandwich", ["hot and fresh", "spicy and well seasoned", "cooked perfectly"]],
    ["bone-in chicken", ["hot and fresh", "juicy and flavorful", "well seasoned", "cooked perfectly", "crispy and hot"]],
    ["signature chicken", ["hot and fresh", "juicy and flavorful", "well seasoned", "cooked perfectly", "crispy and hot"]],
    ["boneless wings", ["crispy and hot", "tender and juicy", "well seasoned", "hot and fresh", "crispy and not greasy"]],
    ["wings", ["crispy and flavorful", "hot and fresh", "well seasoned", "crispy and hot"]],
    ["bbq wings", ["saucy and flavorful", "hot and fresh", "well seasoned", "tender and juicy"]],
    ["signature hot wings", ["spicy and well seasoned", "hot and fresh", "crispy and hot"]],
    ["sweet and spicy wings", ["sweet and spicy", "well seasoned", "hot and fresh"]],
    ["tenders", ["crispy and not greasy", "tender and juicy", "hot and fresh", "well seasoned", "crispy and hot"]],
    ["classic tenders", ["crispy and not greasy", "tender and juicy", "hot and fresh", "well seasoned", "crispy and hot"]],
    ["spicy tenders", ["crispy and not greasy", "spicy and well seasoned", "hot and fresh", "tender and juicy"]],
    ["chicken tenders", ["crispy and not greasy", "tender and juicy", "hot and fresh", "well seasoned", "crispy and hot"]],
    ["blackened tenders", ["well seasoned", "tender and juicy", "hot and fresh", "nicely seasoned"]],
    ["chicken pieces", ["hot and fresh", "juicy and flavorful", "well seasoned", "cooked perfectly", "crispy and hot"]],
    ["fries", ["crispy and not greasy", "crisp and hot", "well seasoned", "hot and fresh", "not too greasy", "fresh and hot"]],
    ["cajun fries", ["crispy and not greasy", "crisp and hot", "spicy and well seasoned", "hot and fresh", "not too greasy", "boldly seasoned"]],
    ["biscuits", ["warm and buttery", "soft and warm", "flaky and warm", "fresh and warm", "warm and soft"]],
    ["coleslaw", ["cool and crisp", "fresh and crisp", "crisp and fresh", "cool and fresh"]],
    ["mac and cheese", ["creamy and hot", "cheesy and warm", "rich and creamy", "creamy and warm"]],
    ["mashed potatoes", ["smooth and warm", "creamy and warm", "well seasoned", "hot and fresh", "smooth and creamy"]],
    ["red beans and rice", ["hearty and warm", "well seasoned", "hot and fresh", "hearty and hot"]],
    ["apple pie", ["warm and flaky", "crisp and hot", "fresh and warm", "warm and sweet"]],
    ["strawberry pie", ["warm and sweet", "fresh and warm", "warm and flaky"]],
    ["chicken family bundle", ["hot and fresh", "well seasoned", "filling and satisfying"]]
  ]);
  const itemShortQualities = new Map([
    ["fries", ["hot", "crispy", "well seasoned", "fresh", "salty"]],
    ["cajun fries", ["hot", "crispy", "well seasoned", "fresh", "spicy"]],
    ["tenders", ["crispy", "tender", "hot", "fresh", "well seasoned"]],
    ["classic tenders", ["crispy", "tender", "hot", "fresh", "well seasoned"]],
    ["spicy tenders", ["crispy", "tender", "hot", "fresh", "spicy"]],
    ["chicken tenders", ["crispy", "tender", "hot", "fresh", "well seasoned"]],
    ["boneless wings", ["crispy", "hot", "fresh", "flavorful"]],
    ["wings", ["crispy", "hot", "fresh", "flavorful"]],
    ["bbq wings", ["hot", "saucy", "fresh", "flavorful"]],
    ["signature hot wings", ["hot", "spicy", "fresh", "flavorful"]],
    ["sweet and spicy wings", ["hot", "sweet", "spicy", "fresh"]],
    ["biscuits", ["warm", "soft", "fresh", "buttery"]],
    ["mac and cheese", ["creamy", "hot", "cheesy", "rich"]],
    ["mashed potatoes", ["warm", "smooth", "creamy", "well seasoned"]],
    ["red beans and rice", ["warm", "hearty", "well seasoned", "fresh"]],
    ["coleslaw", ["cool", "crisp", "fresh", "light"]],
    ["apple pie", ["warm", "crisp", "fresh", "sweet"]],
    ["strawberry pie", ["warm", "sweet", "fresh", "flaky"]],
    ["spicy chicken sandwich", ["hot", "flavorful", "fresh", "well seasoned"]],
    ["classic chicken sandwich", ["hot", "flavorful", "fresh", "well seasoned"]],
    ["chicken sandwich combo", ["hot", "flavorful", "fresh", "well seasoned"]],
    ["ghost pepper sandwich", ["hot", "flavorful", "fresh", "spicy"]],
    ["bone-in chicken", ["hot", "juicy", "fresh", "well seasoned"]],
    ["signature chicken", ["hot", "juicy", "fresh", "well seasoned"]],
    ["blackened tenders", ["hot", "tender", "fresh", "well seasoned"]],
    ["chicken pieces", ["hot", "juicy", "fresh", "well seasoned"]],
    ["chicken family bundle", ["hot", "fresh", "filling", "well seasoned"]]
  ]);
  const drinkQualities = [
    "cold and refreshing",
    "fresh and crisp",
    "not too sweet",
    "just the right sweetness",
    "nice and cold",
    "really refreshing",
    "cold and smooth",
    "refreshing and crisp",
    "cool and smooth",
    "crisp and refreshing"
  ];
  const extras = [
    "The batter was crispy without being greasy.",
    "The chicken was juicy and flavorful.",
    "The sandwich held together and was not messy.",
    "The fries were seasoned just right.",
    "The biscuits were flaky and warm.",
    "The sweet tea tasted fresh and not flat.",
    "The lemonade was cold and refreshing.",
    "The coleslaw was crisp and fresh.",
    "The red beans and rice tasted hearty.",
    "The gravy was smooth and warm.",
    "The sides hit the spot.",
    "The meal tasted made to order.",
    "The food smelled great on the way home.",
    "The food still felt hot when I sat down.",
    "The sandwich held its crunch.",
    "The sides were still warm by the time I got to the table.",
    "The spicy sandwich had a solid kick.",
    "The boneless wings were crisp and tender.",
    "The tenders were cooked perfectly.",
    "The combo was a satisfying meal.",
    "The chicken was hot and fresh.",
    "The sandwich had great flavor.",
    "The fries stayed crisp on the drive home.",
    "The sandwich was hot and held up well.",
    "The sides were portioned nicely.",
    "The breading was light and crispy.",
    "The mac and cheese was creamy and hot.",
    "The mashed potatoes were smooth and warm.",
    "The biscuits tasted buttery and fresh.",
    "The sandwich had a great crunch.",
    "The apple pie was warm and flaky.",
    "The wings were crispy and flavorful.",
    "The blackened tenders had great seasoning.",
    "The ghost pepper sandwich had a nice kick.",
    "The bbq wings were saucy and flavorful.",
    "The sweet and spicy wings had great flavor.",
    "The signature hot wings were hot and fresh.",
    "The strawberry pie was sweet and warm.",
    "The family bundle was hot and ready to go."
  ];
  const itemGrammar = item => (
    pluralItems.has(item)
      ? { verb: "were", pronoun: "they" }
      : { verb: "was", pronoun: "it" }
  );
  const getQualities = item => itemQualities.get(item);
  const getShortQualities = item => itemShortQualities.get(item);

  for (const item of hotItems) {
    const qualities = getQualities(item);
    const shortQualities = getShortQualities(item);
    if (!qualities || !shortQualities) continue;
    for (const quality of qualities) {
      const { verb, pronoun } = itemGrammar(item);
      results.add(`The ${item} ${verb} ${quality}.`);
      results.add(`My ${item} ${verb} ${quality}.`);
      results.add(`Enjoyed the ${item}; ${pronoun} ${verb} ${quality}.`);
      results.add(`The ${item} came out ${quality}.`);
      results.add(`${capitalizeFirst(item)} ${verb} ${quality}.`);
      results.add(`Glad the ${item} ${verb} ${quality}.`);
    }
    for (const quality of shortQualities) {
      const { verb } = itemGrammar(item);
      results.add(`${capitalizeFirst(item)} ${verb} ${quality}.`);
      results.add(`${capitalizeFirst(item)} hit the spot.`);
    }
    results.add(`Went with the ${item} and it hit the spot.`);
    results.add(`The ${item} held up well in the bag.`);
  }

  for (const item of drinkItems) {
    for (const quality of drinkQualities) {
      results.add(`The ${item} was ${quality}.`);
      results.add(`Loved the ${item}; it was ${quality}.`);
      results.add(`My ${item} was ${quality}.`);
      results.add(`The ${item} came out ${quality}.`);
      results.add(`Enjoyed the ${item}; it was ${quality}.`);
      results.add(`${capitalizeFirst(item)} was ${quality}.`);
      results.add(`Glad the ${item} was ${quality}.`);
    }
    for (const quality of drinkQualities) {
      results.add(`${capitalizeFirst(item)} was ${quality} today.`);
    }
  }

  for (const extra of extras) {
    results.add(extra);
  }

  return Array.from(results);
}

function buildCleanlinessSentences() {
  const results = new Set();
  const singularAreas = [
    "dining room",
    "lobby",
    "pickup shelf",
    "condiment station",
    "front door",
    "counter area",
    "ordering area"
  ];
  const singularStates = [
    "clean and tidy",
    "well kept",
    "neat and organized",
    "comfortable and clean",
    "fresh and bright",
    "tidy and welcoming",
    "clean and inviting",
    "fresh and tidy"
  ];
  const pluralAreas = [
    "tables",
    "floors",
    "trash bins",
    "chairs",
    "windows",
    "restrooms",
    "high chairs"
  ];
  const pluralStates = [
    "clean",
    "wiped down",
    "spotless",
    "well kept",
    "not sticky",
    "stocked and clean",
    "freshly cleaned",
    "neat and orderly"
  ];
  const extras = [
    "The floor was dry and not slippery.",
    "The dining room felt clean and comfortable.",
    "The lobby smelled clean.",
    "The tables were still clean even with a few people.",
    "The pickup shelf area was neat and uncluttered.",
    "The front door and windows looked clean.",
    "The store looked tidy and welcoming.",
    "The counter area looked clean and ready.",
    "The dining room looked neat and organized.",
    "The restrooms smelled clean.",
    "The lobby looked bright and clean.",
    "The tables looked freshly wiped down.",
    "The trash bins weren't overflowing.",
    "The condiment station looked stocked and orderly.",
    "The floors looked recently mopped.",
    "The dining room felt calm and orderly.",
    "The lobby felt tidy without feeling sterile."
  ];

  for (const area of singularAreas) {
    for (const state of singularStates) {
      results.add(`The ${area} was ${state}.`);
      results.add(`Noticed the ${area} was ${state}.`);
      results.add(`The ${area} looked ${state}.`);
      results.add(`Glad the ${area} was ${state}.`);
    }
    results.add(`Clean ${area}.`);
  }

  for (const area of pluralAreas) {
    for (const state of pluralStates) {
      results.add(`The ${area} were ${state}.`);
      results.add(`Noticed the ${area} were ${state}.`);
      results.add(`The ${area} looked ${state}.`);
      results.add(`Glad the ${area} were ${state}.`);
    }
    results.add(`Clean ${area}.`);
  }

  for (const extra of extras) {
    results.add(extra);
  }

  return Array.from(results);
}

function buildAccuracySentences() {
  const sentences = [
    "My order was correct.",
    "Everything was exactly as requested.",
    "They got my order right the first time.",
    "The order matched the receipt.",
    "They repeated my order to confirm it.",
    "They followed my no-pickles request.",
    "They honored my extra sauce request.",
    "Sauces were included in the bag.",
    "The order was packed neatly.",
    "The utensils were included.",
    "The food was packaged carefully.",
    "They split the order into two bags for easy carry.",
    "The kids meal was separated from the spicy items.",
    "The app order matched exactly.",
    "My payment was quick and easy.",
    "They counted my change correctly.",
    "The order number was called clearly.",
    "Pickup was ready when I arrived.",
    "The pickup shelf had my name spelled right.",
    "Everything was bagged correctly.",
    "Nothing was missing.",
    "The special request was handled perfectly.",
    "They double-checked the order before handing it over.",
    "The receipt was accurate.",
    "The order came out right the first time.",
    "They separated hot items from cold ones.",
    "The order was ready on time.",
    "The staff confirmed the order before closing the bag.",
    "My order was checked and accurate.",
    "The order was called out clearly.",
    "Order accuracy was on point.",
    "No issues with my order.",
    "Everything in the bag matched what I asked for.",
    "They got everything right on my order.",
    "The order was accurate and complete.",
    "Order details were handled perfectly.",
    "Everything was packed just how I asked.",
    "The bag was packed neatly and correctly.",
    "They verified the order before handing it over.",
    "Everything was packed neatly and secure.",
    "They read back the order and it was correct.",
    "My add-ons were included in the bag.",
    "The sauces were packed correctly.",
    "The order was packed with care.",
    "The drinks were sealed and secure.",
    "My name was on the bag.",
    "The order name was called clearly.",
    "The bags were labeled clearly.",
    "The bag was sealed properly.",
    "The receipt matched what I ordered.",
    "They asked if I needed anything else.",
    "They repeated my order before handing it over.",
    "My sauces were packed correctly.",
    "Everything was separated neatly in the bag.",
    "The hot items were kept separate.",
    "The extras I asked for were included.",
    "The order was packed carefully and cleanly.",
    "Everything came together smoothly.",
    "The handoff was clear and quick.",
    "The handoff was smooth and simple.",
    "The order came together without issues.",
    "The pickup handoff felt organized.",
    "Everything was ready and easy to grab.",
    "Everything matched what I expected.",
    "No surprises with the order.",
    "The bag matched what we talked through.",
    "The order was packed the way I asked.",
    "No back-and-forth on the order.",
    "It all matched without me checking twice.",
    "Everything lined up with what I expected."
  ];

  return sentences;
}

function buildAtmosphereSentences() {
  const sentences = [
    "The lobby felt calm and welcoming.",
    "The dining room felt cozy and clean.",
    "The store had a welcoming vibe.",
    "The music was low and pleasant.",
    "The lighting was bright and comfortable.",
    "The vibe was relaxed today.",
    "It felt easy from start to finish.",
    "The space felt organized even while busy.",
    "The dining room felt comfortable.",
    "The store felt safe and well kept.",
    "The atmosphere was friendly.",
    "The lobby stayed quiet and comfortable.",
    "The dining room felt fresh and tidy.",
    "The store felt clean and inviting.",
    "The vibe was calm and steady.",
    "The dining area was pleasant.",
    "The lobby felt relaxed and open.",
    "The dining room felt bright and airy.",
    "The store looked sharp and organized.",
    "The atmosphere was easygoing.",
    "The place felt relaxed and comfortable.",
    "The dining area felt calm and tidy.",
    "Everything felt smooth and low-stress.",
    "The space felt open and easy to navigate.",
    "The overall vibe felt friendly.",
    "The lobby felt light and comfortable.",
    "The dining area felt neat and orderly.",
    "The store felt calm even with some traffic.",
    "The space felt clean and welcoming.",
    "The dining room felt airy and relaxed.",
    "The lobby felt bright and open.",
    "The atmosphere felt calm and welcoming.",
    "The space felt comfortable and tidy.",
    "The dining area felt peaceful.",
    "The vibe felt easy and inviting.",
    "The seating felt comfortable.",
    "The seating area was tidy.",
    "The lighting was soft and easy on the eyes.",
    "The music level was just right.",
    "The music sat at a comfortable level.",
    "The flow inside felt smooth.",
    "The dining area had a calm flow.",
    "The space felt airy and open.",
    "The room felt bright and comfortable.",
    "The dining area felt relaxed and open.",
    "The music wasn't too loud.",
    "The lighting made the menu easy to read.",
    "It felt comfortable to sit and eat there.",
    "The dining room felt spaced out and easy to move through.",
    "The room felt calm even with a few people inside.",
    "The lobby felt easy to move through.",
    "The seating felt spaced out and comfortable."
  ];

  return sentences;
}

function buildValueSentences() {
  const sentences = [
    "Portion sizes felt fair for the price.",
    "Good value for the meal.",
    "The combo was a good value.",
    "The meal was filling for the cost.",
    "Portions were generous.",
    "Worth the price today.",
    "Great value for a filling meal.",
    "The portions felt just right.",
    "Solid value and good portions.",
    "The meal felt like a good deal.",
    "Fair price for what I got.",
    "Good portions and a fair price.",
    "The value was on point.",
    "The combo felt like a deal.",
    "Portions were satisfying.",
    "Price felt fair for what I got.",
    "Felt like a good deal for the portion size.",
    "Great portions for the cost.",
    "Solid value today.",
    "Great deal for the price.",
    "Worth it for the portions.",
    "The value matched the portion size.",
    "Good deal for the amount of food.",
    "Solid portions for the price.",
    "The price felt right for what I got.",
    "The meal felt worth the cost.",
    "Great value for the portion size."
  ];

  return sentences;
}

function buildPickupSentences() {
  const sentences = [
    "Pickup was ready on time.",
    "The pickup area was easy to use.",
    "Mobile pickup was smooth and quick.",
    "The pickup shelf was organized.",
    "The order was waiting when I arrived.",
    "Curbside pickup was easy.",
    "Pickup was fast and hassle-free.",
    "The pickup spot was clearly marked.",
    "Easy in-and-out pickup today.",
    "The pickup shelf was easy to find.",
    "The pickup process was simple.",
    "Pickup felt organized and quick.",
    "Order was ready right when I got there.",
    "The pickup flow was smooth.",
    "Pickup was quick and convenient.",
    "The pickup handoff was easy.",
    "Grabbed my order fast and went.",
    "Pickup felt effortless today.",
    "Pickup was smooth from start to finish.",
    "Easy pickup today.",
    "Quick pickup, no hassle.",
    "Pickup went smoothly.",
    "The pickup handoff was quick and clear.",
    "Pickup moved along without any issues.",
    "Pickup was easy and well organized.",
    "The pickup area was clean and simple to navigate.",
    "The pickup handoff was smooth and quick.",
    "Mobile pickup was ready when I arrived."
  ];

  return sentences;
}

function buildShortSentencesByTone() {
  const casual = [
    "Fast service.",
    "Quick and easy stop.",
    "No issues at all.",
    "Everything felt smooth.",
    "Great experience today.",
    "Easy in and out.",
    "Nice, quick visit.",
    "Smooth stop.",
    "Staff was on it.",
    "Order was spot on.",
    "Food came out hot.",
    "Great food today.",
    "No stress, no fuss.",
    "Good vibes all around.",
    "Drive-thru was quick.",
    "Easy pickup experience.",
    "Solid visit today.",
    "Quick service and hot food.",
    "Fast, friendly stop.",
    "Easy visit today.",
    "Great experience this morning.",
    "Great experience this afternoon.",
    "Great experience this evening.",
    "Stopped by and it was easy.",
    "Pulled up and things moved fast.",
    "Came in for a quick bite and it was smooth.",
    "Quick handoff.",
    "Order called clearly.",
    "Food was still hot when I sat down."
  ];
  const neutral = [
    "Smooth visit overall.",
    "Fast, friendly service.",
    "Short wait time.",
    "Solid service today.",
    "Friendly vibe inside.",
    "Everything was fresh.",
    "Clean and welcoming.",
    "Quick turnaround.",
    "Fast and organized.",
    "Happy with the visit.",
    "Service stayed steady.",
    "Fast counter service.",
    "Good value today.",
    "Efficient visit overall.",
    "Service was well paced.",
    "Order was ready quickly.",
    "Smooth visit this morning.",
    "Smooth visit this afternoon.",
    "Smooth visit this evening.",
    "Stopped by and the service stayed steady.",
    "Came in and the visit was easy.",
    "Pulled up and everything flowed smoothly.",
    "Easy order handoff.",
    "Everything lined up without a second check."
  ];
  const formal = [
    "Service was efficient.",
    "The visit was smooth and quick.",
    "Staff were attentive.",
    "The order was prepared promptly.",
    "The experience was pleasant.",
    "The visit was well organized.",
    "Everything was handled well.",
    "The service pace was steady.",
    "The dining area felt welcoming.",
    "The visit was well paced.",
    "The service was prompt and courteous.",
    "The visit was calm and efficient.",
    "Stopped by and service was well organized.",
    "Came in and everything was handled smoothly.",
    "Pulled up and the service remained steady."
  ];

  return { casual, neutral, formal };
}

function buildShortSentences() {
  const { casual, neutral, formal } = buildShortSentencesByTone();
  return interleaveLists([casual, neutral, formal]);
}

function buildRareSentences() {
  return [
    "Service ran like clockwork today.",
    "Everything flowed smoothly from start to finish.",
    "The pace felt polished and professional.",
    "A quick, seamless stop.",
    "Everything lined up perfectly.",
    "Really impressed by how coordinated the team was.",
    "The visit felt effortless.",
    "It was a clean, tidy, and calm stop.",
    "Order accuracy was flawless.",
    "The meal and service were both excellent.",
    "The team kept things steady and calm.",
    "This was a standout visit.",
    "Everything felt dialed in.",
    "The visit felt easy and well managed.",
    "The whole experience felt polished."
  ];
}

function buildBrandSentences() {
  return [
    "Popeyes service was fast today.",
    "Popeyes had the order ready quickly.",
    "Popeyes handled the rush well.",
    "Popeyes was clean and welcoming.",
    "Popeyes staff were friendly.",
    "Great visit at Popeyes today.",
    "Popeyes made it quick and easy.",
    "Food from Popeyes was hot and fresh.",
    "Popeyes kept things moving smoothly."
  ];
}

function buildNamedStaffSentences() {
  const lines = [];
  for (const name of STAFF_NAMES) {
    lines.push(`Shoutout to ${name} for being helpful.`);
    lines.push(`${name} handled my order with care.`);
  }
  return lines;
}

function interleaveLists(lists) {
  const result = [];
  const maxLen = Math.max(...lists.map(list => list.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (list[i]) result.push(list[i]);
    }
  }
  return result;
}

function isSameDay(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  return dateStr === todayStr;
}

function filterByOrderType(list, orderType) {
  if (!orderType || typeof orderType !== "string") return list;
  const normalized = orderType.toLowerCase();
  let keywords = [];
  if (normalized.includes("dine")) {
    keywords = ORDER_TYPE_KEYWORDS.dineIn;
  } else if (normalized.includes("takeout") || normalized.includes("pickup")) {
    keywords = ORDER_TYPE_KEYWORDS.pickup.concat(ORDER_TYPE_KEYWORDS.driveThru);
  } else if (normalized.includes("delivery")) {
    return list;
  }
  if (keywords.length === 0) return list;
  const filtered = list.filter(text => {
    const lower = text.toLowerCase();
    return keywords.some(keyword => lower.includes(keyword));
  });
  return filtered.length >= Math.floor(MIN_POOL_SIZE / 2) ? filtered : list;
}

function applySoftFilters(list, visitDate) {
  let filtered = list.filter(text => !NEGATION_REGEX.test(text));
  if (visitDate && !isSameDay(visitDate)) {
    filtered = filtered.filter(text => !TODAY_REGEX.test(text));
  }
  return filtered.length >= MIN_POOL_SIZE ? filtered : list;
}

function applyTimeAlignmentFilters(list, timeValue) {
  const tone = getVisitTone(timeValue);
  if (tone === "any") return list;
  const blockers = {
    morning: [
      /\btonight\b/i,
      /\blate tonight\b/i,
      /\bat dinner time\b/i,
      /\bthis afternoon\b/i
    ],
    afternoon: [
      /\bthis morning\b/i,
      /\btonight\b/i,
      /\blate tonight\b/i,
      /\bat dinner time\b/i
    ],
    evening: [
      /\bthis morning\b/i,
      /\bthis afternoon\b/i,
      /\bduring lunch\b/i
    ],
    night: [
      /\bthis morning\b/i,
      /\bthis afternoon\b/i,
      /\bduring lunch\b/i
    ]
  };
  const active = blockers[tone] || [];
  if (active.length === 0) return list;
  const filtered = list.filter(text => active.every(re => !re.test(text)));
  return filtered.length >= MIN_POOL_SIZE ? filtered : list;
}

function getVisitTone(timeValue) {
  if (!timeValue || typeof timeValue !== "string") return "any";
  const match = timeValue.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return "any";
  let hour = parseInt(match[1], 10);
  const meridiem = match[3].toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function buildComplimentsByTone() {
  const tones = buildShortSentencesByTone();
  return {
    morning: buildComplimentsForTone(tones.formal, "morning"),
    afternoon: buildComplimentsForTone(tones.neutral, "afternoon"),
    evening: buildComplimentsForTone(tones.casual, "evening"),
    night: buildComplimentsForTone(tones.neutral, "night"),
    any: buildComplimentsForTone(buildShortSentences(), "any")
  };
}

const complimentsByTone = buildComplimentsByTone();

function getComplimentPoolForTime(timeValue) {
  const tone = getVisitTone(timeValue);
  return complimentsByTone[tone] || complimentsByTone.any;
}

function getComplimentPoolForVisit({ time, date, orderType, toneOverride } = {}) {
  const tone = toneOverride || getVisitTone(time);
  const base = complimentsByTone[tone] || complimentsByTone.any;
  const softened = applySoftFilters(base, date);
  const timeAligned = applyTimeAlignmentFilters(softened, time);
  const orderFiltered = filterByOrderType(timeAligned, orderType);
  return orderFiltered.length >= MIN_POOL_SIZE ? orderFiltered : timeAligned;
}

module.exports = {
  compliments: buildCompliments(),
  complimentsByTone,
  getVisitTone,
  getComplimentPoolForTime,
  getComplimentPoolForVisit
};
