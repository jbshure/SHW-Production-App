// API Integration module for Trello and Airtable
// Add this to your existing app.js or import it
console.log('🔄 Loading api-integration.js...');

// TRELLO INTEGRATION FUNCTIONS
console.log('🔧 Defining loadTrelloLists function...');
window.loadTrelloLists = async function() {
    console.log('🔄 loadTrelloLists called');
    
    try {
        // Check if config is available
        if (!window.API_CONFIG) {
            throw new Error('API configuration not loaded. Make sure config.js is included.');
        }
        
        // Get credentials from config
        const TRELLO_API_KEY = window.API_CONFIG?.TRELLO?.API_KEY;
        const TRELLO_TOKEN = window.API_CONFIG?.TRELLO?.TOKEN;
        const TRELLO_BOARD_ID = window.API_CONFIG?.TRELLO?.BOARD_ID || '686da04ff3f765a86406b2c0';
        
        console.log('📋 Trello Config Check:', {
            hasApiKey: !!TRELLO_API_KEY,
            hasToken: !!TRELLO_TOKEN,
            boardId: TRELLO_BOARD_ID
        });
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
            throw new Error('Trello API credentials not configured in config.js');
        }
        
        const url = `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`;
        console.log('🌐 Making Trello API request to:', url.substring(0, 60) + '...');
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('📡 Trello API Response:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Trello API error: ${response.status} - ${errorText}`);
        }
        
        const lists = await response.json();
        console.log(`📚 Retrieved ${lists.length} lists from Trello`);
        
        // Filter for relevant lists (Pre-Order Sales, Quoting)
        const relevantLists = lists.filter(list => 
            list.name.toLowerCase().includes('pre-order') || 
            list.name.toLowerCase().includes('quoting') ||
            list.name.toLowerCase().includes('quote') ||
            list.name.toLowerCase().includes('sales')
        );
        
        console.log(`🎯 Found ${relevantLists.length} relevant lists:`, relevantLists.map(l => l.name));
        
        const select = document.getElementById('trelloListSelect');
        if (!select) {
            throw new Error('trelloListSelect element not found');
        }
        
        select.innerHTML = '<option value="">Select a list...</option>';
        
        relevantLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = list.name;
            select.appendChild(option);
        });
        
        showNotification(`✅ Loaded ${relevantLists.length} Trello lists!`, 'success');
        console.log('✅ Trello lists loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading Trello lists:', error);
        showNotification(`Trello error: ${error.message}`, 'error');
        
        const select = document.getElementById('trelloListSelect');
        if (select) {
            select.innerHTML = `<option value="">Error: ${error.message}</option>`;
        }
        
        // Re-throw for debugging
        throw error;
    }
};
console.log('✅ loadTrelloLists function defined');

window.refreshTrelloCards = async function() {
    console.log('🔄 refreshTrelloCards called');
    
    const listId = document.getElementById('trelloListSelect').value;
    if (!listId) {
        showNotification('Please select a Trello list first', 'warning');
        return;
    }
    
    try {
        const TRELLO_API_KEY = window.API_CONFIG?.TRELLO?.API_KEY;
        const TRELLO_TOKEN = window.API_CONFIG?.TRELLO?.TOKEN;
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
            throw new Error('Trello API credentials not configured');
        }
        
        const url = `https://api.trello.com/1/lists/${listId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name,desc,due,labels`;
        console.log('🌐 Loading cards from list:', listId);
        
        const response = await fetch(url);
        console.log('📡 Cards API Response:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Trello API error: ${response.status} - ${errorText}`);
        }
        
        const cards = await response.json();
        console.log(`📇 Retrieved ${cards.length} cards from list`);
        
        // Transform cards to include project details
        const projectCards = cards.map(card => ({
            ...card,
            description: card.desc,
            dueDate: card.due,
            projectDetails: extractProjectDetails(card)
        }));
        
        displayTrelloCards(projectCards);
        showNotification(`✅ Found ${projectCards.length} cards in list`, 'success');
        console.log('✅ Cards loaded and displayed successfully');
        
    } catch (error) {
        console.error('❌ Error loading Trello cards:', error);
        showNotification(`Trello cards error: ${error.message}`, 'error');
    }
};

