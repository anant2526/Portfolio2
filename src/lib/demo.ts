import { profile } from "@/content/profile";

/**
 * Offline "demo mode" brain, used when no ANTHROPIC_API_KEY is configured.
 * It picks the FAQ answer whose question/keywords best overlap the user's
 * message, so the whole avatar + voice pipeline can be tried without keys.
 */
const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

export function demoReply(message: string): string {
  const words = new Set(tokenize(message));
  if (words.size === 0) return profile.twin.greeting;

  let best = { score: 0, answer: "" };
  for (const f of profile.twin.faq) {
    const vocab = new Set([...tokenize(f.q), ...(f.keywords ?? [])]);
    let score = 0;
    for (const w of words) if (vocab.has(w)) score += 1;
    if (score > best.score) best = { score, answer: f.a };
  }

  if (/\b(hi|hey|hello|yo|sup)\b/.test(message.toLowerCase()) && best.score < 2) {
    return profile.twin.greeting;
  }
  if (/\bproject|built|portfolio|best\b/i.test(message)) {
    const top = profile.projects[0];
    return `My favourite right now is ${top.title}. ${top.blurb}`;
  }
  if (best.score > 0) return best.answer;

  return `Good question! I'm running in demo mode right now, so my brain is limited to a few canned answers. Once ${profile.firstName} plugs in the Claude API key, I can answer pretty much anything about them.`;
}
