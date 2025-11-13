/**
 * Markdown查看器模块
 * 负责加载和渲染植物详细介绍的Markdown文件
 */

// 植物介绍文件存放目录
const PLANT_DOCS_DIR = 'data/plant-docs/';

/**
 * 简易Markdown解析器
 * 支持常用Markdown语法
 */
class SimpleMarkdownParser {
    parse(markdown) {
        if (!markdown) return '';
        
        let html = markdown;
        
        // 转义HTML特殊字符（在其他转换之前）
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;'
        };
        
        // 标题 (h1-h6)
        html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
        html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
        html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
        
        // 粗体 **text** 或 __text__
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // 斜体 *text* 或 _text_
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        
        // 代码块 ```code```
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // 行内代码 `code`
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // 链接 [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // 图片 ![alt](url)
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:12px 0;">');
        
        // 无序列表
        html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // 有序列表
        html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');
        
        // 引用块
        html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
        
        // 水平线
        html = html.replace(/^(---|\*\*\*|___)$/gm, '<hr>');
        
        // 段落（处理连续的非HTML行）
        html = html.split('\n\n').map(para => {
            para = para.trim();
            if (!para) return '';
            // 如果不是HTML标签开头，包装为段落
            if (!para.match(/^<[^>]+>/)) {
                return '<p>' + para + '</p>';
            }
            return para;
        }).join('\n');
        
        return html;
    }
}

// 创建解析器实例
const markdownParser = new SimpleMarkdownParser();

/**
 * 加载并显示植物的Markdown详细介绍
 * @param {string} plantName - 植物名称
 * @param {string} docPath - Markdown文件路径（可选，从species.json获取）
 * @param {HTMLElement} container - 显示容器
 */
async function loadPlantMarkdown(plantName, docPath, container) {
    if (!container) {
        console.error('未指定显示容器');
        return;
    }
    
    // 显示加载状态
    container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#999;">
            <div style="font-size:32px;margin-bottom:12px;">📖</div>
            <div>正在加载详细介绍...</div>
        </div>
    `;
    
    try {
        // 如果没有指定路径，尝试从species defaults获取
        if (!docPath) {
            const speciesInfo = window.speciesDefaults && window.speciesDefaults[plantName];
            docPath = speciesInfo && speciesInfo.docPath;
        }
        
        // 如果仍然没有路径，使用默认路径
        if (!docPath) {
            docPath = `${PLANT_DOCS_DIR}${encodeURIComponent(plantName)}.md`;
        }
        
        // 加载Markdown文件
        const response = await fetch(docPath);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const markdown = await response.text();
        
        // 解析并渲染
        const html = markdownParser.parse(markdown);
        
        // 创建带样式的容器
        container.innerHTML = `
            <div class="markdown-content">
                ${html}
            </div>
        `;
        
    } catch (error) {
        console.warn(`加载植物介绍失败: ${error.message}`);
        
        // 显示友好的错误信息
        container.innerHTML = `
            <div style="text-align:center;padding:40px 20px;color:#999;">
                <div style="font-size:32px;margin-bottom:12px;">📄</div>
                <div style="color:#666;margin-bottom:8px;">暂无详细介绍</div>
                <div style="font-size:13px;color:#999;">
                    ${plantName} 的详细资料正在整理中
                </div>
            </div>
        `;
    }
}

/**
 * 扩展showPlantDetail函数，支持Markdown内容
 * 这个函数会覆盖main.js中的原函数
 */
const originalShowPlantDetail = window.showPlantDetail;

window.showPlantDetail = function(plantId, plantType) {
    // 先调用原函数显示基本信息
    if (originalShowPlantDetail) {
        originalShowPlantDetail(plantId, plantType);
    }
    
    // 查找植物数据
    const plant = findPlantById(plantId);
    if (!plant) return;
    
    // 在详情内容区域添加Markdown内容部分
    const detailContent = document.getElementById('detailContent');
    if (detailContent) {
        // 保存原有内容
        const basicInfo = detailContent.innerHTML;
        
        // 创建新布局：基本信息 + 详细介绍标签页
        detailContent.innerHTML = `
            <div id="plantDetailTabs">
                <div class="tab-buttons" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid #f0f0f0;">
                    <button class="tab-btn active" onclick="switchDetailTab('basic')" style="flex:1;padding:10px;border:none;background:none;cursor:pointer;border-bottom:3px solid #2196F3;color:#2196F3;font-weight:600;">
                        基本信息
                    </button>
                    <button class="tab-btn" onclick="switchDetailTab('detailed')" style="flex:1;padding:10px;border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;color:#666;font-weight:600;">
                        详细介绍
                    </button>
                </div>
                <div id="basicTab" class="tab-content" style="display:block;">
                    ${basicInfo}
                </div>
                <div id="detailedTab" class="tab-content" style="display:none;">
                    <div id="markdownContainer"></div>
                </div>
            </div>
        `;
        
        // 加载Markdown内容
        const markdownContainer = document.getElementById('markdownContainer');
        if (markdownContainer) {
            // 从species defaults获取文档路径
            const speciesInfo = window.speciesDefaults && window.speciesDefaults[plant.name];
            const docPath = speciesInfo && speciesInfo.docPath;
            
            loadPlantMarkdown(plant.name, docPath, markdownContainer);
        }
    }
};

/**
 * 切换详情标签页
 */
window.switchDetailTab = function(tabName) {
    // 更新标签按钮状态
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = '#666';
    });
    
    // 隐藏所有标签内容
    document.getElementById('basicTab').style.display = 'none';
    document.getElementById('detailedTab').style.display = 'none';
    
    // 显示选中的标签
    if (tabName === 'basic') {
        document.getElementById('basicTab').style.display = 'block';
        tabButtons[0].style.borderBottomColor = '#2196F3';
        tabButtons[0].style.color = '#2196F3';
    } else if (tabName === 'detailed') {
        document.getElementById('detailedTab').style.display = 'block';
        tabButtons[1].style.borderBottomColor = '#2196F3';
        tabButtons[1].style.color = '#2196F3';
    }
};

// 导出函数
window.loadPlantMarkdown = loadPlantMarkdown;
window.markdownParser = markdownParser;
