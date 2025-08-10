// Import Supabase
import { createClient } from '@supabase/supabase-js'

// Get environment variables (Vite automatically loads these)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey)

console.log("🔥 Supabase connected to Quote Builder!");

// Global variables for quote management
window.currentQuoteId = null;
window.isNewQuote = true;

// Enhanced quote saving functionality
window.saveQuoteToSupabase = async function() {
    try {
        const quoteData = {
            quote_number: document.getElementById('quoteNumber').textContent,
            
            // Client info
            client_company: document.getElementById('clientCompany').value,
            contact_name: document.getElementById('contactName').value,
            contact_email: document.getElementById('contactEmail').value,
            contact_phone: document.getElementById('contactPhone').value,
            project_name: document.getElementById('projectName').value,
            quote_valid_until: document.getElementById('quoteValidUntil').value || null,
            
            // Items
            items: getQuoteItems(),
            
            // Pricing
            tax_rate: parseFloat(document.getElementById('taxRate').value) || 9.5,
            deposit_percent: parseFloat(document.getElementById('depositPercent').value) || 50,
            delivery_time: document.getElementById('deliveryTime').value,
            payment_terms: document.getElementById('paymentTerms').value,
            special_instructions: document.getElementById('specialInstructions').value,
            
            // Calculated totals
            ...getCalculatedTotals(),
            
            // Status
            status: 'draft'
        };

        let result;
        
        if (window.isNewQuote) {
            // Insert new quote
            result = await supabase
                .from('quotes')
                .insert([quoteData])
                .select()
                .single();
                
            if (result.error) throw result.error;
            
            window.currentQuoteId = result.data.id;
            window.isNewQuote = false;
            
            console.log("New quote saved with ID: ", result.data.id);
            showNotification("🎉 Quote saved to Supabase!");
            
        } else {
            // Update existing quote
            result = await supabase
                .from('quotes')
                .update(quoteData)
                .eq('id', window.currentQuoteId)
                .select()
                .single();
                
            if (result.error) throw result.error;
            
            console.log("Quote updated: ", window.currentQuoteId);
            showNotification("✅ Quote updated in Supabase!");
        }
        
        return result.data;
        
    } catch (error) {
        console.error("Error saving quote:", error);
        showNotification("Error saving quote: " + error.message, 'error');
        throw error;
    }
};

// Load recent quotes
window.loadRecentQuotes = async function() {
    try {
        const { data: quotes, error } = await supabase
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        
        console.log("Recent quotes loaded:", quotes);
        displayRecentQuotes(quotes);
        
        return quotes;
        
    } catch (error) {
        console.error("Error loading quotes:", error);
        showNotification("Error loading quotes: " + error.message, 'error');
    }
};

