import type { Signals } from './types.ts';

// Deterministic reading of what a homeowner just wrote. No AI involved, so it is fast,
// free, testable, and cannot be talked out of its rules.

const R = {
  optOut: /\b(stop (texting|messaging|contacting|calling|sending)|quit (texting|messaging)|do not (text|contact|message|call)|don'?t (text|contact|message|call) me|unsubscribe|remove me|take me off|leave me alone|opt out)\b/,
  danger: /\b(fire|flames|smoke|gas (smell|leak)|smell(s|ing)? (of )?(gas|burn\w*)|burning smell|sparks?|sparking|electrocut\w*|electric(al)? shock|shocked|exposed wires?|live wires?|downed (power )?lines?|power lines?|injur(ed|y|ies)|hurt|bleeding|trapped|can'?t breathe)\b/,
  emergency: [
    /\b(water|rain) (is )?(pouring|streaming|coming|running|dripping|leaking) (in|through|down|into)\b/,
    /\bpouring (in|through)\b/,
    /\b(ceiling|roof) (is |has )?(collaps\w*|caving|caved|sagging|bulging|falling|fell|came down)\b/,
    /\btree (fell|came|crashed|is|landed|went) (on|through|into|in)\b/,
    /\btree (on|through) (my |the )?(roof|house|home)\b/,
    /\b(branch|limb) (through|on|in)\b/,
    /\bhole in (my |the )?(roof|ceiling)\b/,
    /\broof (is )?(gone|ripped|torn|blown|peeled|missing|open)\b/,
    /\bshingles (are )?(blowing|flying|blew|flew)\b/,
    /\b(flood(ed|ing)|standing water) (in|inside)\b/,
  ],
  activeTrue: /\b(right now|still (leaking|dripping|raining|coming)|currently|ongoing|as we speak|actively|it'?s (dripping|leaking|pouring)( right)? now)\b/,
  activeFalse: /\b(stopped|not (right )?now|not (leaking|dripping|raining)|not anymore|no longer|dried up|only (when|during) (it )?rain\w*)\b/,
  human: /\b(real person|human being|a human|speak (to|with) (someone|a person|somebody|the owner|a rep)|talk (to|with) (someone|a person|somebody|the owner|a rep)|have (someone|the owner) call|call me|give me a call|representative|manager)\b/,
  angry: /\b(scam|spam|harass\w*|ridiculous|useless|stupid|idiot|f+u+c+k\w*|sh[i1]t|damn|worst|incompetent|rude|pissed)\b/,
  legal: /\b(lawyer|attorney|sue|suing|lawsuit|legal action|bbb|better business|report you|attorney general|tcpa)\b/,
  price: /\b(how much|price|pricing|cost|costs|quote|estimate|ballpark|charge|charges|afford|expensive|cheap|free)\b/,
  insAsk1: /\b(will|would|does|do|can|could|is)\b[^.?!]{0,40}\b(insurance|claim)\b[^.?!]{0,30}\b(cover|covered|pay|approve|accept|handle|work with)\b/,
  insAsk2: /\b(work with|deal with|handle|file) (my |the )?(insurance|claim|adjuster)\b/,
  insMention: /\b(insurance|claim|adjuster|deductible|state farm|allstate|farmers|usaa|geico|progressive|liberty mutual|nationwide|travelers|american family|amfam)\b/,
  noInsurance: /\b(no insurance|don'?t have insurance|do not have insurance|out of pocket|pay (myself|ourselves|cash)|paying (myself|ourselves|cash)|cash)\b/,
  decline: /\b(not interested|no thanks|no thank you|don'?t need|do not need|no longer need|already (hired|found|got|have)|found (someone|another|a different)|went with|all set|we'?re good|i'?m good|got it (fixed|handled|taken care of)|taken care of|fixed (it )?(myself|already))\b/,
  whoIsThis: /\b(who (is|are) (this|you)|who'?s this|what company|how did you get my (number|info)|who dis)\b/,
  wrongNumber: /\b(wrong number|not (the|a) (homeowner|customer)|didn'?t call|never called|i didn'?t call)\b/,
  vendor: /\b(seo|marketing (services|agency)|website (design|ranking)|google (ranking|listing)|lead gen|we (help|offer) (roofers|contractors)|business loan|merchant)\b/,
  commercial: /\b(commercial|warehouse|apartment (complex|building)|hoa|strip mall|shopping center|office building|church|school|multi[- ]?family|property manager)\b/,
  reschedule: /\b(reschedule|change (the )?(time|day|appointment)|move (it|the appointment)|different (time|day))\b/,
  cancel: /\b(cancel|call it off|don'?t need (the )?appointment)\b/,
  supplier: /\b(your order|order (is )?ready|ready for pick ?up|pick ?up (your|the) order|delivery (window|scheduled|tomorrow|today|time)|deliver(ing)? (your|the) (shingles|materials|order)|materials (are )?(ready|in)|invoice|purchase order|account (balance|number)|past due|dumpster|roofing supply|building (supply|products)|abc supply|srs distribution|beacon roofing|allied building)\b/,
  pastClient: /\b(you (guys )?(did|installed|replaced|fixed|repaired|put on) (my|our|the) (roof|shingles)|(last|previous) (year|summer|spring|fall|winter)|a (few|couple of?) years ago|previous (job|work|customer)|past (customer|client)|(i'?m|we'?re|i am|we are) (a )?(returning|repeat) (customer|client)|used you (guys )?before|worked on (my|our) (roof|house) (before|last))\b/,
  recurring: /\b(annual|yearly|every year|maintenance (plan|contract|visit|check)|regular (inspection|maintenance)|inspect(ion)? again|again this year|like last time)\b/,
  priorJob: /\b(warranty|callback|redo|came back|same (spot|leak|area|issue)|still leaking after|after (you|your crew|your guys) (fixed|repaired|replaced|installed)|your (crew|guys) (fixed|repaired|replaced|installed))\b/,
  roof: /\b(roof|roofing|shingles?|leak\w*|drip\w*|ceiling|storm|hail|wind damage|tree|gutters?|flashing|attic|chimney|skylight|damage\w*|estimate|inspection|repairs?|replac\w+)\b/,
  existingJob: /\b(my (job|project|invoice|bill|payment|deposit|contract|install date|crew)|when (are|is) (you|the crew|they) (coming|starting|scheduled)|(our|the) (job|project) (at|on)|you (are|were) (supposed|scheduled)|status of (my|our)|schedule my (job|install|project))\b/,
  thanks: /^\s*(thanks|thank you|ok thanks|great thanks|perfect|sounds good|great|ok|okay|k|cool|awesome|got it)[.! ]*$/,
  yes: /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|please|correct|right|affirmative|y)\b/,
  no: /^\s*(no|nope|nah|not really|n)\b/,
};

const SPANISH = /\b(hola|gracias|necesito|techo|tengo|gotera\w*|por favor|buenas|quiero|ayuda|casa|agua|hablas? espa\w*|no hablo|no entiendo|buenos)\b/g;

const CARRIERS: [RegExp, string][] = [
  [/state farm/, 'State Farm'], [/allstate/, 'Allstate'], [/farmers/, 'Farmers'], [/usaa/, 'USAA'],
  [/geico/, 'GEICO'], [/progressive/, 'Progressive'], [/liberty mutual/, 'Liberty Mutual'],
  [/nationwide/, 'Nationwide'], [/travelers/, 'Travelers'], [/american family|amfam/, 'American Family'],
];

function snoozeFrom(t: string): number | null {
  if (/\bnext week\b/.test(t)) return 120;
  if (/\b(few days|couple (of )?days)\b/.test(t)) return 72;
  if (/\bweekend\b/.test(t)) return 48;
  if (/\btomorrow\b/.test(t)) return 20;
  if (/\b(later|call (me )?back|busy right now|not right now|not now|can'?t talk|at work|driving|in a meeting)\b/.test(t)) return 3;
  return null;
}

export function classify(raw: string): Signals {
  const t = raw.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const has = (re: RegExp) => re.test(t);

  let activeNow: boolean | null = null;
  if (has(R.activeFalse)) activeNow = false;
  else if (has(R.activeTrue)) activeNow = true;

  const emergencyIssue = R.emergency.some((re) => re.test(t));

  let insurance: Signals['insurance'] = null;
  if (has(R.noInsurance)) insurance = 'out_of_pocket';
  else if (has(R.insMention)) insurance = 'insurance';

  let carrier: string | null = null;
  for (const [re, name] of CARRIERS) if (re.test(t)) { carrier = name; break; }

  const spanishHits = (t.match(SPANISH) ?? []).length;
  const decline = has(R.decline);

  return {
    optOutIntent: has(R.optOut),
    danger: has(R.danger),
    emergencyIssue,
    activeNow: emergencyIssue && activeNow === null ? true : activeNow,
    wantsHuman: has(R.human),
    angry: has(R.angry),
    legal: has(R.legal),
    priceAsk: has(R.price),
    insuranceAsk: has(R.insAsk1) || has(R.insAsk2),
    insurance,
    carrier,
    decline,
    snoozeHours: decline ? null : snoozeFrom(t),
    whoIsThis: has(R.whoIsThis),
    wrongNumber: has(R.wrongNumber),
    vendorSpam: has(R.vendor),
    commercial: has(R.commercial),
    nonEnglish: spanishHits >= 2,
    yes: !decline && has(R.yes),
    no: !decline && has(R.no),
    reschedule: has(R.reschedule),
    cancel: has(R.cancel),
    thanksOnly: has(R.thanks),
    roofCue: has(R.roof),
    existingJobLike: has(R.existingJob),
    supplierLike: has(R.supplier),
    pastClientLike: has(R.pastClient),
    recurringLike: has(R.recurring),
    priorJobIssue: has(R.priorJob),
  };
}
