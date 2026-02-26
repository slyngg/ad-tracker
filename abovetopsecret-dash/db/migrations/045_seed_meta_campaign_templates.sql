-- Seed Meta campaign templates — pre-populated, ready to use
-- Destin just picks a template, uploads creative, quick review, publish.

-- Use first user as owner, shared with everyone
DO $$
DECLARE
  v_uid INTEGER;
BEGIN
  SELECT id INTO v_uid FROM users ORDER BY id LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'No users found — skipping template seed';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 1. TRAFFIC — Cold Audience Content Push
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Traffic — Cold Audience Content Push',
    'Drive clicks to articles or landing pages from cold US audiences. Broad age range, interest-based targeting, optimized for link clicks. Great first campaign for new content.',
    'OUTCOME_TRAFFIC',
    '{
      "age_min": 25,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 2000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 2. TRAFFIC — Broad / Advantage+ (Let Meta Optimize)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Traffic — Broad Targeting (Advantage+)',
    'Wide-open targeting — let Meta''s algorithm find the best audience. No interest restrictions, 18-65, US only. Best when you have strong creative that does the qualifying. Higher budget for faster learning.',
    'OUTCOME_TRAFFIC',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 5000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 3. CONVERSIONS — Purchase / Signup
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Conversions — Purchase Campaign',
    'Optimized for purchases or signups. Higher daily budget to exit learning phase faster. Broad US targeting, 25-54 demo. Use with pixel events configured. Best for proven offers.',
    'OUTCOME_SALES',
    '{
      "age_min": 25,
      "age_max": 54,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 5000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": ""
    }'::JSONB,
    '{
      "conversion_event": "Purchase"
    }'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 4. CONVERSIONS — Lead Gen (On-Platform Form)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Lead Gen — Email / Contact Capture',
    'Capture leads directly on Meta with instant forms. Lower friction than landing pages. Great for building email lists, booking calls, or collecting signups. Moderate budget to start.',
    'OUTCOME_LEADS',
    '{
      "age_min": 22,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 3000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SIGN_UP",
      "link_url": ""
    }'::JSONB,
    '{
      "conversion_event": "Lead"
    }'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 5. ENGAGEMENT — Viral Content / Post Boost
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Engagement — Viral Content Push',
    'Maximize likes, comments, shares on your best content. Lowest budget entry point. Wide audience, let the content do the work. Perfect for testing creative before scaling to traffic/conversion campaigns.',
    'OUTCOME_ENGAGEMENT',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 1500,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 6. AWARENESS — Brand Builder (Top of Funnel)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Awareness — Brand Builder',
    'Maximize reach and brand recall. Optimized for impressions and ad recall lift. Use for launching new brands, products, or building audience before conversion campaigns. Wide net, low CPM.',
    'OUTCOME_AWARENESS',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 3000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 7. CONVERSIONS — Retargeting Warm Audience
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Retargeting — Site Visitors & Engagers',
    'Re-engage people who already visited your site or engaged with your content. Smaller audience = lower budget needed. High intent = higher conversion rate. Pair with urgency-driven creative.',
    'OUTCOME_SALES',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": [],
      "retargeting": true
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 2000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": ""
    }'::JSONB,
    '{
      "conversion_event": "Purchase",
      "audience_type": "retargeting"
    }'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 8. CONVERSIONS — Lookalike Scaling
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Scaling — Lookalike Audience',
    'Scale proven campaigns with lookalike audiences built from your best customers. Higher budget for aggressive scaling. Use after you have a winning creative + offer combo from other campaigns.',
    'OUTCOME_SALES',
    '{
      "age_min": 21,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": [],
      "lookalike": true
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 10000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": ""
    }'::JSONB,
    '{
      "conversion_event": "Purchase",
      "audience_type": "lookalike"
    }'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 9. TRAFFIC — Video Views to Landing Page
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Traffic — Video Creative to LP',
    'Video-first campaign driving traffic to a landing page. Video ads get 20-30% lower CPMs on Meta. Upload a short-form video (15-30s), let it hook then drive to your page. Perfect for UGC-style content.',
    'OUTCOME_TRAFFIC',
    '{
      "age_min": 21,
      "age_max": 45,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 3000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": "",
      "media_type": "video"
    }'::JSONB,
    '{}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- 10. CONVERSIONS — High-Budget CBO Test
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'CBO Test — Multi-Creative Split',
    'Campaign Budget Optimization test structure. Set a higher campaign-level budget and let Meta distribute across ad sets. Create multiple ad sets with different creatives to find winners fast. Kill losers after 48hrs.',
    'OUTCOME_SALES',
    '{
      "age_min": 21,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 7500,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": ""
    }'::JSONB,
    '{
      "conversion_event": "Purchase",
      "campaign_budget_optimization": true
    }'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- NEWSBREAK TEMPLATES
  -- ═══════════════════════════════════════════════════════════════

  -- 11. NewsBreak — Traffic Content Push
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Traffic — Content Article Push',
    'Drive clicks to articles on NewsBreak. Broad US targeting, optimized for link clicks. Low daily budget to start — scale what works. Great for news, lifestyle, and editorial content.',
    'TRAFFIC',
    '{
      "age_min": 25,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 2000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{"platform": "newsbreak"}'::JSONB,
    TRUE
  );

  -- 12. NewsBreak — Conversions
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Conversions — Purchase / Signup',
    'Optimize for on-site conversions via NewsBreak. Pixel events required. Higher budget for faster learning. Best for proven funnels with strong landing pages.',
    'CONVERSIONS',
    '{
      "age_min": 25,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 5000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": ""
    }'::JSONB,
    '{"platform": "newsbreak", "conversion_event": "Purchase"}'::JSONB,
    TRUE
  );

  -- 13. NewsBreak — Awareness / Reach
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Awareness — Brand / Content Reach',
    'Maximize impressions across NewsBreak''s feed. Wide audience targeting, lowest CPMs. Use for brand launches, new content series, or building top-of-funnel awareness before retargeting.',
    'AWARENESS',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 3000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{"platform": "newsbreak"}'::JSONB,
    TRUE
  );

  -- 14. NewsBreak — Engagement
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Engagement — Social Proof Builder',
    'Drive comments, likes, and shares on NewsBreak. Low budget entry point to test creative angles. High engagement signals boost organic reach. Perfect for viral content testing.',
    'ENGAGEMENT',
    '{
      "age_min": 21,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 1500,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{"platform": "newsbreak"}'::JSONB,
    TRUE
  );

  -- 15. NewsBreak — Lead Gen
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Lead Gen — Email / Subscriber Capture',
    'Capture leads from NewsBreak''s engaged audience. Moderate budget, 25-55 demo. Pair with a strong lead magnet (free guide, discount, exclusive access). Track with Lead pixel event.',
    'LEAD_GENERATION',
    '{
      "age_min": 25,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 2500,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SIGN_UP",
      "link_url": ""
    }'::JSONB,
    '{"platform": "newsbreak", "conversion_event": "Lead"}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- TIKTOK TEMPLATES
  -- ═══════════════════════════════════════════════════════════════

  -- 16. TikTok — Traffic
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Traffic — Short-Form Video to LP',
    'Drive clicks from TikTok to your landing page. Video-first platform — upload 15-30s vertical video (9:16). Hook in first 3 seconds. Broad targeting lets TikTok''s algo find your audience.',
    'TRAFFIC',
    '{
      "age_min": 18,
      "age_max": 45,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 3000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": "",
      "media_type": "video"
    }'::JSONB,
    '{"platform": "tiktok"}'::JSONB,
    TRUE
  );

  -- 17. TikTok — Conversions
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Conversions — Purchase Campaign',
    'Optimize for on-site purchases via TikTok. Higher budget needed — TikTok requires ~50 conversions/week to exit learning. Use UGC-style video creative for best results. Pixel must be configured.',
    'CONVERSIONS',
    '{
      "age_min": 18,
      "age_max": 45,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 7500,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": "",
      "media_type": "video"
    }'::JSONB,
    '{"platform": "tiktok", "conversion_event": "Purchase"}'::JSONB,
    TRUE
  );

  -- 18. TikTok — Reach / Awareness
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Reach — Maximum Eyeballs',
    'Maximize video views and reach on TikTok. Ultra-low CPMs. Use for brand awareness, product launches, or building retargeting pools. Broad targeting, let the content qualify the viewer.',
    'REACH',
    '{
      "age_min": 18,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 2000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": "",
      "media_type": "video"
    }'::JSONB,
    '{"platform": "tiktok"}'::JSONB,
    TRUE
  );

  -- 19. TikTok — App Install
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'App Install — Mobile Download',
    'Drive app installs from TikTok. Perfect for mobile apps — TikTok''s audience skews mobile-native. Demo creative showing the app in action converts best. Track with SDK events.',
    'APP_INSTALL',
    '{
      "age_min": 18,
      "age_max": 35,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 5000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "DOWNLOAD",
      "link_url": "",
      "media_type": "video"
    }'::JSONB,
    '{"platform": "tiktok"}'::JSONB,
    TRUE
  );

  -- ═══════════════════════════════════════════════════════════════
  -- GOOGLE TEMPLATES
  -- ═══════════════════════════════════════════════════════════════

  -- 20. Google — Search Conversions
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Search — High-Intent Conversions',
    'Capture high-intent search traffic on Google. Users are actively searching for your solution. Strong headlines + relevant descriptions = best Quality Scores. Start with exact/phrase match keywords.',
    'CONVERSIONS',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 5000,
      "bid_strategy": "MAXIMIZE_CONVERSIONS"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{"platform": "google", "campaign_type": "search", "conversion_event": "Purchase"}'::JSONB,
    TRUE
  );

  -- 21. Google — Display Awareness
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Display — Brand Awareness',
    'Run display ads across Google''s network for brand awareness. Upload image banners (300x250, 728x90, 160x600). Wide reach at low CPMs. Great for retargeting display or top-of-funnel prospecting.',
    'AWARENESS',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 3000,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": ""
    }'::JSONB,
    '{"platform": "google", "campaign_type": "display"}'::JSONB,
    TRUE
  );

  -- 22. Google — Performance Max
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'Performance Max — Full Funnel',
    'Google''s AI-powered campaign type. Runs across Search, Display, YouTube, Gmail, and Discover. Upload multiple assets (headlines, descriptions, images, videos) and let Google optimize placement. Best for ecommerce.',
    'CONVERSIONS',
    '{
      "age_min": 18,
      "age_max": 65,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 7500,
      "bid_strategy": "MAXIMIZE_CONVERSIONS"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "SHOP_NOW",
      "link_url": ""
    }'::JSONB,
    '{"platform": "google", "campaign_type": "performance_max", "conversion_event": "Purchase"}'::JSONB,
    TRUE
  );

  -- 23. Google — YouTube Video Views
  INSERT INTO campaign_templates (user_id, name, description, objective, targeting, budget_config, creative_config, config, is_shared)
  VALUES (
    v_uid,
    'YouTube — Video Views Campaign',
    'Drive video views on YouTube. Upload a 15-30s video ad. Skippable in-stream or in-feed placement. Great for building brand awareness and remarketing lists. Low cost per view.',
    'AWARENESS',
    '{
      "age_min": 18,
      "age_max": 55,
      "genders": [],
      "locations": ["US"],
      "interests": []
    }'::JSONB,
    '{
      "budget_type": "daily",
      "budget_cents": 2500,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }'::JSONB,
    '{
      "primary_text": "",
      "headline": "",
      "description": "",
      "call_to_action_type": "LEARN_MORE",
      "link_url": "",
      "media_type": "video"
    }'::JSONB,
    '{"platform": "google", "campaign_type": "youtube"}'::JSONB,
    TRUE
  );

  RAISE NOTICE 'Seeded 23 campaign templates (Meta, NewsBreak, TikTok, Google) for user %', v_uid;
END $$;
