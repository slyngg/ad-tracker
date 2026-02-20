-- Migration 002: Add tax/status fields to cc_orders_today + app_settings table
-- Run on existing deployments: psql $DATABASE_URL -f db/migrations/002-add-tax-and-settings.sql

-- Add subtotal, tax_amount, order_status to cc_orders_today
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) DEFAULT 'completed';

-- Backfill: set subtotal = revenue for existing rows (assumes existing data has no tax split)
UPDATE cc_orders_today SET subtotal = revenue WHERE subtotal = 0 AND revenue > 0;

-- App settings table for integration credentials
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by VARCHAR(255) DEFAULT 'system',
  updated_at TIMESTAMP DEFAULT NOW()
);
