// 初始化地图
var map = new AMap.Map('map', {
    center: [118.9067, 32.1014], // 改成你的学校中心坐标
    zoom: 17
});

// 添加单棵植物（点标注）

// localStorage 持久化 key
var STORAGE_KEY = 'campus_plant_local';
var STORAGE_SPECIES_KEY = 'campus_plant_species';
var STORAGE_SPECIES_DEFAULTS_KEY = 'campus_plant_species_defaults';
var SPECIES_FILE = 'data/species.json';
// map name -> defaults {icon, bloomStart, bloomEnd, leafStart, leafEnd}
var speciesDefaults = {};

// 管理当前地图上的覆盖物，便于清理与交互
var _overlays = [];
function clearAllOverlays() {
    _overlays.forEach(o => { try { o.setMap && o.setMap(null); } catch(e){} });
    _overlays = [];
}

// 隐藏所有标注和区域（保留在 _overlays 数组中，但从地图上移除）
function hideAllOverlays() {
    _overlays.forEach(o => {
        try {
            if (o && o._isMarker) {
                o.setMap(null); // 隐藏标注
            } else if (o && o instanceof AMap.Polygon) {
                o.setMap(null); // 隐藏区域
            }
        } catch (e) {
            console.warn('隐藏标注时出错:', e);
        }
    });
}

// 恢复（显示）所有标注和区域
function showAllOverlays() {
    _overlays.forEach(o => {
        try {
            if (o && o._isMarker) {
                o.setMap(map); // 显示标注
            } else if (o && o instanceof AMap.Polygon) {
                o.setMap(map); // 显示区域
            }
        } catch (e) {
            console.warn('恢复标注时出错:', e);
        }
    });
}

// 统一获取植物图标（消除不一致性）
function getPlantIcon(name, iconUrl) {
    if (iconUrl) return iconUrl;
    if (speciesDefaults[name] && speciesDefaults[name].icon) {
        return speciesDefaults[name].icon;
    }
    return 'images/tree.png';
}

// 图标缩放：根据地图 zoom 返回图标像素尺寸
function getIconSizeForZoom(zoom) {
    // 简单分段：<=14 -> 20px, 15-16 -> 28px, 17-18 -> 36px, >=19 -> 48px
    if (zoom <= 14) return 14;
    if (zoom <= 16) return 20;
    if (zoom <= 18) return 28;
    return 36;
}

// 获取某物种或图标的锚点比例（返回 {x:0..1, y:0..1}），优先使用物种默认，否则使用默认底部中心或全局输入
// 全局默认锚点（比例 0..1），
var DEFAULT_ANCHOR_X = 0.5;
var DEFAULT_ANCHOR_Y = 0.95; 
function getAnchorRatio(name, iconUrl) {
    try {
        if (name && speciesDefaults && speciesDefaults[name] && (speciesDefaults[name].anchorX !== undefined || speciesDefaults[name].anchorY !== undefined)) {
            var d = speciesDefaults[name];
            return { x: (d.anchorX !== undefined ? d.anchorX : 0.5), y: (d.anchorY !== undefined ? d.anchorY : 1) };
        }
    } catch(e) {}
    // 没有 species 名称或未定义锚点，直接使用全局默认（50%, 95%）
    return { x: DEFAULT_ANCHOR_X, y: DEFAULT_ANCHOR_Y };
}

function createPlantInfoContent(name, description, id) {
    return `
        <div class="plant-info">
            <b>${name}</b><br>${description || '暂无描述'}
            <div class="button-group">
                <button class="btn-detail" onclick="closeAllInfoWindows();showPlantDetail('${id || 'unknown'}', 'point')">详情</button>
                <button class="btn-delete" onclick="deletePlantFromMap('${id || 'unknown'}')">删除</button>
            </div>
        </div>
    `;
}

function addSinglePlant(name, position, description, id) {
    // 支持自定义图标（传入 icon URL）
    var iconUrl = getPlantIcon(name, arguments.length >= 5 ? arguments[4] : null);

    var size = getIconSizeForZoom(map.getZoom());
    var content = iconUrl ? ('<div class="cp-marker"><img src="' + iconUrl + '" style="width:' + size + 'px;height:' + size + 'px"/></div>') : null;
    var markerOpts = {
        position: position,
        title: name
    };
    if (content) markerOpts.content = content;
    // offset 使用锚点比例（可为物种默认或全局输入）
    try {
        var anchor = getAnchorRatio(name, iconUrl);
        markerOpts.offset = new AMap.Pixel(Math.round(-anchor.x * size), -Math.round(anchor.y * size));
    } catch(e) {
        markerOpts.offset = new AMap.Pixel(Math.round(-size/2), -Math.round(size));
    }

    var marker = new AMap.Marker(markerOpts);
    marker.setMap(map);
    marker._isMarker = true;
    marker._iconUrl = iconUrl;
    marker._speciesName = name;//设置marker的属性，用于后续识别

    //news
    // marker._actionInfoWindow = new AMap.InfoWindow({
    //     content: createPlantInfoContent(name, description, id),
    //     offset: new AMap.Pixel(0, -30)
    // });

    // marker.on('click', function(evt) {
    //     try {
    //         // 更新内容并显示
    //         marker._actionInfoWindow.setContent(createPlantInfoContent(name, description, id));
    //         marker._actionInfoWindow.open(map, position);
            
    //         setTimeout(() => map.setStatus({dragEnable: true, zoomEnable: true}), 10);
            
    //         evt?.domEvent?.stopPropagation();
    //         evt?.domEvent?.preventDefault();
    //     } catch(e) {
    //         console.error('点击标记出错:', e);
    //     }
    // });
    //news


    const infoHtml = `
        <div class="plant-info-window">
            <div class="plant-name">${name}</div>
            <div class="plant-desc">${description || '暂无描述'}</div>
            <div class="button-group">
                <button class="btn-detail" onclick="closeAllInfoWindows();showPlantDetail('${id || 'unknown'}', 'point')">详情</button>
                <button class="btn-delete" onclick="deletePlantFromMap('${id || 'unknown'}')">删除</button>
            </div>
        </div>
        `;
    marker._actionInfoWindow = new AMap.InfoWindow({ content: infoHtml });
    marker._infoWindow = marker._actionInfoWindow;

    var infoWindow = new AMap.InfoWindow({
        content: `<b>${name}</b><br>${description}`,
        offset: new AMap.Pixel(0, -30)
    });

    marker.on('click', function(evt){
        try { 
            // 创建带操作按钮的InfoWindow内容
            var actionContent = `
                <div class="plant-info-window">
                    <div class="plant-name">${name}</div>
                    <div class="plant-desc">${description || '暂无描述'}</div>
                    <div class="button-group">
                        <button class="btn-detail" onclick="closeAllInfoWindows();showPlantDetail('${id || 'unknown'}', 'point')">详情</button>
                        <button class="btn-delete" onclick="deletePlantFromMap('${id || 'unknown'}')">删除</button>
                    </div>
                </div>
            `;
            
            // 创建新的InfoWindow实例或更新内容
            if (!marker._actionInfoWindow) {
                marker._actionInfoWindow = new AMap.InfoWindow({
                    content: actionContent,
                    offset: new AMap.Pixel(0, -30)
                });
                marker._infoWindow = marker._actionInfoWindow;
            } else {
                marker._actionInfoWindow.setContent(actionContent);
            }
            
            marker._actionInfoWindow.open(map, position);
            marker._actionInfoWindow.setOffset(new AMap.Pixel(0, -30));
            
            // 确保地图拖拽/缩放没有被意外禁用
            setTimeout(function() {
                map.setStatus({dragEnable: true, zoomEnable: true});
            }, 10);
            
            // 阻止事件冒泡
            if (evt && evt.domEvent) {
                evt.domEvent.stopPropagation();
                evt.domEvent.preventDefault();
            }
        } catch(e){
            console.warn('单点植物点击事件处理出错:', e);
        }
    });
    // 关联 id 方便从列表操作
    marker._plantId = id || null;
    marker._infoWindow = infoWindow;
    _overlays.push(marker);
    return marker;
}


