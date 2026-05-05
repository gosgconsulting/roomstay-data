"""
process_brady10.py
─────────────────────────────────────────────────────────────────────────────
Inject a speaker-notes system into the slide deck.
Press N (or click the 📝 button) to toggle an animated notes panel.
Each slide has an optimisation-driven script explaining WHY results happened
and what to implement — not just reading KPIs.
─────────────────────────────────────────────────────────────────────────────
"""

SRC = 'public/slides/brady-april-2026-hybrid.html'

# ─────────────────────────────────────────────────────────────────────────────
# 48 slide scripts — optimisation-driven, not KPI-reading
# ─────────────────────────────────────────────────────────────────────────────
NOTES = {
 1: """Good morning / afternoon. Today we're walking through Brady Hotels' complete April 2026 performance — the full month across SEM, Metasearch, Social, and Organic Search. April is a transition month in Melbourne — end of summer events, Easter weekend closing, the start of the autumn corporate calendar. What you'll see is that despite April being a softer demand month compared to Q1, the paid channels delivered strong efficiency: $379K revenue at 25.7× ROAS across all channels. More importantly, we'll cover where the underlying opportunities are and exactly what we're implementing in May to accelerate from this base. Let's get into it.""",

 2: """The report runs across six sections. We open with the portfolio overview — per-hotel results and channel mix — then deep-dive each paid channel: SEM, Metasearch, and Social. After each paid section you'll find the specific next steps for May. We then cover SEO and organic, which this month includes five active landing pages with keyword movement data and our AI visibility metrics for the first time. We close with the full-year financial picture — actuals through April and a forecast through December. Data timestamps are on each card: paid channel data complete to 30 April, SEO data to 28 April.""",

 3: """Section one. The portfolio overview grounds everything in the actual revenue opportunity across the four properties.""",

 4: """This slide is about context before performance. The four properties have an estimated $16.7M in full-capacity YTD revenue potential. Marketing is currently attributing $783K of that — a 4.7% blended marketing penetration. That number matters because the ceiling is high: modest improvements in efficiency have outsized revenue impact at this scale.

Hardware Lane at $310 ADR is the most valuable conversion per booking — and its paid performance this month reflects that. Central Melbourne at 146 rooms is the highest-volume property and the biggest opportunity to lift conversion rate. Jones Lane at 153 rooms is your largest property by room count — that scale should be generating more absolute revenue than it currently does, which connects directly to what we'll address in the action plan.""",

 5: """April across all channels combined: $368K attributed revenue from $14.6K spend — 25.2× blended ROAS. The most important story here isn't the totals, it's the efficiency gap between hotels.

Hardware Lane leads at $86K revenue. That comes from a combination of premium ADR and well-optimised campaigns. But Jones Lane and Central Melbourne are generating lower absolute revenue despite similar spend levels — that tells us room rate, inventory availability, or ad creative is limiting conversion at those properties specifically.

Brady Group cross-portfolio at 21.3× looks softer — that's expected. Group campaigns are wider-funnel and attract different buyer intent with a longer conversion cycle. The $77K from group campaigns is largely incremental revenue that wouldn't have happened through individual hotel campaigns alone.""",

 6: """This slide shows where revenue is coming from and how efficiently each dollar is working. The headline isn't the revenue split — it's the ROAS differentiation across channels.

Metasearch is your most efficient channel at 36.8× ROAS. That's not surprising — metasearch captures high-intent users already in rate-comparison mode. The constraint is scale: it's only contributing $64K because budget is capped at $1,750. There's a strong argument to push more money here.

SEM at 28.1× is the workhorse channel — $212K revenue from $7.5K, operating at excellent efficiency and scale.

Social at 18.9× needs context: Meta's full-attribution model applies longer attribution windows, so the number is real but should be read alongside the other channels. Social's growing value is in audience building and brand recall — not just direct ROAS.

The key strategic question: should we rebalance budget from Social toward Metasearch where every dollar works harder? That's exactly what we address in the action plan.""",

 7: """Four months in: $1.34M attributed revenue from $59.5K spend — 22.6× blended ROAS. The seasonal pattern here is important to understand. January was the strongest month at $376K — Melbourne summer events, cricket, music festivals drive strong leisure demand. Revenue softened into April, which is normal — April is a transition month.

Compared to 2025 full year at 30.8×, we're tracking at 22.6× YTD. That gap is mostly seasonal: 2025's back half captured AFL Grand Final which produces exceptional returns. What this chart tells me is that our H2 2026 activation plan needs to be locked in now — because AFL September is the single biggest revenue opportunity of the year and we need campaigns, creatives, and bids in place well before it arrives.""",

 8: """Google Ads. $7.5K spend, $212K revenue, 28.1× ROAS in April. I'll walk through why these numbers look the way they do and exactly what we're doing to grow from here.""",

 9: """The funnel framework matters because SEM isn't one campaign — it's a layered system where each campaign type has a specific job.

At the top, generic and PMax campaigns capture new audiences who've never heard of Brady. We're competing on relevance and rate for queries like 'hotels Melbourne CBD' or 'boutique hotel near Flinders Street'.

In the mid-funnel, event and membership campaigns target people with a specific reason to be in Melbourne — AFL, conferences, music events — and we connect Brady's location to that reason. This produces the highest ROAS from niche targeting.

Brand search campaigns at the bottom defend against OTA hijacking — when someone searches 'Brady Hotels Melbourne', we want them landing directly on bradyhotels.com.au, not on Booking.com or Expedia.

The strategic opportunity we're chasing is moving more budget into mid-funnel event campaigns and international SEM — specifically Singapore and UK — where ROAS signals are extraordinary but spend is near zero.""",

10: """Every hotel is operating above 27× ROAS in Google Ads — Flinders Street 32.3×, Central 31.1×, Hardware Lane 30.4×, Jones Lane 27.3×. That's exceptional performance at scale.

Why is Flinders Street the most efficient? Three reasons: apartment-hotel positioning wins on 'serviced apartment Melbourne' queries where bid competition is lower than standard hotel terms; its $270 ADR makes each booking very valuable; and the landing page converts well — which connects directly to the SEO work on the Flinders page.

Jones Lane at 27.3× is the softest. Its CPC at $0.94 is the highest in the portfolio — we're paying more per click. The action is auditing the keyword set and shifting budget toward lower-competition terms where Jones Lane's waterfront location gives us natural relevance advantage.

The Group at 22.6× serves a different purpose — group RFQ enquiries and membership sign-ups with a longer conversion cycle not fully captured in the 30-day window.""",

11: """The breakdowns show exactly where to put budget next. Three signals stand out.

First, Tablet at 33.7× ROAS — 20% better than Desktop, 35% better than Mobile. Tablets are typically used by people planning leisure travel at home in the evening — higher intent, larger booking value. We're underinvesting here. The action: 30% bid increase on tablet.

Second, international markets. Singapore 82.5×, Japan 308× on tiny spend, UK 64.9×. These are extraordinary signals that international travellers who find Brady are booking. They're tiny because we don't have dedicated budget or localised ad copy. A $300/month Singapore campaign is the immediate recommendation — one of the highest-confidence ROI moves in the plan.

Third, New Zealand at 1.7× ROAS — destroying value. Every NZ dollar spent returns almost nothing. Pause NZ targeting immediately and redirect that budget to Singapore.""",

12: """This is where we move from reporting to execution. The action plan is structured by priority: scale what's working, defend what's stable, cut what isn't.

Top opportunity: Group PMAX at 49.7× ROAS on $250 spend is massively underfunded. Doubling the budget projects an additional $12.4K revenue from just $250 extra spend — one of the most certain ROI moves in the deck.

Hardware Lane PMax at 40.9× is next — +60% budget projects $8.4K additional revenue.

On the other side: nine markets with zero conversions paused (frees $135); both Display Retargeting campaigns paused (frees $440). That liberated budget goes directly into the scaling campaigns.

Net outcome: projected $30K additional SEM revenue in May without proportionally increasing total spend. The efficiency of the reallocation does the work.""",

13: """The YTD chart shows SEM spend coming down month-over-month — $9.3K in January to $7.5K in April — while revenue stays strong. That's efficiency improvement, not budget cuts. We've been trimming waste.

The ROAS comparison matters: 2025 full year was 44.3× at 2.3% CoS. 2026 YTD is 31.3× at 3.2% CoS. That gap is partly seasonal — 2025's AFL back half produced extraordinary SEM returns — and partly because 2026 has more diverse spend in campaigns that are still building efficiency.

The key message: H2 2026 is when the SEM program needs to be firing on all cylinders. AFL Grand Final in September is the peak opportunity. We need campaigns structured, creatives refreshed, and bids optimised in June — not September. That's a concrete project milestone.""",

14: """Creative is the unseen lever in SEM performance. Most people think Google Ads is bids and targeting — and it is — but PMax campaigns are heavily influenced by asset quality. Google's ML allocates more impressions to campaigns with richer asset sets and higher quality scores.

The asset brief ensures every hotel has a complete library. Crucially, video is missing for several hotels right now. PMax campaigns with video get significantly better placement in YouTube and Display inventory — this is a meaningful performance gap.

For Q3 AFL, we need stadium-proximity creative emphasising walkability — Brady Hotels to Marvel Stadium in X minutes on foot. Those assets need to be in production in June for September readiness. Creative production lead time is the constraint, not ad spend.""",

15: """The forecast is event-driven because Melbourne SEM demand isn't a flat curve — it spikes around major events. AFL Grand Final in September: $11.2K spend projecting $285K revenue. Spring Racing October: similarly elevated.

May is the immediate focus at $8.4K projecting $208K. That's slightly below April's absolute revenue because April had some Easter demand — but the efficiency is improving as we scale the right campaigns.

The embedded event strategy is the mechanism for this entire forecast: Mother's Day May, Melbourne Writers Festival August, AFL September, Spring Racing October. We're not reacting to events — we have campaign briefs and budget allocations ready before each one arrives. That's the competitive advantage.""",

16: """Metasearch — Google Hotel Ads, Trivago, TripAdvisor. $1.6K spend, $53.6K revenue, 32.7× ROAS. Your highest-efficiency paid channel by a significant margin. The conversation now is why and how we grow it responsibly.""",

17: """Metasearch is structurally different from SEM or Social — there's no top or mid-funnel here. Users arriving in metasearch have already decided to go to Melbourne and are comparing rates. The question is purely whether Brady Hotels' rate presentation wins.

That makes metasearch uniquely dependent on two factors partly outside our direct control: the rate being offered and the review score against competitors. The CPC bid determines how prominently Brady appears — but if the rate is uncompetitive or reviews are weaker, the click won't convert regardless of bid spend.

We're not yet active in the top-funnel metasearch placements — sponsored TripAdvisor listings, Trivago featured placements. That's a future phase. For now, we're maximising bottom-funnel performance where conversion rates are already strong across all four hotels.""",

18: """Flinders Street stands out at 40× ROAS and 6.55% conversion rate. Why? The apartment format resonates strongly in metasearch — apartment guests typically have longer stays and higher booking values at $564 AOV. Apartment rates in Melbourne are also less saturated in metasearch than standard hotel inventory, meaning lower bid competition for equivalent placement.

Jones Lane is the outlier at $338 AOV — $145 below portfolio average. This is a rate strategy issue, not a marketing issue. The metasearch campaigns can't lift a rate that isn't competitive. The action here is a rate plan review specifically for Jones Lane: minimum stay restrictions, weekend rate optimisation, and direct booking rate alignment to Booking.com parity.

Hardware Lane at $17K absolute revenue is your highest metasearch contributor. With 34.5× ROAS there's clear headroom to increase spend and volume without sacrificing efficiency.""",

19: """Two signals. First, Google Hotel Ads is driving 87% of metasearch revenue — TripAdvisor is at just 1%. TripAdvisor users typically have higher booking intent and review-awareness. Increasing TripAdvisor budget by $300/month is low-risk, high-upside — it's currently so underfunded it's not contributing meaningfully.

Second: free booking links are generating 43% of metasearch revenue. This is the zero-cost organic metasearch channel — Brady Hotels appearing in Google's free hotel listings. Improving the data quality of our hotel feeds — room types, rates, photos, cancellation policies kept current — improves free link performance without additional spend. This is one of the highest-leverage zero-cost improvements available.""",

20: """The bidding strategy in plain terms. We're recommending targeted CPC increases for Flinders Street (+20%) and Jones Lane (+25%).

Flinders Street: at 40× ROAS and 6.55% conversion, this hotel has proven it converts. Increasing the bid gets more impressions and clicks that will convert at the same rate — a pure volume play on a proven performer.

Jones Lane +25% despite the AOV concern: the conversion rate is actually strong at 6.05%, and the current CPC at $0.59 is the lowest in the portfolio. There's room to increase visibility and volume before needing to touch the rate strategy. Ideally we do both simultaneously — raise bids AND lift AOV — but the bid move is faster to implement this week.

Central and Hardware Lane we're holding — Central is a volume property already efficient; Hardware we're testing the weekend rate uplift first before adjusting bids.""",

21: """Metasearch was only properly structured from January 2026. The YTD pattern shows variable month-to-month revenue — $51K January to $67K March — which reflects Melbourne's event-driven demand profile.

The March spike is attributable to Melbourne Convention Week which drove above-average MCEC-adjacent accommodation demand — exactly the audience our MCEC landing page now targets.

The 2025 comparison is important context: metasearch was running at 11.2× ROAS in H2 2025. We've taken that to 31.4× in 2026 by structuring the bids correctly. That's a significant channel maturation story in four months — and there's more improvement to come as we implement the bid adjustments and TripAdvisor expansion.""",

22: """The metasearch forecast is deliberately conservative — 28-32× ROAS through the year. The AFL September spike is forecast at 35× because historically metasearch over-delivers during peak Melbourne events when demand outpaces supply and any hotel with a good rate wins the comparison almost automatically.

The CPC adjustments, TripAdvisor increase, and Singapore push we've outlined will lift actual numbers above these forecasts if implemented. These projections assume the status quo on bids — which we're changing this week. The upside is real and the downside is protected by the strong existing conversion rates.""",

23: """Meta Ads — Facebook and Instagram. $5.4K spend in April, $103K attributed revenue, 18.9× ROAS. Social tells a different story from SEM and Metasearch — the dynamics behind the numbers are more nuanced. Let me walk through it.""",

24: """The Social funnel is structured differently to SEM — and the funnel architecture explains why we manage it the way we do.

The bottom-funnel booking campaigns generate most of the direct revenue attribution, but they only work because mid and top funnel is warming audiences over time. Here's the key dynamic: Meta's algorithm needs an audience to work with. The more quality signals we feed it — video views, engagement, website visits — the better it identifies lookalike audiences who are likely to book.

Right now we're heavy on mid and bottom funnel but light on top-funnel awareness. That's sustainable short-term but creates a lead generation deficit over 6-12 months as current audiences fatigue.

The recommendation: don't pull back on bottom-funnel — it's delivering revenue. Build the upper funnel in parallel with awareness video content at lower CPMs that expands the remarketing pool. This is a May-June structural project.""",

25: """Jones Lane had the best Social ROAS this month at 25.5×. That's interesting because in SEM it's the softest performer. The reason: Jones Lane's Social campaigns have been running longer and Meta's algorithm has had more time to optimise for the specific audience profile that converts for that property.

Central Melbourne is the outlier at 10.5× — below portfolio average and well below what the other hotels are achieving. The cause isn't the property — it's the campaign targeting and creative. Central is a higher-volume, lower-ADR hotel and the current creative isn't differentiating it from the other properties. The action: replace underperforming creative and test new audience targeting for Central's segment — CBD corporate short-stay and leisure weekender are genuinely different audiences that need separate creative briefs.

The Group campaign at 19.5× is performing correctly — group bookings have a longer consideration cycle and 30-day attribution doesn't fully capture the RFQ-to-booking journey. The real value is in the downstream group revenue.""",

26: """The audience data is one of the most actionable slides in the deck. F45-54 and F55-64 are your highest-performing segments. F65+ at 2.69% CTR is actually the best click-through performer in the portfolio. M18-24 is the worst by a wide margin at 0.78%.

What this tells us about Brady Hotels' organic customer: you're attracting mature female travellers — couples getaways, milestone birthdays, girlfriends' weekends. The marketing resonates with them and we should lean in hard.

Practical actions: build a lookalike audience from F45-64 converters; increase bids for F65+ by 30%; exclude M18-24 from all ad sets. That exclusion alone improves average CTR and gives the algorithm cleaner quality signals.

On device: 96% of Social revenue comes from mobile app. Desktop at 0.66% CTR versus mobile's 1.57% is a clear indicator — exclude desktop spend and redirect entirely to mobile where conversion is proven.""",

27: """The membership campaign is a lead generation play, not a direct booking campaign — and that distinction matters for how we evaluate it.

30 leads at $9.87 CPL is a healthy cost. The question is what happens downstream when those leads enter the CRM. This campaign's value is NOT measured in immediate bookings. It's measured in member LTV — the repeat bookings generated from members over 12-24 months. If each member books 2× per year at $350 average, the $9.87 CPL returns many times over.

The immediate action: ensure the lead handoff between Meta and the CRM is functioning correctly. Leads need to enter a nurture sequence within 24 hours — not sit in a static list. That handoff is the conversion lever that justifies continued investment in this campaign. Without it, the CPL is being wasted.""",

28: """The Social action plan follows the same logic as SEM: scale what's working, hold what's stable, cut what isn't.

The Group daily sales campaign at 3.37% CTR is the standout — more than double the channel average. Meta's algorithm has found a highly resonant audience. The constraint is just budget. +25% spend with three fresh creative variants projects $5K incremental revenue.

For Central Melbourne — a complete creative refresh with a tight brief. Two distinct audience directions: CBD corporate midweek and leisure weekend. These are genuinely different people with different motivations, and one creative can't serve both well. Splitting into two ad sets is the structural fix.

The Autumn Sale creative is paused. Running Easter-season creative in May actively hurts CTR and wastes impression budget on irrelevant creative. Pausing frees that budget for the Group campaign scale-up.""",

29: """Social's YTD pattern shows something important: January spend was flat but revenue was below Q2-Q4 2025 despite higher overall traffic. The Social campaigns have matured significantly by April — the algorithm has had four months to learn.

The 2025 comparison is partial — only from June 2025. But YTD 2026 ROAS at 4.8× is broadly in line with 2025's 5.0×. That's steady, not accelerating. The acceleration driver going forward is the F45-64 LAL audience we're building — once that audience matures in Q3, we expect a measurable ROAS improvement because we'll be reaching a more qualified pool with less wasted impressions.""",

30: """Creative is where Social performance is made or broken — and the April data makes this undeniable.

Two clear signals: vertical video at 9:16 significantly outperforms static images on Reels and Stories. UGC-style video creative outperforms everything else. The 3.36% CTR from UGC video versus 1.19% from legacy static creative is a 2.8× performance difference on similar spend.

The practical implication: invest in short-form video production. The good news is this doesn't require expensive production. Authentic, smartphone-shot content performs better than studio photography in Meta's current algorithm. The hook matters — first 3 seconds determine whether someone keeps scrolling. 'This is what you see from your window at Hardware Lane' or 'This rate disappears Friday midnight' are the types of hooks that stop the scroll.""",

31: """The Social forecast is the most growth-oriented of the three channels. We're projecting spend to increase from $5.4K in April to $7.5K in July during school holiday peak — and attributed revenue growing correspondingly.

School holidays in July are the critical Social opportunity — families and couples looking for Melbourne experiences, AFL season starting, winter weekenders. The creative needs to be ready in June: hotel lifestyle, local Melbourne experience, 'Melbourne winter with a warm room' narrative. The campaign briefs are already drafted — production is the next step.""",

32: """This is the proof point for the entire creative strategy. The before/after data is unambiguous.

The new Saver Rate creative launched April 1st: 2.60% CTR. The legacy Book Direct creative it replaced: 1.19% CTR. The same budget, more than double the clicks. UGC video at 3.36% CTR is 2.8× the legacy performance.

The message is simple: creative quality is the highest-leverage variable in Meta performance right now. The targeting is good. The audience is right. The bidding is efficient. What moves the needle further is better creative. That's why the creative refresh and video production pipeline is at the top of the Social action plan.

Every week we run stale creative, we're leaving click-through performance on the table. The refresh cadence should be every 6-8 weeks minimum.""",

33: """Pulling the paid channel action plan together. Three channels, three sets of moves, all with projected revenue impact.

SEM: the biggest opportunities this week are scaling Group PMAX — which is returning 49.7× — and launching a Singapore market campaign. The budget released from pausing zero-conversion markets and display retargeting pays for most of the scale-up. Projected: $30K incremental SEM revenue in May.

Metasearch: Flinders Street and Jones Lane bid increases, plus TripAdvisor budget activation. The combination of bid changes and feed optimisation will lift both volume and efficiency. Projected: $8.4K incremental metasearch revenue in May.

Social: Central Melbourne creative refresh and the F45-64 LAL audience build are the two structural changes that will bend the ROAS curve upward over Q2-Q3. These take 2-3 weeks to show measurable results as Meta's algorithm relearns.

Combined: approximately $50K in incremental paid revenue projected for May from these specific changes, without proportional increases in total spend.""",

34: """Organic search. April 2026 summary: 3,650 sessions, 203 transactions, $113K organic revenue, 4.6% conversion rate. Five active landing pages. Let me walk through what's driving these numbers, what the risks are, and what we're building next.""",

35: """This slide reveals one of the most important dynamics in Brady Hotels' organic performance — and it requires careful interpretation.

Brand searches — people searching 'Brady Hotels Melbourne' or 'Brady apt hotel' — generated 1,542 clicks. But average position dropped from 3.2 to 5.0, and CTR fell from 9.70% to 7.03%. That's significant brand SERP degradation.

Why? Two likely causes. AI Overviews are now appearing above regular search results for branded hotel queries — pushing everything down the page and reducing CTR across the board. And the growth of metasearch sitelinks in branded search results means some branded clicks are going to Google Hotel Ads instead of organic listings.

The implication: people who know Brady Hotels and are actively searching for you are being intercepted before reaching the organic listing. This is why brand SERP defence is a priority — schema markup, Business Profile expansion, and title tag optimisation all help reclaim those clicks.

The generic side is genuinely good news. Generic impressions grew significantly YoY — more people are seeing Brady Hotels in non-branded searches. That's the landing page program working. The impressions growth is the leading indicator that ranked traffic growth follows in Q3.""",

36: """Organic sessions in April: 3,650 — down 16.8% from 4,388 in April 2025. Every 2026 month tracks below the equivalent 2025 month.

Here's why this doesn't concern me as much as it might first appear. 2025's organic growth was driven by content expansion — new pages getting indexed and starting to rank, setting a high watermark. In 2026, we're building the next layer of that infrastructure: five new landing pages, Melbourne Business Hotels and Elizabeth Street in progress.

The comparison will flip when those pages start ranking in earnest. The MCEC page already has 27 terms on page 1. Marvel Stadium hit position #3. These pages are generating incremental traffic that didn't exist in 2025 at all. The full impact of the 2026 content build won't show in the YoY chart until Q3-Q4 — that's when the sessions line crosses back above 2025 levels.""",

37: """The headline that matters: $113K organic revenue in April 2026, up 10.5% from $102K last April. Revenue growing despite sessions declining. That means conversion rate improved materially — and 4.6% CVR is exceptional for organic hotel traffic.

Industry average for hotel websites is typically 1.5-2.5% organic CVR. Brady's organic visitors are arriving via branded and high-intent generic terms and converting at nearly double the industry rate. That's a quality-of-traffic story: the people who find Brady Hotels organically already have strong purchase intent.

The six-month revenue trend — ranging $109K-$120K per month — is remarkable consistency. This organic channel doesn't spike and crash with events. It compounds steadily through the year, making it the most predictable revenue stream in the marketing mix.

One note on the brand queries table: 'brady hotels central melbourne' generating 2,519 impressions with 205 clicks shows strong brand awareness for that property. Structured data and an optimised Google Business Profile for Central Melbourne could convert more of those impressions into clicks.""",

38: """Marvel Stadium is one of our most commercially important LPs. Events at Marvel draw tens of thousands of people to the Docklands area, and Brady Hotels' proximity makes us genuinely competitive for that accommodation search intent.

Position #3 for 'marvel stadium hotels' is a breakthrough. Positions 1-3 on Google capture approximately 60% of all clicks for a query. At position #7 previously, we were getting a small fraction of that traffic. Moving from 7 to 3 likely represents a 3-4× increase in traffic volume for that single keyword alone.

Why did rankings improve? The combination of page authority building over time, internal linking from other Brady pages, and high-quality content matching user intent. This is the compound effect of the SEO strategy working correctly.

Next focus for this page: CTR optimisation. Now that we're at #3, we can improve click-through by refining the title tag and meta description to be more compelling than the #1 and #2 results. We also start targeting additional Marvel Stadium queries we haven't captured yet — expanding the content on the page to cover events calendar, walking distance to Marvel, and nearby dining.""",

39: """27 terms on the first page is a significant milestone for the MCEC landing page. Convention Centre accommodation is an extremely valuable search segment — convention attendees have fixed dates, can't be flexible on location, and have employer-approved travel budgets. They're high-value, high-intent bookers.

The 'convention centre melbourne accommodation' entering from N/A to position #6 is particularly significant — this is a high-volume query and breaking page 1 at position 6 is a major threshold. Our immediate optimisation: refresh the H1 and H2 structure to better match this query, build FAQ content around MCEC event dates and booking-lead-time guidance, and add structured data markup.

The MCEC LP is on trajectory to become one of our highest-revenue organic pages within 3-6 months. The 27 page 1 terms confirm it has genuine authority in this niche — the next phase is deepening that authority by expanding the content to cover specific conventions, events, and the MCEC booking cycle.""",

40: """50% MoM improvement for the Serviced Apartments LP. The Serviced Apartments category is different from venue-proximity LPs — it targets a stay-type intent rather than an event or location. Searchers here are typically on extended stays: corporate relocations, project workers, families in town for medical or other long-stay reasons. High AOV bookings with multiple nights.

The jump of 'serviced apartments melbourne cbd' from position 20 to position 11 — nine positions in one month — is exceptional. That's not random fluctuation; that's the page gaining authority rapidly. Three new keywords entering from N/A to positions 8-13 confirms semantic relevance is broadening as well.

This acceleration pattern follows a well-understood SEO dynamic: once a page crosses from page 2 to page 1 on core terms, it gets more clicks, which signals relevance to Google, which lifts it further. We're approaching that inflection point. The expected outcome: within 60 days this page joins MCEC and Marvel Stadium as a consistent page 1 performer.""",

41: """New in April — Crown Casino LP launched at the start of the month. Four keywords entering from N/A to positions 10-13, plus one term on page 1 and eight on page 2 after just 30 days. That's an excellent start for a brand-new page.

Crown is one of Melbourne's biggest entertainment precincts. Crown itself has hotels but they're premium-priced — meaning budget-to-mid market accommodation near Crown is a genuine and underserved search category. We're filling that gap.

Why did this page index and rank quickly? Domain authority of bradyhotels.com.au gives new pages a reasonable initial trust signal. And the content clearly signals relevance — it covers Brady Hotels' proximity to Crown with the specificity that matches user intent for these queries.

The critical next step is internal linking. Adding links to the Crown Casino LP from the homepage, hotel pages, and any location-mention blog posts passes authority signals that accelerate movement from page 2 to page 1 faster than waiting for organic authority accumulation.""",

42: """Princes Theater LP — indexed in late April, days old, and already showing two page 1 rankings at positions 8 and 10. That's an immediate signal that the page content is highly relevant to these search queries.

The Regent and Princes Theatre precinct generates accommodation demand around show seasons — Broadway musicals, touring productions. These audiences book in advance and are often from interstate, making them high-value multi-night stays.

For a page this new, the approach is monitor, not optimise. Let the page accumulate authority naturally through May, then reassess in June. If it maintains or improves page 1 positions, we move into active optimisation — expanding content, building internal links, and targeting additional queries. If positions drop, we investigate and reinforce.

The internal linking strategy is especially critical here — because the page just launched, it hasn't had time to build inbound link equity. Every link from another Brady page is disproportionately valuable at this early stage.""",

43: """Four pages indexed, not yet ranking: Queen Victoria Market, Regent Theatre, Four Star Hotels Melbourne, Apartment Hotels Melbourne. This is completely normal for new pages — timeline from indexing to ranking on competitive terms is typically 3-6 months.

The question is how we accelerate that timeline without waiting passively. Internal linking optimisation is the answer. Connecting these pages from the homepage, hotel-specific pages, and existing content articles passes authority signals and helps Google understand their relevance. This costs nothing in media spend — it's structural optimisation that delivers compound returns.

We'll also conduct a content review in May: checking H1 and H2 structure, keyword density, and FAQ sections for each page. The goal is to ensure Google has everything it needs to understand what each page is about and why it should rank for the target queries.""",

44: """This is a new section of the report reflecting a genuine shift in how people discover accommodation. AI-powered search — ChatGPT, Google AI Overviews, Perplexity — is now being used to research where to stay.

Brady Hotels generated 369 AI mentions and 267 AI citations in April. 195 sessions came from AI referrals, resulting in 6 bookings and $4,104 revenue at a 3% conversion rate. That 3% CVR is exceptionally strong for a new channel — industry average for AI referral traffic is typically under 1%.

Why is Brady appearing in AI results? Because our content strategy is working. AI systems extract information from pages that are clear, well-structured, and semantically rich. The landing pages for Marvel Stadium, Crown Casino, MCEC — these contain exactly the kind of specific, location-relevant content that AI surfaces when someone asks 'what hotels are near Crown Casino Melbourne'.

The strategic implication: investing in content quality and structured data isn't just for traditional SEO anymore — it's also your AI visibility strategy. The same content that ranks in Google gets cited by AI assistants. This is why the landing page program is doubly valuable.

The watch item: AI Overviews are likely also reducing CTR on branded search terms, as we saw in the Brand vs Generic slide. We need to build AI visibility while simultaneously defending traditional organic positions.""",

45: """The SEO next steps are structured around four clear priorities.

First, the two new landing pages in progress — Melbourne Business Hotels and Elizabeth Street Hotel. Business Hotels targets the corporate extended-stay segment: high AOV, repeat booking potential, and a segment we're not currently capturing organically. Elizabeth Street is a new property expansion and needs organic presence from day one of opening.

Second, re-optimisation of existing hotel pages. Flinders Street LP is up 35% YoY — the only hotel page growing. We want to reverse-engineer its H1/H2 structure and replicate it across Hardware Lane, Jones Lane, and Central Melbourne. This is a content efficiency play: find what's working and systematise it across the portfolio.

Third, brand SERP defence. CTR dropped from 9.70% to 7.03% on branded queries. We're auditing title tags and meta descriptions for all hotel pages, expanding Google Business Profiles with posts, photos, and Q&A, and adding FAQPage schema markup. These changes make Brady Hotels more prominent and clickable when people search for us by name.

Fourth, the monthly operational programme: internal linking for new LPs, health check on the four indexed-but-not-ranking pages, citation audit, and backlink reclamation. These are the consistent compound-interest activities that make SEO work over a 12-month horizon.""",

46: """We've now covered the full April performance across all channels. Let me give you the full-year picture — what's actual through April and what we're projecting through December 2026.""",

47: """The full-year P&L shows the financial trajectory of the entire programme. January through April are actuals. May through December are forecasts based on event calendars and the campaign changes we're implementing today.

April's ROI at 14.1× looks softer than Q1 — that's seasonal, not structural. April is Melbourne's weakest demand month and revenue softened accordingly. Q3 is where the model projects the strongest returns: August through October averaging 14-16× ROI, driven by AFL Grand Final weekend — historically Brady Hotels' highest revenue month of the year.

The agency fee at $5,400/month is fixed and represents strong value at these revenue levels. Total investment for the year is projected at $313K — media plus agency — returning $3.86M in attributed revenue at a 12.3× full-year ROAS.

One number to watch: May's projected $310K revenue. The action plan we've outlined today — Group PMAX scaling, Singapore launch, Social creative refresh, Metasearch bid increases — is not yet baked into these forecasts. Executing cleanly on those moves puts May revenue closer to $340-360K. The forecast is the conservative floor.""",

48: """The per-hotel, per-channel forecast shows where full-year revenue is concentrated and why.

Hardware Lane and Central Melbourne are your two largest revenue generators at $744K and $736K projected full-year — both driven primarily by SEM where their rates and locations compete most effectively.

The Metasearch column for Hardware Lane at $205K is notable — highest metasearch forecast in the portfolio, achievable because the $310 ADR generates very high-value bookings from guests who use price comparison tools specifically when seeking premium serviced apartments.

The Brady Group social forecast at $82K is the largest social revenue contributor. This reinforces why the Group campaign is the highest priority for budget scaling — it's driving cross-portfolio revenue that no individual hotel campaign generates.

Flinders Street and Jones Lane at 10.8× full-year ROAS are slightly below portfolio average — both have clear upside through the rate and bid optimisation actions we've outlined today.

Full year projection: $2.95M in total attributed revenue at $293K total media cost — a 10.1× full-year portfolio ROAS. This programme is delivering. The question isn't whether it's working — it's how fast we can responsibly scale it. Thank you.""",
}


