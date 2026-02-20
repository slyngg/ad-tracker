-- AboveTopSecret Dash — Full Schema + Seed Data

CREATE TABLE fb_ads_today (
  id SERIAL PRIMARY KEY,
  account_name VARCHAR(255),
  campaign_name VARCHAR(255),
  ad_set_name VARCHAR(255),
  ad_set_id VARCHAR(255),
  ad_name VARCHAR(255),
  spend DECIMAL(10,2) DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ad_set_id, ad_name)
);

CREATE TABLE cc_orders_today (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) UNIQUE,
  offer_name VARCHAR(255),
  revenue DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  order_status VARCHAR(50) DEFAULT 'completed',
  new_customer BOOLEAN DEFAULT false,
  conversion_time TIMESTAMP DEFAULT NOW(),
  utm_campaign VARCHAR(255),
  fbclid VARCHAR(512),
  subscription_id VARCHAR(255),
  quantity INTEGER DEFAULT 1,
  is_core_sku BOOLEAN DEFAULT true,
  source VARCHAR(50) DEFAULT 'checkout_champ'
);

CREATE TABLE cc_upsells_today (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255),
  offered BOOLEAN DEFAULT true,
  accepted BOOLEAN DEFAULT false,
  offer_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE manual_overrides (
  id SERIAL PRIMARY KEY,
  metric_key VARCHAR(100),
  offer_name VARCHAR(255) DEFAULT 'ALL',
  override_value DECIMAL(10,4),
  set_by VARCHAR(255),
  set_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders_archive (
  id SERIAL PRIMARY KEY,
  archived_date DATE,
  order_data JSONB,
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fb_ads_archive (
  id SERIAL PRIMARY KEY,
  archived_date DATE,
  ad_data JSONB,
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by VARCHAR(255) DEFAULT 'system',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- FB Ads: 3 accounts, 5 offers, 20+ rows
INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions) VALUES
-- AboveTopSecret Main
('AboveTopSecret Main', 'Collagen - Broad', 'collagen-broad-25-54f', 'as_001', 'collagen_video_1', 1842.50, 487, 34210),
('AboveTopSecret Main', 'Collagen - Broad', 'collagen-broad-25-54f', 'as_001', 'collagen_static_2', 1356.00, 362, 28100),
('AboveTopSecret Main', 'Collagen - Lookalike', 'collagen-lal-purchasers', 'as_002', 'collagen_ugc_3', 1625.00, 398, 27110),
('AboveTopSecret Main', 'Super Greens - Interest', 'greens-health-interest', 'as_003', 'greens_video_1', 1890.30, 512, 38400),
('AboveTopSecret Main', 'Super Greens - Interest', 'greens-health-interest', 'as_003', 'greens_carousel_1', 1325.50, 380, 28830),
('AboveTopSecret Main', 'Multivitamin - Cold', 'multi-cold-35-65', 'as_004', 'multi_static_1', 987.40, 268, 20100),
('AboveTopSecret Main', 'Multivitamin - Cold', 'multi-cold-35-65', 'as_004', 'multi_video_2', 580.00, 144, 11100),
-- AboveTopSecret Scale
('AboveTopSecret Scale', 'Collagen - Scale', 'collagen-scale-lal', 'as_005', 'collagen_scale_v1', 1250.00, 378, 26500),
('AboveTopSecret Scale', 'Collagen - Scale', 'collagen-scale-lal', 'as_005', 'collagen_scale_s2', 900.00, 256, 18600),
('AboveTopSecret Scale', 'Protein - Fitness', 'protein-fitness-25-44m', 'as_006', 'protein_video_1', 1120.25, 312, 23200),
('AboveTopSecret Scale', 'Protein - Fitness', 'protein-fitness-25-44m', 'as_006', 'protein_ugc_2', 770.00, 211, 15700),
('AboveTopSecret Scale', 'Keto Burn - Diet', 'keto-diet-interest', 'as_007', 'keto_static_1', 645.00, 189, 13800),
('AboveTopSecret Scale', 'Keto Burn - Diet', 'keto-diet-interest', 'as_007', 'keto_video_2', 420.00, 128, 9500),
-- AboveTopSecret Test
('AboveTopSecret Test', 'Collagen - Test Creatives', 'collagen-test-broad', 'as_008', 'collagen_test_v1', 520.00, 178, 13200),
('AboveTopSecret Test', 'Collagen - Test Creatives', 'collagen-test-broad', 'as_008', 'collagen_test_s2', 370.00, 120, 8900),
('AboveTopSecret Test', 'Super Greens - Test', 'greens-test-lal', 'as_009', 'greens_test_v1', 410.00, 142, 10500),
('AboveTopSecret Test', 'Super Greens - Test', 'greens-test-lal', 'as_009', 'greens_test_c1', 280.00, 98, 7200),
('AboveTopSecret Test', 'Protein - Test', 'protein-test-broad', 'as_010', 'protein_test_v1', 350.00, 115, 8400),
('AboveTopSecret Test', 'Multivitamin - Test', 'multi-test-cold', 'as_011', 'multi_test_v1', 220.00, 72, 5300),
('AboveTopSecret Test', 'Keto Burn - Test', 'keto-test-diet', 'as_012', 'keto_test_v1', 185.00, 64, 4600);

-- CC Orders: 60+ rows across the 5 offers, linked via utm_campaign to ad_set_name
-- subtotal = revenue for seed data (no tax split in seed data)
-- Collagen Peptides orders (linked to collagen ad sets)
INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source) VALUES
('ORD-1001', 'Collagen Peptides', 89.95, 89.95, 0, 'completed', true, 'collagen-broad-25-54f', 'fb_cl_001', 'SUB-1001', 3, true, 'checkout_champ'),
('ORD-1002', 'Collagen Peptides', 149.95, 149.95, 0, 'completed', true, 'collagen-broad-25-54f', 'fb_cl_002', NULL, 5, true, 'checkout_champ'),
('ORD-1003', 'Collagen Peptides', 34.95, 34.95, 0, 'completed', false, 'collagen-broad-25-54f', 'fb_cl_003', 'SUB-1003', 1, true, 'checkout_champ'),
('ORD-1004', 'Collagen Peptides', 89.95, 89.95, 0, 'completed', true, 'collagen-lal-purchasers', 'fb_cl_004', 'SUB-1004', 3, true, 'checkout_champ'),
('ORD-1005', 'Collagen Peptides', 149.95, 149.95, 0, 'completed', true, 'collagen-lal-purchasers', 'fb_cl_005', NULL, 5, true, 'checkout_champ'),
('ORD-1006', 'Collagen Peptides', 34.95, 34.95, 0, 'completed', true, 'collagen-lal-purchasers', 'fb_cl_006', 'SUB-1006', 1, true, 'checkout_champ'),
('ORD-1007', 'Collagen Peptides', 89.95, 89.95, 0, 'completed', false, 'collagen-scale-lal', 'fb_cl_007', 'SUB-1007', 3, true, 'checkout_champ'),
('ORD-1008', 'Collagen Peptides', 149.95, 149.95, 0, 'completed', true, 'collagen-scale-lal', 'fb_cl_008', NULL, 5, true, 'checkout_champ'),
('ORD-1009', 'Collagen Peptides', 34.95, 34.95, 0, 'completed', true, 'collagen-scale-lal', 'fb_cl_009', 'SUB-1009', 1, true, 'checkout_champ'),
('ORD-1010', 'Collagen Peptides', 89.95, 89.95, 0, 'completed', true, 'collagen-test-broad', 'fb_cl_010', 'SUB-1010', 3, true, 'checkout_champ'),
('ORD-1011', 'Collagen Peptides', 149.95, 149.95, 0, 'completed', false, 'collagen-test-broad', 'fb_cl_011', NULL, 5, true, 'checkout_champ'),
('ORD-1012', 'Collagen Peptides', 34.95, 34.95, 0, 'completed', true, 'collagen-broad-25-54f', 'fb_cl_012', 'SUB-1012', 1, true, 'checkout_champ'),
('ORD-1013', 'Collagen Peptides', 89.95, 89.95, 0, 'completed', true, 'collagen-lal-purchasers', 'fb_cl_013', NULL, 3, true, 'checkout_champ'),
('ORD-1014', 'Collagen Peptides', 149.95, 149.95, 0, 'completed', true, 'collagen-scale-lal', 'fb_cl_014', 'SUB-1014', 5, true, 'checkout_champ'),

-- Super Greens orders
('ORD-2001', 'Super Greens', 79.95, 79.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_020', 'SUB-2001', 3, true, 'checkout_champ'),
('ORD-2002', 'Super Greens', 129.95, 129.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_021', NULL, 5, true, 'checkout_champ'),
('ORD-2003', 'Super Greens', 29.95, 29.95, 0, 'completed', false, 'greens-health-interest', 'fb_cl_022', 'SUB-2003', 1, true, 'checkout_champ'),
('ORD-2004', 'Super Greens', 79.95, 79.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_023', 'SUB-2004', 3, true, 'checkout_champ'),
('ORD-2005', 'Super Greens', 129.95, 129.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_024', NULL, 5, true, 'checkout_champ'),
('ORD-2006', 'Super Greens', 29.95, 29.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_025', 'SUB-2006', 1, true, 'checkout_champ'),
('ORD-2007', 'Super Greens', 79.95, 79.95, 0, 'completed', false, 'greens-test-lal', 'fb_cl_026', 'SUB-2007', 3, true, 'checkout_champ'),
('ORD-2008', 'Super Greens', 129.95, 129.95, 0, 'completed', true, 'greens-test-lal', 'fb_cl_027', NULL, 5, true, 'checkout_champ'),
('ORD-2009', 'Super Greens', 29.95, 29.95, 0, 'completed', true, 'greens-test-lal', 'fb_cl_028', 'SUB-2009', 1, true, 'checkout_champ'),
('ORD-2010', 'Super Greens', 79.95, 79.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_029', 'SUB-2010', 3, true, 'checkout_champ'),
('ORD-2011', 'Super Greens', 29.95, 29.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_030', NULL, 1, true, 'checkout_champ'),
('ORD-2012', 'Super Greens', 129.95, 129.95, 0, 'completed', false, 'greens-test-lal', 'fb_cl_031', 'SUB-2012', 5, true, 'checkout_champ'),

-- Protein Blend orders
('ORD-3001', 'Protein Blend', 84.95, 84.95, 0, 'completed', true, 'protein-fitness-25-44m', 'fb_cl_040', 'SUB-3001', 3, true, 'checkout_champ'),
('ORD-3002', 'Protein Blend', 139.95, 139.95, 0, 'completed', true, 'protein-fitness-25-44m', 'fb_cl_041', NULL, 5, true, 'checkout_champ'),
('ORD-3003', 'Protein Blend', 32.95, 32.95, 0, 'completed', false, 'protein-fitness-25-44m', 'fb_cl_042', 'SUB-3003', 1, true, 'checkout_champ'),
('ORD-3004', 'Protein Blend', 84.95, 84.95, 0, 'completed', true, 'protein-fitness-25-44m', 'fb_cl_043', 'SUB-3004', 3, true, 'checkout_champ'),
('ORD-3005', 'Protein Blend', 139.95, 139.95, 0, 'completed', true, 'protein-fitness-25-44m', 'fb_cl_044', NULL, 5, true, 'checkout_champ'),
('ORD-3006', 'Protein Blend', 32.95, 32.95, 0, 'completed', true, 'protein-fitness-25-44m', 'fb_cl_045', 'SUB-3006', 1, true, 'checkout_champ'),
('ORD-3007', 'Protein Blend', 84.95, 84.95, 0, 'completed', false, 'protein-test-broad', 'fb_cl_046', NULL, 3, true, 'checkout_champ'),
('ORD-3008', 'Protein Blend', 32.95, 32.95, 0, 'completed', true, 'protein-test-broad', 'fb_cl_047', 'SUB-3008', 1, true, 'checkout_champ'),
('ORD-3009', 'Protein Blend', 139.95, 139.95, 0, 'completed', true, 'protein-fitness-25-44m', 'fb_cl_048', 'SUB-3009', 5, true, 'checkout_champ'),

-- Daily Multivitamin orders
('ORD-4001', 'Daily Multivitamin', 59.95, 59.95, 0, 'completed', true, 'multi-cold-35-65', 'fb_cl_060', 'SUB-4001', 3, true, 'checkout_champ'),
('ORD-4002', 'Daily Multivitamin', 99.95, 99.95, 0, 'completed', true, 'multi-cold-35-65', 'fb_cl_061', NULL, 5, true, 'checkout_champ'),
('ORD-4003', 'Daily Multivitamin', 24.95, 24.95, 0, 'completed', false, 'multi-cold-35-65', 'fb_cl_062', 'SUB-4003', 1, true, 'checkout_champ'),
('ORD-4004', 'Daily Multivitamin', 59.95, 59.95, 0, 'completed', true, 'multi-cold-35-65', 'fb_cl_063', 'SUB-4004', 3, true, 'checkout_champ'),
('ORD-4005', 'Daily Multivitamin', 24.95, 24.95, 0, 'completed', true, 'multi-cold-35-65', 'fb_cl_064', NULL, 1, true, 'checkout_champ'),
('ORD-4006', 'Daily Multivitamin', 99.95, 99.95, 0, 'completed', true, 'multi-test-cold', 'fb_cl_065', 'SUB-4006', 5, true, 'checkout_champ'),
('ORD-4007', 'Daily Multivitamin', 59.95, 59.95, 0, 'completed', false, 'multi-test-cold', 'fb_cl_066', NULL, 3, true, 'checkout_champ'),
('ORD-4008', 'Daily Multivitamin', 24.95, 24.95, 0, 'completed', true, 'multi-cold-35-65', 'fb_cl_067', 'SUB-4008', 1, true, 'checkout_champ'),

-- Keto Burn orders
('ORD-5001', 'Keto Burn', 74.95, 74.95, 0, 'completed', true, 'keto-diet-interest', 'fb_cl_080', 'SUB-5001', 3, true, 'checkout_champ'),
('ORD-5002', 'Keto Burn', 124.95, 124.95, 0, 'completed', true, 'keto-diet-interest', 'fb_cl_081', NULL, 5, true, 'checkout_champ'),
('ORD-5003', 'Keto Burn', 27.95, 27.95, 0, 'completed', false, 'keto-diet-interest', 'fb_cl_082', 'SUB-5003', 1, true, 'checkout_champ'),
('ORD-5004', 'Keto Burn', 74.95, 74.95, 0, 'completed', true, 'keto-diet-interest', 'fb_cl_083', 'SUB-5004', 3, true, 'checkout_champ'),
('ORD-5005', 'Keto Burn', 27.95, 27.95, 0, 'completed', true, 'keto-test-diet', 'fb_cl_084', NULL, 1, true, 'checkout_champ'),
('ORD-5006', 'Keto Burn', 124.95, 124.95, 0, 'completed', true, 'keto-test-diet', 'fb_cl_085', 'SUB-5006', 5, true, 'checkout_champ'),
('ORD-5007', 'Keto Burn', 74.95, 74.95, 0, 'completed', false, 'keto-diet-interest', 'fb_cl_086', 'SUB-5007', 3, true, 'checkout_champ'),

-- Shopify orders
('ORD-6001', 'Collagen Peptides', 89.95, 89.95, 0, 'completed', true, 'collagen-broad-25-54f', 'fb_cl_090', 'SUB-6001', 3, true, 'shopify'),
('ORD-6002', 'Super Greens', 79.95, 79.95, 0, 'completed', true, 'greens-health-interest', 'fb_cl_091', NULL, 3, true, 'shopify'),
('ORD-6003', 'Protein Blend', 139.95, 139.95, 0, 'completed', false, 'protein-fitness-25-44m', 'fb_cl_092', 'SUB-6003', 5, true, 'shopify'),
('ORD-6004', 'Keto Burn', 27.95, 27.95, 0, 'completed', true, 'keto-diet-interest', 'fb_cl_093', NULL, 1, true, 'shopify'),
('ORD-6005', 'Daily Multivitamin', 59.95, 59.95, 0, 'completed', true, 'multi-cold-35-65', 'fb_cl_094', 'SUB-6005', 3, true, 'shopify'),
('ORD-6006', 'Collagen Peptides', 34.95, 34.95, 0, 'completed', true, 'collagen-lal-purchasers', 'fb_cl_095', 'SUB-6006', 1, true, 'shopify');

-- Upsell data (15+ rows)
INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name) VALUES
('ORD-1001', true, true, 'Collagen Peptides'),
('ORD-1002', true, true, 'Collagen Peptides'),
('ORD-1003', true, false, 'Collagen Peptides'),
('ORD-1004', true, true, 'Collagen Peptides'),
('ORD-1005', true, false, 'Collagen Peptides'),
('ORD-1006', true, true, 'Collagen Peptides'),
('ORD-1007', true, true, 'Collagen Peptides'),
('ORD-1008', true, false, 'Collagen Peptides'),
('ORD-2001', true, true, 'Super Greens'),
('ORD-2002', true, false, 'Super Greens'),
('ORD-2003', true, true, 'Super Greens'),
('ORD-2004', true, true, 'Super Greens'),
('ORD-2005', true, false, 'Super Greens'),
('ORD-3001', true, true, 'Protein Blend'),
('ORD-3002', true, false, 'Protein Blend'),
('ORD-3003', true, true, 'Protein Blend'),
('ORD-3004', true, false, 'Protein Blend'),
('ORD-4001', true, true, 'Daily Multivitamin'),
('ORD-4002', true, false, 'Daily Multivitamin'),
('ORD-4003', true, true, 'Daily Multivitamin'),
('ORD-5001', true, true, 'Keto Burn'),
('ORD-5002', true, true, 'Keto Burn'),
('ORD-5003', true, false, 'Keto Burn');
