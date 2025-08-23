// Trello API configuration
const TRELLO_API_KEY = '090f0bca888cb7375b15682771aef83e';
const TRELLO_TOKEN = 'ATTA54bed3e34ae3930dae4c563e64512c33f37aa91bf610743449eea67c1c79fce540025E87';
const BOARD_ID = '686da04ff3f765a86406b2c0';

// Trello integration for home page
async function loadTrelloStats() {
    try {
        // Fetch board data directly from Trello
        const boardResponse = await fetch(
            `https://api.trello.com/1/boards/${BOARD_ID}?lists=open&cards=visible&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        
        if (!boardResponse.ok) {
            throw new Error('Failed to fetch Trello board');
        }
        
        const board = await boardResponse.json();
        
        // Fetch lists and cards
        const listsResponse = await fetch(
            `https://api.trello.com/1/boards/${BOARD_ID}/lists?cards=open&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        
        const lists = await listsResponse.json();
        
        // Calculate stats
        let activeCards = 0;
        let pendingApprovals = 0;
        let monthlyProjects = 0;
        
        lists.forEach(list => {
            if (list.cards) {
                activeCards += list.cards.length;
                
                // Count pending approvals (cards in specific lists)
                if (list.name.toLowerCase().includes('approval') || list.name.toLowerCase().includes('review')) {
                    pendingApprovals += list.cards.length;
                }
                
                // Count this month's projects
                const thisMonth = new Date().getMonth();
                list.cards.forEach(card => {
                    const cardDate = new Date(card.dateLastActivity);
                    if (cardDate.getMonth() === thisMonth) {
                        monthlyProjects++;
                    }
                });
            }
        });
        
        const stats = {
            activeCards,
            pendingApprovals,
            monthlyProjects
        };
        
        // Update the stats cards with real data
        if (stats.activeCards !== undefined) {
            const activeQuotesEl = document.querySelector('.stat-value');
            if (activeQuotesEl && activeQuotesEl.textContent === '12') {
                activeQuotesEl.textContent = stats.activeCards;
            }
        }
        
        if (stats.pendingApprovals !== undefined) {
            const statCards = document.querySelectorAll('.stat-card');
            if (statCards[1]) {
                statCards[1].querySelector('.stat-value').textContent = stats.pendingApprovals;
            }
        }
        
        if (stats.monthlyProjects !== undefined) {
            const statCards = document.querySelectorAll('.stat-card');
            if (statCards[2]) {
                statCards[2].querySelector('.stat-value').textContent = stats.monthlyProjects;
            }
        }
        
        // Add recent activity section if we have data
        if (stats.recentActivity && stats.recentActivity.length > 0) {
            addRecentActivitySection(stats.recentActivity);
        }
        
    } catch (error) {
        console.error('Error loading Trello stats:', error);
        // Silently fail - keep default values
    }
}

function addRecentActivitySection(activities) {
    // Find container or create one
    const container = document.querySelector('.container');
    if (!container) return;
    
    // Check if activity section already exists
    if (document.querySelector('.recent-activity')) return;
    
    const activityHTML = `
        <div class="recent-activity" style="margin-top: 40px; margin-bottom: 40px;">
            <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 20px; color: var(--text-primary);">
                Recent Production Activity
            </h2>
            <div class="activity-list" style="background: var(--background-light); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
                ${activities.slice(0, 5).map(activity => `
                    <div class="activity-item" style="padding: 12px 0; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 15px;">
                        <div class="activity-icon" style="width: 40px; height: 40px; background: var(--soft, #f7f7f7); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            ${getActivityIcon(activity.type)}
                        </div>
                        <div class="activity-details" style="flex: 1;">
                            <div class="activity-title" style="font-weight: 600; color: var(--text-primary);">
                                ${activity.title}
                            </div>
                            <div class="activity-meta" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                                ${activity.list} • ${formatTimeAgo(activity.date)}
                            </div>
                        </div>
                        ${activity.labels ? `
                            <div class="activity-labels" style="display: flex; gap: 6px;">
                                ${activity.labels.map(label => `
                                    <span style="padding: 4px 8px; background: ${label.color}; color: white; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                                        ${label.name}
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Insert before the apps grid
    const appsGrid = document.querySelector('.apps-grid');
    if (appsGrid) {
        appsGrid.insertAdjacentHTML('beforebegin', activityHTML);
    }
}

function getActivityIcon(type) {
    const icons = {
        'new': '🆕',
        'moved': '➡️',
        'completed': '✅',
        'urgent': '🔴',
        'in_progress': '🔄',
        'default': '📋'
    };
    return icons[type] || icons.default;
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
    return date.toLocaleDateString();
}

// Function to load recent Trello activity
async function loadTrelloActivity() {
    const activityContainer = document.getElementById('trello-activity');
    if (!activityContainer) return;
    
    try {
        // Fetch recent actions from the board
        const response = await fetch(
            `https://api.trello.com/1/boards/${BOARD_ID}/actions?limit=10&key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch Trello activity');
        }
        
        const actions = await response.json();
        
        if (actions.length === 0) {
            activityContainer.innerHTML = '<p style="text-align: center; color: #666;">No recent activity</p>';
            return;
        }
        
        // Format and display the activity
        let activityHTML = '<div style="max-height: 400px; overflow-y: auto;">';
        
        actions.forEach(action => {
            const date = new Date(action.date);
            const timeAgo = formatTimeAgo(date.toISOString());
            const memberName = action.memberCreator?.fullName || 'Unknown';
            
            let actionText = '';
            let icon = '📝';
            
            // Parse different action types
            switch(action.type) {
                case 'createCard':
                    actionText = `created card "${action.data.card.name}"`;
                    icon = '➕';
                    break;
                case 'updateCard':
                    if (action.data.listBefore && action.data.listAfter) {
                        actionText = `moved "${action.data.card.name}" from ${action.data.listBefore.name} to ${action.data.listAfter.name}`;
                        icon = '➡️';
                    } else {
                        actionText = `updated "${action.data.card.name}"`;
                    }
                    break;
                case 'commentCard':
                    actionText = `commented on "${action.data.card.name}"`;
                    icon = '💬';
                    break;
                default:
                    actionText = `performed ${action.type} on the board`;
                    icon = '📋';
            }
            
            activityHTML += `
                <div style="display: flex; gap: 15px; padding: 15px 0; border-bottom: 1px solid #f0f0f0;">
                    <div style="font-size: 24px; flex-shrink: 0;">${icon}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #333;">
                            ${memberName} ${actionText}
                        </div>
                        ${action.data.text ? `<div style="color: #666; margin-top: 5px; font-size: 0.9rem;">"${action.data.text}"</div>` : ''}
                        <div style="color: #999; font-size: 0.85rem; margin-top: 5px;">${timeAgo}</div>
                    </div>
                </div>
            `;
        });
        
        activityHTML += '</div>';
        activityContainer.innerHTML = activityHTML;
        
    } catch (error) {
        console.error('Error fetching Trello activity:', error);
        activityContainer.innerHTML = `
            <div style="text-align: center; color: #666;">
                <p>Unable to load recent activity</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Please check your Trello connection</p>
            </div>
        `;
    }
}

// Load stats and activity when page is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadTrelloStats();
        loadTrelloActivity();
    });
} else {
    loadTrelloStats();
    loadTrelloActivity();
}