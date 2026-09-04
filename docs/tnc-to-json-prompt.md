# T&C → JSON extraction prompt

Generated from `frontend/src/lib/importPrompt.js` — run `npm run prompt:doc` after editing it.
The same text sits behind **Manage → Import JSON → Copy prompt** in the app.

## How to use it

1. Copy everything in the block below.
2. Paste it into any AI (Claude, ChatGPT, Gemini — anything that reads a document).
3. Replace the last line with the campaign's T&C text, or attach the T&C PDF and leave a note
   saying the terms are attached.
4. Copy the JSON it returns.
5. In the tracker: **Manage → Import JSON**, paste, check the preview, hit **Register**.

The dashboard is tolerant about what comes back — a fenced code block, a bare array, a single
object, "5%" instead of 0.05, `31/12/2026` instead of `2026-12-31` all parse. What it will not
do is invent a value the model left `null`: those show amber in the preview for you to fill.

## The prompt

Copy everything between the outer fences (the inner ```json block is part of the prompt).

~~~~text
You are a careful terms-and-conditions analyst for Malaysian credit-card cashback campaigns. I will give you the full Terms & Conditions of one campaign. Extract it into JSON for my tracker.

Return ONLY a JSON code block. No commentary before or after it.

## Output shape

```json
{
  "schema": "cb-campaign-import/v1",
  "source_document": "<name/date of the T&C document, or null>",
  "campaigns": [
    {
      "title": "<short human name, e.g. '5% Online Cashback'>",
      "card": { "bank": "<issuing bank>", "name": "<card product name, or null>" },
      "category": "Online | Dining | Groceries | Petrol | Travel | Contactless | Overseas | Utilities | Other",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "min_spend_threshold": <number in RM, or null>,
      "earning_rate": <decimal, e.g. 0.05 for 5%, or null>,
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
```

## Rules

1. **Never guess.** If the T&C does not state something, put `null`. A blank I can fill in is far better than a plausible number that is wrong. This applies especially to min_spend_threshold, cashback_cap, cap_period and is_fcfs.
2. **One object per distinct deal.** If the T&C defines different rates or caps for different categories (5% online AND 2% dining), emit one campaign object each. If it defines spend tiers (spend RM1,000 earn 5%, spend RM3,000 earn 8%), emit one object per tier and put the tier in the title, e.g. "8% Online (RM3,000 tier)".
3. **`_source` is mandatory** for every field you filled with a number or a date: `earning_rate`, `cashback_cap`, `cap_period`, `min_spend_threshold`, `start_date`, `end_date`. Quote the T&C sentence **verbatim** — do not paraphrase. If you cannot quote a sentence for a value, the value should be `null`.
4. **Dates** are ISO `YYYY-MM-DD`. The campaign window is the *spending/qualifying* period, not the registration period and not the payout date. If the T&C gives a registration deadline, that belongs in `notes`, not in the dates.
5. **`earning_rate` is a decimal fraction**: 5% becomes 0.05, 0.5% becomes 0.005. If the reward is a flat amount rather than a percentage (e.g. "RM30 cashback"), set `earning_rate` to null and describe it in `notes`.
6. **`cap_period`**: `"monthly"` if the cap resets each calendar month, `"campaign"` if it is one cap across the whole campaign. If the T&C is ambiguous, use `null`.
7. **`is_fcfs`**: true only if the T&C says the reward is limited to the first N customers or a limited pool/quota. Set `pool_risk_level` to "High" when the quota looks small or is explicitly first-come-first-served, "Medium" when a quota exists but is large, "Low" otherwise.
8. **`statement_name`**: only fill this if the T&C literally names the descriptor that will appear on the statement or SMS. Otherwise `null`.
9. **Do not invent the card.** Use the bank and card product exactly as the T&C names them. If it covers several cards, emit one campaign object per card.
10. **`confidence`**: "high" only when the document is explicit about rate, cap and dates. Use "low" if you are reading a summary, a marketing page, or an unclear scan.

## The T&C

<<< PASTE THE FULL TERMS & CONDITIONS TEXT HERE >>>
~~~~
