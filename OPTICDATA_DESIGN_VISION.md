# OpticData: Design Vision & Platform Direction

## The Platform We're Building

**OpticData is a first-party marketing intelligence platform that combines Northbeam's analytical depth with Triple Whale's operational power — unified by an AI operator that makes the whole thing feel effortless.**

Northbeam charges $1,500/mo and tells you what to do. Triple Whale charges $129/mo and gives you a nice dashboard. Neither actually DOES anything for you.

OpticData sees the full picture, makes the decision, and executes — with Jarvis handling the complexity so the operator never has to think about attribution models, lookback windows, or accounting modes unless they want to.

---

## Design Philosophy: "Depth Without Complexity"

### The Problem With Northbeam
Northbeam is the smartest person in the room who can't explain anything simply. 7 attribution models, 6 attribution windows, 2 accounting modes, progressive feature unlock over 90 days, dense tables everywhere. Users need a dedicated data analyst just to interpret the dashboard. Their G2 ease-of-use score reflects this — power without accessibility.

### The Problem With Triple Whale
Triple Whale is the friendly operator who keeps things simple but can't go deep when you need it. Shopify-only, rule-based attribution that mirrors in-platform numbers (defeating the purpose of a third-party tool), no view-through attribution, no MMM. Easy to use because it doesn't do much.

### The OpticData Approach
**Surface simplicity. Depth on demand. AI handles the gap.**

- **Default view**: Clean, decisive, action-oriented. One glance tells you if your business is healthy.
- **Drill down**: Every metric expands into Northbeam-grade analytical depth when you need it.
- **Ask Jarvis**: Anything you can't find or figure out, just ask. Natural language queries, automated actions, instant reports.

The design should feel like a luxury car dashboard — the speedometer and fuel gauge are always visible, but the full diagnostic system is one tap away.

---

## Brand Identity Evolution

### Color System

The current `#3b82f6` blue accent is functional but generic (it's Tailwind's `blue-500`). For a platform positioning itself as the analytical authority, the palette needs more identity.

**Proposed Primary Palette:**

| Token | Hex | Usage |
|-------|-----|-------|
| Deep Space | `#0a0e1a` | Dark background (keep current feel) |
| Surface | `#111827` | Cards and elevated surfaces |
| Midnight | `#1a1f2e` | Secondary surface / hover states |
| Electric Blue | `#2d7ff9` | Primary accent — interactive elements, CTAs |
| Signal Green | `#00d68f` | Positive metrics, revenue, conversions |
| Signal Red | `#ff3d71` | Negative metrics, losses, alerts |
| Signal Amber | `#ffaa00` | Warnings, caution, benchmarks |
| Cool Gray | `#8f9bb3` | Secondary text, labels |

**Stoplight System (from Northbeam, reimagined):**

| Status | Color | Background | Meaning |
|--------|-------|------------|---------|
| Scale | `#00d68f` | `#00d68f/10` | Above profitable benchmark — push harder |
| Watch | `#ffaa00` | `#ffaa00/10` | At threshold — hold and monitor |
| Cut | `#ff3d71` | `#ff3d71/10` | Below benchmark — reduce or reallocate |

These aren't decorative — they're decision signals. Every campaign, ad set, and ad gets a stoplight based on YOUR profitable-day benchmarks, not industry averages.

### Typography

**Keep the system font stack** for body text — it's fast and native. But add **Inter** as the primary display font for headings and metric labels. Inter's tall x-height and tabular figures make it ideal for data-dense interfaces.

**Metric numbers should use JetBrains Mono** (already in the system) — monospace alignment makes scanning columns of numbers effortless.

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page titles | Inter | 600 | 20-24px |
| Section headers | Inter | 600 | 16-18px |
| Metric labels | Inter | 500 | 10-11px uppercase tracking-wide |
| Metric values | JetBrains Mono | 700 | 22-28px |
| Body text | System | 400 | 14px |
| Table data | JetBrains Mono | 400 | 13px |
| Captions/hints | System | 400 | 12px |

---

## Page Architecture

