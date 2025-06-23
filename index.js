require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Shopify Proxy will call this endpoint
app.get('/shopify/proxy/get-percent', async (req, res) => {
  // Shopify app proxy sends HMAC signature for security, but we keep it simple for demo
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).json({ error: 'Missing code or shop' });

  try {
    // Step 1: Fetch all price rules (discount containers)
    const prRes = await fetch(`https://${shop}/admin/api/2023-10/price_rules.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    const { price_rules } = await prRes.json();
    let percent = null;

    // Step 2: Find the discount code in each price rule
    for (let rule of price_rules) {
      const codeRes = await fetch(`https://${shop}/admin/api/2023-10/price_rules/${rule.id}/discount_codes.json`, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json',
        },
      });
      const { discount_codes } = await codeRes.json();
      if (discount_codes.some(dc => dc.code.toLowerCase() === code.toLowerCase())) {
        if (rule.value_type === 'percentage') {
          percent = Math.abs(rule.value); // Discount values are negative in Shopify
        }
        break;
      }
    }
    res.json({ percent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

app.get('/', (req, res) => res.send('Shopify Discount Proxy is running.'));

app.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