// 添加大片区域植物（多边形）
function addAreaPlant(name, path, description /*, id, icon */) {
    var id = arguments.length >= 4 ? arguments[3] : null;
    // var iconUrl = arguments.length >= 5 ? arguments[4] : null;
    var iconUrl = getPlantIcon(name, arguments.length >= 5 ? arguments[4] : null);
    var polygon = new AMap.Polygon({
        path: path,
        fillColor: '#80d8ff',
        strokeColor: '#0091ea',
        fillOpacity: 0.4
    });
    polygon.setMap(map);
    const infoHtml = `
    <div class="plant-info-window">
        <div class="plant-name">${name}</div>
        <div class="plant-desc">${description || '暂无描述'}</div>
        <div class="button-group">
            <button class="btn-detail" onclick="closeAllInfoWindows();showPlantDetail('${id || 'unknown'}', 'area')">详情</button>
            <button class="btn-delete" onclick="deletePlantFromMap('${id || 'unknown'}')">删除</button>
        </div>
    </div>
    `;
    polygon._actionInfoWindow = new AMap.InfoWindow({ content: infoHtml });
    polygon._infoWindow = polygon._actionInfoWindow;


    var infoWindow = new AMap.InfoWindow({
        content: `<b>${name}</b><br>${description}`
    });

    polygon.on('click', function(e) { 
        try { 
            // 创建带操作按钮的InfoWindow内容
            var actionContent = `
                <div class="plant-info-window">
                    <div class="plant-name">${name}</div>
                    <div class="plant-desc">${description || '暂无描述'}</div>
                    <div class="button-group">
                        <button class="btn-detail" onclick="closeAllInfoWindows();showPlantDetail('${id || 'unknown'}', 'area')">详情</button>
                        <button class="btn-delete" onclick="deletePlantFromMap('${id || 'unknown'}')">删除</button>
                    </div>
                </div>
            `;
            
            if (!polygon._actionInfoWindow) {
                polygon._actionInfoWindow = new AMap.InfoWindow({
                    content: actionContent
                });
            } else {
                polygon._actionInfoWindow.setContent(actionContent);
            }
            
            polygon._actionInfoWindow.open(map, e.lnglat);
            polygon._actionInfoWindow.setOffset(new AMap.Pixel(0, -30));
            
            setTimeout(function() {
                map.setStatus({dragEnable: true, zoomEnable: true});
            }, 10);
        } catch(err){
            console.warn('多边形点击事件处理出错:', err);
        } 
    });
    polygon._infoWindow = infoWindow;
    polygon._plantId = id || null;
    _overlays.push(polygon);

    // 在区域中心显示图标（如果提供）
    if (iconUrl && path && path.length) {
        var cx = 0, cy = 0;
        path.forEach(pt => { cx += pt[0]; cy += pt[1]; });
        cx /= path.length; cy /= path.length;
        var size = getIconSizeForZoom(map.getZoom());
        var centerContent = '<div class="cp-marker"><img src="' + iconUrl + '" style="width:' + size + 'px;height:' + size + 'px"/></div>';
        var anchor = getAnchorRatio(name, iconUrl);
        var centerMarker = new AMap.Marker({ position: [cx, cy], content: centerContent, offset: new AMap.Pixel(Math.round(-anchor.x * size), -Math.round(anchor.y * size)) });
        centerMarker.setMap(map);
        // 中心标注点击时显示操作按钮
        centerMarker.on('click', function(evt){
            try { 
                var actionContent = `
                    <div class="plant-info-window">
                        <div class="plant-name">${name}</div>
                        <div class="plant-desc">${description || '暂无描述'}</div>
                        <div class="button-group">
                            <button class="btn-detail" onclick="closeAllInfoWindows();showPlantDetail('${id || 'unknown'}', 'area')">详情</button>
                            <button class="btn-delete" onclick="deletePlantFromMap('${id || 'unknown'}')">删除</button>
                        </div>
                    </div>
                `;
                        // 如果 polygon._actionInfoWindow 未创建，则创建
                if (!polygon._actionInfoWindow) {
                    
                    polygon._actionInfoWindow = new AMap.InfoWindow({
                        content: actionContent
                    });
                }

                polygon._actionInfoWindow.open(map, [cx, cy]);
                polygon._actionInfoWindow.setOffset(new AMap.Pixel(0, -30));

                setTimeout(() => map.setStatus({dragEnable: true, zoomEnable: true}), 10);

                if (evt && evt.domEvent) {
                    evt.domEvent.stopPropagation();
                    evt.domEvent.preventDefault();
                }
            } catch(e){
                console.warn('区域中心标注点击事件处理出错:', e);
            }
        });
        centerMarker._plantId = id || null;
        centerMarker._isMarker = true;
        centerMarker._iconUrl = iconUrl;
        centerMarker._speciesName = name;
        centerMarker._infoWindow = infoWindow;
        _overlays.push(centerMarker);
    }
    return polygon;
}



// -------------------- 交互式添加（本雏形） --------------------
// 状态
var currentAreaPath = [];
var tempPolygon = null;
var placingPoint = false;
var drawingArea = false;
// 临时用于放置点的中心/可拖拽标注
var tempCenterMarker = null;
var tempCenterDragging = false;

// 绘制区域时的十字光标处理函数（需要保存引用以便后续移除）
var crosshairCursorHandler = function() {
    document.getElementById('map').style.cursor = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 32 32\'%3E%3Cline x1=\'16\' y1=\'0\' x2=\'16\' y2=\'32\' stroke=\'%23ff0000\' stroke-width=\'2\'/%3E%3Cline x1=\'0\' y1=\'16\' x2=\'32\' y2=\'16\' stroke=\'%23ff0000\' stroke-width=\'2\'/%3E%3C/svg%3E") 16 16, crosshair';
};