### Global Controls Bar

A persistent bar at the top of every analytics page. This is borrowed from Northbeam but simplified.

```
+--------------------------------------------------------------------+
| [Attribution Model ▾]  [Window ▾]  [Date Range ▾]  [Compare ▾]    |
|  Jarvis Clicks-Only    30-Day      Last 7 Days      vs Prev Week   |
+--------------------------------------------------------------------+
```

**Key difference from Northbeam**: The default attribution model is "Jarvis" — our AI-recommended model that automatically uses the most appropriate model based on the context (Clicks-Only for daily optimization, Time-Decay for creative analysis, Position-Based for channel planning). Users CAN select a specific model, but most never need to.

### Navigation Structure

**Left sidebar, single level, icon + label:**

```
CORE
  Dashboard          (home icon)
  Attribution        (crosshair icon)
  Campaigns          (megaphone icon)
  Creatives          (palette icon)

INTELLIGENCE
  Pixel & Visitors   (scan icon)
  Journey Analysis   (route icon)
  Benchmarks         (target icon)
  Metrics Explorer   (scatter icon)

AUTOMATION
  Jarvis AI          (sparkle icon)
  Rules Engine       (zap icon)
  Signal Relay       (radio icon)

DATA
  Products           (package icon)
  Customers & LTV    (users icon)
  P&L                (calculator icon)

SETTINGS
  Connections        (plug icon)
  Settings           (gear icon)
```

**Mobile**: Bottom bar with 5 icons — Dashboard, Attribution, Jarvis, Campaigns, More (hamburger expanding to full nav).

---

## Page Designs

### 1. Dashboard (Home)

The first thing you see. Answers: "Is my business healthy right now?"

**Layout:**

```
+--------------------------------------------------------------------+
| GLOBAL CONTROLS BAR                                                |
+--------------------------------------------------------------------+
|                                                                    |
| HEALTH SCORE                          STOPLIGHT SUMMARY            |
| ┌──────────────────────┐              ┌────────────────────┐       |
| │  87 / 100            │              │ 12 Scaling         │       |
| │  ██████████░░        │              │  5 Watching         │       |
| │  "Strong day"        │              │  2 Cut              │       |
| └──────────────────────┘              └────────────────────┘       |
|                                                                    |
| KPI CARDS (scrollable row)                                         |
| ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     |
| │ Spend   │ │ Revenue │ │ ROAS    │ │ nCPA    │ │ Profit  │     |
| │ $12,450 │ │ $38,900 │ │ 3.12x   │ │ $24.30  │ │ $8,220  │     |
| │ +8% ▲   │ │ +12% ▲  │ │ +0.4 ▲  │ │ -$2.1 ▲ │ │ +15% ▲  │     |
| │ ●●●●●   │ │ ●●●●●   │ │ ●●●●●   │ │ ●●●●●   │ │ ●●●●●   │     |
| └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     |
|                                                                    |
| TREND CHART (spend + revenue overlay, area chart)                  |
| ┌──────────────────────────────────────────────────────────┐       |
| │                            ╱╲                            │       |
| │                     ╱─────╱  ╲──                         │       |
| │              ╱─────╱          ╲──╲                       │       |
| │       ╱─────╱                     ╲                      │       |
| │ ─────╱                                                   │       |
| └──────────────────────────────────────────────────────────┘       |
|                                                                    |
| CHANNEL BREAKDOWN              JARVIS INSIGHTS                     |
| ┌──────────────────────┐       ┌──────────────────────────┐       |
| │ Meta     $8.2K  3.4x │       │ "Meta CPA spiked 18%    │       |
| │ TikTok   $2.1K  2.8x │       │  on Campaign X. Consider │       |
| │ Google   $1.5K  4.1x │       │  pausing Ad Set Y which  │       |
| │ NewsBreak $600  2.2x │       │  drove 60% of the spend  │       |
| └──────────────────────┘       │  with 0 conversions."    │       |
|                                │                          │       |
|                                │  [Pause Ad Set Y]        │       |
|                                └──────────────────────────┘       |
+--------------------------------------------------------------------+
```