// Load a specific quote
window.loadQuote = async function(quoteId) {
    try {
        const { data: quote, error } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', quoteId)
            .single();
            
        if (error) throw error;
        
        // Populate form with quote data
        populateFormWithQuote(quote);
        
        // Set current quote ID
        window.currentQuoteId = quoteId;
        window.isNewQuote = false;
        
        showNotification(`Quote ${quote.quote_number} loaded!`);
        
        return quote;
        
    } catch (error) {
        console.error("Error loading quote:", error);
        showNotification("Error loading quote: " + error.message, 'error');
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
    
    showNotification("New quote created!");
};

// Delete quote
window.deleteQuote = async function(quoteId) {
    if (!confirm("Are you sure you want to delete this quote?")) return;
    
    try {
        const { error } = await supabase
            .from('quotes')
            .delete()
            .eq('id', quoteId);
            
        if (error) throw error;
        
        showNotification("Quote deleted successfully!");
        loadRecentQuotes(); // Refresh the list
        
        // If we deleted the current quote, create a new one
        if (quoteId === window.currentQuoteId) {
            createNewQuote();
        }
        
    } catch (error) {
        console.error("Error deleting quote:", error);
        showNotification("Error deleting quote: " + error.message, 'error');
    }
};

// Mark quote as sent
window.markQuoteAsSent = async function() {
    if (!window.currentQuoteId) {
        await saveQuoteToSupabase(); // Save first if new
    }
    
    try {
        const { error } = await supabase
            .from('quotes')
            .update({ 
                status: 'sent', 
                sent_date: new Date().toISOString() 
            })
            .eq('id', window.currentQuoteId);
            
        if (error) throw error;
        
        showNotification("Quote marked as sent! 📧");
        
    } catch (error) {
        console.error("Error updating quote status:", error);
        showNotification("Error updating quote: " + error.message, 'error');
    }
};

// Helper functions
function getQuoteItems() {
    const items = [];
    const tableBody = document.getElementById('itemsTableBody');
    
    for (let i = 0; i < tableBody.rows.length; i++) {
        const row = tableBody.rows[i];
        const product = row.querySelector('input[name="product[]"]').value;
        
        if (product.trim()) {
            items.push({
                product: product,
                specs: row.querySelector('input[name="specs[]"]').value,
                quantity: parseInt(row.querySelector('input[name="quantity[]"]').value) || 0,
                unit_price: parseFloat(row.querySelector('input[name="unitPrice[]"]').value) || 0,
                setup_fee: parseFloat(row.querySelector('input[name="setupFee[]"]').value) || 0,
                total: parseFloat(row.querySelector('input[name="total[]"]').value) || 0
            });
        }
    }
    
    return items;
}

function getCalculatedTotals() {
    const subtotalText = document.getElementById('previewSubtotal').textContent.replace('$', '');
    const taxText = document.getElementById('previewTax').textContent.replace('$', '');
    const totalText = document.getElementById('previewTotal').textContent.replace('$', '');
    const depositText = document.getElementById('previewDeposit').textContent.replace('$', '');
    
    return {
        subtotal: parseFloat(subtotalText) || 0,
        tax_amount: parseFloat(taxText) || 0,
        total_amount: parseFloat(totalText) || 0,
        deposit_amount: parseFloat(depositText) || 0
    };
}

function populateFormWithQuote(quote) {
    // Populate basic fields
    document.getElementById('quoteNumber').textContent = quote.quote_number;
    document.getElementById('clientCompany').value = quote.client_company || '';
    document.getElementById('contactName').value = quote.contact_name || '';
    document.getElementById('contactEmail').value = quote.contact_email || '';
    document.getElementById('contactPhone').value = quote.contact_phone || '';
    document.getElementById('projectName').value = quote.project_name || '';
    document.getElementById('quoteValidUntil').value = quote.quote_valid_until || '';
    document.getElementById('taxRate').value = quote.tax_rate || 9.5;
    document.getElementById('depositPercent').value = quote.deposit_percent || 50;
    document.getElementById('deliveryTime').value = quote.delivery_time || '1-2 weeks';
    document.getElementById('paymentTerms').value = quote.payment_terms || '50% deposit, balance on completion';
    document.getElementById('specialInstructions').value = quote.special_instructions || '';
    
    // Populate items
    const tableBody = document.getElementById('itemsTableBody');
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Add items from the quote
    if (quote.items && quote.items.length > 0) {
        quote.items.forEach((item, index) => {
            const row = createItemRow();
            row.querySelector('input[name="product[]"]').value = item.product || '';
            row.querySelector('input[name="specs[]"]').value = item.specs || '';
            row.querySelector('input[name="quantity[]"]').value = item.quantity || 1000;
            row.querySelector('input[name="unitPrice[]"]').value = item.unit_price || '';
            row.querySelector('input[name="setupFee[]"]').value = item.setup_fee || '';
            row.querySelector('input[name="total[]"]').value = item.total || '';
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

function createItemRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" name="product[]" placeholder="Enter product name" onchange="updateProgress()"></td>
        <td><input type="text" name="specs[]" placeholder="Size, material, colors, etc."></td>
        <td><input type="number" name="quantity[]" value="1000" min="1" onchange="calculateRow(this)"></td>
        <td><input type="number" name="unitPrice[]" step="0.01" placeholder="0.00" onchange="calculateRow(this)"></td>
        <td><input type="number" name="setupFee[]" step="0.01" placeholder="0.00" onchange="calculateRow(this)"></td>
        <td><input type="number" name="total[]" step="0.01" placeholder="0.00" readonly></td>
        <td><button type="button" onclick="removeRow(this)" class="btn" style="background: var(--error-color); color: white; padding: 8px 12px; font-size: 0.8rem;">×</button></td>
    `;
    return row;
}

function displayRecentQuotes(quotes) {
    const recentQuotesHTML = `
        <div class="preview-section">
            <div class="preview-header">📋 Recent Quotes</div>
            <div style="margin-bottom: 12px;">
                <button onclick="createNewQuote()" class="btn btn-primary" style="width: 100%; font-size: 0.9rem;">+ New Quote</button>
            </div>
            <div style="max-height: 250px; overflow-y: auto;">
                ${quotes.length === 0 ? 
                    '<p style="color: var(--text-light); font-style: italic; text-align: center; padding: 24px;">No quotes yet</p>' :
                    quotes.map(quote => `
                        <div style="background: var(--background-light); padding: 12px; border-radius: 8px; margin: 8px 0; border: 1px solid var(--border-color); position: relative;" >
                            <div style="cursor: pointer;" onclick="loadQuote('${quote.id}')">
                                <div style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;">
                                    <span>${quote.quote_number}</span>
                                    <span style="background: ${getStatusColor(quote.status)}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500;">${quote.status}</span>
                                </div>
                                <div style="font-size: 0.9rem; color: var(--text-secondary);">${quote.client_company}</div>
                                <div style="font-size: 0.8rem; color: var(--text-light); display: flex; justify-content: space-between;">
                                    <span>${new Date(quote.created_at).toLocaleDateString()}</span>
                                    <span>$${quote.total_amount?.toFixed(2) || '0.00'}</span>
                                </div>
                            </div>
                            <button onclick="event.stopPropagation(); deleteQuote('${quote.id}')" 
                                    style="position: absolute; top: 8px; right: 8px; background: transparent; border: none; color: var(--error-color); cursor: pointer; font-size: 0.8rem; padding: 4px;">×</button>
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `;
    
    // Insert at the beginning of preview area
    const previewContainer = document.querySelector('.quote-preview');
    const firstSection = previewContainer.querySelector('.preview-section');
    firstSection.insertAdjacentHTML('beforebegin', recentQuotesHTML);
}

function getStatusColor(status) {
    switch(status) {
        case 'draft': return 'var(--text-light)';
        case 'sent': return 'var(--warning-color)';
        case 'accepted': return 'var(--success-color)';
        case 'rejected': return 'var(--error-color)';
        case 'expired': return 'var(--text-secondary)';
        default: return 'var(--text-light)';
    }
}

// Override the existing autoSave function to use Supabase
const originalAutoSave = window.autoSave;
window.autoSave = async function() {
    if (!window.isDirty) return;
    
    try {
        // Save to Supabase
        await saveQuoteToSupabase();
        
        // Call original auto-save UI updates
        if (originalAutoSave) {
            originalAutoSave();
        } else {
            // Fallback UI updates
            window.isDirty = false;
            const saveBtn = document.getElementById('floatingSaveBtn');
            saveBtn.style.background = 'var(--success-color)';
            saveBtn.style.color = 'white';
            saveBtn.innerHTML = '✅ Saved';
            
            setTimeout(() => {
                saveBtn.innerHTML = '💾 Auto-Save';
                saveBtn.style.background = 'var(--accent-color)';
            }, 2000);
        }
        
    } catch (error) {
        console.error("Auto-save failed:", error);
    }
};

// Override sendToCustomer to include Supabase saving
const originalSendToCustomer = window.sendToCustomer;
window.sendToCustomer = async function() {
    try {
        // Save to Supabase first
        await saveQuoteToSupabase();
        
        // Mark as sent
        await markQuoteAsSent();
        
        // Call original send function
        if (originalSendToCustomer) {
            originalSendToCustomer();
        }
        
    } catch (error) {
        console.error("Error sending quote:", error);
        showNotification("Error sending quote: " + error.message, 'error');
    }
};

// Load recent quotes when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Wait for the original DOM content to load first
    setTimeout(() => {
        loadRecentQuotes();
    }, 1000);
});

// Initialize a new quote by default
window.addEventListener('load', function() {
    createNewQuote();
});

console.log("🚀 Supabase Quote Builder integration loaded!");