// helper: 更通用的渲染函数，包括花期/落叶期显示
function renderPlant(p) {
    // 合并 speciesDefaults：以 plant 的字段为准，缺失时使用 speciesDefaults
    var merged = Object.assign({}, (p.name && speciesDefaults[p.name]) || {}, p || {});
    var desc = merged.description || '';
    var parts = [];
    if (merged.bloomStart || merged.bloomEnd) {
        var s = merged.bloomStart ? (`开花: ${merged.bloomStart}`) : '';
        var e = merged.bloomEnd ? (` - ${merged.bloomEnd}`) : '';
        parts.push(`${s}${e}`);
    }
    if (merged.leafStart || merged.leafEnd) {
        var ls = merged.leafStart ? (`落叶: ${merged.leafStart}`) : '';
        var le = merged.leafEnd ? (` - ${merged.leafEnd}`) : '';
        parts.push(`${ls}${le}`);
    }
    if (parts.length) {
        desc = (desc ? desc + '<br>' : '') + `<small>${parts.join('<br>')}</small>`;
    }
    // 添加月份条显示
    desc = desc + makeMonthBarHTML(merged.bloomStart, merged.bloomEnd, merged.leafStart, merged.leafEnd);

    // if (merged.type === 'point') return addSinglePlant(merged.name, merged.position, desc, merged.id, merged.icon);
    // else if (merged.type === 'area') return addAreaPlant(merged.name, merged.path, desc, merged.id, merged.icon);
    var iconUrl = getPlantIcon(merged.name, merged.icon);
    if (merged.type === 'point') return addSinglePlant(merged.name, merged.position, desc, merged.id, iconUrl);
    else if (merged.type === 'area') return addAreaPlant(merged.name, merged.path, desc, merged.id, iconUrl);
    return null;
}

// 解析日期字符串（yyyy-mm-dd 或 mm-dd 或 ''），返回月份 1-12 或 null
function parseMonth(dateStr) {
    if (!dateStr) return null;
    try {
        var parts = dateStr.split('-');
        if (parts.length === 3) return parseInt(parts[1],10);
        if (parts.length === 2) return parseInt(parts[0],10);
        if (parts.length === 1) return parseInt(parts[0],10);
        return null;
    } catch (e) { return null; }
}

// 生成 12 段月份条 HTML，bloomStart/bloomEnd/leafStart/leafEnd 为日期字符串
function makeMonthBarHTML(bloomStart, bloomEnd, leafStart, leafEnd) {
    var b1 = parseMonth(bloomStart);
    var b2 = parseMonth(bloomEnd);
    var l1 = parseMonth(leafStart);
    var l2 = parseMonth(leafEnd);

    // helper: 返回布尔数组 1..12 是否在区间内（允许跨年）
    function monthsInRange(s,e) {
        var arr = new Array(12).fill(false);
        if (s === null || e === null || s === undefined || e === undefined) return arr;
        s = ((s-1)+12)%12; e = ((e-1)+12)%12; // 0-based
        if (s <= e) {
            for (var i=s;i<=e;i++) arr[i]=true;
        } else {
            for (var i=s;i<12;i++) arr[i]=true;
            for (var i=0;i<=e;i++) arr[i]=true;
        }
        return arr;
    }

    var bloomMask = monthsInRange(b1,b2);
    var leafMask = monthsInRange(l1,l2);

    var html = '<div class="month-bar">';
    for (var m=0;m<12;m++) {
        var style = '';
        if (bloomMask[m] && leafMask[m]) {
            // 双重重叠：生成左右双色条纹
            style = 'background: linear-gradient(90deg, #ff8da1 50%, #ffb74d 50%);';
        } else if (bloomMask[m]) {
            style = 'background: #ff8da1;';
        } else if (leafMask[m]) {
            style = 'background: #ffb74d;';
        } else {
            style = 'background: #eee;';
        }
        html += '<div class="month-seg" style="' + style + '"></div>';
    }
    html += '</div>';
    html += '<div class="month-legend"><span style="color:#ff8da1">▇</span> 开花  <span style="color:#ffb74d;margin-left:8px">▇</span> 落叶</div>';
    return html;
}


function updateMarkerSizes() {
    var z = map.getZoom();
    var size = getIconSizeForZoom(z);
    _overlays.forEach(o => {
        try {
            if (o && o._isMarker && o._iconUrl) {
                var content = '<div class="cp-marker"><img src="' + o._iconUrl + '" style="width:' + size + 'px;height:' + size + 'px"/></div>';
                o.setContent(content);
                // offset 更新（基于 marker 上的 species 名称或全局输入）
                try {
                    var anch = getAnchorRatio(o._speciesName, o._iconUrl);
                    o.setOffset && o.setOffset(new AMap.Pixel(Math.round(-anch.x * size), -Math.round(anch.y * size)));
                } catch (ee) {
                    o.setOffset && o.setOffset(new AMap.Pixel(Math.round(-size/2), -Math.round(size)));
                }
                // 重置位置以修正渲染偏移（部分情况下 setContent 后位置会偏移）
                try { var pos = o.getPosition && o.getPosition(); if (pos) o.setPosition(pos); } catch(e) {}
            }
        } catch (e) {}
    });
}

// 绑定地图缩放事件以调整图标大小
try { map.on && map.on('zoomchange', updateMarkerSizes); } catch(e) {}
// persisted species defaults (from add-new actions)
function loadSpeciesDefaults() {
    try { var r = localStorage.getItem(STORAGE_SPECIES_DEFAULTS_KEY); return r?JSON.parse(r):{} } catch(e){return{}};
}

function saveSpeciesDefaults(obj) {
    try { localStorage.setItem(STORAGE_SPECIES_DEFAULTS_KEY, JSON.stringify(obj)); } catch(e){}
}

function loadLocalPlants() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) {
        console.error('读取本地植物数据失败', e);
        return [];
    }
}

function saveLocalPlants(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('保存本地植物数据失败', e);
    }
}

