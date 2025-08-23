// Server-side Competitor Price Scraping API
// This runs on your Node.js server to safely scrape competitor websites

const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

// Initialize cache (24 hour TTL)
const priceCache = new NodeCache({ stdTTL: 86400 });

// Competitor configurations - ADD YOUR REAL COMPETITOR URLS HERE
const COMPETITORS = {
  vistaprint: {
    id: 'vistaprint',
    name: 'Vistaprint',
    baseUrl: 'https://www.vistaprint.com',
    searchPath: '/search?query=',
    selectors: {
      productCard: '.product-card, .search-result-item',
      productName: '.product-name, .product-title, h3',
      price: '.price-value, .product-price, .pricing-price',
      originalPrice: '.original-price, .was-price',
      currency: '.currency-symbol'
    },
    requiresJS: true // Set to true if the site loads prices via JavaScript
  },
  
  printful: {
    id: 'printful',
    name: 'Printful',
    baseUrl: 'https://www.printful.com',
    searchPath: '/custom-products/search?q=',
    selectors: {
      productCard: '.product-grid-item',
      productName: '.product-title',
      price: '.product-price',
      originalPrice: '.product-price--compare',
      currency: '.price-currency'
    },
    requiresJS: false
  },
  
  gotprint: {
    id: 'gotprint',
    name: 'GotPrint',
    baseUrl: 'https://www.gotprint.com',
    searchPath: '/search.html?keywords=',
    selectors: {
      productCard: '.product-item',
      productName: '.product-name',
      price: '.price',
      originalPrice: '.old-price',
      currency: '.currency'
    },
    requiresJS: false
  },
  
  uprinting: {
    id: 'uprinting',
    name: 'UPrinting',
    baseUrl: 'https://www.uprinting.com',
    searchPath: '/search?q=',
    selectors: {
      productCard: '.product-item',
      productName: '.product-title',
      price: '.price-now',
      originalPrice: '.price-was',
      currency: '.price-currency'
    },
    requiresJS: true
  },
  
  // Add more competitors as needed
  psprint: {
    id: 'psprint',
    name: 'PsPrint',
    baseUrl: 'https://www.psprint.com',
    searchPath: '/search?text=',
    selectors: {
      productCard: '.product-tile',
      productName: '.product-name',
      price: '.product-price',
      originalPrice: '.strikethrough-price',
      currency: '$'
    },
    requiresJS: false
  }
};

// Scraping strategies based on site requirements
class CompetitorScraperAPI {
  constructor() {
    this.browser = null;
  }

  // Initialize Puppeteer browser for JS-heavy sites
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  // Main scraping method
  async scrapeCompetitorPrices(productName, productSKU) {
    const results = [];
    
    for (const [key, competitor] of Object.entries(COMPETITORS)) {
      try {
        console.log(`Scraping ${competitor.name} for: ${productName}`);
        
        // Check cache first
        const cacheKey = `${competitor.id}_${productSKU || productName}`;
        const cached = priceCache.get(cacheKey);
        if (cached) {
          console.log(`Using cached price for ${competitor.name}`);
          results.push(cached);
          continue;
        }

        let priceData;
        if (competitor.requiresJS) {
          priceData = await this.scrapeDynamicSite(competitor, productName);
        } else {
          priceData = await this.scrapeStaticSite(competitor, productName);
        }

        if (priceData) {
          const result = {
            competitorId: competitor.id,
            competitorName: competitor.name,
            price: priceData.price,
            originalPrice: priceData.originalPrice,
            currency: priceData.currency || 'USD',
            productUrl: priceData.url,
            productName: priceData.matchedProductName,
            confidence: priceData.confidence,
            lastUpdated: new Date().toISOString()
          };
          
          // Cache the result
          priceCache.set(cacheKey, result);
          results.push(result);
        }
      } catch (error) {
        console.error(`Error scraping ${competitor.name}:`, error.message);
        results.push({
          competitorId: competitor.id,
          competitorName: competitor.name,
          error: error.message,
          lastUpdated: new Date().toISOString()
        });
      }
    }

    return results;
  }

  // Scrape static HTML sites with Cheerio
  async scrapeStaticSite(competitor, productName) {
    const searchUrl = `${competitor.baseUrl}${competitor.searchPath}${encodeURIComponent(productName)}`;
    
    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const products = [];

      $(competitor.selectors.productCard).each((index, element) => {
        const name = $(element).find(competitor.selectors.productName).text().trim();
        const priceText = $(element).find(competitor.selectors.price).text().trim();
        const originalPriceText = $(element).find(competitor.selectors.originalPrice).text().trim();
        
        if (name && priceText) {
          products.push({
            name,
            price: this.extractPrice(priceText),
            originalPrice: this.extractPrice(originalPriceText),
            element: $(element).html()
          });
        }
      });

      // Find best matching product
      const bestMatch = this.findBestMatch(productName, products);
      if (bestMatch) {
        return {
          ...bestMatch,
          url: searchUrl,
          currency: 'USD'
        };
      }
    } catch (error) {
      console.error(`Static scraping error for ${competitor.name}:`, error.message);
      throw error;
    }