**Key design decisions:**
- **Health Score**: A single 0-100 number synthesizing ROAS, CPA, profit margin, and trend direction. Jarvis computes this. Green/amber/red ring around it. This is what Northbeam's stoplights SHOULD be — one decisive signal.
- **nCPA prominently displayed**: New Customer CPA is a first-class metric, not buried in a dropdown. DTC brands live and die by acquisition cost.
- **Sparklines in KPI cards**: Inline 7-day trend below each number so you see direction without clicking anything.
- **Jarvis Insights panel**: Not a chat window — a proactive insight card that surfaces the ONE thing you should know right now. Actionable button inline.
- **Stoplight summary**: How many campaigns/ad sets are green/yellow/red. Click to see which ones.

### 2. Attribution Page

The analytical core. Where Northbeam users spend most of their time.

**Layout:**

```
+--------------------------------------------------------------------+
| GLOBAL CONTROLS BAR + [New ▾ | Returning ▾ | All]                  |
+--------------------------------------------------------------------+
|                                                                    |
| MODEL COMPARISON (horizontal cards)                                |
| ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              |
| │ Jarvis   │ │ First    │ │ Last     │ │ Time     │              |
| │ $38.9K   │ │ $36.2K   │ │ $41.1K   │ │ $37.5K   │              |
| │ ROAS 3.1 │ │ ROAS 2.9 │ │ ROAS 3.3 │ │ ROAS 3.0 │              |
| │ ★ Active │ │          │ │          │ │          │              |
| └──────────┘ └──────────┘ └──────────┘ └──────────┘              |
|                                                                    |
| ATTRIBUTION TABLE                                                  |
| ┌──────────────────────────────────────────────────────────┐       |
| │ ● Platform  │ Spend   │ Rev (All)│Rev (New)│ ROAS │nCPA │       |
| │ ▼ Meta      │ $8,200  │ $27,900 │$19,100 │ 3.40 │$22  │       |
| │   ▼ Camp A  │ $4,100  │ $15,200 │$11,000 │ 3.71 │$18  │       |
| │     AdSet 1 │ $2,000  │  $8,100 │ $6,200 │ 4.05 │$16  │       |
| │     AdSet 2 │ $2,100  │  $7,100 │ $4,800 │ 3.38 │$22  │       |
| │   ▼ Camp B  │ $4,100  │ $12,700 │ $8,100 │ 3.10 │$25  │       |
| │ ▼ TikTok   │ $2,100  │  $5,900 │ $4,200 │ 2.81 │$28  │       |
| │ ▼ Google   │ $1,500  │  $6,200 │ $3,800 │ 4.13 │$19  │       |
| └──────────────────────────────────────────────────────────┘       |
|                                                                    |
| Every row gets a STOPLIGHT DOT (●) based on benchmarks             |
| Click any row → expands to show touchpoint journey visualization   |
+--------------------------------------------------------------------+
```

**Key design decisions:**
- **New vs Returning split on every metric** — this is table stakes for DTC. Toggle at the top, columns show both.
- **Stoplight dot on every row** — green/amber/red based on YOUR profitable-day benchmarks. Not industry averages. Instantly see which campaigns to scale and which to cut.
- **Model comparison cards** — see how attribution shifts across models at a glance. Most users stick with "Jarvis" (AI-recommended) but power users can compare.
- **Drill-down hierarchy** — Platform > Campaign > Ad Set > Ad, identical to Northbeam but with cleaner visual hierarchy.
- **No double-counting guarantee** — small badge/indicator showing "Fractional credit: totals match actual revenue" for trust.

### 3. Pixel & Visitors Page

The identity graph and first-party data hub.

**Layout:**

