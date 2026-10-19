// Lesson content. Each card is either text ({ h, body }) or a hands-on demo ({ demo }). Each lesson ends
// with a short quiz: { q, options, answer (index), why }.

export const LESSONS = [
  {
    id: 'what', emoji: '🤔', title: 'What is AI, really?', minutes: 3,
    cards: [
      { h: 'A computer that learns from examples', body: `<p>Normal software follows rules a person wrote: <em>"if the bill is over $50, add a discount"</em>.</p>
        <p><b>AI (artificial intelligence)</b> is software that works out its own rules by looking at lots of examples. Show it thousands of cat photos and it learns what a cat looks like, without anyone describing whiskers.</p>` },
      { h: 'You already use it every day', body: `<ul>
        <li>📱 Face unlock on your phone</li>
        <li>🗺️ Traffic estimates in Google Maps</li>
        <li>🎬 "Recommended for you" on YouTube and Netflix</li>
        <li>🔍 Searching your photos for "beach" or "dog"</li>
        <li>⌨️ Autocorrect and the word suggestions above your keyboard</li></ul>` },
      { h: 'The new kind: AI that creates', body: `<p><b>Generative AI</b> makes new things: writing, pictures, voices, even video. Chatbots such as ChatGPT, Gemini, Claude, Copilot and Meta AI (inside WhatsApp) are this kind.</p>
        <p>You type a question or request in normal language, and it writes an answer.</p>` },
      { h: 'What it is not', body: `<p>It isn't alive, it doesn't have feelings, and it doesn't "know" things the way you do. It is a very, very good <b>pattern matcher</b>.</p>
        <p>That's why it can sound clever and still be confidently wrong. You'll see why in the next lessons.</p>` },
    ],
    quiz: [
      { q: 'What makes AI different from normal software?', options: ['It is always connected to the internet', 'It learns its own rules from examples', 'It is alive and has feelings', 'It never makes mistakes'], answer: 1, why: 'AI works out patterns from lots of examples instead of following only hand-written rules.' },
      { q: 'Which of these is generative AI?', options: ['A calculator app', 'A chatbot that writes you a birthday poem', 'A torch app', 'A step counter'], answer: 1, why: 'Generative AI creates new content, such as text or pictures.' },
      { q: 'A chatbot sounds very sure of an answer. That means…', options: ['It must be right', 'It checked the internet', 'Nothing: it can sound sure and still be wrong', 'A human checked it'], answer: 2, why: 'It matches patterns of confident writing. Sounding sure is not the same as being right.' },
    ],
  },
  {
    id: 'learn', emoji: '🧪', title: 'How AI learns', minutes: 4,
    cards: [
      { h: 'Examples plus feedback', body: `<p>To train an AI, you give it lots of examples with the right answers: <em>"this email is a scam, this one isn't"</em>.</p>
        <p>It guesses, gets told whether it was right, and adjusts itself a tiny bit. Repeat millions of times and the guesses get good.</p>` },
      { demo: 'spam' },
      { h: 'Rubbish in, rubbish out', body: `<p>An AI is only as good as its examples. Label scams as normal and it learns to let scams through.</p>
        <p>If the examples are one-sided, so is the AI. A photo app trained mostly on one group of people works worse on others. This is called <b>bias</b>.</p>` },
      { h: 'Big AI, same idea', body: `<p>The chatbots you use learned the same way, just enormously bigger: they studied a huge amount of text from books and the internet, then people gave feedback on their answers to make them more helpful and polite.</p>` },
    ],
    quiz: [
      { q: 'How does an AI learn to spot scam messages?', options: ['Someone types in every scam word', 'It studies many messages labelled scam or normal', 'It phones the bank', 'It guesses randomly forever'], answer: 1, why: 'It learns from labelled examples, adjusting itself after each one.' },
      { q: 'You train it with messages labelled wrongly. What happens?', options: ['It fixes the labels itself', 'It learns the wrong lesson', 'Nothing changes', 'It refuses to learn'], answer: 1, why: 'Rubbish in, rubbish out: it copies whatever the examples teach.' },
      { q: 'What is "bias" in AI?', options: ['A setting for brightness', 'When one-sided examples make it work worse for some people or cases', 'A type of computer chip', 'When the AI is switched off'], answer: 1, why: 'If the examples are one-sided, the AI learns that slant.' },
    ],
  },
  {
    id: 'write', emoji: '✍️', title: 'How chatbots write', minutes: 4,
    cards: [
      { h: 'One word at a time', body: `<p>A chatbot writes by asking itself, over and over: <b>"what word most likely comes next?"</b></p>
        <p>It's like the word suggestions on your phone keyboard, but trained on so much text that it can carry on for whole pages.</p>` },
      { demo: 'predict' },
      { h: 'Why answers change every time', body: `<p>It doesn't always pick the top word. A little randomness makes the writing natural, which is why asking the same question twice gives different answers.</p>
        <p>The <b>temperature</b> setting controls this: low means safe and predictable, high means creative and sometimes odd.</p>` },
      { h: 'No look-up, just likely words', body: `<p>Unless it's connected to search, a chatbot doesn't look anything up. It writes what <em>sounds</em> likely, based on what it saw in training. Usually that's right. Sometimes it isn't, and it can't always tell the difference.</p>` },
    ],
    quiz: [
      { q: 'How does a chatbot write its answer?', options: ['It copies a stored answer', 'It predicts the next word again and again', 'A person types it quickly', 'It searches a dictionary'], answer: 1, why: 'It builds the answer one likely word (or word piece) at a time.' },
      { q: 'Why can the same question get a different answer?', options: ['The chatbot is broken', 'It adds a little randomness when choosing words', 'Someone changed it overnight', 'It forgets the language'], answer: 1, why: 'A bit of randomness keeps the writing natural, so answers vary.' },
      { q: 'High "temperature" makes the writing…', options: ['More predictable', 'More creative and surprising', 'Shorter', 'Hotter for your phone'], answer: 1, why: 'Higher temperature lets less likely words through.' },
    ],
  },
  {
    id: 'tokens', emoji: '🔤', title: 'Tokens: how AI reads', minutes: 3,
    cards: [
      { h: 'AI reads in pieces', body: `<p>AI doesn't read letters or whole words. It reads <b>tokens</b>: chunks such as "chick", "en" or " rice". Common words are one token; long or rare words are split up.</p>
        <p>In English, 100 tokens is roughly 75 words.</p>` },
      { demo: 'tokens' },
      { h: 'Why tokens matter to you', body: `<ul>
        <li><b>Memory:</b> a chatbot can only keep a certain number of tokens in mind at once (its <b>context window</b>). In a very long chat, it may lose track of things you said at the start.</li>
        <li><b>Limits and cost:</b> free plans and paid AI services count your usage in tokens.</li>
        <li><b>Spelling quirks:</b> because it sees chunks, not letters, AI can stumble on questions like "how many r's in strawberry?"</li></ul>` },
    ],
    quiz: [
      { q: 'What is a token?', options: ['A coin for an arcade', 'A chunk of text the AI reads, like part of a word', 'A password', 'A type of virus'], answer: 1, why: 'Tokens are the word pieces an AI reads and writes.' },
      { q: 'In a very long chat, the AI forgets early details. Why?', options: ['It got bored', 'Its context window can only hold so many tokens', 'You typed too fast', 'The internet dropped'], answer: 1, why: 'It can only keep a limited number of tokens in mind at once.' },
      { q: 'Why might AI miscount letters in a word?', options: ['It sees word chunks, not single letters', 'It can\'t count at all', 'It is lying on purpose', 'Letters are too small'], answer: 0, why: 'It reads tokens, so individual letters are partly hidden from it.' },
    ],
  },
  {
    id: 'madeup', emoji: '🎭', title: 'Why AI makes things up', minutes: 4,
    cards: [
      { h: 'Confident, fluent… and wrong', body: `<p>Because it writes what <em>sounds</em> likely, AI sometimes invents facts, quotes, book titles, statistics or links that don't exist. This is called a <b>hallucination</b>.</p>
        <p>It doesn't know it's doing it, so it won't warn you.</p>` },
      { h: 'Where it happens most', body: `<ul>
        <li>Exact numbers, dates and prices</li>
        <li>Quotes, sources, links and references</li>
        <li>Recent news (its knowledge stops at a <b>cut-off date</b> unless it can search)</li>
        <li>Niche topics, local details, and anything about a specific person</li>
        <li>Medical, legal and money specifics</li></ul>` },
      { demo: 'check' },
      { h: 'How to protect yourself', body: `<ol>
        <li>For anything important, <b>check a trusted source</b> (a government site, your bank, a doctor).</li>
        <li>Ask it for sources, then <b>open them</b>: fake sources are common.</li>
        <li>Use a version that can search the web for current information.</li>
        <li>Treat it like a clever friend who sometimes bluffs.</li></ol>` },
    ],
    quiz: [
      { q: 'What is an AI "hallucination"?', options: ['A picture it draws', 'When it confidently makes up something false', 'When it shuts down', 'A virus'], answer: 1, why: 'It invents plausible-sounding but false information.' },
      { q: 'AI gives you a website link as a source. You should…', options: ['Trust it, it\'s a link', 'Open it and check it says what the AI claims', 'Share it with friends', 'Ignore all links forever'], answer: 1, why: 'Sources can be invented or misquoted. Always open and check.' },
      { q: 'Which answer most needs double-checking?', options: ['Ideas for a birthday party theme', 'A friendlier way to word an email', 'The exact dosage of a medicine', 'A list of fun weekend activities'], answer: 2, why: 'Exact medical facts matter and are a common place for errors. Ask a doctor or pharmacist.' },
    ],
  },
  {
    id: 'prompt', emoji: '💬', title: 'How to ask: prompting', minutes: 5,
    cards: [
      { h: 'Talk to it like a smart new helper', body: `<p>The message you type is called a <b>prompt</b>. The AI only knows what you tell it, so a vague prompt gets a vague answer.</p>
        <p>❌ <em>"Write an email."</em><br>✅ <em>"Write a short, polite email to my landlord asking to fix the leaking kitchen tap this week. Keep it under 100 words."</em></p>` },
      { h: 'The 5-part recipe', body: `<ol>
        <li><b>Task:</b> what you want done</li>
        <li><b>Context:</b> the background it needs</li>
        <li><b>Who it's for:</b> your boss, a 10-year-old, your auntie</li>
        <li><b>Format:</b> bullet points, a table, under 100 words</li>
        <li><b>Example or tone:</b> "friendly", "like this one: …"</li></ol>` },
      { demo: 'prompt' },
      { h: 'Keep the conversation going', body: `<p>The first answer is a draft. Reply to improve it:</p>
        <ul><li>"Make it shorter."</li><li>"Simpler words, please."</li><li>"Give me three other options."</li><li>"Explain step 2 again."</li><li>"What questions should I ask the doctor about this?"</li></ul>` },
    ],
    quiz: [
      { q: 'Which prompt will get the better answer?', options: ['"Recipe"', '"Give me an easy dinner recipe for 4 using chicken, broccoli and rice, ready in 30 minutes"', '"Food please"', '"Cook"'], answer: 1, why: 'Specific details (what, who, limits) give a much more useful answer.' },
      { q: 'The answer is too long and complicated. Best next step?', options: ['Give up', 'Start a new app', 'Reply "make it shorter and use simpler words"', 'Copy it anyway'], answer: 2, why: 'You can keep refining. The first answer is just a draft.' },
      { q: 'Telling the AI who the answer is for (e.g. "for a 10-year-old")…', options: ['Makes no difference', 'Helps it pick the right words and detail', 'Confuses it', 'Is not allowed'], answer: 1, why: 'Knowing the reader lets it adjust the level and tone.' },
    ],
  },
  {
    id: 'goodbad', emoji: '⚖️', title: 'Good at, bad at', minutes: 3,
    cards: [
      { h: 'Use it for drafts, not decisions', body: `<p>AI is great at <b>first drafts and explanations</b>. It's risky when you need <b>exact facts</b>, <b>the latest news</b>, or <b>someone to take responsibility</b>.</p>` },
      { demo: 'sort' },
      { h: 'A good rule of thumb', body: `<p>✅ <b>Great:</b> drafting messages, summarising long text, explaining jargon simply, brainstorming, translating everyday text, practising a language, planning.</p>
        <p>⚠️ <b>Check carefully:</b> facts and figures, maths in long problems, recent events, health, legal and money decisions, anything you'll sign or send to officials.</p>` },
    ],
    quiz: [
      { q: 'Which is AI best at?', options: ['Deciding whether to take a medicine', 'Turning your notes into a clear, polite email', 'Telling you today\'s exact stock price', 'Signing a contract for you'], answer: 1, why: 'Drafting and rewriting text is one of its strengths.' },
      { q: 'You need today\'s news. A chatbot without search will…', options: ['Always know it', 'Possibly give old or made-up information', 'Refuse to talk', 'Call a reporter'], answer: 1, why: 'Its knowledge stops at a cut-off date unless it can search the web.' },
      { q: 'Who is responsible if you act on a wrong AI answer?', options: ['The AI', 'Nobody', 'You: so check important things', 'The internet'], answer: 2, why: 'AI can\'t take responsibility. Use it as a helper and check what matters.' },
    ],
  },
  {
    id: 'safe', emoji: '🛡️', title: 'Staying safe', minutes: 5,
    cards: [
      { h: 'Never paste these into a chatbot', body: `<ul>
        <li>🔑 Passwords, OTPs and Singpass details</li>
        <li>🪪 Your NRIC or passport number</li>
        <li>💳 Bank card or account numbers</li>
        <li>🏥 Other people's private or medical details</li>
        <li>🏢 Your company's confidential work, unless your workplace allows that AI tool</li></ul>
        <p>What you type may be stored, and some services use chats to improve their AI. Check the app's privacy settings.</p>` },
      { h: 'Scammers use AI too', body: `<ul>
        <li><b>Fake voices:</b> a few seconds of someone's voice is enough to clone it. A "grandson in trouble" call may not be him.</li>
        <li><b>Deepfake videos:</b> fake ads with celebrities or politicians promoting investments.</li>
        <li><b>Perfect-English scam messages:</b> bad spelling is no longer a reliable warning sign.</li></ul>` },
      { h: 'Simple habits that beat AI scams', body: `<ol>
        <li><b>Hang up and call back</b> on a number you already know.</li>
        <li>Agree a <b>family code word</b> for emergencies.</li>
        <li>Anyone rushing you to pay or keep it secret is a red flag.</li>
        <li>Not sure? Check with the <b>ScamShield</b> app or the ScamShield Helpline <b>1799</b> before you act.</li></ol>` },
    ],
    quiz: [
      { q: 'Which is safe to type into a chatbot?', options: ['Your Singpass password', 'Your NRIC number', '"Help me write a thank-you card for my neighbour"', 'Your bank OTP'], answer: 2, why: 'Never share passwords, OTPs or ID numbers. Everyday writing help is fine.' },
      { q: 'Your "son" calls in a panic asking for money, and his voice sounds right. You should…', options: ['Transfer it quickly', 'Hang up and call him back on his usual number', 'Send your bank OTP', 'Keep it secret'], answer: 1, why: 'Voices can be cloned. Always call back on a number you know.' },
      { q: 'A video shows a famous person promoting an amazing investment. Most likely…', options: ['A great deal', 'A deepfake scam', 'Government approved', 'Risk-free'], answer: 1, why: 'Deepfake celebrity investment ads are a common scam.' },
    ],
  },
  {
    id: 'fakes', emoji: '🖼️', title: 'Pictures, voices and deepfakes', minutes: 4,
    cards: [
      { h: 'How AI makes pictures', body: `<p>Image AIs studied huge numbers of pictures with their descriptions. To make a new one, they start from random static and clean it up step by step until it matches your description, like a photo slowly coming into focus.</p>` },
      { h: 'Signs a picture may be AI-made', body: `<ul>
        <li>Odd hands, ears, teeth or jewellery</li>
        <li>Writing that turns into nonsense letters</li>
        <li>Skin too smooth, everything too perfect</li>
        <li>Backgrounds that melt or don't make sense</li>
        <li>Shadows and reflections that don't match</li></ul>
        <p>These clues are fading as AI improves. The best test is still: <b>where did it come from?</b></p>` },
      { h: 'Check the source, not just the picture', body: `<ol>
        <li>Is a trusted news outlet or official account reporting it?</li>
        <li>Search the claim; look for the same image elsewhere (Google Lens can help).</li>
        <li>If it makes you very angry or very excited, slow down: that's what fakes are designed to do.</li></ol>` },
    ],
    quiz: [
      { q: 'What is a deepfake?', options: ['A deep-sea photo', 'AI-made video, voice or image that imitates a real person', 'A broken file', 'A type of camera'], answer: 1, why: 'Deepfakes use AI to imitate real people convincingly.' },
      { q: 'The most reliable way to check a shocking picture is…', options: ['Zoom in on the hands', 'Check whether trusted sources report it', 'Count the likes', 'Ask in a group chat'], answer: 1, why: 'Visual clues are fading; where it came from matters most.' },
      { q: 'A post makes you furious and urges you to share now. Best move?', options: ['Share immediately', 'Slow down and check it first', 'Reply angrily', 'Screenshot and forward'], answer: 1, why: 'Strong emotion and urgency are classic signs of fakes and scams.' },
    ],
  },
  {
    id: 'daily', emoji: '🧰', title: 'Using AI every day', minutes: 4,
    cards: [
      { h: 'Start with small, useful jobs', body: `<p>The easiest way to learn is to use it for things you already do. Try one of the ready-made prompts in the <b>Prompts</b> tab: tap to copy, paste into any chatbot, fill in the blanks.</p>` },
      { h: 'The 4-question check', body: `<p>Before you rely on an answer, ask yourself:</p>
        <ol><li>Does it <b>make sense</b>?</li><li>Is it <b>important</b> (money, health, law)? Then check it elsewhere.</li><li>Did I share anything <b>private</b>?</li><li>Am I still the one <b>deciding</b>?</li></ol>` },
      { h: 'You\'re ready', body: `<p>You now know more about AI than most people: how it learns, how it writes, why it slips up, how to ask well, and how to stay safe.</p>
        <p>The best next step is to try it. Open a chatbot and ask it to <em>"explain something you've always wondered about, in simple words"</em>.</p>` },
    ],
    quiz: [
      { q: 'What\'s a good first way to start using AI?', options: ['Ask it to manage your bank account', 'Use it for small jobs you already do, like drafting a message', 'Let it make your medical decisions', 'Give it your passwords to save time'], answer: 1, why: 'Small, everyday tasks are low-risk and teach you how it works.' },
      { q: 'An AI answer is about your money. You should…', options: ['Act on it straight away', 'Check it with a trusted source first', 'Share it widely', 'Assume it\'s right'], answer: 1, why: 'Important answers deserve a second, trusted source.' },
      { q: 'Who should make the final decision?', options: ['The AI', 'You', 'Whoever built the app', 'Nobody'], answer: 1, why: 'AI is a helper. You stay in charge.' },
    ],
  },
];

