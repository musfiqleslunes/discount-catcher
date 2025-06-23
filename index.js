require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// REPLACE this whole block 👇 with the new debug code
app.get('/shopify/proxy/get-percent', async (req, res) => {
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).json({ error: 'Missing code or shop' });

  try {
    const prRes = await fetch(`https://${shop}/admin/api/2023-10/price_rules.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    const prJson = await prRes.json();
    console.log(prJson); // <-- Will help you debug on Render logs

    if (!Array.isArray(prJson.price_rules)) {
      return res.status(500).json({ error: 'price_rules is not an array', apiResponse: prJson });
    }

    const price_rules = prJson.price_rules;
    let percent = null;

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
          percent = Math.abs(rule.value);
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
