// Plain-English readings of a BaZi chart, built from traditional interpretations.
// Everything here is descriptive text keyed off computeChart() results; no calculations of its own
// beyond counting.

import {
  STEMS, BRANCHES, ELEMENTS, TEN_GODS, stemElement, isYang, annualPillar, analyseStrength, pillarFavour,
} from './bazi.js';

export const DM_PROFILES = [
  { image: 'a tall tree', strengths: 'principled, steady, protective, a natural leader who grows things over the long term', watch: 'stubbornness and bluntness; finding it hard to bend', tips: 'Choose long-term goals and mentor others. Practise flexibility when plans change.' },
  { image: 'flowers and vines', strengths: 'adaptable, diplomatic, persistent, good at building networks', watch: 'leaning on others too much, indecision and worry', tips: 'Build strong partnerships, trust your adaptability and set clear boundaries.' },
  { image: 'the sun', strengths: 'warm, generous, optimistic and expressive; lifts the people around you', watch: 'impatience, overcommitting and skipping the details', tips: 'Seek visible roles where your energy is seen. Finish what you start and schedule rest.' },
  { image: 'a candle flame', strengths: 'thoughtful, caring, insightful and focused', watch: 'moodiness, sensitivity to criticism and quiet burnout', tips: 'Teaching, guiding and skilled craft suit you. Protect your energy.' },
  { image: 'a mountain', strengths: 'dependable, calm, patient and trustworthy', watch: 'rigidity, slowness to change and keeping feelings inside', tips: 'Be the anchor others rely on, say what you feel, and take change in small steps.' },
  { image: 'fertile soil', strengths: 'nurturing, practical and versatile; good at supporting people and projects', watch: 'over-giving, worrying and spreading yourself thin', tips: 'Care, operations and management roles suit you. Look after yourself as well as others.' },
  { image: 'an axe or raw ore', strengths: 'decisive, loyal, brave and direct', watch: 'harshness, impulsiveness and turning everything into a contest', tips: 'You thrive under challenge. Channel it into discipline (sport, justice, engineering) and soften how you deliver hard truths.' },
  { image: 'a polished jewel', strengths: 'refined, precise and discerning; you value quality', watch: 'perfectionism, worrying about image and taking slights to heart', tips: 'Detail, design and quality work suit you. Accept “good enough” and ask for constructive feedback.' },
  { image: 'the ocean', strengths: 'intelligent, resourceful, adventurous and sociable', watch: 'restlessness, scattering your energy and overwhelming others', tips: 'Variety, travel and strategy suit you. Build routines that give your energy a channel.' },
  { image: 'rain and mist', strengths: 'intuitive, imaginative, gentle and perceptive', watch: 'secrecy, anxiety and escaping into ideas', tips: 'Research, art and counselling suit you. Turn ideas into small concrete actions.' },
];

export const GOD_DETAILS = [
  { theme: 'self-reliance and peers', plus: 'independent, loyal, works well alongside equals', minus: 'stubborn; competes with peers for the same resources', area: 'siblings, friends and colleagues' },
  { theme: 'drive and rivalry', plus: 'bold, persuasive, gets things moving', minus: 'impulsive spending, risky ventures, friction over money', area: 'competitors and partnerships' },
  { theme: 'enjoyment and creativity', plus: 'easy-going, creative, good taste, a natural teacher', minus: 'complacency and over-indulgence', area: 'hobbies, food, students and, for women traditionally, children' },
  { theme: 'talent and self-expression', plus: 'brilliant, innovative, eloquent, a performer', minus: 'rebelling against authority and saying too much', area: 'performance, innovation and, for women traditionally, children' },
  { theme: 'opportunity and enterprise', plus: 'generous, sociable, spots openings, good business sense', minus: 'speculation and spreading too thin', area: 'business, investments and, traditionally, the father' },
  { theme: 'steady, earned reward', plus: 'diligent, reliable, careful with money', minus: 'over-caution and materialism', area: 'salary, savings and, for men traditionally, the wife' },
  { theme: 'pressure and power', plus: 'courageous, decisive, at its best in a crisis', minus: 'stress, aggression and conflict', area: 'challenges, rivals and, for women traditionally, a partner' },
  { theme: 'order, status and responsibility', plus: 'responsible, fair, respected, works well within rules', minus: 'rigidity and anxiety about how you are seen', area: 'career, employers, reputation and, for women traditionally, the husband' },
  { theme: 'unusual insight', plus: 'intuitive, a specialist, drawn to research and spirituality', minus: 'aloofness, overthinking, being unconventional for its own sake', area: 'niche study and unconventional support' },
  { theme: 'support and learning', plus: 'kind, wise, studious; tends to receive help', minus: 'dependence and passivity', area: 'education, mentors, qualifications and, traditionally, the mother' },
];

