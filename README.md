# Order Scheduler (訂單排程系統)

這是一個基於 Web 的個人訂單排程管理系統，專為單一使用者設計，用於管理訂單、資源分配以及視覺化排程。

## 功能特色

*   **訂單管理**：新增、修改、刪除訂單，支援多種工時輸入格式 (例如 1.5 或 1:30)。
*   **資源管理**：自訂機台或人力資源 (例如：機台 A, 師傅 B)。
*   **視覺化排程 (Gantt Chart)**：直觀的時間軸視圖，支援縮放 (Zoom) 和滾輪操作。
*   **雲端同步 (Google Sheets)**：
    *   使用 Google Sheets 作為後端資料庫。
    *   支援雙向同步：網頁操作自動存檔，重新整理自動讀取。
    *   **狀態追蹤**：支援「完成」訂單 (保留歷史紀錄) 與「永久刪除」。
*   **即時通知**：訂單逾期時發送瀏覽器通知。
*   **免安裝**：純 HTML/JS/CSS 架構，可直接部署於 GitHub Pages。

## 安裝與使用

### 1. 部署 Google Apps Script (後端)
本專案使用 Google Apps Script (GAS) 作為 API。
1.  建立一個新的 Google 試算表。
2.  點擊 `擴充功能` > `Apps Script`。
3.  將 `google_apps_script.js` 的內容複製貼上。
4.  **部署為網頁應用程式**：
    *   執行身分：**我 (Me)**
    *   誰可以存取：**任何人 (Anyone)**
5.  複製部署後的 **Web App URL**。

### 2. 設定前端
1.  打開 `app.js`。
2.  找到 `const API_URL = '...'`。
3.  將網址替換為您的 Web App URL。

### 3. 啟動網頁
直接用瀏覽器打開 `index.html` 即可使用。

## 部署到 GitHub Pages
1.  將本專案上傳至 GitHub Repository。
2.  在 Repository Settings > Pages 中，選擇 `main` branch 並儲存。
3.  獲得網址後即可分享給他人使用。

## 檔案結構
*   `index.html`: 主頁面結構
*   `style.css`: 樣式表
*   `app.js`: 前端邏輯與 API 串接
*   `google_apps_script.js`: Google Apps Script 後端程式碼