// Helper function to extract project details from card description
function extractProjectDetails(card) {
    const description = card.desc || '';
    
    return {
        clientName: extractField(description, 'Client:', 'Company:'),
        contactEmail: extractField(description, 'Email:', 'Contact:'),
        projectType: extractField(description, 'Project:', 'Type:'),
        deadline: extractField(description, 'Deadline:', 'Due:'),
        budget: extractField(description, 'Budget:', '$'),
        notes: extractField(description, 'Notes:', 'Special:')
    };
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

function displayTrelloCards(cards) {
    const container = document.getElementById('trelloCardsList');
    container.style.display = 'block';
    
    if (!cards.length) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-light);">No cards found in this list</div>';
        return;
    }
    
    let html = `
        <div style="padding: 16px; background: var(--background-gray); border-radius: 8px; margin-bottom: 16px; text-align: center;">
            <h4 style="margin: 0; color: var(--text-primary);">📋 Select a Card to Auto-Fill Quote</h4>
            <p style="margin: 8px 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">Click any card below to populate the quote form with project details</p>
        </div>
    `;
    cards.forEach(card => {
        const dueDate = card.dueDate ? new Date(card.dueDate).toLocaleDateString() : 'No due date';
        const labels = card.labels.map(label => `<span style="background:${label.color}; color:white; padding:2px 6px; border-radius:3px; font-size:0.7rem; margin-right:4px;">${label.name}</span>`).join('');
        
        html += `
            <div style="border: 2px solid var(--border-color); border-radius: 8px; padding: 16px; margin: 12px 0; background: var(--background-light); cursor: pointer; transition: all 0.2s ease;" 
                 onclick="selectTrelloCard('${card.id}', '${card.name.replace(/'/g, "\\'")}')"
                 onmouseover="this.style.borderColor='var(--accent-color)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'"
                 onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="font-weight: 600; color: var(--text-primary); flex: 1;">${card.name}</div>
                    <button style="background: var(--accent-color); color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; margin-left: 12px;">📋 Select</button>
                </div>
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.4;">${card.description.substring(0, 150)}${card.description.length > 150 ? '...' : ''}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>${labels}</div>
                    <div style="font-size: 0.8rem; color: var(--text-light);">${dueDate}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Global variable to track the selected Trello card
window.selectedTrelloCard = null;

window.selectTrelloCard = async function(cardId, cardName) {
    try {
        let cardData;
        
        // Only handle real Trello cards - no fake data
        const TRELLO_API_KEY = window.API_CONFIG?.TRELLO?.API_KEY;
        const TRELLO_TOKEN = window.API_CONFIG?.TRELLO?.TOKEN;
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
            throw new Error('Trello API credentials not configured');
        }
        
        const response = await fetch(
            `https://api.trello.com/1/cards/${cardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=all`
        );
        
        if (!response.ok) {
            throw new Error(`Trello API error: ${response.status}`);
        }
        
        const card = await response.json();
        
        cardData = {
            id: card.id,
            name: card.name,
            description: card.desc,
            dueDate: card.due,
            clientInfo: extractClientInfo(card),
            projectSpecs: extractProjectSpecs(card)
        };
        
        // Store the selected card globally for later use
        window.selectedTrelloCard = cardData;
        
        // Populate quote form with Trello card data
        populateQuoteFromTrello(cardData);
        
        // Show selected card
        const selectedContainer = document.getElementById('selectedTrelloCards');
        selectedContainer.innerHTML = `
            <div style="background: var(--success-color); color: white; padding: 12px; border-radius: 8px; margin: 12px 0;">
                <strong>Selected:</strong> ${cardName}
                <button onclick="clearTrelloSelection()" style="float: right; background: none; border: none; color: white; cursor: pointer;">×</button>
            </div>
        `;
        
        // Hide card list
        document.getElementById('trelloCardsList').style.display = 'none';
        
        showNotification(`Quote populated with data from "${cardName}"`);
    } catch (error) {
        console.error('Error loading Trello card:', error);
        showNotification(`Error loading card: ${error.message}`, 'error');
    }
};

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
        colors: extractField(description, 'Colors:', 'Color:')
    };
}

function populateQuoteFromTrello(cardData) {
    // Populate client information
    if (cardData.clientInfo.company) {
        document.getElementById('clientCompany').value = cardData.clientInfo.company;
    }
    if (cardData.clientInfo.contact) {
        document.getElementById('contactName').value = cardData.clientInfo.contact;
    }
    if (cardData.clientInfo.email) {
        document.getElementById('contactEmail').value = cardData.clientInfo.email;
    }
    if (cardData.clientInfo.phone) {
        document.getElementById('contactPhone').value = cardData.clientInfo.phone;
    }
    
    // Populate project information
    if (cardData.projectSpecs.projectName) {
        document.getElementById('projectName').value = cardData.projectSpecs.projectName;
    }
    
    // Set due date if available
    if (cardData.dueDate) {
        document.getElementById('quoteValidUntil').value = new Date(cardData.dueDate).toISOString().split('T')[0];
    }
    
    // Special Instructions field remains empty - user will fill manually
    
    // Update progress and recalculate
    updateProgress();
    updatePreview();
    markDirty();
}

window.clearTrelloSelection = function() {
    document.getElementById('selectedTrelloCards').innerHTML = '';
    document.getElementById('trelloCardsList').style.display = 'block';
};

