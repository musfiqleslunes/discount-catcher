require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Load all codes from CSV into memory at startup ---
const manualDiscountMap = {};

fs.createReadStream('discounts_export_1 2.csv')
  .pipe(csv())
  .on('data', (row) => {
    const code = (row['Name'] || '').toLowerCase().trim();
    let percent = row['Value'] || '';
    percent = Math.abs(parseInt(percent, 10)); // convert to positive integer
    if (code && percent) manualDiscountMap[code] = percent;
  })
  .on('end', () => {
    console.log('Loaded manualDiscountMap with', Object.keys(manualDiscountMap).length, 'codes.');
  });

// --- Discount percent API ---
app.get('/shopify/proxy/get-percent', async (req, res) => {
  const { code, shop } = req.query;
  const codeLower = (code || '').toLowerCase();
  let percent = null;

  // 1. Try Shopify Admin API first (live lookup)
  try {
    const prRes = await fetch(`https://${shop}/admin/api/2023-10/price_rules.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    const prJson = await prRes.json();
    if (Array.isArray(prJson.price_rules)) {
      for (let rule of prJson.price_rules) {
        const codeRes = await fetch(`https://${shop}/admin/api/2023-10/price_rules/${rule.id}/discount_codes.json`, {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
            'Content-Type': 'application/json',
          },
        });
        const { discount_codes } = await codeRes.json();
        if (discount_codes.some(dc => dc.code.toLowerCase() === codeLower)) {
          if (rule.value_type === 'percentage') {
            percent = Math.abs(rule.value);
          }
          break;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching from Shopify Admin API:", e);
    // continue to manual mapping fallback
  }

  // 2. Fallback: Use the CSV mapping if Shopify lookup fails
  if (!percent && manualDiscountMap[codeLower]) {
    percent = manualDiscountMap[codeLower];
  }

  res.json({ percent: percent || null });
});

// --- Healthcheck and root page ---
app.get('/', (req, res) => res.send('Shopify Discount Proxy is running.'));

app.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