# ─────────────────────────────────────────────────────────────────────────────
# Build the injection
# ─────────────────────────────────────────────────────────────────────────────

NOTES_JSON = "{\n"
for k, v in NOTES.items():
    # Escape for JSON inside JS
    escaped = v.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
    NOTES_JSON += f'  {k}: "{escaped}",\n'
NOTES_JSON += "}"

SPEAKER_CSS = """
/* ── SPEAKER NOTES PANEL ─────────────────────────────── */
#notes-panel {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  max-height: 45vh;
  background: rgba(17,25,46,0.97);
  color: #e8eaf0;
  font-family: 'Manrope', sans-serif;
  font-size: 14px;
  line-height: 1.65;
  padding: 0;
  z-index: 9999;
  transform: translateY(100%);
  transition: transform 0.32s cubic-bezier(.4,0,.2,1);
  border-top: 3px solid #5E3FBE;
  display: flex;
  flex-direction: column;
}
#notes-panel.open { transform: translateY(0); }
#notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
}
#notes-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #5E3FBE;
}
#notes-slide-label {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
}
#notes-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  transition: color .2s;
}
#notes-close:hover { color: #fff; }
#notes-body {
  overflow-y: auto;
  padding: 14px 24px 18px;
  flex: 1;
}
#notes-body p { margin: 0 0 0.8em; }
#notes-hint {
  position: fixed;
  bottom: 12px;
  right: 16px;
  background: rgba(94,63,190,0.85);
  color: #fff;
  font-family: 'Manrope', sans-serif;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 11px;
  border-radius: 20px;
  cursor: pointer;
  z-index: 10000;
  letter-spacing: 0.04em;
  transition: background .2s, opacity .3s;
  opacity: 0.85;
}
#notes-hint:hover { background: #5E3FBE; opacity: 1; }
#notes-hint.hidden { display: none; }
"""

