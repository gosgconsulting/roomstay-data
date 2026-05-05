-- Batch 3: slides 25–36
INSERT INTO public.presentation_scripts
  (account_id, slide_report_id, report_name, report_period,
   slide_number, slide_title, section, script, tags)
VALUES
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   25, $S$Social Performance by Hotel$S$, $S$Social$S$,
   $S$Jones Lane had the best Social ROAS this month at 25.5×. That's interesting because in SEM it's the softest performer. The reason: Jones Lane's Social campaigns have been running longer and Meta's algorithm has had more time to optimise for the specific audience profile that converts for that property.

Central Melbourne is the outlier at 10.5× — below portfolio average and well below what the other hotels are achieving. The cause isn't the property — it's the campaign targeting and creative. Central is a higher-volume, lower-ADR hotel and the current creative isn't differentiating it from the other properties. The action: replace underperforming creative and test new audience targeting for Central's segment — CBD corporate short-stay and leisure weekender are genuinely different audiences that need separate creative briefs.

The Group campaign at 19.5× is performing correctly — group bookings have a longer consideration cycle and 30-day attribution doesn't fully capture the RFQ-to-booking journey. The real value is in the downstream group revenue.$S$,
   ARRAY['social', 'by-hotel', 'roas', 'jones-lane', 'central']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   26, $S$Audience & Device Analysis$S$, $S$Social$S$,
   $S$The audience data is one of the most actionable slides in the deck. F45-54 and F55-64 are your highest-performing segments. F65+ at 2.69% CTR is actually the best click-through performer in the portfolio. M18-24 is the worst by a wide margin at 0.78%.

What this tells us about Brady Hotels' organic customer: you're attracting mature female travellers — couples getaways, milestone birthdays, girlfriends' weekends. The marketing resonates with them and we should lean in hard.

Practical actions: build a lookalike audience from F45-64 converters; increase bids for F65+ by 30%; exclude M18-24 from all ad sets. That exclusion alone improves average CTR and gives the algorithm cleaner quality signals.

On device: 96% of Social revenue comes from mobile app. Desktop at 0.66% CTR versus mobile's 1.57% is a clear indicator — exclude desktop spend and redirect entirely to mobile where conversion is proven.$S$,
   ARRAY['social', 'audience', 'demographics', 'mobile', 'device']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   27, $S$Membership Campaign Performance$S$, $S$Social$S$,
   $S$The membership campaign is a lead generation play, not a direct booking campaign — and that distinction matters for how we evaluate it.

30 leads at $9.87 CPL is a healthy cost. The question is what happens downstream when those leads enter the CRM. This campaign's value is NOT measured in immediate bookings. It's measured in member LTV — the repeat bookings generated from members over 12-24 months. If each member books 2× per year at $350 average, the $9.87 CPL returns many times over.

The immediate action: ensure the lead handoff between Meta and the CRM is functioning correctly. Leads need to enter a nurture sequence within 24 hours — not sit in a static list. That handoff is the conversion lever that justifies continued investment in this campaign. Without it, the CPL is being wasted.$S$,
   ARRAY['social', 'membership', 'cpl', 'crm', 'leads']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   28, $S$Social Action Plan$S$, $S$Social$S$,
   $S$The Social action plan follows the same logic as SEM: scale what's working, hold what's stable, cut what isn't.

The Group daily sales campaign at 3.37% CTR is the standout — more than double the channel average. Meta's algorithm has found a highly resonant audience. The constraint is just budget. +25% spend with three fresh creative variants projects $5K incremental revenue.

For Central Melbourne — a complete creative refresh with a tight brief. Two distinct audience directions: CBD corporate midweek and leisure weekend. These are genuinely different people with different motivations, and one creative can't serve both well. Splitting into two ad sets is the structural fix.

The Autumn Sale creative is paused. Running Easter-season creative in May actively hurts CTR and wastes impression budget on irrelevant creative. Pausing frees that budget for the Group campaign scale-up.$S$,
   ARRAY['social', 'action-plan', 'creative', 'may-2026', 'group']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   29, $S$Social Year-to-Date$S$, $S$Social$S$,
   $S$Social's YTD pattern shows something important: January spend was flat but revenue was below Q2-Q4 2025 despite higher overall traffic. The Social campaigns have matured significantly by April — the algorithm has had four months to learn.

The 2025 comparison is partial — only from June 2025. But YTD 2026 ROAS at 4.8× is broadly in line with 2025's 5.0×. That's steady, not accelerating. The acceleration driver going forward is the F45-64 LAL audience we're building — once that audience matures in Q3, we expect a measurable ROAS improvement because we'll be reaching a more qualified pool with less wasted impressions.$S$,
   ARRAY['social', 'ytd', 'jan-apr', '2025-comparison', 'algorithm']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   30, $S$Creative Performance Analysis$S$, $S$Social$S$,
   $S$Creative is where Social performance is made or broken — and the April data makes this undeniable.

Two clear signals: vertical video at 9:16 significantly outperforms static images on Reels and Stories. UGC-style video creative outperforms everything else. The 3.36% CTR from UGC video versus 1.19% from legacy static creative is a 2.8× performance difference on similar spend.

