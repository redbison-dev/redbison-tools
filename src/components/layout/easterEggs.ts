/** Local-only fun: no network, no tracking, just arrays. */

export const JOKES: string[] = [
  'There are only two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I JOIN you?'",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "A programmer's spouse says: 'Go to the store and buy a loaf of bread. If they have eggs, buy a dozen.' The programmer returns with twelve loaves of bread.",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "'It works on my machine.' — ancient proverb, carved above a container registry",
  'A UDP packet walks into a bar. The bartender doesn\'t acknowledge it.',
  "I'd tell you a joke about recursion, but first I'd have to tell you a joke about recursion.",
  'Why did the developer go broke? Because they used up all their cache.',
  '!false — it\'s funny because it\'s true.',
  'The best thing about a Boolean is that even if you are wrong, you are only off by a bit.',
  "A regex walked into a bar. The bartender said 'what can I get you?' It said: '^$' — nothing, I'm just looking.",
  'Knock knock. Race condition. Who\'s there?',
  'To understand what recursion is, you must first understand what recursion is.',
  "Debugging: being the detective in a crime movie where you are also the murderer.",
];

export const FORTUNES: string[] = [
  'A bug avoided is worth two fixed. Review before you run.',
  'The test you skip today is the incident you debug this weekend.',
  'Your next refactor will delete more code than it adds. This is good luck.',
  'A wise engineer commits early and often. A wiser one writes the message first.',
  'Someone will thank you for the comment you almost did not write.',
  'The flaky test is trying to tell you something. Listen before you retry.',
  'Great fortune awaits behind a well-named variable.',
  'You will find the missing semicolon where you least expect it: exactly where the error says.',
  'Backups you have never restored are rumors, not backups.',
  'The simplest solution that could possibly work usually does.',
  'He who ships on Friday learns patience on Saturday.',
  'An unread log file holds the answer you are googling.',
  'Tomorrow you will close a tab you opened three weeks ago. Freedom follows.',
  'Your rubber duck already knows the answer. Ask it out loud.',
];

export const randomOf = (list: string[]): string => list[Math.floor(Math.random() * list.length)];