// Training data for the word predictor: everyday sentences, so its guesses make sense.
export const PREDICT_TEXT = `I like to eat chicken rice for lunch.
I like to drink kopi in the morning.
I like to go to the hawker centre with my family.
I want to eat chicken rice tonight.
I want to go home now.
I want to sleep early tonight.
my family likes to eat chicken rice.
my family likes to go to the beach.
the weather is very hot today.
the weather is very nice today.
the weather is rainy today.
the train is very crowded in the morning.
the train is late again.
the hawker centre is very crowded today.
the chicken rice is very good.
the kopi is very sweet.
we go to the hawker centre for dinner.
we go to the beach on sunday.
we go home after dinner.
please send me the photos.
please call me when you reach home.
see you at the hawker centre.
see you tomorrow morning.
thank you for the dinner.
thank you very much.
can you send me the photos?
can you call me tomorrow?
can you buy kopi for me?`;

export const PREDICT_STARTS = ['i', 'the', 'my', 'we', 'can', 'please'];

// Messages for the scam filter demo. The first group is for teaching; the rest test what it learned.
export const SPAM_TRAIN = [
  { text: 'Congratulations! You won $5000. Click the link to claim your prize now', label: 'scam' },
  { text: 'Hi Ma, can you pick up bread on the way home?', label: 'normal' },
  { text: 'URGENT: your bank account is suspended. Verify your details at this link', label: 'scam' },
  { text: 'Meeting moved to 3pm tomorrow, see you there', label: 'normal' },
  { text: 'Your parcel is held. Pay $1.99 delivery fee now via the link', label: 'scam' },
  { text: 'Thanks for dinner last night, the food was great!', label: 'normal' },
  { text: 'Earn $800 a day working from home. Click to join now, limited spots', label: 'scam' },
  { text: 'Can you send me the photos from Saturday?', label: 'normal' },
];
export const SPAM_TEST = [
  { text: 'You have won a prize! Claim now at this link', label: 'scam' },
  { text: 'Are we still meeting for dinner tomorrow?', label: 'normal' },
  { text: 'Your account will be suspended. Verify now', label: 'scam' },
  { text: 'Please send the photos when you are home', label: 'normal' },
];

