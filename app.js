// State
let orders = [];
let resources = ['機台 A', '機台 B', '師傅 C']; // Default resources
let timelineDate = new Date(); // Current date for timeline
let timelineZoom = 24; // Fixed 24 hours display
let isHistoryMode = false; // Toggle for history view

// DOM Elements
const orderForm = document.getElementById('orderForm');
const orderList = document.getElementById('orderList');
const orderCount = document.getElementById('orderCount');
const resourceSelect = document.getElementById('resource');
const resourceList = document.getElementById('resourceList');
const newResourceInput = document.getElementById('newResourceName');
const addResourceBtn = document.getElementById('addResourceBtn');
const timelineContainer = document.getElementById('timelineContainer');
const timelineBody = document.getElementById('timelineBody');
const timelineDateDisplay = document.getElementById('timelineDateDisplay');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const historyBtn = document.getElementById('historyBtn');

// --- Data Management (Cloud Sync) ---

const API_URL = 'https://script.google.com/macros/s/AKfycbzeJnGZgcjlIdUfFlCH6gkKgUhsJLvdRp2jeX75ONYYAQGXazmV7VrqShZ0uffujifS/exec';

async function loadData() {
    showLoading(true);
    try {
        console.log('Starting loadData...');
        // Load Resources from LocalStorage (Fallback)
        const storedResources = localStorage.getItem('resources');
        if (storedResources) resources = JSON.parse(storedResources);

        // Load Orders and Resources from Google Sheet
        console.log('Fetching from URL:', API_URL);
        const response = await fetch(`${API_URL}?action=read`);
        console.log('Response status:', response.status);

        const result = await response.json();
        console.log('Raw result from cloud:', result);

        if (result.status === 'success') {
            orders = result.data;

            // Update Resources from Cloud if available
            if (result.resources && Array.isArray(result.resources)) {
                resources = result.resources;
                // Update local storage to keep in sync
                localStorage.setItem('resources', JSON.stringify(resources));
                renderResources();
                renderResourceOptions();
            }

            // Convert timestamps back to numbers if needed
            let hasMigration = false;
            orders.forEach(o => {
                let start = Number(o.startTime);
                if (isNaN(start)) start = new Date(o.startTime).getTime();
                o.startTime = start;

                let due = Number(o.dueTime);
                if (isNaN(due)) due = new Date(o.dueTime).getTime();
                o.dueTime = due;

                // Data migration: Convert old duration (minutes) to hours
                o.duration = Number(o.duration);
                // If duration is suspiciously large (>100), it's likely in minutes
                if (o.duration > 100) {
                    console.log(`Migrating duration for order ${o.id}: ${o.duration} minutes -> ${o.duration / 60} hours`);
                    o.duration = o.duration / 60;
                    hasMigration = true;
                }
            });

            // Save migrated data back to cloud
            if (hasMigration) {
                console.log('Data migration detected, saving to cloud...');
                saveData(true);
            }

            renderOrders();
            renderTimeline();
            renderResourceOptions();
        } else {
            console.error('Cloud load error:', result.message);
            alert('無法從雲端讀取資料: ' + result.message);
        }
    } catch (error) {
        console.error('Load error:', error);
        alert('連線錯誤，無法讀取資料 (請看 Console)');
    } finally {
        showLoading(false);
    }
}