export const FAMILIES = [
  { zh: '比劫', en: 'Companion', about: 'self and peers', strong: 'A strong sense of self and independence. You do best when you share credit and cooperate rather than compete.', missing: 'You may not draw much on peers for support. Building a circle of equals can steady you.' },
  { zh: '食伤', en: 'Output', about: 'expression and creativity', strong: 'Creative and expressive; you need outlets for ideas. Watch for scattering your energy.', missing: 'You may hold ideas back. Practise sharing your work and opinions.' },
  { zh: '财', en: 'Wealth', about: 'money and results', strong: 'Practical and results-driven, with a good eye for value. Watch for overworking in pursuit of money.', missing: 'Money is not a main driver for you, so budget and plan finances deliberately.' },
  { zh: '官杀', en: 'Officer', about: 'career, discipline and authority', strong: 'Disciplined and suited to structure and responsibility. Watch for pressure and self-criticism.', missing: 'A free spirit who dislikes being managed. Self-made structure and routines help.' },
  { zh: '印', en: 'Resource', about: 'learning and support', strong: 'A natural learner who tends to receive help. Watch for over-reliance and waiting for others.', missing: 'Largely self-taught. Seek out mentors and keep learning deliberately.' },
];

export const PILLAR_AREAS = {
  year: { label: 'Year pillar', area: 'your roots: family background, ancestry and how society sees you', ages: 'childhood, roughly up to 15', short: 'family and roots' },
  month: { label: 'Month pillar', area: 'parents, upbringing and your working environment', ages: 'youth, roughly 16 to 30', short: 'parents and work' },
  day: { label: 'Day pillar', area: 'you (the stem) and your closest relationship (the branch, the “spouse palace”)', ages: 'adulthood, roughly 31 to 45', short: 'yourself and close relationships' },
  hour: { label: 'Hour pillar', area: 'children, ambitions and legacy', ages: 'later life, from about 46', short: 'children and plans' },
};

export const ELEMENT_TRAITS = [
  { traits: 'growth, planning and kindness', boost: 'green, the east, spring; plants, reading and learning something new' },
  { traits: 'passion, visibility and joy', boost: 'red, the south, summer; exercise, sunshine and socialising' },
  { traits: 'stability, trust and care', boost: 'yellow and brown, the centre, late summer; routine, cooking and gardening' },
  { traits: 'structure, decisiveness and fairness', boost: 'white and gold, the west, autumn; decluttering, order and clear rules' },
  { traits: 'wisdom, flexibility and communication', boost: 'black and blue, the north, winter; rest, reflection, water and travel' },
];

export const FAVOUR_TEXT = { good: 'favourable', mixed: 'mixed', hard: 'demanding' };

const familyOf = (god) => Math.floor(god / 2);
const godLine = (g) => `${TEN_GODS[g].zh} ${TEN_GODS[g].en}: ${GOD_DETAILS[g].theme}`;

