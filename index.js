require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const csv = require('csv-parser');
const cors = require('cors'); // <-- add this line

const app = express();
const PORT = process.env.PORT || 3000;

// --- Enable CORS (add right after express/app initialization) ---
app.use(cors({
  origin: 'https://leslunes.de', // Change to your store domain
  // origin: '*', // (uncomment ONLY for temporary testing, never in production with secrets)
}));

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
  
    // 1. FAST: check CSV/memory mapping first!
    if (manualDiscountMap[codeLower]) {
      return res.json({ percent: manualDiscountMap[codeLower] });
    }
  
    // 2. OPTIONAL: Only if not found in mapping, check Shopify API (which is slow)
    let percent = null;
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
    }
  
    res.json({ percent: percent || null });
  });
  

// --- Healthcheck and root page ---
app.get('/', (req, res) => res.send('Shopify Discount Proxy is running.'));

app.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