// Answers for the "should you double-check this?" demo.
export const CHECK_ITEMS = [
  { text: '"Here are 5 fun ideas for a 7-year-old\'s birthday party."', risky: false, why: 'Ideas are low-risk. If one is odd, just skip it.' },
  { text: '"The Supreme Court ruled on this in Tan v. Lim [2019] SGCA 88."', risky: true, why: 'Case names and citations are a classic thing for AI to invent. Check the real record.' },
  { text: '"Take 2 tablets every 4 hours, up to 12 a day."', risky: true, why: 'Medicine doses must come from the label, a pharmacist or a doctor.' },
  { text: '"Here\'s a friendlier way to word your message to your neighbour."', risky: false, why: 'Rewording is a strength, and you can see for yourself if it reads well.' },
  { text: '"The MRT fare from Jurong East to Changi Airport is $1.42."', risky: true, why: 'Exact prices change and are easy for AI to get wrong. Check the official source.' },
  { text: '"Photosynthesis is how plants turn sunlight into food."', risky: false, why: 'Well-known basic facts are usually right, though still worth a glance.' },
];

// The "good at or careful?" sorting game.
export const SORT_ITEMS = [
  { text: 'Turn my messy notes into a clear email', good: true },
  { text: 'Tell me today\'s exact share price', good: false },
  { text: 'Explain my phone bill in simple words', good: true },
  { text: 'Decide if I should stop taking my medicine', good: false },
  { text: 'Give me 10 ideas for a team lunch', good: true },
  { text: 'Write the quotes I\'ll put in my school report as real sources', good: false },
  { text: 'Help me practise ordering food in Japanese', good: true },
  { text: 'Fill in my tax form and submit it', good: false },
];

