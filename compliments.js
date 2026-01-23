"use strict";

const TARGET_COUNT = 720;
const MAX_COMPLIMENT_LENGTH = 160;
const LENGTH_BANDS = Object.freeze({
  short: { max: 80, ratio: 0.4 },
  medium: { max: 120, ratio: 0.4 },
  long: { max: MAX_COMPLIMENT_LENGTH, ratio: 0.2 }
});
const MIN_POOL_SIZE = 300;
const SYNONYM_RATE = 0.18;
const EXCLAMATION_RATE = 0.06;
const COMMA_RATE = 0.08;
const CONNECTOR_RATE = 0.05;
const STEM_LIMITS = new Map([
  ["kept things moving", 12],
  ["made the visit easy", 10],
  ["felt easy", 10],
  ["smooth", 24],
  ["hot and fresh", 12]
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
  "Alex",
  "Alexander",
  "Michael",
  "Henry"
];
const CONNECTORS = [
  "Also,",
  "Plus,",
  "On top of that,"
];
const SERVICE_PACE_PHRASES = [
  "moved quickly",
  "kept a steady pace",
  "stayed smooth",
  "ran efficiently",
  "kept things moving",
  "was quick without feeling rushed",
  "was fast and organized",
  "kept the flow steady"
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
    regex: /^The .+ (moved quickly|kept a steady pace|stayed smooth|ran efficiently|kept things moving|was quick without feeling rushed|was fast and organized|kept the flow steady)\.$/,
    limit: 8
  },
  {
    key: "service-pace-loved",
    regex: /^Loved how the .+ (moved quickly|kept a steady pace|stayed smooth|ran efficiently|kept things moving|was quick without feeling rushed|was fast and organized|kept the flow steady)\.$/,
    limit: 6
  },
  {
    key: "service-pace-noticed",
    regex: /^Noticed the .+ (moved quickly|kept a steady pace|stayed smooth|ran efficiently|kept things moving|was quick without feeling rushed|was fast and organized|kept the flow steady)\.$/,
    limit: 6
  },
  {
    key: "service-pace-time",
    regex: /^The .+ (moved quickly|kept a steady pace|stayed smooth|ran efficiently|kept things moving|was quick without feeling rushed|was fast and organized|kept the flow steady) (with a line|during lunch|this afternoon|today|during the rush|at dinner time)\.$/,
    limit: 8
  },
  {
    key: "food-quality",
    regex: /^The .+ (was|were) (hot and fresh|crispy and not greasy|seasoned just right|warm and satisfying|cooked perfectly|tasty and filling|fresh out of the fryer|full of flavor|served at a great temperature|not overcooked|nice and juicy)\.$/,
    limit: 12
  },
  {
    key: "food-loved",
    regex: /^Loved the .+; (it|they) (was|were) (hot and fresh|crispy and not greasy|seasoned just right|warm and satisfying|cooked perfectly|tasty and filling|fresh out of the fryer|full of flavor|served at a great temperature|not overcooked|nice and juicy)\.$/,
    limit: 8
  }
];
const NGRAM_LIMIT_PROFILES = [
  { two: 2, three: 1 },
  { two: 3, three: 2 },
  { two: 4, three: 3 }
];