The practical implication: invest in short-form video production. The good news is this doesn't require expensive production. Authentic, smartphone-shot content performs better than studio photography in Meta's current algorithm. The hook matters — first 3 seconds determine whether someone keeps scrolling. 'This is what you see from your window at Hardware Lane' or 'This rate disappears Friday midnight' are the types of hooks that stop the scroll.$S$,
   ARRAY['social', 'creative', 'ugc', 'video', 'ctr', 'reels']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   31, $S$Social Monthly Forecast 2026$S$, $S$Social$S$,
   $S$The Social forecast is the most growth-oriented of the three channels. We're projecting spend to increase from $5.4K in April to $7.5K in July during school holiday peak — and attributed revenue growing correspondingly.

School holidays in July are the critical Social opportunity — families and couples looking for Melbourne experiences, AFL season starting, winter weekenders. The creative needs to be ready in June: hotel lifestyle, local Melbourne experience, 'Melbourne winter with a warm room' narrative. The campaign briefs are already drafted — production is the next step.$S$,
   ARRAY['social', 'forecast', '2026', 'school-holidays', 'july']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   32, $S$Creative Before & After$S$, $S$Social$S$,
   $S$This is the proof point for the entire creative strategy. The before/after data is unambiguous.

The new Saver Rate creative launched April 1st: 2.60% CTR. The legacy Book Direct creative it replaced: 1.19% CTR. The same budget, more than double the clicks. UGC video at 3.36% CTR is 2.8× the legacy performance.

The message is simple: creative quality is the highest-leverage variable in Meta performance right now. The targeting is good. The audience is right. The bidding is efficient. What moves the needle further is better creative. That's why the creative refresh and video production pipeline is at the top of the Social action plan.

Every week we run stale creative, we're leaving click-through performance on the table. The refresh cadence should be every 6-8 weeks minimum.$S$,
   ARRAY['social', 'creative', 'before-after', 'ctr', 'saver-rate']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   33, $S$What We Do Next — Paid Channels$S$, $S$Action Plan$S$,
   $S$Pulling the paid channel action plan together. Three channels, three sets of moves, all with projected revenue impact.

SEM: the biggest opportunities this week are scaling Group PMAX — which is returning 49.7× — and launching a Singapore market campaign. The budget released from pausing zero-conversion markets and display retargeting pays for most of the scale-up. Projected: $30K incremental SEM revenue in May.

Metasearch: Flinders Street and Jones Lane bid increases, plus TripAdvisor budget activation. The combination of bid changes and feed optimisation will lift both volume and efficiency. Projected: $8.4K incremental metasearch revenue in May.

Social: Central Melbourne creative refresh and the F45-64 LAL audience build are the two structural changes that will bend the ROAS curve upward over Q2-Q3. These take 2-3 weeks to show measurable results as Meta's algorithm relearns.

Combined: approximately $50K in incremental paid revenue projected for May from these specific changes, without proportional increases in total spend.$S$,
   ARRAY['action-plan', 'paid', 'sem', 'metasearch', 'social', 'may-2026']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   34, $S$SEO — Section Cover$S$, $S$SEO$S$,
   $S$Organic search. April 2026 summary: 3,650 sessions, 203 transactions, $113K organic revenue, 4.6% conversion rate. Five active landing pages. Let me walk through what's driving these numbers, what the risks are, and what we're building next.$S$,
   ARRAY['seo', 'section-cover', 'organic']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   35, $S$Brand vs Generic Traffic$S$, $S$SEO$S$,
   $S$This slide reveals one of the most important dynamics in Brady Hotels' organic performance — and it requires careful interpretation.

Brand searches — people searching 'Brady Hotels Melbourne' or 'Brady apt hotel' — generated 1,542 clicks. But average position dropped from 3.2 to 5.0, and CTR fell from 9.70% to 7.03%. That's significant brand SERP degradation.

Why? Two likely causes. AI Overviews are now appearing above regular search results for branded hotel queries — pushing everything down the page and reducing CTR across the board. And the growth of metasearch sitelinks in branded search results means some branded clicks are going to Google Hotel Ads instead of organic listings.

The implication: people who know Brady Hotels and are actively searching for you are being intercepted before reaching the organic listing. This is why brand SERP defence is a priority — schema markup, Business Profile expansion, and title tag optimisation all help reclaim those clicks.

The generic side is genuinely good news. Generic impressions grew significantly YoY — more people are seeing Brady Hotels in non-branded searches. That's the landing page program working. The impressions growth is the leading indicator that ranked traffic growth follows in Q3.$S$,
   ARRAY['seo', 'brand', 'generic', 'ctr', 'impressions', 'ai-overview']),
  ('3998a594-c07c-46b2-937d-fe477b6e9ce7', '0fde479a-850e-4733-b79e-5e3a97c075ac',
   $S$Brady Hotels x Dijitally — Combined Report$S$, $S$April 2026$S$,
   36, $S$Organic Sessions Year-on-Year$S$, $S$SEO$S$,
   $S$Organic sessions in April: 3,650 — down 16.8% from 4,388 in April 2025. Every 2026 month tracks below the equivalent 2025 month.

Here's why this doesn't concern me as much as it might first appear. 2025's organic growth was driven by content expansion — new pages getting indexed and starting to rank, setting a high watermark. In 2026, we're building the next layer of that infrastructure: five new landing pages, Melbourne Business Hotels and Elizabeth Street in progress.

The comparison will flip when those pages start ranking in earnest. The MCEC page already has 27 terms on page 1. Marvel Stadium hit position #3. These pages are generating incremental traffic that didn't exist in 2025 at all. The full impact of the 2026 content build won't show in the YoY chart until Q3-Q4 — that's when the sessions line crosses back above 2025 levels.$S$,
   ARRAY['seo', 'sessions', 'yoy', '2025-comparison', 'landing-pages'])
;