// Ready-made prompts for the Prompts tab. [brackets] are blanks to fill in.
export const PROMPTS = [
  { emoji: '📄', title: 'Explain a letter or bill', text: 'Explain this letter in simple words. Tell me what it means, what I need to do and by when. Here it is: [paste the text]' },
  { emoji: '✉️', title: 'Write a polite message', text: 'Write a short, polite message to [who] about [what]. Keep it friendly and under 80 words.' },
  { emoji: '🍳', title: 'Cook with what I have', text: 'I have [list what\'s in your fridge]. Suggest 3 easy dinners for [number] people that take under 30 minutes. Keep the steps simple.' },
  { emoji: '🗺️', title: 'Plan a day out', text: 'Plan a relaxed day out in [place] for [who, e.g. 2 adults and a 6-year-old] on a budget of [amount]. Include food stops and rest breaks.' },
  { emoji: '🎓', title: 'Learn something new', text: 'Explain [topic] to me like I\'m a beginner. Use an everyday example, then ask me 3 short questions to check I understood.' },
  { emoji: '📝', title: 'Summarise something long', text: 'Summarise this in 5 bullet points, then tell me the one most important thing: [paste the text]' },
  { emoji: '🌏', title: 'Translate naturally', text: 'Translate this into [language] the way a local would say it, not word for word: [text]' },
  { emoji: '🗣️', title: 'Practise a conversation', text: 'Let\'s practise [language or situation, e.g. a job interview]. You play [role]. Ask me one question at a time and gently correct my mistakes.' },
  { emoji: '⚖️', title: 'Compare options', text: 'Help me compare [option A] and [option B] for [my situation]. Make a simple table of pros and cons, then list what I should double-check myself.' },
  { emoji: '👧', title: 'Homework helper (for kids)', text: 'My child is in [level] and stuck on this question: [question]. Don\'t give the answer. Give hints step by step so they can solve it themselves.' },
  { emoji: '🩺', title: 'Prepare for a doctor\'s visit', text: 'I\'m seeing a doctor about [symptom or condition]. What questions should I ask, and what should I note down beforehand? (I know you\'re not a doctor.)' },
  { emoji: '🧐', title: 'Check an answer', text: 'Look at your last answer again. Which parts are you least sure about, and what should I check with an official source?' },
];