```
+--------------------------------------------------------------------+
| PIXEL HEALTH                                                       |
| ┌────────────────────────────────────────────────────────────┐     |
| │ Events/hr: 2,340  │  Visitors: 12.4K  │  Identified: 68%  │     |
| │ ████████████████   │  ████████████████  │  █████████████░░  │     |
| └────────────────────────────────────────────────────────────┘     |
|                                                                    |
| TABS: [Setup] [Live Dashboard] [Visitors] [Journeys]              |
|                                                                    |
| SETUP TAB:                                                         |
| ┌────────────────────────────────────────────────────────────┐     |
| │ Your Pixel                                                  │     |
| │                                                             │     |
| │ Site: mystore.com          Token: ODT-a1b2c3d4             │     |
| │ Status: ● Active (2,340 events/hr)                         │     |
| │                                                             │     |
| │ ┌─ Header Code ────────────────────────────────────────┐   │     |
| │ │ <!-- OpticData Pixel -->                              │   │     |
| │ │ <script async src="..."></script>                     │   │     |
| │ └──────────────────────────────────────────── [Copy] ──┘   │     |
| │                                                             │     |
| │ ┌─ Checkout Code ──────────────────────────────────────┐   │     |
| │ │ window.__odt.purchase({                               │   │     |
| │ │   order_id: "...",                                    │   │     |
| │ │   revenue: 99.99                                      │   │     |
| │ │ });                                                   │   │     |
| │ └──────────────────────────────────────────── [Copy] ──┘   │     |
| │                                                             │     |
| │ ┌─ DNS Setup (Optional, Recommended) ──────────────────┐   │     |
| │ │ Add an A record: i.mystore.com → [our IP]            │   │     |
| │ │ This makes tracking truly first-party                 │   │     |
| │ └──────────────────────────────────────────────────────┘   │     |
| └────────────────────────────────────────────────────────────┘     |
|                                                                    |
| SIGNAL RELAY STATUS                                                |
| ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                |
| │ Meta CAPI    │ │ TikTok Events│ │ Google EC    │                |
| │ ● Active     │ │ ● Active     │ │ ○ Not Setup  │                |
| │ 1,240 sent/d │ │ 890 sent/day │ │ [Configure]  │                |
| │ 99.2% match  │ │ 98.8% match  │ │              │                |
| └──────────────┘ └──────────────┘ └──────────────┘                |
+--------------------------------------------------------------------+
```

### 4. Jarvis AI Page

Not just a chat window — a command center.

**Layout:**

```
+--------------------------------------------------------------------+
|                                                                    |
| JARVIS COMMAND CENTER                                              |
|                                                                    |
| ┌─ PROACTIVE INSIGHTS ──────────────────────────────────────┐     |
| │                                                             │     |
| │ ⚡ Campaign "Summer Sale" ROAS dropped from 3.2 to 1.8    │     |
| │    in the last 4 hours. Ad Set "Broad 25-44" is the        │     |
| │    primary driver (-$420 wasted spend).                     │     |
| │    [Pause Ad Set]  [Show Details]  [Ignore]                │     |
| │                                                             │     |
| │ 📈 TikTok Campaign "UGC Test" hit 4.5x ROAS over 72hrs   │     |
| │    with $180 daily spend. Budget headroom available.        │     |
| │    [Increase Budget 50%]  [Show Journey]                   │     |
| │                                                             │     |
| └────────────────────────────────────────────────────────────┘     |
|                                                                    |
| ┌─ CHAT ─────────────────────────────────────────────────────┐     |
| │                                                             │     |
| │ You: What's my best performing creative this week?         │     |
| │                                                             │     |
| │ Jarvis: Your top creative is "UGC-Kitchen-Demo-v3" on     │     |
| │ Meta with 5.2x ROAS and $3,200 in attributed revenue.     │     |
| │                                                             │     |
| │ ┌─────────────────────────────────────────────┐            │     |
| │ │ [Embedded metric card with creative preview] │            │     |
| │ └─────────────────────────────────────────────┘            │     |
| │                                                             │     |
| │ The creative has been running for 12 days and shows        │     |
| │ early fatigue signals (CTR down 8% in last 3 days).       │     |
| │ I'd recommend preparing a variation.                       │     |
| │                                                             │     |
| │ [Generate Variation]  [Scale Budget]  [See Full Report]    │     |
| │                                                             │     |
| └────────────────────────────────────────────────────────────┘     |
|                                                                    |
| ┌────────────────────────────────────────────── [Send] ──────┐     |
| │ Ask Jarvis anything...                                      │     |
| └────────────────────────────────────────────────────────────┘     |
+--------------------------------------------------------------------+
```

