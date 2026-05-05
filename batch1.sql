-- Batch 1: slides 1–12
INSERT INTO public.presentation_scripts
  (account_id, slide_report_id, report_name, report_period,
   slide_number, slide_title, section, script, tags)
VALUES
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   1, $S$April 2026 Performance Overview$S$, $S$Overview$S$,
   $S$Good morning / afternoon. Today we're walking through Brady Hotels' complete April 2026 performance — the full month across SEM, Metasearch, Social, and Organic Search. April is a transition month in Melbourne — end of summer events, Easter weekend closing, the start of the autumn corporate calendar. What you'll see is that despite April being a softer demand month compared to Q1, the paid channels delivered strong efficiency: $379K revenue at 25.7× ROAS across all channels. More importantly, we'll cover where the underlying opportunities are and exactly what we're implementing in May to accelerate from this base. Let's get into it.$S$,
   ARRAY['overview', 'cover', 'intro', 'april-2026']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   2, $S$Report Agenda$S$, $S$Overview$S$,
   $S$The report runs across six sections. We open with the portfolio overview — per-hotel results and channel mix — then deep-dive each paid channel: SEM, Metasearch, and Social. After each paid section you'll find the specific next steps for May. We then cover SEO and organic, which this month includes five active landing pages with keyword movement data and our AI visibility metrics for the first time. We close with the full-year financial picture — actuals through April and a forecast through December. Data timestamps are on each card: paid channel data complete to 30 April, SEO data to 28 April.$S$,
   ARRAY['overview', 'agenda', 'structure']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   3, $S$Portfolio Overview — Section Cover$S$, $S$Overview$S$,
   $S$Section one. The portfolio overview grounds everything in the actual revenue opportunity across the four properties.$S$,
   ARRAY['overview', 'section-cover', 'portfolio']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   4, $S$Portfolio at a Glance$S$, $S$Overview$S$,
   $S$This slide is about context before performance. The four properties have an estimated $16.7M in full-capacity YTD revenue potential. Marketing is currently attributing $783K of that — a 4.7% blended marketing penetration. That number matters because the ceiling is high: modest improvements in efficiency have outsized revenue impact at this scale.

Hardware Lane at $310 ADR is the most valuable conversion per booking — and its paid performance this month reflects that. Central Melbourne at 146 rooms is the highest-volume property and the biggest opportunity to lift conversion rate. Jones Lane at 153 rooms is your largest property by room count — that scale should be generating more absolute revenue than it currently does, which connects directly to what we'll address in the action plan.$S$,
   ARRAY['overview', 'portfolio', 'hotels', 'adr', 'rooms']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   5, $S$April 2026 — All Channels Combined$S$, $S$Overview$S$,
   $S$April across all channels combined: $368K attributed revenue from $14.6K spend — 25.2× blended ROAS. The most important story here isn't the totals, it's the efficiency gap between hotels.

Hardware Lane leads at $86K revenue. That comes from a combination of premium ADR and well-optimised campaigns. But Jones Lane and Central Melbourne are generating lower absolute revenue despite similar spend levels — that tells us room rate, inventory availability, or ad creative is limiting conversion at those properties specifically.

Brady Group cross-portfolio at 21.3× looks softer — that's expected. Group campaigns are wider-funnel and attract different buyer intent with a longer conversion cycle. The $77K from group campaigns is largely incremental revenue that wouldn't have happened through individual hotel campaigns alone.$S$,
   ARRAY['overview', 'april-2026', 'all-channels', 'roas']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   6, $S$Channel Mix & Revenue Distribution$S$, $S$Overview$S$,
   $S$This slide shows where revenue is coming from and how efficiently each dollar is working. The headline isn't the revenue split — it's the ROAS differentiation across channels.

Metasearch is your most efficient channel at 36.8× ROAS. That's not surprising — metasearch captures high-intent users already in rate-comparison mode. The constraint is scale: it's only contributing $64K because budget is capped at $1,750. There's a strong argument to push more money here.

SEM at 28.1× is the workhorse channel — $212K revenue from $7.5K, operating at excellent efficiency and scale.

Social at 18.9× needs context: Meta's full-attribution model applies longer attribution windows, so the number is real but should be read alongside the other channels. Social's growing value is in audience building and brand recall — not just direct ROAS.

The key strategic question: should we rebalance budget from Social toward Metasearch where every dollar works harder? That's exactly what we address in the action plan.$S$,
   ARRAY['overview', 'channel-mix', 'roas', 'revenue']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   7, $S$YTD January–April 2026$S$, $S$Overview$S$,
   $S$Four months in: $1.34M attributed revenue from $59.5K spend — 22.6× blended ROAS. The seasonal pattern here is important to understand. January was the strongest month at $376K — Melbourne summer events, cricket, music festivals drive strong leisure demand. Revenue softened into April, which is normal — April is a transition month.