SPEAKER_JS = r"""
(function() {
  var NOTES = """ + NOTES_JSON + r""";

  // inject CSS
  var style = document.createElement('style');
  style.textContent = window.__notesCSS__;
  document.head.appendChild(style);

  // build panel
  var panel = document.createElement('div');
  panel.id = 'notes-panel';
  panel.innerHTML =
    '<div id="notes-header">' +
      '<span id="notes-title">📝 Speaker Notes</span>' +
      '<span id="notes-slide-label">Slide 01</span>' +
      '<button id="notes-close" title="Close (N)">✕</button>' +
    '</div>' +
    '<div id="notes-body"></div>';
  document.body.appendChild(panel);

  // hint button
  var hint = document.createElement('button');
  hint.id = 'notes-hint';
  hint.textContent = 'N  Notes';
  hint.title = 'Toggle speaker notes (N)';
  document.body.appendChild(hint);

  var isOpen = false;

  function getCurrentSlide() {
    // find the active / centred slide
    var slides = document.querySelectorAll('.slide');
    var best = null, bestDist = Infinity;
    slides.forEach(function(s) {
      var r = s.getBoundingClientRect();
      var cx = r.left + r.width/2;
      var cy = r.top  + r.height/2;
      var dx = cx - window.innerWidth/2;
      var dy = cy - window.innerHeight/2;
      var d  = Math.abs(dx) + Math.abs(dy);
      if (d < bestDist) { bestDist = d; best = s; }
    });
    return best;
  }

  function getSlideNum(slide) {
    if (!slide) return 1;
    var el = slide.querySelector('.slide-num');
    if (!el) return 1;
    var m = el.textContent.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }

  function updateNotes() {
    var slide = getCurrentSlide();
    var n = getSlideNum(slide);
    var text = NOTES[n] || 'No notes for this slide.';
    document.getElementById('notes-slide-label').textContent = 'Slide ' + String(n).padStart(2,'0') + ' / 48';
    var body = document.getElementById('notes-body');
    // Split by double-newline for paragraphs
    var paras = text.split(/\n\n+/);
    body.innerHTML = paras.map(function(p) {
      return '<p>' + p.trim().replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function openNotes() {
    updateNotes();
    panel.classList.add('open');
    hint.classList.add('hidden');
    isOpen = true;
  }

  function closeNotes() {
    panel.classList.remove('open');
    hint.classList.remove('hidden');
    isOpen = false;
  }

  function toggle() {
    if (isOpen) closeNotes(); else openNotes();
  }

  // N key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'n' || e.key === 'N') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      toggle();
    }
  });

  hint.addEventListener('click', toggle);
  document.getElementById('notes-close').addEventListener('click', closeNotes);

  // update notes when user scrolls to a new slide
  var container = document.querySelector('.slides-container') || document.querySelector('main') || document.documentElement;
  var scrollTimer;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      if (isOpen) updateNotes();
    }, 200);
  }
  window.addEventListener('scroll', onScroll, true);

  // Also hook arrow key navigation
  document.addEventListener('keyup', function(e) {
    if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','PageDown','PageUp'].indexOf(e.key) !== -1) {
      if (isOpen) setTimeout(updateNotes, 100);
    }
  });
})();
"""

# Inject CSS as a variable accessible to the IIFE
INJECT_CSS_VAR = f"""<style id="speaker-notes-css">{SPEAKER_CSS}</style>
<script>window.__notesCSS__ = document.getElementById('speaker-notes-css').textContent;</script>"""

INJECT_SCRIPT = f"""<script>\n{SPEAKER_JS}\n</script>"""

# ─────────────────────────────────────────────────────────────────────────────
# Apply to HTML
# ─────────────────────────────────────────────────────────────────────────────
with open(SRC, encoding='utf-8') as f:
    content = f.read()

# Insert CSS + var before </head>
if INJECT_CSS_VAR not in content:
    content = content.replace('</head>', INJECT_CSS_VAR + '\n</head>', 1)
    print('  ✓ Injected speaker notes CSS')
else:
    print('  ⚠ CSS already present')

# Insert JS before </body>
if 'speaker-notes' not in content or INJECT_SCRIPT not in content:
    content = content.replace('</body>', INJECT_SCRIPT + '\n</body>', 1)
    print('  ✓ Injected speaker notes JS + 48-slide script')
else:
    print('  ⚠ JS already present')

with open(SRC, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\n✓ Done. Press N during presentation to toggle speaker notes panel.')