// 在页面上显示 data + 本地存储的植物
function loadAllPlants() {
    clearAllOverlays();
    // 先加载 data/species.json（物种定义），再加载 data/plants.json 与本地
    fetch(SPECIES_FILE)
      .then(res => res.json())
      .then(speciesArr => {
          // speciesArr: [{name, icon, bloomStart, bloomEnd, leafStart, leafEnd}, ...]
            (speciesArr || []).forEach(s => { if (s && s.name) speciesDefaults[s.name] = s; });
            // 合并 persisted defaults
            var persistedDefs = loadSpeciesDefaults();
            Object.keys(persistedDefs || {}).forEach(k => { speciesDefaults[k] = persistedDefs[k]; });
      })
      .catch(err => {
          // 如果没有 species.json，不阻塞后续加载
          console.warn('无法加载 species.json（可在 data/species.json 提供物种定义）', err);
      })
      .finally(() => {
          // 加载 plants.json
          fetch('data/plants.json')
            .then(res => res.json())
            .then(plants => {
                // 收集物种列表（data 源）
                var speciesFromData = (plants || []).map(p => p.name).filter(Boolean);
                plants.forEach(p => {
                    // data 文件中可能没有 id 字段
                    p.id = p.id || ('data_' + Math.random().toString(36).slice(2,9));
                    p.icon = getPlantIcon(p.name, p.icon);
                    renderPlant(p);
                });

                var local = loadLocalPlants();
                local.forEach(p => {
                    // 确保本地植物也有正确的图标
                    // if (!p.icon && p.name && speciesDefaults[p.name]) {
                    //     p.icon = speciesDefaults[p.name].icon;
                    // }
                    p.icon = getPlantIcon(p.name, p.icon);

                    renderPlant(p);
                });
                // 收集本地物种
                var speciesFromLocal = local.map(p => p.name).filter(Boolean);
                // 持久化的 species names
                var persisted = loadSpecies();
                // 初始化物种下拉（合并 data-species + data-plants + local + persisted）
                initSpeciesList((Object.keys(speciesDefaults || {})).concat(speciesFromData, speciesFromLocal, persisted));
                renderLocalList();
            })
            .catch(err => {
                console.warn('加载 data/plants.json 失败，仍尝试加载本地数据', err);
                var local = loadLocalPlants();
                local.forEach(p => {
                    // 确保本地植物也有正确的图标
                    // if (!p.icon && p.name && speciesDefaults[p.name]) {
                    //     p.icon = speciesDefaults[p.name].icon;
                    // }
                    p.icon = getPlantIcon(p.name, p.icon);
                    renderPlant(p);
                });
                initSpeciesList(Object.keys(speciesDefaults || {}).concat(local.map(p => p.name).filter(Boolean)));
                renderLocalList();
            });
      });
}

// 初始化加载所有数据
loadAllPlants();

// 绑定控件
var placePointBtn = document.getElementById('placePointBtn');
var startAreaBtn = document.getElementById('startAreaBtn');
var finishAreaBtn = document.getElementById('finishAreaBtn');
var clearTempBtn = document.getElementById('clearTempBtn');
var exportBtn = document.getElementById('exportBtn');
var iconSelect = document.getElementById('iconSelect');
var iconPreview = document.getElementById('iconPreview');
var speciesSelect = document.getElementById('speciesSelect');
var newSpeciesWrap = document.getElementById('newSpeciesWrap');
var newSpeciesInput = document.getElementById('newSpeciesInput');
var addSpeciesBtn = document.getElementById('addSpeciesBtn');

if (iconPreview) {
    iconPreview.src = 'images/tree.png'; // 默认图标

    // 点击预览图时，如果处于添加新物种模式则把点击位置回填到新物种的锚点输入，方便保存该物种默认锚点
    iconPreview.addEventListener('click', function(ev){
        try {
            var rect = iconPreview.getBoundingClientRect();
            var x = ev.clientX - rect.left; var y = ev.clientY - rect.top;
            var px = Math.max(0, Math.min(rect.width, x));
            var py = Math.max(0, Math.min(rect.height, y));
            var pctX = Math.round((px / rect.width) * 100);
            var pctY = Math.round((py / rect.height) * 100);
            // 锚点功能已简化，无需额外处理
        } catch(e) {}
    });

    // 阻止浏览器对图片的默认拖拽行为（避免拖动时出现蓝色或拖影）
    document.addEventListener('dragstart', function(e){
        try { var t = e.target; if (!t) return; if (t.tagName === 'IMG' && (t.id === 'iconPreview' || t.closest('.cp-marker'))) e.preventDefault(); } catch(e) {}
    });
}

// 物种（species）管理：load/save/init
function loadSpecies() {
    try {
        var raw = localStorage.getItem(STORAGE_SPECIES_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) { return []; }
}

function saveSpecies(list) {
    try { localStorage.setItem(STORAGE_SPECIES_KEY, JSON.stringify(list)); } catch(e){}
}

function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }

function initSpeciesList(extraNames) {
    var existing = loadSpecies();
    var merged = unique((existing || []).concat(extraNames || []));
    // ensure there is at least one example
    if (!merged.length) merged = ['未命名植物'];
    saveSpecies(merged);
    populateSpeciesSelect(merged);
}



// 当选择物种时，自动更新图标预览
function applySpeciesDefaultsToForm(name) {
    if (!name) return;
    var def = speciesDefaults[name];
    if (!def) return;
    // 更新图标预览
    if (def.icon && iconPreview) {
        iconPreview.src = def.icon;
    }
}

// 在加载完成后初次调整图标大小
setTimeout(function(){ try{ updateMarkerSizes(); }catch(e){} }, 500);

function populateSpeciesSelect(names) {
    if (!speciesSelect) return;
    speciesSelect.innerHTML = '';

    // ✅ 添加提示项
    var placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.disabled = true;
    placeholderOpt.selected = true;
    placeholderOpt.textContent = '请选择植物物种';
    speciesSelect.appendChild(placeholderOpt);

    names.forEach(n => {
        var opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        speciesSelect.appendChild(opt);
    });

    // 最后添加 “添加新物种” 选项
    var addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = '添加新物种...';
    speciesSelect.appendChild(addOpt);

    try { updateFormVisibility(); } catch(e) {}
}


// 当用户选择“添加新物种”显示输入区
if (speciesSelect) {
    speciesSelect.addEventListener('change', function(){
        // 显示/隐藏“新物种”块与主表单中的描述/日期字段
        // const valid = speciesSelect.value && speciesSelect.value !== '__add_new__' && speciesSelect.value !== '';
        // document.getElementById('placePointBtn').disabled = !valid;
        // document.getElementById('startAreaBtn').disabled = !valid;
        if (speciesSelect.value === '__add_new__') {
            if (newSpeciesWrap) newSpeciesWrap.style.display = '';
        } else {
            if (newSpeciesWrap) newSpeciesWrap.style.display = 'none';
            // apply defaults for selected species
            applySpeciesDefaultsToForm(speciesSelect.value);
        }
        updateFormVisibility();
    });
}

if (addSpeciesBtn) {
    addSpeciesBtn.addEventListener('click', function(){
        var v = (newSpeciesInput && newSpeciesInput.value || '').trim();
        if (!v) { alert('请输入新物种名称'); return; }
        // 默认使用树图标
        var icon = 'images/tree.png';
        var b1 = (document.getElementById('newBloomStart') && document.getElementById('newBloomStart').value) || '';
        var b2 = (document.getElementById('newBloomEnd') && document.getElementById('newBloomEnd').value) || '';
        var l1 = (document.getElementById('newLeafStart') && document.getElementById('newLeafStart').value) || '';
        var l2 = (document.getElementById('newLeafEnd') && document.getElementById('newLeafEnd').value) || '';
        var desc = (document.getElementById('newSpeciesDesc') && document.getElementById('newSpeciesDesc').value) || '';
        // 保存到 species defaults（内存 + persisted），不保存锚点（使用 images/icons.json 或全局默认）
        speciesDefaults[v] = { name: v, icon: icon, bloomStart: b1, bloomEnd: b2, leafStart: l1, leafEnd: l2, description: desc };
        var persisted = loadSpeciesDefaults();
        persisted[v] = speciesDefaults[v];
        saveSpeciesDefaults(persisted);

        // 也保存到名称列表（仅字符串列表）
        var list = loadSpecies();
        if (list.indexOf(v) === -1) list.push(v);
        saveSpecies(list);
        populateSpeciesSelect(list);
        speciesSelect.value = v;
        if (newSpeciesWrap) newSpeciesWrap.style.display = 'none';
        newSpeciesInput.value = '';
        // 清空新增字段
        if (document.getElementById('newBloomStart')) document.getElementById('newBloomStart').value = '';
    // 更新表单可见性（根据当前选择）
    try { updateFormVisibility(); } catch(e) {}
        if (document.getElementById('newBloomEnd')) document.getElementById('newBloomEnd').value = '';
        if (document.getElementById('newLeafStart')) document.getElementById('newLeafStart').value = '';
        if (document.getElementById('newLeafEnd')) document.getElementById('newLeafEnd').value = '';
    if (document.getElementById('newSpeciesDesc')) document.getElementById('newSpeciesDesc').value = '';
        try { updateFormVisibility(); } catch(e) {}
        alert('已添加新物种并保存默认信息：' + v);
    });
}

