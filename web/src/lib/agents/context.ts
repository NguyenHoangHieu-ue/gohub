import { supabaseAdmin }            from "@/lib/supabase"
import { getRefCache }              from "@/lib/agents/cache"
import type { ExtractedParams }     from "@/lib/agents/router"
import {
  searchSkus, searchSkusForRegion, searchSkusByGroupCode, searchSkusMultiCountry,
  REGION_DISPLAY,
  getProductDetail, getProductByCode, decodeSkuCode,
  getCountryInfo, getVendorInfo,
  getFxRates,
  getItems, searchListings, identifyCode,
  searchKnowledgeBase,
  searchNccWm, searchNcc3hk,
  getChannelPrices, getChannelTypes,
} from "@/lib/agents/tools"
import { getPartnerTiers } from "@/lib/analytics-helpers"

export function convertCogs(cogs: number, currency: string, fx: Record<string, number>): { usd: number; vnd: number } {
  const usdVnd = fx["fx.usd_vnd"] ?? 26000
  const hkdUsd = fx["fx.hkd_usd"] ?? 0.128
  const twdUsd = fx["fx.twd_usd"] ?? 0.031
  let usd = 0
  switch (currency?.toUpperCase()) {
    case "USD": usd = cogs; break
    case "VND": usd = cogs / usdVnd; break
    case "HKD": usd = cogs * hkdUsd; break
    case "TWD": usd = cogs * twdUsd; break
    default:    usd = cogs; break
  }
  return { usd: Math.round(usd * 10000) / 10000, vnd: Math.round(usd * usdVnd) }
}

