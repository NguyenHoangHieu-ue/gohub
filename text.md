*API GET /products

1. Production (api-pm.space.gohub.com)

    curl -X GET "https://api-pm.space.gohub.com/api-pull/gohub-cloud/products?page=1&limit=2&tenant=VN"
    -H "Authorization: Bearer YOUR_API_KEY"

2. Staging (api-pm.stg-space.gohub.com)

    curl -X GET "https://api-pm.stg-space.gohub.com/api-pull/gohub-cloud/products?page=1&limit=2&tenant=VN"
  	-H "Authorization: Bearer YOUR_API_KEY"

3. Example

- Production (api-pm.space.gohub.com)

curl -X GET "https://api-pm.space.gohub.com/api-pull/gohub-cloud/products?page=1&limit=2&tenant=VN"   -H "Authorization: Bearer YOUR_API_KEY"

- Staging (api-pm.stg-space.gohub.com)

curl -X GET "https://api-pm.stg-space.gohub.com/api-pull/gohub-cloud/products?page=1&limit=2&tenant=VN"
  -H "Authorization: Bearer YOUR_API_KEY"


```
{
  "status": "success",
  "code": 200,
  "message": "Successfully retrieved product data",
  "data": {
    "items": [
      {
        "tenant": "VN",
        "product_code": "11VNMMBZ",
        "product_ref": "EVNMMBP",
        "status": "Active",
        "type_of_sim": "eSIM",
        "product_type": "eSIM full used in Vietnam",
        "operator_code": "MOBIFONE",
        "vendor_code": "MB",
        "purchase_type": "Only Stock",
        "gc_purchase_type": "Only Stock",
        "source_type": "VN Stock Direct",
        "sku_type": "Base + Datapack",
        "data_type": "Daily Data",
        "base_sim_esim_sku_code": null,
        "import_type": "Official",
        "supported_countries": "VN",
        "daily_reset_time": "GMT+7",
        "activation_time": "It will be activated after completing the activation process. For more information, please refer to the “Note” section.",
        "network_type": "4G",
        "apn_original": "APN: m-wap\nUsename: mms\nPassword: mms",
        "apn": "APN: m-wap\nUsename: mms\nPassword: mms",
        "onsite_carrier": "Mobifone",
        "local_phone_number": "Yes",
        "local_number_country": "VN",
        "hotspot": "Yes",
        "kyc_code": "1",
        "kyc_needed": "No",
        "kyc_links": null,
        "top_up_options": "No",
        "activation": "To activate the esim, press 900 to call and then press 2 \nCheck phone number, press *0# to call\nCheck data usage, text \"KT ALL\" to 9199 or press *090*5# to call.",
        "unsupported_apps": null,
        "telco_perks": null,
        "note": "This product is only available to customers with a passport, excluding Vietnamese passports",
        "data_plan_type": null,
        "date_created": "2026-04-28T07:06:21.774Z",
        "last_modified_date": "2026-04-30T10:26:42.978Z"
      },
      {
        "tenant": "VN",
        "product_code": "11VNMSFP",
        "product_ref": "EVNMSFP",
        "status": "Active",
        "type_of_sim": "eSIM",
        "product_type": "eSIM full used in Vietnam",
        "operator_code": "SKYFI",
        "vendor_code": "SF",
        "purchase_type": "Only Stock",
        "gc_purchase_type": "Only Stock",
        "source_type": "VN Stock Direct",
        "sku_type": "Base + Datapack",
        "data_type": "Daily Data",
        "base_sim_esim_sku_code": null,
        "import_type": "Official",
        "supported_countries": "VN",
        "daily_reset_time": "GMT +7",
        "activation_time": "It will be activated after receiving the network signal.",
        "network_type": "4G",
        "apn_original": "m-wap",
        "apn": "m-wap",
        "onsite_carrier": "Mobifone",
        "local_phone_number": "No",
        "local_number_country": null,
        "hotspot": "Yes",
        "kyc_code": "1",
        "kyc_needed": "No",
        "kyc_links": null,
        "top_up_options": "No",
        "activation": null,
        "unsupported_apps": null,
        "telco_perks": null,
        "note": null,
        "data_plan_type": null,
        "date_created": "2026-04-28T07:06:21.775Z",
        "last_modified_date": "2026-04-30T10:26:42.978Z"
      }
    ],
    "pagination": {
      "total": 738,
      "page": 1,
      "limit": 2
    }
  }
}
```



