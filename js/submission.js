/**
 * GitHub数据提交模块
 * 负责处理用户向GitHub仓库提交植物数据
 */

// GitHub仓库配置
const GITHUB_CONFIG = {
    owner: 'iceinke',  // 替换为你的GitHub用户名
    repo: 'campus-plants-map',         // 替换为你的仓库名
    branch: 'main',          // 提交分支（建议使用独立分支）
    token: null                     // 不在前端存储token，使用GitHub App或OAuth
};

/**
 * 初始化提交系统
 */
function initSubmissionSystem() {
    // 添加"提交到GitHub"按钮到控制面板
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn && exportBtn.parentNode) {
        const submitBtn = document.createElement('button');
        submitBtn.id = 'submitToGitHubBtn';
        submitBtn.textContent = '📤 提交植物数据到GitHub';
        submitBtn.style.cssText = 'background:#4CAF50;color:white;border:none;margin-top:8px;';
        submitBtn.addEventListener('click', openSubmissionDialog);
        exportBtn.parentNode.insertBefore(submitBtn, exportBtn.nextSibling);
    }
}

/**
 * 打开提交对话框
 */
function openSubmissionDialog() {
    const localPlants = loadLocalPlants();
    if (!localPlants || localPlants.length === 0) {
        alert('暂无本地植物数据可提交');
        return;
    }

    // 创建提交对话框
    const dialog = createSubmissionDialog(localPlants);
    document.body.appendChild(dialog);
}

/**
 * 创建提交对话框UI
 */
function createSubmissionDialog(plants) {
    const overlay = document.createElement('div');
    overlay.id = 'submissionOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;

    dialog.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;color:#333;">提交植物数据</h3>
            <button onclick="closeSubmissionDialog()" style="background:#f5f5f5;border:1px solid #ddd;padding:4px 12px;cursor:pointer;border-radius:4px;font-size:18px;">✕</button>
        </div>
        
        <p style="color:#666;font-size:14px;margin-bottom:16px;">
            您将提交 <strong>${plants.length}</strong> 条植物数据。请选择提交方式：
        </p>

        <div style="margin-bottom:20px;">
            <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;cursor:pointer;transition:all 0.2s;" 
                 onmouseover="this.style.background='#f5f5f5';this.style.borderColor='#2196F3';" 
                 onmouseout="this.style.background='white';this.style.borderColor='#e0e0e0';"
                 onclick="selectSubmissionMethod('github-issue')">
                <h4 style="margin:0 0 8px 0;color:#333;">
                    📋 方式1: GitHub Issue（推荐）
                </h4>
                <p style="margin:0;font-size:13px;color:#666;">
                    在GitHub仓库创建Issue，包含您的植物数据。无需GitHub账号授权，维护者可以审核后添加到主数据库。
                </p>
            </div>

            <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;cursor:pointer;transition:all 0.2s;" 
                 onmouseover="this.style.background='#f5f5f5';this.style.borderColor='#2196F3';" 
                 onmouseout="this.style.background='white';this.style.borderColor='#e0e0e0';"
                 onclick="selectSubmissionMethod('download-json')">
                <h4 style="margin:0 0 8px 0;color:#333;">
                    💾 方式2: 下载JSON文件
                </h4>
                <p style="margin:0;font-size:13px;color:#666;">
                    下载包含您数据的JSON文件，然后通过GitHub网页或Pull Request手动提交。
                </p>
            </div>
        </div>

        <div style="background:#FFF3E0;border-left:4px solid #FF9800;padding:12px;border-radius:4px;font-size:13px;color:#666;">
            <strong>💡 提示：</strong>提交的数据将由维护者审核后添加到公共数据库，保护隐私和数据质量。
        </div>
    `;

    overlay.appendChild(dialog);
    return overlay;
}

/**
 * 关闭提交对话框
 */
function closeSubmissionDialog() {
    const overlay = document.getElementById('submissionOverlay');
    if (overlay) overlay.remove();
}

/**
 * 选择提交方式
 */
function selectSubmissionMethod(method) {
    const plants = loadLocalPlants();
    
    if (method === 'github-issue') {
        createGitHubIssue(plants);
    } else if (method === 'download-json') {
        downloadPlantsJSON(plants);
    }
}

/**
 * 创建GitHub Issue
 */
function createGitHubIssue(plants) {
    // 生成Issue内容
    const issueTitle = encodeURIComponent(`[数据提交] 新增${plants.length}条植物数据`);
    const issueBody = encodeURIComponent(generateIssueBody(plants));
    
    // 构造GitHub Issue URL
    const issueUrl = `https://github.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/issues/new?title=${issueTitle}&body=${issueBody}&labels=data-submission`;
    
    // 在新标签页打开
    window.open(issueUrl, '_blank');
    
    closeSubmissionDialog();
    
    alert('即将打开GitHub Issue页面。请登录GitHub账号后点击"Submit new issue"完成提交。');
}

/**
 * 生成Issue内容
 */
function generateIssueBody(plants) {
    let body = `## 📊 植物数据提交\n\n`;
    body += `**提交时间**: ${new Date().toLocaleString('zh-CN')}\n\n`;
    body += `**数据数量**: ${plants.length}条\n\n`;
    body += `---\n\n`;
    body += `### 数据内容\n\n`;
    body += `\`\`\`json\n${JSON.stringify(plants, null, 2)}\n\`\`\`\n\n`;
    body += `---\n\n`;
    body += `### ✅ 审核清单\n\n`;
    body += `- [ ] 数据格式正确\n`;
    body += `- [ ] 位置信息准确\n`;
    body += `- [ ] 植物名称规范\n`;
    body += `- [ ] 无重复数据\n\n`;
    body += `感谢您的贡献！ 🌱`;
    
    return body;
}

/**
 * 下载植物数据为JSON文件
 */
function downloadPlantsJSON(plants) {
    // 添加提交元数据
    const submissionData = {
        submissionTime: new Date().toISOString(),
        dataCount: plants.length,
        plants: plants
    };
    
    const dataStr = JSON.stringify(submissionData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `plant_submission_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    closeSubmissionDialog();
    
    alert('文件已下载！您可以通过GitHub网页上传此文件，或在本地创建Pull Request。');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSubmissionSystem);
} else {
    initSubmissionSystem();
}

// 导出函数供全局使用
window.closeSubmissionDialog = closeSubmissionDialog;
window.selectSubmissionMethod = selectSubmissionMethod;