// Counts ten gods from the visible stems (except the day master) and each branch's main hidden stem.
export function familyCounts(chart) {
  const counts = [0, 0, 0, 0, 0];
  for (const p of chart.pillars) {
    if (p.missing) continue;
    if (p.key !== 'day') counts[familyOf(p.stemGod)] += 1;
    counts[familyOf(p.hidden[0].god)] += 1;
  }
  return counts;
}

// Sections of { title, intro?, items: [{ head, body }] } for the Reading tab.
export function buildReading(chart, now = new Date()) {
  const dm = chart.dayMaster;
  const el = stemElement(dm);
  const prof = DM_PROFILES[dm];
  const sections = [];

  sections.push({
    title: `You: ${STEMS[dm]} ${isYang(dm) ? 'Yang' : 'Yin'} ${ELEMENTS[el].en}`,
    intro: `Your day master is pictured as ${prof.image}. It is the centre of the chart, and every other value is read in relation to it.`,
    items: [
      { head: 'Strengths', body: `Traditionally ${prof.strengths}.` },
      { head: 'Watch for', body: `${prof.watch[0].toUpperCase()}${prof.watch.slice(1)}.` },
      { head: 'Making use of it', body: prof.tips },
    ],
  });

  const items = [];
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = chart.pillars.find((x) => x.key === key);
    const a = PILLAR_AREAS[key];
    if (p.missing) { items.push({ head: `${a.label}: unknown`, body: `Covers ${a.area}. Add a birth time to read it.` }); continue; }
    const stem = key === 'day' ? 'Its stem is you.' : `Its stem is ${godLine(p.stemGod)}.`;
    const root = p.hidden[0].god;
    const branch = key === 'day'
      ? `Its branch holds ${godLine(root)}, which colours your close relationships. At its best: ${GOD_DETAILS[root].plus}. Watch for ${GOD_DETAILS[root].minus}.`
      : `Its branch holds ${godLine(root)}.`;
    items.push({ head: `${a.label} ${p.name}`, body: `Covers ${a.area}. Life stage: ${a.ages}. ${stem} ${branch}` });
  }
  sections.push({
    title: 'What each pillar covers',
    intro: 'Each pillar stands for an area of life and a stage of it. The ten god in it tells you the theme that shows up there.',
    items,
  });

  const fam = familyCounts(chart);
  const max = Math.max(...fam);
  const famItems = [];
  fam.forEach((n, i) => {
    if (n === max && n > 0) famItems.push({ head: `Strong: ${FAMILIES[i].en} ${FAMILIES[i].zh} (${n})`, body: `About ${FAMILIES[i].about}. ${FAMILIES[i].strong}` });
  });
  fam.forEach((n, i) => {
    if (n === 0) famItems.push({ head: `Missing: ${FAMILIES[i].en} ${FAMILIES[i].zh}`, body: `About ${FAMILIES[i].about}. ${FAMILIES[i].missing}` });
  });
  sections.push({
    title: 'Your main themes',
    intro: `Ten gods group into five themes. Counting the stems and each branch's main hidden stem: ${FAMILIES.map((f, i) => `${f.en} ${fam[i]}`).join(', ')}.`,
    items: famItems,
  });

  const st = analyseStrength(chart);
  const elName = (i) => `${ELEMENTS[i].zh} ${ELEMENTS[i].en}`;
  const pct = Math.round(st.ratio * 100);
  const verdictText = st.verdict === 'balanced' ? `balanced, leaning ${st.lean}` : st.verdict;
  const yes = (b) => (b ? 'yes' : 'no');
  const REASONS = {
    companions: 'Your own element is plentiful, so the element that disciplines it helps most.',
    resource: 'You are strong mainly through support (Resource), so the element that controls that support helps most.',
    output: 'Your energy is drained mostly through Output, so the element that feeds you helps most.',
    officer: 'You are pressed mostly by Officer, so the element that feeds you (and absorbs that pressure) helps most.',
    wealth: 'You are stretched mostly by Wealth, so companions of your own element help most.',
  };
  const w = chart.weighted;
  const hi = w.indexOf(Math.max(...w));
  const lo = w.indexOf(Math.min(...w));
  sections.push({
    title: 'Strength and favourable elements',
    intro: 'Practitioners first judge whether the day master is strong or weak, then pick the elements that bring it into balance (用神). This uses one common scoring method; others can differ, especially for extreme charts.',
    items: [
      { head: `Day master: ${verdictText} (${pct}% support)`, body: `Support is your own element plus the one that produces you, weighted across all the stems and hidden stems, with the month counted double. Born in season (得令): ${yes(st.checks.season)}. Rooted in a branch (得地): ${yes(st.checks.root)}. Supporting stems (得势): ${st.checks.help}.` },
      { head: `Useful element: ${elName(st.useful)}`, body: `${REASONS[st.reason]} Traditionally you'd bring it in through ${ELEMENT_TRAITS[st.useful].boost}.` },
      { head: `Favourable: ${st.favourable.map(elName).join(', ')}`, body: `${st.lean === 'strong' ? 'A strong day master does well when its energy is used: expressed, earned and disciplined.' : 'A weaker day master does well with support: learning, mentors and allies.'} Luck pillars and years of these elements tend to feel easier.` },
      { head: `Less favourable: ${st.unfavourable.map(elName).join(', ')}`, body: 'Periods heavy in these tend to need more effort. They are not “bad”, just more demanding.' },
      { head: `Most: ${elName(hi)} · Least: ${elName(lo)}${chart.counts[lo] === 0 ? ' (missing)' : ''}`, body: `${ELEMENTS[hi].en} brings ${ELEMENT_TRAITS[hi].traits}; ${ELEMENTS[lo].en} stands for ${ELEMENT_TRAITS[lo].traits}.` },
    ],
  });

  const timing = [];
  const nowMs = now.getTime();
  const idx = nowMs < chart.luck.startMs ? -1 : Math.min(Math.floor((nowMs - chart.luck.startMs) / (365.2422 * 86400000) / 10), 9);
  if (idx >= 0) {
    const lp = chart.luck.pillars[idx];
    timing.push({
      head: `This decade: ${lp.name} (from ${lp.fromYear}), ${FAVOUR_TEXT[pillarFavour(st, lp.stem, lp.branch)]}`,
      body: `The stem brings ${godLine(lp.stemGod)}, mostly felt in the first five years. The branch brings ${godLine(lp.branchGod)}, mostly felt in the last five. At its best: ${GOD_DETAILS[lp.stemGod].plus}. Watch for ${GOD_DETAILS[lp.stemGod].minus}.`,
    });
  } else {
    timing.push({ head: 'Luck pillars', body: `Your first luck pillar starts in ${new Date(chart.luck.startMs).getUTCFullYear()}.` });
  }
  const year = now.getFullYear();
  const yp = annualPillar(year, dm);
  const clashes = chart.pillars.filter((p) => !p.missing && (p.branch - yp.branch + 12) % 12 === 6);
  timing.push({
    head: `${year}: ${yp.name}, ${FAVOUR_TEXT[pillarFavour(st, yp.stem, yp.branch)]}`,
    body: `This year brings ${godLine(yp.stemGod)}. At its best: ${GOD_DETAILS[yp.stemGod].plus}. Watch for ${GOD_DETAILS[yp.stemGod].minus}.${clashes.length
      ? ` Its branch ${BRANCHES[yp.branch]} clashes with your ${clashes.map((p) => `${PILLAR_AREAS[p.key].label.toLowerCase()} ${BRANCHES[p.branch]}`).join(' and ')}, traditionally a sign of movement or change in ${clashes.map((p) => PILLAR_AREAS[p.key].short).join(', and in ')}.`
      : ''}`,
  });
  sections.push({ title: 'Now', intro: 'Luck pillars and years add their own ten gods to your chart for a while.', items: timing });

  return sections;
}
