// The prompt the user hands to any LLM together with a campaign's T&C.
// Single source of truth: the Import panel's "Copy prompt" button copies this
// verbatim, and docs/tnc-to-json-prompt.md is generated from it.
export const TNC_EXTRACTION_PROMPT = `You are a careful terms-and-conditions analyst for Malaysian credit-card cashback campaigns. I will give you the full Terms & Conditions of one campaign. Extract it into JSON for my tracker.

Return ONLY a JSON code block. No commentary before or after it.

## Output shape

\`\`\`json
{
  "schema": "cb-campaign-import/v2",
  "source_document": "<name/date of the T&C document, or null>",
  "campaigns": [
    {
      "title": "<short human name, e.g. '5% Online Cashback'>",
      "card": { "bank": "<issuing bank>", "name": "<card product name, or null>" },
      "category": "Online | Dining | Groceries | Petrol | Travel | Contactless | Overseas | Utilities | Other",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "min_spend_threshold": <number in RM, or null>,
      "reward": {
        "type": "percentage | per_spend | flat",
        "rate": <decimal for "percentage", e.g. 0.05 for 5%; otherwise null>,
        "cashback_amount": <RM earned: per block for "per_spend", the fixed reward for "flat"; otherwise null>,
        "spend_amount": <RM spent: the block for "per_spend", the spend needed for "flat"; otherwise null>
      },
      "earning_rate": <decimal the tracker multiplies spend by, worked out from "reward" per rule 5, or null>,
      "cashback_cap": <number in RM, or null>,
      "cap_period": "monthly | campaign",
      "is_fcfs": <true | false | null>,
      "pool_risk_level": "Low | Medium | High",
      "statement_name": "<exact descriptor the bank prints on the statement, or null>",
      "payout_note": "<when/how cashback is credited, in the T&C's own words, or null>",
      "notes": "<exclusions, eligible merchants, registration steps — anything I must not forget>",
      "confidence": "high | medium | low",
      "_source": {
        "<field_name>": "<verbatim sentence from the T&C that backs this value>"
      }
    }
  ]
}
\`\`\`

## Rules

1. **Never guess.** If the T&C does not state something, put \`null\`. A blank I can fill in is far better than a plausible number that is wrong. This applies especially to min_spend_threshold, cashback_cap, cap_period and is_fcfs. Arithmetic on figures the T&C *does* state (rule 5) is not guessing — do it.
2. **One object per distinct deal.** If the T&C defines different rates or caps for different categories (5% online AND 2% dining), emit one campaign object each. If it defines spend tiers (spend RM1,000 earn 5%, spend RM3,000 earn 8%), emit one object per tier and put the tier in the title, e.g. "8% Online (RM3,000 tier)".
3. **\`_source\` is mandatory** for every field you filled with a number or a date: \`earning_rate\`, \`cashback_cap\`, \`cap_period\`, \`min_spend_threshold\`, \`start_date\`, \`end_date\`. Quote the T&C **verbatim** — do not paraphrase. When the figure sits in a table, quote the table row as it reads (e.g. "Online Spend | 5% | RM50"). For \`earning_rate\`, quote the reward clause it was worked out from. If you cannot quote anything for a value, the value should be \`null\`.
4. **Dates** are ISO \`YYYY-MM-DD\`. The campaign window is the *spending/qualifying* period, not the registration period and not the payout date. If the T&C gives a registration deadline, that belongs in \`notes\`, not in the dates.
5. **\`earning_rate\` is required whenever the T&C states a reward with a ringgit value** — cashback, statement credit, or an e-voucher / gift card of a stated RM amount. The tracker multiplies spend by it to estimate cashback, so \`null\` here means an estimate of RM0. Put the reward in \`reward\` exactly as the T&C phrases it, then work out \`earning_rate\` as a decimal fraction (5% = 0.05, 0.5% = 0.005 — never 5):
   - "5% cashback" → \`reward\` \`{ "type": "percentage", "rate": 0.05 }\`, \`earning_rate\` 0.05.
   - "RM1 cashback for every RM20 spent" → \`{ "type": "per_spend", "cashback_amount": 1, "spend_amount": 20 }\`, \`earning_rate\` 0.05.
   - "Spend RM500 and receive RM30 cashback" → \`{ "type": "flat", "cashback_amount": 30, "spend_amount": 500 }\`, \`earning_rate\` 0.06 (the effective rate at the qualifying spend). Also set \`min_spend_threshold\` to 500, and \`cashback_cap\` to 30 unless the T&C states a different cap.
   - Only when the reward cannot be tied to an amount of spend — points with no stated cash conversion, a lucky draw, a fixed reward for a first transaction of any size — set \`reward\` and \`earning_rate\` to null and explain the reward in \`notes\`.
6. **\`cap_period\`**: \`"monthly"\` if the cap resets each calendar month, \`"campaign"\` if it is one cap across the whole campaign. If the T&C is ambiguous, use \`null\`.
7. **\`is_fcfs\`**: true only if the T&C says the reward is limited to the first N customers or a limited pool/quota. Set \`pool_risk_level\` to "High" when the quota looks small or is explicitly first-come-first-served, "Medium" when a quota exists but is large, "Low" otherwise.
8. **\`statement_name\`**: only fill this if the T&C literally names the descriptor that will appear on the statement or SMS. Otherwise \`null\`.
9. **Do not invent the card.** Use the bank and card product exactly as the T&C names them. If it covers several cards, emit one campaign object per card.
10. **\`confidence\`**: "high" only when the document is explicit about rate, cap and dates. Use "low" if you are reading a summary, a marketing page, or an unclear scan.

## The T&C

<<< PASTE THE FULL TERMS & CONDITIONS TEXT HERE >>>`