**Key design decisions:**
- **Proactive insights at the top** — Jarvis doesn't wait to be asked. It surfaces the most important thing happening right now.
- **Inline action buttons** — Not just text responses. Jarvis embeds executable actions directly in the conversation.
- **Embedded data widgets** — Charts, tables, and creative previews render inside the chat, not in a separate window.
- **This is our moat.** Northbeam has nothing like this. Triple Whale's Moby is query-only. Jarvis sees, decides, and acts.

### 5. Benchmarks & Stoplights Page

Borrowed from Northbeam's best idea, made accessible.

**Layout:**

```
+--------------------------------------------------------------------+
| YOUR PROFITABLE BENCHMARKS                                         |
| Built from your 20 most profitable days in the last 180 days      |
| (excluding promo spikes)                                           |
|                                                                    |
| TARGET CARDS                                                       |
| ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐         |
| │ ROAS      │ │ nCPA      │ │ MER       │ │ AOV       │         |
| │ ≥ 2.8x    │ │ ≤ $28     │ │ ≥ 4.2     │ │ ≥ $62     │         |
| │ Today:    │ │ Today:    │ │ Today:    │ │ Today:    │         |
| │ 3.1x  🟢  │ │ $24   🟢  │ │ 3.8   🟡  │ │ $58   🟡  │         |
| └───────────┘ └───────────┘ └───────────┘ └───────────┘         |
|                                                                    |
| CAMPAIGN STOPLIGHTS                                                |
| ┌──────────────────────────────────────────────────────────┐       |
| │ Campaign             │ ROAS │ nCPA │ Signal │ Action     │       |
| │ 🟢 Summer Sale       │ 3.4x │ $22  │ Scale  │ [+Budget]  │       |
| │ 🟢 UGC Test          │ 4.5x │ $18  │ Scale  │ [+Budget]  │       |
| │ 🟡 Retargeting Q1    │ 2.9x │ $26  │ Watch  │ [Monitor]  │       |
| │ 🔴 Brand Awareness   │ 1.2x │ $45  │ Cut    │ [Pause]    │       |
| │ 🔴 Broad Lookalike   │ 0.8x │ $52  │ Cut    │ [Pause]    │       |
| └──────────────────────────────────────────────────────────┘       |
|                                                                    |
| [Let Jarvis auto-manage stoplights]                                |
| When enabled, Jarvis will automatically pause 🔴 campaigns,       |
| increase budget on 🟢 campaigns, and alert you on 🟡 changes.     |
+--------------------------------------------------------------------+
```

**The killer feature**: "Let Jarvis auto-manage stoplights" — a single toggle that turns benchmarks from passive indicators into active automation. Northbeam tells you to cut. OpticData cuts for you.

### 6. Metrics Explorer (Correlation Analysis)

```
+--------------------------------------------------------------------+
| METRICS EXPLORER                                                   |
|                                                                    |
| ┌─ X Axis ──────────┐  ┌─ Y Axis ──────────┐  Period: Last 30d  |
| │ Meta Spend    ▾    │  │ Total Revenue  ▾   │                    |
| └────────────────────┘  └────────────────────┘                    |
|                                                                    |
| ┌──────────────────────────────────────────────────────────┐       |
| │                                          •               │       |
| │                                     •  •                 │       |
| │                                •  •                      │       |
| │                          •  •                            │       |
| │                     •  •                                 │       |
| │               •  •                                       │       |
| │          •  •                                            │       |
| │     •  •                                                 │       |
| │  •                                                       │       |
| │                                                          │       |
| │  Pearson r = 0.87  │  Strong positive correlation       │       |
| └──────────────────────────────────────────────────────────┘       |
|                                                                    |
| JARVIS INTERPRETATION:                                             |
| "Every $100 increase in Meta spend correlates with $340 in         |
|  additional revenue. Diminishing returns appear above $500/day."   |
+--------------------------------------------------------------------+
```

