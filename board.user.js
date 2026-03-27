// ==UserScript==
// @name         BigSeller Board
// @namespace    http://tampermonkey.net/
// @version      1
// @description  Dashboard Monitoring Futuristik BigSeller
// @author       Zain
// @match        https://www.bigseller.com/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // 1. KONFIGURASI GLOBAL & VARIABEL DASHBOARD
    // =========================================================================
    const TARGET_WAREHOUSE_ID = '44270'; // ID Gudang Utama 44270

    let orderData = null;
    let skuDataToday = null;
    let skuDataYesterday = null;
    let shopRankingData = null;
    let skuInventoryData = {};
    let isFetchingExtra = false;
    let isFetchingShop = false;
    let currentMode = 'order';
    let sortConfig = {
        key: 'saleNum',
        direction: 'desc'
    };

    // =========================================================================
    // 2. STYLING (CSS DASHBOARD FUTURISTIC)
    // =========================================================================
    const style = document.createElement('style');
    style.innerHTML = `
        :root {
            --bg-dark: #0f172a;
            --card-bg: #1e293b;
            --text-main: #ffffff;
            --text-muted: #cbd5e1;
            --neon-blue: #38bdf8;
            --neon-purple: #c084fc;
            --neon-green: #4ade80;
            --neon-gold: #fbbf24;
            --neon-red: #ef4444;
            --border-color: #334155;
        }
        #myCustomWrapper {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: var(--text-main);
            font-weight: 600;
            letter-spacing: 0.3px;
        }
        .bs-card {
            background: var(--card-bg);
            border: 2px solid var(--border-color);
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
        }
        .bs-btn {
            background: transparent;
            border: 2px solid var(--border-color);
            color: var(--text-muted);
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 800;
            font-size: 13px;
        }
        .bs-btn.active-order { background: rgba(56, 189, 248, 0.2); border-color: var(--neon-blue); color: var(--neon-blue); box-shadow: 0 0 15px rgba(56, 189, 248, 0.3); }
        .bs-btn.active-revenue { background: rgba(192, 132, 252, 0.2); border-color: var(--neon-purple); color: var(--neon-purple); box-shadow: 0 0 15px rgba(192, 132, 252, 0.3); }

        .bs-table th {
            background: #0f172a !important;
            color: var(--text-muted);
            border-bottom: 3px solid var(--border-color) !important;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 800 !important;
            font-size: 14px;
        }
        .bs-table td { border-bottom: 1px solid var(--border-color) !important; color: var(--text-main); font-weight: 600; font-size: 15px; }
        .bs-table tr:hover td { background: rgba(255,255,255,0.05); }

        .big-number { font-weight: 900 !important; letter-spacing: -1px; }
        .label-text { font-weight: 700 !important; color: var(--text-muted); text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
        .growth-box { text-align: right; min-width: 80px; }
        .growth-val { font-size: 20px; font-weight: 900; }
        .growth-lbl { font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }

        .bs-scroll::-webkit-scrollbar { width: 8px; }
        .bs-scroll::-webkit-scrollbar-track { background: #0f172a; }
        .bs-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
    `;
    document.head.appendChild(style);

    // =========================================================================
    // 3. HELPER FUNCTIONS
    // =========================================================================
    function getYesterdayStr() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    }

    function getTodayStr() {
        return new Date().toISOString().split('T')[0];
    }

    function getCurrentTimeStr() {
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    const formatCurr = (num) => "IDR " + Number(num).toLocaleString('id-ID');

    // --- FUNGSI DIPERBAIKI: Akumulasi data Hourly Kemarin sampai Jam Saat Ini ---
    function getYesterdaySumUpToNow(hourlyObj) {
        if (!hourlyObj) return 0;
        const currentHour = new Date().getHours();

        // Ubah format object {"00": 10, "01": 20} menjadi array murni berdasarkan urutan
        const values = Object.values(hourlyObj);
        let sum = 0;

        // Looping sebanyak jam saat ini (misal jam 10 pagi = loop dari index 0 sampai 10)
        for (let i = 0; i <= currentHour; i++) {
            if (values[i] && values[i] !== -1) {
                sum += values[i];
            }
        }
        return sum;
    }

    const renderGrowth = (growthData, isPos) => {
        if (!growthData || growthData.growthRatio === undefined) return '';
        const rawVal = parseFloat(growthData.growthRatio);
        if (isNaN(rawVal)) return '';

        const displayVal = Math.abs(rawVal);
        const color = isPos ? 'var(--neon-green)' : 'var(--neon-red)';
        const arrow = isPos ? '▲' : '▼';
        const shadow = isPos ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)';
        return `
            <div class="growth-box">
                <div class="growth-val" style="color: ${color}; text-shadow: 0 0 10px ${shadow};">
                    ${arrow} ${displayVal}%
                </div>
                <div class="growth-lbl">vs JAM SAMA</div>
            </div>
        `;
    };

    // =========================================================================
    // 4. NETWORK INTERCEPTOR (MENANGKAP DATA DASHBOARD)
    // =========================================================================
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            if (this.responseURL.includes('orderSaleStatNew.json')) {
                try {
                    const res = JSON.parse(this.responseText);
                    if (res.code === 0) {
                        orderData = res.data;
                        renderFullUI();
                    }
                } catch (e) {}
            }
            if (this.responseURL.includes('skuSaleStatNew.json')) {
                try {
                    const payload = JSON.parse(body || "{}");
                    if (!payload._isCustom) {
                        fetchTodayWithWarehouse(payload);
                        if (!isFetchingExtra) fetchExtraData();
                    }
                } catch (e) {}
            }
        });
        originalSend.apply(this, arguments);
    };

    // =========================================================================
    // 5. DATA FETCHING LOGIC
    // =========================================================================
    async function fetchTodayWithWarehouse(basePayload) {
        const payload = {
            ...basePayload,
            warehouseIdList: [TARGET_WAREHOUSE_ID],
            _isCustom: true
        };
        try {
            const res = await fetch('https://www.bigseller.com/api/v1/data/dashboard/skuSaleStatNew.json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.code === 0) {
                skuDataToday = json.data;
                renderFullUI();
            }
        } catch (e) {}
    }

    async function fetchShopRanking(mode) {
        isFetchingShop = true;
        renderFullUI();
        const queryType = mode === 'revenue' ? 'saleAmount' : 'orderNum';
        const payload = {
            searchType: "", currentDate: getTodayStr(), queryType: queryType,
            currentTime: getCurrentTimeStr(), currency: "IDR", curTheme: "white",
            platformList: [], shopIdList: [], shopGroupIdList: [], hotTopNum: 500, zone: "GMT+07:00"
        };
        try {
            const res = await fetch('https://www.bigseller.com/api/v1/data/dashboard/shopOrPlatformSaleStat.json', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.code === 0) {
                shopRankingData = json.data;
                if (shopRankingData && shopRankingData.length > 0) {
                    shopRankingData.sort((a, b) => {
                        if (mode === 'revenue') return b.saleAmount - a.saleAmount;
                        return b.orderNum - a.orderNum;
                    });
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            isFetchingShop = false;
            renderFullUI();
        }
    }

    async function fetchExtraData() {
        isFetchingExtra = true;
        renderFullUI();
        const yesterday = getYesterdayStr();

        const reportData = new URLSearchParams({
            currency: 'IDR', pageSize: '500', pageNo: '1', platform: '', searchType: 'sku',
            searchContent: '', inquireType: '0', beginDate: yesterday, endDate: yesterday,
            orderBy: 'efficientsOrders', desc: '1', categoryList: '', warehouseIds: TARGET_WAREHOUSE_ID,
            evalationOrder: '0', groupFields: 'sku', spuId: '', shopIds: '', groupType: '1', dimension: ''
        });

        const invData = new URLSearchParams({
            pageNo: '1', pageSize: '1000', searchType: 'skuName', queryDistribution: '1',
            openFlag: 'false', hideZeroInventorySku: '0', warehouseIds: TARGET_WAREHOUSE_ID
        });

        try {
            const [repRes, invRes] = await Promise.all([
                fetch('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: reportData.toString()
                }).then(r => r.json()),
                fetch('https://www.bigseller.com/api/v1/inventory/pageList.json', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: invData.toString()
                }).then(r => r.json())
            ]);

            if (repRes.code === 0) skuDataYesterday = repRes.data.rows;
            if (invRes.code === 0) {
                invRes.data.page.rows.forEach(row => {
                    skuInventoryData[row.sku] = row.available;
                });
            }
            await fetchShopRanking(currentMode);
        } catch (e) {} finally {
            isFetchingExtra = false;
            renderFullUI();
        }
    }

    // =========================================================================
    // 6. DASHBOARD SORTING & SWITCH LOGIC
    // =========================================================================
    function sortSkuData(data) {
        if (!data || data.length === 0) return [];
        return [...data].sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'title':
                    valA = a.title.toLowerCase(); valB = b.title.toLowerCase(); break;
                case 'saleNum':
                    valA = Number(a.saleNum); valB = Number(b.saleNum); break;
                case 'yesterday':
                    valA = Number((skuDataYesterday?.find(y => y.sku === a.sku))?.efficientsOrders || 0);
                    valB = Number((skuDataYesterday?.find(y => y.sku === b.sku))?.efficientsOrders || 0); break;
                case 'stock':
                    const stockA = skuInventoryData[a.sku] !== undefined ? skuInventoryData[a.sku] : (a.available || 1000);
                    const stockB = skuInventoryData[b.sku] !== undefined ? skuInventoryData[b.sku] : (b.available || 1000);
                    valA = stockA - 1000; valB = stockB - 1000; break;
                case 'revenue':
                    valA = Number(a.saleAmount); valB = Number(b.saleAmount); break;
                default: return 0;
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function handleSkuSort(key) {
        if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.key = key;
            sortConfig.direction = 'desc';
        }
        renderFullUI();
    }

    async function switchMode(newMode) {
        if (currentMode === newMode) return;
        currentMode = newMode;
        updateChart();
        await fetchShopRanking(newMode);
    }

    // =========================================================================
    // 7. RENDER UI / HTML DASHBOARD
    // =========================================================================
    function renderFullUI() {
        const headContent = document.querySelector('.head_content');
        if (!headContent) return;

        let wrapper = document.getElementById('myCustomWrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'myCustomWrapper';
            wrapper.style.cssText = "width: 98%; margin: 15px auto; clear: both;";
            headContent.parentNode.insertBefore(wrapper, headContent.nextSibling);
        }

        let summaryHtml = '';
        if (orderData) {
            const salesGrowth = orderData.salesAmountCycleComparison;
            const orderGrowth = orderData.orderNumCycleComparison;
            const skuGrowth = orderData.skuSaleNumCycleComparison;

            // --- FIX LOGIC: Evaluasi Positif/Negatif berdasarkan Jam Sama ---
            const yestRevUpToNow = getYesterdaySumUpToNow(orderData.yesPerHourVo);
            const isRevPos = orderData.todaySaleAmount >= yestRevUpToNow;

            const yestOrdUpToNow = getYesterdaySumUpToNow(orderData.yesterdayOderNumPerHourVo);
            const isOrdPos = orderData.todayOrderNum >= yestOrdUpToNow;

            const isSkuPos = skuGrowth && skuGrowth.growthRatio ? parseFloat(skuGrowth.growthRatio) >= 0 : true;

            summaryHtml = `
                <div class="bs-card" style="display: flex; gap: 20px; margin-bottom: 20px; padding: 5px;">
                    <div style="flex: 1; border-right: 2px solid var(--border-color); padding-right: 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div class="label-text">Dana Penjualan Pesanan Valid</div>
                            <div class="big-number" style="font-size: 36px; color: var(--neon-purple); text-shadow: 0 0 20px rgba(192, 132, 252, 0.4); margin: 5px 0;">${formatCurr(orderData.todaySaleAmount)}</div>
                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; line-height: 1.4;">
                                Kemarin (Jam Sama): <span style="color:#fff">${formatCurr(yestRevUpToNow)}</span><br>
                                Kemarin (Full Day): ${formatCurr(orderData.yesterdaySaleAmount)}
                            </div>
                        </div>
                        ${renderGrowth(salesGrowth, isRevPos)}
                    </div>

                    <div style="flex: 1; border-right: 2px solid var(--border-color); padding-left: 20px; padding-right: 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div class="label-text">Total Pesanan Valid</div>
                            <div class="big-number" style="font-size: 36px; color: var(--neon-blue); text-shadow: 0 0 20px rgba(56, 189, 248, 0.4); margin: 5px 0;">${orderData.todayOrderNum}</div>
                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; line-height: 1.4;">
                                Kemarin (Jam Sama): <span style="color:#fff">${yestOrdUpToNow}</span><br>
                                Kemarin (Full Day): ${orderData.yesterdayOrderNum}
                            </div>
                        </div>
                        ${renderGrowth(orderGrowth, isOrdPos)}
                    </div>

                    <div style="flex: 1; padding-left: 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div class="label-text">Jumlah Penjualan Produk Valid</div>
                            <div class="big-number" style="font-size: 36px; color: var(--neon-gold); text-shadow: 0 0 20px rgba(251, 191, 36, 0.4); margin: 5px 0;">${orderData.todaySkuSaleNum}</div>
                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; line-height: 1.4;">
                                <br>
                                Kemarin (Full Day): <span style="color:#fff">${orderData.yesterdaySkuSaleNum}</span>
                            </div>
                        </div>
                        ${renderGrowth(skuGrowth, isOrdPos)}
                    </div>
                </div>
            `;
        }

        const sortedSku = sortSkuData(skuDataToday);
        const getIconUi = (key) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽') : ' ↕️';

        const skuRows = sortedSku.map(item => {
            const yesterdayItem = (skuDataYesterday || []).find(y => y.sku === item.sku);
            const yesterdayEffSales = yesterdayItem ? yesterdayItem.efficientsVolume : 0;
            const rawInvAvailable = skuInventoryData[item.sku] !== undefined ? skuInventoryData[item.sku] : (item.available || 1000);
            const realStock = Math.max(0, rawInvAvailable - 1000);
            const stockGap = yesterdayEffSales - realStock;
            const isStockShort = realStock < yesterdayEffSales;
            const bgStyle = isStockShort ? 'background-color: rgba(239, 68, 68, 0.15);' : '';

            return `
                <tr style="${bgStyle}">
                    <td style="padding: 12px 10px; display: flex; align-items: center; gap: 15px;">
                        <img src="${item.image}" style="width: 40px; height: 40px; border-radius: 6px; border:1px solid var(--border-color);">
                        <div>
                            <div style="font-weight: 800; font-size: 14px; width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main);">${item.title}</div>
                            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted);">${item.sku}</div>
                        </div>
                    </td>
                    <td style="text-align: center; font-weight: 900; font-size: 16px; color: var(--neon-blue); text-shadow: 0 0 10px rgba(56, 189, 248, 0.3);">${item.saleNum}</td>
                    <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${skuDataYesterday ? yesterdayEffSales : '...'}</td>
                    <td style="text-align: center;">
                        <div style="font-weight: 900; font-size: 16px; color: ${isStockShort ? '#ef4444' : '#4ade80'}; text-shadow: 0 0 10px ${isStockShort ? 'rgba(239, 68, 68, 0.3)' : 'rgba(74, 222, 128, 0.3)'};">${realStock}</div>
                        ${isStockShort && yesterdayEffSales > 0 ? `<div style="color:#ef4444; font-size:14px; font-weight:800;">(${realStock} kurang ${stockGap})</div>` : ''}
                    </td>
                    <td style="text-align: right; font-weight: 700; color: var(--text-main);">Rp ${item.saleAmount.toLocaleString('id-ID')}</td>
                </tr>
            `;
        }).join('');

        let shopRows = '';
        if (shopRankingData) {
            shopRows = shopRankingData.map((shop, idx) => {
                const isHighlight = idx < 3;
                return `
                    <tr style="${isHighlight ? 'background: rgba(255,255,255,0.03);' : ''}">
                        <td style="padding: 12px 10px; font-weight: 700; color: var(--text-main);">
                            <span style="display:inline-block; width:25px; color:${isHighlight?'var(--neon-gold)':'var(--text-muted)'}; font-weight: 900;">${idx + 1}.</span> ${shop.title}
                        </td>
                        <td style="text-align: center; font-weight: 900; font-size: 15px; color: var(--neon-blue); ${currentMode === 'order' ? 'background:rgba(56, 189, 248, 0.15); border-radius:6px;' : ''}">
                            ${shop.orderNum}
                        </td>
                        <td style="text-align: right; font-weight: 800; color: var(--neon-purple); ${currentMode === 'revenue' ? 'background:rgba(192, 132, 252, 0.15); border-radius:6px;' : ''}">
                            Rp ${shop.saleAmount.toLocaleString('id-ID')}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        wrapper.innerHTML = `
            ${summaryHtml}
            <div class="bs-card" style="padding: 0px; margin-bottom: 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 15px;">
                    <button id="btnOrder" class="bs-btn ${currentMode==='order'?'active-order':''}" style="padding: 10px 25px; cursor: pointer; border-radius: 50px;">📦 Mode Pesanan</button>
                    <button id="btnRevenue" class="bs-btn ${currentMode==='revenue'?'active-revenue':''}" style="padding: 10px 25px; cursor: pointer; border-radius: 50px;">💰 Mode Revenue</button>
                </div>
                <div style="height: 380px;"><canvas id="myCustomChart"></canvas></div>
            </div>

            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div class="bs-card" style="flex: 1; min-width: 400px; padding: 20px; overflow: hidden;">
                    <h3 style="margin:0 0 20px 0; font-size:18px; font-weight: 800; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                        <span style="border-left: 4px solid var(--neon-green); padding-left: 12px;">Ranking SKU & Gap Stok</span>
                        <div style="text-align:right;">
                            <div style="font-size:12px; color:var(--neon-green); font-weight: 700;">📍 WH: ${TARGET_WAREHOUSE_ID}</div>
                            ${isFetchingExtra ? '<span style="font-size:11px; color:var(--neon-gold); font-weight: 700;">⌛ Sync Data...</span>' : ''}
                        </div>
                    </h3>
                    <div class="bs-scroll" style="max-height: 500px; overflow-y: auto;">
                        <table class="bs-table" style="width: 100%; border-collapse: collapse; font-size: 16px;">
                            <thead style="position: sticky; top: 0; z-index:10; cursor: pointer;">
                                <tr style="text-align: left;">
                                    <th id="th-title" style="padding: 15px 10px;">PRODUK ${getIconUi('title')}</th>
                                    <th id="th-saleNum" style="padding: 15px 10px; text-align: center;">TODAY ${getIconUi('saleNum')}</th>
                                    <th id="th-yesterday" style="padding: 15px 10px; text-align: center;">YESTERDAY ${getIconUi('yesterday')}</th>
                                    <th id="th-stock" style="padding: 15px 10px; text-align: center;">STOCK ${getIconUi('stock')}</th>
                                    <th id="th-revenue" style="padding: 15px 10px; text-align: right;">REVENUE ${getIconUi('revenue')}</th>
                                </tr>
                            </thead>
                            <tbody>${skuRows}</tbody>
                        </table>
                    </div>
                </div>

                <div class="bs-card" style="flex: 1; min-width: 300px; padding: 20px; overflow: hidden;">
                    <h3 style="margin:0 0 20px 0; font-size:18px; font-weight: 800; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                        <span style="border-left: 4px solid var(--neon-purple); padding-left: 12px;">🏆 Ranking Toko (${currentMode === 'order' ? 'Order' : 'Revenue'})</span>
                        ${isFetchingShop ? '<span style="font-size:12px; color:var(--neon-blue); font-weight: 700;">🔄 Loading...</span>' : ''}
                    </h3>
                    <div class="bs-scroll" style="max-height: 500px; overflow-y: auto;">
                        <table class="bs-table" style="width: 100%; border-collapse: collapse; font-size: 16px;">
                            <thead style="position: sticky; top: 0; z-index:10;">
                                <tr style="text-align: left;">
                                    <th style="padding: 15px 10px;">NAMA TOKO</th>
                                    <th style="padding: 15px 10px; text-align: center;">PESANAN</th>
                                    <th style="padding: 15px 10px; text-align: right;">REVENUE</th>
                                </tr>
                            </thead>
                            <tbody>${shopRows || '<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--text-muted);">Tidak ada data / Loading...</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Pasang Event Listeners
        ['title', 'saleNum', 'yesterday', 'stock', 'revenue'].forEach(key => {
            const th = document.getElementById(`th-${key}`);
            if (th) th.onclick = () => handleSkuSort(key);
        });

        document.getElementById('btnOrder').onclick = () => switchMode('order');
        document.getElementById('btnRevenue').onclick = () => switchMode('revenue');

        if (orderData) updateChart();
    }

    // =========================================================================
    // 8. RENDER GRAFIK CHART.JS
    // =========================================================================
    function updateChart() {
        const canvas = document.getElementById('myCustomChart');
        if (!canvas || !orderData) return;

        const isRev = currentMode === 'revenue';
        const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0') + ':00');
        const todaySet = Object.values(isRev ? (orderData.perHourSaleAmountVo || orderData.perHourVo) : orderData.todayOderNumPerHourVo).map(v => v === -1 ? 0 : v);
        const yesterdaySet = Object.values(isRev ? orderData.yesPerHourVo : orderData.yesterdayOderNumPerHourVo);

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart("myCustomChart");
        if (existingChart) existingChart.destroy();

        const gradientToday = ctx.createLinearGradient(0, 0, 0, 400);
        if (isRev) {
            gradientToday.addColorStop(0, '#c084fc');
            gradientToday.addColorStop(1, 'rgba(192, 132, 252, 0.2)');
        } else {
            gradientToday.addColorStop(0, '#38bdf8');
            gradientToday.addColorStop(1, 'rgba(56, 189, 248, 0.2)');
        }

        const gradientPrev = ctx.createLinearGradient(0, 0, 0, 400);
        gradientPrev.addColorStop(0, '#475569');
        gradientPrev.addColorStop(1, 'rgba(71, 85, 105, 0.1)');

        new Chart(canvas, {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label: 'Kemarin',
                    data: yesterdaySet,
                    backgroundColor: gradientPrev,
                    borderRadius: 4,
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        formatter: (val) => val > 0 ? (isRev ? (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K') : val) : '',
                        font: { size: 16, weight: 'bold' },
                        color: '#64748b'
                    }
                }, {
                    label: 'Hari Ini',
                    data: todaySet,
                    backgroundColor: gradientToday,
                    borderRadius: 4,
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: isRev ? '#c084fc' : '#38bdf8',
                        formatter: (val) => val > 0 ? (isRev ? (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K') : val) : '',
                        font: { size: 18, weight: '900' }
                    }
                }, {
                    label: 'Growth %',
                    data: todaySet.map((v, i) => (v === 0 && i > new Date().getHours()) ? null : 0),
                    type: 'line',
                    showLine: false,
                    pointRadius: 0,
                    datalabels: {
                        align: 'top',
                        anchor: 'start',
                        offset: 12,
                        color: (ctx) => (todaySet[ctx.dataIndex] - yesterdaySet[ctx.dataIndex]) >= 0 ? '#4ade80' : '#ef4444',
                        formatter: (val, ctx) => {
                            const i = ctx.dataIndex;
                            if (yesterdaySet[i] === 0 || todaySet[i] === 0) return '';
                            const percent = ((todaySet[i] - yesterdaySet[i]) / yesterdaySet[i] * 100).toFixed(0);
                            return (percent >= 0 ? '+' : '') + percent + '%';
                        },
                        font: { size: 16, weight: '900' },
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        borderRadius: 6,
                        padding: 6,
                        borderWidth: 1,
                        borderColor: '#334155'
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 30 } },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#cbd5e1', font: { size: 14, weight: 'bold' } }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f8fafc',
                        bodyColor: '#e2e8f0',
                        borderColor: '#334155',
                        borderWidth: 1,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 14 }
                    },
                    datalabels: { display: true, clip: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: '15%',
                        grid: { display: true, color: '#334155', tickLength: 0 },
                        ticks: { color: '#94a3b8', font: { weight: 'bold' } },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { weight: 'bold' } }
                    }
                }
            }
        });
    }

    // =========================================================================
    // 9. EVENT LOOP (MEMASTIKAN UI RENDER)
    // =========================================================================
    setInterval(() => {
        if (!document.getElementById('myCustomWrapper') && (skuDataToday || orderData)) {
            renderFullUI();
        }
    }, 4000);

})();
