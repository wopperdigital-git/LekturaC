/**
 * Writing-style rules against the stock patterns of AI prose, adapted from the
 * humanizer skill (itself based on Wikipedia's "Signs of AI writing").
 *
 * Two layers, one source:
 * - `PLAIN_WORDS_RULES`: word choice and punctuation. Fits any text, however
 *   short, so the quiz prompt carries it too.
 * - `PLAIN_LANGUAGE_RULES`: those plus the rules about how sentences and
 *   arguments are built. Shared verbatim by every prompt that writes prose: the
 *   deck system prompt (slides and speaker notes), the repair prompt (a
 *   repaired slide must read like the rest) and the narration prompt (a cloned
 *   voice reads it aloud, where these patterns are most obvious).
 *
 * The quiz gets only the first layer because its budget is the tightest: the
 * free Groq chain only, ~8,000 tokens a minute counting the deck text, the
 * ALREADY ASKED list and the requested output (see `quizMaxTokens`), and the
 * prose rules (endings, unnamed experts, habitual threes) don't apply to a
 * one-line question anyway.
 *
 * Kept short on purpose: it rides in every call's input. Add a rule only for a
 * pattern seen in real output.
 */
export const PLAIN_WORDS_RULES = `- Write the way a person explains something to a colleague. Prefer plain verbs: "is", "are", "has", not "serves as", "stands as", "boasts", "represents".
- Never use: delve, tapestry, testament, pivotal, crucial, vibrant, intricate, interplay, realm, showcase, underscore, foster, garner, enhance, "highlight" as a verb, "landscape" for anything that is not land, "plays a vital/key/crucial role", "in today's fast-paced world", "it's important to note", "at its core", "the real question is", "let's dive in", "let's explore".
- No em dashes (—), en dashes (–) or double hyphens (--). Use a comma, colon, period or parentheses instead, and write ranges with "to" ("2019 to 2024"). No emoji.`

export const PLAIN_LANGUAGE_RULES = `${PLAIN_WORDS_RULES}
- Do not inflate ordinary facts: no "marks a turning point", "a new era", "reshaping the", "sets the stage for" unless the evidence says it in those terms. Say what happened.
- No "not just X, but Y" or "it's not X, it's Y" constructions, and no clipped endings such as "no guesswork."
- Do not tack an -ing phrase onto a fact to make it sound deeper ("..., highlighting its importance", "..., reflecting a broader shift").
- Do not group things in threes by habit. List as many as the content really has.
- Never credit a claim to unnamed "experts", "studies" or "reports". Cite the evidence pack's source or state the fact plainly.
- At most one qualifier per claim; never stack hedges ("could potentially", "may arguably").
- No vague upbeat ending ("the future looks bright", "exciting times ahead"). End on a concrete point.`