// Helper function to fetch category names from Categories table
async function fetchCategoryNames() {
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        console.log('🔄 Fetching categories from Categories table...');
        
        // Try multiple possible table names
        const tableNames = ['Categories', 'Category', 'categories', 'category'];
        let categoryMap = {};
        let success = false;
        
        for (const tableName of tableNames) {
            try {
                const response = await fetch(
                    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Found ${tableName} table with ${data.records.length} records`);
                    
                    data.records.forEach(record => {
                        // Try multiple possible field names for category name
                        const categoryName = record.fields.Name || 
                                           record.fields['Category Name'] || 
                                           record.fields.Category ||
                                           record.fields.name || 
                                           record.fields.Title ||
                                           record.id;
                        categoryMap[record.id] = categoryName;
                    });
                    
                    success = true;
                    break;
                }
            } catch (err) {
                console.log(`Table ${tableName} not found, trying next...`);
            }
        }
        
        if (success) {
            console.log('📂 Category mapping created:', categoryMap);
            return categoryMap;
        } else {
            console.warn('⚠️ No Categories table found');
            return null;
        }
    } catch (error) {
        console.error('Error fetching categories:', error);
        return null;
    }
}

// AIRTABLE PRODUCT CATALOG INTEGRATION
window.loadProductCatalogFromAirtable = async function() {
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
            console.error('❌ Airtable configuration missing');
            showNotification('Airtable API not configured. Check environment variables.', 'error');
            return [];
        }
        
        console.log('🔄 Loading products from Airtable...');
        showNotification('Loading product catalog...', 'info');
        
        // First, try to fetch category names to create lookup map
        const categoryMap = await fetchCategoryNames();
        
        // Fetch products directly from Airtable API
        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products`,
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Airtable API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Log the first record to see actual field names
        if (data.records.length > 0) {
            console.log('🔍 Airtable Product Fields:', Object.keys(data.records[0].fields));
            console.log('🔍 First Product Full Data:', data.records[0].fields);
            
            // Show each field clearly
            const firstProduct = data.records[0].fields;
            console.log('📋 Field Details:');
            Object.keys(firstProduct).forEach(key => {
                console.log(`  - ${key}:`, firstProduct[key]);
            });
        }
        
        // Process products and resolve category names
        const products = data.records.map(record => {
            const fields = record.fields;
            
            // Get category name from linked field
            let categoryName = 'Uncategorized';
            if (fields.Category && Array.isArray(fields.Category) && fields.Category.length > 0) {
                // Category is a linked field array, get first category
                const categoryId = fields.Category[0];
                if (categoryMap && categoryMap[categoryId]) {
                    categoryName = categoryMap[categoryId];
                } else {
                    // Fallback if no map available
                    console.warn(`Category ID ${categoryId} not found in map`);
                    categoryName = 'Other';
                }
            } else if (typeof fields.Category === 'string') {
                // If it's already a string, use it directly
                categoryName = fields.Category;
            }
            
            // Get product name from various possible field names
            const productName = fields['Product name'] || 
                              fields.Name || 
                              fields.Product || 
                              fields.Identity || 
                              'Unknown Product';
            
            return {
                id: record.id,
                name: productName,
                category: categoryName,
                available: fields.Available !== false,
                basePrice: fields.Price || fields['Base Price'] || 0,
                setupFee: fields['Setup Fee'] || 0,
                minimumQuantity: fields['Minimum Quantity'] || fields.MinQty || 100,
                description: fields['shureprint Description'] || fields['E-commerce Product Description'] || '',
                specifications: fields['product feature list'] || '',
                material: fields.Material || '',
                color: fields.Color || '',
                colorOptions: fields['Color Options'] || '',
                printOptions: fields['Print Options'] || '',
                leadTime: fields['Lead Time'] || '',
                images: fields.images || [],
                note: fields.Note || fields.Status || ''
            };
        });
        
        // Update global product catalog
        window.productCatalog = products;
        productCatalog = products;
        
        // Log what we're actually storing
        console.log('📦 Processed products:', products.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category
        })));
        
        // Get unique categories and sort them
        const categories = [...new Set(products.map(p => p.category))]
            .filter(cat => cat && cat !== 'Uncategorized')
            .sort();
        console.log('📂 Categories found:', categories);
        const categorySelect = document.getElementById('productCategorySelect');
        categorySelect.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
        
        console.log(`✅ Successfully loaded ${products.length} products`);
        showNotification(`✅ Loaded ${products.length} products from catalog!`, 'success');
        return products;
    } catch (error) {
        console.error('❌ Error loading product catalog:', error);
        showNotification(`Error loading catalog: ${error.message}`, 'error');
        return [];
    }
};

