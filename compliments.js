"use strict";

const TARGET_COUNT = 720;

function capitalizeFirst(value) {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

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
  const shortSentences = buildShortSentences();

  addSome(compliments, serviceSentences, 25);
  addSome(compliments, staffSentences, 25);
  addSome(compliments, foodSentences, 35);
  addSome(compliments, cleanlinessSentences, 20);
  addSome(compliments, accuracySentences, 20);
  addSome(compliments, atmosphereSentences, 20);
  addSome(compliments, valueSentences, 15);
  addSome(compliments, pickupSentences, 15);
  addSome(compliments, shortSentences, 25);

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
    [shortSentences, foodSentences],
    [shortSentences, staffSentences],
    [shortSentences, serviceSentences]
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

  for (const item of hotItems) {
    for (const quality of hotQualities) {
      results.add(`The ${item} was ${quality}.`);
      results.add(`Loved the ${item}; it was ${quality}.`);
      results.add(`My ${item} was ${quality}.`);
      results.add(`The ${item} came out ${quality}.`);
      results.add(`Really enjoyed the ${item} because it was ${quality}.`);
      results.add(`${capitalizeFirst(item)} was ${quality}.`);
    }
    for (const quality of shortQualities) {
      results.add(`${capitalizeFirst(item)} was ${quality}.`);
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

function buildShortSentences() {
  return [
    "Super fast service.",
    "Smooth visit overall.",
    "Quick and easy stop.",
    "No issues at all.",
    "Everything felt smooth.",
    "Fast, friendly service.",
    "Great experience today.",
    "Short wait time.",
    "Easy in and out.",
    "Nice, quick visit.",
    "Solid service today.",
    "Really smooth stop.",
    "Friendly vibe inside.",
    "Staff was on it.",
    "Order was spot on.",
    "Food came out hot.",
    "Great food today.",
    "Everything was fresh.",
    "Clean and welcoming.",
    "No stress, no fuss.",
    "Quick turnaround.",
    "Fast and organized.",
    "Smooth from start to finish.",
    "Happy with the visit.",
    "Good vibes all around.",
    "Service stayed steady.",
    "Fast counter service.",
    "Drive-thru was quick.",
    "Easy pickup experience.",
    "Good value today."
  ];
}

module.exports = {
  compliments: buildCompliments()
};
