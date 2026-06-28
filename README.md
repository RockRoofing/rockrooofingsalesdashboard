# Rock Roofing Sales Dashboard

Next.js app pulling from Pipedrive API with manual value change tracking.

## Environment variables (set in Vercel)

```
PIPEDRIVE_API_KEY=your_pipedrive_api_key
KV_REST_API_URL=your_upstash_url
KV_REST_API_TOKEN=your_upstash_token
SYNC_SECRET=any_random_string_for_manual_sync
```

## First run

1. Deploy to Vercel
2. Add environment variables
3. Visit the dashboard and click "Run first sync" — this auto-discovers all your custom field keys and pulls all deals
4. Daily sync runs at 7am automatically

## Value changes

Log value changes manually on the Projects Priced page. These are stored in Upstash and never touch the Pipedrive DealFlows API.

## Pages

- Deals Researched — all deals by created date
- Tenders Received — deals by received date
- Projects Priced — value change log + zero-value warnings
- Work Secured — won deals
- Strike Rate — win rate by value and count
- Lost Reasons — lost deals breakdown
- Geo Sales Open — open pipeline by region
- Geo Sales Won — won deals by region
- Customer Details — breakdown by organisation