async function saveData(isBackground = false) {
    // Save Resources to LocalStorage (Backup)
    localStorage.setItem('resources', JSON.stringify(resources));

    // Save Orders and Resources to Google Sheet
    if (!isBackground) {
        showLoading(true, '儲存中...');
    } else {
        showBackgroundSync(true);
    }

    try {
        const payload = {
            orders: orders,
            resources: resources
        };

        const response = await fetch(`${API_URL}?action=save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.status === 'success') {
            console.log('Saved to cloud successfully');
        } else {
            throw new Error(result.message || 'Unknown error from server');
        }

    } catch (error) {
        console.error('Save error:', error);
        if (!isBackground) {
            alert('儲存失敗：' + error.message);
        } else {
            // In background mode, maybe show a small toast error
            showToast('⚠️ 雲端同步失敗，請檢查網路');
        }
    } finally {
        if (!isBackground) {
            showLoading(false);
        } else {
            showBackgroundSync(false);
        }
        // Re-render to ensure consistency, but Optimistic UI already rendered
        renderOrders();
        renderTimeline();
        renderResourceOptions();
    }
}

function showLoading(isLoading, msg = '讀取中...') {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;

    if (isLoading) {
        statusEl.textContent = `☁️ ${msg}`;
        statusEl.style.opacity = '1';
    } else {
        statusEl.textContent = '☁️ 已同步';
        setTimeout(() => {
            statusEl.style.opacity = '0.5';
        }, 2000);
    }
}

function showBackgroundSync(isSyncing) {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;

    if (isSyncing) {
        statusEl.textContent = '☁️ 同步中...';
        statusEl.style.opacity = '0.8';
    } else {
        statusEl.textContent = '☁️ 已同步';
        setTimeout(() => {
            statusEl.style.opacity = '0.5';
        }, 2000);
    }
}

// --- Resource Management ---

function addResource() {
    const name = newResourceInput.value.trim();
    if (name && !resources.includes(name)) {
        resources.push(name);
        newResourceInput.value = '';
        renderResources();
        renderResourceOptions();
        saveData(true); // Background save
    }
}

function removeResource(name) {
    if (confirm(`確定要刪除資源 "${name}" 嗎？`)) {
        resources = resources.filter(r => r !== name);
        renderResources();
        renderResourceOptions();
        saveData(true); // Background save
    }
}

function renderResources() {
    if (!resourceList) return;
    resourceList.innerHTML = resources.map(r => `
        <div class="resource-tag">
            ${r}
            <button onclick="removeResource('${r}')" class="btn-remove-resource">×</button>
        </div>
    `).join('');
}

function renderResourceOptions() {
    const container = document.getElementById('resource-options');
    if (!container) return;

    // Get currently active orders to determine status
    const now = Date.now();
    const activeOrders = orders.filter(o => o.status !== 'completed' && o.startTime <= now && o.dueTime > now);
    const busyResources = activeOrders.map(o => o.resource);

    container.innerHTML = resources.map((r, index) => {
        const isBusy = busyResources.includes(r);
        const statusClass = isBusy ? 'busy' : 'idle';
        const statusText = isBusy ? '使用中' : '空閒';
        const isFirst = index === 0;

        return `
        <label class="resource-option-card${isFirst ? ' selected' : ''}" onclick="selectResource(this)">
            <input type="radio" name="resource" value="${r}" ${isFirst ? 'checked' : ''} required>
            <span class="resource-name">${r}</span>
            <div class="status-indicator ${statusClass}" title="${statusText}"></div>
        </label>
    `}).join('');
}

function selectResource(card) {
    // Remove selected class from all cards
    document.querySelectorAll('.resource-option-card').forEach(c => c.classList.remove('selected'));
    // Add to clicked card
    card.classList.add('selected');
    // Check the radio button inside
    const radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
}

// --- Order Management ---

function addTag(tag) {
    const input = document.getElementById('orderDetails');
    if (!input) return;

    const currentVal = input.value;
    if (currentVal) {
        input.value = currentVal + ' ' + tag;
    } else {
        input.value = tag;
    }
    input.focus();
}

function parseDurationInput(value) {
    if (!value) return 0;
    if (value.toString().includes(':')) {
        const [h, m] = value.split(':').map(Number);
        return (h * 60) + (m || 0);
    }
    return parseFloat(value) * 60;
}

function formatDurationInput(minutes, useColonFormat) {
    if (useColonFormat) {
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return `${h}:${m.toString().padStart(2, '0')}`;
    }
    const h = minutes / 60;
    // Remove trailing zeros if integer (e.g. 1.0 -> 1)
    return parseFloat(h.toFixed(2)).toString();
}

function adjustDuration(hoursToAdd) {
    const input = document.getElementById('duration');
    const val = input.value;
    const isColon = val.toString().includes(':');

    let minutes = parseDurationInput(val);
    minutes += (hoursToAdd * 60);

    if (minutes < 1) minutes = 1;

    input.value = formatDurationInput(minutes, isColon);
}

function resetFormTime() {
    const now = new Date();
    const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    const startTimeInput = document.getElementById('startTime');
    const durationInput = document.getElementById('duration');

    if (startTimeInput) startTimeInput.value = localIso;
    if (durationInput) durationInput.value = "1";
}

function toggleHistoryMode() {
    isHistoryMode = !isHistoryMode;

    if (historyBtn) {
        historyBtn.textContent = isHistoryMode ? '🔙 返回列表' : '📜 歷史紀錄';
        historyBtn.classList.toggle('active', isHistoryMode);
    }

    renderOrders();
}

function restoreOrder(id) {
    const order = orders.find(o => o.id === id);
    if (order && confirm(`確定要還原訂單 "${order.customerName}" 嗎？`)) {
        order.status = 'active';
        renderOrders();
        renderTimeline();
        saveData(true); // Background save
        showToast('✅ 訂單已還原');
    }
}

function handleAddOrder(e) {
    e.preventDefault();

    const customerName = document.getElementById('customerName').value;
    const orderDetails = document.getElementById('orderDetails').value;

    // Get selected resource from radio buttons
    const selectedResource = document.querySelector('input[name="resource"]:checked');
    const resource = selectedResource ? selectedResource.value : null;

    if (!resource) {
        alert('⚠️ 請選擇一個資源 (機台/人員)\n\n請在下方選擇要使用的機台或人員');
        // Scroll to resource selection
        document.getElementById('resource-options')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const startTimeStr = document.getElementById('startTime').value;

    // Parse Duration (Flexible)
    const durationStr = document.getElementById('duration').value;
    const durationInMinutes = parseDurationInput(durationStr);

    if (!durationInMinutes || isNaN(durationInMinutes)) {
        alert('請輸入有效的工時 (例如 1.5 或 1:30)');
        return;
    }

    const startTime = new Date(startTimeStr).getTime();
    const dueTime = startTime + (durationInMinutes * 60 * 1000);

    // Convert minutes to hours for storage
    const durationInHours = durationInMinutes / 60;

    const newOrder = {
        id: Date.now().toString(),
        customerName,
        orderDetails,
        resource,
        startTime,
        duration: durationInHours,  // Store as hours
        dueTime,
        notified: false,
        status: 'active' // Default status
    };

    orders.push(newOrder);
    orders.sort((a, b) => a.dueTime - b.dueTime);

    // Optimistic UI: Render immediately
    renderOrders();
    renderTimeline();

    // Background Save
    saveData(true);

    orderForm.reset();
    resetFormTime();
    // Clear selection style
    document.querySelectorAll('.resource-option-card').forEach(c => c.classList.remove('selected'));

    // Visual Feedback
    const submitBtn = orderForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.classList.add('btn-success-flash');
        setTimeout(() => submitBtn.classList.remove('btn-success-flash'), 500);
    }
    showToast(`✅ 已新增訂單：${customerName}`);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger reflow
    toast.offsetHeight;

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

function completeOrder(id, result = 'success') {
    const order = orders.find(o => o.id === id);
    const actionText = result === 'success' ? '完成' : '標記為異常';
    if (order && confirm(`確定要${actionText}訂單 "${order.customerName}" 嗎？`)) {
        order.status = 'completed';
        order.result = result;
        // Optimistic UI: Update immediately
        renderOrders();
        renderTimeline();
        saveData(true); // Background save
        showToast(`✅ 訂單已${actionText}`);

        const orderModal = document.getElementById('orderModal');
        if (orderModal) orderModal.style.display = "none";
    }
}

function addDuration(id) {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    const input = prompt(`請輸入要增加的小時數 (例如 1, 2, 0.5)：`, '1');
    if (input === null) return;

    const hoursToAdd = parseFloat(input);
    if (isNaN(hoursToAdd) || hoursToAdd === 0) {
        alert('請輸入有效的數字');
        return;
    }

    order.duration += hoursToAdd;
    order.dueTime += (hoursToAdd * 60 * 60 * 1000);

    // Re-sort orders as due time changed
    orders.sort((a, b) => a.dueTime - b.dueTime);

    renderOrders();
    renderTimeline();
    saveData(true); // Background save
    showToast(`✅ 工時已延長 ${hoursToAdd} 小時`);

    // Close modal
    const orderModal = document.getElementById('orderModal');
    if (orderModal) orderModal.style.display = "none";
}

function deleteOrder(id) {
    if (confirm('【警告】確定要永久刪除這筆訂單嗎？\n此動作無法復原，資料將從資料庫中完全移除。')) {
        orders = orders.filter(o => o.id !== id);
        // Optimistic UI: Remove immediately
        renderOrders();
        renderTimeline();
        saveData(true); // Background save
        showToast('🗑️ 訂單已刪除');

        // Close modal
        const orderModal = document.getElementById('orderModal');
        if (orderModal) orderModal.style.display = "none";
    }
}

function renderOrders() {
    if (!orderCount || !orderList) return;

    // Filter orders based on mode
    const displayOrders = orders.filter(o => {
        if (isHistoryMode) {
            return o.status === 'completed';
        } else {
            return o.status !== 'completed';
        }
    });

    orderCount.textContent = displayOrders.length;

    // Update list header title based on mode
    const listHeader = document.querySelector('.list-header h2');
    if (listHeader) {
        listHeader.textContent = isHistoryMode ? '已完成訂單' : '進行中訂單';
    }

    if (displayOrders.length === 0) {
        orderList.innerHTML = `<div class="empty-state">${isHistoryMode ? '沒有歷史紀錄' : '目前沒有進行中的訂單'}</div>`;
        return;
    }

    orderList.innerHTML = displayOrders.map(order => {
        const dateStr = new Date(order.dueTime).toLocaleString('zh-TW', { hour12: false });

        // Format duration: show hours and minutes
        const hours = Math.floor(order.duration);
        const minutes = Math.round((order.duration - hours) * 60);
        let durStr = '';
        if (hours > 0 && minutes > 0) {
            durStr = `${hours}小時${minutes}分鐘`;
        } else if (hours > 0) {
            durStr = `${hours}小時`;
        } else {
            durStr = `${minutes}分鐘`;
        }

        let actionButtons = '';

        if (isHistoryMode) {
            // History Mode Buttons
            actionButtons = `
                <button onclick="restoreOrder('${order.id}')" class="btn-action btn-restore">還原</button>
                <button onclick="deleteOrder('${order.id}')" class="btn-action btn-delete">刪除</button>
            `;
        } else {
            // Active Mode - Just show "查看詳情" button to open modal
            actionButtons = `
                <button onclick="openOrderModal('${order.id}')" class="btn-action btn-extend">查看詳情</button>
            `;
        }

        return `
            <div class="order-item ${isHistoryMode ? 'history-item' : ''}" onclick="openOrderModal('${order.id}')" style="cursor: pointer;">
                <div class="order-info">
                    <h3>${order.customerName} <span class="tag">${order.resource}</span></h3>
                    <div class="order-details">${order.orderDetails}</div>
                    <div class="order-meta">
                        <span>工時：${durStr}</span>
                        <span>預計完成：${dateStr}</span>
                    </div>
                </div>
                <div class="order-actions" onclick="event.stopPropagation()">
                    ${!isHistoryMode ? `<div id="timer-${order.id}" class="timer">計算中...</div>` : ''}
                    <div class="action-buttons">
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (!isHistoryMode) {
        updateTimers();
    }
}

// --- Timer & Notification ---

function formatTimeLeft(ms) {
    if (ms < 0) return '已逾期 ' + formatTimeLeft(Math.abs(ms));

    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days} 天`);
    if (hours > 0) parts.push(`${hours} 時`);
    parts.push(`${minutes} 分`);
    parts.push(`${seconds} 秒`);

    return parts.join(' ');
}

function updateTimers() {
    const now = Date.now();
    let hasUpdates = false;

    // Filter active orders only for timers
    const activeOrders = orders.filter(o => o.status !== 'completed');

    activeOrders.forEach(order => {
        const timeLeft = order.dueTime - now;
        const timerElement = document.getElementById(`timer-${order.id}`);

        if (timerElement) {
            timerElement.textContent = timeLeft < 0 ? `逾期 ${formatTimeLeft(Math.abs(timeLeft))}` : formatTimeLeft(timeLeft);

            timerElement.className = 'timer';
            if (timeLeft < 0) {
                timerElement.classList.add('overdue');
            } else if (timeLeft < 300000) { // 5 minutes
                timerElement.classList.add('urgent');
            }
        }

        if (timeLeft <= 0 && !order.notified) {
            sendNotification(`訂單逾期：${order.customerName}`, `${order.orderDetails} 應於現在完成！`);
            order.notified = true;
            hasUpdates = true;
        }
    });

    if (hasUpdates) {
        saveData();
    }
}

function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        // Only request if user hasn't been asked before
        // This will be called when user adds their first order
        Notification.requestPermission();
    }
}

// --- Timeline & Visuals ---

function changeDate(delta) {
    timelineDate.setDate(timelineDate.getDate() + delta);
    updateDateDisplay();
    renderTimeline();
}

function goToToday() {
    timelineDate = new Date();
    updateDateDisplay();
    renderTimeline();
}

function handleZoomInput() {
    timelineZoom = parseInt(zoomSlider.value);
    zoomValue.textContent = `${timelineZoom} 小時`;
    renderTimeline();
}

function changeZoom(delta) {
    let newZoom = timelineZoom + delta;
    if (newZoom < 4) newZoom = 4;
    if (newZoom > 24) newZoom = 24;

    if (newZoom !== timelineZoom) {
        timelineZoom = newZoom;
        zoomSlider.value = timelineZoom;
        zoomValue.textContent = `${timelineZoom} 小時`;
        renderTimeline();
    }
}

function handleTimelineWheel(e) {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 : -1;
        changeZoom(delta);
    }
}

function updateDateDisplay() {
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    if (timelineDateDisplay) {
        timelineDateDisplay.textContent = timelineDate.toLocaleDateString('zh-TW', options);
    }
}

function renderTimeline() {
    if (!timelineContainer || !timelineBody) return;

    // Start of the selected day (00:00)
    const startOfDay = new Date(timelineDate);
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = startOfDay.getTime();
    const endTimestamp = startTimestamp + (24 * 60 * 60 * 1000);

    let html = '';

    // Create grid-based timeline header with current hour highlighting
    html += `<div class="timeline-header">`;
    html += `<div class="timeline-header-label">客戶</div>`;
    html += `<div class="timeline-header-hours">`;

    // Get current hour for highlighting
    const now = new Date();
    const currentHourNum = now.getHours();
    const isToday = startOfDay.getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (let i = 0; i < 24; i++) {
        const isCurrentHour = isToday && i === currentHourNum;
        const currentClass = isCurrentHour ? ' current-hour' : '';
        html += `<div class="hour-cell${currentClass}">${i.toString().padStart(2, '0')}</div>`;
    }
    html += `</div></div>`;

    // Rows per Customer (Group by Customer)
    const activeOrders = orders.filter(o => o.status !== 'completed');

    if (activeOrders.length === 0) {
        html += `<div class="timeline-empty">尚無進行中的訂單</div>`;
    } else {
        // Group by customer
        const uniqueCustomers = [...new Set(activeOrders.map(o => o.customerName))].sort();

        uniqueCustomers.forEach(customer => {
            const customerOrders = activeOrders.filter(o => o.customerName === customer);

            html += `<div class="timeline-row-grid">`;
            html += `<div class="row-label">${customer}</div>`;
            html += `<div class="row-hours">`;

            // Create 24 hour cells
            for (let h = 0; h < 24; h++) {
                html += `<div class="hour-slot"></div>`;
            }

            // Add order blocks
            customerOrders.forEach(order => {
                const orderStart = order.startTime;
                const orderEnd = order.dueTime;

                if (!orderStart || !orderEnd || isNaN(orderStart) || isNaN(orderEnd)) return;
                if (orderEnd < startTimestamp || orderStart > endTimestamp) return;

                // Calculate grid position (in hours)
                const startHour = Math.max(0, (orderStart - startTimestamp) / (60 * 60 * 1000));
                const endHour = Math.min(24, (orderEnd - startTimestamp) / (60 * 60 * 1000));
                const duration = endHour - startHour;

                const isOverdue = order.dueTime < Date.now() && order.status !== 'completed';
                const overdueClass = isOverdue ? 'overdue' : '';

                html += `
                    <div class="order-block ${overdueClass}" 
                         style="--start-hour: ${startHour}; --duration: ${duration};"
                         title="${order.resource} - ${order.orderDetails}"
                         onclick="openOrderModal('${order.id}')">
                        ${order.resource}
                    </div>
                `;
            });

            html += `</div></div>`;
        });
    }

    timelineBody.innerHTML = html;
}

function formatTime(ms) {
    return new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// --- Tabbed Interface ---
function switchTab(tabId) {
    // Update Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });

    // Update Content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// Expose functions to global scope for HTML onclick
window.removeResource = removeResource;
window.deleteOrder = deleteOrder;
window.completeOrder = completeOrder;
window.restoreOrder = restoreOrder;
window.toggleHistoryMode = toggleHistoryMode;
window.addDuration = addDuration;
window.adjustDuration = adjustDuration;
window.changeDate = changeDate;
window.goToToday = goToToday;
window.changeZoom = changeZoom;
window.addTag = addTag;
window.selectResource = selectResource;
window.switchTab = switchTab;
window.openOrderModal = openOrderModal;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderResources();
    renderResourceOptions();
    requestNotificationPermission();
    initScrollSpy();

    // Set default start time to now
    resetFormTime();

    // Start timer loop
    setInterval(updateTimers, 1000);

    // Initial render
    updateDateDisplay();
    renderTimeline();
});

// Event Listeners
if (orderForm) orderForm.addEventListener('submit', handleAddOrder);
if (addResourceBtn) addResourceBtn.addEventListener('click', addResource);
if (zoomSlider) {
    zoomSlider.addEventListener('input', handleZoomInput);
}
if (timelineContainer) {
    timelineContainer.addEventListener('wheel', handleTimelineWheel, { passive: false });
}

// --- Scroll Spy ---
function initScrollSpy() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id} `) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, {
        threshold: 0.3,
        rootMargin: "-10% 0px -50% 0px"
    });

    sections.forEach(section => {
        observer.observe(section);
    });

    // Add click handlers to nav links for immediate active state update
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Remove active from all links
            navLinks.forEach(l => l.classList.remove('active'));
            // Add active to clicked link
            link.classList.add('active');
        });
    });
}

