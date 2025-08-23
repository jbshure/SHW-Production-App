// Complete JavaScript for Quote Builder
console.log('🚀 Loading Quote Builder JavaScript');

// Global variables
let autoSaveInterval;
let currentPDFData = null;
let currentPDFFilename = null;

// Utility Functions
function showNotification(message, type = 'success') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#4CAF50' : '#2196F3'};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Currency formatter
const USD = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
});

// Quote Functions
function createItemRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" name="product[]" class="form-control" placeholder="Product name" onchange="updatePreview()"></td>
        <td><input type="text" name="specs[]" class="form-control" placeholder="Specifications" onchange="updatePreview()"></td>
        <td>
            <div style="display: flex; gap: 4px; align-items: center;">
                <input type="number" name="quantity[]" class="form-control" style="width: 80px;" value="1" min="1" onchange="calculateRow(this)">
                <button type="button" onclick="openQuantityModal(this)" class="btn" style="padding: 4px 8px; font-size: .7rem; background: var(--accent-color); color: #000;" title="Add quantity variations">+</button>
            </div>
        </td>
        <td><input type="number" name="cost[]" class="form-control" step="0.01" placeholder="0.00" onchange="calculateRow(this)"></td>
        <td><input type="number" name="markup[]" class="form-control" value="50" min="0" onchange="calculateRow(this)"></td>
        <td><input type="number" name="unitPrice[]" class="form-control" step="0.01" placeholder="0.00" readonly></td>
        <td><input type="number" name="setupFee[]" class="form-control" step="0.01" value="0" onchange="calculateRow(this)"></td>
        <td><input type="number" name="total[]" class="form-control" step="0.01" placeholder="0.00" readonly></td>
        <td><button type="button" onclick="removeRow(this)" class="btn btn-danger btn-sm">×</button></td>
    `;
    return row;
}

function addRow() {
    console.log('Adding new row');
    const body = document.getElementById('itemsTableBody');
    const newRow = createItemRow();
    body.appendChild(newRow);
    updatePreview();
    showNotification('Row added', 'success');
}

function removeRow(btn) {
    const body = document.getElementById('itemsTableBody');
    if (body.rows.length > 1) {
        btn.closest('tr').remove();
        calculateTotals();
        updatePreview();
        showNotification('Row removed', 'info');
    }
}

function calculateRow(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('input[name="quantity[]"]').value) || 0;
    const cost = parseFloat(row.querySelector('input[name="cost[]"]').value) || 0;
    const markup = parseFloat(row.querySelector('input[name="markup[]"]').value) || 0;
    const setupFee = parseFloat(row.querySelector('input[name="setupFee[]"]').value) || 0;
    
    const unitPrice = cost * (1 + markup / 100);
    const total = (unitPrice * quantity) + setupFee;
    
    row.querySelector('input[name="unitPrice[]"]').value = unitPrice.toFixed(2);
    row.querySelector('input[name="total[]"]').value = total.toFixed(2);
    
    calculateTotals();
    updatePreview();
}

function calculateTotals() {
    const totals = document.querySelectorAll('input[name="total[]"]');
    let subtotal = 0;
    
    totals.forEach(input => {
        subtotal += parseFloat(input.value) || 0;
    });
    
    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    const tax = subtotal * (taxRate / 100);
    const shipping = parseFloat(document.getElementById('shippingCost').value) || 0;
    const total = subtotal + tax + shipping;
    const deposit = total * 0.5;
    
    document.getElementById('previewSubtotal').textContent = USD.format(subtotal);
    document.getElementById('previewTax').textContent = USD.format(tax);
    document.getElementById('previewShipping').textContent = USD.format(shipping);
    document.getElementById('previewTotal').textContent = USD.format(total);
    document.getElementById('previewDeposit').textContent = USD.format(deposit);
}

function updatePreview() {
    console.log('Updating preview');
    const body = document.getElementById('itemsTableBody');
    const itemsPreview = document.getElementById('itemsPreview');
    let html = '';
    
    for (let i = 0; i < body.rows.length; i++) {
        const row = body.rows[i];
        const product = row.querySelector('input[name="product[]"]').value;
        const specs = row.querySelector('input[name="specs[]"]').value;
        const quantity = row.querySelector('input[name="quantity[]"]').value;
        const unitPrice = row.querySelector('input[name="unitPrice[]"]').value;
        const total = row.querySelector('input[name="total[]"]').value;
        
        if (product.trim()) {
            html += `
                <div style="padding: 12px; margin: 8px 0; border-radius: 8px; background: var(--background-light); border: 1px solid var(--border-color);">
                    <div style="font-weight: 600; color: var(--text-primary);">${product}</div>
                    ${specs ? `<div style="font-size: 0.9rem; color: var(--text-secondary); margin: 4px 0;">${specs}</div>` : ''}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                        <span style="color: var(--text-secondary);">${quantity} units @ ${USD.format(parseFloat(unitPrice) || 0)}/unit</span>
                        <span style="font-weight: 600;">${USD.format(parseFloat(total) || 0)}</span>
                    </div>
                </div>
            `;
        }
    }
    
    itemsPreview.innerHTML = html || '<p style="color: var(--text-light); font-style: italic; text-align: center; padding: 24px;">Add items to see preview</p>';
}

// Collect quote data
function collectQuoteData() {
    const items = [];
    const itemsTable = document.getElementById('itemsTableBody');
    
    for (let i = 0; i < itemsTable.rows.length; i++) {
        const row = itemsTable.rows[i];
        const product = row.querySelector('input[name="product[]"]').value;
        const specs = row.querySelector('input[name="specs[]"]').value;
        const quantity = row.querySelector('input[name="quantity[]"]').value;
        const unitPrice = row.querySelector('input[name="unitPrice[]"]').value;
        const total = row.querySelector('input[name="total[]"]').value;
        
        if (product.trim()) {
            items.push({
                product,
                specs,
                quantity: parseInt(quantity) || 0,
                unitPrice: parseFloat(unitPrice) || 0,
                total: parseFloat(total) || 0
            });
        }
    }
    
    return {
        quoteNumber: document.getElementById('quoteNumber')?.textContent || 'QT-001',
        clientCompany: document.getElementById('clientCompany')?.value || '',
        contactName: document.getElementById('contactName')?.value || '',
        contactEmail: document.getElementById('contactEmail')?.value || '',
        contactPhone: document.getElementById('contactPhone')?.value || '',
        projectName: document.getElementById('projectName')?.value || '',
        quoteValidUntil: document.getElementById('quoteValidUntil')?.value || '',
        salesRepName: document.getElementById('salesRepName')?.value || '',
        salesRepEmail: document.getElementById('salesRepEmail')?.value || '',
        deliveryTime: document.getElementById('deliveryTime')?.value || '7-10 Business Days',
        paymentTerms: document.getElementById('paymentTerms')?.value || 'Net 30',
        specialInstructions: document.getElementById('specialInstructions')?.value || '',
        taxRate: document.getElementById('taxRate')?.value || '0',
        shippingCost: document.getElementById('shippingCost')?.value || '0',
        subtotal: document.getElementById('previewSubtotal')?.textContent || '$0.00',
        tax: document.getElementById('previewTax')?.textContent || '$0.00',
        total: document.getElementById('previewTotal')?.textContent || '$0.00',
        deposit: document.getElementById('previewDeposit')?.textContent || '$0.00',
        items: items
    };
}

// Generate printable HTML with new design
function generatePrintableQuote(data) {
    // Calculate totals from string values
    const subtotalValue = parseFloat(data.subtotal.replace(/[^0-9.-]+/g,"")) || 0;
    const taxValue = parseFloat(data.tax.replace(/[^0-9.-]+/g,"")) || 0;
    const shippingValue = parseFloat(data.shippingCost) || 0;
    const totalValue = subtotalValue + taxValue + shippingValue;
    const depositValue = totalValue * 0.5;
    
    let html = '<!DOCTYPE html><html><head><title>Quote ' + data.quoteNumber + '</title>';
    html += '<style>';
    html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
    html += 'body { font-family: "Segoe UI", Arial, sans-serif; padding: 30px; color: #333; background: white; max-width: 1000px; margin: 0 auto; }';
    html += '.header { display: flex; justify-content: space-between; align-items: flex-start; padding: 25px; background: linear-gradient(135deg, #FFF9F0 0%, #FFF5E6 100%); border-radius: 10px; border-bottom: 4px solid #E3FF33; margin-bottom: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }';
    html += '.logo-section { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }';
    html += '.quote-badge { background: #000; color: #E3FF33; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; margin-top: 8px; display: inline-block; }';
    html += '.quote-info { text-align: right; }';
    html += '.quote-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; }';
    html += '.quote-value { font-size: 18px; font-weight: bold; color: #000; margin-bottom: 8px; }';
    html += '.date-info { font-size: 12px; color: #666; line-height: 1.6; }';
    html += '.client-section { margin-bottom: 25px; background: #FFF9F0; padding: 20px; border-radius: 8px; box-shadow: 0 1px 5px rgba(0,0,0,0.05); }';
    html += '.section { margin-bottom: 30px; }';
    html += '.section-title { font-size: 18px; font-weight: 700; margin-bottom: 15px; color: #000; border-bottom: 2px solid #E3FF33; padding-bottom: 8px; display: inline-block; }';
    html += '.client-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; font-size: 13px; }';
    html += '.client-item { background: white; padding: 12px; border-radius: 6px; }';
    html += '.label { font-weight: 600; color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }';
    html += '.value { color: #000; font-size: 14px; margin-top: 4px; font-weight: 500; }';
    html += '.items-table { width: 100%; border-collapse: separate; border-spacing: 0; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 5px rgba(0,0,0,0.1); }';
    html += '.items-table th { background: linear-gradient(135deg, #000 0%, #222 100%); color: #E3FF33; padding: 14px; text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }';
    html += '.items-table td { padding: 14px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }';
    html += '.items-table tr:last-child td { border-bottom: none; }';
    html += '.product-code { font-weight: bold; color: #000; font-size: 14px; }';
    html += '.product-desc { line-height: 1.5; }';
    html += '.product-specs { font-size: 11px; color: #666; margin-top: 4px; font-style: italic; }';
    html += '.price { font-weight: 600; color: #000; }';
    html += '.line-total { font-weight: bold; color: #000; font-size: 14px; }';
    html += '.totals-section { margin-top: 30px; display: flex; justify-content: flex-end; }';
    html += '.totals-box { background: linear-gradient(135deg, #FFF9F0 0%, #FFF5E6 100%); padding: 25px; border-radius: 10px; width: 350px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }';
    html += '.total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }';
    html += '.total-row.subtotal { border-bottom: 1px solid #E0E0E0; padding-bottom: 12px; margin-bottom: 8px; }';
    html += '.total-row.grand-total { border-top: 3px solid #E3FF33; padding-top: 12px; margin-top: 12px; font-size: 18px; font-weight: bold; background: #000; color: #E3FF33; padding: 15px; margin: 12px -25px -25px; border-radius: 0 0 10px 10px; }';
    html += '.total-row.deposit { background: #FFF; padding: 10px; margin: 12px -10px 0; border-radius: 6px; border: 2px solid #E3FF33; }';
    html += '.total-label { color: #666; }';
    html += '.total-value { font-weight: 600; color: #000; }';
    html += '.grand-total .total-label, .grand-total .total-value { color: #E3FF33; }';
    html += '.deposit .total-label { color: #000; font-weight: 600; }';
    html += '.deposit .total-value { color: #000; font-weight: bold; }';
    html += '.terms-section { background: #F8F8F8; padding: 20px; border-radius: 8px; margin-top: 30px; }';
    html += '.terms-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px; }';
    html += '.term-item { font-size: 13px; }';
    html += '.term-label { font-weight: 600; color: #000; margin-bottom: 4px; }';
    html += '.term-value { color: #333; }';
    html += '.disclaimer { margin-top: 20px; padding: 15px; background: #FFF; border-left: 4px solid #E3FF33; font-size: 11px; color: #666; line-height: 1.6; border-radius: 4px; }';
    html += '.footer { margin-top: 40px; text-align: center; padding: 20px; border-top: 2px solid #E0E0E0; }';
    html += '.footer-company { font-size: 16px; font-weight: bold; margin-bottom: 8px; }';
    html += '.footer-contact { font-size: 12px; color: #666; line-height: 1.6; }';
    html += '@media print { body { margin: 0; padding: 20px; } .header, .client-section, .totals-box { break-inside: avoid; } }';
    html += '</style></head><body>';
    
    // Header
    html += '<div class="header">';
    html += '<div class="logo-section">';
    // Add logo image - using absolute URL
    html += '<img src="https://shureprint-quote-builder.web.app/Shureprint%20V3%20-%20small.png" style="height: 40px; margin-bottom: 8px; display: block;" alt="ShurePrint Logo" onerror="this.style.display=\'none\'">';
    html += '<div class="quote-badge">#' + data.quoteNumber + '</div>';
    html += '</div>';
    html += '<div class="quote-info">';
    html += '<div class="quote-label">Quote Date</div>';
    html += '<div class="quote-value">' + new Date().toLocaleDateString() + '</div>';
    html += '<div class="date-info">';
    html += 'Valid Until: ' + (data.quoteValidUntil ? new Date(data.quoteValidUntil).toLocaleDateString() : 'Not specified') + '<br>';
    html += 'Reference: ' + data.quoteNumber;
    html += '</div></div></div>';
    
    // Client Information
    html += '<div class="client-section">';
    html += '<div class="section-title">Client Information</div>';
    html += '<div class="client-grid">';
    html += '<div class="client-item"><div class="label">Company</div><div class="value">' + (data.clientCompany || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Contact</div><div class="value">' + (data.contactName || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Phone</div><div class="value">' + (data.contactPhone || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Email</div><div class="value">' + (data.contactEmail || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Project</div><div class="value">' + (data.projectName || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Sales Rep</div><div class="value">' + (data.salesRepName || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Rep Email</div><div class="value">' + (data.salesRepEmail || 'Not specified') + '</div></div>';
    html += '<div class="client-item"><div class="label">Delivery</div><div class="value">' + (data.deliveryTime || '7-10 Business Days') + '</div></div>';
    html += '</div></div>';
    
    // Quote Details Table
    html += '<div class="section">';
    html += '<div class="section-title">Quote Details</div>';
    html += '<table class="items-table">';
    html += '<thead><tr>';
    html += '<th style="width: 15%">Product Code</th>';
    html += '<th style="width: 35%">Description / Specifications</th>';
    html += '<th style="width: 20%">Quantity</th>';
    html += '<th style="width: 15%">Unit Price</th>';
    html += '<th style="width: 15%">Line Total</th>';
    html += '</tr></thead><tbody>';
    
    // Add items
    data.items.forEach(function(item) {
        const pcsPerCase = 50;
        const cases = Math.ceil(item.quantity / pcsPerCase);
        const productCode = item.product.split(' ')[0] || 'ITEM';
        
        html += '<tr>';
        html += '<td><span class="product-code">' + productCode + '</span></td>';
        html += '<td><div class="product-desc">' + item.product + '</div>';
        if (item.specs) {
            html += '<div class="product-specs">' + item.specs + '</div>';
        }
        html += '</td>';
        html += '<td>' + item.quantity + ' units</td>';
        html += '<td><span class="price">$' + item.unitPrice.toFixed(2) + '</span></td>';
        html += '<td><span class="line-total">$' + item.total.toFixed(2) + '</span></td>';
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    
    // Terms & Conditions Section
    html += '<div class="section" style="margin-top: 30px;">';
    html += '<div class="section-title">Terms & Conditions</div>';
    html += '<div style="background: #F8F8F8; padding: 20px; border-radius: 8px;">';
    html += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">';
    html += '<div><strong style="color: #000;">Delivery Time:</strong> ' + (data.deliveryTime || '7-10 Business Days') + '</div>';
    html += '<div><strong style="color: #000;">Payment Terms:</strong> ' + (data.paymentTerms || 'Net 30') + '</div>';
    if (data.specialInstructions) {
        html += '<div style="grid-column: span 2;"><strong style="color: #000;">Special Instructions:</strong> ' + data.specialInstructions + '</div>';
    }
    html += '</div>';
    html += '<div style="padding: 15px; background: #FFF; border-left: 4px solid #E3FF33; font-size: 11px; color: #666; line-height: 1.6; border-radius: 4px;">';
    html += '<strong>Important Notice:</strong> This quote is valid until the specified date above. ';
    html += 'Prices are subject to change without notice and may vary based on final artwork complexity, ';
    html += 'production requirements, and material availability. A 50% deposit is required to begin production. ';
    html += 'Final invoice will reflect actual quantities produced and any approved changes.';
    html += '</div></div></div>';
    
    // Footer
    html += '<div class="footer">';
    html += '<div class="footer-company">SHUREPRINT</div>';
    html += '<div class="footer-contact">';
    html += 'Phone: (555) 123-4567 | Email: quotes@shureprint.com<br>';
    html += 'www.shureprint.com';
    html += '</div></div>';
    
    html += '</body></html>';
    return html;
}

// Generate customer approval interface preview
function generateCustomerApprovalInterface(data) {
    let html = '<!DOCTYPE html><html><head><title>Quote Approval - ShurePrint</title>';
    html += '<meta name="viewport" content="width=device-width, initial-scale=1">';
    html += '<style>';
    html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
    html += 'body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8f9fa; min-height: 100vh; }';
    html += '.header { background: white; border-bottom: 1px solid #e0e0e0; padding: 20px 0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }';
    html += '.header-content { max-width: 1200px; margin: 0 auto; padding: 0 20px; display: flex; justify-content: space-between; align-items: center; }';
    html += '.logo { height: 40px; }';
    html += '.status-badge { background: #ffc107; color: #000; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }';
    html += '.container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }';
    html += '.welcome-card { background: white; border-radius: 12px; padding: 40px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }';
    html += '.welcome-title { font-size: 32px; font-weight: 700; color: #000; margin-bottom: 15px; }';
    html += '.welcome-subtitle { font-size: 18px; color: #666; line-height: 1.6; }';
    html += '.quote-details { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }';
    html += '.detail-card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }';
    html += '.detail-title { font-size: 14px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; font-weight: 600; }';
    html += '.items-list { background: white; border-radius: 12px; padding: 30px; margin-bottom: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }';
    html += '.item { padding: 20px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }';
    html += '.item:last-child { border-bottom: none; }';
    html += '.item-info h3 { font-size: 18px; font-weight: 600; color: #000; margin-bottom: 5px; }';
    html += '.item-info p { font-size: 14px; color: #666; }';
    html += '.item-price { text-align: right; }';
    html += '.item-qty { font-size: 14px; color: #666; }';
    html += '.item-total { font-size: 20px; font-weight: 700; color: #000; }';
    html += '.totals-section { background: linear-gradient(135deg, #FFF9F0 0%, #FFF5E6 100%); border-radius: 12px; padding: 30px; margin-bottom: 30px; }';
    html += '.total-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; }';
    html += '.total-row.grand { font-size: 24px; font-weight: 700; padding-top: 20px; border-top: 2px solid #E3FF33; margin-top: 10px; }';
    html += '.approval-section { background: white; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }';
    html += '.approval-title { font-size: 24px; font-weight: 700; margin-bottom: 20px; }';
    html += '.button-group { display: flex; gap: 20px; justify-content: center; margin-top: 30px; }';
    html += '.btn { padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; border: none; cursor: pointer; transition: all 0.3s; }';
    html += '.btn-approve { background: #28a745; color: white; }';
    html += '.btn-approve:hover { background: #218838; transform: translateY(-2px); }';
    html += '.btn-request { background: #ffc107; color: #000; }';
    html += '.btn-request:hover { background: #e0a800; transform: translateY(-2px); }';
    html += '.btn-decline { background: #dc3545; color: white; }';
    html += '.btn-decline:hover { background: #c82333; transform: translateY(-2px); }';
    html += '.payment-options { margin-top: 30px; padding-top: 30px; border-top: 1px solid #e0e0e0; }';
    html += '.payment-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; }';
    html += '.payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }';
    html += '.payment-card { border: 2px solid #e0e0e0; border-radius: 8px; padding: 20px; cursor: pointer; transition: all 0.3s; }';
    html += '.payment-card:hover { border-color: #E3FF33; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }';
    html += '.payment-card h4 { font-size: 16px; margin-bottom: 10px; }';
    html += '.payment-card p { font-size: 14px; color: #666; }';
    html += '</style></head><body>';
    
    // Header
    html += '<div class="header">';
    html += '<div class="header-content">';
    html += '<img src="https://shureprint-quote-builder.web.app/Shureprint%20V3%20-%20small.png" class="logo" alt="ShurePrint">';
    html += '<span class="status-badge">Pending Approval</span>';
    html += '</div></div>';
    
    html += '<div class="container">';
    
    // Welcome Card
    html += '<div class="welcome-card">';
    html += '<h1 class="welcome-title">Hi ' + (data.contactName || 'there') + ', your quote is ready!</h1>';
    html += '<p class="welcome-subtitle">We\'ve prepared a custom quote for ' + (data.clientCompany || 'your company') + '. Please review the details below and let us know how you\'d like to proceed.</p>';
    html += '</div>';
    
    // Quote Details Grid
    html += '<div class="quote-details">';
    html += '<div class="detail-card">';
    html += '<div class="detail-title">Quote Information</div>';
    html += '<p><strong>Quote #:</strong> ' + data.quoteNumber + '</p>';
    html += '<p><strong>Date:</strong> ' + new Date().toLocaleDateString() + '</p>';
    html += '<p><strong>Valid Until:</strong> ' + (data.quoteValidUntil ? new Date(data.quoteValidUntil).toLocaleDateString() : '30 days') + '</p>';
    html += '<p><strong>Project:</strong> ' + (data.projectName || 'Your Project') + '</p>';
    html += '</div>';
    html += '<div class="detail-card">';
    html += '<div class="detail-title">Your Sales Representative</div>';
    html += '<p><strong>Name:</strong> ' + (data.salesRepName || 'ShurePrint Team') + '</p>';
    html += '<p><strong>Email:</strong> ' + (data.salesRepEmail || 'quotes@shureprint.com') + '</p>';
    html += '<p><strong>Phone:</strong> (555) 123-4567</p>';
    html += '<p><strong>Delivery:</strong> ' + (data.deliveryTime || '7-10 Business Days') + '</p>';
    html += '</div></div>';
    
    // Items List
    if (data.items && data.items.length > 0) {
        html += '<div class="items-list">';
        html += '<div class="detail-title">Quote Items</div>';
        
        // Calculate totals
        let subtotal = 0;
        data.items.forEach(item => {
            subtotal += item.total || 0;
            html += '<div class="item">';
            html += '<div class="item-info">';
            html += '<h3>' + item.product + '</h3>';
            if (item.specs) {
                html += '<p>' + item.specs + '</p>';
            }
            html += '</div>';
            html += '<div class="item-price">';
            html += '<div class="item-qty">' + item.quantity + ' units @ $' + (item.unitPrice || 0).toFixed(2) + '/ea</div>';
            html += '<div class="item-total">$' + (item.total || 0).toFixed(2) + '</div>';
            html += '</div></div>';
        });
        
        html += '</div>';
        
        // Totals Section
        const taxRate = parseFloat(data.taxRate) || 0;
        const tax = subtotal * (taxRate / 100);
        const shipping = parseFloat(data.shippingCost) || 0;
        const total = subtotal + tax + shipping;
        
        html += '<div class="totals-section">';
        html += '<div class="total-row"><span>Subtotal:</span><span>$' + subtotal.toFixed(2) + '</span></div>';
        if (taxRate > 0) {
            html += '<div class="total-row"><span>Tax (' + taxRate + '%):</span><span>$' + tax.toFixed(2) + '</span></div>';
        }
        if (shipping > 0) {
            html += '<div class="total-row"><span>Shipping:</span><span>$' + shipping.toFixed(2) + '</span></div>';
        }
        html += '<div class="total-row grand"><span>Total:</span><span>$' + total.toFixed(2) + '</span></div>';
        html += '</div>';
    }
    
    // Approval Section
    html += '<div class="approval-section">';
    html += '<h2 class="approval-title">Ready to proceed with this quote?</h2>';
    html += '<p style="color: #666; margin-bottom: 20px;">Choose how you\'d like to move forward with your order.</p>';
    
    html += '<div class="button-group">';
    html += '<button class="btn btn-approve" onclick="alert(\'Approve functionality would redirect to payment\')">✓ Approve & Pay</button>';
    html += '<button class="btn btn-request" onclick="alert(\'Request changes would open a form\')">Request Changes</button>';
    html += '<button class="btn btn-decline" onclick="alert(\'Decline would notify sales rep\')">Decline Quote</button>';
    html += '</div>';
    
    html += '<div class="payment-options">';
    html += '<h3 class="payment-title">Payment Options Available:</h3>';
    html += '<div class="payment-grid">';
    html += '<div class="payment-card">';
    html += '<h4>💳 Pay Now</h4>';
    html += '<p>Pay the full amount or 50% deposit immediately via credit card</p>';
    html += '</div>';
    html += '<div class="payment-card">';
    html += '<h4>📧 Delegate Payment</h4>';
    html += '<p>Send payment request to your accounting or finance team</p>';
    html += '</div>';
    html += '</div></div>';
    
    html += '</div>'; // approval-section
    html += '</div>'; // container
    
    html += '</body></html>';
    
    return html;
}

// Preview Quote - shows the actual customer approval interface
function previewQuote() {
    try {
        console.log('Opening customer approval interface preview');
        const quoteData = collectQuoteData();
        
        // Encode the quote data as a URL parameter for the review/builder endpoint
        const encodedData = encodeURIComponent(JSON.stringify({
            projectName: quoteData.projectName || 'Quote Preview',
            quoteNumber: quoteData.quoteNumber || 'PREVIEW-' + Date.now(),
            clientInfo: quoteData.clientInfo,
            items: quoteData.items || []
        }));
        
        // Use the builder review endpoint which doesn't require authentication
        const previewUrl = `/quote/review/builder?data=${encodedData}`;
        
        const previewWindow = window.open(previewUrl, '_blank', 'width=1200,height=900,scrollbars=yes');
        
        if (!previewWindow) {
            showNotification('Please allow popups to preview the customer interface', 'error');
            return;
        }
        
        showNotification('Opening customer approval interface - this is what customers see', 'info');
    } catch (error) {
        console.error('Preview error:', error);
        showNotification('Error opening preview: ' + error.message, 'error');
    }
}

// Generate PDF (using browser print dialog)
function generatePDF() {
    try {
        console.log('Opening print dialog for PDF');
        const quoteData = collectQuoteData();
        const printContent = generatePrintableQuote(quoteData);
        const printWindow = window.open('', '_blank', 'width=850,height=1100');
        
        if (!printWindow) {
            showNotification('Please allow popups to generate PDF', 'error');
            return;
        }
        
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
                showNotification('Use "Save as PDF" in the print dialog to save your quote', 'success');
            }, 250);
        };
    } catch (error) {
        console.error('PDF generation error:', error);
        showNotification('Error generating PDF: ' + error.message, 'error');
    }
}

// Send quote to customer via email
function sendToCustomer() {
    try {
        const quoteData = collectQuoteData();
        
        // Validate required fields
        if (!quoteData.clientInfo?.email) {
            showNotification('Please enter customer email address', 'error');
            return;
        }
        
        if (!quoteData.quoteNumber) {
            showNotification('Please enter a quote number', 'error');
            return;
        }
        
        // Show sending notification
        showNotification('Sending quote to customer...', 'info');
        
        // Prepare email data
        const emailData = {
            to: quoteData.clientInfo.email,
            customerName: quoteData.clientInfo.contact || 'Valued Customer',
            quoteNumber: quoteData.quoteNumber,
            projectName: quoteData.projectName || 'Your Quote',
            salesRepName: quoteData.salesRep || 'ShurePrint Team',
            quoteLink: window.location.origin + '/quote-viewer.html?id=' + quoteData.quoteNumber,
            quoteData: quoteData
        };
        
        // Send email via API
        fetch('/api/send-quote-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to send email');
            }
            return response.json();
        })
        .then(data => {
            // Show success confirmation with details
            const confirmationHTML = `
                <div style="text-align: left;">
                    <h3 style="color: #28a745; margin: 0 0 10px 0;">✅ Quote Sent Successfully!</h3>
                    <p style="margin: 5px 0;"><strong>To:</strong> ${quoteData.clientInfo.email}</p>
                    <p style="margin: 5px 0;"><strong>Quote:</strong> ${quoteData.quoteNumber}</p>
                    <p style="margin: 5px 0;"><strong>Contact:</strong> ${quoteData.clientInfo.contact || 'Customer'}</p>
                    <p style="margin: 10px 0 0 0; color: #666;">The customer will receive an email with a secure link to review and approve the quote.</p>
                </div>
            `;
            
            // Show success modal
            showDetailedNotification(confirmationHTML, 'success');
            
            // Also log to console
            console.log('Quote email sent:', data);
        })
        .catch(error => {
            console.error('Error sending email:', error);
            showNotification('Failed to send email. Please check the customer email and try again.', 'error');
        });
        
    } catch (error) {
        console.error('Error in sendToCustomer:', error);
        showNotification('Error preparing email: ' + error.message, 'error');
    }
}

// Show detailed notification (enhanced version)
function showDetailedNotification(htmlContent, type = 'info') {
    // Remove any existing notification
    const existingNotification = document.querySelector('.detailed-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'detailed-notification';
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 10000;
        max-width: 450px;
        width: 90%;
        border-left: 5px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    `;
    
    // Add close button
    notification.innerHTML = `
        ${htmlContent}
        <button onclick="this.parentElement.remove()" style="
            margin-top: 20px;
            padding: 10px 20px;
            background: ${type === 'success' ? '#28a745' : '#007bff'};
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            width: 100%;
        ">OK</button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 10000);
}

function showPaymentOptions(type) {
    showNotification(`${type} payment functionality coming soon`, 'info');
}

function toggleProductModal() {
    showNotification('Product modal functionality coming soon', 'info');
}

function testAirtableConnection() {
    showNotification('Airtable connection test coming soon', 'info');
}

// Quantity Modal Functions
let currentQuantityRow = null;

function openQuantityModal(btn) {
    console.log('Opening quantity modal');
    currentQuantityRow = btn.closest('tr');
    const modal = document.getElementById('quantityModal');
    const variationsDiv = document.getElementById('quantityVariations');
    
    // Clear previous variations
    variationsDiv.innerHTML = '';
    
    // Check if this row already has variations
    const quantityInput = currentQuantityRow.querySelector('input[name="quantity[]"]');
    const existingVariations = quantityInput.dataset.variations;
    
    if (existingVariations) {
        try {
            const variations = JSON.parse(existingVariations);
            variations.forEach(v => {
                addQuantityVariationRow(v.quantity, v.unitPrice, v.total);
            });
        } catch (e) {
            console.error('Error parsing variations:', e);
        }
    } else {
        // Add default variation row
        addQuantityVariationRow();
    }
    
    modal.style.display = 'block';
}

function closeQuantityModal() {
    document.getElementById('quantityModal').style.display = 'none';
    currentQuantityRow = null;
}

function addQuantityVariation() {
    addQuantityVariationRow();
}

function addQuantityVariationRow(qty = '', price = '', total = '') {
    const variationsDiv = document.getElementById('quantityVariations');
    const variationDiv = document.createElement('div');
    variationDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
    
    variationDiv.innerHTML = `
        <input type="number" placeholder="Quantity" value="${qty}" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" class="var-qty">
        <input type="number" step="0.01" placeholder="Unit Price" value="${price}" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" class="var-price">
        <input type="number" step="0.01" placeholder="Total" value="${total}" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" class="var-total" readonly>
        <button onclick="this.parentElement.remove()" style="padding: 8px 12px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer;">×</button>
    `;
    
    // Add event listeners for calculation
    const qtyInput = variationDiv.querySelector('.var-qty');
    const priceInput = variationDiv.querySelector('.var-price');
    const totalInput = variationDiv.querySelector('.var-total');
    
    function calcVariation() {
        const q = parseFloat(qtyInput.value) || 0;
        const p = parseFloat(priceInput.value) || 0;
        totalInput.value = (q * p).toFixed(2);
    }
    
    qtyInput.addEventListener('input', calcVariation);
    priceInput.addEventListener('input', calcVariation);
    
    variationsDiv.appendChild(variationDiv);
}

function saveQuantityVariations() {
    if (!currentQuantityRow) return;
    
    const variations = [];
    const variationRows = document.querySelectorAll('#quantityVariations > div');
    
    variationRows.forEach(row => {
        const qty = parseFloat(row.querySelector('.var-qty').value) || 0;
        const price = parseFloat(row.querySelector('.var-price').value) || 0;
        const total = parseFloat(row.querySelector('.var-total').value) || 0;
        
        if (qty > 0) {
            variations.push({
                quantity: qty,
                unitPrice: price,
                total: total
            });
        }
    });
    
    // Store variations on the quantity input
    const quantityInput = currentQuantityRow.querySelector('input[name="quantity[]"]');
    
    if (variations.length > 0) {
        quantityInput.dataset.variations = JSON.stringify(variations);
        // Update the main quantity with the first variation
        quantityInput.value = variations[0].quantity;
        currentQuantityRow.querySelector('input[name="unitPrice[]"]').value = variations[0].unitPrice;
        currentQuantityRow.querySelector('input[name="total[]"]').value = variations[0].total;
    }
    
    updatePreview();
    closeQuantityModal();
    showNotification('Quantity variations saved', 'success');
}

function updateProgress() {
    console.log('Progress updated');
}

function markDirty() {
    console.log('Form marked as dirty');
}

function autoSave() {
    console.log('Auto-saving...');
}

function initializeProductCatalog() {
    console.log('Product catalog initialized');
}

// Initialize on page load
window.addEventListener('load', function() {
    console.log('Page loaded, initializing...');
    
    // Add initial row
    const body = document.getElementById('itemsTableBody');
    if (body && body.rows.length === 0) {
        addRow();
    }
    
    // Initial calculations
    calculateTotals();
    updatePreview();
    
    console.log('✅ Quote Builder initialized successfully');
});

console.log('✅ All JavaScript loaded successfully');