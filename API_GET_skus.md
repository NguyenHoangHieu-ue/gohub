GET /skus


```
# Production (api-pm.space.gohub.com)
curl -X GET "https://api-pm.space.gohub.com/api-pull/gohub-cloud/skus?page=1&limit=2&tenant=VN" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Staging (api-pm.stg-space.gohub.com)
curl -X GET "https://api-pm.stg-space.gohub.com/api-pull/gohub-cloud/skus?page=1&limit=2&tenant=VN" \
  -H "Authorization: Bearer YOUR_API_KEY"
```


```
{
  "status": "success",
  "code": 200,
  "message": "Successfully retrieved sku data",
  "data": {
    "items": [
      {
        "tenant": "VN",
        "sku_code": "11VNMMBZ00610",
        "sku_ref": "EVNMMBPX06GB10D",
        "product_code": "11VNMMBZ",
        "status": "Active",
        "sim_esim": "eSIM",
        "product_type": "eSIM full used in Vietnam",
        "parents": "No",
        "frame": null,
        "datapack": null,
        "throttle_speed": "Stop",
        "call": "Yes",
        "call_sms_details": "100 mins call on-net\n100 SMS on-net",
        "expirations": "30",
        "vendor_sku": null,
        "vendor_sku_sim": null,
        "currency": "VND",
        "original_cost": 76000,
        "reference_cost_vnd": 76000,
        "latest_cogs": 76000,
        "latest_cogs_currency": "VND",
        "final_cogs_included_vat_vnd": 76000,
        "final_cogs_usd": 2.96,
        "day_amount": 10,
        "day_amount_unit": "Day(s)",
        "data_amount": 6,
        "data_amount_unit": "GB",
        "wr_group": null,
        "date_created": "2026-04-30T07:37:13.725Z",
        "last_modified_date": "2026-05-21T08:19:08.682Z"
      },
      {
        "tenant": "VN",
        "sku_code": "11VNMSFP00315",
        "sku_ref": "EVNMSFPY03GB15D",
        "product_code": "11VNMSFP",
        "status": "Active",
        "sim_esim": "eSIM",
        "product_type": "eSIM full used in Vietnam",
        "parents": "No",
        "frame": null,
        "datapack": null,
        "throttle_speed": "128 kbps",
        "call": "No",
        "call_sms_details": null,
        "expirations": "30",
        "vendor_sku": null,
        "vendor_sku_sim": null,
        "currency": "VND",
        "original_cost": 40000,
        "reference_cost_vnd": 40000,
        "latest_cogs": 40000,
        "latest_cogs_currency": "VND",
        "final_cogs_included_vat_vnd": 40000,
        "final_cogs_usd": 1.56,
        "day_amount": 15,
        "day_amount_unit": "Day(s)",
        "data_amount": 3,
        "data_amount_unit": "GB",
        "wr_group": null,
        "date_created": "2026-04-30T07:37:14.767Z",
        "last_modified_date": "2026-05-21T08:19:08.682Z"
      }
    ],
    "pagination": {
      "total": 10957,
      "page": 1,
      "limit": 2
    }
  }
}
```