4. Response

```
{
  "status": "success",
  "code": 200,
  "message": "Successfully retrieved product data",
  "data": {
    "items": [
      {
        "tenant": "VN",
        "product_code": "11VNMMBZ",
        "product_ref": "EVNMMBP",
        "status": "Active",
        "type_of_sim": "eSIM",
        "product_type": "eSIM full used in Vietnam",
        "operator_code": "MOBIFONE",
        "vendor_code": "MB",
        "purchase_type": "Only Stock",
        "gc_purchase_type": "Only Stock",
        "source_type": "VN Stock Direct",
        "sku_type": "Base + Datapack",
        "data_type": "Daily Data",
        "base_sim_esim_sku_code": null,
        "import_type": "Official",
        "supported_countries": "VN",
        "daily_reset_time": "GMT+7",
        "activation_time": "It will be activated after completing the activation process. For more information, please refer to the “Note” section.",
        "network_type": "4G",
        "apn_original": "APN: m-wap\nUsename: mms\nPassword: mms",
        "apn": "APN: m-wap\nUsename: mms\nPassword: mms",
        "onsite_carrier": "Mobifone",
        "local_phone_number": "Yes",
        "local_number_country": "VN",
        "hotspot": "Yes",
        "kyc_code": "1",
        "kyc_needed": "No",
        "kyc_links": null,
        "top_up_options": "No",
        "activation": "To activate the esim, press 900 to call and then press 2 \nCheck phone number, press *0# to call\nCheck data usage, text \"KT ALL\" to 9199 or press *090*5# to call.",
        "unsupported_apps": null,
        "telco_perks": null,
        "note": "This product is only available to customers with a passport, excluding Vietnamese passports",
        "data_plan_type": null,
        "date_created": "2026-04-28T07:06:21.774Z",
        "last_modified_date": "2026-04-30T10:26:42.978Z"
      },
      {
        "tenant": "VN",
        "product_code": "11VNMSFP",
        "product_ref": "EVNMSFP",
        "status": "Active",
        "type_of_sim": "eSIM",
        "product_type": "eSIM full used in Vietnam",
        "operator_code": "SKYFI",
        "vendor_code": "SF",
        "purchase_type": "Only Stock",
        "gc_purchase_type": "Only Stock",
        "source_type": "VN Stock Direct",
        "sku_type": "Base + Datapack",
        "data_type": "Daily Data",
        "base_sim_esim_sku_code": null,
        "import_type": "Official",
        "supported_countries": "VN",
        "daily_reset_time": "GMT +7",
        "activation_time": "It will be activated after receiving the network signal.",
        "network_type": "4G",
        "apn_original": "m-wap",
        "apn": "m-wap",
        "onsite_carrier": "Mobifone",
        "local_phone_number": "No",
        "local_number_country": null,
        "hotspot": "Yes",
        "kyc_code": "1",
        "kyc_needed": "No",
        "kyc_links": null,
        "top_up_options": "No",
        "activation": null,
        "unsupported_apps": null,
        "telco_perks": null,
        "note": null,
        "data_plan_type": null,
        "date_created": "2026-04-28T07:06:21.775Z",
        "last_modified_date": "2026-04-30T10:26:42.978Z"
      }
    ],
    "pagination": {
      "total": 738,
      "page": 1,
      "limit": 2
    }
  }
}
```
