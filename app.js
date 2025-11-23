// State
let orders = [];
let resources = ['機台 A', '機台 B', '師傅 C']; // Default resources
let timelineDate = new Date(); // Current date for timeline
let timelineZoom = 12; // Hours to show

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderResources();
    updateResourceSelect();
    requestNotificationPermission();

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

// --- Data Management (Cloud Sync) ---

const API_URL = 'https://script.google.com/macros/s/AKfycbzeJnGZgcjlIdUfFlCH6gkKgUhsJLvdRp2jeX75ONYYAQGXazmV7VrqShZ0uffujifS/exec';

async function loadData() {
    showLoading(true);
    try {
        // Load Resources from LocalStorage (Settings)
        const storedResources = localStorage.getItem('resources');
        if (storedResources) resources = JSON.parse(storedResources);

        // Load Orders from Google Sheet
        const response = await fetch(`${API_URL}?action=read`);
        const result = await response.json();

        if (result.status === 'success') {
            orders = result.data;
            // Convert timestamps back to numbers if needed (JSON might return strings)
            orders.forEach(o => {
                o.startTime = Number(o.startTime);
                o.dueTime = Number(o.dueTime);
                o.duration = Number(o.duration);
            });
            renderOrders();
            renderTimeline();
        } else {
            console.error('Cloud load error:', result.message);
            alert('無法從雲端讀取資料');
        }
    } catch (error) {
        console.error('Load error:', error);
        alert('連線錯誤，無法讀取資料');
    } finally {
        showLoading(false);
    }
}

