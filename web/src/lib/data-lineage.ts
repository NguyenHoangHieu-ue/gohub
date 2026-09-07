// Static data lineage for GoHub Intel analytics system.
// Update this file when tabs, tables, or connections change — code location shown in each connection.

export type TabGroup = 'Overview' | 'Sales' | 'Operations' | 'Planning'
export type DbSource = 'gohub_dw' | 'supabase' | 'turso' | 'external'

export interface TabNode {
  id: string
  label: string
  route: string
  group: TabGroup
  description: string
}

export interface Field {
  name: string
  type: string
  note?: string
}

export interface DbTable {
  id: string
  label: string
  source: DbSource
  description: string
  updateFreq: string
  keyFields: Field[]
}

export interface Connection {
  tabId: string
  tableId: string
  fields: string[]
  metrics: string[]
}

export const TAB_COLORS: Record<TabGroup, { fill: string; stroke: string; text: string }> = {
  Overview:   { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e40af' },
  Sales:      { fill: '#d1fae5', stroke: '#10b981', text: '#065f46' },
  Operations: { fill: '#ede9fe', stroke: '#8b5cf6', text: '#4c1d95' },
  Planning:   { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' },
}

export const SOURCE_COLORS: Record<DbSource, { fill: string; stroke: string; text: string; label: string }> = {
  gohub_dw: { fill: '#fed7aa', stroke: '#f97316', text: '#7c2d12', label: 'gohub_dw (GCP)' },
  supabase:  { fill: '#bfdbfe', stroke: '#3b82f6', text: '#1e3a8a', label: 'Supabase' },
  turso:     { fill: '#e9d5ff', stroke: '#a855f7', text: '#581c87', label: 'Turso' },
  external:  { fill: '#ccfbf1', stroke: '#14b8a6', text: '#134e4a', label: 'External API' },
}

export const GROUP_LABELS: Record<TabGroup, string> = {
  Overview: 'Tổng quan', Sales: 'Sales', Operations: 'Vận hành', Planning: 'Kế hoạch',
}

export const GROUP_ORDER: TabGroup[] = ['Overview', 'Sales', 'Operations', 'Planning']

export const TABS: TabNode[] = [
  { id: 'dashboard',     label: 'Dashboard',       route: '/analytics',              group: 'Overview',   description: 'KPI tổng hợp, biểu đồ doanh thu, hiệu suất kênh/nguồn, Monthly Summary' },
  { id: 'bod',           label: 'BOD Report',       route: '/analytics/bod',          group: 'Overview',   description: 'Báo cáo Ban Giám Đốc: Revenue/GP/CM1, kênh, chi phí vận hành' },
  { id: 'quarterly',     label: 'Quarter Report',   route: '/analytics/quarterly',    group: 'Overview',   description: 'Báo cáo quý: Revenue/GP/CM1 từng tháng, B2B+B2C breakdown, target quý' },
  { id: 'all-time',      label: 'All-Time',         route: '/analytics/all-time',     group: 'Overview',   description: 'Hiệu suất lịch sử từ đầu đến nay theo tháng/quý/năm' },
  { id: 'channels',      label: 'Channels',         route: '/analytics/channels',     group: 'Sales',      description: 'Hiệu suất từng kênh bán: revenue, GP, CM1, trend theo tháng' },
  { id: 'b2b',           label: 'B2B',              route: '/analytics/b2b',          group: 'Sales',      description: 'Phân tích B2B: strategic vs non-strategic partner, platform fee' },
  { id: 'b2c',           label: 'B2C',              route: '/analytics/b2c',          group: 'Sales',      description: 'Phân tích B2C: kênh online, chi phí marketing, acquisition' },
  { id: 'website',       label: 'Website',          route: '/analytics/website',      group: 'Sales',      description: 'Traffic GA4: sessions, conversions; GSC: clicks, impressions, CTR' },
  { id: 'staff',         label: 'Staff',            route: '/analytics/staff',        group: 'Sales',      description: 'Hiệu suất nhân viên sales: revenue, GP per staff' },
  { id: 'customers',     label: 'Customers',        route: '/analytics/customers',    group: 'Sales',      description: 'Phân tích khách hàng: top customers, purchase patterns' },
  { id: 'vendors',       label: 'Vendors',          route: '/analytics/vendors',      group: 'Sales',      description: 'Hiệu suất nhà cung cấp: revenue, GP per vendor' },
  { id: 'orders',        label: 'Orders',           route: '/analytics/orders',       group: 'Operations', description: 'Danh sách đơn hàng chi tiết, search và filter theo nhiều tiêu chí' },
  { id: 'fulfillment',   label: 'Inventory',        route: '/analytics/fulfillment',  group: 'Operations', description: 'Kế hoạch nhập hàng theo tuần từng SKU (VN/US) + PO tracker — gợi ý bán/nhập từ tốc độ bán 30 ngày gohub_dw' },
  { id: '3hk-usage',     label: '3HK Data Usage',   route: '/analytics/3hk-usage',   group: 'Operations', description: 'Theo dõi usage data 3HK: GB/ngày/SIM, speed map, usage by country' },
  { id: 'cs-troubleshoot', label: 'CS Troubleshoot', route: '/analytics/cs-troubleshoot', group: 'Operations', description: 'Tra cứu đơn hàng theo mã khách, hỗ trợ CS xử lý sự cố' },
  { id: 'feedback',      label: 'Feedback',         route: '/analytics/feedback',     group: 'Operations', description: 'Thu thập và xem phản hồi từ nội bộ và khách hàng' },
  { id: 'products',      label: 'Products',         route: '/analytics/products',     group: 'Planning',   description: 'Hiệu suất SKU: doanh thu, số lượng, vendor, destination country' },
  { id: 'targets',       label: 'KPI / Target',     route: '/analytics/targets',      group: 'Planning',   description: 'Quản lý KPI target: revenue, CM1 target theo tháng và quý' },
]

export const DB_TABLES: DbTable[] = [
  {
    id: 'fact_fulfillment_revenue', label: 'fact_fulfillment_revenue', source: 'gohub_dw',
    description: 'Bảng fact chính: doanh thu theo ngày fulfillment. Nguồn của hầu hết mọi chỉ số Revenue/GP/CM1.',
    updateFreq: 'Pipeline hàng ngày (T-1)',
    keyFields: [
      { name: 'fulfiled_date', type: 'date', note: 'Ngày fulfillment — filter chính' },
      { name: 'fulfilled_revenue_amount_vnd', type: 'numeric', note: 'Doanh thu VND' },
      { name: 'cogs_amount_vnd', type: 'numeric', note: 'Chi phí sản phẩm (COGS)' },
      { name: 'gross_profit_vnd', type: 'numeric', note: 'GP = Revenue - COGS' },
      { name: 'fulfilled_quantity', type: 'integer', note: 'Số lượng SIM/eSIM' },
      { name: 'order_source_code', type: 'text', note: 'FK → dim_order_source.code' },
      { name: 'sku', type: 'text', note: 'FK → dim_sku.sku' },
      { name: 'customer_code', type: 'text', note: 'FK → dim_customer.code' },
      { name: 'staff_code', type: 'text', note: 'FK → dim_staff.code' },
      { name: 'location_id', type: 'text', note: 'FK → dim_location.location_id' },
    ]
  },
  {
    id: 'fact_sales_revenue', label: 'fact_sales_revenue', source: 'gohub_dw',
    description: 'Doanh thu theo ngày tạo đơn (created_date). Dùng khi filter "Ngày tạo" thay vì "Ngày fulfillment".',
    updateFreq: 'Pipeline hàng ngày (T-1)',
    keyFields: [
      { name: 'created_date', type: 'date', note: 'Ngày tạo đơn' },
      { name: 'revenue_amount_vnd', type: 'numeric' },
      { name: 'cogs_amount_vnd', type: 'numeric' },
      { name: 'gross_profit_vnd', type: 'numeric' },
      { name: 'order_source_code', type: 'text' },
      { name: 'sku', type: 'text' },
      { name: 'customer_code', type: 'text' },
    ]
  },
  {
    id: 'fact_data_usage', label: 'fact_data_usage', source: 'gohub_dw',
    description: 'Usage data 3HK: budget và thực tế từng SIM theo đợt.',
    updateFreq: 'Sync định kỳ từ 3HK API',
    keyFields: [
      { name: 'iccid', type: 'text', note: 'Mã SIM vật lý' },
      { name: 'sku', type: 'text' },
      { name: 'sku_type', type: 'text', note: 'Unlimited / Fixed' },
      { name: 'data_amount_gb', type: 'numeric', note: 'Budget data (GB)' },
      { name: 'total_data_gb', type: 'numeric', note: 'Đã dùng thực tế (GB)' },
      { name: 'activation_date', type: 'date' },
    ]
  },
  {
    id: 'dim_order_source', label: 'dim_order_source', source: 'gohub_dw',
    description: 'Kênh bán hàng: tên kênh và phân nhóm B2B/B2C. JOIN với mọi fact table.',
    updateFreq: 'Tĩnh — update thủ công',
    keyFields: [
      { name: 'code', type: 'text', note: 'PK — khớp order_source_code trong fact' },
      { name: 'channel_name', type: 'text', note: 'Tên hiển thị kênh' },
      { name: 'group_name', type: 'text', note: "'B2B' hoặc 'B2C'" },
    ]
  },
  {
    id: 'dim_sku', label: 'dim_sku', source: 'gohub_dw',
    description: 'Dimension sản phẩm/SKU: vendor, loại SIM, destination. Sync từ Supabase sku_catalog.',
    updateFreq: 'Sync từ Supabase sku_catalog',
    keyFields: [
      { name: 'sku', type: 'text', note: 'PK' },
      { name: 'category_name', type: 'text' },
      { name: 'vendor', type: 'text', note: '3HKDATAPOOL, WM...' },
      { name: 'type_of_sim', type: 'text', note: 'eSim / Physical' },
    ]
  },
  {
    id: 'dim_staff', label: 'dim_staff', source: 'gohub_dw',
    description: 'Dimension nhân viên sales.',
    updateFreq: 'Tĩnh — update thủ công',
    keyFields: [
      { name: 'code', type: 'text', note: 'PK — khớp staff_code trong fact' },
      { name: 'name', type: 'text' },
    ]
  },
  {
    id: 'dim_customer', label: 'dim_customer', source: 'gohub_dw',
    description: 'Dimension khách hàng.',
    updateFreq: 'Sync hàng ngày',
    keyFields: [
      { name: 'code', type: 'text', note: 'PK — khớp customer_code trong fact' },
      { name: 'name', type: 'text' },
      { name: 'customer_type', type: 'text' },
    ]
  },
  {
    id: 'dim_location', label: 'dim_location', source: 'gohub_dw',
    description: 'Dimension chi nhánh/vùng miền.',
    updateFreq: 'Tĩnh',
    keyFields: [
      { name: 'location_id', type: 'text', note: 'PK' },
      { name: 'location_name', type: 'text' },
      { name: 'region', type: 'text' },
    ]
  },
  {
    id: 'analytics_channel_costs', label: 'analytics_channel_costs', source: 'supabase',
    description: 'Chi phí marketing theo kênh và tháng (ads, platform fee, sponsor, media). Nhập từ Manage Costs.',
    updateFreq: 'Thủ công — nhập từ Manage Costs',
    keyFields: [
      { name: 'channel', type: 'text' },
      { name: 'month', type: 'text', note: 'YYYY-MM' },
      { name: 'ads', type: 'json', note: '{type:"amount"|"percent", value}' },
      { name: 'platform_fee', type: 'json' },
      { name: 'sponsor_products', type: 'json' },
      { name: 'media', type: 'json' },
    ]
  },
  {
    id: 'analytics_channel_group_costs', label: 'analytics_channel_group_costs', source: 'supabase',
    description: 'Chi phí cấp nhóm B2B/B2C theo tháng (fixed VND). Nhập từ Manage Costs.',
    updateFreq: 'Thủ công — nhập từ Manage Costs',
    keyFields: [
      { name: 'group_name', type: 'text', note: "'B2B' hoặc 'B2C'" },
      { name: 'month', type: 'text', note: 'YYYY-MM' },
      { name: 'amount', type: 'numeric', note: 'VND' },
    ]
  },
  {
    id: 'analytics_monthly_kpis', label: 'analytics_monthly_kpis', source: 'supabase',
    description: 'Cache KPI tháng: Revenue/GP/CM1/3HK pre-computed. Cron refresh 00:00 UTC. Dùng cho chatbot và Dashboard Monthly Summary.',
    updateFreq: 'Tự động — cron 00:00 UTC hàng ngày',
    keyFields: [
      { name: 'month', type: 'text', note: 'YYYY-MM' },
      { name: 'company_code', type: 'text', note: 'ALL / VN / US' },
      { name: 'revenue', type: 'numeric' },
      { name: 'gross_profit', type: 'numeric' },
      { name: 'cm1', type: 'numeric', note: 'GP - Operation Cost' },
      { name: 'revenue_3hk', type: 'numeric', note: 'Doanh thu SP 3HK' },
    ]
  },
  {
    id: 'analytics_target_planning', label: 'analytics_target_planning', source: 'supabase',
    description: 'KPI Target theo tháng: revenue và CM1 target. Nhập từ tab Targets.',
    updateFreq: 'Thủ công — nhập từ tab Targets',
    keyFields: [
      { name: 'year', type: 'integer' },
      { name: 'month', type: 'integer' },
      { name: 'company_code', type: 'text' },
      { name: 'target_revenue', type: 'numeric' },
      { name: 'target_gpm2', type: 'numeric', note: 'CM1 target (alias target_gpm2)' },
    ]
  },
  {
    id: 'data_usage_log', label: 'data_usage_log', source: 'supabase',
    description: 'Log usage data 3HK thô theo ngày: cơ sở cho speed-map và usage by country.',
    updateFreq: 'Sync từ 3HK API (thủ công/định kỳ)',
    keyFields: [
      { name: 'iccid', type: 'text' },
      { name: 'offer_name', type: 'text' },
      { name: 'data_gb', type: 'numeric' },
      { name: 'report_date', type: 'date' },
      { name: 'country', type: 'text' },
    ]
  },
  {
    id: 'quarterly_targets', label: 'quarterly_targets', source: 'turso',
    description: 'Target theo quý: revenue và CM1 target cho Q1-Q4. Nhập từ Quarter Report tab.',
    updateFreq: 'Thủ công — nhập từ Quarter Report',
    keyFields: [
      { name: 'year', type: 'integer' },
      { name: 'quarter', type: 'integer', note: '1-4' },
      { name: 'company_code', type: 'text' },
      { name: 'target_revenue', type: 'numeric' },
      { name: 'target_cm1', type: 'numeric' },
    ]
  },
  {
    id: 'ga4_api', label: 'GA4 (Google Analytics)', source: 'external',
    description: 'Google Analytics 4 API: sessions, conversions, active users, traffic sources.',
    updateFreq: 'Real-time API call',
    keyFields: [
      { name: 'sessions', type: 'integer' },
      { name: 'conversions', type: 'integer' },
      { name: 'activeUsers', type: 'integer' },
      { name: 'source / medium', type: 'text' },
    ]
  },
  {
    id: 'gsc_api', label: 'GSC (Search Console)', source: 'external',
    description: 'Google Search Console API: clicks, impressions, CTR, average position.',
    updateFreq: 'API call (T-3 latency)',
    keyFields: [
      { name: 'clicks', type: 'integer' },
      { name: 'impressions', type: 'integer' },
      { name: 'ctr', type: 'numeric' },
      { name: 'position', type: 'numeric' },
      { name: 'query', type: 'text' },
    ]
  },
]

export const CONNECTIONS: Connection[] = [
  // Dashboard
  { tabId: 'dashboard', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'cogs_amount_vnd', 'order_source_code', 'location_id'], metrics: ['KPI Cards (Revenue / GP / CM1)', 'Revenue Chart', 'Region Chart', 'Performance by Source & Channel', 'Recent Orders list'] },
  { tabId: 'dashboard', tableId: 'fact_sales_revenue', fields: ['created_date', 'revenue_amount_vnd', 'gross_profit_vnd', 'order_source_code'], metrics: ['KPI Cards khi filter "Ngày tạo"', 'Revenue Chart (Ngày tạo mode)'] },
  { tabId: 'dashboard', tableId: 'dim_order_source', fields: ['code', 'channel_name', 'group_name'], metrics: ['Performance by Channel', 'B2B Strategic filter'] },
  { tabId: 'dashboard', tableId: 'dim_location', fields: ['location_id', 'location_name'], metrics: ['Region Chart (Bản đồ chi nhánh)'] },
  { tabId: 'dashboard', tableId: 'analytics_monthly_kpis', fields: ['month', 'company_code', 'revenue', 'gross_profit', 'cm1', 'revenue_3hk'], metrics: ['Monthly Summary section (3 tháng gần nhất)'] },
  { tabId: 'dashboard', tableId: 'analytics_target_planning', fields: ['year', 'month', 'company_code', 'target_revenue'], metrics: ['Target progress bars'] },
  // BOD Report
  { tabId: 'bod', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'cogs_amount_vnd', 'order_source_code'], metrics: ['KPI Cards', 'Revenue trend chart', 'Channel performance', 'Group margin table'] },
  { tabId: 'bod', tableId: 'dim_order_source', fields: ['code', 'channel_name', 'group_name'], metrics: ['Channel breakdown', 'B2B / B2C split'] },
  { tabId: 'bod', tableId: 'analytics_channel_costs', fields: ['channel', 'month', 'ads', 'platform_fee', 'sponsor_products', 'media'], metrics: ['CM1 = GP - Channel Costs', 'Channel Cost detail'] },
  { tabId: 'bod', tableId: 'analytics_channel_group_costs', fields: ['group_name', 'month', 'amount'], metrics: ['Group CM1 (Group Cost deduction)'] },
  // Quarter Report
  { tabId: 'quarterly', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'order_source_code'], metrics: ['Monthly Revenue/GP/CM1 per tháng trong quý', 'B2B/B2C sub-rows'] },
  { tabId: 'quarterly', tableId: 'dim_order_source', fields: ['code', 'group_name', 'channel_name'], metrics: ['B2B vs B2C breakdown', 'Channel detail × month'] },
  { tabId: 'quarterly', tableId: 'analytics_channel_costs', fields: ['channel', 'month', 'ads', 'platform_fee', 'sponsor_products', 'media'], metrics: ['Channel Cost deduction trong CM1'] },
  { tabId: 'quarterly', tableId: 'analytics_channel_group_costs', fields: ['group_name', 'month', 'amount'], metrics: ['Group Cost deduction trong CM1'] },
  { tabId: 'quarterly', tableId: 'quarterly_targets', fields: ['year', 'quarter', 'company_code', 'target_revenue', 'target_cm1'], metrics: ['Target vs Actual trong quarterly summary'] },
  // All-Time
  { tabId: 'all-time', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'cogs_amount_vnd', 'order_source_code'], metrics: ['Revenue/GP/CM1 trend từ đầu đến nay', 'Cumulative channel performance'] },
  { tabId: 'all-time', tableId: 'dim_order_source', fields: ['code', 'channel_name', 'group_name'], metrics: ['Channel breakdown (all-time)'] },
  // Channels
  { tabId: 'channels', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'order_source_code'], metrics: ['Revenue/GP/CM1 per channel', 'Channel trend chart', 'Performance table'] },
  { tabId: 'channels', tableId: 'dim_order_source', fields: ['code', 'channel_name', 'group_name'], metrics: ['Channel list', 'Group filter'] },
  { tabId: 'channels', tableId: 'analytics_channel_costs', fields: ['channel', 'month', 'ads', 'platform_fee', 'sponsor_products', 'media'], metrics: ['CM1 = GP - Channel Costs'] },
  { tabId: 'channels', tableId: 'analytics_channel_group_costs', fields: ['group_name', 'month', 'amount'], metrics: ['Group-level cost deduction'] },
  // B2B
  { tabId: 'b2b', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'order_source_code'], metrics: ['B2B Revenue/GP/CM1 cards', 'Strategic vs Non-Strategic', 'B2B trend chart'] },
  { tabId: 'b2b', tableId: 'dim_order_source', fields: ['code', 'channel_name', 'group_name'], metrics: ['B2B channel filter', 'Partner identification'] },
  { tabId: 'b2b', tableId: 'analytics_channel_costs', fields: ['channel', 'month', 'platform_fee'], metrics: ['Platform fee deduction cho CM1'] },
  // B2C
  { tabId: 'b2c', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'order_source_code'], metrics: ['B2C Revenue/GP/CM1', 'Channel performance', 'Trend chart'] },
  { tabId: 'b2c', tableId: 'dim_order_source', fields: ['code', 'channel_name', 'group_name'], metrics: ['B2C channel filter'] },
  { tabId: 'b2c', tableId: 'analytics_channel_costs', fields: ['channel', 'month', 'ads', 'platform_fee', 'sponsor_products', 'media'], metrics: ['Channel Costs → CM1 calculation'] },
  { tabId: 'b2c', tableId: 'analytics_channel_group_costs', fields: ['group_name', 'month', 'amount'], metrics: ['B2C Group Cost deduction'] },
  // Website
  { tabId: 'website', tableId: 'ga4_api', fields: ['sessions', 'conversions', 'activeUsers', 'source / medium'], metrics: ['Traffic overview cards', 'Conversion funnel', 'Source breakdown chart'] },
  { tabId: 'website', tableId: 'gsc_api', fields: ['clicks', 'impressions', 'ctr', 'position', 'query'], metrics: ['SEO performance', 'Keyword rankings table', 'CTR trend'] },
  // Staff
  { tabId: 'staff', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'staff_code', 'order_source_code'], metrics: ['Revenue per staff', 'Staff performance ranking'] },
  { tabId: 'staff', tableId: 'dim_staff', fields: ['code', 'name'], metrics: ['Staff name mapping'] },
  { tabId: 'staff', tableId: 'dim_order_source', fields: ['code', 'channel_name'], metrics: ['Channel filter trong staff view'] },
  // Customers
  { tabId: 'customers', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'customer_code', 'order_source_code'], metrics: ['Revenue per customer', 'Top customers list'] },
  { tabId: 'customers', tableId: 'dim_customer', fields: ['code', 'name', 'customer_type'], metrics: ['Customer name & type mapping'] },
  // Vendors
  { tabId: 'vendors', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'sku', 'order_source_code'], metrics: ['Revenue/GP per vendor', 'Vendor performance table'] },
  { tabId: 'vendors', tableId: 'dim_sku', fields: ['sku', 'vendor', 'category_name'], metrics: ['Vendor name mapping qua SKU'] },
  { tabId: 'vendors', tableId: 'dim_order_source', fields: ['code', 'group_name'], metrics: ['Strategic B2B flag'] },
  // Orders
  { tabId: 'orders', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'order_source_code', 'staff_code', 'customer_code', 'sku'], metrics: ['Order list (Fulfillment date mode)'] },
  { tabId: 'orders', tableId: 'fact_sales_revenue', fields: ['created_date', 'revenue_amount_vnd', 'order_source_code', 'customer_code'], metrics: ['Order list (Created date mode)'] },
  { tabId: 'orders', tableId: 'dim_order_source', fields: ['code', 'channel_name'], metrics: ['Channel name trong order list'] },
  { tabId: 'orders', tableId: 'dim_staff', fields: ['code', 'name'], metrics: ['Staff name trong order list'] },
  { tabId: 'orders', tableId: 'dim_customer', fields: ['code', 'name'], metrics: ['Customer name trong order list'] },
  // Inventory (kế hoạch nhập hàng — s160, xem docs/wiki/system/tabs/analytics-fulfillment.md)
  { tabId: 'fulfillment', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_quantity', 'sku'], metrics: ['Vận tốc bán 30 ngày/SKU cho gợi ý Bán dự kiến/Số nhập'] },
  { tabId: 'fulfillment', tableId: 'dim_sku', fields: ['sku', 'vendor'], metrics: ['Auto-lookup vendor khi thêm SKU theo dõi'] },
  // 3HK Usage
  { tabId: '3hk-usage', tableId: 'fact_data_usage', fields: ['iccid', 'sku', 'sku_type', 'data_amount_gb', 'total_data_gb', 'activation_date'], metrics: ['Usage overview: GB/ngày/SIM, budget vs actual', 'Unlimited plan calculation'] },
  { tabId: '3hk-usage', tableId: 'data_usage_log', fields: ['iccid', 'offer_name', 'data_gb', 'report_date', 'country'], metrics: ['Speed map (3HK zone → country)', 'Usage by country × month sub-report', 'Daily usage trend'] },
  { tabId: '3hk-usage', tableId: 'dim_sku', fields: ['sku', 'vendor', 'category_name'], metrics: ['SKU label + type identification'] },
  // CS Troubleshoot
  { tabId: 'cs-troubleshoot', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'customer_code', 'order_source_code', 'sku'], metrics: ['Customer order lookup kết quả'] },
  { tabId: 'cs-troubleshoot', tableId: 'dim_order_source', fields: ['code', 'channel_name'], metrics: ['Channel name trong lookup result'] },
  { tabId: 'cs-troubleshoot', tableId: 'dim_customer', fields: ['code', 'name'], metrics: ['Customer name mapping'] },
  // Products
  { tabId: 'products', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd', 'sku', 'order_source_code'], metrics: ['Revenue/GP per SKU', 'Destination analysis', 'Category ranking'] },
  { tabId: 'products', tableId: 'dim_sku', fields: ['sku', 'vendor', 'category_name', 'type_of_sim'], metrics: ['Product details', 'Vendor/category filter', 'Destination parsing từ SKU code'] },
  { tabId: 'products', tableId: 'dim_order_source', fields: ['code', 'group_name'], metrics: ['B2B/B2C filter cho products'] },
  // Targets
  { tabId: 'targets', tableId: 'analytics_target_planning', fields: ['year', 'month', 'company_code', 'target_revenue', 'target_gpm2'], metrics: ['Monthly target input & display', 'Target vs Actual comparison'] },
  { tabId: 'targets', tableId: 'quarterly_targets', fields: ['year', 'quarter', 'company_code', 'target_revenue', 'target_cm1'], metrics: ['Quarterly target summary'] },
  { tabId: 'targets', tableId: 'fact_fulfillment_revenue', fields: ['fulfiled_date', 'fulfilled_revenue_amount_vnd', 'gross_profit_vnd'], metrics: ['Actual Revenue/GP để so sánh với target'] },
  { tabId: 'targets', tableId: 'dim_order_source', fields: ['code', 'group_name'], metrics: ['B2B/B2C breakdown for target comparison'] },
]