export const GLOSSARY = [
  ['AI (artificial intelligence)', 'Software that learns patterns from examples to do things that usually need human thinking.'],
  ['Generative AI', 'AI that creates new text, pictures, audio or video.'],
  ['Chatbot', 'An app you talk to in normal language, such as ChatGPT, Gemini, Claude or Copilot.'],
  ['Large language model (LLM)', 'The engine inside a chatbot: a huge model trained on text to predict the next word.'],
  ['Prompt', 'What you type to the AI: your question or instructions.'],
  ['Token', 'A chunk of text (often part of a word) that AI reads and writes. About 100 tokens ≈ 75 English words.'],
  ['Context window', 'How much text the AI can keep in mind at once, counted in tokens.'],
  ['Training', 'Teaching an AI by showing it many examples and correcting its guesses.'],
  ['Training data', 'The examples an AI learned from.'],
  ['Hallucination', 'When AI confidently makes up something untrue.'],
  ['Knowledge cut-off', 'The date the AI\'s training data stops; it may not know later events unless it can search.'],
  ['Bias', 'When one-sided training data makes AI work worse or unfairly for some people or cases.'],
  ['Temperature', 'A setting for how random or creative the AI\'s word choices are.'],
  ['Deepfake', 'AI-made video, voice or image imitating a real person.'],
  ['Model', 'The trained AI itself. Companies release new models as they improve them.'],
  ['Agent', 'An AI that can take actions for you, such as booking or filling in forms, not just chat. Give it access carefully.'],
  ['Multimodal', 'AI that understands more than text: pictures, voice or video too.'],
];