async function saveData() {
    // Save Resources to LocalStorage
    localStorage.setItem('resources', JSON.stringify(resources));

    // Save Orders to Google Sheet
    showLoading(true, '儲存中...');
    try {
        // Fix: Append action=save to URL so GAS knows it's a save request
        // Fix: Send orders array directly as body so GAS can map it immediately
        const response = await fetch(`${API_URL}?action=save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(orders)
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
        alert('儲存失敗：' + error.message);
    } finally {
        showLoading(false);
        renderOrders();
        renderTimeline();
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

// --- Resource Management ---

function addResource() {
    const name = newResourceInput.value.trim();
    if (name && !resources.includes(name)) {
        resources.push(name);
        newResourceInput.value = '';
        saveData();
        renderResources();
        updateResourceSelect();
    }
}

function removeResource(name) {
    if (confirm(`確定要刪除資源 "${name}" 嗎？`)) {
        resources = resources.filter(r => r !== name);
        saveData();
        renderResources();
        updateResourceSelect();
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

function updateResourceSelect() {
    if (!resourceSelect) return;
    resourceSelect.innerHTML = resources.map(r => `<option value="${r}">${r}</option>`).join('');
}

// --- Order Management ---

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

function handleAddOrder(e) {
    e.preventDefault();

    const customerName = document.getElementById('customerName').value;
    const orderDetails = document.getElementById('orderDetails').value;
    const resource = document.getElementById('resource').value;
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

    const newOrder = {
        id: Date.now().toString(),
        customerName,
        orderDetails,
        resource,
        startTime,
        duration: durationInMinutes,
        dueTime,
        notified: false,
        status: 'active' // Default status
    };

    orders.push(newOrder);
    orders.sort((a, b) => a.dueTime - b.dueTime);

    saveData();
    orderForm.reset();
    resetFormTime();
}

function completeOrder(id) {
    const order = orders.find(o => o.id === id);
    if (order && confirm(`確定要完成訂單 "${order.customerName}" 嗎？\n這將會從列表中移除，但保留在資料庫紀錄中。`)) {
        order.status = 'completed';
        saveData();
    }
}

function addDuration(id) {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    const input = prompt(`請輸入要增加的分鐘數 (例如 30)：`, '30');
    if (input === null) return;

    const minutesToAdd = parseInt(input);
    if (isNaN(minutesToAdd) || minutesToAdd === 0) {
        alert('請輸入有效的數字');
        return;
    }

    order.duration += minutesToAdd;
    order.dueTime += (minutesToAdd * 60 * 1000);

    // Re-sort orders as due time changed
    orders.sort((a, b) => a.dueTime - b.dueTime);

    saveData();
}

function deleteOrder(id) {
    if (confirm('【警告】確定要永久刪除這筆訂單嗎？\n此動作無法復原，資料將從資料庫中完全移除。')) {
        orders = orders.filter(o => o.id !== id);
        saveData();
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
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}時`);
    parts.push(`${minutes}分`);
    parts.push(`${seconds}秒`);

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
    if ('Notification' in window) {
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
    zoomValue.textContent = `${timelineZoom}小時`;
    renderTimeline();
}

function changeZoom(delta) {
    let newZoom = timelineZoom + delta;
    if (newZoom < 4) newZoom = 4;
    if (newZoom > 24) newZoom = 24;

    if (newZoom !== timelineZoom) {
        timelineZoom = newZoom;
        zoomSlider.value = timelineZoom;
        zoomValue.textContent = `${timelineZoom}小時`;
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
    timelineDateDisplay.textContent = timelineDate.toLocaleDateString('zh-TW', options);
}

function renderOrders() {
    if (!orderCount || !orderList) return;

    // Filter active orders
    const activeOrders = orders.filter(o => o.status !== 'completed');
    orderCount.textContent = activeOrders.length;

    if (activeOrders.length === 0) {
        orderList.innerHTML = '<div class="empty-state">目前沒有進行中的訂單</div>';
        return;
    }

    orderList.innerHTML = activeOrders.map(order => {
        const dateStr = new Date(order.dueTime).toLocaleString('zh-TW', { hour12: false });
        // Format duration for display
        const durHours = order.duration / 60;
        const durStr = `${parseFloat(durHours.toFixed(1))} 小時`;

        return `
            <div class="order-item">
                <div class="order-info">
                    <h3>${order.customerName} <span class="tag">${order.resource}</span></h3>
                    <div class="order-details">${order.orderDetails}</div>
                    <div class="order-meta">
                        <span>工時：${durStr}</span>
                        <span>預計完成：${dateStr}</span>
                    </div>
                </div>
                <div class="order-actions">
                    <div id="timer-${order.id}" class="timer">計算中...</div>
                    <div class="action-buttons">
                        <button onclick="addDuration('${order.id}')" class="btn-action btn-extend">延時</button>
                        <button onclick="completeOrder('${order.id}')" class="btn-action btn-complete">完成</button>
                        <button onclick="deleteOrder('${order.id}')" class="btn-action btn-delete">刪除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    updateTimers();
}

function renderTimeline() {
    if (!timelineContainer || !timelineBody) return;

    // Start of the selected day (00:00)
    const startOfDay = new Date(timelineDate);
    startOfDay.setHours(0, 0, 0, 0);
    const startTimestamp = startOfDay.getTime();

    // Zoom logic:
    // Calculate scale factor: 24 / zoom
    const scaleFactor = 24 / timelineZoom;
    timelineContainer.style.setProperty('--scale-factor', scaleFactor);

    let html = '';

    // Time Axis
    html += `<div class="timeline-time-axis">`;
    for (let i = 0; i <= 24; i++) {
        html += `<div class="time-marker">${i.toString().padStart(2, '0')}</div>`;
    }
    html += '</div>';

    // Rows per resource
    resources.forEach(resource => {
        // Filter active orders for timeline
        const resourceOrders = orders.filter(o => o.resource === resource && o.status !== 'completed');

        html += `
            <div class="timeline-row">
                <div class="timeline-label">${resource}</div>
                <div class="timeline-track">
        `;

        resourceOrders.forEach(order => {
            // Check if order overlaps with this day
            const orderStart = order.startTime;
            const orderEnd = order.dueTime;
            const dayStart = startTimestamp;
            const dayEnd = startTimestamp + (24 * 60 * 60 * 1000);

            if (orderEnd < dayStart || orderStart > dayEnd) return;

            // Calculate position within the day
            // 0% = 00:00, 100% = 24:00
            const totalDayDuration = 24 * 60 * 60 * 1000;

            let startPercent = ((orderStart - dayStart) / totalDayDuration) * 100;
            let widthPercent = ((orderEnd - orderStart) / totalDayDuration) * 100;

            // Clip
            if (startPercent < 0) {
                widthPercent += startPercent;
                startPercent = 0;
            }
            if (startPercent + widthPercent > 100) {
                widthPercent = 100 - startPercent;
            }

            html += `
                <div class="timeline-block" style="left: ${startPercent}%; width: ${widthPercent}%;" title="${order.customerName}: ${order.orderDetails} (${formatTime(orderStart)} - ${formatTime(orderEnd)})">
                    ${order.customerName}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    timelineBody.innerHTML = html;
}

function formatTime(ms) {
    return new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Expose functions to global scope for HTML onclick
window.removeResource = removeResource;
window.deleteOrder = deleteOrder;
window.completeOrder = completeOrder;
window.addDuration = addDuration;
window.adjustDuration = adjustDuration;
window.changeDate = changeDate;
window.goToToday = goToToday;
window.changeZoom = changeZoom;
