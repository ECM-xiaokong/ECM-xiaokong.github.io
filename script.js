// 页面初始化：等待 DOM 就绪后注册所有交互功能
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const ACCESS_STORAGE_KEY = 'meow_access_granted_at';
    const ACCESS_TOKEN_KEY = 'meow_access_token';
    const ACCESS_ROLE_KEY = 'meow_access_role';
    const LAST_TAB_STORAGE_KEY = 'meow_last_tab';
    const ACCESS_DURATION = 30 * 24 * 60 * 60 * 1000;
    let pendingTabName = null;

    const confirmModal = document.getElementById('confirmModal');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmCancel = document.getElementById('confirmCancel');
    const confirmDelete = document.getElementById('confirmDelete');
    let confirmResolver = null;

    function closeConfirmModal(result) {
        confirmModal.classList.remove('active');
        confirmModal.setAttribute('aria-hidden', 'true');
        if (confirmResolver) {
            const resolve = confirmResolver;
            confirmResolver = null;
            resolve(result);
        }
    }

    window.requestDeleteConfirmation = (message) => new Promise((resolve) => {
        confirmResolver = resolve;
        confirmMessage.textContent = message || '确定要删除这条链接吗？';
        confirmModal.classList.add('active');
        confirmModal.setAttribute('aria-hidden', 'false');
    });

    confirmCancel.addEventListener('click', () => closeConfirmModal(false));
    confirmDelete.addEventListener('click', () => closeConfirmModal(true));
    confirmModal.addEventListener('click', (event) => {
        if (event.target === confirmModal) closeConfirmModal(false);
    });

    function hasValidAccess() {
        const grantedAt = Number(localStorage.getItem(ACCESS_STORAGE_KEY));
        const valid = Number.isFinite(grantedAt)
            && Date.now() - grantedAt < ACCESS_DURATION
            && Boolean(localStorage.getItem(ACCESS_TOKEN_KEY));
        if (!valid) {
            localStorage.removeItem(ACCESS_STORAGE_KEY);
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(ACCESS_ROLE_KEY);
            document.body.classList.remove('is-access-granted', 'is-admin');
        }
        return valid;
    }

    function applyAccessState() {
        const valid = hasValidAccess();
        document.body.classList.toggle('is-access-granted', valid);
        const isAdmin = valid && localStorage.getItem(ACCESS_ROLE_KEY) === 'admin';
        document.body.classList.toggle('is-admin', isAdmin);
        const accessButton = document.getElementById('accessButton');
        if (accessButton) accessButton.textContent = isAdmin ? '🔑 管理员' : valid ? '🔑 已授权' : '🔑 暗号';
        if (valid) document.dispatchEvent(new Event('accessGranted'));
    }

    function getAccessToken() {
        return hasValidAccess() ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    }

    window.getAccessToken = getAccessToken;
    window.hasAdminAccess = () => hasValidAccess() && localStorage.getItem(ACCESS_ROLE_KEY) === 'admin';

    // 标签页切换：同步内容面板和导航按钮的 active 状态
    function switchTab(tabName, event) {
        if (event) event.preventDefault();

        const requestedContent = document.getElementById(tabName);
        if (requestedContent?.hasAttribute('data-access-required') && !hasValidAccess()) {
            pendingTabName = tabName;
            window.openAccessModal();
            return;
        }

        tabContents.forEach((content) => content.classList.remove('active'));
        tabButtons.forEach((btn) => btn.classList.remove('active'));

        const selectedContent = document.getElementById(tabName);
        if (selectedContent) {
            selectedContent.classList.add('active');
        }

        if (tabName === 'message') {
            document.dispatchEvent(new Event('messageTabVisible'));
        }

        const activeButton = [...tabButtons].find((btn) => btn.dataset.tab === tabName);
        if (activeButton) activeButton.classList.add('active');
        localStorage.setItem(LAST_TAB_STORAGE_KEY, tabName);
    }

    window.switchTab = switchTab;

    // 设置面板开关：点击齿轮或关闭按钮显示/隐藏设置面板
    function toggleSettings() {
        const panel = document.getElementById('settingsPanel');
        if (!panel) return;
        panel.classList.toggle('active');
    }

    window.toggleSettings = toggleSettings;

    // 访问暗号：通过 Supabase RPC 校验，成功后 30 天内免重复输入
    (function() {
        const accessButton = document.getElementById('accessButton');
        const accessModal = document.getElementById('accessModal');
        const accessClose = document.getElementById('accessClose');
        const accessForm = document.getElementById('accessForm');
        const accessStatus = document.getElementById('accessStatus');
        const accessSubmit = document.getElementById('accessSubmit');
        const accessPassword = document.getElementById('accessPassword');
        const accessLogout = document.getElementById('accessLogout');
        const changeCodeForm = document.getElementById('changeCodeForm');
        const newNormalCode = document.getElementById('newNormalCode');
        const confirmNormalCode = document.getElementById('confirmNormalCode');
        const changeCodeSubmit = document.getElementById('changeCodeSubmit');
        const changeCodeStatus = document.getElementById('changeCodeStatus');
        const supabaseClient = window.supabaseClient;

        function setAccessStatus(message, isError = false) {
            accessStatus.textContent = message;
            accessStatus.classList.toggle('status-error', isError);
        }

        function openAccessModal() {
            accessModal.classList.add('active');
            accessModal.setAttribute('aria-hidden', 'false');
            accessPassword.focus();
        }

        function closeAccessModal() {
            accessModal.classList.remove('active');
            accessModal.setAttribute('aria-hidden', 'true');
        }

        function logoutAccess() {
            localStorage.removeItem(ACCESS_STORAGE_KEY);
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(ACCESS_ROLE_KEY);
            applyAccessState();
            accessForm.reset();
            setAccessStatus('已退出暗号授权喵~');
            closeAccessModal();
        }

        window.openAccessModal = openAccessModal;

        accessButton.addEventListener('click', openAccessModal);
        accessLogout.addEventListener('click', logoutAccess);
        accessClose.addEventListener('click', closeAccessModal);
        accessModal.addEventListener('click', (event) => {
            if (event.target === accessModal) closeAccessModal();
        });

        document.querySelectorAll('details[data-access-required]').forEach((details) => {
            details.addEventListener('click', (event) => {
                if (!hasValidAccess()) {
                    event.preventDefault();
                    details.open = false;
                    pendingTabName = 'recommendations';
                    openAccessModal();
                }
            }, true);
        });

        accessForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!supabaseClient) {
                setAccessStatus('Supabase 尚未配置完成喵~', true);
                return;
            }

            accessSubmit.disabled = true;
            const { data, error } = await supabaseClient.rpc('verify_site_password', {
                p_password: accessPassword.value
            });
            accessSubmit.disabled = false;

            if (error || !data?.granted || !data?.token) {
                setAccessStatus(error?.message || '暗号不正确，请联系管理员喵~', true);
                return;
            }

            localStorage.setItem(ACCESS_STORAGE_KEY, String(Date.now()));
            localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
            localStorage.setItem(ACCESS_ROLE_KEY, data.role === 'admin' ? 'admin' : 'normal');
            applyAccessState();
            setAccessStatus(data.role === 'admin' ? '管理员暗号验证成功喵~' : '暗号验证成功喵~');
            accessForm.reset();
            closeAccessModal();
            const targetTab = pendingTabName;
            pendingTabName = null;
            if (targetTab === 'recommendations') {
                document.querySelector('details[data-access-required]')?.setAttribute('open', '');
            } else if (targetTab) {
                switchTab(targetTab);
            }
        });

        changeCodeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!window.hasAdminAccess()) {
                changeCodeStatus.textContent = '需要管理员暗号喵~';
                return;
            }

            const nextCode = newNormalCode.value;
            if (nextCode !== confirmNormalCode.value) {
                changeCodeStatus.textContent = '两次输入的暗号不一致喵~';
                return;
            }
            if (nextCode.length < 6) {
                changeCodeStatus.textContent = '普通暗号至少需要 6 个字符喵~';
                return;
            }
            if (!window.confirm('第一次确认：确定要修改普通暗号吗？')
                || !window.confirm('第二次确认：旧普通暗号将立即失效，仍要继续吗？')) return;

            changeCodeSubmit.disabled = true;
            const { error } = await supabaseClient.rpc('admin_update_normal_password', {
                p_access_token: window.getAccessToken(),
                p_new_password: nextCode
            });
            changeCodeSubmit.disabled = false;
            if (error) {
                changeCodeStatus.textContent = error.message || '普通暗号修改失败喵~';
                return;
            }

            changeCodeForm.reset();
            changeCodeStatus.textContent = '普通暗号已更新喵~';
        });
    })();

    applyAccessState();

    const savedTab = localStorage.getItem(LAST_TAB_STORAGE_KEY);
    if (savedTab && document.getElementById(savedTab)) {
        switchTab(savedTab);
    }

    // 点击面板外部自动关闭设置面板
    document.addEventListener('click', (event) => {
        const panel = document.getElementById('settingsPanel');
        const button = document.getElementById('settingsBtn');
        if (!panel || !button) return;
        if (!panel.contains(event.target) && !button.contains(event.target)) {
            panel.classList.remove('active');
        }
    });

    // 效果设置同步：更新背景亮度、粒子参数和点击文字开关，并持久化到本地
    function updateEffects() {
        const brightness = document.getElementById('bgBrightness').value;
        const trailCount = document.getElementById('trailCount').value;
        const trailMinSize = document.getElementById('trailMinSize').value;
        const trailMaxSize = document.getElementById('trailMaxSize').value;
        const trailSpeed = document.getElementById('trailSpeed').value;
        const trailLife = document.getElementById('trailLife').value;
        const trailGravity = document.getElementById('trailGravity').value;
        const trailSpread = document.getElementById('trailSpread').value;
        const particleEnabled = document.getElementById('particleToggle').checked;
        const clickTextEnabled = document.getElementById('clickTextToggle').checked;

        document.getElementById('brightnessValue').textContent = brightness;
        document.getElementById('trailCountValue').textContent = trailCount;
        document.getElementById('trailMinSizeValue').textContent = trailMinSize;
        document.getElementById('trailMaxSizeValue').textContent = trailMaxSize;
        document.getElementById('trailSpeedValue').textContent = trailSpeed;
        document.getElementById('trailLifeValue').textContent = trailLife;
        document.getElementById('trailGravityValue').textContent = trailGravity;
        document.getElementById('trailSpreadValue').textContent = `${trailSpread}°`;

        document.documentElement.style.setProperty('--bg-brightness', (brightness / 100).toFixed(2));

        window.__trailEnabled = particleEnabled;
        window.__clickTextEnabled = clickTextEnabled;

        localStorage.setItem('effectSettings', JSON.stringify({
            brightness,
            particleEnabled,
            clickTextEnabled,
            trailCount,
            trailMinSize,
            trailMaxSize,
            trailSpeed,
            trailLife,
            trailGravity,
            trailSpread
        }));
    }

    window.updateEffects = updateEffects;

    // 加载上次保存的效果设置；没有历史记录时使用 HTML 中的默认值
    function loadEffectSettings() {
        const saved = localStorage.getItem('effectSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                document.getElementById('bgBrightness').value = settings.brightness || 100;
                document.getElementById('particleToggle').checked = settings.particleEnabled !== false;
                document.getElementById('clickTextToggle').checked = settings.clickTextEnabled !== false;
                document.getElementById('trailCount').value = settings.trailCount || 2;
                document.getElementById('trailMinSize').value = settings.trailMinSize || 5;
                document.getElementById('trailMaxSize').value = settings.trailMaxSize || 12.5;
                document.getElementById('trailSpeed').value = settings.trailSpeed || 0.3;
                document.getElementById('trailLife').value = settings.trailLife || 90;
                document.getElementById('trailGravity').value = settings.trailGravity === -0.02 ? 0 : (settings.trailGravity ?? 0);
                document.getElementById('trailSpread').value = settings.trailSpread === 360 ? 70 : (settings.trailSpread ?? 70);
            } catch (error) {
                console.error('Failed to load effect settings:', error);
            }
        }

        updateEffects();
    }

    document.querySelectorAll('input[type="range"]').forEach((input) => {
        input.addEventListener('input', updateEffects);
    });

    document.getElementById('particleToggle').addEventListener('change', updateEffects);
    document.getElementById('clickTextToggle').addEventListener('change', updateEffects);

    loadEffectSettings();

    // 鼠标粒子系统：创建、更新和绘制跟随指针的粒子
    (function() {
        const canvas = document.getElementById('cursor-fx-canvas');
        const ctx = canvas.getContext('2d');
        let particles = [];
        let mouseX = -100;
        let mouseY = -100;
        let moveDirectionX = 0;
        let moveDirectionY = -1;
        let mouseInPage = false;
        let lastMoveTime = 0;
        let lastFrameTime = performance.now();

        const MAX_PARTICLES = 800;
        const COLORS = ['#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#023e8a', '#0096c7', '#00a8e8', '#7ec8e3'];

        function setTrailState() {
            const enabled = document.getElementById('particleToggle').checked;
            window.__trailEnabled = enabled;
            if (!enabled) {
                particles = [];
                const width = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
                const height = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
                ctx.clearRect(0, 0, width, height);
            }
        }

        function readTrailSettings() {
            return {
                count: Number(document.getElementById('trailCount').value || 2),
                minSize: Number(document.getElementById('trailMinSize').value || 5),
                maxSize: Number(document.getElementById('trailMaxSize').value || 12.5),
                speed: Number(document.getElementById('trailSpeed').value || 0.3),
                life: Number(document.getElementById('trailLife').value || 90),
                gravity: Number(document.getElementById('trailGravity').value || 0),
                spread: Number(document.getElementById('trailSpread').value || 70)
            };
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        }

        function hexToRgb(hex) {
            const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return match ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) } : { r: 100, g: 100, b: 100 };
        }

        function getColor(particle, lifeRatio) {
            const rgb = hexToRgb(particle.color);
            return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.95 * lifeRatio})`;
        }

        function drawShape(x, y, size, lifeRatio, shape) {
            const s = size * (0.3 + 0.7 * lifeRatio);
            ctx.beginPath();

            switch (shape) {
                case 'circle':
                    ctx.arc(x, y, s, 0, Math.PI * 2);
                    break;
                case 'square':
                    ctx.rect(x - s, y - s, s * 2, s * 2);
                    break;
                case 'star':
                    for (let i = 0; i < 5; i++) {
                        const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                        const ox = x + Math.cos(a) * s;
                        const oy = y + Math.sin(a) * s;
                        if (i === 0) ctx.moveTo(ox, oy);
                        else ctx.lineTo(ox, oy);
                        const ia = a + (2 * Math.PI) / 10;
                        ctx.lineTo(x + Math.cos(ia) * s * 0.38, y + Math.sin(ia) * s * 0.38);
                    }
                    ctx.closePath();
                    break;
                case 'diamond':
                    ctx.moveTo(x, y - s);
                    ctx.lineTo(x + s, y);
                    ctx.lineTo(x, y + s);
                    ctx.lineTo(x - s, y);
                    ctx.closePath();
                    break;
                default:
                    ctx.arc(x, y, s, 0, Math.PI * 2);
            }

            ctx.fill();
        }

        function spawnParticles(x, y, config) {
            const count = Math.max(1, Math.round(config.count));
            const baseAngle = Math.atan2(-moveDirectionY, -moveDirectionX);
            const spreadRadians = config.spread * Math.PI / 180;
            for (let i = 0; i < count; i++) {
                if (particles.length >= MAX_PARTICLES) break;
                const angle = baseAngle + (Math.random() - 0.5) * spreadRadians;
                const speed = (0.5 + Math.random() * 2.5) * config.speed;
                const size = config.minSize + Math.random() * (config.maxSize - config.minSize);
                const life = config.life + Math.floor(Math.random() * config.life * 0.6);
                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size,
                    life,
                    maxLife: life,
                    color: COLORS[Math.floor(Math.random() * COLORS.length)],
                    shape: 'star',
                    rot: Math.random() * Math.PI * 2,
                    rS: (Math.random() - 0.5) * 0.15
                });
            }
        }

        function updateParticles(dt, config) {
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx * dt * 60;
                p.y += p.vy * dt * 60;
                p.vy += config.gravity * dt * 60;
                p.life -= dt * 60;
                p.rot += p.rS;
                if (p.life <= 0) particles.splice(i, 1);
            }
        }

        function drawParticles() {
            const width = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
            const height = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
            ctx.clearRect(0, 0, width, height);

            ctx.shadowBlur = 12;
            ctx.shadowColor = '#4a9eff';

            for (const p of particles) {
                const lifeRatio = Math.max(0, p.life / p.maxLife);
                ctx.save();
                ctx.globalAlpha = Math.max(0, 0.95 * lifeRatio);
                ctx.fillStyle = getColor(p, lifeRatio);
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                drawShape(0, 0, p.size * lifeRatio, lifeRatio, p.shape);
                ctx.restore();
            }

            ctx.shadowBlur = 0;
        }

        function animate(ts) {
            const dt = Math.min(0.032, (ts - lastFrameTime) / 1000 || 0.016);
            lastFrameTime = ts;

            setTrailState();
            if (!window.__trailEnabled) {
                requestAnimationFrame(animate);
                return;
            }

            const config = readTrailSettings();
            if (mouseInPage && ts - lastMoveTime < 80) {
                spawnParticles(mouseX, mouseY, config);
            }

            updateParticles(dt, config);
            drawParticles();
            requestAnimationFrame(animate);
        }

        document.addEventListener('mousemove', (event) => {
            const deltaX = event.clientX - mouseX;
            const deltaY = event.clientY - mouseY;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance > 0) {
                moveDirectionX = deltaX / distance;
                moveDirectionY = deltaY / distance;
            }
            mouseX = event.clientX;
            mouseY = event.clientY;
            mouseInPage = true;
            lastMoveTime = performance.now();
        });

        document.addEventListener('mouseleave', () => {
            mouseInPage = false;
        });

        document.addEventListener('mouseenter', (event) => {
            mouseX = event.clientX;
            mouseY = event.clientY;
            mouseInPage = true;
            lastMoveTime = performance.now();
        });

        document.addEventListener('touchmove', (event) => {
            if (event.touches[0]) {
                mouseX = event.touches[0].clientX;
                mouseY = event.touches[0].clientY;
                mouseInPage = true;
                lastMoveTime = performance.now();
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            mouseInPage = false;
        });

        window.addEventListener('resize', resize);
        resize();
        requestAnimationFrame(animate);
    })();

    // 点击文字特效：左键点击时生成平滑上浮并淡出的文字
    (function() {
        const clickTextToggle = document.getElementById('clickTextToggle');
        const words = ['✨', '🐱', '喵', '❤', '萌', '可爱', '太赞了', '棒棒哒', '喜欢', '美', '舒服', '绝了', '✓'];
        let clickIndex = 0;

        document.addEventListener('click', (event) => {
            if (event.button !== 0 || !clickTextToggle.checked) return;

            const word = words[clickIndex % words.length];
            clickIndex += 1;

            const span = document.createElement('span');
            span.textContent = word;
            span.style.cssText = `
                position: fixed;
                left: ${event.pageX}px;
                top: ${event.pageY}px;
                z-index: 99999999;
                pointer-events: none;
                font-size: ${16 + Math.random() * 16}px;
                font-weight: bold;
                color: rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)});
                text-shadow: 0 0 10px rgba(74, 158, 255, 0.5);
                user-select: none;
                will-change: transform, opacity;
            `;

            document.body.appendChild(span);

            const startX = event.pageX;
            const startY = event.pageY;
            const driftX = (Math.random() - 0.5) * 24;
            const driftY = -30 - Math.random() * 18;
            const rotation = (Math.random() - 0.5) * 18;
            const startTime = performance.now();
            const duration = 650;

            function tick(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);

                const x = startX + driftX * eased;
                const y = startY + driftY * eased;
                const opacity = 1 - progress;

                span.style.left = `${x}px`;
                span.style.top = `${y}px`;
                span.style.opacity = opacity;
                span.style.transform = `rotate(${rotation * (1 - progress)}deg)`;

                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    span.remove();
                }
            }

            requestAnimationFrame(tick);
        });
    })();

    // 站长推荐：内容从 Supabase 加载，管理员可增删改链接
    (function() {
        const list = document.getElementById('recommendationLinks');
        const form = document.getElementById('recommendationForm');
        const idInput = document.getElementById('recommendationId');
        const titleInput = document.getElementById('recommendationTitle');
        const urlInput = document.getElementById('recommendationUrl');
        const cancelButton = document.getElementById('recommendationCancel');
        const supabaseClient = window.supabaseClient;

        function getWebUrl(value) {
            const text = String(value || '').trim();
            if (/^https?:\/\//i.test(text)) return text;
            return /^[\w-]+(\.[\w-]+)+(\/[^\s]*)?$/i.test(text) ? `https://${text}` : '';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function clearForm() {
            form.reset();
            idInput.value = '';
        }

        async function loadRecommendations() {
            if (!supabaseClient || !window.getAccessToken()) {
                list.innerHTML = '<li class="empty-recommendations">请先输入暗号查看推荐链接喵~</li>';
                return;
            }

            const { data, error } = await supabaseClient.rpc('get_recommendations', {
                p_access_token: window.getAccessToken()
            });
            if (error) {
                list.innerHTML = '<li class="empty-recommendations">推荐链接加载失败喵~</li>';
                return;
            }

            list.innerHTML = data?.length ? data.map((item) => {
                const webUrl = getWebUrl(item.url);
                const faviconUrl = webUrl
                    ? `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(webUrl)}&sz=32`
                    : 'Resources/TX.png';
                return `
                <li>
                    <a href="${escapeHtml(webUrl || item.url)}" target="_blank" rel="noopener noreferrer"><img class="link-favicon" src="${escapeHtml(faviconUrl)}" alt="" width="16" height="16" loading="lazy" onerror="this.onerror=null;this.src='Resources/TX.png';">${escapeHtml(item.title)}</a>
                    <span class="admin-only recommendation-actions">
                        <button class="recommendation-admin-action" type="button" data-recommendation-edit="${item.id}">编辑</button>
                        <button class="recommendation-admin-action" type="button" data-recommendation-delete="${item.id}">删除</button>
                    </span>
                </li>
            `;
            }).join('') : '<li class="empty-recommendations">暂无推荐链接喵~</li>';
            document.body.classList.toggle('is-admin', window.hasAdminAccess());
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!window.hasAdminAccess()) return window.openAccessModal();
            const payload = {
                p_access_token: window.getAccessToken(),
                p_id: idInput.value ? Number(idInput.value) : null,
                p_title: titleInput.value.trim(),
                p_url: urlInput.value.trim()
            };
            const { error } = await supabaseClient.rpc('admin_upsert_recommendation', payload);
            if (error) return window.alert(error.message);
            clearForm();
            await loadRecommendations();
        });

        cancelButton.addEventListener('click', clearForm);
        document.addEventListener('click', async (event) => {
            const editButton = event.target.closest('[data-recommendation-edit]');
            const deleteButton = event.target.closest('[data-recommendation-delete]');
            if (editButton) {
                const { data } = await supabaseClient.rpc('get_recommendation', {
                    p_access_token: window.getAccessToken(),
                    p_id: Number(editButton.dataset.recommendationEdit)
                });
                const item = Array.isArray(data) ? data[0] : data;
                if (item) {
                    idInput.value = item.id;
                    titleInput.value = item.title;
                    urlInput.value = item.url;
                    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
            if (deleteButton) {
                if (!window.hasAdminAccess()) return;
                if (!await window.requestDeleteConfirmation('确定要删除这条推荐链接吗？')) return;
                const { error } = await supabaseClient.rpc('admin_delete_recommendation', {
                    p_access_token: window.getAccessToken(),
                    p_id: Number(deleteButton.dataset.recommendationDelete)
                });
                if (error) window.alert(error.message);
                await loadRecommendations();
            }
        });

        document.addEventListener('accessGranted', loadRecommendations);
        loadRecommendations();
    })();

    // 普通分类链接公开读取，管理员可增删改
    (function() {
        const supabaseClient = window.supabaseClient;
        const CATEGORIES = ['contact', 'study', 'ai', 'article'];
        const CATEGORY_NAMES = {
            contact: '📞 联系方式喵',
            study: '📚 学习网站',
            ai: '🤖 AI',
            article: '📝 文章'
        };

        function ensureCategoryShells() {
            const container = document.getElementById('categoryList');
            if (!container || container.children.length) return;
            container.innerHTML = CATEGORIES.map((categoryId) => `
                <details class="category-item">
                    <summary class="category-summary"><span>${CATEGORY_NAMES[categoryId]}</span><button class="admin-only category-edit-btn" type="button" data-category-id="${categoryId}">编辑</button></summary>
                    <ul class="category-links" data-category-id="${categoryId}"><li class="category-loading">加载中喵~</li></ul>
                    <form class="category-admin-form admin-only" data-category-id="${categoryId}">
                        <input type="hidden" class="cat-link-id">
                        <input type="text" class="cat-link-title" placeholder="链接名称" required>
                        <input type="text" class="cat-link-url" placeholder="网址或联系方式（选填）">
                        <div class="admin-form-actions">
                            <button class="btn cat-save-btn" type="submit">保存</button>
                            <button class="admin-cancel-button cat-cancel-btn" type="button">取消</button>
                        </div>
                    </form>
                </details>
            `).join('');
        }

        function getWebUrl(value) {
            const text = String(value || '').trim();
            if (/^https?:\/\//i.test(text)) return text;
            return /^[\w-]+(\.[\w-]+)+(\/[^\s]*)?$/i.test(text) ? `https://${text}` : '';
        }

        function getFaviconUrl(url) {
            if (!url) return '';
            try {
                new URL(url);
                return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=32`;
            } catch {
                return '';
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function getCategoryList(categoryId) {
            return document.querySelector(`.category-links[data-category-id="${categoryId}"]`);
        }

        function getCategoryForm(categoryId) {
            return document.querySelector(`.category-admin-form[data-category-id="${categoryId}"]`);
        }

        function clearCategoryForm(categoryId) {
            const form = getCategoryForm(categoryId);
            if (!form) return;
            form.querySelector('.cat-link-id').value = '';
            form.querySelector('.cat-link-title').value = '';
            form.querySelector('.cat-link-url').value = '';
        }

        function renderCategoryLinks(categoryId, links) {
            const list = getCategoryList(categoryId);
            if (!list) return;

            if (!links || links.length === 0) {
                list.innerHTML = `<li class="category-loading">暂无链接，管理员可点击编辑添加喵~</li>`;
                return;
            }

            list.innerHTML = links.map((item) => {
                const contactValue = escapeHtml(item.url || '');
                const webUrl = getWebUrl(item.url);
                const isWebUrl = Boolean(webUrl);
                const favicon = isWebUrl ? getFaviconUrl(webUrl) : '';
                const faviconSource = favicon || 'Resources/TX.png';
                const faviconHtml = `<img class="link-favicon" src="${escapeHtml(faviconSource)}" alt="" width="16" height="16" loading="lazy" onerror="this.onerror=null;this.src='Resources/TX.png';">`;
                const contactPrefix = categoryId === 'contact' && contactValue ? `${escapeHtml(item.title)} : ` : '';
                const displayTitle = categoryId === 'contact' && contactValue ? contactValue : escapeHtml(item.title);
                const linkHtml = isWebUrl
                    ? `<a href="${escapeHtml(webUrl)}" target="_blank" rel="noopener noreferrer">${faviconHtml}${contactPrefix}${displayTitle}</a>`
                    : `<span>${faviconHtml}${contactPrefix}${displayTitle || escapeHtml(item.title)}</span>`;
                return `<li>${linkHtml}<span class="admin-only category-link-actions"><button class="admin-only cat-edit-btn" type="button" data-cat-edit="${item.id}" data-cat-category="${categoryId}" data-cat-title="${escapeHtml(item.title)}" data-cat-url="${contactValue}">编辑</button><button class="admin-only cat-delete-btn" type="button" data-cat-delete="${item.id}" data-cat-category="${categoryId}">删除</button></span></li>`;
            }).join('');
        }

        async function loadCategoryLinks(categoryId) {
            if (!supabaseClient) {
                const list = getCategoryList(categoryId);
                if (list) list.innerHTML = '<li class="category-loading">数据库尚未配置喵~</li>';
                return;
            }

            const { data, error } = await supabaseClient.rpc('get_category_links', {
                p_category_id: categoryId
            });

            if (error) {
                console.error('加载分类链接失败:', error);
                const list = getCategoryList(categoryId);
                if (list) list.innerHTML = '<li class="category-loading">链接加载失败喵~</li>';
                return;
            }

            renderCategoryLinks(categoryId, data);
            document.body.classList.toggle('is-admin', window.hasAdminAccess());
        }

        async function loadAllCategoryLinks() {
            ensureCategoryShells();
            for (const catId of CATEGORIES) {
                await loadCategoryLinks(catId);
            }
        }

        ensureCategoryShells();

        // 监听编辑按钮点击
        document.addEventListener('click', (event) => {
            const linkEditBtn = event.target.closest('.cat-edit-btn');
            if (linkEditBtn && window.hasAdminAccess()) {
                const form = getCategoryForm(linkEditBtn.dataset.catCategory);
                if (form) {
                    form.querySelector('.cat-link-id').value = linkEditBtn.dataset.catEdit;
                    form.querySelector('.cat-link-title').value = linkEditBtn.dataset.catTitle;
                    form.querySelector('.cat-link-url').value = linkEditBtn.dataset.catUrl;
                    form.closest('details')?.setAttribute('open', '');
                    form.style.display = 'flex';
                    form.querySelector('.cat-link-title').focus();
                }
                return;
            }
            const editBtn = event.target.closest('.category-edit-btn');
            if (!editBtn || !window.hasAdminAccess()) return;
            event.preventDefault();
            event.stopPropagation();

            const categoryId = editBtn.dataset.categoryId;
            const form = getCategoryForm(categoryId);
            if (!form) return;

            const details = form.closest('details');
            if (details) details.setAttribute('open', '');

            const isVisible = form.style.display !== 'none';
            if (isVisible) {
                form.style.display = 'none';
                editBtn.textContent = '编辑';
            } else {
                // 隐藏其他所有编辑表单
                document.querySelectorAll('.category-admin-form').forEach(f => f.style.display = 'none');
                document.querySelectorAll('.category-edit-btn').forEach(b => b.textContent = '编辑');
                form.style.display = 'flex';
                editBtn.textContent = '关闭编辑';
                form.querySelector('.cat-link-title').focus();
            }
        });

        // 保存链接
        document.addEventListener('submit', async (event) => {
            const form = event.target.closest('.category-admin-form');
            if (!form || !window.hasAdminAccess()) return;
            event.preventDefault();

            const categoryId = form.dataset.categoryId;
            const idInput = form.querySelector('.cat-link-id');
            const titleInput = form.querySelector('.cat-link-title');
            const urlInput = form.querySelector('.cat-link-url');

            // 获取当前最大 display_order
            const list = getCategoryList(categoryId);
            const existingItems = list ? list.querySelectorAll('[data-cat-delete]') : [];
            const maxOrder = existingItems.length;

            const payload = {
                p_access_token: window.getAccessToken(),
                p_id: idInput.value ? Number(idInput.value) : null,
                p_category_id: categoryId,
                p_title: titleInput.value.trim(),
                p_url: urlInput.value.trim(),
                p_display_order: maxOrder + 1
            };

            const { error } = await supabaseClient.rpc('admin_upsert_category_link', payload);
            if (error) return window.alert(error.message);

            clearCategoryForm(categoryId);
            // 关闭编辑表单
            form.style.display = 'none';
            const editBtn = document.querySelector(`.category-edit-btn[data-category-id="${categoryId}"]`);
            if (editBtn) editBtn.textContent = '编辑';
            await loadCategoryLinks(categoryId);
        });

        // 取消编辑
        document.addEventListener('click', (event) => {
            const cancelBtn = event.target.closest('.cat-cancel-btn');
            if (!cancelBtn) return;

            const form = cancelBtn.closest('.category-admin-form');
            if (!form) return;

            const categoryId = form.dataset.categoryId;
            clearCategoryForm(categoryId);
            form.style.display = 'none';
            const editBtn = document.querySelector(`.category-edit-btn[data-category-id="${categoryId}"]`);
            if (editBtn) editBtn.textContent = '编辑';
        });

        // 删除链接
        document.addEventListener('click', async (event) => {
            const deleteBtn = event.target.closest('[data-cat-delete]');
            if (!deleteBtn || !window.hasAdminAccess()) return;

            if (!await window.requestDeleteConfirmation('确定要删除这条链接吗？')) return;

            const { error } = await supabaseClient.rpc('admin_delete_category_link', {
                p_access_token: window.getAccessToken(),
                p_id: Number(deleteBtn.dataset.catDelete)
            });

            if (error) return window.alert(error.message);
            await loadCategoryLinks(deleteBtn.dataset.catCategory);
        });

        document.addEventListener('accessGranted', loadAllCategoryLinks);
        loadAllCategoryLinks();
    })();

    // 留言板逻辑：校验、提交、转义并渲染 Supabase 云端留言
    (function() {
        const form = document.getElementById('messageForm');
        const list = document.getElementById('messageList');
        const supabaseClient = window.supabaseClient;
        const MAX_CONTENT_LENGTH = 600;

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function loadMessages() {
            if (!supabaseClient) return [];

            const { data, error } = await supabaseClient
                .from('messages')
                .select('id, name, contact, content, image_url, link_url, created_at')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Failed to load Supabase messages:', error);
                list.innerHTML = '<div class="message-status">留言服务暂时不可用，请稍后再试喵~</div>';
                return [];
            }

            return data || [];
        }

        function showMessageNotice(message) {
            window.alert(message);
        }

        function setupExpandableMessages() {
            list.querySelectorAll('.message-item').forEach((item) => {
                const content = item.querySelector('.msg-content');
                const toggle = item.querySelector('.msg-expand');
                if (!content || !toggle) return;
                if (item.dataset.expandReady === 'true') return;
                if (content.offsetParent === null) return;

                const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
                const isMultiLine = content.scrollHeight > lineHeight * 1.25;
                if (!isMultiLine) {
                    toggle.remove();
                    return;
                }

                item.classList.add('has-expand');
                content.classList.add('is-collapsed');
                item.dataset.expandReady = 'true';
                toggle.addEventListener('click', () => {
                    const expanded = content.classList.toggle('is-expanded');
                    content.classList.toggle('is-collapsed', !expanded);
                    toggle.textContent = expanded ? '⌃' : '⌄';
                    toggle.setAttribute('aria-label', expanded ? '收起留言' : '展开留言');
                });
            });
        }

        document.addEventListener('messageTabVisible', setupExpandableMessages);

        async function renderMessages() {
            const messages = await loadMessages();
            if (messages.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary);">还没有留言呢~ 快来写第一条吧喵 (ฅ´ωฅ)</div>';
                return;
            }

            list.innerHTML = messages.slice().reverse().map((message) => `
                <div class="message-item">
                    <span class="msg-author">${escapeHtml(message.name)}</span>
                    <span class="msg-time">${message.time}</span>
                    ${message.contact ? `<div class="msg-contact">联系方式：${escapeHtml(message.contact)}</div>` : ''}
                    <div class="msg-content">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
                    ${message.image_url ? `<img class="msg-image" src="${escapeHtml(message.image_url)}" alt="留言图片" loading="lazy">` : ''}
                    ${message.link_url ? `<a class="msg-link" href="${escapeHtml(message.link_url)}" target="_blank" rel="noopener noreferrer">🔗 打开留言链接</a>` : ''}
                    <div class="message-admin-actions admin-only">
                        <button class="recommendation-admin-action" type="button" data-message-delete="${message.id}">删除留言</button>
                    </div>
                    <button class="msg-expand" type="button" aria-label="展开留言">⌄</button>
                </div>
            `).join('');
            setupExpandableMessages();
        }

        document.addEventListener('accessGranted', renderMessages);

        document.addEventListener('click', async (event) => {
            const deleteButton = event.target.closest('[data-message-delete]');
            if (!deleteButton || !window.hasAdminAccess()) return;
            if (!await window.requestDeleteConfirmation('确定要删除这条留言吗？')) return;
            deleteButton.disabled = true;
            const { error } = await supabaseClient.rpc('admin_delete_message', {
                p_access_token: window.getAccessToken(),
                p_id: Number(deleteButton.dataset.messageDelete)
            });
            if (error) window.alert(error.message);
            await renderMessages();
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const name = document.getElementById('msgName').value.trim();
            const contact = document.getElementById('msgContact').value.trim();
            const content = document.getElementById('msgContent').value.trim();
            const imageInput = document.getElementById('msgImage');
            const link = document.getElementById('msgLink').value.trim();
            const uploadStatus = document.getElementById('uploadStatus');
            if (!name || !content) return;

            if (Array.from(content).length > MAX_CONTENT_LENGTH) {
                showMessageNotice('留言不能超过 600 个字符喵~');
                return;
            }

            if (!supabaseClient) {
                showMessageNotice('留言服务尚未配置完成喵~');
                return;
            }

            if (link && !/^https?:\/\//i.test(link)) {
                showMessageNotice('留言超链接必须以 http:// 或 https:// 开头喵~');
                return;
            }

            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.disabled = true;

            let imageUrl = '';
            const imageFile = imageInput.files[0];
            if (imageFile) {
                if (imageFile.size > 5 * 1024 * 1024) {
                    submitButton.disabled = false;
                    showMessageNotice('图片不能超过 5MB 喵~');
                    return;
                }
                uploadStatus.textContent = '图片上传中喵~';
                const extension = imageFile.name.split('.').pop().toLowerCase();
                const path = `guest/${crypto.randomUUID()}.${extension}`;
                const upload = await supabaseClient.storage.from('message-images').upload(path, imageFile, { upsert: false });
                if (upload.error) {
                    submitButton.disabled = false;
                    uploadStatus.textContent = '';
                    showMessageNotice(upload.error.message || '图片上传失败，请稍后再试喵~');
                    return;
                }
                imageUrl = supabaseClient.storage.from('message-images').getPublicUrl(path).data.publicUrl;
            }

            const { error } = await supabaseClient.rpc('submit_message', {
                p_name: name,
                p_contact: contact,
                p_content: content,
                p_image_url: imageUrl,
                p_link_url: link
            });

            submitButton.disabled = false;
            if (error) {
                if (error.code === 'PGRST202') {
                    showMessageNotice('留言功能还没有完成 Supabase 配置，请在 SQL Editor 运行 supabase-schema.sql 后再试喵~');
                    return;
                }
                showMessageNotice(error.message || '留言发送失败，请稍后再试喵~');
                return;
            }

            await renderMessages();
            form.reset();
            uploadStatus.textContent = '';
            list.scrollTop = list.scrollHeight;
        });

        renderMessages();
    })();
});
