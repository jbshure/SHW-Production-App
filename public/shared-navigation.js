// Shared flyout navigation for all admin pages
function initializeSharedNavigation() {
    // Get current page path
    const currentPath = window.location.pathname;
    
    // Navigation items configuration
    const navItems = [
        { href: '/', icon: 'house', text: 'Dashboard', id: 'dashboard' },
        { href: '/quote-builder.html', icon: 'file-text', text: 'Quote Builder', id: 'quote-builder' },
        { href: '/quotes-dashboard.html', icon: 'folder', text: 'Quotes', id: 'quotes' },
        { href: '/admin-dashboard.html', icon: 'palette', text: 'Art Proofs', id: 'artproofs' },
        { href: '/order-tracking.html', icon: 'truck', text: 'Order Tracking', id: 'orders' },
        { href: '/product-catalog.html', icon: 'box', text: 'Products', id: 'products' }
    ];
    
    // Create navigation HTML
    const navigationHTML = `
        <!-- Top Navigation Bar -->
        <nav class="sp-navbar">
            <button class="sp-menu-toggle" id="spMenuToggle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>
            <div class="sp-navbar-brand">
                <div class="sp-brand-logo">SP</div>
                <div class="sp-brand-text">ShurePrint</div>
            </div>
        </nav>
        
        <!-- Sidebar Overlay -->
        <div class="sp-sidebar-overlay" id="spSidebarOverlay"></div>
        
        <!-- Sidebar -->
        <div class="sp-sidebar" id="spSidebar">
            <button class="sp-sidebar-close" id="spSidebarClose">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="sp-sidebar-header">
                <div class="sp-sidebar-brand">
                    <div class="sp-brand-logo">SP</div>
                    <div class="sp-brand-text">ShurePrint</div>
                </div>
            </div>
            <div class="sp-sidebar-nav">
                ${navItems.map(item => {
                    const isActive = currentPath.includes(item.id) || currentPath === item.href || 
                                   (item.href === '/' && (currentPath === '/index.html' || currentPath === '/'));
                    return `
                        <a class="sp-sidebar-item ${isActive ? 'active' : ''}" href="${item.href}">
                            <i class="bi bi-${item.icon}"></i>
                            <span>${item.text}</span>
                        </a>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    return navigationHTML;
}

// CSS styles for the flyout sidebar
const sidebarStyles = `
    <style>
        /* Top Navigation Bar */
        .sp-navbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 70px;
            background: #FFF9F0;
            border-bottom: 1px solid #e9e9e9;
            display: flex;
            align-items: center;
            padding: 0 20px;
            z-index: 998;
            box-shadow: 0 2px 4px rgba(0,0,0,.05);
        }
        
        .sp-navbar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-left: 60px;
        }
        
        .sp-brand-logo {
            width: 40px;
            height: 40px;
            background: #e3fc02;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: #111;
            font-size: 16px;
            font-family: 'Montserrat', sans-serif;
        }
        
        .sp-brand-text {
            font-family: 'Montserrat', sans-serif;
            font-size: 1.5rem;
            font-weight: 700;
            color: #111;
            letter-spacing: -0.02em;
        }
        
        /* Menu Toggle Button */
        .sp-menu-toggle {
            position: absolute;
            background: #e3fc02;
            border: none;
            border-radius: 8px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,.1);
        }
        
        .sp-menu-toggle:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,.15);
        }
        
        .sp-menu-toggle i {
            font-size: 1.3rem;
            color: #111;
        }
        
        /* Flyout Sidebar */
        .sp-sidebar {
            position: fixed;
            top: 0;
            left: -280px;
            width: 280px;
            height: 100vh;
            background: white;
            border-right: 1px solid #e9e9e9;
            box-shadow: 2px 0 8px rgba(0,0,0,0.1);
            overflow-y: auto;
            z-index: 1000;
            transition: left 0.3s ease;
        }
        
        .sp-sidebar.active {
            left: 0;
        }
        
        /* Close button */
        .sp-sidebar-close {
            position: absolute;
            top: 15px;
            right: 15px;
            background: transparent;
            border: none;
            font-size: 1.5rem;
            color: #6b6b6b;
            cursor: pointer;
            padding: 5px;
            z-index: 1001;
            transition: all 0.2s ease;
        }
        
        .sp-sidebar-close:hover {
            color: #111;
            transform: scale(1.1);
        }
        
        .sp-sidebar-header {
            padding: 24px;
            border-bottom: 1px solid #e9e9e9;
            background: #FFF9F0;
        }
        
        .sp-sidebar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .sp-sidebar-nav {
            padding: 20px 0;
        }
        
        .sp-sidebar-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 24px;
            color: #6b6b6b;
            text-decoration: none;
            font-size: 0.95rem;
            font-weight: 500;
            transition: all 0.2s ease;
            position: relative;
        }
        
        .sp-sidebar-item:hover {
            color: #111;
            background: #f7f7f7;
            text-decoration: none;
        }
        
        .sp-sidebar-item.active {
            color: #111;
            background: #FFF9F0;
            font-weight: 600;
        }
        
        .sp-sidebar-item.active::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: #e3fc02;
        }
        
        .sp-sidebar-item i {
            font-size: 1.1rem;
            width: 20px;
            text-align: center;
        }
        
        /* Overlay */
        .sp-sidebar-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 999;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        
        .sp-sidebar-overlay.active {
            opacity: 1;
            visibility: visible;
        }
        
        /* Content adjustment */
        body {
            padding-top: 70px;
        }
        
        .main-content, .container, .with-sidebar, .quote-builder {
            padding-top: 20px;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .sp-navbar-brand {
                margin-left: 50px;
            }
            
            .sp-brand-text {
                font-size: 1.2rem;
            }
        }
    </style>
`;

// Function to inject flyout sidebar into page
function injectSidebar() {
    // Check if navigation already exists
    if (document.querySelector('.sp-sidebar')) {
        return;
    }
    
    // Add styles to head
    const styleElement = document.createElement('style');
    styleElement.innerHTML = sidebarStyles.replace('<style>', '').replace('</style>', '');
    document.head.appendChild(styleElement);
    
    // Create and insert navigation elements
    const navContainer = document.createElement('div');
    navContainer.innerHTML = initializeSharedNavigation();
    
    // Insert all navigation elements at the beginning of body
    while (navContainer.firstChild) {
        document.body.insertBefore(navContainer.firstChild, document.body.firstChild);
    }
    
    // Add event listeners
    const menuToggle = document.getElementById('spMenuToggle');
    const sidebar = document.getElementById('spSidebar');
    const overlay = document.getElementById('spSidebarOverlay');
    const closeButton = document.getElementById('spSidebarClose');
    
    function openSidebar() {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        // Change hamburger to X
        menuToggle.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
    }
    
    function closeSidebar() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        // Change X back to hamburger
        menuToggle.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
        `;
    }
    
    function toggleSidebar() {
        if (sidebar.classList.contains('active')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }
    
    // Toggle sidebar on button click
    menuToggle.addEventListener('click', toggleSidebar);
    
    // Close sidebar on overlay click
    overlay.addEventListener('click', closeSidebar);
    
    // Close sidebar on X button click
    closeButton.addEventListener('click', closeSidebar);
    
    // Close sidebar when clicking on a link (on mobile)
    document.querySelectorAll('.sp-sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                closeSidebar();
            }
        });
    });
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebar);
} else {
    injectSidebar();
}