    return null;
  }

  // Scrape JavaScript-rendered sites with Puppeteer
  async scrapeDynamicSite(competitor, productName) {
    const searchUrl = `${competitor.baseUrl}${competitor.searchPath}${encodeURIComponent(productName)}`;
    
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to search page
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for products to load
      await page.waitForSelector(competitor.selectors.productCard, { 
        timeout: 10000 
      }).catch(() => {
        console.log(`No products found on ${competitor.name}`);
      });

      // Extract product data
      const products = await page.evaluate((selectors) => {
        const items = [];
        const cards = document.querySelectorAll(selectors.productCard);
        
        cards.forEach(card => {
          const nameEl = card.querySelector(selectors.productName);
          const priceEl = card.querySelector(selectors.price);
          const originalPriceEl = card.querySelector(selectors.originalPrice);
          
          if (nameEl && priceEl) {
            items.push({
              name: nameEl.textContent.trim(),
              priceText: priceEl.textContent.trim(),
              originalPriceText: originalPriceEl ? originalPriceEl.textContent.trim() : null
            });
          }
        });
        
        return items;
      }, competitor.selectors);

      await page.close();

      // Process and find best match
      const processedProducts = products.map(p => ({
        name: p.name,
        price: this.extractPrice(p.priceText),
        originalPrice: this.extractPrice(p.originalPriceText)
      }));

      const bestMatch = this.findBestMatch(productName, processedProducts);
      if (bestMatch) {
        return {
          ...bestMatch,
          url: searchUrl,
          currency: 'USD'
        };
      }
    } catch (error) {
      console.error(`Dynamic scraping error for ${competitor.name}:`, error.message);
      throw error;
    }

    return null;
  }

  // Extract numeric price from text
  extractPrice(priceText) {
    if (!priceText) return null;
    
    // Remove currency symbols and clean the text
    const cleaned = priceText
      .replace(/[^0-9.,]/g, '')
      .replace(',', '');
    
    const price = parseFloat(cleaned);
    return isNaN(price) ? null : price;
  }

  // Find best matching product based on name similarity
  findBestMatch(searchTerm, products) {
    if (!products || products.length === 0) return null;
    
    let bestMatch = null;
    let highestScore = 0;
    const searchLower = searchTerm.toLowerCase();
    const searchWords = searchLower.split(/\s+/);

    products.forEach(product => {
      const productLower = product.name.toLowerCase();
      
      // Calculate similarity score
      let score = 0;
      
      // Exact match bonus
      if (productLower === searchLower) {
        score = 1.0;
      } else {
        // Word matching
        searchWords.forEach(word => {
          if (productLower.includes(word)) {
            score += 0.2;
          }
        });
        
        // Levenshtein distance for fuzzy matching
        const distance = this.levenshteinDistance(searchLower, productLower);
        const maxLength = Math.max(searchLower.length, productLower.length);
        const similarity = 1 - (distance / maxLength);
        score += similarity * 0.5;
      }

      if (score > highestScore && score > 0.3) { // Minimum threshold
        highestScore = score;
        bestMatch = {
          ...product,
          matchedProductName: product.name,
          confidence: Math.min(score, 1.0)
        };
      }
    });

    return bestMatch;
  }

  // Levenshtein distance algorithm for string similarity
  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  // Clean up browser instance
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Express API endpoints
const router = express.Router();
const scraper = new CompetitorScraperAPI();

// Get competitor prices for a product
router.post('/api/competitor-prices', async (req, res) => {
  try {
    const { productName, productSKU } = req.body;
    
    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const prices = await scraper.scrapeCompetitorPrices(productName, productSKU);
    res.json({
      success: true,
      product: { name: productName, sku: productSKU },
      competitors: prices,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get list of configured competitors
router.get('/api/competitors', (req, res) => {
  const competitorList = Object.values(COMPETITORS).map(c => ({
    id: c.id,
    name: c.name,
    baseUrl: c.baseUrl
  }));
  res.json({ competitors: competitorList });
});

// Clear cache for a specific product
router.delete('/api/competitor-prices/cache', (req, res) => {
  const { productName, productSKU } = req.body;
  let cleared = 0;
  
  Object.keys(COMPETITORS).forEach(competitorId => {
    const cacheKey = `${competitorId}_${productSKU || productName}`;
    if (priceCache.del(cacheKey)) {
      cleared++;
    }
  });
  
  res.json({ 
    success: true, 
    message: `Cleared ${cleared} cached entries` 
  });
});

// Cleanup on server shutdown
process.on('SIGINT', async () => {
  await scraper.cleanup();
  process.exit(0);
});

module.exports = router;