// 控制主表单中通用字段（描述与日期）在非添加新物种时隐藏
function updateFormVisibility() {
    // 由于主要的表单字段在当前HTML中不存在，此函数暂时保留为空
    // 如需后续添加表单字段可在此处扩展
    const placeBtn = document.getElementById('placePointBtn');
    const startBtn = document.getElementById('startAreaBtn');
    const valid = speciesSelect.value && speciesSelect.value !== '__add_new__' && speciesSelect.value !== '';
    placeBtn.disabled = !valid;
    startBtn.disabled = !valid;

}

placePointBtn && placePointBtn.addEventListener('click', function() {
    // toggle 放点模式 —— 现在使用屏幕中心或可拖动的临时图钉
    if (!placingPoint) {
        // 关闭所有信息窗口，提供清晰视图
        closeAllInfoWindows();
        
        // 进入放点模式：创建一个临时可拖动的中心标注
        placingPoint = true;
    drawingArea = false;
    // 进入放点时禁止开始绘制区域按钮，避免同时绘制
    try { if (startAreaBtn) startAreaBtn.disabled = true; } catch (e) {}
        finishAreaBtn.disabled = true;
        placePointBtn.textContent = '确认放置（再次点击以保存）';
        // 默认使用树图标，后续会根据物种自动更新
        // var icon = 'images/tree.png';
        var selName = (speciesSelect && speciesSelect.value && speciesSelect.value !== '__add_new__')
            ? speciesSelect.value : null;
        var icon = getPlantIcon(selName, selName && speciesDefaults[selName] ? speciesDefaults[selName].icon : null);

    // 创建临时中心标注，初始放在当前中心（使用锚点）
    var center = map.getCenter();
    var size = getIconSizeForZoom(map.getZoom());
    var content = '<div class="cp-marker"><img src="' + icon + '" style="width:' + size + 'px;height:' + size + 'px"/></div>';
    var selName = (speciesSelect && speciesSelect.value && speciesSelect.value !== '__add_new__') ? speciesSelect.value : null;
    var anch = getAnchorRatio(selName, icon);
    tempCenterMarker = new AMap.Marker({ position: [center.lng, center.lat], content: '<div class="cp-marker temp">' + content.replace(/^<div class="cp-marker">/, '').replace(/<\/div>$/, '') + '</div>', draggable: true, offset: new AMap.Pixel(Math.round(-anch.x * size), -Math.round(anch.y * size)) });
        tempCenterMarker.setMap(map);
        tempCenterMarker._isMarker = true;
        tempCenterMarker._iconUrl = icon;
    tempCenterMarker._speciesName = selName;

    // 临时图钉仅响应拖拽，不随地图移动
    // 拖动开始/结束事件：仅响应用户拖动以移动图标位置（不再随地图移动）
    tempCenterMarker.on('dragstart', function(){ tempCenterDragging = true; });
    tempCenterMarker.on('dragend', function(){ tempCenterDragging = false; });

    // 当用户缩放也需要更新临时标注大小（并更新偏移）
    try { map.on('zoomchange', function(){ if (tempCenterMarker && tempCenterMarker._iconUrl) { var s = getIconSizeForZoom(map.getZoom()); var anch2 = getAnchorRatio(tempCenterMarker._speciesName, tempCenterMarker._iconUrl); tempCenterMarker.setContent('<div class="cp-marker temp"><img src="'+tempCenterMarker._iconUrl+'" style="width:'+s+'px;height:'+s+'px"/></div>'); tempCenterMarker.setOffset(new AMap.Pixel(Math.round(-anch2.x * s), -Math.round(anch2.y * s))); } }); } catch(e){}

        // change cursor to move
        document.getElementById('map').style.cursor = 'move';
    } else {
        // 确认放置：把临时标注的位置保存为新的单株
        if (tempCenterMarker) {
            var pos = tempCenterMarker.getPosition();
            var lnglat = [pos.lng, pos.lat];

            // 从表单读取信息（从物种下拉或新物种输入）
            var name = '未命名植物';
            if (speciesSelect) {
                if (speciesSelect.value === '__add_new__') {
                    var nv = newSpeciesInput && newSpeciesInput.value && newSpeciesInput.value.trim();
                    if (nv) { name = nv; var sl = loadSpecies(); if (sl.indexOf(nv) === -1) { sl.push(nv); saveSpecies(sl); } }
                } else {
                    name = speciesSelect.value || name;
                }
            }
            // 从物种默认信息获取描述和花期信息
            var speciesInfo = speciesDefaults[name] || {};
            var desc = speciesInfo.description || '';
            var bloomStart = speciesInfo.bloomStart || '';
            var bloomEnd = speciesInfo.bloomEnd || '';
            var leafStart = speciesInfo.leafStart || '';
            var leafEnd = speciesInfo.leafEnd || '';

            var obj = {
                id: Date.now(),
                type: 'point',
                name: name,
                position: lnglat,
                description: desc,
                bloomStart: bloomStart,
                bloomEnd: bloomEnd,
                leafStart: leafStart,
                leafEnd: leafEnd,
                icon: tempCenterMarker._iconUrl || speciesInfo.icon || 'images/tree.png'
            };

            var local = loadLocalPlants();
            local.push(obj);
            saveLocalPlants(local);

            renderPlant(obj);
            renderLocalList();

            // 清理临时
            try { /* no map moving listeners to remove */ } catch(e){}
            tempCenterMarker.setMap(null); tempCenterMarker = null; tempCenterDragging = false;
        }
        placingPoint = false;
        // 恢复绘制区域按钮
        try { if (startAreaBtn) startAreaBtn.disabled = false; } catch (e) {}
        document.getElementById('map').style.cursor = '';
        placePointBtn.textContent = '在地图上放置点';
    }
});

