-- Batch 2: slides 13–24
INSERT INTO public.presentation_scripts
  (account_id, slide_report_id, report_name, report_period,
   slide_number, slide_title, section, script, tags)
VALUES
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   13, $S$SEM Year-to-Date Performance$S$, $S$SEM$S$,
   $S$The YTD chart shows SEM spend coming down month-over-month — $9.3K in January to $7.5K in April — while revenue stays strong. That's efficiency improvement, not budget cuts. We've been trimming waste.

The ROAS comparison matters: 2025 full year was 44.3× at 2.3% CoS. 2026 YTD is 31.3× at 3.2% CoS. That gap is partly seasonal — 2025's AFL back half produced extraordinary SEM returns — and partly because 2026 has more diverse spend in campaigns that are still building efficiency.

The key message: H2 2026 is when the SEM program needs to be firing on all cylinders. AFL Grand Final in September is the peak opportunity. We need campaigns structured, creatives refreshed, and bids optimised in June — not September. That's a concrete project milestone.$S$,
   ARRAY['sem', 'ytd', 'jan-apr', '2025-comparison', 'afl']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   14, $S$Creative Asset Brief$S$, $S$SEM$S$,
   $S$Creative is the unseen lever in SEM performance. Most people think Google Ads is bids and targeting — and it is — but PMax campaigns are heavily influenced by asset quality. Google's ML allocates more impressions to campaigns with richer asset sets and higher quality scores.

The asset brief ensures every hotel has a complete library. Crucially, video is missing for several hotels right now. PMax campaigns with video get significantly better placement in YouTube and Display inventory — this is a meaningful performance gap.

For Q3 AFL, we need stadium-proximity creative emphasising walkability — Brady Hotels to Marvel Stadium in X minutes on foot. Those assets need to be in production in June for September readiness. Creative production lead time is the constraint, not ad spend.$S$,
   ARRAY['sem', 'creative', 'pmax', 'video', 'assets', 'afl']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   15, $S$SEM Monthly Forecast 2026$S$, $S$SEM$S$,
   $S$The forecast is event-driven because Melbourne SEM demand isn't a flat curve — it spikes around major events. AFL Grand Final in September: $11.2K spend projecting $285K revenue. Spring Racing October: similarly elevated.

May is the immediate focus at $8.4K projecting $208K. That's slightly below April's absolute revenue because April had some Easter demand — but the efficiency is improving as we scale the right campaigns.

The embedded event strategy is the mechanism for this entire forecast: Mother's Day May, Melbourne Writers Festival August, AFL September, Spring Racing October. We're not reacting to events — we have campaign briefs and budget allocations ready before each one arrives. That's the competitive advantage.$S$,
   ARRAY['sem', 'forecast', '2026', 'events', 'afl', 'may']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   16, $S$Metasearch — Section Cover$S$, $S$Metasearch$S$,
   $S$Metasearch — Google Hotel Ads, Trivago, TripAdvisor. $1.6K spend, $53.6K revenue, 32.7× ROAS. Your highest-efficiency paid channel by a significant margin. The conversation now is why and how we grow it responsibly.$S$,
   ARRAY['metasearch', 'section-cover']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   17, $S$How Metasearch Works$S$, $S$Metasearch$S$,
   $S$Metasearch is structurally different from SEM or Social — there's no top or mid-funnel here. Users arriving in metasearch have already decided to go to Melbourne and are comparing rates. The question is purely whether Brady Hotels' rate presentation wins.

That makes metasearch uniquely dependent on two factors partly outside our direct control: the rate being offered and the review score against competitors. The CPC bid determines how prominently Brady appears — but if the rate is uncompetitive or reviews are weaker, the click won't convert regardless of bid spend.

We're not yet active in the top-funnel metasearch placements — sponsored TripAdvisor listings, Trivago featured placements. That's a future phase. For now, we're maximising bottom-funnel performance where conversion rates are already strong across all four hotels.$S$,
   ARRAY['metasearch', 'funnel', 'rate', 'reviews', 'tripadvisor']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   18, $S$Metasearch Performance by Hotel$S$, $S$Metasearch$S$,
   $S$Flinders Street stands out at 40× ROAS and 6.55% conversion rate. Why? The apartment format resonates strongly in metasearch — apartment guests typically have longer stays and higher booking values at $564 AOV. Apartment rates in Melbourne are also less saturated in metasearch than standard hotel inventory, meaning lower bid competition for equivalent placement.

Jones Lane is the outlier at $338 AOV — $145 below portfolio average. This is a rate strategy issue, not a marketing issue. The metasearch campaigns can't lift a rate that isn't competitive. The action here is a rate plan review specifically for Jones Lane: minimum stay restrictions, weekend rate optimisation, and direct booking rate alignment to Booking.com parity.

