-- 024: Add CHECK constraints on numeric columns to prevent invalid data
-- Using NOT VALID so existing data won't block the migration;
-- constraints only enforce on future inserts/updates.

-- ── fb_ads_today ─────────────────────────────────────────────
ALTER TABLE fb_ads_today ADD CONSTRAINT chk_fb_spend_nonneg CHECK (spend >= 0) NOT VALID;
ALTER TABLE fb_ads_today ADD CONSTRAINT chk_fb_clicks_nonneg CHECK (clicks >= 0) NOT VALID;
ALTER TABLE fb_ads_today ADD CONSTRAINT chk_fb_impressions_nonneg CHECK (impressions >= 0) NOT VALID;
ALTER TABLE fb_ads_today ADD CONSTRAINT chk_fb_lpviews_nonneg CHECK (landing_page_views >= 0) NOT VALID;

-- ── cc_orders_today ──────────────────────────────────────────
ALTER TABLE cc_orders_today ADD CONSTRAINT chk_cc_revenue_nonneg CHECK (revenue >= 0) NOT VALID;
ALTER TABLE cc_orders_today ADD CONSTRAINT chk_cc_subtotal_nonneg CHECK (subtotal >= 0) NOT VALID;
ALTER TABLE cc_orders_today ADD CONSTRAINT chk_cc_tax_nonneg CHECK (tax_amount >= 0) NOT VALID;
ALTER TABLE cc_orders_today ADD CONSTRAINT chk_cc_quantity_nonneg CHECK (quantity >= 0) NOT VALID;