**Key difference from Northbeam**: Jarvis interprets the correlation in plain English and suggests an action. Northbeam just shows the scatter plot and Pearson coefficient.

### 7. Journey Analysis Page

Full customer journey reconstruction — from first ad click to purchase and beyond.

```
+--------------------------------------------------------------------+
| JOURNEY ANALYSIS                                                   |
|                                                                    |
| SUMMARY CARDS                                                      |
| ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐         |
| │ Avg Touch │ │ Avg Time  │ │ Top First │ │ Top Last  │         |
| │ Points    │ │ to Convert│ │ Touch     │ │ Touch     │         |
| │ 3.2       │ │ 4.8 days  │ │ Meta (62%)│ │ Google(41%)│         |
| └───────────┘ └───────────┘ └───────────┘ └───────────┘         |
|                                                                    |
| TOP CONVERSION PATHS                                               |
| ┌──────────────────────────────────────────────────────────┐       |
| │ #1  Meta → Meta → Purchase            │ 34% │ $12,400   │       |
| │ #2  Meta → Google → Purchase           │ 18% │  $6,800   │       |
| │ #3  TikTok → Meta → Meta → Purchase   │ 12% │  $4,200   │       |
| │ #4  Meta → TikTok → Google → Purchase  │  8% │  $3,100   │       |
| │ #5  Direct → Meta → Purchase           │  6% │  $2,400   │       |
| └──────────────────────────────────────────────────────────┘       |
|                                                                    |
| INDIVIDUAL JOURNEY (click a visitor)                               |
| ┌──────────────────────────────────────────────────────────┐       |
| │ Day 1  ● Meta Ad Click (Campaign: Summer Sale)          │       |
| │         └─ Landed on /products/kitchen-set               │       |
| │         └─ ViewContent, AddToCart                        │       |
| │                                                          │       |
| │ Day 3  ● Google Search Click (Brand: "mystore kitchen") │       |
| │         └─ Landed on /products/kitchen-set               │       |
| │         └─ ViewContent                                   │       |
| │                                                          │       |
| │ Day 4  ● Meta Retargeting Click (Campaign: DPA)         │       |
| │         └─ Landed on /cart                               │       |
| │         └─ InitiateCheckout → Purchase ($89.99)          │       |
| │         └─ Identified: john@example.com                  │       |
| └──────────────────────────────────────────────────────────┘       |
+--------------------------------------------------------------------+
```

---

## UX Principles

### 1. Every Screen Has One Job
Each page answers one question. The Dashboard answers "Is my business healthy?" The Attribution page answers "Where should I spend?" The Benchmarks page answers "What's working and what's not?" No page tries to do everything.

### 2. Progressive Disclosure, Not Progressive Unlock
Unlike Northbeam's 90-day feature unlock (frustrating), all features are available immediately. But complexity is layered:
- **Level 1**: Summary metrics with stoplights (visible by default)
- **Level 2**: Detailed breakdown tables (one click to expand)
- **Level 3**: Model comparison and advanced analytics (in-page tabs)
- **Level 4**: Ask Jarvis for anything else

### 3. Actions, Not Just Insights
Every insight should be one click from an action:
- Red stoplight on a campaign? [Pause] button right there.
- Jarvis says CPA is spiking? [Reduce Budget] button inline.
- Top creative is fatiguing? [Generate Variation] button attached.

### 4. Jarvis is Everywhere
Jarvis isn't confined to a chat page. Its presence should be felt throughout:
- **Dashboard**: Proactive insight card
- **Attribution**: "Ask Jarvis about this campaign" on hover
- **Benchmarks**: Auto-management toggle
- **Creatives**: Fatigue alerts and variation suggestions
- **Global**: Command palette (Cmd+K) for instant Jarvis queries from any page