startAreaBtn && startAreaBtn.addEventListener('click', function() {
    // 关闭所有信息窗口，提供清晰视图
    closeAllInfoWindows();
    
    drawingArea = true;
    placingPoint = false;
    // 进入绘制区域时禁止放置点按钮
    try { if (placePointBtn) placePointBtn.disabled = true; } catch (e) {}
    currentAreaPath = [];
    if (tempPolygon) { tempPolygon.setMap(null); tempPolygon = null; }
    finishAreaBtn.disabled = false;
    
    // 绑定十字光标（使用命名函数引用）
    map.on('mousemove', crosshairCursorHandler);

    // 隐藏地图上的所有标注
    hideAllOverlays();
});

// 恢复地图上的标注
finishAreaBtn && finishAreaBtn.addEventListener('click', function() {
    if (!drawingArea || currentAreaPath.length < 3) {
        alert('请至少绘制 3 个点以形成区域');
        return;
    }

    // 恢复标注
    showAllOverlays();

    // 从表单读取信息（从物种下拉或新物种输入）
    var name = '未命名区域';
    if (speciesSelect) {
        if (speciesSelect.value === '__add_new__') {
            var nv = newSpeciesInput && newSpeciesInput.value && newSpeciesInput.value.trim();
            if (nv) { name = nv; /* 同时加入 species 列表 */ var sl = loadSpecies(); if (sl.indexOf(nv) === -1) { sl.push(nv); saveSpecies(sl); } }
        } else {
            name = speciesSelect.value || name;
        }
    }
    // 从物种默认信息获取描述和花期信息
    var speciesInfo = speciesDefaults[name] || {};
    var desc = speciesInfo.description || '';
    var bloomStart = speciesInfo.bloomStart || '';
    var bloomEnd = speciesInfo.bloomEnd || '';
    var leafStart = speciesInfo.leafStart || '';
    var leafEnd = speciesInfo.leafEnd || '';

    // 优先使用物种默认图标，否则使用默认图标
    var icon = getPlantIcon(name, speciesInfo.icon);
    var obj = {
        id: Date.now(),
        type: 'area',
        name: name,
        path: currentAreaPath.slice(),
        description: desc,
        bloomStart: bloomStart,
        bloomEnd: bloomEnd,
        leafStart: leafStart,
        leafEnd: leafEnd
    };
    obj.icon = icon;

    // 保存到 localStorage
    var local = loadLocalPlants();
    local.push(obj);
    saveLocalPlants(local);

    // 渲染并清理临时
    renderPlant(obj);
    renderLocalList();
    drawingArea = false;
    // 完成后恢复放点按钮
    try { if (placePointBtn) placePointBtn.disabled = false; } catch (e) {}
    currentAreaPath = [];
    if (tempPolygon) { tempPolygon.setMap(null); tempPolygon = null; }
    finishAreaBtn.disabled = true;
    
    // 移除十字光标事件监听器并恢复默认光标
    map.off('mousemove', crosshairCursorHandler);
    document.getElementById('map').style.cursor = '';
});

clearTempBtn && clearTempBtn.addEventListener('click', function() {
    placingPoint = false;
    drawingArea = false;
    
    // 恢复标注
    showAllOverlays();
    
    // 只在有选中有效物种时恢复按钮,否则保持禁用
    var hasValidSpecies = speciesSelect && speciesSelect.value && speciesSelect.value !== '__add_new__' && speciesSelect.value !== '';
    try { if (placePointBtn) placePointBtn.disabled = !hasValidSpecies; } catch(e){}
    try { if (startAreaBtn) startAreaBtn.disabled = !hasValidSpecies; } catch(e){}
    
    currentAreaPath = [];
    if (tempPolygon) { tempPolygon.setMap(null); tempPolygon = null; }
    if (tempCenterMarker) { try { tempCenterMarker.setMap(null); } catch(e){}; tempCenterMarker = null; tempCenterDragging = false; }
    finishAreaBtn.disabled = true;
    placePointBtn.textContent = '在地图上放置点';
    // 移除十字光标事件监听器
    map.off('mousemove', crosshairCursorHandler);
    document.getElementById('map').style.cursor = '';
    
});

exportBtn && exportBtn.addEventListener('click', function() {
    console.log('本地保存的植物：', loadLocalPlants());
    // alert('已在控制台打印本地保存的植物（localStorage）');
});

// 切换显示/隐藏所有标注和区域
var isHidden = false;
var toggleOverlaysBtn = document.getElementById('toggleOverlaysBtn');
toggleOverlaysBtn && toggleOverlaysBtn.addEventListener('click', function() {
    if (isHidden) {
        showAllOverlays();
        toggleOverlaysBtn.textContent = '👁️ 显示/隐藏标注';
        toggleOverlaysBtn.style.background = '#9C27B0';
        isHidden = false;
    } else {
        hideAllOverlays();
        toggleOverlaysBtn.textContent = '🙈 标注已隐藏';
        toggleOverlaysBtn.style.background = '#757575';
        isHidden = true;
    }
});

// 地图点击事件：根据当前模式放置点或添加多边形顶点
map.on('click', function(e) {
    var lnglat = [e.lnglat.lng, e.lnglat.lat];
    if (placingPoint) {
        // 如果存在临时中心标注：将其移动到点击位置（而不是忽略点击）——便于精确放置
        if (tempCenterMarker) {
            try { tempCenterMarker.setPosition({lng: lnglat[0], lat: lnglat[1]}); } catch (ee) {}
            return;
        }

        // 否则（没有临时标注），保留原有点击直接保存单株的行为
        var name = '未命名植物';
        if (speciesSelect) {
            if (speciesSelect.value === '__add_new__') {
                var nv = newSpeciesInput && newSpeciesInput.value && newSpeciesInput.value.trim();
                if (nv) { name = nv; var sl = loadSpecies(); if (sl.indexOf(nv) === -1) { sl.push(nv); saveSpecies(sl); } }
            } else {
                name = speciesSelect.value || name;
            }
        }
        // 从物种默认信息获取描述和花期信息
        var speciesInfo = speciesDefaults[name] || {};
        var desc = speciesInfo.description || '';
        var bloomStart = speciesInfo.bloomStart || '';
        var bloomEnd = speciesInfo.bloomEnd || '';
        var leafStart = speciesInfo.leafStart || '';
        var leafEnd = speciesInfo.leafEnd || '';

        var obj = {
            id: Date.now(),
            type: 'point',
            name: name,
            position: lnglat,
            description: desc,
            bloomStart: bloomStart,
            bloomEnd: bloomEnd,
            leafStart: leafStart,
            leafEnd: leafEnd
        };

        // 优先使用物种默认图标，否则使用默认图标
        var icon = speciesInfo.icon || 'images/tree.png';
        obj.icon = icon;
        var local = loadLocalPlants();
        local.push(obj);
        saveLocalPlants(local);

        renderPlant(obj);
        renderLocalList();
        placingPoint = false;
        document.getElementById('map').style.cursor = '';
        placePointBtn.textContent = '在地图上放置点';
        alert('单株已保存到本地（localStorage）');
        return;
    }

    if (drawingArea) {
        // 添加点到当前路径并绘制临时 polygon
        currentAreaPath.push(lnglat);
        if (tempPolygon) tempPolygon.setMap(null);
        tempPolygon = new AMap.Polygon({
            path: currentAreaPath,
            fillColor: '#ffcdd2',
            strokeColor: '#e57373',
            fillOpacity: 0.35
        });
        tempPolygon.setMap(map);
    }
});