// Alternative method using cellFormat=string for simpler category handling
window.loadProductCatalogWithStringFormat = async function() {
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
            throw new Error('Airtable API credentials not configured');
        }
        
        console.log('🔄 Loading products with string formatting...');
        
        // Use cellFormat=string to get category names directly instead of IDs
        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products?maxRecords=100&cellFormat=string&timeZone=America/New_York&userLocale=en-us`,
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Products with string format:', data);
        
        const products = data.records.map(record => {
            const fields = record.fields;
            
            return {
                id: record.id,
                name: fields['Product name'] || fields.Name || 'Unknown Product',
                category: fields.Category || 'Uncategorized',
                available: fields.Available !== false,
                description: fields['shureprint Description'] || '',
                specifications: fields['product feature list'] || ''
            };
        });
        
        window.productCatalog = products;
        productCatalog = products;
        
        // Update category dropdown
        const categories = [...new Set(products.map(p => p.category))]
            .filter(cat => cat && cat !== 'Uncategorized')
            .sort();
        
        const categorySelect = document.getElementById('productCategorySelect');
        categorySelect.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
        
        showNotification(`✅ Loaded ${products.length} products!`, 'success');
        return products;
    } catch (error) {
        console.error('❌ Error:', error);
        showNotification(`Error: ${error.message}`, 'error');
        return [];
    }
};

// Override existing addProductToQuote to use Airtable pricing
window.addProductToQuoteWithPricing = async function(productId, name, category, quantity = 1000) {
    try {
        // Get pricing from Airtable
        const response = await fetch(`/api/airtable/pricing?productId=${productId}&quantity=${quantity}`);
        const pricingData = await response.json();
        
        // Add to quote with real pricing
        const body = document.getElementById('itemsTableBody');
        const firstRow = body.rows[0];
        const firstRowProduct = firstRow.querySelector('input[name="product[]"]').value;
        let row = (!firstRowProduct.trim()) ? firstRow : createItemRow();
        if (row !== firstRow) body.appendChild(row);
        
        row.querySelector('input[name="product[]"]').value = name;
        row.querySelector('input[name="quantity[]"]').value = quantity;
        row.querySelector('input[name="unitPrice[]"]').value = pricingData.pricing.unitPrice.toFixed(3);
        row.querySelector('input[name="setupFee[]"]').value = pricingData.pricing.setupFee.toFixed(2);
        
        // Calculate total
        calculateRow(row.querySelector('input[name="quantity[]"]'));
        
        showNotification(`${name} added with Airtable pricing!`);
        updatePreview();
        markDirty();
    } catch (error) {
        console.error('Error adding product with pricing:', error);
        // Fallback to regular add without pricing
        addProductToQuote(name, category);
    }
};

// Initialize integrations when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing API integrations...');
    
    // Load Trello lists with error handling
    loadTrelloLists().catch(error => {
        console.error('Failed to load Trello lists on startup:', error);
    });
    
    // Load product catalog from Airtable with error handling
    loadProductCatalogFromAirtable().then(products => {
        if (products) {
            console.log('✅ Product catalog loaded successfully');
            initializeProductCatalog();
        } else {
            console.log('❌ Product catalog failed to load');
        }
    }).catch(error => {
        console.error('Failed to load product catalog on startup:', error);
    });
    
    console.log('📋 API integration initialization complete');
});

// Debug function to test category resolution
window.debugCategories = async function() {
    console.log('🔍 Debugging Airtable categories...');
    
    const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
    const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
        console.error('❌ Missing Airtable configuration');
        return;
    }
    
    try {
        // Fetch one product to see raw category data
        const productResponse = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products?maxRecords=1`,
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        const productData = await productResponse.json();
        console.log('📦 Sample product (raw):', productData.records[0]);
        
        // Try with string format
        const stringResponse = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products?maxRecords=1&cellFormat=string&timeZone=America/New_York&userLocale=en-us`,
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        const stringData = await stringResponse.json();
        console.log('📦 Sample product (string format):', stringData.records[0]);
        
        // Try to fetch categories
        const categoryMap = await fetchCategoryNames();
        console.log('📂 Category map:', categoryMap);
        
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
};

// Debug function to check environment variables
window.debugAPIConfig = function() {
    console.log('🔍 DEBUG: Checking API Configuration...');
    
    const trelloKey = window.API_CONFIG?.TRELLO?.API_KEY;
    const trelloToken = window.API_CONFIG?.TRELLO?.TOKEN;
    const trelloBoardId = window.API_CONFIG?.TRELLO?.BOARD_ID;
    const airtableKey = window.API_CONFIG?.AIRTABLE?.API_KEY;
    const airtableBaseId = window.API_CONFIG?.AIRTABLE?.BASE_ID;
    
    console.log('Trello API Key:', trelloKey ? '✅ Configured' : '❌ Missing');
    console.log('Trello Token:', trelloToken ? '✅ Configured' : '❌ Missing');
    console.log('Trello Board ID:', trelloBoardId ? '✅ Configured' : '❌ Missing');
    console.log('Airtable API Key:', airtableKey ? '✅ Configured' : '❌ Missing');
    console.log('Airtable Base ID:', airtableBaseId ? '✅ Configured' : '❌ Missing');
    
    showNotification(`Config check complete - see browser console`, 'info');
};

// ============================================
// AIRTABLE QUOTE SAVING FUNCTIONS
// ============================================

// Global variables for quote management
window.currentQuoteId = null;
window.isNewQuote = true;

// Save quote to Airtable
window.saveQuoteToAirtable = async function() {
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
            throw new Error('Airtable API credentials not configured');
        }

        const quoteData = {
            'Quote_Number': document.getElementById('quoteNumber').textContent,
            'Customer_Name': document.getElementById('clientCompany').value,
            'Customer_Contact': document.getElementById('contactName').value,
            'Customer_Email': document.getElementById('contactEmail').value,
            'Customer_Phone': document.getElementById('contactPhone').value,
            'Project_Name': document.getElementById('projectName').value,
            'Quote_Valid_Until': document.getElementById('quoteValidUntil').value || null,
            'Sales_Rep_Name': document.getElementById('salesRepName').value,
            'Sales_Rep_Email': document.getElementById('salesRepEmail').value,
            
            // Items as JSON string (Firebase function expects this format)
            'Items': JSON.stringify(getQuoteItemsForAirtable()),
            
            // Pricing
            'Tax_Rate': parseFloat(document.getElementById('taxRate').value) || 9.5,
            'Deposit_Percent': parseFloat(document.getElementById('depositPercent').value) || 50,
            'Delivery_Time': document.getElementById('deliveryTime').value,
            'Payment_Terms': document.getElementById('paymentTerms').value,
            'Special_Instructions': document.getElementById('specialInstructions').value,
            
            // Calculated totals
            ...getCalculatedTotalsForAirtable(),
            
            // Status and metadata
            'Status': 'Draft',
            'Created_By': document.getElementById('salesRepName').value || 'Quote Builder',
            'Reference': document.getElementById('quoteNumber').textContent,
            'Created_Date': new Date().toISOString()
        };

        let result;
        
        if (window.isNewQuote) {
            // Create new quote
            console.log('💾 Creating new quote in Airtable...');
            const response = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Quotes`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fields: quoteData
                    })
                }
            );
            
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Airtable API error: ${response.status} - ${errorData}`);
            }
            
            result = await response.json();
            window.currentQuoteId = result.id;
            window.isNewQuote = false;
            
            console.log('✅ New quote saved to Airtable with ID:', result.id);
            showNotification('🎉 Quote saved to Airtable!');
            
        } else {
            // Update existing quote
            console.log('💾 Updating quote in Airtable...');
            const response = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Quotes/${window.currentQuoteId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fields: quoteData
                    })
                }
            );
            
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Airtable API error: ${response.status} - ${errorData}`);
            }
            
            result = await response.json();
            
            console.log('✅ Quote updated in Airtable:', window.currentQuoteId);
            showNotification('✅ Quote updated in Airtable!');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error saving quote to Airtable:', error);
        showNotification(`Error saving quote: ${error.message}`, 'error');
        throw error;
    }
};

