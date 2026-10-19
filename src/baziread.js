// Plain-English readings of a BaZi chart, built from traditional interpretations.
// Everything here is descriptive text keyed off computeChart() results; no calculations of its own
// beyond counting.

import {
  STEMS, BRANCHES, ELEMENTS, TEN_GODS, stemElement, isYang, annualPillar, analyseStrength, pillarFavour, symbolicStars,
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

// ---- Chinese text (same order and fields as the English tables above) ----------------------

export const DM_PROFILES_ZH = [
  { image: '参天大树', strengths: '正直、稳重、有担当，天生的领导者，善于长远经营', watch: '固执、说话太直，不易变通', tips: '定下长远目标，多带领和栽培他人；计划有变时练习灵活应对。' },
  { image: '花草藤蔓', strengths: '灵活、圆融、有韧性，善于建立人脉', watch: '过于依赖他人、犹豫不决、容易担忧', tips: '建立稳固的合作关系，相信自己的适应力，同时设好界限。' },
  { image: '太阳', strengths: '热情、大方、乐观、善于表达，能感染身边的人', watch: '急躁、承诺过多、忽略细节', tips: '选择能被看见的位置发挥能量；做事有始有终，记得安排休息。' },
  { image: '烛火', strengths: '细腻、体贴、有洞察力、专注', watch: '情绪起伏、对批评敏感、默默透支', tips: '适合教学、指导和讲究手艺的工作；注意保护自己的精力。' },
  { image: '高山', strengths: '可靠、沉稳、有耐心、值得信赖', watch: '固执、不易改变、把感受藏在心里', tips: '做别人可以依靠的支柱；多说出自己的感受，一步步接受改变。' },
  { image: '田园沃土', strengths: '包容、务实、多才，善于支持人和事', watch: '付出过多、容易操心、精力分散', tips: '适合照顾、运营和管理类角色；照顾别人的同时也要照顾自己。' },
  { image: '刀斧顽铁', strengths: '果断、讲义气、勇敢、直率', watch: '强硬、冲动、凡事都要争个输赢', tips: '你在挑战中成长；把这股劲用在自律上（运动、法律、工程），说重话时放软语气。' },
  { image: '珠玉首饰', strengths: '精致、细致、有眼光，重视品质', watch: '完美主义、在意形象、容易把小事放在心上', tips: '适合注重细节、设计和品质的工作；接受“够好就好”，多听建设性意见。' },
  { image: '江河大海', strengths: '聪明、足智多谋、爱冒险、善交际', watch: '静不下来、精力分散、给人压力', tips: '适合多变、出行和讲究策略的工作；建立规律，让能量有出口。' },
  { image: '雨露云雾', strengths: '直觉强、富想象力、温和、敏锐', watch: '心事重、焦虑、躲进想象里', tips: '适合研究、艺术和咨询类工作；把想法化为具体的小行动。' },
];

export const GOD_DETAILS_ZH = [
  { theme: '自立与同辈', plus: '独立、忠诚、善于与人平等合作', minus: '固执，与同辈争夺资源', area: '兄弟姐妹、朋友和同事' },
  { theme: '冲劲与竞争', plus: '大胆、有说服力、能推动事情', minus: '冲动消费、冒险投资、因钱起争执', area: '竞争对手和合伙人' },
  { theme: '享受与创意', plus: '随和、有创意、有品味、善于教导', minus: '安于现状、放纵享乐', area: '兴趣爱好、饮食、学生；传统上女命看子女' },
  { theme: '才华与表达', plus: '才华横溢、有创新、口才好、善于表现', minus: '反抗权威、言多必失', area: '表演和创新；传统上女命看子女' },
  { theme: '机会与经营', plus: '慷慨、善交际、眼光敏锐、有生意头脑', minus: '投机、摊子铺得太大', area: '生意和投资；传统上看父亲' },
  { theme: '靠努力得来的稳定回报', plus: '勤奋、可靠、理财谨慎', minus: '过于保守、看重物质', area: '薪水和储蓄；传统上男命看妻子' },
  { theme: '压力与魄力', plus: '勇敢、果断、危急时刻表现出色', minus: '压力大、好斗、冲突多', area: '挑战和对手；传统上女命看伴侣' },
  { theme: '秩序、地位与责任', plus: '负责、公正、受人尊重、守规矩', minus: '拘谨、在意别人的看法', area: '事业、上司和名声；传统上女命看丈夫' },
  { theme: '独特的领悟', plus: '直觉强、专精一门、喜欢研究和玄学', minus: '孤僻、想太多、为不同而不同', area: '冷门学问和非传统的支持' },
  { theme: '支持与学习', plus: '善良、有智慧、好学，容易得到帮助', minus: '依赖心重、被动', area: '教育、贵人、学历；传统上看母亲' },
];

export const FAMILIES_ZH = [
  { about: '自我与同辈', strong: '自我意识强、独立；懂得分享功劳、合作而非竞争时最顺。', missing: '较少从同辈得到支持；建立一群可以互相扶持的朋友会让你更稳。' },
  { about: '表达与创意', strong: '有创意、善表达，需要发挥想法的出口；注意精力不要太分散。', missing: '可能把想法藏在心里；多练习分享自己的作品和意见。' },
  { about: '金钱与成果', strong: '务实、重结果，懂得衡量价值；注意不要为钱过度劳累。', missing: '金钱不是你的主要动力，所以要有意识地做预算和理财。' },
  { about: '事业、纪律与权威', strong: '自律，适合有规则和责任的环境；注意压力和自我批评。', missing: '自由自在，不喜欢被管；给自己定规律和作息会有帮助。' },
  { about: '学习与支持', strong: '天生爱学习，容易得到帮助；注意不要过于依赖、等别人来做。', missing: '多靠自学；主动寻找良师，持续学习。' },
];

export const PILLAR_AREAS_ZH = {
  year: { label: '年柱', area: '根基：家庭背景、祖上和社会对你的看法', ages: '童年，约15岁以前', short: '家庭和根基' },
  month: { label: '月柱', area: '父母、成长环境和工作环境', ages: '青年，约16至30岁', short: '父母和工作' },
  day: { label: '日柱', area: '你自己（日干）和最亲密的关系（日支，即“夫妻宫”）', ages: '成年，约31至45岁', short: '自己和亲密关系' },
  hour: { label: '时柱', area: '子女、志向和传承', ages: '晚年，约46岁以后', short: '子女和计划' },
};

export const ELEMENT_TRAITS_ZH = [
  { traits: '成长、规划和仁慈', boost: '绿色、东方、春天；植物、阅读和学习新东西' },
  { traits: '热情、表现和喜悦', boost: '红色、南方、夏天；运动、晒太阳和社交' },
  { traits: '稳定、信任和关怀', boost: '黄色和棕色、中央、季夏；规律作息、做饭和园艺' },
  { traits: '条理、果断和公平', boost: '白色和金色、西方、秋天；整理、秩序和明确的规则' },
  { traits: '智慧、灵活和沟通', boost: '黑色和蓝色、北方、冬天；休息、反思、近水和出行' },
];

export const FAVOUR_TEXT_ZH = { good: '有利', mixed: '平', hard: '吃力' };

export const DM_KEYWORDS_ZH = [
  '正直 · 稳重 · 有担当', '灵活 · 圆融 · 有韧性', '热情 · 大方 · 善表达', '细腻 · 体贴 · 专注', '可靠 · 沉稳 · 有耐心',
  '包容 · 务实 · 乐于助人', '果断 · 讲义气 · 直率', '精致 · 细致 · 有眼光', '聪明 · 机智 · 爱冒险', '敏锐 · 富想象 · 温和',
];

// The text tables and a picker for one language ('zh' or anything else for English).
function textFor(lang) {
  const zh = lang === 'zh';
  return {
    zh,
    t: (en, cn) => (zh ? cn : en),
    profiles: zh ? DM_PROFILES_ZH : DM_PROFILES,
    gods: zh ? GOD_DETAILS_ZH : GOD_DETAILS,
    families: zh ? FAMILIES_ZH : FAMILIES,
    areas: zh ? PILLAR_AREAS_ZH : PILLAR_AREAS,
    traits: zh ? ELEMENT_TRAITS_ZH : ELEMENT_TRAITS,
    favour: zh ? FAVOUR_TEXT_ZH : FAVOUR_TEXT,
    keywords: zh ? DM_KEYWORDS_ZH : null,
    el: (i) => (zh ? ELEMENTS[i].zh : `${ELEMENTS[i].zh} ${ELEMENTS[i].en}`),
    elPlain: (i) => (zh ? ELEMENTS[i].zh : ELEMENTS[i].en),
    god: (g) => (zh ? TEN_GODS[g].zh : `${TEN_GODS[g].zh} ${TEN_GODS[g].en}`),
    fam: (i) => (zh ? FAMILIES[i].zh : `${FAMILIES[i].en} ${FAMILIES[i].zh}`),
    dmName: (dm) => (zh ? `${STEMS[dm]}${isYang(dm) ? '阳' : '阴'}${ELEMENTS[stemElement(dm)].zh}` : `${STEMS[dm]} ${isYang(dm) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(dm)].en}`),
    list: (xs) => xs.join(zh ? '、' : ', '),
  };
}

const familyOf = (god) => Math.floor(god / 2);

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
export function buildReading(chart, now = new Date(), lang = 'en') {
  const L = textFor(lang);
  const { t } = L;
  const dm = chart.dayMaster;
  const prof = L.profiles[dm];
  const godLine = (g) => `${L.god(g)}${t(': ', '：')}${L.gods[g].theme}`;
  const sections = [];

  sections.push({
    title: t(`You: ${L.dmName(dm)}`, `你：${L.dmName(dm)}`),
    intro: t(`Your day master is pictured as ${prof.image}. It is the centre of the chart, and every other value is read in relation to it.`,
      `你的日主像${prof.image}。它是命盘的中心，其他所有字都要对照它来看。`),
    items: [
      { head: t('Strengths', '优点'), body: t(`Traditionally ${prof.strengths}.`, `传统上认为你${prof.strengths}。`) },
      { head: t('Watch for', '留意'), body: t(`${cap(prof.watch)}.`, `${prof.watch}。`) },
      { head: t('Making use of it', '如何发挥'), body: prof.tips },
    ],
  });

  const items = [];
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = chart.pillars.find((x) => x.key === key);
    const a = L.areas[key];
    if (p.missing) {
      items.push({ head: t(`${a.label}: unknown`, `${a.label}：未知`), body: t(`Covers ${a.area}. Add a birth time to read it.`, `代表${a.area}。输入出生时间才能看。`) });
      continue;
    }
    const stem = key === 'day' ? t('Its stem is you.', '日干就是你。') : t(`Its stem is ${godLine(p.stemGod)}.`, `天干是${godLine(p.stemGod)}。`);
    const root = p.hidden[0].god;
    const g = L.gods[root];
    const branch = key === 'day'
      ? t(`Its branch holds ${godLine(root)}, which colours your close relationships. At its best: ${g.plus}. Watch for ${g.minus}.`,
        `日支藏${godLine(root)}，影响你的亲密关系。好的一面：${g.plus}。留意：${g.minus}。`)
      : t(`Its branch holds ${godLine(root)}.`, `地支藏${godLine(root)}。`);
    items.push({ head: `${a.label} ${p.name}`, body: t(`Covers ${a.area}. Life stage: ${a.ages}. ${stem} ${branch}`, `代表${a.area}。人生阶段：${a.ages}。${stem}${branch}`) });
  }
  sections.push({
    title: t('What each pillar covers', '四柱各代表什么'),
    intro: t('Each pillar stands for an area of life and a stage of it. The ten god in it tells you the theme that shows up there.',
      '每一柱代表人生的一个方面和一个阶段，柱中的十神说明那里会出现什么主题。'),
    items,
  });

  const fam = familyCounts(chart);
  const max = Math.max(...fam);
  const famItems = [];
  fam.forEach((n, i) => {
    if (n === max && n > 0) famItems.push({ head: t(`Strong: ${L.fam(i)} (${n})`, `旺：${L.fam(i)}（${n}）`), body: t(`About ${L.families[i].about}. ${L.families[i].strong}`, `关于${L.families[i].about}。${L.families[i].strong}`) });
  });
  fam.forEach((n, i) => {
    if (n === 0) famItems.push({ head: t(`Missing: ${L.fam(i)}`, `缺：${L.fam(i)}`), body: t(`About ${L.families[i].about}. ${L.families[i].missing}`, `关于${L.families[i].about}。${L.families[i].missing}`) });
  });
  sections.push({
    title: t('Your main themes', '你的主要特质'),
    intro: t(`Ten gods group into five themes. Counting the stems and each branch's main hidden stem: ${FAMILIES.map((f, i) => `${f.en} ${fam[i]}`).join(', ')}.`,
      `十神可归为五类。按天干和各地支的本气计算：${FAMILIES.map((f, i) => `${f.zh} ${fam[i]}`).join('，')}。`),
    items: famItems,
  });

  const st = analyseStrength(chart);
  const pct = Math.round(st.ratio * 100);
  const VERDICT = { strong: t('strong', '身强'), weak: t('weak', '身弱'), balanced: t('balanced', '中和') };
  const verdictText = st.verdict === 'balanced' ? t(`balanced, leaning ${st.lean}`, `中和，偏${st.lean === 'strong' ? '强' : '弱'}`) : VERDICT[st.verdict];
  const yes = (b) => (b ? t('yes', '是') : t('no', '否'));
  const REASONS = {
    companions: t('Your own element is plentiful, so the element that disciplines it helps most.', '比劫多，最需要克制日主的五行。'),
    resource: t('You are strong mainly through support (Resource), so the element that controls that support helps most.', '主要因印星而旺，最需要克制印星的五行。'),
    output: t('Your energy is drained mostly through Output, so the element that feeds you helps most.', '主要被食伤泄气，最需要生扶日主的五行。'),
    officer: t('You are pressed mostly by Officer, so the element that feeds you (and absorbs that pressure) helps most.', '主要受官杀克制，最需要生扶日主（化解官杀）的五行。'),
    wealth: t('You are stretched mostly by Wealth, so companions of your own element help most.', '主要因财多身弱，最需要同类比劫来帮身。'),
  };
  const w = chart.weighted;
  const hi = w.indexOf(Math.max(...w));
  const lo = w.indexOf(Math.min(...w));
  sections.push({
    title: t('Strength and favourable elements', '身强身弱与喜用神'),
    intro: t('Practitioners first judge whether the day master is strong or weak, then pick the elements that bring it into balance (用神). This uses one common scoring method; others can differ, especially for extreme charts.',
      '命理师通常先判断日主强弱，再找出使命局平衡的五行（用神）。这里用的是一种常见的计分方法，其他方法的结论可能不同，特别是极端的命局。'),
    items: [
      {
        head: t(`Day master: ${verdictText} (${pct}% support)`, `日主：${verdictText}（帮身力量 ${pct}%）`),
        body: t(`Support is your own element plus the one that produces you, weighted across all the stems and hidden stems, with the month counted double. Born in season (得令): ${yes(st.checks.season)}. Rooted in a branch (得地): ${yes(st.checks.root)}. Supporting stems (得势): ${st.checks.help}.`,
          `帮身力量指与日主同类和生日主的五行，按所有天干和藏干加权计算，月令计双倍。得令：${yes(st.checks.season)}。得地：${yes(st.checks.root)}。得势（帮身的天干数）：${st.checks.help}。`),
      },
      { head: t(`Useful element: ${L.el(st.useful)}`, `用神：${L.el(st.useful)}`), body: t(`${REASONS[st.reason]} Traditionally you'd bring it in through ${L.traits[st.useful].boost}.`, `${REASONS[st.reason]}传统上可以通过${L.traits[st.useful].boost.replace('；', '，以及')}来补。`) },
      ...(st.season ? [{
        head: t(`Climate (调候): ${st.season === 'cold' ? 'a winter chart needs Fire' : 'a summer chart needs Water'}`, `调候：${st.season === 'cold' ? '冬生需火' : '夏生需水'}`),
        body: t(`You were born in a ${st.season === 'cold' ? 'cold month (亥子丑), so Fire is wanted for warmth' : 'hot month (巳午未), so Water is wanted to cool it'}, whatever the day master's strength. It is counted as favourable below.`,
          `你生于${st.season === 'cold' ? '寒冷的月份（亥子丑），需要火来暖局' : '炎热的月份（巳午未），需要水来降温'}，不论日主强弱都如此，所以下面把它算作喜用。`),
      }] : []),
      {
        head: t(`Favourable: ${L.list(st.favourable.map(L.el))}`, `喜用：${L.list(st.favourable.map(L.el))}`),
        body: t(`${st.lean === 'strong' ? 'A strong day master does well when its energy is used: expressed, earned and disciplined.' : 'A weaker day master does well with support: learning, mentors and allies.'} Luck pillars and years of these elements tend to feel easier.`,
          `${st.lean === 'strong' ? '日主偏强，宜把能量用出去：表达、赚取、自律。' : '日主偏弱，宜得到支持：学习、贵人和伙伴。'}行到这些五行的大运和流年通常较顺。`),
      },
      { head: t(`Less favourable: ${L.list(st.unfavourable.map(L.el))}`, `忌：${L.list(st.unfavourable.map(L.el))}`), body: t('Periods heavy in these tend to need more effort. They are not “bad”, just more demanding.', '这些五行重的时期通常要多花力气，不是“不好”，只是比较吃力。') },
      {
        head: t(`Most: ${L.el(hi)} · Least: ${L.el(lo)}${chart.counts[lo] === 0 ? ' (missing)' : ''}`, `最多：${L.el(hi)} · 最少：${L.el(lo)}${chart.counts[lo] === 0 ? '（缺）' : ''}`),
        body: t(`${ELEMENTS[hi].en} brings ${L.traits[hi].traits}; ${ELEMENTS[lo].en} stands for ${L.traits[lo].traits}.`, `${ELEMENTS[hi].zh}代表${L.traits[hi].traits}；${ELEMENTS[lo].zh}代表${L.traits[lo].traits}。`),
      },
    ],
  });

  const timing = [];
  const nowMs = now.getTime();
  const idx = nowMs < chart.luck.startMs ? -1 : Math.min(Math.floor((nowMs - chart.luck.startMs) / (365.2422 * 86400000) / 10), 9);
  if (idx >= 0) {
    const lp = chart.luck.pillars[idx];
    const g = L.gods[lp.stemGod];
    timing.push({
      head: t(`This decade: ${lp.name} (from ${lp.fromYear}), ${L.favour[pillarFavour(st, lp.stem, lp.branch)]}`, `这十年：${lp.name}（${lp.fromYear}年起），${L.favour[pillarFavour(st, lp.stem, lp.branch)]}`),
      body: t(`The stem brings ${godLine(lp.stemGod)}, mostly felt in the first five years. The branch brings ${godLine(lp.branchGod)}, mostly felt in the last five. At its best: ${g.plus}. Watch for ${g.minus}.`,
        `天干带来${godLine(lp.stemGod)}，前五年较明显；地支带来${godLine(lp.branchGod)}，后五年较明显。好的一面：${g.plus}。留意：${g.minus}。`),
    });
  } else {
    timing.push({ head: t('Luck pillars', '大运'), body: t(`Your first luck pillar starts in ${new Date(chart.luck.startMs).getUTCFullYear()}.`, `第一步大运从${new Date(chart.luck.startMs).getUTCFullYear()}年开始。`) });
  }
  const year = now.getFullYear();
  const yp = annualPillar(year, dm);
  const g = L.gods[yp.stemGod];
  const clashes = chart.pillars.filter((p) => !p.missing && (p.branch - yp.branch + 12) % 12 === 6);
  const clashText = clashes.length
    ? t(` Its branch ${BRANCHES[yp.branch]} clashes with your ${clashes.map((p) => `${L.areas[p.key].label.toLowerCase()} ${BRANCHES[p.branch]}`).join(' and ')}, traditionally a sign of movement or change in ${clashes.map((p) => L.areas[p.key].short).join(', and in ')}.`,
      `流年地支${BRANCHES[yp.branch]}冲你的${clashes.map((p) => `${L.areas[p.key].label}${BRANCHES[p.branch]}`).join('和')}，传统上表示${clashes.map((p) => L.areas[p.key].short).join('、')}方面有变动。`)
    : '';
  timing.push({
    head: t(`${year}: ${yp.name}, ${L.favour[pillarFavour(st, yp.stem, yp.branch)]}`, `${year}年：${yp.name}，${L.favour[pillarFavour(st, yp.stem, yp.branch)]}`),
    body: t(`This year brings ${godLine(yp.stemGod)}. At its best: ${g.plus}. Watch for ${g.minus}.${clashText}`, `今年带来${godLine(yp.stemGod)}。好的一面：${g.plus}。留意：${g.minus}。${clashText}`),
  });
  sections.push({ title: t('Now', '当下'), intro: t('Luck pillars and years add their own ten gods to your chart for a while.', '大运和流年会在一段时间内给命盘加上它们自己的十神。'), items: timing });

  return sections;
}

