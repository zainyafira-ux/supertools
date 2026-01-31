// ==UserScript==
// @name         BigSeller Ultimate Analytics Suite (Stock Optimized + Custom Range)
// @namespace    http://tampermonkey.net/
// @version      7.5
// @description  Analisa SKU & Stok (Smart Refresh) + Analisa Komparasi Custom Range
// @author       Gemini AI
// @match        https://www.bigseller.com/web/*
// @grant        GM_xmlhttpRequest
// @connect      www.bigseller.com
// ==/UserScript==

(function() {
    'use strict';

    // --- VARIABLES & CONFIG ---
    let currentData = [];
    let sortConfig = { key: 't0', direction: 'desc' };
    const container = document.createElement('div');

    // VARIABLE CACHE (Modul Stock)
    let historicalMaster = null;
    let isStockLoaded = false;

    // --- SETUP CONTAINER UTAMA (FULL PAGE) ---
    container.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh; background: #f0f2f5;
        z-index: 999999; overflow: auto; padding: 20px;
        font-family: 'Segoe UI', sans-serif; box-sizing: border-box;
    `;
    document.body.appendChild(container);

    // --- 1. INTEGRASI MENU (TIGA TOMBOL) ---
    function tryAddButtons() {
        const reportPanel = document.getElementById('nav_panel_report');
        if (!reportPanel) return;

        const wrappers = reportPanel.querySelectorAll('.nav_child_item_wrapper');
        let targetUl = null;

        for (const wrapper of wrappers) {
            const title = wrapper.querySelector('.nav_child_module_name');
            if (title && title.innerText.trim() === 'Analisa Penjualan') {
                targetUl = wrapper.querySelector('.nav_child_module_content');
                break;
            }
        }

        if (targetUl) {
            // TOMBOL 1: ANALISA SKU & STOK (DEFAULT) - BLUE
            if (!document.getElementById('btn-analytics-stock')) {
                const li = document.createElement('li');
                li.id = 'btn-analytics-stock';
                li.setAttribute('data-v-a26f38c8', '');
                const a = createMenuButton('📊 Analisa SKU & Stok', 'linear-gradient(to right, #1890ff, #096dd9)', 'rgba(24, 144, 255, 0.3)');
                a.onclick = (e) => { e.preventDefault(); openStockDashboard(); };
                li.appendChild(a); targetUl.appendChild(li);
            }

            // TOMBOL 2: ANALISA SKU CUSTOM - PURPLE
            if (!document.getElementById('btn-analytics-custom')) {
                const li = document.createElement('li');
                li.id = 'btn-analytics-custom';
                li.setAttribute('data-v-a26f38c8', '');
                const a = createMenuButton('📅 Analisa SKU Custom', 'linear-gradient(to right, #722ed1, #eb2f96)', 'rgba(235, 47, 150, 0.3)');
                a.onclick = (e) => { e.preventDefault(); openCustomDashboard(); };
                li.appendChild(a); targetUl.appendChild(li);
            }

            // TOMBOL 3: ANALISA TOKO CUSTOM - ORANGE (NEW)
            if (!document.getElementById('btn-analytics-store')) {
                const li = document.createElement('li');
                li.id = 'btn-analytics-store';
                li.setAttribute('data-v-a26f38c8', '');
                const a = createMenuButton('🏪 Analisa Toko Custom', 'linear-gradient(to right, #fa8c16, #fa541c)', 'rgba(250, 84, 28, 0.3)');
                a.onclick = (e) => { e.preventDefault(); openStoreDashboard(); };
                li.appendChild(a); targetUl.appendChild(li);
            }
        }
    }

    function createMenuButton(text, bgGradient, shadowColor) {
        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.className = 'nav_jump';
        a.setAttribute('data-v-a26f38c8', '');
        a.style.cssText = `
            color: #ffffff !important;
            background: ${bgGradient};
            border-radius: 4px; padding: 0 10px;
            display: flex; align-items: center; justify-content: center;
            height: 34px; margin-top: 5px; font-size: 12px;
            text-decoration: none; font-weight: 600;
            box-shadow: 0 3px 6px ${shadowColor};
            cursor: pointer; white-space: nowrap; transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        a.innerHTML = `<span data-v-a26f38c8="">${text}</span>`;
        return a;
    }

    setInterval(tryAddButtons, 1000);

    // --- HELPER: DATE & API ---
    const getFormatDate = (daysAgo) => {
        let d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };

    const apiRequest = (url, payload, isJson = false) => {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: { "Content-Type": isJson ? "application/json" : "application/x-www-form-urlencoded; charset=UTF-8" },
                data: isJson ? JSON.stringify(payload) : payload,
                onload: (res) => resolve(JSON.parse(res.responseText).data || [])
            });
        });
    };

    const apiGetRequest = (url) => {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                headers: { "Content-Type": "application/json" },
                onload: (res) => resolve(JSON.parse(res.responseText).data || [])
            });
        });
    };

    const formatRupiah = (val) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
    };

    // =========================================================================
    // MODULE 1: STOCK DASHBOARD LOGIC (OPTIMIZED)
    // =========================================================================
    function openStockDashboard() {
        container.style.display = 'block';
        if (isStockLoaded) return;
        sortConfig = { key: 't0', direction: 'desc' };
        loadStockData();
    }

    async function loadStockData() {
        const isRefreshed = isStockLoaded;
        container.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;"><h2 style="color:#001529;">⏳ ${isRefreshed ? 'Memperbarui Data NOW...' : 'Mengambil Data Lengkap...'}</h2></div>`;

        const pToday = {
            groupType: 1, warehouseIdList: [], orderBy: "saleNum", desc: true,
            currentDate: getFormatDate(0), currentTime: getFormatDate(0) + " 23:59:59",
            currency: "IDR", curTheme: "dark", platformList: [], shopIdList: [], shopGroupIdList: [], zone: "GMT+07:00"
        };

        const todayPromise = apiRequest('https://www.bigseller.com/api/v1/data/dashboard/skuSaleStatNew.json', pToday, true);

        let historyDataPromises = [];
        if (!historicalMaster) {
            const getValidPayload = (start, end) => `currency=IDR&pageSize=1000&pageNo=1&platform=&searchType=sku&searchContent=&inquireType=0&beginDate=${start}&endDate=${end}&orderBy=efficientsOrders&desc=1&categoryList=&warehouseIds=&evalationOrder=0&groupFields=sku&spuId=&shopIds=&groupType=1&dimension=`;
            historyDataPromises = Promise.all([
                apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getValidPayload(getFormatDate(1), getFormatDate(1))).then(d => d.rows || []),
                apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getValidPayload(getFormatDate(2), getFormatDate(2))).then(d => d.rows || []),
                apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getValidPayload(getFormatDate(7), getFormatDate(1))).then(d => d.rows || []),
                apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getValidPayload(getFormatDate(14), getFormatDate(8))).then(d => d.rows || []),
                apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getValidPayload(getFormatDate(30), getFormatDate(1))).then(d => d.rows || []),
                apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getValidPayload(getFormatDate(60), getFormatDate(31))).then(d => d.rows || [])
            ]);
        } else {
            historyDataPromises = Promise.resolve(null);
        }

        const [dT, historyResults] = await Promise.all([todayPromise, historyDataPromises]);

        if (historyResults) {
            historicalMaster = {};
            const [d1, d2, d7, d7p, d30, d30p] = historyResults;
            const process = (data, key) => {
                data.forEach(item => {
                    if (!historicalMaster[item.sku]) {
                        historicalMaster[item.sku] = { sku: item.sku, title: item.title, v1:0, v7:0, v7p:0, v30:0, v30p:0, stok: item.wholeWarehouseAvailable || 0 };
                    }
                    historicalMaster[item.sku][key] = item.efficientsVolume || 0;
                    if (item.wholeWarehouseAvailable !== undefined) historicalMaster[item.sku].stok = item.wholeWarehouseAvailable;
                });
            };
            process(d1, 'v1'); process(d2, 'v2'); process(d7, 'v7'); process(d7p, 'v7p'); process(d30, 'v30'); process(d30p, 'v30p');
        }

        const finalMap = {};
        for (let sku in historicalMaster) finalMap[sku] = { ...historicalMaster[sku], t0: 0 };

        dT.forEach(item => {
            if (!finalMap[item.sku]) finalMap[item.sku] = { sku: item.sku, title: item.title, v1:0, v7:0, v7p:0, v30:0, v30p:0, stok: item.available || 0, t0: 0 };
            finalMap[item.sku].t0 = item.saleNum;
        });

        currentData = Object.values(finalMap).map(m => {
            const calcG = (c, p) => p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100;
            return { ...m, gt: calcG(m.t0, m.v1), g7: calcG(m.v7, m.v7p), g30: calcG(m.v30, m.v30p), adjStock: m.stok - 1000, dailyGap: m.v1 - m.t0 };
        });

        isStockLoaded = true;
        renderStockTable();
    }

    function renderStockTable() {
        const sorted = [...currentData].sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
        const getIcon = (k) => sortConfig.key === k ? (sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽') : ' ↕️';

        let html = `
            <div style="max-width:1400px; margin:0 auto; background:white; padding:20px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; margin-bottom:20px; align-items:center;">
                    <div><h1 style="margin:0; font-size:24px; color:#001529;">🚀 Dashboard SKU & Stok</h1><p style="margin:5px 0 0; color:#666; font-size:13px;">Data Updated: ${new Date().toLocaleTimeString()}</p></div>
                    <div>
                        <button id="refreshBtn" style="background:#1890ff; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:10px;">🔄 Refresh NOW</button>
                        <button id="exportBtn" style="background:#52c41a; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:10px;">📥 Excel</button>
                        <button id="closeBtn" style="background:#ff4d4f; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">✖ Tutup</button>
                    </div>
                </div>
                <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; text-align:center;">
                    <thead style="position:sticky; top:0; background:#fafafa; z-index:10;"><tr style="color:white; font-size:13px;"><th style="padding:15px; text-align:left; background:#595959;">SKU / Produk</th><th class="sortable" data-key="t0" style="padding:10px; background:#1d39c4; cursor:pointer;">NOW${getIcon('t0')}</th><th class="sortable" data-key="v1" style="padding:10px; background:#389e0d; cursor:pointer;">YESTERDAY${getIcon('v1')}</th><th class="sortable" data-key="gt" style="padding:10px; background:#08979c; cursor:pointer;">NOW vs YTD${getIcon('gt')}</th><th class="sortable" data-key="v7" style="padding:10px; background:#d46b08; cursor:pointer;">7D (Last vs Prev)${getIcon('v7')}</th><th class="sortable" data-key="v30" style="padding:10px; background:#c41d7f; cursor:pointer;">30D (Last vs Prev)${getIcon('v30')}</th><th class="sortable" data-key="dailyGap" style="padding:10px; background:#096dd9; border-left:2px solid white; cursor:pointer;">YESTERDAY - NOW${getIcon('dailyGap')}</th><th class="sortable" data-key="adjStock" style="padding:10px; background:#874d00; cursor:pointer;">Stok -1K${getIcon('adjStock')}</th><th class="sortable" data-key="adjStock" style="padding:10px; background:#22075e; cursor:pointer;">Status${getIcon('adjStock')}</th></tr></thead><tbody>
        `;

        sorted.forEach((m, idx) => {
            const bg = idx % 2 === 0 ? '#fff' : '#f9f9f9';
            const renderBadge = (v) => `<b style="color:${v>0?'#52c41a':(v<0?'#f5222d':'#bfbfbf')}; font-size:13px;">${v>0?'+':''}${v.toFixed(1)}%</b>`;
            html += `<tr style="background:${bg}; border-bottom:1px solid #eee;"><td style="padding:12px; text-align:left;"><div style="font-weight:700; color:#1890ff; font-size:15px;">${m.sku}</div><div style="font-size:11px; color:#666; max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.title}</div></td><td style="padding:10px; font-size:18px; font-weight:bold;">${m.t0}</td><td style="padding:10px; font-size:18px; font-weight:bold;">${m.v1}</td><td style="padding:10px;">${renderBadge(m.gt)}</td><td style="padding:10px;"><span style="font-weight:bold; font-size:16px;">${m.v7}</span> <span style="color:#8c8c8c; font-size:12px;">vs ${m.v7p}</span><br>${renderBadge(m.g7)}</td><td style="padding:10px;"><span style="font-weight:bold; font-size:16px;">${m.v30}</span> <span style="color:#8c8c8c; font-size:12px;">vs ${m.v30p}</span><br>${renderBadge(m.g30)}</td><td style="padding:10px; font-size:16px; font-weight:bold; color:${m.dailyGap>0?'#fa8c16':'#52c41a'}; border-left:1px solid #f0f0f0;">${m.dailyGap}</td><td style="padding:10px; font-size:18px; font-weight:bold; color:${m.adjStock<0?'#f5222d':'#262626'};">${m.adjStock}</td><td style="padding:10px;"><span style="background:${m.adjStock<0?'#fff1f0':'#f6ffed'}; color:${m.adjStock<0?'#f5222d':'#52c41a'}; padding:4px 10px; border-radius:15px; font-weight:bold; font-size:11px;">${m.adjStock<0?'⚠️ KURANG':'✅ AMAN'}</span></td></tr>`;
        });

        html += '</tbody></table></div></div>';
        container.innerHTML = html;
        document.getElementById('closeBtn').onclick = () => container.style.display = 'none';
        document.getElementById('refreshBtn').onclick = loadStockData;
        document.getElementById('exportBtn').onclick = () => exportToCSV(currentData, 'Stock_Analysis');
        container.querySelectorAll('.sortable').forEach(th => th.addEventListener('click', () => { sortConfig.direction = (sortConfig.key === th.getAttribute('data-key') && sortConfig.direction === 'desc') ? 'asc' : 'desc'; sortConfig.key = th.getAttribute('data-key'); renderStockTable(); }));
    }

    // =========================================================================
    // MODULE 2: SKU CUSTOM RANGE (NO STOCK)
    // =========================================================================
    function openCustomDashboard() {
        container.style.display = 'block';
        sortConfig = { key: 'diff', direction: 'desc' };
        if (!document.getElementById('custom-filters-sku')) renderCustomLayout();
    }

    function renderCustomLayout() {
        const today = new Date();
        const dEndB = new Date(today); dEndB.setDate(today.getDate() - 1);
        const dStartB = new Date(today); dStartB.setDate(today.getDate() - 7);
        const dEndA = new Date(dStartB); dEndA.setDate(dStartB.getDate() - 1);
        const dStartA = new Date(dEndA); dStartA.setDate(dEndA.getDate() - 6);
        const fmt = d => d.toISOString().split('T')[0];

        container.innerHTML = `
            <div style="max-width:1400px; margin:0 auto; background:white; padding:25px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
                <div style="border-bottom:1px solid #eee; padding-bottom:20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:20px;"><h1 style="margin:0; font-size:24px; color:#001529;">📅 Analisa SKU Custom</h1><button id="closeBtnCompare" style="background:#ff4d4f; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">✖ Tutup</button></div>
                    <div id="custom-filters-sku" style="display:flex; gap:20px; align-items:flex-end; background:#f9f9f9; padding:20px; border-radius:8px; border:1px solid #eee;">
                        <div style="display:flex; flex-direction:column; gap:5px;"><label style="font-weight:bold; font-size:12px; color:#595959;">PERIODE 1 (BASELINE)</label><div style="display:flex; gap:5px;"><input type="date" id="dateStartA" value="${fmt(dStartA)}" style="padding:8px; border:1px solid #d9d9d9; border-radius:4px;"><span style="font-weight:bold;">-</span><input type="date" id="dateEndA" value="${fmt(dEndA)}" style="padding:8px; border:1px solid #d9d9d9; border-radius:4px;"></div></div>
                        <div style="font-weight:bold; font-size:20px; color:#bfbfbf; padding-bottom:5px;">VS</div>
                        <div style="display:flex; flex-direction:column; gap:5px;"><label style="font-weight:bold; font-size:12px; color:#722ed1;">PERIODE 2 (KOMPARASI)</label><div style="display:flex; gap:5px;"><input type="date" id="dateStartB" value="${fmt(dStartB)}" style="padding:8px; border:1px solid #722ed1; border-radius:4px;"><span style="font-weight:bold; color:#722ed1;">-</span><input type="date" id="dateEndB" value="${fmt(dEndB)}" style="padding:8px; border:1px solid #722ed1; border-radius:4px;"></div></div>
                        <div style="margin-left:auto; display:flex; gap:10px;"><button id="runCompareBtn" style="background:linear-gradient(to right, #722ed1, #eb2f96); color:white; border:none; padding:10px 25px; border-radius:4px; font-weight:bold; cursor:pointer;">🚀 BANDINGKAN</button><button id="exportCsvBtnCompare" style="background:#52c41a; color:white; border:none; padding:10px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">📥 CSV</button></div>
                    </div>
                </div>
                <div id="resultAreaCompare" style="min-height:400px;"><div style="text-align:center; color:#999; padding:100px;"><h3>Silakan pilih tanggal dan klik tombol "Bandingkan"</h3></div></div>
            </div>`;

        document.getElementById('closeBtnCompare').onclick = () => container.style.display = 'none';
        document.getElementById('runCompareBtn').onclick = runCustomAnalysis;
        document.getElementById('exportCsvBtnCompare').onclick = () => exportToCSV(currentData, 'SKU_Custom_Compare');
    }

    async function runCustomAnalysis() {
        const dSA = document.getElementById('dateStartA').value;
        const dEA = document.getElementById('dateEndA').value;
        const dSB = document.getElementById('dateStartB').value;
        const dEB = document.getElementById('dateEndB').value;
        document.getElementById('resultAreaCompare').innerHTML = '<div style="text-align:center; padding:50px;"><h2 style="color:#722ed1;">⏳ Sedang mengambil data API...</h2></div>';

        const getPayload = (s, e) => `currency=IDR&pageSize=1000&pageNo=1&platform=&searchType=sku&searchContent=&inquireType=0&beginDate=${s}&endDate=${e}&orderBy=efficientsOrders&desc=1&categoryList=&warehouseIds=&evalationOrder=0&groupFields=sku&spuId=&shopIds=&groupType=1&dimension=`;
        const [dataA, dataB] = await Promise.all([
            apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getPayload(dSA, dEA)).then(d => d.rows || []),
            apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', getPayload(dSB, dEB)).then(d => d.rows || [])
        ]);

        const master = {};
        const initSku = (i) => ({ sku: i.sku, title: i.title, valA: 0, valB: 0 });
        dataA.forEach(i => { if(!master[i.sku]) master[i.sku] = initSku(i); master[i.sku].valA = i.efficientsVolume; });
        dataB.forEach(i => { if(!master[i.sku]) master[i.sku] = initSku(i); master[i.sku].valB = i.efficientsVolume; });

        currentData = Object.values(master).map(m => {
            const diff = m.valB - m.valA;
            let growth = m.valA === 0 ? (m.valB > 0 ? 100 : 0) : ((diff / m.valA) * 100);
            return { ...m, diff, growth };
        });
        currentData.sort((a,b) => b.diff - a.diff);
        renderCustomTable();
    }

    function renderCustomTable() {
        const sorted = [...currentData].sort((a, b) => { const valA = a[sortConfig.key]; const valB = b[sortConfig.key]; return sortConfig.direction === 'asc' ? valA - valB : valB - valA; });
        const getIcon = (k) => sortConfig.key === k ? (sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽') : ' ↕️';
        let html = `<table style="width:100%; border-collapse:collapse; text-align:center; font-size:13px;"><thead style="position:sticky; top:0; background:#fafafa; z-index:10;"><tr style="color:white;"><th style="padding:15px; text-align:left; background:#595959; width:300px;">SKU / Produk</th><th class="sortable" data-key="valA" style="padding:12px; background:#8c8c8c; cursor:pointer;">Periode 1${getIcon('valA')}</th><th class="sortable" data-key="valB" style="padding:12px; background:#722ed1; cursor:pointer;">Periode 2${getIcon('valB')}</th><th class="sortable" data-key="diff" style="padding:12px; background:#13c2c2; cursor:pointer;">Selisih (Unit)${getIcon('diff')}</th><th class="sortable" data-key="growth" style="padding:12px; background:#eb2f96; border-radius:0 4px 4px 0; cursor:pointer;">Growth %${getIcon('growth')}</th></tr></thead><tbody>`;
        sorted.forEach((m, idx) => {
            const bg = idx % 2 === 0 ? '#fff' : '#f9f9f9';
            const diffColor = m.diff > 0 ? '#52c41a' : (m.diff < 0 ? '#f5222d' : '#bfbfbf');
            html += `<tr style="background:${bg}; border-bottom:1px solid #eee;"><td style="padding:12px; text-align:left;"><div style="font-weight:bold; color:#722ed1;">${m.sku}</div><div style="font-size:11px; color:#666;">${m.title}</div></td><td style="padding:12px; font-weight:bold; font-size:16px; color:#595959;">${m.valA}</td><td style="padding:12px; font-weight:bold; font-size:16px; color:#722ed1;">${m.valB}</td><td style="padding:12px; font-weight:bold; color:${diffColor}; background:${m.diff!==0?(m.diff>0?'#f6ffed':'#fff1f0'):'transparent'}">${m.diff>0?'+':''}${m.diff}</td><td style="padding:12px; font-weight:bold; color:${diffColor};">${m.diff>0?'+':''}${m.growth.toFixed(1)}%</td></tr>`;
        });
        html += '</tbody></table>';
        const res = document.getElementById('resultAreaCompare'); res.innerHTML = html;
        res.querySelectorAll('.sortable').forEach(th => th.addEventListener('click', () => { sortConfig.direction = (sortConfig.key === th.getAttribute('data-key') && sortConfig.direction === 'desc') ? 'asc' : 'desc'; sortConfig.key = th.getAttribute('data-key'); renderCustomTable(); }));
    }

    // =========================================================================
    // MODULE 3: STORE CUSTOM RANGE (NEW with Order Growth)
    // =========================================================================
    function openStoreDashboard() {
        container.style.display = 'block';
        sortConfig = { key: 'diffRev', direction: 'desc' };
        if (!document.getElementById('custom-filters-store')) renderStoreLayout();
    }

    function renderStoreLayout() {
        const today = new Date();
        const dEndB = new Date(today); dEndB.setDate(today.getDate() - 1);
        const dStartB = new Date(today); dStartB.setDate(today.getDate() - 7);
        const dEndA = new Date(dStartB); dEndA.setDate(dStartB.getDate() - 1);
        const dStartA = new Date(dEndA); dStartA.setDate(dEndA.getDate() - 6);
        const fmt = d => d.toISOString().split('T')[0];

        container.innerHTML = `
            <div style="max-width:1400px; margin:0 auto; background:white; padding:25px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
                <div style="border-bottom:1px solid #eee; padding-bottom:20px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                        <h1 style="margin:0; font-size:24px; color:#fa541c;">🏪 Analisa Toko Custom</h1>
                        <button id="closeBtnStore" style="background:#ff4d4f; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">✖ Tutup</button>
                    </div>
                    <div id="custom-filters-store" style="display:flex; gap:20px; align-items:flex-end; background:#fff7e6; padding:20px; border-radius:8px; border:1px solid #ffd591;">
                        <div style="display:flex; flex-direction:column; gap:5px;"><label style="font-weight:bold; font-size:12px; color:#595959;">PERIODE 1 (BASELINE)</label><div style="display:flex; gap:5px;"><input type="date" id="storeDateStartA" value="${fmt(dStartA)}" style="padding:8px; border:1px solid #d9d9d9; border-radius:4px;"><span style="font-weight:bold;">-</span><input type="date" id="storeDateEndA" value="${fmt(dEndA)}" style="padding:8px; border:1px solid #d9d9d9; border-radius:4px;"></div></div>
                        <div style="font-weight:bold; font-size:20px; color:#fa8c16; padding-bottom:5px;">VS</div>
                        <div style="display:flex; flex-direction:column; gap:5px;"><label style="font-weight:bold; font-size:12px; color:#fa541c;">PERIODE 2 (KOMPARASI)</label><div style="display:flex; gap:5px;"><input type="date" id="storeDateStartB" value="${fmt(dStartB)}" style="padding:8px; border:1px solid #fa541c; border-radius:4px;"><span style="font-weight:bold; color:#fa541c;">-</span><input type="date" id="storeDateEndB" value="${fmt(dEndB)}" style="padding:8px; border:1px solid #fa541c; border-radius:4px;"></div></div>
                        <div style="margin-left:auto; display:flex; gap:10px;">
                            <button id="runStoreBtn" style="background:linear-gradient(to right, #fa8c16, #fa541c); color:white; border:none; padding:10px 25px; border-radius:4px; font-weight:bold; cursor:pointer;">🚀 BANDINGKAN TOKO</button>
                            <button id="exportCsvBtnStore" style="background:#52c41a; color:white; border:none; padding:10px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">📥 CSV</button>
                        </div>
                    </div>
                </div>
                <div id="resultAreaStore" style="min-height:400px;"><div style="text-align:center; color:#999; padding:100px;"><h3>Pilih tanggal dan klik "Bandingkan Toko"</h3></div></div>
            </div>`;

        document.getElementById('closeBtnStore').onclick = () => container.style.display = 'none';
        document.getElementById('runStoreBtn').onclick = runStoreAnalysis;
        document.getElementById('exportCsvBtnStore').onclick = () => exportToCSV(currentData, 'Store_Compare');
    }

    async function runStoreAnalysis() {
        const dSA = document.getElementById('storeDateStartA').value;
        const dEA = document.getElementById('storeDateEndA').value;
        const dSB = document.getElementById('storeDateStartB').value;
        const dEB = document.getElementById('storeDateEndB').value;
        const resArea = document.getElementById('resultAreaStore');

        resArea.innerHTML = '<div style="text-align:center; padding:50px;"><h2 style="color:#fa8c16;">⏳ Mengambil data performa toko...</h2></div>';

        const getUrl = (s, e) => `https://www.bigseller.com/api/v1/getStoreAnalysisDetail.json?currency=IDR&platform=&queryType=day&beginDate=${s}&endDate=${e}&type=store&evalationOrder=0&shopIds=`;

        try {
            const [dataA, dataB] = await Promise.all([
                apiGetRequest(getUrl(dSA, dEA)),
                apiGetRequest(getUrl(dSB, dEB))
            ]);
            processStoreData(dataA, dataB);
        } catch (e) {
            resArea.innerHTML = '<h3 style="text-align:center; color:red;">❌ Error API Toko.</h3>';
        }
    }

    function processStoreData(dataA, dataB) {
        const master = {};
        const initShop = (i) => ({ id: i.shopId, name: i.shopName, revA:0, revB:0, ordA:0, ordB:0 });

        dataA.forEach(i => { if(!master[i.shopId]) master[i.shopId] = initShop(i); master[i.shopId].revA = i.validSellAmount; master[i.shopId].ordA = i.validOrderCount; });
        dataB.forEach(i => { if(!master[i.shopId]) master[i.shopId] = initShop(i); master[i.shopId].revB = i.validSellAmount; master[i.shopId].ordB = i.validOrderCount; });

        currentData = Object.values(master).map(m => {
            const diffRev = m.revB - m.revA;
            let growthRev = m.revA === 0 ? (m.revB > 0 ? 100 : 0) : ((diffRev / m.revA) * 100);

            const diffOrd = m.ordB - m.ordA;
            let growthOrd = m.ordA === 0 ? (m.ordB > 0 ? 100 : 0) : ((diffOrd / m.ordA) * 100);

            return { ...m, diffRev, growthRev, diffOrd, growthOrd };
        });

        currentData.sort((a,b) => b.diffRev - a.diffRev);
        renderStoreTable();
    }

    function renderStoreTable() {
        const sorted = [...currentData].sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
        const getIcon = (k) => sortConfig.key === k ? (sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽') : ' ↕️';
        const resArea = document.getElementById('resultAreaStore');

        let html = `
            <table style="width:100%; border-collapse:collapse; text-align:center; font-size:13px;">
                <thead style="position:sticky; top:0; background:#fafafa; z-index:10;">
                    <tr style="color:white;">
                        <th style="padding:15px; text-align:left; background:#595959; width:250px;color:white;">Nama Toko</th>
                        <th class="sortable" data-key="revA" style="padding:12px; background:#8c8c8c; cursor:pointer;color:white;">Omzet P1${getIcon('revA')}</th>
                        <th class="sortable" data-key="revB" style="padding:12px; background:#fa541c; cursor:pointer;color:white;">Omzet P2${getIcon('revB')}</th>
                        <th class="sortable" data-key="diffRev" style="padding:12px; background:#13c2c2; cursor:pointer;color:white;">Selisih Omzet${getIcon('diffRev')}</th>
                        <th class="sortable" data-key="growthRev" style="padding:12px; background:#eb2f96; cursor:pointer;color:white;">Growth %${getIcon('growthRev')}</th>
                        <th class="sortable" data-key="ordA" style="padding:12px; background:#8c8c8c; cursor:pointer;color:white;">Order P1${getIcon('ordA')}</th>
                        <th class="sortable" data-key="ordB" style="padding:12px; background:#fa541c; cursor:pointer;color:white;">Order P2${getIcon('ordB')}</th>
                        <th class="sortable" data-key="diffOrd" style="padding:12px; background:#722ed1; cursor:pointer;color:white;">Selisih Order${getIcon('diffOrd')}</th>
                        <th class="sortable" data-key="growthOrd" style="padding:12px; background:#eb2f96; border-radius:0 4px 4px 0; cursor:pointer;color:white;">Growth Order %${getIcon('growthOrd')}</th>
                    </tr>
                </thead>
                <tbody>`;

        sorted.forEach((m, idx) => {
            const bg = idx % 2 === 0 ? '#fff' : '#fff7e6';
            const diffColor = m.diffRev > 0 ? '#52c41a' : (m.diffRev < 0 ? '#f5222d' : '#bfbfbf');
            const diffOrdColor = m.diffOrd > 0 ? '#52c41a' : (m.diffOrd < 0 ? '#f5222d' : '#bfbfbf');
            const diffSign = m.diffRev > 0 ? '+' : '';
            const diffOrdSign = m.diffOrd > 0 ? '+' : '';

            html += `<tr style="background:${bg}; border-bottom:1px solid #eee;">
                <td style="padding:12px; text-align:left; font-weight:bold; color:#fa541c;">${m.name}</td>
                <td style="padding:12px;">${formatRupiah(m.revA)}</td>
                <td style="padding:12px; font-weight:bold; color:#fa541c;">${formatRupiah(m.revB)}</td>
                <td style="padding:12px; font-weight:bold; color:${diffColor};">${diffSign}${formatRupiah(m.diffRev)}</td>
                <td style="padding:12px; font-weight:bold; color:${diffColor};">${diffSign}${m.growthRev.toFixed(1)}%</td>
                <td style="padding:12px;">${m.ordA}</td>
                <td style="padding:12px; font-weight:bold;">${m.ordB}</td>
                <td style="padding:12px; font-weight:bold; color:${diffOrdColor};">${diffOrdSign}${m.diffOrd}</td>
                <td style="padding:12px; font-weight:bold; color:${diffOrdColor};">${diffOrdSign}${m.growthOrd.toFixed(1)}%</td>
            </tr>`;
        });
        html += '</tbody></table>';
        resArea.innerHTML = html;
        resArea.querySelectorAll('.sortable').forEach(th => th.addEventListener('click', () => { sortConfig.direction = (sortConfig.key === th.getAttribute('data-key') && sortConfig.direction === 'desc') ? 'asc' : 'desc'; sortConfig.key = th.getAttribute('data-key'); renderStoreTable(); }));
    }

    // --- SHARED EXPORT FUNCTION ---
    function exportToCSV(data, filenamePrefix) {
        if (!data || data.length === 0) { alert('Data kosong!'); return; }
        let headers, rows;

        if (filenamePrefix.includes('Store_Compare')) {
            headers = ["Nama Toko", "Omzet P1", "Omzet P2", "Selisih Omzet", "Growth Rev %", "Order P1", "Order P2", "Selisih Order", "Growth Order %"];
            rows = data.map(m => [`"${m.name}"`, m.revA, m.revB, m.diffRev, m.growthRev.toFixed(2)+'%', m.ordA, m.ordB, m.diffOrd, m.growthOrd.toFixed(2)+'%']);
        } else if (filenamePrefix.includes('Custom_Compare')) {
            headers = ["SKU", "Produk", "Periode 1", "Periode 2", "Selisih", "Growth %"];
            rows = data.map(m => [`"${m.sku}"`, `"${m.title.replace(/"/g, '""')}"`, m.valA, m.valB, m.diff, m.growth.toFixed(2) + '%']);
        } else {
            headers = ["SKU", "Produk", "NOW", "Yesterday", "Growth(Now vs Y)", "7D Last", "7D Prev", "Growth 7D", "30D Last", "30D Prev", "Growth 30D", "Gap (Y-N)", "Stok Real", "Stok -1K", "Status"];
            rows = data.map(m => [`"${m.sku}"`, `"${m.title.replace(/"/g, '""')}"`, m.t0, m.v1, m.gt.toFixed(2), m.v7, m.v7p, m.g7.toFixed(2), m.v30, m.v30p, m.g30.toFixed(2), m.dailyGap, m.stok, m.adjStock, m.adjStock < 0 ? 'KURANG' : 'AMAN']);
        }

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${filenamePrefix}_${getFormatDate(0)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

})();
