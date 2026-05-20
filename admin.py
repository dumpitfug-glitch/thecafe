# admin.py
from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import json
from datetime import datetime

app = Flask(__name__)

# Конфигурация (такая же как в app.py)
THREADS_FOLDER = 'database/threads'
UPLOAD_FOLDER = 'database/media'

app.config['THREADS_FOLDER'] = THREADS_FOLDER
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def load_thread(thread_id):
    """Загружает тред из файла"""
    thread_path = os.path.join(app.config['THREADS_FOLDER'], f"{thread_id}.json")
    if os.path.exists(thread_path):
        with open(thread_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def save_thread(thread_data):
    """Сохраняет тред в файл"""
    thread_path = os.path.join(app.config['THREADS_FOLDER'], f"{thread_data['id']}.json")
    with open(thread_path, 'w', encoding='utf-8') as f:
        json.dump(thread_data, f, ensure_ascii=False, indent=2)

def delete_thread_file(thread_id):
    """Удаляет файл треда"""
    thread_path = os.path.join(app.config['THREADS_FOLDER'], f"{thread_id}.json")
    if os.path.exists(thread_path):
        os.remove(thread_path)
        return True
    return False

def delete_media_files(media_list):
    """Удаляет медиафайлы"""
    for media_file in media_list:
        media_path = os.path.join(app.config['UPLOAD_FOLDER'], media_file)
        if os.path.exists(media_path):
            os.remove(media_path)

@app.route('/')
def admin_index():
    return send_from_directory('.', 'admin.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

@app.route('/api/admin/threads', methods=['GET'])
def get_all_threads():
    """Получает все треды для админки"""
    try:
        threads = []
        
        for filename in os.listdir(app.config['THREADS_FOLDER']):
            if filename.endswith('.json'):
                try:
                    thread_data = load_thread(filename[:-5])  # Убираем .json
                    if thread_data:
                        # Добавляем информацию для админки
                        thread_data['post_count'] = len(thread_data.get('posts', [])) + 1  # +1 для OP-поста
                        thread_data['file_count'] = len(thread_data.get('media', [])) + sum(len(post.get('media', [])) for post in thread_data.get('posts', []))
                        thread_data['created_date'] = datetime.fromisoformat(thread_data['createdAt']).strftime('%Y-%m-%d %H:%M:%S')
                        threads.append(thread_data)
                except Exception as e:
                    print(f"Ошибка загрузки треда {filename}: {str(e)}")
                    continue
        
        # Сортируем по дате создания (новые сверху)
        threads.sort(key=lambda x: x['createdAt'], reverse=True)
        
        return jsonify(threads)
    
    except Exception as e:
        print(f"Ошибка чтения тредов: {str(e)}")
        return jsonify({'error': 'Ошибка чтения тредов'}), 500

@app.route('/api/admin/thread/<thread_id>', methods=['GET'])
def get_thread_admin(thread_id):
    """Получает полную информацию о треде для админки"""
    try:
        thread_data = load_thread(thread_id)
        if thread_data:
            # Добавляем дополнительную информацию
            thread_data['total_posts'] = len(thread_data.get('posts', [])) + 1
            thread_data['total_files'] = len(thread_data.get('media', [])) + sum(len(post.get('media', [])) for post in thread_data.get('posts', []))
            return jsonify(thread_data)
        else:
            return jsonify({'error': 'Тред не найден'}), 404
    
    except Exception as e:
        print(f"Ошибка чтения треда: {str(e)}")
        return jsonify({'error': 'Ошибка чтения треда'}), 500

@app.route('/api/admin/thread/<thread_id>', methods=['DELETE'])
def delete_thread(thread_id):
    """Полностью удаляет тред"""
    try:
        thread_data = load_thread(thread_id)
        if not thread_data:
            return jsonify({'error': 'Тред не найден'}), 404
        
        # Собираем все медиафайлы для удаления
        all_media = thread_data.get('media', [])
        for post in thread_data.get('posts', []):
            all_media.extend(post.get('media', []))
        
        # Удаляем медиафайлы
        delete_media_files(all_media)
        
        # Удаляем файл треда
        if delete_thread_file(thread_id):
            return jsonify({'success': True, 'message': f'Тред {thread_id} удален'})
        else:
            return jsonify({'error': 'Ошибка удаления файла треда'}), 500
    
    except Exception as e:
        print(f"Ошибка удаления треда: {str(e)}")
        return jsonify({'error': 'Ошибка удаления треда'}), 500

@app.route('/api/admin/thread/<thread_id>/post/<post_id>', methods=['DELETE'])
def delete_post(thread_id, post_id):
    """Удаляет пост из треда"""
    try:
        thread_data = load_thread(thread_id)
        if not thread_data:
            return jsonify({'error': 'Тред не найден'}), 404
        
        # Проверяем OP-пост
        if thread_data['id'] == post_id:
            return jsonify({'error': 'Нельзя удалить OP-пост. Удалите весь тред.'}), 400
        
        # Ищем пост в ответах
        post_index = None
        media_to_delete = []
        
        for i, post in enumerate(thread_data.get('posts', [])):
            if post['id'] == post_id:
                post_index = i
                media_to_delete = post.get('media', [])
                break
        
        if post_index is None:
            return jsonify({'error': 'Пост не найден'}), 404
        
        # Удаляем пост из треда
        thread_data['posts'].pop(post_index)
        
        # Сохраняем обновленный тред
        save_thread(thread_data)
        
        # Удаляем медиафайлы поста
        delete_media_files(media_to_delete)
        
        return jsonify({'success': True, 'message': f'Пост {post_id} удален'})
    
    except Exception as e:
        print(f"Ошибка удаления поста: {str(e)}")
        return jsonify({'error': 'Ошибка удаления поста'}), 500

@app.route('/api/admin/thread/<thread_id>/clean', methods=['POST'])
def clean_thread_media(thread_id):
    """Очищает медиафайлы из треда, но оставляет посты"""
    try:
        thread_data = load_thread(thread_id)
        if not thread_data:
            return jsonify({'error': 'Тред не найден'}), 404
        
        # Собираем все медиафайлы для удаления
        all_media = thread_data.get('media', [])
        for post in thread_data.get('posts', []):
            all_media.extend(post.get('media', []))
        
        # Очищаем медиафайлы в данных треда
        thread_data['media'] = []
        for post in thread_data.get('posts', []):
            post['media'] = []
        
        # Сохраняем обновленный тред
        save_thread(thread_data)
        
        # Удаляем медиафайлы с диска
        delete_media_files(all_media)
        
        return jsonify({'success': True, 'message': f'Медиафайлы треда {thread_id} очищены', 'deleted_files': len(all_media)})
    
    except Exception as e:
        print(f"Ошибка очистки медиафайлов: {str(e)}")
        return jsonify({'error': 'Ошибка очистки медиафайлов'}), 500

@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    """Получает статистику для админки"""
    try:
        total_threads = 0
        total_posts = 0
        total_files = 0
        threads_by_board = {}
        
        for filename in os.listdir(app.config['THREADS_FOLDER']):
            if filename.endswith('.json'):
                try:
                    thread_data = load_thread(filename[:-5])
                    if thread_data:
                        total_threads += 1
                        total_posts += len(thread_data.get('posts', [])) + 1  # +1 для OP-поста
                        total_files += len(thread_data.get('media', [])) + sum(len(post.get('media', [])) for post in thread_data.get('posts', []))
                        
                        # Статистика по разделам
                        board = thread_data.get('board', 'unknown')
                        if board not in threads_by_board:
                            threads_by_board[board] = 0
                        threads_by_board[board] += 1
                        
                except Exception as e:
                    print(f"Ошибка загрузки треда {filename} для статистики: {str(e)}")
                    continue
        
        return jsonify({
            'total_threads': total_threads,
            'total_posts': total_posts,
            'total_files': total_files,
            'threads_by_board': threads_by_board
        })
    
    except Exception as e:
        print(f"Ошибка получения статистики: {str(e)}")
        return jsonify({'error': 'Ошибка получения статистики'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=3001)