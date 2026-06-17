-- Add summary + local_source columns to ncc_worldmove
ALTER TABLE ncc_worldmove
ADD COLUMN IF NOT EXISTS apn_summary TEXT;

ALTER TABLE ncc_worldmove
ADD COLUMN IF NOT EXISTS local_source TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ncc_worldmove_vendor_product_id ON ncc_worldmove(vendor_product_id);