export async function buildToolContext(
  agentId:  string,
  params:   ExtractedParams,
  ref:      Awaited<ReturnType<typeof getRefCache>>,
  isCost:   boolean,
  userMsg?: string,
  channel?: "B2C" | "B2B" | null,
): Promise<string> {
  const sections: string[] = []

  let fx: Record<string, number> = {}
  if (isCost) {
    const rates = await getFxRates()
    for (const r of rates) fx[r.key] = parseFloat(r.value)
  }

  if (agentId === "tu-van") {

    // ── Case 1: Direct 3-char group/category code (JPN, CHM, EU1, APA...) ─────
    if (params.groupCode && !params.region) {
      const groupCtx = await searchSkusByGroupCode(params.groupCode, params, isCost, fx)
      sections.push(groupCtx)

      // Nếu không tìm thấy SKU, bổ sung context để bot giải thích được mã này
      if (groupCtx.includes("Không tìm thấy")) {
        const grp = (ref.supportCountries as any[]).find((s: any) => s.code === params.groupCode)
        if (grp) {
          sections.push(
            `Thông tin mã "${params.groupCode}": Nhóm nước "${grp.support_country ?? ""}" — ISO codes: ${grp.country_codes ?? ""}`,
            `GoHub hiện chưa có sản phẩm nào cho mã nhóm ${params.groupCode}.`
          )
        } else {
          const cat = (ref.categoriesMap as any)[params.groupCode]
          if (cat) {
            sections.push(`Mã "${params.groupCode}" là category "${cat.name_en}" (${cat.region_type ?? ""}) — iso_code: ${cat.iso_code ?? ""}`)
          } else {
            // Thử query sku_catalog (không lọc status — để phân biệt Inactive vs không tồn tại)
            const { count: totalCount } = await supabaseAdmin
              .from("sku_catalog")
              .select("*", { count: "exact", head: true })
              .eq("country_group", params.groupCode)
            const knownCodes = (ref.supportCountries as any[]).slice(0, 20).map((s: any) => s.code).join(", ")
            if (totalCount && totalCount > 0) {
              sections.push(
                `=== MÃ "${params.groupCode}" — TẤT CẢ INACTIVE ===`,
                `Có ${totalCount} SKU với country_group=${params.groupCode} trong sku_catalog nhưng TẤT CẢ đều INACTIVE (ngưng hoạt động).`,
                `PHẢI nói với user: "Mã ${params.groupCode} tồn tại trong hệ thống nhưng hiện không có sản phẩm nào đang hoạt động (đã ngưng). Liên hệ team để xác nhận."`,
              )
            } else {
              sections.push(
                `=== MÃ "${params.groupCode}" — KHÔNG TỒN TẠI ===`,
                `Mã này KHÔNG có trong: ref_support_countries, ref_categories, sku_catalog.`,
                `PHẢI nói với user: "Mã '${params.groupCode}' không phải mã nhóm nước hợp lệ trong hệ thống GoHub. Vui lòng kiểm tra lại. Một số mã hợp lệ: ${knownCodes}..."`,
              )
            }
          }
        }
      }
    }

    // ── Case 2: Regional query (châu Á, châu Âu...) — có thể kết hợp groupCode ─
    else if (params.region) {
      // Nếu có groupCode cụ thể trong khu vực (vd: "gói CHM" → region=asia, groupCode=CHM)
      // thì dùng groupCode; nếu không thì dùng regional search
      if (params.groupCode) {
        const groupCtx = await searchSkusByGroupCode(params.groupCode, params, isCost, fx)
        sections.push(groupCtx)
      } else {
        const regionCtx = await searchSkusForRegion(
          params.region,
          { days: params.days, simType: params.simType, isUnlimited: params.isUnlimited, vendor: params.vendor },
          ref
        )
        sections.push(regionCtx)
      }
    }

    // ── Case 2b: Multi-country — gói dùng ĐỒNG THỜI nhiều nước ("cả Malaysia VÀ Singapore") ──
    else if (params.countries && params.countries.length >= 2) {
      const { skus, note, matched, missing } = await searchSkusMultiCountry({
        countries:    params.countries,
        days:         params.days,
        data_gb:      params.dataGB,
        is_unlimited: params.isUnlimited,
        vendor:       params.vendor,
        sim_type:     params.simType,
      }, ref)
      const rows = skus.map((s: any) => {
        const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999 ? "Unlimited"
          : s.data_amount != null ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}` : null
        return [s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`, s.country_group,
                s.note ? `[note:${s.note}]` : null].filter(Boolean).join("|")
      })
      sections.push(
        `=== SẢN PHẨM GOHUB ĐA QUỐC GIA (phủ CẢ ${params.countries.join(" + ")}): ${skus.length} SKU ===`,
        note ? `Lưu ý: ${note}` : "",
        skus.length ? `sku_code|tenant|sim|data|days|nhóm_nước|[note nếu có]` : "",
        ...rows,
        skus.length
          ? `Đây là gói ĐA QUỐC GIA dùng được cho tất cả các nước trên trong 1 SIM. Nếu user chỉ đi 1 nước, có thể có gói riêng rẻ hơn.`
          : `KHÔNG có gói đơn nào phủ đồng thời ${params.countries.join(", ")}. Gợi ý user: (1) mua gói riêng từng nước, hoặc (2) xem gói khu vực (vd Đông Nam Á) nếu các nước cùng khu vực.${missing.length ? ` (Chưa nhận diện: ${missing.join(", ")}.)` : ""}`
      )
    }

    // ── Case 3: Single-country query (CHỈ sản phẩm GoHub — NCC do agent Gap Analysis phụ trách) ──
    else if (params.country) {
      const { skus: rawSkus, note } = await searchSkus({
        country:      params.country,
        days:         params.days,
        data_gb:      params.dataGB,
        is_unlimited: params.isUnlimited,
        vendor:       params.vendor,
        sim_type:     params.simType,
      }, ref)

      // Channel filter: B2C/B2B → chỉ hiện SKU có items của kênh đó + kèm giá bán
      const priceMap = await getChannelPrices(rawSkus.map((s: any) => s.sku_code), channel ?? null)
      const skus = channel
        ? rawSkus.filter((s: any) => priceMap.has(s.sku_code))
        : rawSkus

      const rows = skus.map((s: any) => {
        const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999
          ? "Unlimited"
          : s.data_amount != null
            ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}`
            : null
        let cogsVnd: string | null = null
        let cogsUsd: string | null = null
        if (isCost && s.latest_cogs != null) {
          const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
          cogsVnd = vnd.toLocaleString("en-US")
          cogsUsd = `$${usd}`
        }
        const itemPrice = priceMap.get(s.sku_code)
        const sellPrice = itemPrice
          ? `sell:${itemPrice.unitprice.toLocaleString("en-US")}${itemPrice.currency}`
          : null
        const parts = [
          s.sku_code, s.tenant, s.sim_esim ?? null, dataStr, `${s.day_amount}d`,
          s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
          s.operator_code  ? `operator:${s.operator_code}`  : null,
          s.kyc_needed     ? `kyc:${s.kyc_needed}`           : null,
          s.call           ? `call:${s.call}`                : null,
          s.hotspot        ? `hotspot:${s.hotspot}`          : null,
          cogsVnd,
          cogsUsd,
          sellPrice,
          s.note           ? `[note:${s.note}]`              : null,
        ]
        return parts.filter(Boolean).join("|")
      })
      sections.push(
        `=== SẢN PHẨM GOHUB${channel ? ` (kênh ${channel})` : ""}: ${skus.length} SKU (nước=${params.country}${params.days ? ` ${params.days}d` : ""}${params.dataGB ? ` ${params.dataGB}GB` : ""}${params.isUnlimited ? " Unlimited" : ""}) ===`,
        note ? `Lưu ý: ${note}` : "",
        `sku_code|tenant|sim|data|days|throttle|operator|kyc|call|hotspot${isCost ? "|cogs_vnd|cogs_usd" : ""}${channel ? "|sell_price" : ""}|[note nếu có]`,
        ...rows
      )

      // Con trỏ sang Gap Analysis: cho biết NCC còn nguồn (không inject chi tiết — tránh overlap)
      {
        const wmProducts = searchNccWm({ country: params.country, sim_type: params.simType }, ref)
        if (wmProducts.length > 0) {
          const wmNotYet = wmProducts.filter((p: any) => !p.in_system).length
          sections.push(
            `[THAM KHẢO NCC] Nhà cung cấp (WorldMove) có ${wmProducts.length} gói liên quan ${params.country}` +
            (wmNotYet > 0 ? `, trong đó ${wmNotYet} gói GoHub CHƯA tạo SKU.` : ` (GoHub đã tạo phần lớn).`) +
            ` Để xem chi tiết catalog NCC, user hỏi: "WM có gói gì cho ${params.country}". KHÔNG tự liệt kê hàng NCC như sản phẩm GoHub đang bán.`
          )
        }
      }

    }

    // ── Case 3: Thiếu nước + khu vực → cần làm rõ ────────────────────────────
    else {
      sections.push(
        `=== THÔNG TIN CẦN LÀM RÕ ===`,
        `Chưa xác định được nước đến hoặc khu vực từ câu hỏi.`,
        `Hỏi user theo cấu trúc: (1) Tóm tắt bạn hiểu gì, (2) Hỏi rõ: nước đến, số ngày (tùy chọn), SIM/eSIM (tùy chọn).`
      )
    }

    // Bổ sung KB: tài liệu nội bộ (hướng dẫn kích hoạt, lưu ý KYC, chính sách...) liên quan đến câu hỏi
    if (userMsg && userMsg.length > 10) {
      const kbResult = await searchKnowledgeBase(userMsg)
      if (kbResult) {
        sections.push(
          `=== TÀI LIỆU NỘI BỘ (KB) ===`,
          `[Trích từ knowledge base — tham chiếu nếu liên quan]\n${kbResult}`
        )
      }
    }
  }

  if (agentId === "tra-cuu") {
    const productCodes = params.productCodes ?? (params.productCode ? [params.productCode] : [])
    const skuCodes     = params.skuCodes     ?? (params.skuCode     ? [params.skuCode]     : [])
    const listingCodes = params.listingCodes ?? (params.listingCode ? [params.listingCode] : [])
    const isMulti = (productCodes.length + skuCodes.length + listingCodes.length) > 1

    // Helper kiểm tra item_type có thuộc kênh hiện tại không (dùng prefix config)
    const channelTypes = channel ? await getChannelTypes() : null
    const matchesChannel = (itemType: string) => {
      if (!channelTypes || !channel) return true
      const prefixes = channelTypes[channel] ?? []
      return prefixes.some(p => (itemType || "").toLowerCase().includes(p.toLowerCase()))
    }

    if (productCodes.length) {
      const results = await Promise.all(productCodes.map(pc => getProductByCode(pc)))
      if (isMulti) {
        sections.push(`=== MULTI LOOKUP: ${productCodes.length} Product Code ===`)
        for (let i = 0; i < productCodes.length; i++) {
          const d = results[i]
          if (d?.error) { sections.push(`[${i+1}] ${productCodes[i]}: Không tìm thấy`); continue }
          const skuSummary = (d.skus ?? []).slice(0, 5).map((s: any) => {
            const dataStr = s.data_amount ? `${s.data_amount}${s.data_amount_unit ?? "GB"}` : "?"
            const cogsStr = isCost && s.latest_cogs
              ? ` | ${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).vnd.toLocaleString("en-US")} | $${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd}` : ""
            return `${s.sku_code}|${dataStr}|${s.day_amount ?? "?"}d${cogsStr}`
          }).join("; ")
          sections.push(`[${i+1}] ${productCodes[i]} | ${d.product?.status ?? "?"} | SKUs: ${skuSummary}`)
        }
      } else {
        const d = results[0]
        if (isCost && d?.skus) {
          d.skus = d.skus.map((s: any) => {
            if (s.latest_cogs != null) {
              const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
              return { ...s, cogs_usd: usd, cogs_vnd: vnd }
            }
            return s
          })
        }
        sections.push(`=== CHI TIẾT PRODUCT CODE: ${productCodes[0]} ===`, JSON.stringify(d, null, 2))
      }
    }

    const otherCodes = [...skuCodes, ...listingCodes]
    if (otherCodes.length) {
      const identified = await Promise.all(otherCodes.map(c => identifyCode(c)))

      if (isMulti || otherCodes.length > 1) {
        sections.push(`=== MULTI LOOKUP: ${otherCodes.length} mã (SKU/Listing/Item) ===`)
        const detailResults = await Promise.all(otherCodes.map(async (code, i) => {
          const id = identified[i]
          if (!id.found) return `[${i+1}] ${code}: Không tìm thấy (${id.hint ?? ""})`
          if (id.type === "SKU") {
            const d = await getProductDetail(code)
            if (!d || d.error) return `[${i+1}] ${code}: Lỗi khi tìm`
            const s = d.sku
            const dataStr = s.data_amount ? `${s.data_amount}${s.data_amount_unit ?? "GB"}` : "Unlimited"
            const cogsStr = isCost && s.latest_cogs
              ? ` | cogs:${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).vnd.toLocaleString("en-US")} VND ($${convertCogs(s.latest_cogs, s.latest_cogs_currency, fx).usd} USD)` : ""
            return `[${i+1}] SKU:${code} | ${s.status} | ${s.sim_esim ?? "?"} | ${dataStr} | ${s.day_amount ?? "?"}d | throttle:${s.throttle_speed || "none"}${cogsStr}`
          }
          if (id.type === "Product Code") {
            const d = await getProductByCode(code)
            if (!d || d.error) return `[${i+1}] ${code}: Không tìm thấy`
            return `[${i+1}] Product:${code} | ${d.product?.status ?? "?"} | SKUs: ${(d.skus ?? []).length}`
          }
          return `[${i+1}] ${code}: loại ${id.type}`
        }))
        sections.push(...detailResults)
      } else {
        const code = otherCodes[0]
        const id   = identified[0]
        sections.push(`=== NHẬN DẠNG MÃ: ${code} ===`, JSON.stringify(id, null, 2))
        if (id.found) {
          if (id.type === "SKU") {
            const detail = await getProductDetail(code)
            if (detail?.sku) {
              if (isCost && detail.sku.latest_cogs != null) {
                const { usd, vnd } = convertCogs(detail.sku.latest_cogs, detail.sku.latest_cogs_currency, fx)
                detail.sku.cogs_usd = usd; detail.sku.cogs_vnd = vnd
              } else {
                // Strip COGS hoàn toàn khỏi context khi role không được phép xem
                delete detail.sku.latest_cogs; delete detail.sku.latest_cogs_currency
              }
            }
            // Channel filter: chỉ giữ items thuộc đúng kênh B2C/B2B (prefix config)
            if (channel && detail?.items) {
              detail.items = detail.items.filter((it: any) => matchesChannel(it.item_type))
            }
            sections.push(`=== CHI TIẾT SKU ===`, JSON.stringify(detail, null, 2))
            sections.push(`=== GIẢI MÃ ===`, JSON.stringify(decodeSkuCode(code), null, 2))
          } else if (id.type === "Product Code") {
            const detail = await getProductByCode(code)
            if (detail?.skus) {
              detail.skus = detail.skus.map((s: any) => {
                if (isCost && s.latest_cogs != null) {
                  const { usd, vnd } = convertCogs(s.latest_cogs, s.latest_cogs_currency, fx)
                  return { ...s, cogs_usd: usd, cogs_vnd: vnd }
                }
                // Strip COGS khi không có quyền
                const { latest_cogs: _c, latest_cogs_currency: _cc, ...rest } = s
                return isCost ? s : rest
              })
            }
            sections.push(`=== CHI TIẾT PRODUCT CODE: ${code} ===`, JSON.stringify(detail, null, 2))
          } else if (id.type === "Alias (Item)") {
            const [allItems, skuDetail] = await Promise.all([
              getItems({ sku_code: id.sku_code }),
              id.sku_code ? getProductDetail(id.sku_code) : Promise.resolve(null),
            ])
            const items = channel
              ? allItems.filter((it: any) => matchesChannel(it.item_type))
              : allItems
            sections.push(`=== ITEM / ALIAS ===`, JSON.stringify(items, null, 2))
            if (skuDetail) {
              if (skuDetail?.sku && !isCost) {
                delete skuDetail.sku.latest_cogs; delete skuDetail.sku.latest_cogs_currency
              }
              if (channel && skuDetail?.items) {
                skuDetail.items = skuDetail.items.filter((it: any) => matchesChannel(it.item_type))
              }
              sections.push(`=== SKU LIÊN KẾT ===`, JSON.stringify(skuDetail, null, 2))
            }
          } else if (id.type === "Listing Code") {
            const [listings, allItems] = await Promise.all([
              searchListings({ product_code: code }),
              getItems({ listing_code: code }),
            ])
            const items = channel
              ? allItems.filter((it: any) => matchesChannel(it.item_type))
              : allItems
            sections.push(`=== LISTING ===`, JSON.stringify(listings, null, 2))
            sections.push(`=== ITEMS ===`, JSON.stringify(items, null, 2))
          }
        }
      }
    }

    // KB: tài liệu nội bộ liên quan đến mã / sản phẩm được tra cứu
    if (userMsg && userMsg.length > 10) {
      const kbResult = await searchKnowledgeBase(userMsg)
      if (kbResult) {
        sections.push(
          `=== TÀI LIỆU NỘI BỘ (KB) ===`,
          `[Trích từ knowledge base — tham chiếu nếu liên quan]\n${kbResult}`
        )
      }
    }
  }

  if (agentId === "giai-dap") {
    const vendors = getVendorInfo(undefined, ref)
    sections.push(
      `=== DANH SÁCH VENDOR (${vendors.length}) ===`,
      vendors.map((v: any) => `${v.vendor_code} = ${v.name}`).join("\n")
    )

    // Đối tác/kênh theo TIER (partner_tiers) — config nghiệp vụ (chỉ tên kênh + tier, không nhạy cảm).
    // Inject khi câu hỏi nhắc đối tác chiến lược/tier/kênh để giai-dáp trả lời được "ai là strategic".
    if (userMsg && /partner|strategic|chien luoc|chiến lược|doi tac|đối tác|\btier\b|kenh chien luoc|kênh chiến lược/i.test(userMsg)) {
      try {
        const tiers = await getPartnerTiers()
        const lines = Object.entries(tiers)
          .filter(([, names]) => Array.isArray(names) && names.length)
          .map(([tier, names]) => `${tier} (${(names as string[]).length}): ${(names as string[]).join(", ")}`)
        if (lines.length) {
          sections.push(
            `=== ĐỐI TÁC / KÊNH THEO TIER (partner tiers — cấu hình từ tab Settings) ===`,
            `"Strategic" = đối tác/kênh chiến lược (B2B-Strategic). Đây là danh sách kênh phân loại theo tier, dùng để đọc báo cáo B2B.`,
            ...lines,
          )
        }
      } catch { /* config lỗi → bỏ qua, không chặn câu trả lời */ }
    }

    // Inject ref_categories để bot hiểu mã nhóm hiển thị (CHM, STA, ASI...)
    const allCats = Object.values(ref.categoriesMap as Record<string, any>)
    if (allCats.length) {
      const multi = allCats.filter((c: any) => c.region_type === "Multi-Country")
      sections.push(
        `=== MÃ CATEGORY ĐA QUỐC GIA (${multi.length}) ===`,
        multi.map((c: any) => `${c.category_code} = ${c.name_en}${c.iso_code ? ` (ISO: ${c.iso_code})` : ""}`).join("\n"),
      )
    }

    // Inject TOÀN BỘ ref_support_countries — để bot biết mọi mã nhóm nước (AP2, EU1, RUS...)
    if ((ref.supportCountries as any[]).length) {
      sections.push(
        `=== MÃ NHÓM NƯỚC HỖ TRỢ (${(ref.supportCountries as any[]).length}) — dùng làm country_group trong SKU ===`,
        `Định dạng: MÃ = Tên nhóm | ISO codes`,
        ...(ref.supportCountries as any[]).map((s: any) =>
          `${s.code} = ${s.support_country ?? ""}${s.country_codes ? ` | ${s.country_codes}` : ""}`
        )
      )
    }

    // Nếu hỏi về 1 mã cụ thể → tra cứu và highlight
    if (params.groupCode) {
      const code = params.groupCode.toUpperCase()
      const group = (ref.supportCountries as any[]).find((s: any) => s.code === code)
      if (group) {
        sections.push(
          `=== CHI TIẾT MÃ "${code}" ===`,
          `Tên nhóm: ${group.support_country ?? ""}`,
          `Nước gồm (ISO codes): ${group.country_codes ?? ""}`,
        )
      } else {
        const cat = (ref.categoriesMap as any)[code]
        if (cat) {
          sections.push(
            `=== MÃ CATEGORY "${code}" ===`,
            `Tên: ${cat.name_en}${cat.name_vn ? ` / ${cat.name_vn}` : ""}`,
            `Loại: ${cat.region_type ?? ""}`,
            `ISO code: ${cat.iso_code ?? "không có"}`,
          )
        } else {
          // Fallback: query sku_catalog.country_group trực tiếp
          const { count: activeCount } = await supabaseAdmin
            .from("sku_catalog")
            .select("*", { count: "exact", head: true })
            .eq("country_group", code)
            .eq("status", "Active")
          const { count: totalCount } = await supabaseAdmin
            .from("sku_catalog")
            .select("*", { count: "exact", head: true })
            .eq("country_group", code)
          if (activeCount && activeCount > 0) {
            // Inject đầy đủ SKU list — bot cần data thực để trả lời
            const fullSkuCtx = await searchSkusByGroupCode(code, {
              days: params.days, simType: params.simType,
              isUnlimited: params.isUnlimited, vendor: params.vendor, dataGB: params.dataGB,
            }, isCost, fx)
            sections.push(fullSkuCtx)
            sections.push(`Lưu ý: Mã "${code}" chưa có mô tả trong ref_support_countries — tên nhóm nước chính thức chưa được đăng ký. Hiển thị danh sách SKU để trả lời câu hỏi.`)
          } else if (totalCount && totalCount > 0) {
            const knownCodes = (ref.supportCountries as any[]).slice(0, 15).map((s: any) => s.code).join(", ")
            sections.push(
              `=== MÃ "${code}" — TẤT CẢ INACTIVE ===`,
              `Có ${totalCount} SKU với country_group=${code} nhưng TẤT CẢ đều INACTIVE.`,
              `PHẢI nói với user: "Mã '${code}' tồn tại trong hệ thống nhưng hiện không có sản phẩm nào đang hoạt động (đã ngưng). Liên hệ team để xác nhận."`,
            )
          } else {
            const knownCodes = (ref.supportCountries as any[]).slice(0, 15).map((s: any) => s.code).join(", ")
            sections.push(
              `=== MÃ "${code}" — KHÔNG TỒN TẠI ===`,
              `Mã này KHÔNG có trong: ref_support_countries, ref_categories, sku_catalog.`,
              `PHẢI nói với user: "Mã '${code}' không phải mã nhóm nước hợp lệ trong hệ thống GoHub. Vui lòng kiểm tra lại. Một số mã hợp lệ: ${knownCodes}..."`,
            )
          }
        }
      }
    }

    if (params.skuCode) sections.push(`=== GIẢI MÃ SKU ===`, JSON.stringify(decodeSkuCode(params.skuCode), null, 2))
    if (params.country) sections.push(`=== NHÓM NƯỚC "${params.country}" ===`, JSON.stringify(getCountryInfo(params.country, ref), null, 2))

    // Inject KB results nếu có tài liệu nội bộ liên quan
    if (userMsg && userMsg.length > 10) {
      const kbResult = await searchKnowledgeBase(userMsg)
      if (kbResult) {
        sections.push(
          `=== TÀI LIỆU NỘI BỘ ===`,
          `[Tìm thấy trong knowledge base — trích dẫn nếu liên quan]\n${kbResult}`
        )
      }
    }
  }

  if (agentId === "tra-cuu" && isCost && Object.keys(fx).length) {
    sections.push(
      `=== TỶ GIÁ NỘI BỘ ===`,
      JSON.stringify(Object.entries(fx).map(([key, value]) => ({ key, value })), null, 2)
    )
  }

  if (agentId === "gap-analysis") {
    // Agent này SỞ HỮU toàn bộ catalog NCC: vừa "browse" (xem NCC có gì) vừa "gap" (NCC có mà GoHub chưa tạo).
    const vendor = params.nccVendor ?? "all"

    if (vendor === "wm" || vendor === "all") {
      const wm = searchNccWm({ country: params.country, sim_type: params.simType, days: params.days, limit: 50 }, ref)
      const total   = wm.length
      const inSys    = wm.filter((p: any) => p.in_system).length
      const notYet   = total - inSys
      if (total > 0) {
        const wmRows = wm.map((p: any) => {
          const data = p.is_unlimited ? "Unlimited" : (p.data_gb != null ? `${p.data_gb}GB${p.is_daily ? "/ngày" : ""}` : "?")
          return [
            p.vendor_product_id, p.product_name ?? "", p.region ?? "", p.sim_type ?? "", `${p.days ?? "?"}d`, data,
            p.throttle_kbps ? `throttle:${p.throttle_kbps}kbps` : null,
            p.apn ? `apn:${p.apn}` : null,
            p.in_system ? "GoHub:đã tạo" : "GoHub:CHƯA tạo",
          ].filter(Boolean).join("|")
        })
        sections.push(
          `=== CATALOG NCC — WorldMove${params.country ? ` cho ${params.country}` : ""} (${total} gói nhà cung cấp — KHÔNG phải SP GoHub đang bán) ===`,
          `Đã tạo SKU GoHub: ${inSys} · Chưa tạo: ${notYet}`,
          `vendor_id|tên SP|vùng phủ|sim|ngày|data|throttle|apn|trạng thái GoHub`,
          ...wmRows
        )
      } else {
        sections.push(`=== CATALOG NCC — WorldMove${params.country ? ` cho ${params.country}` : ""}: không tìm thấy gói nào ===`)
      }
    }

    if (vendor === "3hk" || vendor === "all") {
      const hkZones = searchNcc3hk(params.country, ref)
      if (hkZones.length > 0) {
        sections.push(
          `=== CATALOG NCC — 3HK${params.country ? ` cho ${params.country}` : ""} (${hkZones.length} zone — báo giá theo GB, chưa phải SP hoàn chỉnh) ===`,
          `zone|nước|network|giá HKD/GB|KYC`,
          ...hkZones.slice(0, 20).map((z: any) => `${z.zone}|${z.country ?? ""}|${z.network ?? ""}|${z.price_per_gb_hkd ?? "?"}|${z.is_kyc ?? "?"}`)
        )
      }
    }

    if (!params.country) {
      sections.push(`[LƯU Ý] User chưa nêu nước cụ thể. Nếu câu hỏi cần nước/khu vực để trả lời → hỏi lại 1 lần ngắn gọn.`)
    }
  }

  if (agentId === "tao-template") {
    // Inject WM products for the requested country (to auto-fill APN, network type)
    if (params.country) {
      const wmProducts = searchNccWm({ country: params.country, sim_type: params.simType }, ref)
      const notInSys   = wmProducts.filter((p: any) => !p.in_system).slice(0, 30)
      sections.push(
        `=== WM CATALOG CHO ${params.country} (${wmProducts.length} SP, ${notInSys.length} chưa tạo GoHub) ===`,
        `Format: vendor_id | product_name | days | data_gb | is_daily | is_unlimited | throttle_kbps | sim_type | apn`,
        ...notInSys.map((p: any) =>
          `${p.vendor_product_id}|${p.product_name}|${p.days}|${p.data_gb ?? "UNL"}|${p.is_daily}|${p.is_unlimited}|${p.throttle_kbps ?? ""}|${p.sim_type}|${p.apn ?? ""}`
        )
      )
      // 3HK zones for this country
      const hkZones = searchNcc3hk(params.country, ref)
      if (hkZones.length)
        sections.push(`=== 3HK ZONES CHO ${params.country} ===`, JSON.stringify(hkZones.slice(0, 5), null, 2))
    } else {
      // No country yet: inject zone list so agent can suggest
      const zonesSummary = ref.ncc3hk.slice(0, 10).map((z: any) => `Zone ${z.zone}: ${z.country} (${z.price_per_gb_hkd ?? "?"} HKD/GB)`)
      sections.push(`=== DANH SÁCH ZONE 3HK ===`, ...zonesSummary)
    }
  }

  const filtered = sections.filter(Boolean)
  return filtered.length ? filtered.join("\n") : ""
}
