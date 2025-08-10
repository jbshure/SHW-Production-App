// Trello and Airtable API functions for Quote Builder

const TRELLO_API_KEY = process.env.VITE_TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.VITE_TRELLO_TOKEN;
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID;
const AIRTABLE_API_KEY = process.env.VITE_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.VITE_AIRTABLE_BASE_ID;

// TRELLO INTEGRATION
export async function getTrelloLists(req, res) {
  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const lists = await response.json();
    
    // Filter for relevant lists (Pre-Order Sales, Quoting)
    const relevantLists = lists.filter(list => 
      list.name.includes('Pre-Order Sales') || 
      list.name.includes('Quoting') ||
      list.name.includes('Quote')
    );
    
    res.json(relevantLists);
  } catch (error) {
    console.error('Error fetching Trello lists:', error);
    res.status(500).json({ error: 'Failed to fetch Trello lists' });
  }
}

export async function getTrelloCards(req, res) {
  try {
    const { listId } = req.query;
    
    const response = await fetch(
      `https://api.trello.com/1/lists/${listId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name,desc,due,labels&customFieldItems=true`
    );
    const cards = await response.json();
    
    // Transform cards to include project details
    const projectCards = cards.map(card => ({
      id: card.id,
      name: card.name,
      description: card.desc,
      dueDate: card.due,
      labels: card.labels,
      // Extract project details from description or custom fields
      projectDetails: extractProjectDetails(card)
    }));
    
    res.json(projectCards);
  } catch (error) {
    console.error('Error fetching Trello cards:', error);
    res.status(500).json({ error: 'Failed to fetch Trello cards' });
  }
}

export async function getTrelloCard(req, res) {
  try {
    const { cardId } = req.params;
    
    const response = await fetch(
      `https://api.trello.com/1/cards/${cardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=all&customFieldItems=true&checklists=all`
    );
    const card = await response.json();
    
    const projectData = {
      id: card.id,
      name: card.name,
      description: card.desc,
      dueDate: card.due,
      labels: card.labels,
      checklists: card.checklists,
      // Parse project details for quote
      clientInfo: extractClientInfo(card),
      projectSpecs: extractProjectSpecs(card),
      estimatedQuantities: extractQuantities(card)
    };
    
    res.json(projectData);
  } catch (error) {
    console.error('Error fetching Trello card:', error);
    res.status(500).json({ error: 'Failed to fetch Trello card' });
  }
}

// AIRTABLE INTEGRATION
export async function getProductCatalog(req, res) {
  try {
    const { category, available } = req.query;
    
    let filterFormula = '';
    const filters = [];
    
    if (category) {
      filters.push(`{Category} = '${category}'`);
    }
    if (available === 'true') {
      filters.push(`{Available} = TRUE()`);
    }
    
    if (filters.length > 0) {
      filterFormula = `?filterByFormula=AND(${filters.join(',')})`;
    }
    
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products${filterFormula}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    // Transform Airtable records to product catalog format
    const products = data.records.map(record => ({
      id: record.id,
      name: record.fields.Name,
      category: record.fields.Category,
      available: record.fields.Available,
      basePrice: record.fields.BasePrice,
      setupFee: record.fields.SetupFee,
      minimumQuantity: record.fields.MinimumQuantity,
      description: record.fields.Description,
      specifications: record.fields.Specifications,
      note: record.fields.Note
    }));
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching Airtable products:', error);
    res.status(500).json({ error: 'Failed to fetch product catalog' });
  }
}

export async function getProductPricing(req, res) {
  try {
    const { productId, quantity } = req.query;
    
    // Fetch pricing tiers from Airtable
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Pricing?filterByFormula={Product ID} = '${productId}'`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    // Calculate pricing based on quantity breaks
    const pricingTiers = data.records.map(record => ({
      minQuantity: record.fields.MinQuantity,
      maxQuantity: record.fields.MaxQuantity,
      unitPrice: record.fields.UnitPrice,
      setupFee: record.fields.SetupFee
    })).sort((a, b) => a.minQuantity - b.minQuantity);
    
    // Find applicable pricing tier
    const applicableTier = pricingTiers.find(tier => 
      quantity >= tier.minQuantity && 
      (tier.maxQuantity === null || quantity <= tier.maxQuantity)
    );
    
    res.json({
      productId,
      quantity: parseInt(quantity),
      pricing: applicableTier || pricingTiers[pricingTiers.length - 1],
      allTiers: pricingTiers
    });
  } catch (error) {
    console.error('Error fetching product pricing:', error);
    res.status(500).json({ error: 'Failed to fetch product pricing' });
  }
}

// HELPER FUNCTIONS
function extractProjectDetails(card) {
  const description = card.desc || '';
  
  // Extract common project details from description
  const details = {
    clientName: extractField(description, 'Client:', 'Company:'),
    contactEmail: extractField(description, 'Email:', 'Contact:'),
    projectType: extractField(description, 'Project:', 'Type:'),
    deadline: extractField(description, 'Deadline:', 'Due:'),
    budget: extractField(description, 'Budget:', '$'),
    notes: extractField(description, 'Notes:', 'Special:')
  };
  
  return details;
}

function extractClientInfo(card) {
  const description = card.desc || '';
  
  return {
    company: extractField(description, 'Company:', 'Client:'),
    contact: extractField(description, 'Contact:', 'Name:'),
    email: extractField(description, 'Email:'),
    phone: extractField(description, 'Phone:', 'Tel:')
  };
}

function extractProjectSpecs(card) {
  const description = card.desc || '';
  
  return {
    projectName: card.name,
    specifications: extractField(description, 'Specs:', 'Specifications:'),
    materials: extractField(description, 'Materials:', 'Material:'),
    colors: extractField(description, 'Colors:', 'Color:'),
    size: extractField(description, 'Size:', 'Dimensions:')
  };
}

function extractQuantities(card) {
  const description = card.desc || '';
  const quantities = [];
  
  // Look for quantity patterns like "1000 pcs", "500 units", etc.
  const qtyMatches = description.match(/(\d+)\s*(pcs|units|pieces|ea)/gi);
  if (qtyMatches) {
    qtyMatches.forEach(match => {
      const qty = parseInt(match.match(/\d+/)[0]);
      quantities.push(qty);
    });
  }
  
  return quantities.length > 0 ? quantities : [1000]; // Default quantity
}

function extractField(text, ...patterns) {
  for (const pattern of patterns) {
    const regex = new RegExp(`${pattern}\\s*([^\\n\\r]+)`, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}