### 5. Mobile-First Decisions
The mobile app isn't a shrunken desktop — it's a decision-making tool. The mobile dashboard shows:
- Health Score (one number)
- Stoplights summary (what needs attention)
- Jarvis alerts (what to do about it)
- Quick actions (pause, boost, approve)

That's it. No dense tables on a phone.

### 6. New vs Returning is a First-Class Citizen
Every revenue and conversion metric should be segmentable by New vs Returning. This isn't a filter — it's a persistent toggle at the top of every analytics page. nCPA (New Customer CPA) and nROAS (New Customer ROAS) are as prominent as total ROAS.

---

## What Makes This Better Than Both

| Dimension | Northbeam | Triple Whale | OpticData |
|-----------|-----------|--------------|-----------|
| **Attribution depth** | Best in class (7 models) | Basic (rule-based) | Northbeam-grade (5 models + AI-recommended) |
| **View-through attribution** | Yes (deterministic + modeled) | Limited | Building (modeled views next) |
| **Ease of use** | Hard (requires analyst) | Easy (operator-friendly) | Easy by default, deep on demand |
| **AI assistant** | None | Moby (query-only) | Jarvis (queries + actions + proactive insights) |
| **Automation** | None (manual stoplights) | Limited rules | 21-action automation + Jarvis auto-management |
| **Campaign management** | None | None | Full builder + publisher (Meta/TikTok/NewsBreak) |
| **Creative generation** | None | None | Claude-powered with brand context |
| **Price** | $1,500/mo minimum | $129/mo | Competitive with TW, fraction of NB |
| **Platform support** | Multi-platform | Shopify only | Multi-platform (Shopify, CC, custom) |
| **Signal relay** | Apex (Meta only) | Sonar (CAPI) | Meta CAPI + TikTok + Google (all 3) |
| **Benchmarks** | Self-benchmarks + stoplights | Industry benchmarks | Self-benchmarks + stoplights + AUTO-ACTIONS |
| **Mobile** | iOS only (basic) | iOS + Android | Decision-focused mobile (planned) |
| **Onboarding** | 29 days, bad reviews | Easy | AI-guided wizard + Jarvis onboarding |
| **Real-time** | 4x daily refresh | Varies | WebSocket live + 1-min relay cycles |
| **SQL access** | Export API (Enterprise) | None | Full SQL builder on every tier |

---

## The 8 Features We're Building Next

These are the remaining gaps to close with Northbeam, each designed to integrate with the vision above:

### 1. New vs Returning Customer Split
Every metric gets a New/Returning toggle. nCPA and nROAS become first-class KPIs on the dashboard.

### 2. Profit Benchmarks + Stoplights
Self-benchmarks from YOUR profitable days. Green/amber/red on every campaign row. Toggle for Jarvis auto-management.

### 3. Extended Lookback Windows
Support 90-day, 180-day, 1-year, and infinite lookback. Critical for high-consideration products.

### 4. No-Double-Counting Guarantee
Fractional credit constraint ensuring attributed revenue never exceeds actual revenue. Trust badge visible in the UI.

### 5. DNS-Level Pixel Option
Optional A-record setup for truly first-party tracking that survives all ad blockers and browser restrictions.

### 6. Metrics Correlation Explorer
Scatter plot with Pearson coefficient + Jarvis plain-English interpretation.

### 7. MMM+ Budget Forecasting
Media mix model showing diminishing returns curves per channel. "What happens if I shift $5K from Meta to TikTok?"

### 8. Modeled View-Through Attribution
ML-probabilistic view attribution for capturing upper-funnel impact that clicks-only misses.

---

## Summary

OpticData isn't trying to be a cheaper Northbeam or a smarter Triple Whale. It's a new category: **the autonomous marketing intelligence platform**.

Northbeam shows you the data. Triple Whale makes it look nice. OpticData understands it, tells you what it means, and takes action — with your approval or automatically, your choice.

The design reflects this: clean and decisive at the surface, analytically rigorous underneath, and AI-powered throughout. Every pixel of the interface should make the operator feel like they have a world-class data team and a genius media buyer working for them 24/7.

That's Jarvis. That's OpticData.
