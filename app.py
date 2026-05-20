# app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# Конфигурация
UPLOAD_FOLDER = 'database/media'
THREADS_FOLDER = 'database/threads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'ogg'}
MAX_FILE_COUNT = 4

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['THREADS_FOLDER'] = THREADS_FOLDER

# Создаем папки если их нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(THREADS_FOLDER, exist_ok=True)

# Разделы
BOARDS = [
    {'id': 'a', 'name': 'Аниме'},
    {'id': 'b', 'name': 'Оффтоп /b/'},
    {'id': 'c', 'name': 'Путешествия'},
    {'id': 'd', 'name': 'Игры'},
    {'id': 'e', 'name': 'Манга'},
    {'id': 'f', 'name': 'Фильмы'},
    {'id': 'g', 'name': 'Технологии'},
    {'id': 'h', 'name': 'Музыка'},
    {'id': 'i', 'name': 'Литература'},
    {'id': 'j', 'name': 'Искусство'},
    {'id': 'k', 'name': 'Наука'},
    {'id': 'l', 'name': 'Политика'},
    {'id': 'm', 'name': 'Спорт'},
    {'id': 'n', 'name': 'Еда'},
    {'id': 'o', 'name': 'Авто'},
    {'id': 'p', 'name': 'Фотография'},
    {'id': 'q', 'name': 'Мемы'},
    {'id': 'r', 'name': 'Рандом'},
    {'id': 's', 'name': 'Программирование'},
    {'id': 't', 'name': 'История'}
]

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_thread(thread_data):
    thread_path = os.path.join(app.config['THREADS_FOLDER'], f"{thread_data['id']}.json")
    with open(thread_path, 'w', encoding='utf-8') as f:
        json.dump(thread_data, f, ensure_ascii=False, indent=2)