function capitalizeFirst(value) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function generateVariants(text, rng) {
  const variants = [];
  const synonymized = maybeSynonymize(text, rng);
  if (synonymized && synonymized !== text) variants.push(synonymized);
  const punctuated = maybePunctuate(text, rng);
  if (punctuated && punctuated !== text) variants.push(punctuated);
  if (synonymized) {
    const punctuatedSynonym = maybePunctuate(synonymized, rng);
    if (punctuatedSynonym && punctuatedSynonym !== synonymized) {
      variants.push(punctuatedSynonym);
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
  const hits = extractStemHits(text);
  for (const stem of hits) {
    const limit = STEM_LIMITS.get(stem);
    const current = stemCounts.get(stem) || 0;
    if (limit !== undefined && current >= limit) return false;
  }
  const semanticHits = extractSemanticHits(text);
  for (const key of semanticHits) {
    const pattern = SEMANTIC_PATTERNS.find(item => item.key === key);
    if (!pattern) continue;
    const current = semanticCounts.get(key) || 0;
    if (current >= pattern.limit) return false;
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
  const rng = mulberry32(hashString(`compliments-v3-${seedSuffix}`));
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
      addIfValid(set, `${first} ${second}`, stemCounts, semanticCounts, rng);
    }
  }
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
  addIfValidBase(set, text, stemCounts, semanticCounts);
  if (!rng) return;
  const variants = generateVariants(text, rng);
  for (const variant of variants) {
    addIfValidBase(set, variant, stemCounts, semanticCounts);
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
    "front counter service"
  ];
  const paces = [
    "moved quickly",
    "kept a steady pace",
    "stayed smooth",
    "ran efficiently",
    "kept things moving",
    "was quick without feeling rushed",
    "was fast and organized",
    "kept the flow steady"
  ];
  const quickHitStarters = [
    "Fast",
    "Smooth",
    "Quick",
    "Easy",
    "Super quick",
    "Really smooth"
  ];
  const times = [
    "with a line",
    "during lunch",
    "this afternoon",
    "today",
    "during the rush",
    "at dinner time"
  ];

  for (const target of targets) {
    for (const pace of paces) {
      results.add(`The ${target} ${pace}.`);
      results.add(`Loved how the ${target} ${pace}.`);
      results.add(`Noticed the ${target} ${pace}.`);
      results.add(`Really liked that the ${target} ${pace}.`);
      results.add(`Appreciated how the ${target} ${pace}.`);
      results.add(`Quick shoutout: the ${target} ${pace}.`);
      for (const time of times) {
        results.add(`The ${target} ${pace} ${time}.`);
        results.add(`Even ${time}, the ${target} ${pace}.`);
        results.add(`${capitalizeFirst(time)}, the ${target} ${pace}.`);
      }
    }
    for (const starter of quickHitStarters) {
      results.add(`${starter} ${target}.`);
      results.add(`${starter} ${target} today.`);
    }
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
    "dining room staff"
  ];
  const singularStaff = [
    "cashier",
    "manager",
    "window attendant",
    "counter attendant"
  ];
  const traits = [
    "friendly",
    "polite",
    "patient",
    "helpful",
    "welcoming",
    "upbeat",
    "calm under pressure",
    "focused",
    "kind",
    "professional"
  ];
  const actions = [
    "greeted me with a smile",
    "answered my questions",
    "kept things organized",
    "handled the rush well",
    "made the visit easy",
    "kept the line moving",
    "checked that everything was correct",
    "made sure I had what I needed"
  ];

  for (const staff of pluralStaff) {
    for (const trait of traits) {
      results.add(`The ${staff} were ${trait}.`);
      results.add(`Really appreciated how the ${staff} were ${trait}.`);
      results.add(`The ${staff} felt ${trait} today.`);
      results.add(`Shoutout to the ${staff} for being ${trait}.`);
      results.add(`Super ${trait} ${staff}.`);
    }
    for (const action of actions) {
      results.add(`The ${staff} ${action}.`);
      results.add(`It was nice that the ${staff} ${action}.`);
      results.add(`Quick thanks to the ${staff} who ${action}.`);
    }
  }

  for (const staff of singularStaff) {
    for (const trait of traits) {
      results.add(`The ${staff} was ${trait}.`);
      results.add(`Shoutout to the ${staff} for being ${trait}.`);
      results.add(`Really appreciated the ${staff} being ${trait}.`);
    }
    for (const action of actions) {
      results.add(`The ${staff} ${action}.`);
      results.add(`Big thanks to the ${staff} who ${action}.`);
    }
  }

  return Array.from(results);
}

function buildFoodSentences() {
  const results = new Set();
  const pluralItems = new Set([
    "nuggets",
    "tenders",
    "fries",
    "cajun fries",
    "chicken pieces"
  ]);
  const hotItems = [
    "spicy chicken sandwich",
    "classic chicken sandwich",
    "chicken sandwich combo",
    "nuggets",
    "tenders",
    "biscuits",
    "fries",
    "cajun fries",
    "red beans and rice",
    "coleslaw",
    "mashed potatoes",
    "mac and cheese",
    "chicken pieces"
  ];
  const drinkItems = [
    "sweet tea",
    "lemonade"
  ];
  const hotQualities = [
    "hot and fresh",
    "crispy and not greasy",
    "seasoned just right",
    "warm and satisfying",
    "cooked perfectly",
    "tasty and filling",
    "fresh out of the fryer",
    "full of flavor",
    "served at a great temperature",
    "not overcooked",
    "nice and juicy"
  ];
  const shortQualities = [
    "hot and fresh",
    "crispy",
    "juicy",
    "flavorful",
    "perfectly cooked"
  ];
  const drinkQualities = [
    "cold and refreshing",
    "tasted fresh",
    "not too sweet",
    "just the right sweetness",
    "nice and cold",
    "hit the spot"
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
    "The spicy sandwich had a solid kick.",
    "The nuggets were crisp and tender.",
    "The tenders were cooked perfectly.",
    "The combo was a satisfying meal.",
    "The chicken was hot and fresh.",
    "The sandwich had great flavor."
  ];
  const itemGrammar = item => (
    pluralItems.has(item)
      ? { verb: "were", pronoun: "they" }
      : { verb: "was", pronoun: "it" }
  );

  for (const item of hotItems) {
    for (const quality of hotQualities) {
      const { verb, pronoun } = itemGrammar(item);
      results.add(`The ${item} ${verb} ${quality}.`);
      results.add(`Loved the ${item}; ${pronoun} ${verb} ${quality}.`);
      results.add(`My ${item} ${verb} ${quality}.`);
      results.add(`The ${item} came out ${quality}.`);
      results.add(`Really enjoyed the ${item} because ${pronoun} ${verb} ${quality}.`);
      results.add(`${capitalizeFirst(item)} ${verb} ${quality}.`);
    }
    for (const quality of shortQualities) {
      const { verb } = itemGrammar(item);
      results.add(`${capitalizeFirst(item)} ${verb} ${quality}.`);
      results.add(`Hot, ${quality} ${item}.`);
    }
  }

  for (const item of drinkItems) {
    for (const quality of drinkQualities) {
      results.add(`The ${item} was ${quality}.`);
      results.add(`Loved the ${item}; it was ${quality}.`);
      results.add(`My ${item} was ${quality}.`);
      results.add(`The ${item} came out ${quality}.`);
      results.add(`Really enjoyed the ${item} because it was ${quality}.`);
      results.add(`${capitalizeFirst(item)} was ${quality}.`);
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
    "counter area"
  ];
  const singularStates = [
    "clean and tidy",
    "well kept",
    "neat and organized",
    "comfortable and clean",
    "fresh and bright"
  ];
  const pluralAreas = [
    "tables",
    "floors",
    "trash bins",
    "chairs",
    "windows",
    "restrooms"
  ];
  const pluralStates = [
    "clean",
    "wiped down",
    "spotless",
    "well kept",
    "not sticky",
    "stocked and clean"
  ];
  const extras = [
    "The floor was dry and not slippery.",
    "The dining room felt clean and comfortable.",
    "The lobby smelled clean.",
    "The tables were still clean even with a few people.",
    "The pickup shelf area was neat and uncluttered.",
    "The front door and windows looked clean.",
    "The store looked tidy and welcoming."
  ];

  for (const area of singularAreas) {
    for (const state of singularStates) {
      results.add(`The ${area} was ${state}.`);
      results.add(`Noticed the ${area} was ${state}.`);
      results.add(`The ${area} looked ${state}.`);
      results.add(`Glad the ${area} was ${state}.`);
    }
    results.add(`Clean ${area}.`);
    results.add(`Really clean ${area}.`);
  }

  for (const area of pluralAreas) {
    for (const state of pluralStates) {
      results.add(`The ${area} were ${state}.`);
      results.add(`Noticed the ${area} were ${state}.`);
      results.add(`The ${area} looked ${state}.`);
      results.add(`Glad the ${area} were ${state}.`);
    }
    results.add(`Clean ${area}.`);
    results.add(`Really clean ${area}.`);
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
    "Everything was packed just how I asked."
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
    "The overall vibe felt friendly."
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
    "Worth it for the portions."
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
    "Pickup went smoothly."
  ];

  return sentences;
}

function buildShortSentencesByTone() {
  const casual = [
    "Super fast service.",
    "Quick and easy stop.",
    "No issues at all.",
    "Everything felt smooth.",
    "Great experience today.",
    "Easy in and out.",
    "Nice, quick visit.",
    "Really smooth stop.",
    "Staff was on it.",
    "Order was spot on.",
    "Food came out hot.",
    "Great food today.",
    "No stress, no fuss.",
    "Good vibes all around.",
    "Drive-thru was quick.",
    "Easy pickup experience."
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
    "Good value today."
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
    "The dining area felt welcoming."
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
    "This was a standout visit."
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
    "Food from Popeyes was hot and fresh."
  ];
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
  const orderFiltered = filterByOrderType(softened, orderType);
  return orderFiltered.length >= MIN_POOL_SIZE ? orderFiltered : softened;
}

module.exports = {
  compliments: buildCompliments(),
  complimentsByTone,
  getVisitTone,
  getComplimentPoolForTime,
  getComplimentPoolForVisit
};
