"use strict";

const TARGET_COUNT = 720;

function buildCompliments() {
  const compliments = new Set();

  const serviceSentences = buildServiceSentences();
  const staffSentences = buildStaffSentences();
  const foodSentences = buildFoodSentences();
  const cleanlinessSentences = buildCleanlinessSentences();
  const accuracySentences = buildAccuracySentences();
  const atmosphereSentences = buildAtmosphereSentences();
  const valueSentences = buildValueSentences();
  const pickupSentences = buildPickupSentences();

  addSome(compliments, serviceSentences, 25);
  addSome(compliments, staffSentences, 25);
  addSome(compliments, foodSentences, 35);
  addSome(compliments, cleanlinessSentences, 20);
  addSome(compliments, accuracySentences, 20);
  addSome(compliments, atmosphereSentences, 20);
  addSome(compliments, valueSentences, 15);
  addSome(compliments, pickupSentences, 15);

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
    [pickupSentences, accuracySentences]
  ];

  for (const [first, second] of pairings) {
    addPairings(compliments, first, second, TARGET_COUNT);
    if (compliments.size >= TARGET_COUNT) break;
  }

  const final = Array.from(compliments);
  if (final.length < TARGET_COUNT) {
    throw new Error(`Not enough unique compliments (${final.length}).`);
  }
  return final.slice(0, TARGET_COUNT);
}

function addSome(set, list, max) {
  for (let i = 0; i < list.length && i < max; i++) {
    set.add(list[i]);
  }
}

function addPairings(set, firstList, secondList, targetCount) {
  const secondLen = secondList.length;
  if (secondLen === 0) return;
  for (let i = 0; i < firstList.length && set.size < targetCount; i++) {
    const first = firstList[i];
    for (let j = 0; j < secondLen && set.size < targetCount; j += 3) {
      const second = secondList[(i * 7 + j) % secondLen];
      set.add(`${first} ${second}`);
    }
  }
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
    "front counter"
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
  const times = [
    "even with a line",
    "during lunch",
    "this afternoon",
    "today",
    "during the rush",
    "at dinner time"
  ];

  for (const target of targets) {
    for (const pace of paces) {
      results.add(`The ${target} ${pace}.`);
      results.add(`Loved how ${target} ${pace}.`);
      for (const time of times) {
        results.add(`The ${target} ${pace} ${time}.`);
      }
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
    }
    for (const action of actions) {
      results.add(`The ${staff} ${action}.`);
    }
  }

  for (const staff of singularStaff) {
    for (const trait of traits) {
      results.add(`The ${staff} was ${trait}.`);
      results.add(`Shoutout to the ${staff} for being ${trait}.`);
    }
    for (const action of actions) {
      results.add(`The ${staff} ${action}.`);
    }
  }

  return Array.from(results);
}

function buildFoodSentences() {
  const results = new Set();
  const items = [
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
    "sweet tea",
    "lemonade",
    "chicken pieces"
  ];
  const qualities = [
    "hot and fresh",
    "crispy and not greasy",
    "seasoned just right",
    "warm and satisfying",
    "cooked perfectly",
    "tasty and filling",
    "fresh out of the fryer",
    "full of flavor",
    "served at a great temperature",
    "packed neatly",
    "not overcooked",
    "nice and juicy"
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

  for (const item of items) {
    for (const quality of qualities) {
      results.add(`The ${item} was ${quality}.`);
      results.add(`Loved the ${item}; it was ${quality}.`);
      results.add(`My ${item} was ${quality}.`);
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
    }
  }

  for (const area of pluralAreas) {
    for (const state of pluralStates) {
      results.add(`The ${area} were ${state}.`);
    }
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
    "The order was called out clearly."
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
    "The atmosphere was easygoing."
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
    "Portions were satisfying."
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
    "Pickup was quick and convenient."
  ];

  return sentences;
}

module.exports = {
  compliments: buildCompliments()
};
