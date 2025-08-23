# Competitor Price Scraping Setup Guide

## How to Pull Actual Competitor Data

The system is now set up to scrape real competitor prices. Here's how to configure it:

### 1. Server-Side Scraping (Recommended)

The server-side API (`src/competitor-scraper-api.js`) is configured to scrape these competitors:

- **Vistaprint** - https://www.vistaprint.com
- **Printful** - https://www.printful.com
- **GotPrint** - https://www.gotprint.com
- **UPrinting** - https://www.uprinting.com
- **PsPrint** - https://www.psprint.com

### 2. Adding Your Own Competitors

Edit `src/competitor-scraper-api.js` and add your competitors to the `COMPETITORS` object:

```javascript
yourcompetitor: {
  id: 'yourcompetitor',
  name: 'Your Competitor',
  baseUrl: 'https://www.yourcompetitor.com',
  searchPath: '/search?q=',  // Their search URL pattern
  selectors: {
    productCard: '.product-item',  // CSS selector for product cards
    productName: '.product-title', // CSS selector for product name
    price: '.price',               // CSS selector for price
    originalPrice: '.old-price',   // CSS selector for original price
    currency: '$'                  // Currency symbol
  },
  requiresJS: false  // Set to true if prices load via JavaScript
}
```

### 3. Finding the Right CSS Selectors

To find the correct selectors for a competitor site:

1. Go to the competitor's website
2. Search for a product
3. Right-click on a product card and select "Inspect"
4. Find the CSS classes or IDs for:
   - Product container/card
   - Product name
   - Price
   - Original/sale price

### 4. Testing Your Configuration

Test scraping with curl:

```bash
curl -X POST http://localhost:3000/api/competitor-prices \
  -H "Content-Type: application/json" \
  -d '{"productName": "business cards", "productSKU": "BC-001"}'
```

### 5. Handling Different Site Types

#### Static HTML Sites (requiresJS: false)
- Uses Cheerio for fast HTML parsing
- Good for sites that render prices in initial HTML

#### JavaScript-Rendered Sites (requiresJS: true)
- Uses Puppeteer for browser automation
- Necessary for sites that load prices via AJAX/React/Vue

### 6. Rate Limiting & Caching

The system includes:
- **24-hour cache** to avoid excessive scraping
- **Rate limiting** to prevent being blocked
- **User-Agent rotation** to appear as regular browser traffic

### 7. Legal Considerations

Before scraping competitors:
- Check their robots.txt file
- Review their Terms of Service
- Consider using official APIs if available
- Respect rate limits
- Only scrape publicly available data

### 8. Alternative Data Sources

Instead of scraping, consider:

1. **Official APIs**
   - Many companies offer product/pricing APIs
   - More reliable and legal

2. **Data Aggregators**
   - Services like PriceAPI, Scraperapi
   - Handle the scraping for you

3. **Manual Updates**
   - Periodically update competitor prices manually
   - Store in database for comparison

### 9. Production Deployment

For production use:

1. **Use a Proxy Service**
   ```javascript
   const response = await axios.get(searchUrl, {
     proxy: {
       host: 'proxy.scraperapi.com',
       port: 8080,
       auth: {
         username: 'YOUR_API_KEY',
         password: ''
       }
     }
   });
   ```

2. **Deploy Puppeteer on Cloud**
   - Use AWS Lambda with chrome-aws-lambda
   - Or Google Cloud Functions
   - Or dedicated scraping services

3. **Monitor Success Rates**
   - Log successful vs failed scrapes
   - Alert when success rate drops

### 10. Troubleshooting

Common issues and solutions:

**"No products found"**
- Check if selectors have changed
- Site may have updated their HTML structure

**"Access denied" or 403 errors**
- Site is blocking automated requests
- Try using different User-Agent
- Consider using proxy service

**"Timeout errors"**
- Site is slow or blocking
- Increase timeout in configuration
- Try different time of day

**"Price extraction returns null"**
- Price format may be different
- Update extractPrice() regex pattern
- Check for special characters

### Example: Adding Amazon

```javascript
amazon: {
  id: 'amazon',
  name: 'Amazon',
  baseUrl: 'https://www.amazon.com',
  searchPath: '/s?k=',
  selectors: {
    productCard: '[data-component-type="s-search-result"]',
    productName: 'h2.s-size-mini',
    price: '.a-price-whole',
    originalPrice: '.a-price.a-text-price',
    currency: '$'
  },
  requiresJS: true  // Amazon loads dynamically
}
```

Note: Amazon has strict anti-scraping measures. Consider using their official Product Advertising API instead.

### API Endpoints

The system provides these endpoints:

- `POST /api/competitor-prices` - Get prices for a product
- `GET /api/competitors` - List configured competitors
- `DELETE /api/competitor-prices/cache` - Clear cache for a product

### Support

For issues or questions:
- Check browser console for errors
- Review server logs for scraping errors
- Test with simple products first
- Verify selectors are correct