// Load recent quotes from Airtable
window.loadRecentQuotesFromAirtable = async function() {
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
            console.log('Airtable credentials not configured for quote loading');
            return [];
        }

        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Quotes?sort[0][field]=Created_Date&sort[0][direction]=desc&maxRecords=10`,
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Airtable API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📋 Recent quotes loaded from Airtable:', data.records);
        
        displayRecentQuotesFromAirtable(data.records);
        return data.records;
        
    } catch (error) {
        console.error('❌ Error loading quotes from Airtable:', error);
        showNotification(`Error loading quotes: ${error.message}`, 'error');
        return [];
    }
};

// Load a specific quote from Airtable
window.loadQuoteFromAirtable = async function(quoteId) {
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Quotes/${quoteId}`,
            {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Quote not found: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Populate form with quote data
        populateFormWithAirtableQuote(data.fields);
        
        // Set current quote ID
        window.currentQuoteId = quoteId;
        window.isNewQuote = false;
        
        showNotification(`Quote ${data.fields.Quote_Number} loaded!`);
        return data;
        
    } catch (error) {
        console.error('❌ Error loading quote from Airtable:', error);
        showNotification(`Error loading quote: ${error.message}`, 'error');
    }
};

// Delete quote from Airtable
window.deleteQuoteFromAirtable = async function(quoteId) {
    if (!confirm("Are you sure you want to delete this quote?")) return;
    
    try {
        const AIRTABLE_API_KEY = window.API_CONFIG?.AIRTABLE?.API_KEY;
        const AIRTABLE_BASE_ID = window.API_CONFIG?.AIRTABLE?.BASE_ID;
        
        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Quotes/${quoteId}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to delete: ${response.status}`);
        }
        
        showNotification('Quote deleted successfully!');
        loadRecentQuotesFromAirtable(); // Refresh the list
        
        // If we deleted the current quote, create a new one
        if (quoteId === window.currentQuoteId) {
            createNewQuote();
        }
        
    } catch (error) {
        console.error('❌ Error deleting quote:', error);
        showNotification(`Error deleting quote: ${error.message}`, 'error');
    }
};

// Create new quote
window.createNewQuote = function() {
    // Generate new quote number
    const today = new Date();
    const year = today.getFullYear();
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const newQuoteNumber = `QT-${year}${randomNum}`;
    
    // Reset form
    document.getElementById('quoteForm').reset();
    
    // Set new quote number
    document.getElementById('quoteNumber').textContent = newQuoteNumber;
    
    // Reset quote state
    window.currentQuoteId = null;
    window.isNewQuote = true;
    
    // Set default values
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 30);
    document.getElementById('quoteValidUntil').value = expDate.toISOString().split('T')[0];
    document.getElementById('taxRate').value = '9.5';
    document.getElementById('depositPercent').value = '50';
    
    // Clear items table except first row
    const tableBody = document.getElementById('itemsTableBody');
    while (tableBody.rows.length > 1) {
        tableBody.deleteRow(1);
    }
    
    // Clear first row
    const firstRow = tableBody.rows[0];
    firstRow.querySelectorAll('input').forEach(input => {
        if (input.name === 'quantity[]') {
            input.value = '1000';
        } else if (!input.readOnly) {
            input.value = '';
        }
    });
    
    calculateTotals();
    updatePreview();
    updateProgress();
    
    showNotification('New quote created!');
};

// Helper functions for Airtable format
function getQuoteItemsForAirtable() {
    const items = [];
    const tableBody = document.getElementById('itemsTableBody');
    
    for (let i = 0; i < tableBody.rows.length; i++) {
        const row = tableBody.rows[i];
        const product = row.querySelector('input[name="product[]"]').value;
        
        if (product.trim()) {
            items.push({
                'Item': product,
                'Note': row.querySelector('input[name="specs[]"]').value,
                'Qty': parseInt(row.querySelector('input[name="quantity[]"]').value) || 0,
                'Unit_Price': parseFloat(row.querySelector('input[name="unitPrice[]"]').value) || 0,
                'Set_Ups': parseFloat(row.querySelector('input[name="setupFee[]"]').value) || 0,
                'Sub_Total': parseFloat(row.querySelector('input[name="total[]"]').value) || 0
            });
        }
    }
    
    return items;
}

function getCalculatedTotalsForAirtable() {
    const subtotalText = document.getElementById('previewSubtotal').textContent.replace(/[$,]/g, '');
    const taxText = document.getElementById('previewTax').textContent.replace(/[$,]/g, '');
    const totalText = document.getElementById('previewTotal').textContent.replace(/[$,]/g, '');
    const depositText = document.getElementById('previewDeposit').textContent.replace(/[$,]/g, '');
    
    return {
        'Subtotal': parseFloat(subtotalText) || 0,
        'Tax_Amount': parseFloat(taxText) || 0,
        'Total': parseFloat(totalText) || 0,
        'Deposit_Amount': parseFloat(depositText) || 0
    };
}

function populateFormWithAirtableQuote(fields) {
    // Populate basic fields
    document.getElementById('quoteNumber').textContent = fields.Quote_Number || '';
    document.getElementById('clientCompany').value = fields.Customer_Name || '';
    document.getElementById('contactName').value = fields.Customer_Contact || '';
    document.getElementById('contactEmail').value = fields.Customer_Email || '';
    document.getElementById('contactPhone').value = fields.Customer_Phone || '';
    document.getElementById('projectName').value = fields.Project_Name || '';
    document.getElementById('quoteValidUntil').value = fields.Quote_Valid_Until || '';
    document.getElementById('salesRepName').value = fields.Sales_Rep_Name || '';
    document.getElementById('salesRepEmail').value = fields.Sales_Rep_Email || '';
    document.getElementById('taxRate').value = fields.Tax_Rate || 9.5;
    document.getElementById('depositPercent').value = fields.Deposit_Percent || 50;
    document.getElementById('deliveryTime').value = fields.Delivery_Time || '1-2 weeks';
    document.getElementById('paymentTerms').value = fields.Payment_Terms || '50% deposit, balance on completion';
    document.getElementById('specialInstructions').value = fields.Special_Instructions || '';
    
    // Populate items
    const tableBody = document.getElementById('itemsTableBody');
    tableBody.innerHTML = '';
    
    // Parse items from JSON string
    let items = [];
    if (fields.Items) {
        try {
            items = JSON.parse(fields.Items);
        } catch (e) {
            console.error('Error parsing items JSON:', e);
        }
    }
    
    if (items && items.length > 0) {
        items.forEach((item) => {
            const row = createItemRow();
            row.querySelector('input[name="product[]"]').value = item.Item || '';
            row.querySelector('input[name="specs[]"]').value = item.Note || '';
            row.querySelector('input[name="quantity[]"]').value = item.Qty || 1000;
            row.querySelector('input[name="unitPrice[]"]').value = item.Unit_Price || '';
            row.querySelector('input[name="setupFee[]"]').value = item.Set_Ups || '';
            row.querySelector('input[name="total[]"]').value = item.Sub_Total || '';
            tableBody.appendChild(row);
        });
    } else {
        // Add empty row if no items
        tableBody.appendChild(createItemRow());
    }
    
    // Recalculate and update UI
    calculateTotals();
    updatePreview();
    updateProgress();
}

function displayRecentQuotesFromAirtable(quotes) {
    const recentQuotesHTML = `
        <div class="preview-section">
            <div class="preview-header">📋 Recent Quotes</div>
            <div style="margin-bottom: 12px;">
                <button onclick="createNewQuote()" class="btn btn-primary" style="width: 100%; font-size: 0.9rem;">+ New Quote</button>
            </div>
            <div style="max-height: 250px; overflow-y: auto;">
                ${quotes.length === 0 ? 
                    '<p style="color: var(--text-light); font-style: italic; text-align: center; padding: 24px;">No quotes yet</p>' :
                    quotes.map(quote => {
                        const fields = quote.fields;
                        return `
                        <div style="background: var(--background-light); padding: 12px; border-radius: 8px; margin: 8px 0; border: 1px solid var(--border-color); position: relative;" >
                            <div style="cursor: pointer;" onclick="loadQuoteFromAirtable('${quote.id}')">
                                <div style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                                    <span>${fields.Quote_Number || 'No Number'}</span>
                                    <span style="background: ${getStatusColor(fields.Status)}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500;">${fields.Status || 'Draft'}</span>
                                </div>
                                <div style="font-size: 0.9rem; color: var(--text-secondary);">${fields.Customer_Name || 'No Customer'}</div>
                                <div style="font-size: 0.8rem; color: var(--text-light); display: flex; justify-content: space-between;">
                                    <span>${fields.Created_Date ? new Date(fields.Created_Date).toLocaleDateString() : 'No Date'}</span>
                                    <span>$${fields.Total?.toFixed(2) || '0.00'}</span>
                                </div>
                            </div>
                            <button onclick="event.stopPropagation(); deleteQuoteFromAirtable('${quote.id}')" 
                                    style="position: absolute; top: 8px; right: 8px; background: transparent; border: none; color: var(--error-color); cursor: pointer; font-size: 0.8rem; padding: 4px;">×</button>
                        </div>
                        `;
                    }).join('')
                }
            </div>
        </div>
    `;
    
    // Insert at the beginning of preview area
    const previewContainer = document.querySelector('.quote-preview');
    const firstSection = previewContainer.querySelector('.preview-section');
    if (firstSection) {
        firstSection.insertAdjacentHTML('beforebegin', recentQuotesHTML);
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'Draft': return 'var(--text-light)';
        case 'Sent': return 'var(--warning-color)';
        case 'Generated': return 'var(--success-color)';
        case 'Accepted': return 'var(--success-color)';
        case 'Rejected': return 'var(--error-color)';
        case 'Expired': return 'var(--text-secondary)';
        default: return 'var(--text-light)';
    }
}

// Debug function to test Airtable connection specifically
window.testAirtableConnection = async function() {
    console.log('🔍 DEBUG: Testing Airtable Connection...');
    
    const airtableKey = window.API_CONFIG?.AIRTABLE?.API_KEY;
    const airtableBaseId = window.API_CONFIG?.AIRTABLE?.BASE_ID;
    
    console.log('Airtable API Key:', airtableKey ? `✅ ${airtableKey.substring(0, 10)}...` : '❌ Missing');
    console.log('Airtable Base ID:', airtableBaseId ? `✅ ${airtableBaseId}` : '❌ Missing');
    
    if (!airtableKey || !airtableBaseId || airtableKey === 'your_airtable_token_here' || airtableBaseId === 'your_base_id_here') {
        console.error('❌ Airtable credentials not properly configured');
        showNotification('Please update .env file with real Airtable credentials', 'error');
        return;
    }
    
    try {
        console.log('🌐 Making test request to Airtable...');
        console.log('URL:', `https://api.airtable.com/v0/${airtableBaseId}/Products`);
        
        const response = await fetch(
            `https://api.airtable.com/v0/${airtableBaseId}/Products?maxRecords=3`,
            {
                headers: {
                    'Authorization': `Bearer ${airtableKey}`
                }
            }
        );
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Airtable API Error:', response.status, errorText);
            showNotification(`Airtable API Error: ${response.status} - ${errorText}`, 'error');
            return;
        }
        
        const data = await response.json();
        console.log('✅ Airtable Response:', data);
        
        if (data.records && data.records.length > 0) {
            console.log(`✅ Successfully connected! Found ${data.records.length} sample records`);
            showNotification(`✅ Airtable connected! Found ${data.records.length} sample products`, 'success');
            
            // Log sample record structure and fields
            console.log('Sample record structure:', data.records[0]);
            console.log('Available fields:', Object.keys(data.records[0].fields));
            console.log('Field values:', data.records[0].fields);
        } else {
            console.log('⚠️ Connected but no records found');
            showNotification('Connected to Airtable but no products found in Products table', 'warning');
        }
        
    } catch (error) {
        console.error('❌ Connection Error:', error);
        showNotification(`Connection error: ${error.message}`, 'error');
    }
};