// 在载入已有的 addSinglePlant/addAreaPlant 基础上覆盖 InfoWindow 内容的改进（确保显示花期）
// （保留原有函数实现，仅通过 renderPlant 使用 description 字段构建内容）

// 渲染本地列表并绑定删除/缩放
function renderLocalList() {
    var container = document.getElementById('localList');
    if (!container) return;
    var list = loadLocalPlants();
    if (!list.length) { 
        container.innerHTML = '<div style="color:#999;text-align:center;padding:20px 0;font-size:13px;">📭 暂无本地保存的植物</div>'; 
        return; 
    }
    container.innerHTML = '';
    
    list.slice().reverse().forEach(item => {
        // 创建卡片容器
        var card = document.createElement('div');
        card.style.cssText = `
            position: relative;
            background: #f9f9f9;
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid #e0e0e0;
        `;
        
        // 鼠标悬停效果
        card.addEventListener('mouseenter', function() {
            card.style.background = '#f0f0f0';
            card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            card.style.transform = 'translateY(-1px)';
        });
        card.addEventListener('mouseleave', function() {
            card.style.background = '#f9f9f9';
            card.style.boxShadow = 'none';
            card.style.transform = 'translateY(0)';
        });
        
        // 点击卡片定位
        card.addEventListener('click', function(e) {
            // 如果点击的是删除按钮，不触发定位
            if (e.target.closest('.delete-btn')) return;
            closeAllInfoWindows();
            zoomToPlant(item);
        });
        
        // 删除按钮（右上角）
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '✕';
        deleteBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 20px;
            height: 20px;
            border: none;
            background: rgba(244, 67, 54, 0.9);
            color: white;
            border-radius: 50%;
            font-size: 14px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            z-index: 10;
        `;
        deleteBtn.title = '删除';
        
        // 删除按钮悬停效果
        deleteBtn.addEventListener('mouseenter', function() {
            deleteBtn.style.background = '#d32f2f';
            deleteBtn.style.transform = 'scale(1.1)';
        });
        deleteBtn.addEventListener('mouseleave', function() {
            deleteBtn.style.background = 'rgba(244, 67, 54, 0.9)';
            deleteBtn.style.transform = 'scale(1)';
        });
        
        // 删除功能
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // 阻止冒泡到卡片点击事件
            if (!confirm('确认删除：' + item.name + ' ?')) return;
            closeAllInfoWindows();
            deleteLocalPlant(item.id);
        });
        
        // 植物图标和名称行
        var headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6px;
            padding-right: 20px;
        `;
        
        // 植物图标
        var icon = document.createElement('img');
        icon.src = item.icon || 'images/tree.png';
        icon.style.cssText = `
            width: 32px;
            height: 32px;
            object-fit: contain;
            border-radius: 4px;
            background: white;
            border: 1px solid #ddd;
            padding: 2px;
        `;
        
        // 名称和类型
        var nameBox = document.createElement('div');
        nameBox.style.flex = '1';
        
        var name = document.createElement('div');
        name.style.cssText = `
            font-weight: 600;
            font-size: 14px;
            color: #333;
            margin-bottom: 2px;
        `;
        name.textContent = item.name;
        
        var typeTag = document.createElement('span');
        typeTag.style.cssText = `
            display: inline-block;
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            background: ${item.type === 'point' ? '#E3F2FD' : '#FFF3E0'};
            color: ${item.type === 'point' ? '#1976D2' : '#F57C00'};
        `;
        typeTag.textContent = item.type === 'point' ? '📍 单株' : '🗺️ 区域';
        
        nameBox.appendChild(name);
        nameBox.appendChild(typeTag);
        headerRow.appendChild(icon);
        headerRow.appendChild(nameBox);
        
        // 描述信息
        if (item.description) {
            var desc = document.createElement('div');
            desc.style.cssText = `
                font-size: 12px;
                color: #666;
                margin-bottom: 6px;
                line-height: 1.4;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            desc.textContent = item.description;
            desc.title = item.description; // 悬停显示完整描述
            card.appendChild(headerRow);
            card.appendChild(desc);
        } else {
            card.appendChild(headerRow);
        }
        
        // 月份条（缩小版）
        var monthBar = document.createElement('div');
        monthBar.innerHTML = makeMonthBarHTML(item.bloomStart, item.bloomEnd, item.leafStart, item.leafEnd);
        monthBar.style.cssText = `
            margin-top: 6px;
            opacity: 0.8;
        `;
        card.appendChild(monthBar);
        
        // 添加删除按钮到卡片
        card.appendChild(deleteBtn);
        
        // 添加卡片到容器
        container.appendChild(card);
    });
}

function deleteLocalPlant(id) {
    var list = loadLocalPlants();
    var filtered = list.filter(p => p.id !== id);
    saveLocalPlants(filtered);
    // 重新渲染地图和列表
    loadAllPlants();
    renderLocalList();
}

function zoomToPlant(item) {
    if (!item) return;
    if (item.type === 'point') {
        map.setCenter(item.position);
        map.setZoom(18);
        // 尝试寻找 overlay 并打开 info
        var found = _overlays.find(o => o._plantId === item.id);
        if (found._actionInfoWindow) {
            found._actionInfoWindow.open(map, found.getPosition());
            found._actionInfoWindow.setOffset(new AMap.Pixel(0, -30));
        } else if (found && found._infoWindow) {
            try {
                found._infoWindow.open(map, found.getPosition ? found.getPosition() : item.position);
                // 确保地图交互正常
                setTimeout(function() {
                    map.setStatus({dragEnable: true, zoomEnable: true});
                }, 10);
            } catch(e) {
                console.warn('打开单点植物信息窗口出错:', e);
            }
        } else {
            alert('已定位，若要查看详情请点击地图上的标注/区域。');
        }
    } else if (item.type === 'area') {
        // 计算中心点
        var path = item.path || [];
        if (!path.length) return;
        var cx = 0, cy = 0;
        path.forEach(pt => { cx += pt[0]; cy += pt[1]; });
        cx /= path.length; cy /= path.length;
        map.setCenter([cx, cy]);
        map.setZoom(17);
        var found = _overlays.find(o => o._plantId === item.id);
        if (found && found._infoWindow) {
            try {
                // polygon 没有 getPosition，用中心
                if (found._actionInfoWindow) {
                    found._actionInfoWindow.open(map, [cx, cy]);
                    found._actionInfoWindow.setOffset(new AMap.Pixel(0, -30));
                } else if (found._actionInfoWindow) {
                    found._actionInfoWindow.open(map, [cx, cy]);
                    found._actionInfoWindow.setOffset(new AMap.Pixel(0, -30));
                } else if (found._infoWindow) {
                    found._infoWindow.open(map, [cx, cy]);
                    found._infoWindow.setOffset(new AMap.Pixel(0, -30));
                }

                // 确保地图交互正常
                setTimeout(function() {
                    map.setStatus({dragEnable: true, zoomEnable: true});
                }, 10);
            } catch(e) {
                console.warn('打开区域植物信息窗口出错:', e);
            }
        } else {
            alert('已定位到区域中心，若要查看详情请点击地图上的区域。');
        }
    }
}
// ✅ 统一关闭所有 InfoWindow 和详情面板
function closeAllInfoWindows() {
    try {
        // 关闭所有 AMap.InfoWindow
        map.getAllOverlays('marker').forEach(m => {
            if (m._infoWindow) m._infoWindow.close();
            if (m._actionInfoWindow) m._actionInfoWindow.close();
        });
    } catch (e) { console.warn('关闭 InfoWindow 时出错', e); }

    // 隐藏右上角详情面板
    var detailPanel = document.getElementById('detailPanel');
    if (detailPanel) detailPanel.style.display = 'none';
}

// 全局函数：显示植物详情面板
function showPlantDetail(plantId, plantType) {
    var detailPanel = document.getElementById('detailPanel');
    var detailContent = document.getElementById('detailContent');
    var detailActions = document.getElementById('detailActions');
    closeAllInfoWindows();

    if (!detailPanel || !detailContent) return;
    
    // 查找植物数据
    var plant = findPlantById(plantId);
    if (!plant) {
        alert('未找到植物数据');
        return;
    }
    
    // 构建详情内容
    var content = `
        <div style="border-bottom:1px solid #eee;padding-bottom:12px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                <img src="${plant.icon || 'images/tree.png'}" alt="${plant.name}" style="width:48px;height:48px;object-fit:contain;border-radius:6px;border:1px solid #ddd;">
                <div>
                    <h4 style="margin:0;font-size:18px;color:#333;">${plant.name}</h4>
                    <p style="margin:2px 0;color:#666;font-size:14px;">${plant.type === 'point' ? '单株植物' : '区域植物'}</p>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom:12px;">
            <h5 style="margin:0 0 6px 0;color:#333;">基本信息</h5>
            <p style="margin:4px 0;color:#666;"><strong>描述：</strong>${plant.description || '暂无描述'}</p>
            ${plant.bloomStart || plant.bloomEnd ? `<p style="margin:4px 0;color:#666;"><strong>花期：</strong>${plant.bloomStart || ''} ${plant.bloomEnd ? '- ' + plant.bloomEnd : ''}</p>` : ''}
            ${plant.leafStart || plant.leafEnd ? `<p style="margin:4px 0;color:#666;"><strong>落叶期：</strong>${plant.leafStart || ''} ${plant.leafEnd ? '- ' + plant.leafEnd : ''}</p>` : ''}
        </div>
        
        <div style="margin-bottom:12px;">
            <h5 style="margin:0 0 6px 0;color:#333;">位置信息</h5>
            ${plant.type === 'point' ? 
                `<p style="margin:4px 0;color:#666;"><strong>坐标：</strong>${plant.position ? plant.position.join(', ') : '未知'}</p>` :
                `<p style="margin:4px 0;color:#666;"><strong>区域：</strong>${plant.path ? plant.path.length + '个顶点' : '未知'}</p>`
            }
        </div>
        
        ${makeMonthBarHTML(plant.bloomStart, plant.bloomEnd, plant.leafStart, plant.leafEnd)}
    `;
    
    detailContent.innerHTML = content;
    detailActions.style.display = 'block';
    
    // 存储当前选中的植物ID，供删除等操作使用
    detailPanel._currentPlantId = plantId;
    
    // 显示面板
    detailPanel.style.display = 'block';
}

// 全局函数：从地图删除植物
function deletePlantFromMap(plantId) {
    if (!confirm('确定要删除这个植物吗？')) return;
    closeAllInfoWindows();
    // 从本地存储中删除
    var local = loadLocalPlants();
    var filtered = local.filter(p => p.id != plantId);
    saveLocalPlants(filtered);
    
    // 重新加载地图和列表
    loadAllPlants();
    renderLocalList();
    
    // 如果详情面板正在显示该植物，则关闭面板
    var detailPanel = document.getElementById('detailPanel');
    if (detailPanel && detailPanel._currentPlantId == plantId) {
        detailPanel.style.display = 'none';
    }
    
    // alert('植物已删除');
}

// 辅助函数：根据ID查找植物
function findPlantById(plantId) {
    var local = loadLocalPlants();
    return local.find(p => p.id == plantId) || null;
}

// 初始化详情面板事件
document.addEventListener('DOMContentLoaded', function() {
    // ========== 控制面板折叠功能 ==========
    
    // 添加植物区域折叠
    var addPlantHeader = document.getElementById('addPlantHeader');
    var addPlantContent = document.getElementById('addPlantContent');
    var addPlantToggle = document.getElementById('addPlantToggle');
    
    if (addPlantHeader && addPlantContent && addPlantToggle) {
        addPlantHeader.addEventListener('click', function() {
            var isHidden = addPlantContent.style.display === 'none';
            if (isHidden) {
                // 展开
                addPlantContent.style.display = 'block';
                addPlantToggle.textContent = '-';
                addPlantToggle.style.transform = 'rotate(0deg)';
            } else {
                // 收起
                addPlantContent.style.display = 'none';
                addPlantToggle.textContent = '+';
                addPlantToggle.style.transform = 'rotate(0deg)';
            }
        });
    }
    
    // 本地植物列表折叠
    var localListHeader = document.getElementById('localListHeader');
    var localListContent = document.getElementById('localListContent');
    var localListToggle = document.getElementById('localListToggle');
    
    if (localListHeader && localListContent && localListToggle) {
        localListHeader.addEventListener('click', function() {
            var isHidden = localListContent.style.display === 'none';
            if (isHidden) {
                // 展开
                localListContent.style.display = 'block';
                localListToggle.textContent = '▲';
            } else {
                // 收起
                localListContent.style.display = 'none';
                localListToggle.textContent = '▼';
            }
        });
    }
    
    // ========== 详情面板事件 ==========
    
    // 关闭详情面板
    var closeDetailBtn = document.getElementById('closeDetailBtn');
    var detailPanel = document.getElementById('detailPanel');
    
    if (closeDetailBtn && detailPanel) {
        closeDetailBtn.addEventListener('click', function() {
            detailPanel.style.display = 'none';
        });
    }
    
    // 编辑按钮（暂时只显示提示）
    var editPlantBtn = document.getElementById('editPlantBtn');
    if (editPlantBtn) {
        editPlantBtn.addEventListener('click', function() {
            alert('编辑功能开发中...');
        });
    }
    
    // 删除按钮
    var deletePlantBtn = document.getElementById('deletePlantBtn');
    if (deletePlantBtn && detailPanel) {
        deletePlantBtn.addEventListener('click', function() {
            var plantId = detailPanel._currentPlantId;
            if (plantId) {
                deletePlantFromMap(plantId);
            }
        });
    }
});

