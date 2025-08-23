// Order Tracking Management System - Simplified Version
// Works with localStorage for now, Firebase ready

let selectedOrder = null;
let orders = [];

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeOrderTracking();
    setupEventListeners();
});

function initializeOrderTracking() {
    // Load from localStorage first
    loadOrdersFromStorage();
    
    // Try to sync with B2B site if available
    syncWithB2BStore();
    
    updateStats();
}

function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchOrders');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterOrders(e.target.value);
        });
    }
}

// Load orders from localStorage
function loadOrdersFromStorage() {
    try {
        const storedOrders = localStorage.getItem('orders');
        if (storedOrders) {
            orders = JSON.parse(storedOrders);
            displayOrders(orders);
        } else {
            // Load sample data
            loadSampleOrders();
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        loadSampleOrders();
    }
}

// Load sample orders for demo
function loadSampleOrders() {
    orders = [
        {
            id: '1',
            orderId: 'ORD-2025-001',
            productName: 'Custom Branded T-Shirts',
            quantity: 250,
            sku: 'TSH-CUS-001',
            status: 'in_production',
            customerEmail: 'client@example.com',
            transportMode: 'third_party',
            createdAt: new Date('2025-01-10'),
            estimatedDelivery: new Date('2025-01-25')
        },
        {
            id: '2',
            orderId: 'ORD-2025-002',
            productName: 'Corporate Gift Boxes',
            quantity: 100,
            sku: 'GFT-BOX-002',
            status: 'shipping',
            customerEmail: 'buyer@company.com',
            transportMode: 'in_house',
            carrier: 'Local Delivery',
            driverName: 'John Smith',
            driverPhone: '555-0123',
            createdAt: new Date('2025-01-12'),
            estimatedDelivery: new Date('2025-01-18')
        },
        {
            id: '3',
            orderId: 'ORD-2025-003',
            productName: 'Premium Silverware Set (Dropship)',
            quantity: 50,
            sku: 'SLV-SET-003',
            status: 'shipping',
            customerEmail: 'purchasing@business.com',
            transportMode: 'third_party',
            carrier: 'FedEx',
            trackingNumber: '774489991234567',
            createdAt: new Date('2025-01-14'),
            estimatedDelivery: new Date('2025-01-20')
        }
    ];
    
    localStorage.setItem('orders', JSON.stringify(orders));
    displayOrders(orders);
}

// Sync with B2B store
async function syncWithB2BStore() {
    try {
        const response = await fetch('https://my-b2b-store-shureprint.vercel.app/api/orders', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const b2bOrders = await response.json();
            
            // Merge with local orders
            b2bOrders.forEach(b2bOrder => {
                const exists = orders.find(o => o.orderId === b2bOrder.orderId);
                if (!exists) {
                    orders.push(b2bOrder);
                } else {
                    // Update existing order
                    Object.assign(exists, b2bOrder);
                }
            });
            
            localStorage.setItem('orders', JSON.stringify(orders));
            displayOrders(orders);
            updateStats();
        }
    } catch (error) {
        console.log('Could not sync with B2B store:', error);
        // Not critical - continue with local data
    }
}

// Display orders in the list
function displayOrders(ordersToShow) {
    const ordersList = document.getElementById('ordersList');
    if (!ordersList) return;
    
    if (ordersToShow.length === 0) {
        ordersList.innerHTML = '<p class="text-muted text-center p-3">No orders found</p>';
        return;
    }
    
    ordersList.innerHTML = ordersToShow.map(order => `
        <div class="order-card ${selectedOrder?.id === order.id ? 'selected' : ''}" 
             onclick="selectOrder('${order.id}')">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1">${order.productName || 'Unnamed Product'}</h6>
                    <small class="text-muted">Order #${order.orderId}</small>
                    <div class="mt-1">
                        <small>${order.quantity || 1} units</small>
                        ${order.sku ? `<small class="ms-2">SKU: ${order.sku}</small>` : ''}
                    </div>
                </div>
                <span class="status-badge status-${order.status || 'pending'}">
                    ${getStatusIcon(order.status)} ${formatStatus(order.status || 'pending')}
                </span>
            </div>
            ${order.trackingNumber ? `
                <div class="mt-2">
                    <small class="text-muted">
                        <i class="bi bi-box-seam"></i> ${order.carrier || 'Carrier'}: ${order.trackingNumber}
                    </small>
                </div>
            ` : ''}
            ${order.estimatedDelivery ? `
                <div class="mt-1">
                    <small class="text-muted">
                        <i class="bi bi-calendar-check"></i> ETA: ${formatDate(order.estimatedDelivery)}
                    </small>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Select an order for editing
function selectOrder(orderId) {
    selectedOrder = orders.find(o => o.id === orderId);
    
    // Update visual selection
    document.querySelectorAll('.order-card').forEach(card => {
        card.classList.remove('selected');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('selected');
    }
    
    // Display update form
    displayUpdateForm();
    
    // Display timeline
    displayOrderTimeline();
}

// Display the update form for selected order
function displayUpdateForm() {
    const formContainer = document.getElementById('orderUpdateForm');
    if (!formContainer || !selectedOrder) return;
    
    formContainer.innerHTML = `
        <form onsubmit="updateOrder(event)">
            <div class="mb-3">
                <strong>${selectedOrder.productName || 'Unnamed Product'}</strong><br>
                <small class="text-muted">Order #${selectedOrder.orderId}</small>
            </div>
            
            <div class="mb-3">
                <label class="form-label">Status</label>
                <select class="form-control" id="updateStatus" value="${selectedOrder.status || 'pending'}">
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="sampling">Sampling</option>
                    <option value="in_production">In Production</option>
                    <option value="finishing">Finishing</option>
                    <option value="quality_check">Quality Check</option>
                    <option value="shipping">Shipping</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="canceled">Canceled</option>
                </select>
            </div>
            
            <div class="mb-3">
                <label class="form-label">Tracking Information</label>
                <div class="tracking-input">
                    <input type="text" class="form-control mb-2" 
                           id="updateCarrier" placeholder="Carrier (e.g., FedEx, UPS)"
                           value="${selectedOrder.carrier || ''}">
                    <input type="text" class="form-control" 
                           id="updateTracking" placeholder="Tracking Number"
                           value="${selectedOrder.trackingNumber || ''}">
                </div>
            </div>
            
            <div class="mb-3">
                <label class="form-label">Add Milestone</label>
                <input type="text" class="form-control mb-2" 
                       id="milestoneName" placeholder="Milestone name (e.g., 'Samples Approved')">
                <textarea class="form-control" id="milestoneNote" 
                          rows="2" placeholder="Notes (optional)"></textarea>
            </div>
            
            <div class="mb-3">
                <label class="form-label">Estimated Delivery</label>
                <input type="datetime-local" class="form-control" 
                       id="updateETA" value="${formatDateForInput(selectedOrder.estimatedDelivery)}">
            </div>
            
            ${selectedOrder.transportMode === 'in_house' ? `
                <div class="mb-3">
                    <label class="form-label">Local Delivery Details</label>
                    <input type="text" class="form-control mb-2" 
                           id="driverName" placeholder="Driver Name"
                           value="${selectedOrder.driverName || ''}">
                    <input type="tel" class="form-control mb-2" 
                           id="driverPhone" placeholder="Driver Phone"
                           value="${selectedOrder.driverPhone || ''}">
                    <input type="text" class="form-control" 
                           id="vehicleId" placeholder="Vehicle ID"
                           value="${selectedOrder.vehicleId || ''}">
                </div>
            ` : ''}
            
            <button type="submit" class="btn btn-primary w-100">
                <i class="bi bi-check-circle"></i> Update Order
            </button>
        </form>
    `;
    
    // Set current status value
    const statusSelect = document.getElementById('updateStatus');
    if (statusSelect) {
        statusSelect.value = selectedOrder.status || 'pending';
    }
}

// Update order
function updateOrder(event) {
    event.preventDefault();
    
    if (!selectedOrder) return;
    
    // Update order data
    selectedOrder.status = document.getElementById('updateStatus').value;
    selectedOrder.carrier = document.getElementById('updateCarrier').value;
    selectedOrder.trackingNumber = document.getElementById('updateTracking').value;
    selectedOrder.estimatedDelivery = document.getElementById('updateETA').value ? 
        new Date(document.getElementById('updateETA').value) : null;
    selectedOrder.updatedAt = new Date();
    
    // Add local delivery info if applicable
    if (selectedOrder.transportMode === 'in_house') {
        selectedOrder.driverName = document.getElementById('driverName').value;
        selectedOrder.driverPhone = document.getElementById('driverPhone').value;
        selectedOrder.vehicleId = document.getElementById('vehicleId').value;
    }
    
    // Add milestone if provided
    const milestoneName = document.getElementById('milestoneName').value;
    if (milestoneName) {
        if (!selectedOrder.milestones) {
            selectedOrder.milestones = [];
        }
        selectedOrder.milestones.push({
            name: milestoneName,
            note: document.getElementById('milestoneNote').value,
            timestamp: new Date()
        });
    }
    
    // Save to localStorage
    localStorage.setItem('orders', JSON.stringify(orders));
    
    // Try to sync with B2B store
    syncOrderUpdate(selectedOrder);
    
    showNotification('Order updated successfully', 'success');
    displayOrders(orders);
    updateStats();
    displayOrderTimeline();
}

// Sync order update with B2B store
async function syncOrderUpdate(order) {
    try {
        await fetch('https://my-b2b-store-shureprint.vercel.app/api/admin/milestone', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer admin123'
            },
            body: JSON.stringify({
                orderId: order.orderId,
                stage: order.status,
                trackingNumber: order.trackingNumber,
                carrier: order.carrier,
                eta: order.estimatedDelivery
            })
        });
    } catch (error) {
        console.log('Could not sync with B2B store:', error);
        // Not critical - update is saved locally
    }
}

// Display order timeline
function displayOrderTimeline() {
    const timelineContainer = document.getElementById('orderTimeline');
    if (!timelineContainer || !selectedOrder) return;
    
    const milestones = selectedOrder.milestones || [];
    const events = [];
    
    // Add status change events
    if (selectedOrder.createdAt) {
        events.push({
            name: 'Order Created',
            timestamp: selectedOrder.createdAt
        });
    }
    
    if (selectedOrder.status === 'confirmed') {
        events.push({
            name: 'Order Confirmed',
            timestamp: selectedOrder.updatedAt || new Date()
        });
    }
    
    if (selectedOrder.trackingNumber) {
        events.push({
            name: 'Tracking Added',
            note: `${selectedOrder.carrier}: ${selectedOrder.trackingNumber}`,
            timestamp: selectedOrder.updatedAt || new Date()
        });
    }
    
    // Combine and sort all timeline items
    const timelineItems = [...milestones, ...events].sort((a, b) => {
        const timeA = new Date(a.timestamp);
        const timeB = new Date(b.timestamp);
        return timeB - timeA;
    });
    
    if (timelineItems.length === 0) {
        timelineContainer.innerHTML = '<p class="text-muted text-center">No timeline events yet</p>';
    } else {
        timelineContainer.innerHTML = `
            <div class="timeline">
                ${timelineItems.map(item => `
                    <div class="timeline-item">
                        <strong>${item.name || 'Event'}</strong>
                        ${item.note ? `<p class="mb-1">${item.note}</p>` : ''}
                        <small class="text-muted">
                            ${formatDate(item.timestamp)}
                        </small>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

// Add new order
function addNewOrder() {
    const modal = bootstrap.Modal.getInstance(document.getElementById('addOrderModal'));
    
    const newOrder = {
        id: Date.now().toString(),
        orderId: document.getElementById('newOrderId').value,
        customerEmail: document.getElementById('newCustomerEmail').value,
        productName: document.getElementById('newProductName').value,
        quantity: parseInt(document.getElementById('newQuantity').value),
        sku: document.getElementById('newSku').value,
        transportMode: document.getElementById('newTransportMode').value,
        specialInstructions: document.getElementById('newSpecialInstructions').value,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    orders.unshift(newOrder);
    localStorage.setItem('orders', JSON.stringify(orders));
    
    showNotification('Order added successfully', 'success');
    modal.hide();
    document.getElementById('addOrderForm').reset();
    displayOrders(orders);
    updateStats();
}

// Show add order modal
function showAddOrderModal() {
    const modal = new bootstrap.Modal(document.getElementById('addOrderModal'));
    modal.show();
}

// Filter orders based on search
function filterOrders(searchTerm) {
    if (!searchTerm) {
        displayOrders(orders);
        return;
    }
    
    const filtered = orders.filter(order => {
        const search = searchTerm.toLowerCase();
        return (
            order.orderId?.toLowerCase().includes(search) ||
            order.productName?.toLowerCase().includes(search) ||
            order.customerEmail?.toLowerCase().includes(search) ||
            order.sku?.toLowerCase().includes(search) ||
            order.trackingNumber?.toLowerCase().includes(search)
        );
    });
    
    displayOrders(filtered);
}

// Update statistics
function updateStats() {
    const stats = {
        total: orders.length,
        inProduction: orders.filter(o => o.status === 'in_production').length,
        shipping: orders.filter(o => ['shipping', 'out_for_delivery'].includes(o.status)).length,
        delivered: orders.filter(o => o.status === 'delivered').length
    };
    
    const totalEl = document.getElementById('totalOrders');
    const prodEl = document.getElementById('inProduction');
    const shipEl = document.getElementById('shipping');
    const delEl = document.getElementById('delivered');
    
    if (totalEl) totalEl.textContent = stats.total;
    if (prodEl) prodEl.textContent = stats.inProduction;
    if (shipEl) shipEl.textContent = stats.shipping;
    if (delEl) delEl.textContent = stats.delivered;
}

// Sync all tracking from external services
async function syncAllTracking() {
    try {
        showNotification('Syncing tracking information...', 'info');
        
        // Try to sync with B2B store
        const response = await fetch('https://my-b2b-store-shureprint.vercel.app/api/sync/check-all-tracking', {
            method: 'GET'
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`Synced ${result.updated || 0} orders`, 'success');
            syncWithB2BStore(); // Reload orders
        } else {
            showNotification('Could not sync with B2B store', 'warning');
        }
    } catch (error) {
        console.error('Error syncing tracking:', error);
        showNotification('Sync available when B2B store is connected', 'info');
    }
}

// Utility functions
function formatStatus(status) {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getStatusIcon(status) {
    const icons = {
        pending: '⏳',
        confirmed: '✅',
        sampling: '🎨',
        in_production: '🏭',
        finishing: '✨',
        quality_check: '🔍',
        shipping: '📦',
        out_for_delivery: '🚚',
        delivered: '✓',
        canceled: '❌'
    };
    return icons[status] || '📋';
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function showLoadingSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

function showNotification(message, type = 'info') {
    // Create toast notification
    const toastHtml = `
        <div class="toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    // Add to page and show
    const container = document.createElement('div');
    container.innerHTML = toastHtml;
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    
    const toast = new bootstrap.Toast(container.querySelector('.toast'));
    toast.show();
    
    // Remove after hidden
    setTimeout(() => container.remove(), 5000);
}

// Logout function (just clears local data for now)
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/dashboard.html';
    }
}

// Export functions for global access
window.selectOrder = selectOrder;
window.updateOrder = updateOrder;
window.addNewOrder = addNewOrder;
window.showAddOrderModal = showAddOrderModal;
window.syncAllTracking = syncAllTracking;
window.logout = logout;