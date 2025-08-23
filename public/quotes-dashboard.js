// Quotes Dashboard JavaScript
let allQuotes = [];
let filteredQuotes = [];
let currentFilter = 'all';
let sortField = 'createdDate';
let sortDirection = 'desc';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    loadQuotes();
    setupEventListeners();
    
    // Auto-refresh every 30 seconds
    setInterval(loadQuotes, 30000);
});

// Setup event listeners
function setupEventListeners() {
    // Search
    document.getElementById('search-input').addEventListener('input', handleSearch);
    
    // Status filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', handleFilter);
    });
}

// Load quotes from localStorage and/or API
async function loadQuotes() {
    document.getElementById('loading').classList.add('active');
    
    try {
        // Load from localStorage for now
        const storedQuotes = localStorage.getItem('shureprint_quotes');
        if (storedQuotes) {
            allQuotes = JSON.parse(storedQuotes);
        } else {
            // Initialize with sample data if empty
            allQuotes = getSampleQuotes();
        }
        
        // Sort quotes
        sortQuotes();
        
        // Apply current filter
        applyFilter();
        
        // Update stats
        updateStats();
        
        // Render table
        renderTable();
        
    } catch (error) {
        console.error('Error loading quotes:', error);
    } finally {
        document.getElementById('loading').classList.remove('active');
    }
}

// Get sample quotes for demo
function getSampleQuotes() {
    return [
        {
            id: 'Q-2025-001',
            quoteNumber: 'Q-2025-001',
            projectName: 'Business Cards Premium',
            customerName: 'John Smith',
            customerEmail: 'john@example.com',
            status: 'sent',
            totalAmount: 250.00,
            items: [
                {name: 'Business Cards', quantity: 1000, price: 0.25}
            ],
            createdDate: new Date('2025-01-14T10:00:00'),
            lastActivity: new Date('2025-01-14T10:15:00'),
            sentDate: new Date('2025-01-14T10:15:00'),
            viewedDate: null,
            approvedDate: null,
            portalUrl: '#'
        },
        {
            id: 'Q-2025-002',
            quoteNumber: 'Q-2025-002',
            projectName: 'Flyer Design & Print',
            customerName: 'Sarah Johnson',
            customerEmail: 'sarah@example.com',
            status: 'approved',
            totalAmount: 850.00,
            items: [
                {name: 'Flyers A5', quantity: 5000, price: 0.17}
            ],
            createdDate: new Date('2025-01-13T14:30:00'),
            lastActivity: new Date('2025-01-14T09:00:00'),
            sentDate: new Date('2025-01-13T14:45:00'),
            viewedDate: new Date('2025-01-13T16:00:00'),
            approvedDate: new Date('2025-01-14T09:00:00'),
            portalUrl: '#'
        },
        {
            id: 'Q-2025-003',
            quoteNumber: 'Q-2025-003',
            projectName: 'Banner Stand Package',
            customerName: 'Mike Davis',
            customerEmail: 'mike@example.com',
            status: 'viewed',
            totalAmount: 1200.00,
            items: [
                {name: 'Retractable Banner', quantity: 3, price: 400}
            ],
            createdDate: new Date('2025-01-12T11:00:00'),
            lastActivity: new Date('2025-01-13T10:00:00'),
            sentDate: new Date('2025-01-12T11:30:00'),
            viewedDate: new Date('2025-01-13T10:00:00'),
            approvedDate: null,
            portalUrl: '#'
        }
    ];
}

// Sort quotes
function sortQuotes() {
    allQuotes.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];
        
        if (sortField === 'totalAmount') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        } else if (sortField.includes('Date')) {
            aVal = new Date(aVal || 0);
            bVal = new Date(bVal || 0);
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

// Sort table
function sortTable(field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }
    
    sortQuotes();
    renderTable();
    
    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });
    const currentIndicator = document.querySelector(`th[onclick*="${field}"] .sort-indicator`);
    if (currentIndicator) {
        currentIndicator.textContent = sortDirection === 'asc' ? '↑' : '↓';
    }
}

// Apply filter
function applyFilter() {
    if (currentFilter === 'all') {
        filteredQuotes = [...allQuotes];
    } else {
        filteredQuotes = allQuotes.filter(quote => quote.status === currentFilter);
    }
    
    // Update filter counts
    updateFilterCounts();
}

// Handle filter click
function handleFilter(e) {
    // Remove active from all
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active to clicked
    e.target.classList.add('active');
    
    // Set filter
    currentFilter = e.target.getAttribute('data-status');
    
    // Apply and render
    applyFilter();
    renderTable();
}

// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    
    if (searchTerm) {
        filteredQuotes = allQuotes.filter(quote => 
            quote.quoteNumber.toLowerCase().includes(searchTerm) ||
            quote.projectName.toLowerCase().includes(searchTerm) ||
            quote.customerName.toLowerCase().includes(searchTerm) ||
            quote.customerEmail.toLowerCase().includes(searchTerm)
        );
    } else {
        applyFilter();
    }
    
    renderTable();
}

// Update stats
function updateStats() {
    const totalQuotes = allQuotes.length;
    const pendingQuotes = allQuotes.filter(q => q.status === 'sent' || q.status === 'viewed').length;
    const approvedQuotes = allQuotes.filter(q => q.status === 'approved' || q.status === 'paid').length;
    const totalValue = allQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0);
    
    document.getElementById('total-quotes').textContent = totalQuotes;
    document.getElementById('pending-quotes').textContent = pendingQuotes;
    document.getElementById('approved-quotes').textContent = approvedQuotes;
    document.getElementById('total-value').textContent = '$' + totalValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Update filter counts
function updateFilterCounts() {
    const counts = {
        all: allQuotes.length,
        draft: allQuotes.filter(q => q.status === 'draft').length,
        sent: allQuotes.filter(q => q.status === 'sent').length,
        viewed: allQuotes.filter(q => q.status === 'viewed').length,
        approved: allQuotes.filter(q => q.status === 'approved').length,
        paid: allQuotes.filter(q => q.status === 'paid').length
    };
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const status = btn.getAttribute('data-status');
        const countSpan = btn.querySelector('.filter-count');
        if (countSpan) {
            countSpan.textContent = counts[status] || 0;
        }
    });
}

// Render table
function renderTable() {
    const tbody = document.getElementById('quotes-tbody');
    const emptyState = document.getElementById('empty-state');
    
    if (filteredQuotes.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    tbody.innerHTML = filteredQuotes.map(quote => `
        <tr onclick="viewQuote('${quote.id}')">
            <td><strong>${quote.quoteNumber}</strong></td>
            <td>${quote.projectName}</td>
            <td>${quote.customerName}</td>
            <td><span class="status-badge status-${quote.status}">${quote.status}</span></td>
            <td><strong>$${quote.totalAmount.toFixed(2)}</strong></td>
            <td>${formatDate(quote.createdDate)}</td>
            <td>${formatDate(quote.lastActivity)}</td>
            <td onclick="event.stopPropagation()">
                <div class="action-buttons">
                    <button class="action-btn" onclick="viewQuote('${quote.id}')">View</button>
                    ${quote.status === 'draft' ? 
                        `<button class="action-btn primary" onclick="sendQuote('${quote.id}')">Send</button>` : 
                        `<button class="action-btn" onclick="resendQuote('${quote.id}')">Resend</button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

// Format date
function formatDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
            const mins = Math.floor(diff / (1000 * 60));
            return mins <= 1 ? 'Just now' : `${mins} mins ago`;
        }
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

// View quote
function viewQuote(quoteId) {
    const quote = allQuotes.find(q => q.id === quoteId);
    if (quote && quote.portalUrl) {
        window.open(quote.portalUrl, '_blank');
    } else {
        alert('Quote details: ' + JSON.stringify(quote, null, 2));
    }
}

// Send quote
async function sendQuote(quoteId) {
    const quote = allQuotes.find(q => q.id === quoteId);
    if (!quote) return;
    
    if (confirm(`Send quote ${quote.quoteNumber} to ${quote.customerName}?`)) {
        // Update status
        quote.status = 'sent';
        quote.sentDate = new Date();
        quote.lastActivity = new Date();
        
        // Save to localStorage
        saveQuotes();
        
        // Reload
        loadQuotes();
        
        alert(`Quote sent to ${quote.customerEmail}`);
    }
}

// Resend quote
async function resendQuote(quoteId) {
    const quote = allQuotes.find(q => q.id === quoteId);
    if (!quote) return;
    
    if (confirm(`Resend quote ${quote.quoteNumber} to ${quote.customerName}?`)) {
        quote.lastActivity = new Date();
        
        // Save to localStorage
        saveQuotes();
        
        // Reload
        loadQuotes();
        
        alert(`Quote resent to ${quote.customerEmail}`);
    }
}

// Save quotes to localStorage
function saveQuotes() {
    localStorage.setItem('shureprint_quotes', JSON.stringify(allQuotes));
}

// Add new quote (called from quote builder)
window.addNewQuote = function(quoteData) {
    const newQuote = {
        id: `Q-${Date.now()}`,
        quoteNumber: `Q-2025-${String(allQuotes.length + 1).padStart(3, '0')}`,
        status: 'draft',
        createdDate: new Date(),
        lastActivity: new Date(),
        ...quoteData
    };
    
    allQuotes.unshift(newQuote);
    saveQuotes();
    loadQuotes();
    
    return newQuote;
};