Hardware Lane at $17K absolute revenue is your highest metasearch contributor. With 34.5× ROAS there's clear headroom to increase spend and volume without sacrificing efficiency.$S$,
   ARRAY['metasearch', 'by-hotel', 'roas', 'aov', 'conversion']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   19, $S$Channel Split & Free Booking Links$S$, $S$Metasearch$S$,
   $S$Two signals. First, Google Hotel Ads is driving 87% of metasearch revenue — TripAdvisor is at just 1%. TripAdvisor users typically have higher booking intent and review-awareness. Increasing TripAdvisor budget by $300/month is low-risk, high-upside — it's currently so underfunded it's not contributing meaningfully.

Second: free booking links are generating 43% of metasearch revenue. This is the zero-cost organic metasearch channel — Brady Hotels appearing in Google's free hotel listings. Improving the data quality of our hotel feeds — room types, rates, photos, cancellation policies kept current — improves free link performance without additional spend. This is one of the highest-leverage zero-cost improvements available.$S$,
   ARRAY['metasearch', 'google-hotel-ads', 'tripadvisor', 'free-links']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   20, $S$Bidding Strategy & Recommendations$S$, $S$Metasearch$S$,
   $S$The bidding strategy in plain terms. We're recommending targeted CPC increases for Flinders Street (+20%) and Jones Lane (+25%).

Flinders Street: at 40× ROAS and 6.55% conversion, this hotel has proven it converts. Increasing the bid gets more impressions and clicks that will convert at the same rate — a pure volume play on a proven performer.

Jones Lane +25% despite the AOV concern: the conversion rate is actually strong at 6.05%, and the current CPC at $0.59 is the lowest in the portfolio. There's room to increase visibility and volume before needing to touch the rate strategy. Ideally we do both simultaneously — raise bids AND lift AOV — but the bid move is faster to implement this week.

Central and Hardware Lane we're holding — Central is a volume property already efficient; Hardware we're testing the weekend rate uplift first before adjusting bids.$S$,
   ARRAY['metasearch', 'bidding', 'cpc', 'flinders', 'jones-lane']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   21, $S$Metasearch Year-to-Date$S$, $S$Metasearch$S$,
   $S$Metasearch was only properly structured from January 2026. The YTD pattern shows variable month-to-month revenue — $51K January to $67K March — which reflects Melbourne's event-driven demand profile.

The March spike is attributable to Melbourne Convention Week which drove above-average MCEC-adjacent accommodation demand — exactly the audience our MCEC landing page now targets.

The 2025 comparison is important context: metasearch was running at 11.2× ROAS in H2 2025. We've taken that to 31.4× in 2026 by structuring the bids correctly. That's a significant channel maturation story in four months — and there's more improvement to come as we implement the bid adjustments and TripAdvisor expansion.$S$,
   ARRAY['metasearch', 'ytd', '2025-comparison', 'mcec']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   22, $S$Metasearch Forecast 2026$S$, $S$Metasearch$S$,
   $S$The metasearch forecast is deliberately conservative — 28-32× ROAS through the year. The AFL September spike is forecast at 35× because historically metasearch over-delivers during peak Melbourne events when demand outpaces supply and any hotel with a good rate wins the comparison almost automatically.

The CPC adjustments, TripAdvisor increase, and Singapore push we've outlined will lift actual numbers above these forecasts if implemented. These projections assume the status quo on bids — which we're changing this week. The upside is real and the downside is protected by the strong existing conversion rates.$S$,
   ARRAY['metasearch', 'forecast', '2026', 'afl', 'september']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   23, $S$Social — Section Cover$S$, $S$Social$S$,
   $S$Meta Ads — Facebook and Instagram. $5.4K spend in April, $103K attributed revenue, 18.9× ROAS. Social tells a different story from SEM and Metasearch — the dynamics behind the numbers are more nuanced. Let me walk through it.$S$,
   ARRAY['social', 'section-cover', 'meta', 'facebook', 'instagram']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   24, $S$Social Funnel Architecture$S$, $S$Social$S$,
   $S$The Social funnel is structured differently to SEM — and the funnel architecture explains why we manage it the way we do.

The bottom-funnel booking campaigns generate most of the direct revenue attribution, but they only work because mid and top funnel is warming audiences over time. Here's the key dynamic: Meta's algorithm needs an audience to work with. The more quality signals we feed it — video views, engagement, website visits — the better it identifies lookalike audiences who are likely to book.

Right now we're heavy on mid and bottom funnel but light on top-funnel awareness. That's sustainable short-term but creates a lead generation deficit over 6-12 months as current audiences fatigue.

The recommendation: don't pull back on bottom-funnel — it's delivering revenue. Build the upper funnel in parallel with awareness video content at lower CPMs that expands the remarketing pool. This is a May-June structural project.$S$,
   ARRAY['social', 'funnel', 'awareness', 'remarketing', 'lookalike'])
;