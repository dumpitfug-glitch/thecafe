// script.js
let currentBoard = '';
let currentThread = '';
let hasUnsavedChanges = false;
let markedPosts = new Set();

function formatText(text) {
    if (!text) return '';
    
    // Обработка цитат >>5278 для создания кликабельных ссылок
    const quoteRegex = />>(\d{4,})/g;
    const formattedText = text.replace(quoteRegex, '<span class="quote-link" data-post-id="$1" onclick="handleQuoteClick(event, \'$1\')">>>$1</span>');
    
    return formattedText.replace(/\n/g, '<br>');
}

function generatePostNumber(postId) {
    return postId.slice(-4);
}

// Обработка кнопок "Вперед" / "Назад" в браузере
window.addEventListener('popstate', (event) => {
    if (window.location.hash) {
        return;
    }
    if (!hasUnsavedChanges || confirm('У вас есть несохраненные изменения. Продолжить?')) {
        handleUrlRouting();
    }
});

// Парсинг URL и переключение экрана
function handleUrlRouting() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    if (parts.length === 0 || path === '/index.html') {
        showBoardList(false);
    } else if (parts.length === 1) {
        if (parts[0] !== 'style.css' && parts[0] !== 'script.js') {
            loadThreads(parts[0], false);
        }
    } else if (parts.length >= 2) {
        currentBoard = parts[0];
        loadThread(parts[1], false);
    }
}

// Загрузка разделов при запуске
document.addEventListener('DOMContentLoaded', async () => {
    await loadBoards();
    await loadBoardsStats();
    handleUrlRouting();
    
    // Навигация
    document.getElementById('back-to-boards').addEventListener('click', () => {
        if (checkUnsavedChanges()) {
            showBoardList();
        }
    });
    document.getElementById('back-to-threads').addEventListener('click', () => {
        if (checkUnsavedChanges()) {
            showThreadsList();
        }
    });
    document.getElementById('create-thread-btn').addEventListener('click', showCreateThreadModal);
    
    // Формы
    document.getElementById('create-thread-form').addEventListener('submit', createThread);
    document.getElementById('reply-form').addEventListener('submit', replyToThread);
    
    // Отслеживание изменений в формах
    document.getElementById('create-thread-form').addEventListener('input', () => {
        hasUnsavedChanges = true;
    });
    document.getElementById('reply-form').addEventListener('input', () => {
        hasUnsavedChanges = true;
    });
    
    // Модальные окна
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.add('hidden');
            });
            hasUnsavedChanges = false;
        });
    });

    // Закрытие модального окна медиа при клике вне контента
    document.getElementById('media-modal').addEventListener('click', (e) => {
        if (e.target.id === 'media-modal') {
            e.target.classList.add('hidden');
        }
    });
    
    // Обработка загрузки медиа
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', handleMediaUpload);
    });

    // Добавляем кнопки очистки отметок в формы
    addClearMarkedButtons();
});