def load_thread(thread_id):
    thread_path = os.path.join(app.config['THREADS_FOLDER'], f"{thread_id}.json")
    if os.path.exists(thread_path):
        with open(thread_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def get_board_name(board_id):
    for board in BOARDS:
        if board['id'] == board_id:
            return board['name']
    return 'Неизвестный раздел'

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

@app.route('/api/boards', methods=['GET'])
def get_boards():
    return jsonify(BOARDS)

@app.route('/api/threads/<board>', methods=['POST'])
def create_thread(board):
    try:
        # Проверяем существование раздела
        if not any(b['id'] == board for b in BOARDS):
            return jsonify({'error': 'Раздел не найден'}), 404
        
        subject = request.form.get('subject', '').strip()
        comment = request.form.get('comment', '').strip()
        
    
        if not comment and 'media' not in request.files:
            return jsonify({'error': 'Требуется текст сообщения или медиафайлы'}), 400
        
        # Проверяем, что есть файлы
        has_files = False
        if 'media' in request.files:
            files = request.files.getlist('media')
            for file in files:
                if file and file.filename:
                    has_files = True
                    break
        
        if not comment and not has_files:
            return jsonify({'error': 'Требуется текст сообщения или медиафайлы'}), 400
        
 
        media_files = []
        if 'media' in request.files:
            files = request.files.getlist('media')
            for file in files[:MAX_FILE_COUNT]:
                if file and file.filename and allowed_file(file.filename):
                    filename = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    media_files.append(filename)
        
        thread_id = str(int(datetime.now().timestamp() * 1000))
        
        thread = {
            'id': thread_id,
            'board': board,
            'subject': subject,
            'comment': comment,
            'media': media_files,
            'createdAt': datetime.now().isoformat(),
            'posts': []
        }
        
        save_thread(thread)
        
        return jsonify({'success': True, 'threadId': thread_id})
    
    except Exception as e:
        print(f"Ошибка создания треда: {str(e)}")
        return jsonify({'error': 'Ошибка создания треда'}), 500

@app.route('/api/threads/<board>', methods=['GET'])
def get_threads(board):
    try:
        # Проверяем существование раздела
        if not any(b['id'] == board for b in BOARDS):
            return jsonify({'error': 'Раздел не найден'}), 404
        
        threads = []
        current_time = datetime.now()
        
        for filename in os.listdir(app.config['THREADS_FOLDER']):
            if filename.endswith('.json'):
                try:
                    thread_data = load_thread(filename[:-5])  # Убираем .json
                    if thread_data and thread_data['board'] == board:
                        # Добавляем поле для сортировки
                        thread_created = datetime.fromisoformat(thread_data['createdAt'])
                        
                        # Определяем время последней активности
                        last_activity = thread_created
                        if thread_data['posts']:
                            last_post_time = max(datetime.fromisoformat(post['createdAt']) for post in thread_data['posts'])
                            last_activity = max(last_activity, last_post_time)
                        
                        # Буст для новых тредов (первые 5 минут)
                        boost_multiplier = 1.0
                        time_since_creation = (current_time - thread_created).total_seconds()
                        if time_since_creation < 300:  # 5 минут
                            # Линейное уменьшение буста от 2.0 до 1.0 за 5 минут
                            boost_multiplier = 2.0 - (time_since_creation / 300)
                        
                        # Вес треда = время последней активности * буст-множитель
                        thread_data['_sort_weight'] = last_activity.timestamp() * boost_multiplier
                        
                        threads.append(thread_data)
                except Exception as e:
                    print(f"Ошибка загрузки треда {filename}: {str(e)}")
                    continue
        
        # Сортируем по весу (последняя активность с учетом буста)
        threads.sort(key=lambda x: x['_sort_weight'], reverse=True)
        
        # Удаляем временное поле перед отправкой
        for thread in threads:
            thread.pop('_sort_weight', None)
        
        return jsonify(threads)
    
    except Exception as e:
        print(f"Ошибка чтения тредов: {str(e)}")
        return jsonify({'error': 'Ошибка чтения тредов'}), 500

@app.route('/api/thread/<thread_id>', methods=['GET'])
def get_thread(thread_id):
    try:
        thread_data = load_thread(thread_id)
        if thread_data:
            return jsonify(thread_data)
        else:
            return jsonify({'error': 'Тред не найден'}), 404
    
    except Exception as e:
        print(f"Ошибка чтения треда: {str(e)}")
        return jsonify({'error': 'Ошибка чтения треда'}), 500

@app.route('/api/thread/<thread_id>/reply', methods=['POST'])
def reply_to_thread(thread_id):
    try:
        thread_data = load_thread(thread_id)
        if not thread_data:
            return jsonify({'error': 'Тред не найден'}), 404
        
        comment = request.form.get('comment', '').strip()
        
        # Проверяем, что есть хотя бы текст или файлы
        if not comment and 'media' not in request.files:
            return jsonify({'error': 'Требуется текст сообщения или медиафайлы'}), 400
        
        # Проверяем, что есть файлы
        has_files = False
        if 'media' in request.files:
            files = request.files.getlist('media')
            for file in files:
                if file and file.filename:
                    has_files = True
                    break
        
        if not comment and not has_files:
            return jsonify({'error': 'Требуется текст сообщения или медиафайлы'}), 400
        
        # Обрабатываем загруженные файлы
        media_files = []
        if 'media' in request.files:
            files = request.files.getlist('media')
            for file in files[:MAX_FILE_COUNT]:
                if file and file.filename and allowed_file(file.filename):
                    filename = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    media_files.append(filename)
        
        post = {
            'id': str(int(datetime.now().timestamp() * 1000)),
            'comment': comment,
            'media': media_files,
            'createdAt': datetime.now().isoformat()
        }
        
        thread_data['posts'].append(post)
        save_thread(thread_data)
        
        return jsonify({'success': True})
    
    except Exception as e:
        print(f"Ошибка добавления ответа: {str(e)}")
        return jsonify({'error': 'Ошибка добавления ответа'}), 500

@app.route('/api/boards/stats', methods=['GET'])
def get_boards_stats():
    try:
        stats = []
        
        for board in BOARDS:
            thread_count = 0
            
            for filename in os.listdir(app.config['THREADS_FOLDER']):
                if filename.endswith('.json'):
                    try:
                        thread_data = load_thread(filename[:-5])
                        if thread_data and thread_data['board'] == board['id']:
                            thread_count += 1
                    except Exception as e:
                        print(f"Ошибка загрузки треда {filename} для статистики: {str(e)}")
                        continue
            
            stats.append({
                'id': board['id'],
                'name': board['name'],
                'thread_count': thread_count
            })
        
        return jsonify(stats)
    
    except Exception as e:
        print(f"Ошибка получения статистики: {str(e)}")
        return jsonify({'error': 'Ошибка получения статистики'}), 500

@app.route('/api/posts/<post_id>', methods=['GET'])
def get_post_info(post_id):
    """Получить информацию о посте для цитирования"""
    try:
        # Ищем пост во всех тредах
        for filename in os.listdir(app.config['THREADS_FOLDER']):
            if filename.endswith('.json'):
                try:
                    thread_data = load_thread(filename[:-5])
                    if thread_data:
                        # Проверяем OP-пост
                        if thread_data['id'] == post_id:
                            return jsonify({
                                'exists': True,
                                'id': post_id,
                                'thread_id': thread_data['id'],
                                'board': thread_data['board'],
                                'comment_preview': thread_data['comment'][:100] + '...' if len(thread_data['comment']) > 100 else thread_data['comment']
                            })
                        
                        # Проверяем ответы
                        for post in thread_data['posts']:
                            if post['id'] == post_id:
                                return jsonify({
                                    'exists': True,
                                    'id': post_id,
                                    'thread_id': thread_data['id'],
                                    'board': thread_data['board'],
                                    'comment_preview': post['comment'][:100] + '...' if len(post['comment']) > 100 else post['comment']
                                })
                except Exception as e:
                    print(f"Ошибка загрузки треда {filename} для поиска поста: {str(e)}")
                    continue
        
        return jsonify({'exists': False, 'id': post_id})
    
    except Exception as e:
        print(f"Ошибка поиска поста: {str(e)}")
        return jsonify({'error': 'Ошибка поиска поста'}), 500

@app.route('/api/search/post/<post_id>', methods=['GET'])
def search_post(post_id):
    """Найти пост и вернуть информацию о нем и треде"""
    try:
        # Ищем пост во всех тредах
        for filename in os.listdir(app.config['THREADS_FOLDER']):
            if filename.endswith('.json'):
                try:
                    thread_data = load_thread(filename[:-5])
                    if thread_data:
                        # Проверяем OP-пост
                        if thread_data['id'] == post_id:
                            return jsonify({
                                'found': True,
                                'post_id': post_id,
                                'thread_id': thread_data['id'],
                                'board': thread_data['board'],
                                'is_op': True,
                                'comment': thread_data['comment'],
                                'preview': thread_data['comment'][:100] + '...' if len(thread_data['comment']) > 100 else thread_data['comment']
                            })
                        
                        # Проверяем ответы
                        for post in thread_data['posts']:
                            if post['id'] == post_id:
                                return jsonify({
                                    'found': True,
                                    'post_id': post_id,
                                    'thread_id': thread_data['id'],
                                    'board': thread_data['board'],
                                    'is_op': False,
                                    'comment': post['comment'],
                                    'preview': post['comment'][:100] + '...' if len(post['comment']) > 100 else post['comment']
                                })
                except Exception as e:
                    print(f"Ошибка загрузки треда {filename} для поиска: {str(e)}")
                    continue
        
        return jsonify({'found': False, 'post_id': post_id})
    
    except Exception as e:
        print(f"Ошибка поиска поста: {str(e)}")
        return jsonify({'error': 'Ошибка поиска поста'}), 500

@app.route('/media/<filename>')
def serve_media(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)