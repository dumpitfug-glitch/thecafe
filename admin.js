// admin.js
let allThreads = [];
let currentAction = { type: '', threadId: '', postId: '' };

// Загрузка при старте
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadAllThreads();
});

// Переключение секций
function showSection(sectionName) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById('stats-section').classList.add('hidden');
    document.getElementById('threads-section').classList.add('hidden');
    
    event.target.classList.add('active');
    
    if (sectionName === 'stats') {
        document.getElementById('stats-section').classList.remove('hidden');
        loadStats();
    } else if (sectionName === 'threads') {
        document.getElementById('threads-section').classList.remove('hidden');
        loadAllThreads();
    }
}

// Загрузка статистики
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();
        
        const container = document.getElementById('stats-container');
        container.innerHTML = '';
        
        const statsData = [
            { number: stats.total_threads, label: 'Всего тредов' },
            { number: stats.total_posts, label: 'Всего постов' },
            { number: stats.total_files, label: 'Всего файлов' }
        ];
        
        statsData.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <div class="stat-number">${stat.number}</div>
                <div class="stat-label">${stat.label}</div>
            `;
            container.appendChild(card);
        });
        
        // Добавляем статистику по разделам
        if (stats.threads_by_board) {
            Object.entries(stats.threads_by_board).forEach(([board, count]) => {
                const card = document.createElement('div');
                card.className = 'stat-card';
                card.innerHTML = `
                    <div class="stat-number">${count}</div>
                    <div class="stat-label">Тредов в /${board}/</div>
                `;
                container.appendChild(card);
            });
        }
        
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        alert('Ошибка загрузки статистики');
    }
}

// Загрузка всех тредов
async function loadAllThreads() {
    try {
        const response = await fetch('/api/admin/threads');
        allThreads = await response.json();
        displayThreads(allThreads);
    } catch (error) {
        console.error('Ошибка загрузки тредов:', error);
        alert('Ошибка загрузки тредов');
    }
}

// Отображение тредов в таблице
function displayThreads(threads) {
    const tbody = document.getElementById('threads-table-body');
    tbody.innerHTML = '';
    
    if (threads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Треды не найдены</td></tr>';
        return;
    }
    
    threads.forEach(thread => {
        const row = document.createElement('tr');
        row.className = 'thread-row';
        
        // Обрезаем длинный текст темы
        const subject = thread.subject ? 
            (thread.subject.length > 50 ? thread.subject.substring(0, 50) + '...' : thread.subject) : 
            'Без темы';
        
        // Обрезаем комментарий для preview
        const commentPreview = thread.comment ? 
            (thread.comment.length > 100 ? thread.comment.substring(0, 100) + '...' : thread.comment) : 
            'Нет текста';
        
        row.innerHTML = `
            <td title="${thread.id}">${thread.id.slice(-8)}...</td>
            <td><span class="board-badge">/${thread.board}/</span></td>
            <td title="${thread.subject || ''}">
                <div><strong>${subject}</strong></div>
                <div style="color: #aaa; font-size: 0.8rem;">${commentPreview}</div>
            </td>
            <td>${thread.post_count}</td>
            <td>${thread.file_count}</td>
            <td>${thread.created_date}</td>
            <td>
                <button class="action-btn view" onclick="viewThread('${thread.id}')">Просмотр</button>
                <button class="action-btn clean" onclick="confirmCleanMedia('${thread.id}')">Очистить медиа</button>
                <button class="action-btn delete" onclick="confirmDeleteThread('${thread.id}')">Удалить тред</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Поиск тредов
function searchThreads() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    
    if (!query) {
        displayThreads(allThreads);
        return;
    }
    
    const filteredThreads = allThreads.filter(thread => {
        return thread.id.toLowerCase().includes(query) ||
               thread.board.toLowerCase().includes(query) ||
               (thread.subject && thread.subject.toLowerCase().includes(query)) ||
               (thread.comment && thread.comment.toLowerCase().includes(query));
    });
    
    displayThreads(filteredThreads);
}

// Просмотр треда
async function viewThread(threadId) {
    try {
        const response = await fetch(`/api/admin/thread/${threadId}`);
        const thread = await response.json();
        
        const modalContent = document.getElementById('thread-modal-content');
        modalContent.innerHTML = `
            <h2>Тред /${thread.board}/ - ${thread.subject || 'Без темы'}</h2>
            <p><strong>ID:</strong> ${thread.id}</p>
            <p><strong>Создан:</strong> ${new Date(thread.createdAt).toLocaleString()}</p>
            <p><strong>Всего постов:</strong> ${thread.total_posts}</p>
            <p><strong>Всего файлов:</strong> ${thread.total_files}</p>
            
            <h3 style="margin-top: 1rem;">Посты:</h3>
            <div id="thread-posts-container">
                ${renderThreadPosts(thread)}
            </div>
        `;
        
        document.getElementById('thread-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Ошибка загрузки треда:', error);
        alert('Ошибка загрузки треда');
    }
}

