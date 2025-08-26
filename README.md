## Firestore CSV Exporter

CSV exporter for a fixed Firestore collection with a simple MUI UI.

### Setup
- Create `.env` with Firebase web config:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- Install deps and run dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`.

### Functionality
- Collection: `transfer` (fixed)
- Date field: `createdAt` (fixed, range filter)
- Columns exported (order):
  - `accountNumber, bankCode, bankName, branchCode, branchName, createdAt, deviceName, email, errorInfo, finishedAt, flag, kyash, kyashTransferId, mailwiseId, purchaseAmount, purchasePercent, siteName, transferFee, transferPrice, transferPriceBeforeFee, userName, uuid`
- Timestamps formatted as `YYYY年M月D日 HH:mm:ss UTC+9`
- CSV encoding: UTF-8 with BOM (Excel friendly)

## CSV Export (Firestore)

This app contains a simple Firestore-to-CSV export tool.

- Env: set Firebase web app config in `.env`:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- Run: `npm run dev` and open `http://localhost:3000/export`
- How to use on the page:
  - Collection path: e.g. `payments` or `users/123/orders`
  - Collection group: prefix with `cg:` e.g. `cg:payments`
  - Date field: choose `createdAt`, `finishedAt`, or input a custom name
  - Select start/end datetime and click Search, then CSV Download

CSV columns exported (in order):
`accountNumber, bankCode, bankName, branchCode, branchName, createdAt, deviceName, email, errorInfo, finishedAt, flag, kyash, kyashTransferId, mailwiseId, purchaseAmount, purchasePercent, siteName, transferFee, transferPrice, transferPriceBeforeFee, userName, uuid`.