// Three-word portraits of each day master, for the summary.
export const DM_KEYWORDS = [
  'Principled · steady · protective', 'Adaptable · diplomatic · persistent', 'Warm · generous · expressive',
  'Thoughtful · caring · focused', 'Dependable · calm · patient', 'Nurturing · practical · supportive',
  'Decisive · loyal · direct', 'Refined · precise · discerning', 'Clever · resourceful · adventurous',
  'Intuitive · imaginative · gentle',
];

const cap = (text) => text[0].toUpperCase() + text.slice(1);

// The short version: one line per point, for people who don't want the detail.
export function buildSummary(chart, now = new Date(), lang = 'en') {
  const L = textFor(lang);
  const { t } = L;
  const dm = chart.dayMaster;
  const prof = L.profiles[dm];
  const st = analyseStrength(chart);
  const fam = familyCounts(chart);
  const top = fam.indexOf(Math.max(...fam));
  const tip = L.traits[st.useful].boost.split(/[;；]/)[1].trim();
  const lines = [
    { id: 'you', label: t('You', '你'), text: t(`${L.dmName(dm)}, like ${prof.image}.`, `${L.dmName(dm)}，像${prof.image}。`) },
    { id: 'strengths', label: t('Strengths', '优点'), text: `${L.zh ? DM_KEYWORDS_ZH[dm] : DM_KEYWORDS[dm]}${t('.', '')}` },
    { id: 'watch', label: t('Watch for', '留意'), text: t(`${cap(prof.watch.split(';')[0])}.`, `${prof.watch}。`) },
    { id: 'theme', label: t('Main theme', '主要特质'), text: t(`${FAMILIES[top].en}: ${L.families[top].about}.`, `${FAMILIES[top].zh}：${L.families[top].about}。`) },
    { id: 'helps', label: t('What helps', '对你有帮助'), text: t(`${L.list(st.favourable.map(L.elPlain))}. Try ${tip}.`, `${L.list(st.favourable.map(L.elPlain))}。可以多${tip}。`) },
  ];
  const nowMs = now.getTime();
  const idx = nowMs < chart.luck.startMs ? -1 : Math.min(Math.floor((nowMs - chart.luck.startMs) / (365.2422 * 86400000) / 10), 9);
  const timing = [];
  if (idx >= 0) {
    const lp = chart.luck.pillars[idx];
    timing.push({ id: 'decade', label: t(`This decade (${lp.fromYear}–${lp.fromYear + 9})`, `这十年（${lp.fromYear}–${lp.fromYear + 9}）`), pillar: lp.name, favour: pillarFavour(st, lp.stem, lp.branch), text: t(`${cap(L.gods[lp.stemGod].theme)}.`, `${L.gods[lp.stemGod].theme}。`) });
  }
  const yp = annualPillar(now.getFullYear(), dm);
  const clash = chart.pillars.some((p) => !p.missing && (p.branch - yp.branch + 12) % 12 === 6);
  timing.push({ id: 'year', label: t(`${now.getFullYear()}`, `${now.getFullYear()}年`), pillar: yp.name, favour: pillarFavour(st, yp.stem, yp.branch), text: t(`${cap(L.gods[yp.stemGod].theme)}.${clash ? ' Expect some change.' : ''}`, `${L.gods[yp.stemGod].theme}。${clash ? '会有一些变动。' : ''}`) });
  const stars = symbolicStars(chart).map((x) => (L.zh ? x.zh : x.en));
  return { lines, timing, stars };
}