// Рендер постов треда
function renderThreadPosts(thread) {
    let html = '';
    
    // OP-пост
    html += `
        <div class="post op">
            <div class="post-header">
                OP-пост #${thread.id.slice(-4)} • ${new Date(thread.createdAt).toLocaleString()}
                <button class="action-btn delete" style="float: right;" 
                        onclick="confirmDeletePost('${thread.id}', '${thread.id}')">
                    Удалить пост
                </button>
            </div>
            <div class="post-comment">${formatText(thread.comment)}</div>
            ${renderMedia(thread.media)}
        </div>
    `;
    
    // Ответы
    thread.posts.forEach(post => {
        html += `
            <div class="post">
                <div class="post-header">
                    Ответ #${post.id.slice(-4)} • ${new Date(post.createdAt).toLocaleString()}
                    <button class="action-btn delete" style="float: right;" 
                            onclick="confirmDeletePost('${thread.id}', '${post.id}')">
                        Удалить пост
                    </button>
                </div>
                <div class="post-comment">${formatText(post.comment)}</div>
                ${renderMedia(post.media)}
            </div>
        `;
    });
    
    return html;
}

// Форматирование текста
function formatText(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
}

// Рендер медиафайлов
function renderMedia(mediaFiles) {
    if (!mediaFiles || mediaFiles.length === 0) return '';
    
    return `
        <div class="media-thumbnails">
            ${mediaFiles.map(file => {
                const ext = file.split('.').pop().toLowerCase();
                const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
                
                if (isVideo) {
                    return `
                        <div class="video-thumb-container">
                            <video class="media-thumb" controls>
                                <source src="/media/${file}" type="video/${ext}">
                            </video>
                        </div>
                    `;
                } else {
                    return `<img class="media-thumb" src="/media/${file}" alt="">`;
                }
            }).join('')}
        </div>
    `;
}

// Подтверждение удаления треда
function confirmDeleteThread(threadId) {
    currentAction = { type: 'thread', threadId: threadId };
    
    document.getElementById('confirm-title').textContent = 'Подтверждение удаления треда';
    document.getElementById('confirm-message').textContent = 
        `Вы уверены, что хотите полностью удалить тред ${threadId}? Это действие нельзя отменить.`;
    
    document.getElementById('confirm-modal').classList.remove('hidden');
}

// Подтверждение удаления поста
function confirmDeletePost(threadId, postId) {
    currentAction = { type: 'post', threadId: threadId, postId: postId };
    
    const isOpPost = threadId === postId;
    const postType = isOpPost ? 'OP-пост' : 'ответ';
    
    document.getElementById('confirm-title').textContent = 'Подтверждение удаления поста';
    document.getElementById('confirm-message').textContent = 
        `Вы уверены, что хотите удалить ${postType} ${postId.slice(-4)}?`;
    
    document.getElementById('confirm-modal').classList.remove('hidden');
}

// Подтверждение очистки медиа
function confirmCleanMedia(threadId) {
    currentAction = { type: 'clean', threadId: threadId };
    
    document.getElementById('confirm-title').textContent = 'Очистка медиафайлов';
    document.getElementById('confirm-message').textContent = 
        `Вы уверены, что хотите удалить все медиафайлы из треда ${threadId}? Текст постов останется.`;
    
    document.getElementById('confirm-modal').classList.remove('hidden');
}

// Выполнение действия после подтверждения
async function executeAction() {
    const { type, threadId, postId } = currentAction;
    
    try {
        let response;
        
        if (type === 'thread') {
            response = await fetch(`/api/admin/thread/${threadId}`, { method: 'DELETE' });
        } else if (type === 'post') {
            response = await fetch(`/api/admin/thread/${threadId}/post/${postId}`, { method: 'DELETE' });
        } else if (type === 'clean') {
            response = await fetch(`/api/admin/thread/${threadId}/clean`, { method: 'POST' });
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert(result.message);
            closeModal('confirm-modal');
            
            // Обновляем данные
            if (type === 'thread') {
                loadAllThreads();
                loadStats();
            } else if (type === 'post') {
                // Если мы в модальном окне просмотра, обновляем его
                if (!document.getElementById('thread-modal').classList.contains('hidden')) {
                    viewThread(threadId);
                }
                loadAllThreads();
                loadStats();
            } else if (type === 'clean') {
                loadAllThreads();
                loadStats();
            }
        } else {
            alert(result.error || 'Ошибка выполнения действия');
        }
    } catch (error) {
        console.error('Ошибка выполнения действия:', error);
        alert('Ошибка выполнения действия');
    }
}

// Закрытие модального окна
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Назначаем обработчик для кнопки подтверждения
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('confirm-button').addEventListener('click', executeAction);
});