// --- Order Details Modal ---
const orderModal = document.getElementById('orderModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalDeleteBtn = document.getElementById('modalDeleteBtn');
const modalCompleteBtn = document.getElementById('modalCompleteBtn');
const closeModalSpan = document.querySelector('.close-modal');

if (closeModalSpan) {
    closeModalSpan.onclick = function () {
        orderModal.style.display = "none";
    }
}

window.onclick = function (event) {
    if (event.target == orderModal) {
        orderModal.style.display = "none";
    }
}

function openOrderModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    modalTitle.textContent = `訂單詳情 - ${order.customerName}`;

    const startTimeStr = new Date(order.startTime).toLocaleString('zh-TW', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const endTimeStr = new Date(order.dueTime).toLocaleString('zh-TW', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Format duration display
    const hours = Math.floor(order.duration);
    const minutes = Math.round((order.duration - hours) * 60);
    let durationDisplay = '';
    if (hours > 0 && minutes > 0) {
        durationDisplay = `${hours}小時${minutes}分鐘`;
    } else if (hours > 0) {
        durationDisplay = `${hours}小時`;
    } else {
        durationDisplay = `${minutes}分鐘`;
    }

    modalBody.innerHTML = `
        <p><strong>客戶名稱:</strong> ${order.customerName}</p>
        <p><strong>訂單內容:</strong> ${order.orderDetails}</p>
        <p><strong>分配資源:</strong> ${order.resource}</p>
        <p><strong>開始時間:</strong> ${startTimeStr}</p>
        <p><strong>結束時間:</strong> ${endTimeStr}</p>
        <p><strong>預估工時:</strong> ${durationDisplay}</p>
        ${order.result ? `<p><strong>結果:</strong> ${order.result === 'success' ? '✅ 成功' : '❌ 異常'}</p>` : ''}
    `;

    // Update buttons dynamically
    const modalActions = document.querySelector('.modal-actions');
    if (modalActions) {
        if (order.status === 'completed') {
            // For completed orders, only show delete
            modalActions.innerHTML = `
                <button onclick="deleteOrder('${orderId}')" class="btn-delete btn-action">刪除</button>
            `;
        } else {
            // For active orders, show all actions
            modalActions.innerHTML = `
                <button onclick="deleteOrder('${orderId}')" class="btn-delete btn-action">刪除</button>
                <button onclick="addDuration('${orderId}')" class="btn-extend btn-action">延長時間</button>
                <button onclick="completeOrder('${orderId}', 'fail')" class="btn-action" style="background-color: var(--warning-color)">異常</button>
                <button onclick="completeOrder('${orderId}', 'success')" class="btn-complete btn-action">完成</button>
            `;
        }
    }

    orderModal.style.display = "block";
}

// Expose to global scope
window.openOrderModal = openOrderModal;
