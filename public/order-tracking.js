// Order Tracking Management System
// Firebase/Firestore integration for ShurePrint Admin Portal

// Initialize Firebase (config will be loaded from main app)
let db;
let currentUser;
let selectedOrder = null;
let orders = [];

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            currentUser = user;
            db = firebase.firestore();
            initializeOrderTracking();
        } else {
            window.location.href = '/login.html';
        }
    });

    // Setup event listeners
    setupEventListeners();
});

function initializeOrderTracking() {
    loadOrders();
    updateStats();
    startRealtimeUpdates();
}

function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchOrders');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterOrders(e.target.value);
        });
    }

    // Add order form
    const addOrderForm = document.getElementById('addOrderForm');
    if (addOrderForm) {
        addOrderForm.addEventListener('submit', function(e) {
            e.preventDefault();
        });
    }
}

// Load orders from Firestore
async function loadOrders() {
    try {
        showLoadingSpinner(true);
        
        const snapshot = await db.collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        
        orders = [];
        snapshot.forEach(doc => {
            orders.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        displayOrders(orders);
        updateStats();
    } catch (error) {
        console.error('Error loading orders:', error);
        showNotification('Error loading orders', 'error');
    } finally {
        showLoadingSpinner(false);
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
    event.currentTarget.classList.add('selected');
    
    // Display update form
    displayUpdateForm();
    
    // Load and display timeline
    loadOrderTimeline(orderId);
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
                       id="updateETA" value="${selectedOrder.estimatedDelivery || ''}">
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

// Update order in Firestore
async function updateOrder(event) {
    event.preventDefault();
    
    if (!selectedOrder) return;
    
    try {
        showLoadingSpinner(true);
        
        const updates = {
            status: document.getElementById('updateStatus').value,
            carrier: document.getElementById('updateCarrier').value,
            trackingNumber: document.getElementById('updateTracking').value,
            estimatedDelivery: document.getElementById('updateETA').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add local delivery info if applicable
        if (selectedOrder.transportMode === 'in_house') {
            updates.driverName = document.getElementById('driverName').value;
            updates.driverPhone = document.getElementById('driverPhone').value;
            updates.vehicleId = document.getElementById('vehicleId').value;
        }
        
        // Update order document
        await db.collection('orders').doc(selectedOrder.id).update(updates);
        
        // Add milestone if provided
        const milestoneName = document.getElementById('milestoneName').value;
        if (milestoneName) {
            await addMilestone(selectedOrder.id, {
                name: milestoneName,
                note: document.getElementById('milestoneNote').value,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Add tracking event if tracking was added/updated
        if (updates.trackingNumber && updates.carrier) {
            await addTrackingEvent(selectedOrder.id, {
                type: 'tracking_added',
                carrier: updates.carrier,
                trackingNumber: updates.trackingNumber,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        showNotification('Order updated successfully', 'success');
        loadOrders(); // Reload orders
        
    } catch (error) {
        console.error('Error updating order:', error);
        showNotification('Error updating order', 'error');
    } finally {
        showLoadingSpinner(false);
    }
}

// Add milestone to order
async function addMilestone(orderId, milestone) {
    try {
        await db.collection('orders').doc(orderId)
            .collection('milestones').add(milestone);
    } catch (error) {
        console.error('Error adding milestone:', error);
    }
}

// Add tracking event
async function addTrackingEvent(orderId, event) {
    try {
        await db.collection('orders').doc(orderId)
            .collection('events').add(event);
    } catch (error) {
        console.error('Error adding tracking event:', error);
    }
}

// Load order timeline
async function loadOrderTimeline(orderId) {
    const timelineContainer = document.getElementById('orderTimeline');
    if (!timelineContainer) return;
    
    try {
        // Load milestones and events
        const [milestones, events] = await Promise.all([
            db.collection('orders').doc(orderId).collection('milestones')
                .orderBy('timestamp', 'desc').limit(20).get(),
            db.collection('orders').doc(orderId).collection('events')
                .orderBy('timestamp', 'desc').limit(20).get()
        ]);
        
        const timelineItems = [];
        
        milestones.forEach(doc => {
            timelineItems.push({
                type: 'milestone',
                ...doc.data()
            });
        });
        
        events.forEach(doc => {
            timelineItems.push({
                type: 'event',
                ...doc.data()
            });
        });
        
        // Sort by timestamp
        timelineItems.sort((a, b) => {
            const timeA = a.timestamp?.toDate?.() || new Date(0);
            const timeB = b.timestamp?.toDate?.() || new Date(0);
            return timeB - timeA;
        });
        
        // Display timeline
        if (timelineItems.length === 0) {
            timelineContainer.innerHTML = '<p class="text-muted text-center">No timeline events yet</p>';
        } else {
            timelineContainer.innerHTML = `
                <div class="timeline">
                    ${timelineItems.map(item => `
                        <div class="timeline-item">
                            <strong>${item.name || item.type || 'Event'}</strong>
                            ${item.note ? `<p class="mb-1">${item.note}</p>` : ''}
                            <small class="text-muted">
                                ${formatDate(item.timestamp?.toDate?.() || new Date())}
                            </small>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading timeline:', error);
        timelineContainer.innerHTML = '<p class="text-danger">Error loading timeline</p>';
    }
}

// Add new order
async function addNewOrder() {
    const modal = bootstrap.Modal.getInstance(document.getElementById('addOrderModal'));
    
    try {
        showLoadingSpinner(true);
        
        const newOrder = {
            orderId: document.getElementById('newOrderId').value,
            customerEmail: document.getElementById('newCustomerEmail').value,
            productName: document.getElementById('newProductName').value,
            quantity: parseInt(document.getElementById('newQuantity').value),
            sku: document.getElementById('newSku').value,
            transportMode: document.getElementById('newTransportMode').value,
            specialInstructions: document.getElementById('newSpecialInstructions').value,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('orders').add(newOrder);
        
        showNotification('Order added successfully', 'success');
        modal.hide();
        document.getElementById('addOrderForm').reset();
        loadOrders();
        
    } catch (error) {
        console.error('Error adding order:', error);
        showNotification('Error adding order', 'error');
    } finally {
        showLoadingSpinner(false);
    }
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
    
    document.getElementById('totalOrders').textContent = stats.total;
    document.getElementById('inProduction').textContent = stats.inProduction;
    document.getElementById('shipping').textContent = stats.shipping;
    document.getElementById('delivered').textContent = stats.delivered;
}

// Sync all tracking from external services
async function syncAllTracking() {
    try {
        showLoadingSpinner(true);
        showNotification('Syncing tracking information...', 'info');
        
        // Call B2B backend to sync with ShipStation, AfterShip, etc.
        const response = await fetch('https://my-b2b-store-shureprint.vercel.app/api/sync/check-all-tracking', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${currentUser.uid}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`Synced ${result.updated || 0} orders`, 'success');
            loadOrders(); // Reload to show updates
        } else {
            throw new Error('Sync failed');
        }
    } catch (error) {
        console.error('Error syncing tracking:', error);
        showNotification('Error syncing tracking', 'error');
    } finally {
        showLoadingSpinner(false);
    }
}

// Start realtime updates
function startRealtimeUpdates() {
    // Listen for order updates
    db.collection('orders')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'modified') {
                    // Update local order data
                    const index = orders.findIndex(o => o.id === change.doc.id);
                    if (index !== -1) {
                        orders[index] = {
                            id: change.doc.id,
                            ...change.doc.data()
                        };
                    }
                } else if (change.type === 'added' && orders.length > 0) {
                    // New order added
                    orders.unshift({
                        id: change.doc.id,
                        ...change.doc.data()
                    });
                }
            });
            displayOrders(orders);
            updateStats();
        });
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

// Logout function
function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = '/login.html';
    });
}

// Export functions for global access
window.selectOrder = selectOrder;
window.updateOrder = updateOrder;
window.addNewOrder = addNewOrder;
window.showAddOrderModal = showAddOrderModal;
window.syncAllTracking = syncAllTracking;
window.logout = logout;