// Функция для поиска полного ID поста по короткому номеру
async function findPostByShortNumber(shortNumber) {
    try {
        // Получаем все треды текущего раздела
        const response = await fetch(`/api/threads/${currentBoard}`);
        if (!response.ok) return null;
        
        const threads = await response.json();
        
        // Ищем пост по короткому номеру (последние 4 цифры)
        for (const thread of threads) {
            // Проверяем OP-пост
            if (generatePostNumber(thread.id) === shortNumber) {
                return {
                    post_id: thread.id,
                    thread_id: thread.id,
                    board: thread.board,
                    is_op: true,
                    comment: thread.comment
                };
            }
            
            // Проверяем ответы в треде
            for (const post of thread.posts) {
                if (generatePostNumber(post.id) === shortNumber) {
                    return {
                        post_id: post.id,
                        thread_id: thread.id,
                        board: thread.board,
                        is_op: false,
                        comment: post.comment
                    };
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Ошибка поиска поста:', error);
        return null;
    }
}

// Обработка клика по цитате >>5278
async function handleQuoteClick(event, postNumber) {
    event.preventDefault();
    event.stopPropagation();
    
    const activeTextarea = document.querySelector('#create-thread-form textarea, #reply-form textarea');
    
    // Если есть активное поле ввода, добавляем цитату в текст
    if (activeTextarea && document.activeElement === activeTextarea) {
        const quoteText = `>>${postNumber} `;
        const start = activeTextarea.selectionStart;
        const end = activeTextarea.selectionEnd;
        const text = activeTextarea.value;
        
        activeTextarea.value = text.substring(0, start) + quoteText + text.substring(end);
        activeTextarea.selectionStart = activeTextarea.selectionEnd = start + quoteText.length;
        activeTextarea.focus();
        
        hasUnsavedChanges = true;
        return;
    }
    
    // Иначе ищем пост для навигации
    try {
        // Ищем пост по короткому номеру
        const postInfo = await findPostByShortNumber(postNumber);
        
        if (postInfo) {
            // Проверяем, находится ли пост в текущем разделе
            if (postInfo.board === currentBoard) {
                // Загружаем тред и прокручиваем к посту
                await loadThread(postInfo.thread_id);
                
                // Даем время на загрузку треда, затем прокручиваем к посту
                setTimeout(() => {
                    const postElement = document.querySelector(`[data-post-id="${postInfo.post_id}"]`);
                    if (postElement) {
                        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Визуальное выделение поста
                        postElement.classList.add('highlighted');
                        setTimeout(() => {
                            postElement.classList.remove('highlighted');
                        }, 2000);
                    }
                }, 500);
            } else {
                alert(`Пост находится в разделе /${postInfo.board}/, а вы в разделе /${currentBoard}/`);
            }
        } else {
            alert('Пост не найден в текущем разделе');
        }
    } catch (error) {
        console.error('Ошибка поиска поста:', error);
        alert('Ошибка поиска поста');
    }
}

// Добавление кнопок очистки отметок
function addClearMarkedButtons() {
    // Добавляем кнопку очистки в форму создания треда
    const createThreadForm = document.getElementById('create-thread-form');
    const clearMarkedBtn1 = document.createElement('button');
    clearMarkedBtn1.type = 'button';
    clearMarkedBtn1.textContent = 'Очистить отметки';
    clearMarkedBtn1.className = 'clear-marked-btn';
    clearMarkedBtn1.addEventListener('click', clearMarkedPosts);
    createThreadForm.insertBefore(clearMarkedBtn1, createThreadForm.querySelector('button[type="submit"]'));
    
    // Добавляем кнопку очистки в форму ответа
    const replyForm = document.getElementById('reply-form');
    const clearMarkedBtn2 = document.createElement('button');
    clearMarkedBtn2.type = 'button';
    clearMarkedBtn2.textContent = 'Очистить отметки';
    clearMarkedBtn2.className = 'clear-marked-btn';
    clearMarkedBtn2.addEventListener('click', clearMarkedPosts);
    replyForm.insertBefore(clearMarkedBtn2, replyForm.querySelector('button[type="submit"]'));
}

// Загрузка статистики разделов
async function loadBoardsStats() {
    try {
        const response = await fetch('/api/boards/stats');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const stats = await response.json();
        
        const tbody = document.getElementById('boards-stats-body');
        
        if (!tbody) {
            console.error('Элемент boards-stats-body не найден');
            return;
        }
        
        tbody.innerHTML = '';
        
        if (Array.isArray(stats)) {
            stats.forEach(board => {
                const row = document.createElement('tr');
                row.className = 'stats-row';
                row.innerHTML = `
                    <td>/${board.id}/</td>
                    <td>${board.name}</td>
                    <td>${board.thread_count}</td>
                `;
                row.addEventListener('click', () => {
                    if (checkUnsavedChanges()) {
                        loadThreads(board.id);
                    }
                });
                tbody.appendChild(row);
            });
        } else {
            console.error('Некорректный формат статистики:', stats);
        }
        
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Проверка наличия несохраненных данных
function checkUnsavedChanges() {
    if (hasUnsavedChanges) {
        return confirm('У вас есть несохраненные изменения. Продолжить?');
    }
    return true;
}

// Сброс флага несохраненных данных
function resetUnsavedChanges() {
    hasUnsavedChanges = false;
}

// Загрузка разделов
async function loadBoards() {
    try {
        const response = await fetch('/api/boards');
        const boards = await response.json();
        
        const nav = document.getElementById('board-nav');
        const container = document.getElementById('boards-container');
        
        nav.innerHTML = '';
        container.innerHTML = '';
        
        boards.forEach(board => {
            // Навигация
            const navBtn = document.createElement('button');
            navBtn.className = 'board-btn';
            navBtn.textContent = `/${board.id}/ - ${board.name}`;
            navBtn.addEventListener('click', () => {
                if (checkUnsavedChanges()) {
                    loadThreads(board.id);
                }
            });
            nav.appendChild(navBtn);
            
            // Карточка раздела
            const card = document.createElement('div');
            card.className = 'board-card';
            card.innerHTML = `
                <h3>/${board.id}/</h3>
                <p>${board.name}</p>
            `;
            card.addEventListener('click', () => {
                if (checkUnsavedChanges()) {
                    loadThreads(board.id);
                }
            });
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки разделов:', error);
    }
}

// Загрузка тредов раздела
async function loadThreads(boardId, pushState = true) {
    try {
        const response = await fetch(`/api/threads/${boardId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const threads = await response.json();
        
        currentBoard = boardId;
        
        if (pushState && window.location.pathname !== `/${boardId}`) {
            window.history.pushState(null, '', `/${boardId}`);
        }
        
        document.getElementById('board-title').textContent = `/${boardId}/ - ${getBoardName(boardId)}`;
        document.getElementById('board-list').classList.add('hidden');
        document.getElementById('threads-list').classList.remove('hidden');
        document.getElementById('thread-view').classList.add('hidden');
        
        const container = document.getElementById('threads-container');
        container.innerHTML = '';
        
        if (threads.length === 0) {
            container.innerHTML = '<p>В этом разделе пока нет тредов</p>';
            return;
        }
        
        threads.forEach(thread => {
            const threadCard = document.createElement('div');
            threadCard.className = 'thread-card';
            threadCard.innerHTML = `
                <div class="thread-subject">${thread.subject || 'Без темы'}</div>
                <div class="thread-id">ID треда: ${generatePostNumber(thread.id)}</div>
                <div class="thread-comment">${formatText(thread.comment)}</div>
                ${renderMedia(thread.media)}
                <div class="thread-info">Ответов: ${thread.posts.length}</div>
            `;
            
            threadCard.addEventListener('click', (e) => {
                if (!e.target.closest('.media-thumbnails') && !e.target.closest('.quote-link')) {
                    loadThread(thread.id);
                }
            });
            
            container.appendChild(threadCard);
        });
        
        resetUnsavedChanges();
    } catch (error) {
        console.error('Ошибка загрузки тредов:', error);
        alert('Ошибка загрузки тредов. Возможно, в разделе нет тредов.');
    }
}

// Загрузка конкретного треда
async function loadThread(threadId, pushState = true) {
    try {
        const response = await fetch(`/api/thread/${threadId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const thread = await response.json();
        
        currentThread = threadId;
        
        if (pushState && window.location.pathname !== `/${currentBoard}/${threadId}`) {
            window.history.pushState(null, '', `/${currentBoard}/${threadId}`);
        }
        
        document.getElementById('threads-list').classList.add('hidden');
        document.getElementById('thread-view').classList.remove('hidden');
        
        const container = document.getElementById('thread-container');
        container.innerHTML = '';
        
        // ОП-пост
        const opPost = document.createElement('div');
        opPost.className = 'post op-post';
        opPost.setAttribute('data-post-id', thread.id);
        const opNumber = generatePostNumber(thread.id);
        opPost.innerHTML = `
            <div class="post-header">
                <span class="post-number ${markedPosts.has(thread.id) ? 'marked' : ''}" 
                      onclick="markPost('${thread.id}', this)">№${opNumber}</span>
                Аноним ${new Date(thread.createdAt).toLocaleString()}
            </div>
            ${thread.subject ? `<div class="post-subject">${thread.subject}</div>` : ''}
            <div class="post-comment">${formatText(thread.comment)}</div>
            ${renderMedia(thread.media)}
        `;
        container.appendChild(opPost);

        // Ответы
        thread.posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.setAttribute('data-post-id', post.id);
            const postNumber = generatePostNumber(post.id);
            postElement.innerHTML = `
                <div class="post-header">
                    <span class="post-number ${markedPosts.has(post.id) ? 'marked' : ''}" 
                          onclick="markPost('${post.id}', this)">№${postNumber}</span>
                    Аноним ${new Date(post.createdAt).toLocaleString()}
                </div>
                <div class="post-comment">${formatText(post.comment)}</div>
                ${renderMedia(post.media)}
            `;
            container.appendChild(postElement);
        });
        
        resetUnsavedChanges();
    } catch (error) {
        console.error('Ошибка загрузки треда:', error);
        alert('Ошибка загрузки треда');
    }
}

// Функция отметки поста
async function markPost(postId, element) {
    try {
        // Проверяем существование поста
        const response = await fetch(`/api/posts/${postId}`);
        const postInfo = await response.json();
        
        if (!postInfo.exists) {
            alert('Пост не найден');
            return;
        }
        
        // Переключаем отметку
        if (markedPosts.has(postId)) {
            markedPosts.delete(postId);
            element.classList.remove('marked');
        } else {
            markedPosts.add(postId);
            element.classList.add('marked');
        }
        
        // Обновляем поле ввода в активной форме
        updateMarkedPostsInForm();
        
    } catch (error) {
        console.error('Ошибка отметки поста:', error);
    }
}

// Обновление поля ввода с отмеченными постами
function updateMarkedPostsInForm() {
    if (markedPosts.size === 0) return;
    
    const markedText = Array.from(markedPosts)
        .map(postId => `>>${generatePostNumber(postId)}`)
        .join(' ') + ' ';
    
    // Обновляем активное текстовое поле
    const activeTextarea = document.querySelector('#create-thread-form textarea, #reply-form textarea');
    if (activeTextarea) {
        const currentValue = activeTextarea.value;
        // Добавляем отмеченные посты в начало, если их еще нет
        if (!currentValue.includes(markedText.trim())) {
            activeTextarea.value = markedText + currentValue;
            hasUnsavedChanges = true;
        }
    }
}

// Функция для очистки всех отметок
function clearMarkedPosts() {
    markedPosts.clear();
    document.querySelectorAll('.post-number').forEach(element => {
        element.classList.remove('marked');
    });
    
    // Обновляем поле ввода
    const activeTextarea = document.querySelector('#create-thread-form textarea, #reply-form textarea');
    if (activeTextarea) {
        let text = activeTextarea.value;
        // Удаляем все цитаты отмеченных постов
        Array.from(markedPosts).forEach(postId => {
            const quote = `>>${generatePostNumber(postId)}`;
            text = text.replace(new RegExp(quote + '\\s?', 'g'), '');
        });
        activeTextarea.value = text.trim();
        hasUnsavedChanges = true;
    }
}

// Создание треда
async function createThread(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Проверяем, что есть хотя бы текст или файлы
    const comment = formData.get('comment') || '';
    const hasFiles = form.querySelector('input[type="file"]').files.length > 0;
    
    if (!comment.trim() && !hasFiles) {
        alert('Требуется текст сообщения или медиафайлы');
        return;
    }
    
    try {
        const response = await fetch(`/api/threads/${currentBoard}`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('create-thread-modal').classList.add('hidden');
            form.reset();
            document.querySelectorAll('.media-preview').forEach(preview => {
                preview.innerHTML = '';
            });
            resetUnsavedChanges();
            loadThreads(currentBoard);
        } else {
            alert(result.error || 'Ошибка создания треда');
        }
    } catch (error) {
        console.error('Ошибка создания треда:', error);
        alert('Ошибка создания треда');
    }
}

// Ответ в тред
async function replyToThread(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Проверяем, что есть хотя бы текст или файлы
    const comment = formData.get('comment') || '';
    const hasFiles = form.querySelector('input[type="file"]').files.length > 0;
    
    if (!comment.trim() && !hasFiles) {
        alert('Требуется текст сообщения или медиафайлы');
        return;
    }
    
    try {
        const response = await fetch(`/api/thread/${currentThread}/reply`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            form.reset();
            document.querySelectorAll('.media-preview').forEach(preview => {
                preview.innerHTML = '';
            });
            resetUnsavedChanges();
            loadThread(currentThread);
        } else {
            alert(result.error || 'Ошибка отправки ответа');
        }
    } catch (error) {
        console.error('Ошибка отправки ответа:', error);
        alert('Ошибка отправки ответа');
    }
}

// Обработка загрузки медиа
function handleMediaUpload(e) {
    const files = Array.from(e.target.files).slice(0, 4);
    const previewContainer = e.target.parentElement.querySelector('.media-preview');
    
    previewContainer.innerHTML = '';
    
    files.forEach(file => {
        const reader = new FileReader();
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-media';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
            previewItem.remove();
            updateFileInput(e.target, files.filter(f => f !== file));
            hasUnsavedChanges = true;
        });
        
        if (file.type.startsWith('image/')) {
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                previewItem.appendChild(img);
                previewItem.appendChild(removeBtn);
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            reader.onload = (e) => {
                const videoContainer = document.createElement('div');
                videoContainer.className = 'video-thumb-container';
                
                const video = document.createElement('video');
                video.src = e.target.result;
                video.className = 'video-preview';
                
                const playOverlay = document.createElement('div');
                playOverlay.className = 'video-play-overlay';
                playOverlay.textContent = '▶';
                
                videoContainer.appendChild(video);
                videoContainer.appendChild(playOverlay);
                videoContainer.appendChild(removeBtn);
                previewContainer.appendChild(videoContainer);
            };
            reader.readAsDataURL(file);
        }
    });
    
    updateFileInput(e.target, files);
    hasUnsavedChanges = true;
}

// Обновление input файлов после удаления превью
function updateFileInput(input, files) {
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
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
                        <div class="video-thumb-container" onclick="event.stopPropagation(); openMediaModal('/media/${file}', 'video')">
                            <video class="media-thumb video-preview">
                                <source src="/media/${file}" type="video/${ext}">
                            </video>
                            <div class="video-play-overlay">▶</div>
                        </div>
                    `;
                } else {
                    return `<img class="media-thumb" src="/media/${file}" onclick="event.stopPropagation(); openMediaModal('/media/${file}', 'image')">`;
                }
            }).join('')}
        </div>
    `;
}

// Открытие медиа в модальном окне
function openMediaModal(src, type) {
    const modal = document.getElementById('media-modal');
    const mediaContainer = modal.querySelector('.modal-content');
    
    // Сохраняем кнопку закрытия
    const closeBtn = mediaContainer.querySelector('.close');
    
    if (type === 'video') {
        mediaContainer.innerHTML = `
            ${closeBtn.outerHTML}
            <video controls autoplay style="max-width: 100%; max-height: 80vh;">
                <source src="${src}" type="video/${src.split('.').pop().toLowerCase()}">
                Ваш браузер не поддерживает видео.
            </video>
        `;
    } else {
        mediaContainer.innerHTML = `
            ${closeBtn.outerHTML}
            <img src="${src}" alt="" style="max-width: 100%; max-height: 80vh;">
        `;
    }
    
    // Добавляем обработчик закрытия
    modal.querySelector('.close').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    modal.classList.remove('hidden');
}

// Получение имени раздела по ID
function getBoardName(boardId) {
    const boards = Array.from(document.querySelectorAll('.board-btn'));
    const boardBtn = boards.find(btn => btn.textContent.includes(`/${boardId}/`));
    return boardBtn ? boardBtn.textContent.split(' - ')[1] : boardId;
}

// Навигация
function showBoardList(pushState = true) {
    document.getElementById('threads-list').classList.add('hidden');
    document.getElementById('thread-view').classList.add('hidden');
    document.getElementById('board-list').classList.remove('hidden');
    resetUnsavedChanges();
    
    if (pushState && window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
    }
}

function showThreadsList() {
    document.getElementById('thread-view').classList.add('hidden');
    document.getElementById('threads-list').classList.remove('hidden');
    resetUnsavedChanges();
}

function showCreateThreadModal() {
    document.getElementById('create-thread-modal').classList.remove('hidden');
}
