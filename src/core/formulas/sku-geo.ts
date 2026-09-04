/**
 * Biểu thức SQL giải mã mã quốc gia đích (3 ký tự) trực tiếp từ chuỗi SKU.
 * Dùng khi query trên gohub_dw — dim_location chỉ chứa chi nhánh lấy hàng
 * vật lý, không phản ánh địa bàn sử dụng thật của sản phẩm.
 */
export function getDestinationSQL(skuColumn = "f.sku"): string {
  return `CASE
    WHEN ${skuColumn} ~ '^[1-6]'            THEN UPPER(SUBSTRING(${skuColumn}, 3, 3))
    WHEN ${skuColumn} ~ '^E'                THEN UPPER(SUBSTRING(${skuColumn}, 2, 3))
    WHEN ${skuColumn} ~ '^[A-DF-Z]{3}[0-9]' THEN UPPER(SUBSTRING(${skuColumn}, 1, 3))
    ELSE UPPER(SUBSTRING(${skuColumn}, 1, 3))
  END`;
}

/**
 * Mirror JS của getDestinationSQL — cho chatbot tool dùng trực tiếp không
 * cần round-trip DB.
 */
export function decodeSkuDestination(sku: string): string {
  if (/^[1-6]/.test(sku)) return sku.substring(2, 5).toUpperCase();
  if (/^E/.test(sku)) return sku.substring(1, 4).toUpperCase();
  if (/^[A-DF-Z]{3}[0-9]/.test(sku)) return sku.substring(0, 3).toUpperCase();
  return sku.substring(0, 3).toUpperCase();
}
