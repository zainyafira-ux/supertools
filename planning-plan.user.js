// ==UserScript==
// @name         BigSeller Planning Plan
// @namespace    http://tampermonkey.net/
// @version      1
// @description  Fitur Planning Plan dengan Dynamic Color Ketahanan Stok >= 14
// @author       Zain
// @match        https://www.bigseller.com/*
// @grant        GM_xmlhttpRequest
// @connect      www.bigseller.com
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. KONFIGURASI GLOBAL
    // ==========================================
    const TARGET_WAREHOUSE_ID = '44270'; // ID Gudang Utama
    let planningData = [];
    let currentSort = { key: 'qtyKurang', direction: 'desc' };

    // Container Modal Khusus Planning
    const modalPlan = document.createElement('div');
    modalPlan.id = 'bs-plan-modal';
    modalPlan.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh; background: rgba(0,0,0,0.6);
        z-index: 9999999; overflow: auto; padding: 20px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; box-sizing: border-box;
    `;
    document.body.appendChild(modalPlan);

    // ==========================================
    // 2. CSS STYLING
    // ==========================================
    const style = document.createElement('style');
    style.innerHTML = `
        /* Tabel Planning Styling */
        .plan-table { width: 100%; border-collapse: collapse; font-size: 13px; font-weight: bold; color: black; background: #fff; }
        .plan-table th, .plan-table td { border: 1px solid black; padding: 8px 5px; text-align: center; vertical-align: middle; }
        .plan-table th { background-color: #c4d7d8; border-bottom: 2px solid black; text-transform: uppercase; font-size: 12px; transition: background 0.2s; }
        .plan-table th.sortable-header { cursor: pointer; user-select: none; }
        .plan-table th.sortable-header:hover { background-color: #a8c1c2; }
        .plan-table th.dotted { border-left: 1px dotted black; border-right: 1px dotted black; }
        .plan-table td.dotted { border-left: 1px dotted black; border-right: 1px dotted black; }

        /* Warna Khusus Kolom */
        .plan-table td.bg-red { background-color: #e62054 !important; color: white; }
        .plan-table td.bg-green { background-color: #52c41a !important; color: white; } /* Tambahan Warna Hijau */
        .plan-table td.bg-blue { background-color: #4b8de1 !important; color: black; }

        /* Row Striping */
        .plan-table tbody tr:nth-child(even) { background-color: #ffffff; }
        .plan-table tbody tr:nth-child(odd) { background-color: #f7f7f7; }
        .plan-table tbody tr:hover { background-color: #e2e8f0; }

        /* UI Elemen Lain */
        .plan-btn { background: #1890ff; color: white; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .plan-btn:hover { background: #096dd9; }
        .plan-btn-danger { background: #ff4d4f; }
        .plan-btn-danger:hover { background: #cf1322; }
        .plan-btn-success { background: #52c41a; }
        .plan-btn-success:hover { background: #389e0d; }
        .plan-input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-weight: bold; }
        .sort-icon { font-size: 10px; color: #555; margin-left: 4px; }
    `;
    document.head.appendChild(style);

    // ==========================================
    // 3. HELPER FUNCTIONS
    // ==========================================
    const apiRequest = (url, payload, isJson = false) => {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", url: url,
                headers: { "Content-Type": isJson ? "application/json" : "application/x-www-form-urlencoded; charset=UTF-8" },
                data: isJson ? JSON.stringify(payload) : payload,
                onload: (res) => { try { resolve(JSON.parse(res.responseText).data || []); } catch (e) { resolve([]); } },
                onerror: (err) => reject(err)
            });
        });
    };

    const formatDateStr = (d) => d.toISOString().split('T')[0];

    const formatIndoDateRange = (startStr, endStr) => {
        const months = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
        const ds = new Date(startStr); const de = new Date(endStr);
        const pad = n => n.toString().padStart(2, '0');
        return `${pad(ds.getDate())} ${months[ds.getMonth()]} - ${pad(de.getDate())} ${months[de.getMonth()]}`;
    };

    const calculateDays = (start, end) => {
        const d1 = new Date(start); const d2 = new Date(end);
        return Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    };

    const getSortIcon = (key) => currentSort.key === key ? (currentSort.direction === 'desc' ? '▼' : '▲') : '↕️';

    // ==========================================
    // 4. INJEKSI MENU KE BIGSELLER
    // ==========================================
    function injectMenuPlan() {
        const reportPanel = document.getElementById('nav_panel_report');
        if (!reportPanel) return;

        const wrappers = reportPanel.querySelectorAll('.nav_child_item_wrapper');
        let targetUl = null;
        for (const wrapper of wrappers) {
            const title = wrapper.querySelector('.nav_child_module_name');
            if (title && title.innerText.trim() === 'Analisa Penjualan') {
                targetUl = wrapper.querySelector('.nav_child_module_content'); break;
            }
        }

        if (targetUl && !document.getElementById('btn-menu-planning-plan')) {
            const li = document.createElement('li');
            li.id = 'btn-menu-planning-plan';
            li.setAttribute('data-v-a26f38c8', '');

            const a = document.createElement('a');
            a.href = 'javascript:void(0)';
            a.className = 'nav_jump';
            a.style.cssText = `color: white; background: linear-gradient(to right, #00b09b, #96c93d); border-radius: 4px; padding: 0 10px; display: flex; align-items: center; justify-content: center; height: 34px; margin-top: 5px; font-size: 12px; font-weight: bold; text-decoration: none; box-shadow: 0 3px 6px rgba(150,201,61,0.4);`;
            a.innerHTML = `📝 PLANNING PLAN`;

            a.onclick = (e) => {
                e.preventDefault();
                openPlanModal();
            };
            li.appendChild(a);
            targetUl.appendChild(li);
        }
    }
    setInterval(injectMenuPlan, 1000);

    // ==========================================
    // 5. MODAL & UI LOGIC
    // ==========================================
    function openPlanModal() {
        modalPlan.style.display = 'block';
        if(planningData.length === 0) {
            renderPlanLayout();
        }
    }

    function renderPlanLayout() {
        const today = new Date();
        const dEnd = new Date(today); dEnd.setDate(today.getDate() - 1);
        const dStart = new Date(today); dStart.setDate(today.getDate() - 30);

        modalPlan.innerHTML = `
            <div style="width: 98%; max-width: 1600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; flex-direction: column; max-height: 95vh;">
                <div style="padding: 20px; border-bottom: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h2 style="margin: 0; color: #001529;">📝 PLANNING PLAN (Acuan Target Stok)</h2>
                        <button id="planCloseBtn" class="plan-btn plan-btn-danger">✖ TUTUP</button>
                    </div>
                    <div style="display: flex; gap: 15px; align-items: flex-end; background: #f0fdf4; padding: 15px; border-radius: 6px; border: 1px solid #bbf7d0;">
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <label style="font-size: 12px; font-weight: bold; color: #166534;">CUSTOM SALES PERIOD (Acuan Penjualan)</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="date" id="planStart" class="plan-input" value="${formatDateStr(dStart)}">
                                <span>-</span>
                                <input type="date" id="planEnd" class="plan-input" value="${formatDateStr(dEnd)}">
                            </div>
                        </div>
                        <button id="planGenerateBtn" class="plan-btn plan-btn-success" style="padding: 10px 20px; font-size: 14px;">🚀 GENERATE PLAN</button>
                        <button id="planExportBtn" class="plan-btn" style="margin-left: auto;">📥 EXPORT CSV</button>
                    </div>
                </div>

                <div id="planResultArea" style="flex: 1; padding: 0; overflow: auto; background: #f8fafc; position: relative;">
                    <div style="text-align: center; padding: 100px; color: #94a3b8;">
                        <h3>Pilih Range Tanggal dan Klik "Generate Plan"</h3>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('planCloseBtn').onclick = () => modalPlan.style.display = 'none';
        document.getElementById('planGenerateBtn').onclick = processPlanningData;
        document.getElementById('planExportBtn').onclick = exportPlanCSV;
    }

    // ==========================================
    // 6. FETCH API & KALKULASI LOGIC
    // ==========================================
    async function processPlanningData() {
        const startDate = document.getElementById('planStart').value;
        const endDate = document.getElementById('planEnd').value;
        const resultArea = document.getElementById('planResultArea');

        if (!startDate || !endDate) return alert("Pilih tanggal dengan benar!");

        const totalDays = calculateDays(startDate, endDate);
        resultArea.innerHTML = `<div style="text-align:center; padding:100px;"><h2 style="color:#1890ff;">⏳ Mengambil Data Penjualan & Stok Gudang...</h2><p>Menghitung acuan untuk ${totalDays} Hari</p></div>`;

        try {
            const salesPayload = `currency=IDR&pageSize=2000&pageNo=1&platform=&searchType=sku&searchContent=&inquireType=0&beginDate=${startDate}&endDate=${endDate}&orderBy=efficientsOrders&desc=1&categoryList=&warehouseIds=${TARGET_WAREHOUSE_ID}&evalationOrder=0&groupFields=sku&spuId=&shopIds=&groupType=1&dimension=`;
            const salesPromise = apiRequest('https://www.bigseller.com/api/v1/skuSales/skuPageList.json', salesPayload, false).then(d => d.rows || []);

            const invPayload = `pageNo=1&pageSize=2000&searchType=skuName&searchContent=&inquireType=0&stockStatus=&isGroup=0&orderBy=&desc=&fullCid=&queryDistribution=1&saleState=&zoneId=&openFlag=false&hideZeroInventorySku=0&warehouseIds=${TARGET_WAREHOUSE_ID}`;
            const invPromise = apiRequest('https://www.bigseller.com/api/v1/inventory/pageList.json', invPayload, false).then(d => (d.page && d.page.rows) ? d.page.rows : []);

            const [salesData, invData] = await Promise.all([salesPromise, invPromise]);

            const stockMap = {};
            invData.forEach(row => {
                stockMap[row.sku] = row.available;
            });

            planningData = [];
            salesData.forEach(item => {
                const customSales = item.efficientsVolume || 0;
                const dailyNeed = Math.round(customSales / totalDays);
                const targetStock = dailyNeed * 14;

                const rawInv = stockMap[item.sku] !== undefined ? stockMap[item.sku] : 1000;
                const realStock = rawInv - 1000;

                let ketahananStok = 0;
                if (dailyNeed > 0 && realStock > 0) {
                    ketahananStok = Math.round(realStock / dailyNeed);
                }

                const qtyKurang = targetStock - realStock;

                planningData.push({
                    gambar: item.image,
                    nama: item.title,
                    sku: item.sku,
                    customSales: customSales,
                    kebutuhanDaily: dailyNeed,
                    targetStok: targetStock,
                    qtyStokReal: realStock,
                    ketahananStok: ketahananStok,
                    qtyKurang: qtyKurang
                });
            });

            renderPlanTable(startDate, endDate);

        } catch (e) {
            console.error(e);
            resultArea.innerHTML = `<div style="text-align:center; padding:100px; color:red;"><h3>❌ Gagal memuat data. Silakan coba lagi.</h3></div>`;
        }
    }

    // ==========================================
    // 7. RENDER TABEL HTML & EVENT LISTENER
    // ==========================================
    function renderPlanTable(start, end) {
        // 1. Lakukan pengurutan array (Sorting)
        planningData.sort((a, b) => {
            let valA = a[currentSort.key];
            let valB = b[currentSort.key];

            // Jika tipe string, jadikan lowercase agar case-insensitive
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        const dateSubTitle = formatIndoDateRange(start, end);
        const resultArea = document.getElementById('planResultArea');

        // 2. Render struktur HTML
        let html = `
            <table class="plan-table">
                <thead style="position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                        <th style="width: 40px;">NO</th>
                        <th style="width: 60px;">GAMBAR</th>
                        <th class="sortable-header" data-sort="nama" style="text-align: left;">NAMA<span class="sort-icon">${getSortIcon('nama')}</span></th>
                        <th class="sortable-header dotted" data-sort="sku" style="text-align: left;">SKU<span class="sort-icon">${getSortIcon('sku')}</span></th>
                        <th class="sortable-header dotted" data-sort="customSales">CUSTOM SALES PERIOD<br><span style="font-weight:normal; font-size:11px;">${dateSubTitle}</span><span class="sort-icon">${getSortIcon('customSales')}</span></th>
                        <th class="sortable-header dotted" data-sort="kebutuhanDaily">KEBUTUHAN DAILY<span class="sort-icon">${getSortIcon('kebutuhanDaily')}</span></th>
                        <th class="sortable-header dotted" data-sort="targetStok">TARGET STOK<span class="sort-icon">${getSortIcon('targetStok')}</span></th>
                        <th class="sortable-header dotted" data-sort="qtyStokReal">QTY STOK REAL<span class="sort-icon">${getSortIcon('qtyStokReal')}</span></th>
                        <th class="sortable-header dotted" data-sort="ketahananStok" style="min-width: 120px;">KETAHANAN STOK<span class="sort-icon">${getSortIcon('ketahananStok')}</span></th>
                        <th class="sortable-header" data-sort="qtyKurang" style="border-left:1px solid black; border-right:2px solid black; min-width: 100px;">
                            QTY KURANG<span class="sort-icon">${getSortIcon('qtyKurang')}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
        `;

        planningData.forEach((row, idx) => {
            // LOGIKA WARNA KETAHANAN STOK (>= 14 Hijau, < 14 Merah)
            const ketahananClass = row.ketahananStok >= 14 ? 'bg-green' : 'bg-red';

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td style="padding: 2px;"><img src="${row.gambar}" style="width: 40px; height: 40px; object-fit: cover; border: 1px solid #ccc;"></td>
                    <td style="text-align: left; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.nama}">${row.nama}</td>
                    <td class="dotted" style="text-align: left;">${row.sku}</td>
                    <td class="dotted">${row.customSales}</td>
                    <td class="dotted">${row.kebutuhanDaily}</td>
                    <td class="dotted">${row.targetStok}</td>
                    <td class="dotted">${row.qtyStokReal}</td>
                    <td class="dotted ${ketahananClass}">${row.ketahananStok}</td>
                    <td class="bg-blue" style="border-left:1px solid black; border-right:2px solid black;">${row.qtyKurang}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        resultArea.innerHTML = html;

        // 3. Attach Event Listeners
        const headers = resultArea.querySelectorAll('.sortable-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.getAttribute('data-sort');
                if (currentSort.key === sortKey) {
                    currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
                } else {
                    currentSort.key = sortKey;
                    currentSort.direction = 'desc';
                }
                renderPlanTable(start, end);
            });
        });
    }

    // ==========================================
    // 8. EXPORT TO CSV
    // ==========================================
    function exportPlanCSV() {
        if (!planningData || planningData.length === 0) return alert("Belum ada data untuk diexport!");

        const dateStr = document.getElementById('planStart').value + "_to_" + document.getElementById('planEnd').value;
        const headers = ["NO", "NAMA", "SKU", "CUSTOM SALES", "KEBUTUHAN DAILY", "TARGET STOK", "QTY STOK REAL", "KETAHANAN STOK", "QTY KURANG"];

        const rows = planningData.map((m, i) => [
            i + 1,
            `"${m.nama.replace(/"/g, '""')}"`,
            `"${m.sku}"`,
            m.customSales,
            m.kebutuhanDaily,
            m.targetStok,
            m.qtyStokReal,
            m.ketahananStok,
            m.qtyKurang
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");

        link.href = URL.createObjectURL(blob);
        link.download = `Planning_Plan_${dateStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

})();