// ============================================
// TRELLO CARD UPDATE FUNCTIONS
// ============================================

// Function to update Trello card with customer portal link
window.updateTrelloCardWithPortalLink = async function(cardId, portalUrl, quoteNumber) {
    try {
        const TRELLO_API_KEY = window.API_CONFIG?.TRELLO?.API_KEY;
        const TRELLO_TOKEN = window.API_CONFIG?.TRELLO?.TOKEN;
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN || !cardId) {
            console.log('Trello update skipped: Missing credentials or card ID');
            return false;
        }
        
        // Get current card description
        const cardResponse = await fetch(
            `https://api.trello.com/1/cards/${cardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=desc`
        );
        
        if (!cardResponse.ok) {
            throw new Error(`Failed to get card: ${cardResponse.status}`);
        }
        
        const cardData = await cardResponse.json();
        let description = cardData.desc || '';
        
        // Remove any existing quote portal links
        description = description.replace(/\n\n---\nQuote Portal:.*$/s, '');
        
        // Add new quote portal link
        const portalSection = `\n\n---\nQuote Portal: ${portalUrl}\nQuote Number: ${quoteNumber}\nGenerated: ${new Date().toLocaleString()}`;
        description += portalSection;
        
        // Update card description
        const updateResponse = await fetch(
            `https://api.trello.com/1/cards/${cardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    desc: description
                })
            }
        );
        
        if (!updateResponse.ok) {
            throw new Error(`Failed to update card: ${updateResponse.status}`);
        }
        
        console.log(`✅ Updated Trello card ${cardId} with portal link: ${portalUrl}`);
        return true;
        
    } catch (error) {
        console.error('Error updating Trello card with portal link:', error);
        return false;
    }
};

// Function to attach PDF to Trello card
window.attachPDFToTrelloCard = async function(cardId, pdfBlob, quoteNumber) {
    try {
        const TRELLO_API_KEY = window.API_CONFIG?.TRELLO?.API_KEY;
        const TRELLO_TOKEN = window.API_CONFIG?.TRELLO?.TOKEN;
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN || !cardId) {
            console.log('Trello PDF attachment skipped: Missing credentials or card ID');
            return false;
        }
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('key', TRELLO_API_KEY);
        formData.append('token', TRELLO_TOKEN);
        formData.append('file', pdfBlob, `Quote_${quoteNumber}.pdf`);
        formData.append('name', `Quote ${quoteNumber}.pdf`);
        
        // Attach PDF to card
        const response = await fetch(
            `https://api.trello.com/1/cards/${cardId}/attachments`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to attach PDF: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`✅ Attached PDF to Trello card ${cardId}: Quote_${quoteNumber}.pdf`);
        return result;
        
    } catch (error) {
        console.error('Error attaching PDF to Trello card:', error);
        return false;
    }
};

// Function to move Trello card to a different list (optional)
window.moveTrelloCardToList = async function(cardId, listId) {
    try {
        const TRELLO_API_KEY = window.API_CONFIG?.TRELLO?.API_KEY;
        const TRELLO_TOKEN = window.API_CONFIG?.TRELLO?.TOKEN;
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN || !cardId || !listId) {
            console.log('Trello card move skipped: Missing credentials, card ID, or list ID');
            return false;
        }
        
        const response = await fetch(
            `https://api.trello.com/1/cards/${cardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    idList: listId
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to move card: ${response.status}`);
        }
        
        console.log(`✅ Moved Trello card ${cardId} to list ${listId}`);
        return true;
        
    } catch (error) {
        console.error('Error moving Trello card:', error);
        return false;
    }
};