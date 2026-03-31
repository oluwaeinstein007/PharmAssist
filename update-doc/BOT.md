# Bot API Documentation

API endpoints for accessing store locations, product inventory data, and bot configuration.

---

## 1. Get Bot Configuration

**Endpoint:** `GET /api/bot-config`

**Response:**

```json
{
  "contact": {
    "support_whatsapp": "08054022662",
    "support_email": "customercare@medplusng.com",
    "support_call": "08054022662",
    "telehealth_whatsapp": "08187122408",
    "telehealth_email": "telehealth@medplusng.com",
    "telehealth_call": "08113590038"
  },
  "links": {
    "privacy_policy": "https://medplusnig.com/privacy-policy",
    "order_tracking": "https://medplusnig.com/track-order",
    "pharmacists": "https://medplusnig.com/telemedicine"
  }
}
```

---

## 2. Get Store Locations

**Endpoint:** `GET /api/stores/locations`

**Response:**

```json
{
  "status": "success",
  "data": [
    {
      "sid": "STR001",
      "name": "Lagos Main Store",
      "store_address": "123 Herbert Macaulay Way, Yaba, Lagos",
      "state": "Lagos",
      "local_govt": "Yaba",
      "latitude": "6.5244",
      "longitude": "3.3792"
    },
    {
      "sid": "STR002",
      "name": "Abuja Central Store",
      "store_address": "45 Ahmadu Bello Way, Central Business District, Abuja",
      "state": "FCT",
      "local_govt": "Municipal Area Council",
      "latitude": "9.0765",
      "longitude": "7.3986"
    }
  ]
}
```

---

## 3. Get Products by Store SID

**Endpoint:** `GET /api/products/stores/{sid}`

**Query Parameters:**
- `search` (optional) - Search term for product name or barcode
- `page` (optional) - Page number for pagination

**Response:**

```json
{
  "status": "success",
  "data": {
    "store_sid": "STR001",
    "data": [
      {
        "id": 1234,
        "product_name": "Paracetamol 500mg Tablets",
        "barcode": "6001234567890",
        "price": "1500.00",
        "dept": 2,
        "quantity": 150,
        "store_name": "Lagos Main Store",
        "store_sid": "STR001",
        "category_name": "Pain Relief",
        "category_slug": "pain-relief",
        "category_id": 5,
        "updated_at": "2026-02-16T10:30:00.000000Z"
      },
      {
        "id": 1235,
        "product_name": "Ibuprofen 400mg Tablets",
        "barcode": "6001234567891",
        "price": "2000.00",
        "dept": 2,
        "quantity": 75,
        "store_name": "Lagos Main Store",
        "store_sid": "STR001",
        "category_name": "Pain Relief",
        "category_slug": "pain-relief",
        "category_id": 5,
        "updated_at": "2026-02-15T14:20:00.000000Z"
      }
    ],
    "first_page_url": "http://localhost:3030/api/products/stores/STR001?page=1",
    "from": 1,
    "next_page_url": "http://localhost:3030/api/products/stores/STR001?page=2",
    "path": "http://localhost:3030/api/products/stores/STR001",
    "per_page": 50,
    "prev_page_url": null,
    "to": 50
  }
}
```

---

## 4. Get Single Product by Store SID and Barcode

**Endpoint:** `GET /api/products/stores/{sid}/{barcode}`

**Response:**

```json
{
  "status": "success",
  "data": {
    "id": 1234,
    "product_name": "Paracetamol 500mg Tablets",
    "barcode": "6001234567890",
    "price": "1500.00",
    "dept": 2,
    "quantity": 150,
    "store_name": "Lagos Main Store",
    "store_sid": "STR001",
    "category_name": "Pain Relief",
    "category_slug": "pain-relief",
    "category_id": 5,
    "updated_at": "2026-02-16T10:30:00.000000Z"
  }
}
```

**Error Response (404):**

```json
{
  "message": "The requested resource product information was not found"
}
```