-- ── tiktok_ads_today ─────────────────────────────────────────
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_spend_nonneg CHECK (spend >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_impressions_nonneg CHECK (impressions >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_clicks_nonneg CHECK (clicks >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_conversions_nonneg CHECK (conversions >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_convvalue_nonneg CHECK (conversion_value >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_ctr_nonneg CHECK (ctr >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_cpc_nonneg CHECK (cpc >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_cpm_nonneg CHECK (cpm >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_cpa_nonneg CHECK (cpa >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_roas_nonneg CHECK (roas >= 0) NOT VALID;
ALTER TABLE tiktok_ads_today ADD CONSTRAINT chk_tt_videoviews_nonneg CHECK (video_views >= 0) NOT VALID;

-- ── creative_metrics_daily ───────────────────────────────────
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_spend_nonneg CHECK (spend >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_impressions_nonneg CHECK (impressions >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_clicks_nonneg CHECK (clicks >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_purchases_nonneg CHECK (purchases >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_revenue_nonneg CHECK (revenue >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_addtocarts_nonneg CHECK (add_to_carts >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_videoviews_nonneg CHECK (video_views >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_ctr_nonneg CHECK (ctr >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_cpc_nonneg CHECK (cpc >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_cpm_nonneg CHECK (cpm >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_cpa_nonneg CHECK (cpa >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_roas_nonneg CHECK (roas >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_cvr_nonneg CHECK (cvr >= 0) NOT VALID;
ALTER TABLE creative_metrics_daily ADD CONSTRAINT chk_cm_thumbstop_nonneg CHECK (thumb_stop_rate >= 0) NOT VALID;

-- ── ga4_sessions ─────────────────────────────────────────────
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_sessions_nonneg CHECK (sessions >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_users_nonneg CHECK (users_count >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_newusers_nonneg CHECK (new_users >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_pageviews_nonneg CHECK (pageviews >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_bouncerate_nonneg CHECK (bounce_rate >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_conversions_nonneg CHECK (conversions >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_convrate_nonneg CHECK (conversion_rate >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_revenue_nonneg CHECK (revenue >= 0) NOT VALID;
ALTER TABLE ga4_sessions ADD CONSTRAINT chk_ga4s_addtocarts_nonneg CHECK (add_to_carts >= 0) NOT VALID;

-- ── ga4_pages ────────────────────────────────────────────────
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_sessions_nonneg CHECK (sessions >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_pageviews_nonneg CHECK (pageviews >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_unique_pv_nonneg CHECK (unique_pageviews >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_avgtime_nonneg CHECK (avg_time_on_page >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_exits_nonneg CHECK (exits >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_exitrate_nonneg CHECK (exit_rate >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_conversions_nonneg CHECK (conversions >= 0) NOT VALID;
ALTER TABLE ga4_pages ADD CONSTRAINT chk_ga4p_revenue_nonneg CHECK (revenue >= 0) NOT VALID;

-- ── ga4_search_queries ───────────────────────────────────────
ALTER TABLE ga4_search_queries ADD CONSTRAINT chk_ga4sq_count_nonneg CHECK (search_count >= 0) NOT VALID;
ALTER TABLE ga4_search_queries ADD CONSTRAINT chk_ga4sq_exits_nonneg CHECK (search_exits >= 0) NOT VALID;
ALTER TABLE ga4_search_queries ADD CONSTRAINT chk_ga4sq_refinements_nonneg CHECK (search_refinements >= 0) NOT VALID;
ALTER TABLE ga4_search_queries ADD CONSTRAINT chk_ga4sq_convs_nonneg CHECK (conversions_after_search >= 0) NOT VALID;
ALTER TABLE ga4_search_queries ADD CONSTRAINT chk_ga4sq_revenue_nonneg CHECK (revenue_after_search >= 0) NOT VALID;

-- ── ga4_funnel_events ────────────────────────────────────────
ALTER TABLE ga4_funnel_events ADD CONSTRAINT chk_ga4fe_count_nonneg CHECK (event_count >= 0) NOT VALID;
ALTER TABLE ga4_funnel_events ADD CONSTRAINT chk_ga4fe_users_nonneg CHECK (unique_users >= 0) NOT VALID;

-- ── ga4_products ─────────────────────────────────────────────
ALTER TABLE ga4_products ADD CONSTRAINT chk_ga4pr_quantity_nonneg CHECK (quantity >= 0) NOT VALID;
ALTER TABLE ga4_products ADD CONSTRAINT chk_ga4pr_revenue_nonneg CHECK (revenue >= 0) NOT VALID;
ALTER TABLE ga4_products ADD CONSTRAINT chk_ga4pr_views_nonneg CHECK (views >= 0) NOT VALID;
ALTER TABLE ga4_products ADD CONSTRAINT chk_ga4pr_addtocarts_nonneg CHECK (add_to_carts >= 0) NOT VALID;
ALTER TABLE ga4_products ADD CONSTRAINT chk_ga4pr_purchases_nonneg CHECK (purchases >= 0) NOT VALID;

-- ── cc_customers ─────────────────────────────────────────────
ALTER TABLE cc_customers ADD CONSTRAINT chk_ccc_orders_nonneg CHECK (total_orders >= 0) NOT VALID;
ALTER TABLE cc_customers ADD CONSTRAINT chk_ccc_revenue_nonneg CHECK (total_revenue >= 0) NOT VALID;

-- ── cc_transactions ──────────────────────────────────────────
ALTER TABLE cc_transactions ADD CONSTRAINT chk_cct_amount_nonneg CHECK (amount >= 0) NOT VALID;

-- ── cc_purchases ─────────────────────────────────────────────
ALTER TABLE cc_purchases ADD CONSTRAINT chk_ccp_amount_nonneg CHECK (amount >= 0) NOT VALID;
ALTER TABLE cc_purchases ADD CONSTRAINT chk_ccp_quantity_nonneg CHECK (quantity >= 0) NOT VALID;

-- ── cc_products ──────────────────────────────────────────────
ALTER TABLE cc_products ADD CONSTRAINT chk_ccprod_price_nonneg CHECK (price >= 0) NOT VALID;
ALTER TABLE cc_products ADD CONSTRAINT chk_ccprod_cost_nonneg CHECK (cost >= 0) NOT VALID;

-- ── shopify_products ─────────────────────────────────────────
ALTER TABLE shopify_products ADD CONSTRAINT chk_sp_inventory_nonneg CHECK (total_inventory >= 0) NOT VALID;

-- ── shopify_customers ────────────────────────────────────────
ALTER TABLE shopify_customers ADD CONSTRAINT chk_sc_orders_nonneg CHECK (orders_count >= 0) NOT VALID;
ALTER TABLE shopify_customers ADD CONSTRAINT chk_sc_spent_nonneg CHECK (total_spent >= 0) NOT VALID;

-- ── klaviyo_profiles ─────────────────────────────────────────
ALTER TABLE klaviyo_profiles ADD CONSTRAINT chk_kp_clv_nonneg CHECK (total_clv >= 0) NOT VALID;
ALTER TABLE klaviyo_profiles ADD CONSTRAINT chk_kp_orders_nonneg CHECK (total_orders >= 0) NOT VALID;

-- ── klaviyo_lists ────────────────────────────────────────────
ALTER TABLE klaviyo_lists ADD CONSTRAINT chk_kl_profiles_nonneg CHECK (profile_count >= 0) NOT VALID;

-- ── klaviyo_campaigns ────────────────────────────────────────
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_sent_nonneg CHECK (sent_count >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_open_nonneg CHECK (open_count >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_click_nonneg CHECK (click_count >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_bounce_nonneg CHECK (bounce_count >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_unsub_nonneg CHECK (unsub_count >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_revenue_nonneg CHECK (revenue >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_openrate_nonneg CHECK (open_rate >= 0) NOT VALID;
ALTER TABLE klaviyo_campaigns ADD CONSTRAINT chk_kc_clickrate_nonneg CHECK (click_rate >= 0) NOT VALID;

-- ── klaviyo_flow_metrics ─────────────────────────────────────
ALTER TABLE klaviyo_flow_metrics ADD CONSTRAINT chk_kfm_count_nonneg CHECK (event_count >= 0) NOT VALID;
ALTER TABLE klaviyo_flow_metrics ADD CONSTRAINT chk_kfm_profiles_nonneg CHECK (unique_profiles >= 0) NOT VALID;
ALTER TABLE klaviyo_flow_metrics ADD CONSTRAINT chk_kfm_revenue_nonneg CHECK (revenue >= 0) NOT VALID;

-- ── offers ───────────────────────────────────────────────────
ALTER TABLE offers ADD CONSTRAINT chk_of_cogs_nonneg CHECK (cogs >= 0) NOT VALID;
ALTER TABLE offers ADD CONSTRAINT chk_of_shipping_nonneg CHECK (shipping_cost >= 0) NOT VALID;
ALTER TABLE offers ADD CONSTRAINT chk_of_handling_nonneg CHECK (handling_cost >= 0) NOT VALID;
ALTER TABLE offers ADD CONSTRAINT chk_of_gatewaypct_nonneg CHECK (gateway_fee_pct >= 0) NOT VALID;
ALTER TABLE offers ADD CONSTRAINT chk_of_gatewayflat_nonneg CHECK (gateway_fee_flat >= 0) NOT VALID;
ALTER TABLE offers ADD CONSTRAINT chk_of_targetcpa_nonneg CHECK (target_cpa >= 0) NOT VALID;
ALTER TABLE offers ADD CONSTRAINT chk_of_targetroas_nonneg CHECK (target_roas >= 0) NOT VALID;

-- ── cost_settings ────────────────────────────────────────────
ALTER TABLE cost_settings ADD CONSTRAINT chk_cs_value_nonneg CHECK (cost_value >= 0) NOT VALID;

-- ── ai_agents ────────────────────────────────────────────────
ALTER TABLE ai_agents ADD CONSTRAINT chk_ai_temp_range CHECK (temperature >= 0 AND temperature <= 2) NOT VALID;
ALTER TABLE ai_agents ADD CONSTRAINT chk_ai_tokens_nonneg CHECK (max_tokens >= 0) NOT VALID;

-- ── creative_tags ────────────────────────────────────────────
ALTER TABLE creative_tags ADD CONSTRAINT chk_ct_confidence_range CHECK (ai_confidence >= 0 AND ai_confidence <= 1) NOT VALID;
