# 蘇打餅挑戰計劃 — 部署說明

架構：一個 Cloudflare Worker（網頁＋API＋定時提醒）＋ D1（紀錄）。
全部都可以在 Cloudflare 後台用滑鼠完成，不需要終端機。

```
public/                    網頁本體（index.html 和 img/）
src/worker.js              Worker 進入點
functions/api/[[path]].js  後端：同步、LINE Webhook、提醒、AI 中繼
wrangler.jsonc             Worker 設定（D1 繫結、每 30 分鐘的定時）
schema.sql                 D1 資料表
```

## 一、把整個資料夾放上 GitHub

建一個 repo（例如 `challenge-plan`），把這個資料夾的內容全部上傳。

## 二、建立 D1 資料庫

1. Cloudflare 後台 → 儲存和資料庫 → D1 → 建立資料庫，名稱 `challenge-db`。
2. 進入資料庫 → Console，執行：
   `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated INTEGER NOT NULL);`
3. 複製這個資料庫的 ID，貼進 `wrangler.jsonc` 的 `database_id`。

## 三、建立 Worker 專案

1. Workers 和 Pages → 建立 → 連接 GitHub，選這個 repo。
2. 建置命令留空，部署命令維持 `npx wrangler deploy`，按 Deploy。

## 四、設定密鑰

進專案 → 設定 → 變數和密鑰，**類型都選「密鑰（Secret）」**
（選純文字的話，下次部署會被清掉）：

| 名稱 | 內容 |
|---|---|
| `ACCESS_CODE` | 通關碼，自己訂，告訴夥伴 |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings → Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API → Channel access token |
| `MINIMAX_API_KEY` | MiniMax 金鑰 |
| `MINIMAX_BASE_URL` | 選填。預設 `https://api.minimax.cn/v1`；連不上時改 `https://api.minimaxi.com/v1` |
| `MINIMAX_MODEL` | 選填。預設 `MiniMax-M3` |
| `SITE_URL` | 選填。你的網址，會附在提醒訊息最後 |

D1 繫結和定時提醒已經寫在 `wrangler.jsonc`，不用另外設定。

## 五、把 LINE 官方帳號接過來

1. LINE Developers → 你的 channel → Messaging API：
   - Webhook URL 填 `https://你的網址/api/line/webhook`，按 Verify。
   - 打開 Use webhook。
2. LINE Official Account Manager → 設定 → 回應設定：Webhook 開啟，自動回應訊息關閉。
3. 夥伴在官方帳號輸入：`綁定 通關碼`（例如 `綁定 meow123`），看到「綁定成功」就完成。

Webhook URL 換成新的網址後，舊的連結就自動失效，不需要另外刪除。

## 六、確認

- 打開網頁，輸入通關碼 → 頁尾顯示「紀錄已同步到雲端」。
- 提醒分頁按「傳一則測試訊息到 LINE」→ LINE 收到今天的任務。
- 在 LINE 輸入「今天」看今日任務、「本週」看週回顧；其他文字會由蘇打餅（MiniMax）回覆。

## 之後要改內容

計劃內容都在 `public/index.html` 最上方的 `CONFIG`：
兩個獎的 BV `tracks`、蓋章條件 `counters`、週目標 `actions`、每日任務 `daily`、里程碑 `weekTarget`、跑道 `bvMarks`、名單選項 `people`、打卡圖樣式 `share`。
改完推上 GitHub，Cloudflare 會自動重新部署。

## 注意

- 提醒時間是台北時間，只能設在整點或半點（每 30 分鐘檢查一次）。
- 目前設計是一位夥伴一個網站：一份紀錄、一個綁定的 LINE 使用者。
- 通關碼不要放進網址或公開的地方。
## 這一份的內容

- 同時追蹤 2027 台灣全國年會的「全新生活™挑戰獎」和「營養保健挑戰獎」（挑戰期 2026/10/1–2027/3/31，4/7 前送件）。
- 共用條件（卓越超連鎖店主 Q1、親推 2 位、3 張台灣全國年會門票）只要蓋一次章，兩個獎都算。
- 每天分兩欄記 BV：全新生活／Tower+、營養補充食品，各自累積到 3,500。開網站前已累積的 BV 寫在 `CONFIG.tracks` 的 `start`。
- 每週四的任務會自動帶出這週輪到的夥伴，名單在網站「名單」頁下方填。
- 吉祥物「蘇打餅」（家裡的蘇卡達象龜）：名字在 `CONFIG.mascot`；LINE 和 AI 的說話方式在 `functions/api/[[path]].js` 最上面的 `PERSONA`。
- 蘇打餅的貼圖在 `public/img/soda-*.png`，換圖時用同樣的檔名覆蓋即可。另外備了 soda-cry、soda-grumpy、soda-wow、soda-bow 可以之後用。


## LINE 要用另一個官方帳號

一個 LINE 官方帳號只能接一個 Webhook。達爾文豪宅計劃的官方帳號已經接在 darwin-plan，
所以這一份要接 LINE 提醒，需要另外建立一個官方帳號，拿它的 Channel secret 和 access token。
不接 LINE 也可以，網頁、雲端同步、AI 回覆都照常運作。

## iPhone 小工具

- 程式本體在 `public/widget.js`（隨網站一起部署）。
- 手機上的 Scriptable 只貼 `widget/蘇打餅小工具.js` 這段全英文的載入器，它會自動抓最新版本，改程式後不用重貼。

## 七、接收健康問卷的顧客結果（選填）

健康問卷網站（health-quiz）的顧客做完測驗後，會在背後把「姓名、在意的方向、症狀、推薦產品」送到這裡的收件匣。
下次用通關碼打開網站時，會自動加進名單、記一筆「健康問卷」接觸，並照跟進規則排好第 3、7、14、21 天的跟進。

1. 這個 Worker → 設定 → 變數和密鑰 → 新增，類型選「密鑰」：名稱 `INBOX_KEY`，內容自己訂一串長一點的英數字。
2. health-quiz 的 Worker 也新增同名、同內容的密鑰 `INBOX_KEY`。

收件鑰匙只能投遞，不能讀取紀錄。注意：瀏覽模式不用通關碼就看得到名單（含顧客的健康問卷內容），網址只分享給信任的人。
