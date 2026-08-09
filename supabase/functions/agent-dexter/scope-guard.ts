const FREIGHT_CONTEXT = /\b(?:freight|forwarding|shipment|shipping|cargo|consignment|booking|quote|rate|carrier|customer|supplier|customs|warehouse|pallet|container|air\s?way\s?bill|bill of lading|incoterm|multideck|haulage|transport|delivery|collection|export|import|manifest|clearance|demurrage|detention)\b/i

const REQUEST_INTENT = /\b(?:can you|could you|please|give me|show me|tell me|find me|write|create|make|how (?:do|can|should|would)|what(?:'s| is)|when(?:'s| is)|where(?:'s| is)|who(?:'s| is)|recommend|suggest)\b/i
const RECIPE_TOPIC = /\b(?:recipe|cupcakes?|cakes?|cookies?|biscuits?|meal plan|cooking instructions?|baking instructions?|ingredients? for)\b/i
const SPORTS_TOPIC = /\b(?:rugby|football|soccer|cricket|tennis|golf|basketball|baseball|nfl|nba|nhl|formula\s*1|f1)\b/i
const SPORTS_FIXTURE = /\b(?:next|upcoming|fixture|match|game|kick[ -]?off|score|result|standings?|league table|playing)\b/i
const ENTERTAINMENT_TOPIC = /\b(?:movies?|films?|tv shows?|television|songs?|albums?|celebrit(?:y|ies)|horoscope|zodiac|video games?)\b/i
const ENTERTAINMENT_INTENT = /\b(?:recommend|watch|listen|play|latest|news|trivia|quiz|joke|horoscope|zodiac)\b/i
const PERSONAL_LIFESTYLE = /\b(?:dating advice|relationship advice|workout plan|fitness plan|holiday itinerary|vacation itinerary)\b/i

export function isClearlyOffTopicPrompt(prompt: string) {
  const value = prompt.trim()
  if (!value || FREIGHT_CONTEXT.test(value)) return false

  if (RECIPE_TOPIC.test(value) && REQUEST_INTENT.test(value)) return true
  if (SPORTS_TOPIC.test(value) && SPORTS_FIXTURE.test(value)) return true
  if (ENTERTAINMENT_TOPIC.test(value) && ENTERTAINMENT_INTENT.test(value)) return true
  return PERSONAL_LIFESTYLE.test(value) && REQUEST_INTENT.test(value)
}