Compared to 2025 full year at 30.8×, we're tracking at 22.6× YTD. That gap is mostly seasonal: 2025's back half captured AFL Grand Final which produces exceptional returns. What this chart tells me is that our H2 2026 activation plan needs to be locked in now — because AFL September is the single biggest revenue opportunity of the year and we need campaigns, creatives, and bids in place well before it arrives.$S$,
   ARRAY['overview', 'ytd', 'jan-apr', 'full-year']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   8, $S$SEM — Section Cover$S$, $S$SEM$S$,
   $S$Google Ads. $7.5K spend, $212K revenue, 28.1× ROAS in April. I'll walk through why these numbers look the way they do and exactly what we're doing to grow from here.$S$,
   ARRAY['sem', 'section-cover', 'google-ads']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   9, $S$SEM Funnel Framework$S$, $S$SEM$S$,
   $S$The funnel framework matters because SEM isn't one campaign — it's a layered system where each campaign type has a specific job.

At the top, generic and PMax campaigns capture new audiences who've never heard of Brady. We're competing on relevance and rate for queries like 'hotels Melbourne CBD' or 'boutique hotel near Flinders Street'.

In the mid-funnel, event and membership campaigns target people with a specific reason to be in Melbourne — AFL, conferences, music events — and we connect Brady's location to that reason. This produces the highest ROAS from niche targeting.

Brand search campaigns at the bottom defend against OTA hijacking — when someone searches 'Brady Hotels Melbourne', we want them landing directly on bradyhotels.com.au, not on Booking.com or Expedia.

The strategic opportunity we're chasing is moving more budget into mid-funnel event campaigns and international SEM — specifically Singapore and UK — where ROAS signals are extraordinary but spend is near zero.$S$,
   ARRAY['sem', 'funnel', 'brand', 'generic', 'pmax']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   10, $S$SEM Performance by Hotel$S$, $S$SEM$S$,
   $S$Every hotel is operating above 27× ROAS in Google Ads — Flinders Street 32.3×, Central 31.1×, Hardware Lane 30.4×, Jones Lane 27.3×. That's exceptional performance at scale.

Why is Flinders Street the most efficient? Three reasons: apartment-hotel positioning wins on 'serviced apartment Melbourne' queries where bid competition is lower than standard hotel terms; its $270 ADR makes each booking very valuable; and the landing page converts well — which connects directly to the SEO work on the Flinders page.

Jones Lane at 27.3× is the softest. Its CPC at $0.94 is the highest in the portfolio — we're paying more per click. The action is auditing the keyword set and shifting budget toward lower-competition terms where Jones Lane's waterfront location gives us natural relevance advantage.

The Group at 22.6× serves a different purpose — group RFQ enquiries and membership sign-ups with a longer conversion cycle not fully captured in the 30-day window.$S$,
   ARRAY['sem', 'by-hotel', 'roas', 'cpc', 'google-ads']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   11, $S$SEM Breakdowns — Device & Market$S$, $S$SEM$S$,
   $S$The breakdowns show exactly where to put budget next. Three signals stand out.

First, Tablet at 33.7× ROAS — 20% better than Desktop, 35% better than Mobile. Tablets are typically used by people planning leisure travel at home in the evening — higher intent, larger booking value. We're underinvesting here. The action: 30% bid increase on tablet.

Second, international markets. Singapore 82.5×, Japan 308× on tiny spend, UK 64.9×. These are extraordinary signals that international travellers who find Brady are booking. They're tiny because we don't have dedicated budget or localised ad copy. A $300/month Singapore campaign is the immediate recommendation — one of the highest-confidence ROI moves in the plan.

Third, New Zealand at 1.7× ROAS — destroying value. Every NZ dollar spent returns almost nothing. Pause NZ targeting immediately and redirect that budget to Singapore.$S$,
   ARRAY['sem', 'device', 'international', 'tablet', 'singapore']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   12, $S$SEM Budget Reallocation & Action Plan$S$, $S$SEM$S$,
   $S$This is where we move from reporting to execution. The action plan is structured by priority: scale what's working, defend what's stable, cut what isn't.

Top opportunity: Group PMAX at 49.7× ROAS on $250 spend is massively underfunded. Doubling the budget projects an additional $12.4K revenue from just $250 extra spend — one of the most certain ROI moves in the deck.

Hardware Lane PMax at 40.9× is next — +60% budget projects $8.4K additional revenue.

On the other side: nine markets with zero conversions paused (frees $135); both Display Retargeting campaigns paused (frees $440). That liberated budget goes directly into the scaling campaigns.

Net outcome: projected $30K additional SEM revenue in May without proportionally increasing total spend. The efficiency of the reallocation does the work.$S$,
   ARRAY['sem', 'action-plan', 'pmax', 'budget', 'may-2026'])
;