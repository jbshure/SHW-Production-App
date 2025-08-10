// API Integration module for Trello and Airtable
// Add this to your existing app.js or import it

// TRELLO INTEGRATION FUNCTIONS
window.loadTrelloLists = async function() {
    try {
        // Get credentials from environment (these should be safe for client-side use)
        const TRELLO_API_KEY = import.meta.env.VITE_TRELLO_API_KEY;
        const TRELLO_TOKEN = import.meta.env.VITE_TRELLO_TOKEN;
        const TRELLO_BOARD_ID = import.meta.env.VITE_TRELLO_BOARD_ID || '686da04ff3f765a86406b2c0';
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
            throw new Error('Trello API credentials not configured');
        }
        
        const response = await fetch(
            `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        
        if (!response.ok) {
            throw new Error(`Trello API error: ${response.status}`);
        }
        
        const lists = await response.json();
        
        // Filter for relevant lists (Pre-Order Sales, Quoting)
        const relevantLists = lists.filter(list => 
            list.name.toLowerCase().includes('pre-order') || 
            list.name.toLowerCase().includes('quoting') ||
            list.name.toLowerCase().includes('quote') ||
            list.name.toLowerCase().includes('sales')
        );
        
        const select = document.getElementById('trelloListSelect');
        select.innerHTML = '<option value="">Select a list...</option>';
        
        relevantLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = list.name;
            select.appendChild(option);
        });
        
        showNotification(`Loaded ${relevantLists.length} relevant Trello lists!`);
    } catch (error) {
        console.error('Error loading Trello lists:', error);
        showNotification(`Trello error: ${error.message}`, 'error');
        
        // Show error message instead of fake data
        const select = document.getElementById('trelloListSelect');
        select.innerHTML = `
            <option value="">Trello API not configured</option>
        `;
    }
};

window.refreshTrelloCards = async function() {
    const listId = document.getElementById('trelloListSelect').value;
    if (!listId) {
        showNotification('Please select a Trello list first', 'warning');
        return;
    }
    
    if (!listId || listId === '') {
        showNotification('Please configure Trello API credentials first', 'error');
        return;
    }
    
    try {
        const TRELLO_API_KEY = import.meta.env.VITE_TRELLO_API_KEY;
        const TRELLO_TOKEN = import.meta.env.VITE_TRELLO_TOKEN;
        
        if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
            throw new Error('Trello API credentials not configured');
        }
        
        const response = await fetch(
            `https://api.trello.com/1/lists/${listId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name,desc,due,labels`
        );
        
        if (!response.ok) {
            throw new Error(`Trello API error: ${response.status}`);
        }
        
        const cards = await response.json();
        
        // Transform cards to include project details
        const projectCards = cards.map(card => ({
            ...card,
            description: card.desc,
            dueDate: card.due,
            projectDetails: extractProjectDetails(card)
        }));
        
        displayTrelloCards(projectCards);
        showNotification(`Found ${projectCards.length} cards in list`);
    } catch (error) {
        console.error('Error loading Trello cards:', error);
        showNotification(`Trello error: ${error.message}`, 'error');
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

window.selectTrelloCard = async function(cardId, cardName) {
    try {
        let cardData;
        
        // Only handle real Trello cards - no fake data
        const TRELLO_API_KEY = import.meta.env.VITE_TRELLO_API_KEY;
        const TRELLO_TOKEN = import.meta.env.VITE_TRELLO_TOKEN;
        
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
    
    // Add specifications to special instructions
    let specialInstructions = '';
    if (cardData.projectSpecs.specifications) {
        specialInstructions += `Specifications: ${cardData.projectSpecs.specifications}\n`;
    }
    if (cardData.projectSpecs.materials) {
        specialInstructions += `Materials: ${cardData.projectSpecs.materials}\n`;
    }
    if (cardData.projectSpecs.colors) {
        specialInstructions += `Colors: ${cardData.projectSpecs.colors}\n`;
    }
    if (cardData.description) {
        specialInstructions += `\nProject Description:\n${cardData.description}`;
    }
    
    document.getElementById('specialInstructions').value = specialInstructions;
    
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
        const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
        const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
        
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
        const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
        const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
        
        if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
            console.error('❌ Airtable configuration missing');
            showNotification('Airtable API not configured. Check environment variables.', 'error');
            return [];
        }
        
        console.log('🔄 Loading products from Airtable...');
        showNotification('Loading product catalog...', 'info');
        
        // First, try to fetch category names to create lookup map
        const categoryMap = await fetchCategoryNames();
        
        // Then fetch products
        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products?maxRecords=100`,
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
        const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
        const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
        
        if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
            throw new Error('Airtable API credentials not configured');
        }
        
        console.log('🔄 Loading products with string formatting...');
        
        // Use cellFormat=string to get category names directly instead of IDs
        const response = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products?maxRecords=100&cellFormat=string`,
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
    
    const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
    
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
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Products?maxRecords=1&cellFormat=string`,
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
    
    const trelloKey = import.meta.env.VITE_TRELLO_API_KEY;
    const trelloToken = import.meta.env.VITE_TRELLO_TOKEN;
    const trelloBoardId = import.meta.env.VITE_TRELLO_BOARD_ID;
    const airtableKey = import.meta.env.VITE_AIRTABLE_API_KEY;
    const airtableBaseId = import.meta.env.VITE_AIRTABLE_BASE_ID;
    
    console.log('Trello API Key:', trelloKey ? '✅ Configured' : '❌ Missing');
    console.log('Trello Token:', trelloToken ? '✅ Configured' : '❌ Missing');
    console.log('Trello Board ID:', trelloBoardId ? '✅ Configured' : '❌ Missing');
    console.log('Airtable API Key:', airtableKey ? '✅ Configured' : '❌ Missing');
    console.log('Airtable Base ID:', airtableBaseId ? '✅ Configured' : '❌ Missing');
    
    showNotification(`Config check complete - see browser console`, 'info');
};

// Debug function to test Airtable connection specifically
window.testAirtableConnection = async function() {
    console.log('🔍 DEBUG: Testing Airtable Connection...');
    
    const airtableKey = import.meta.env.VITE_AIRTABLE_API_KEY;
    const airtableBaseId = import.meta.env.VITE_AIRTABLE_BASE_ID;
    
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