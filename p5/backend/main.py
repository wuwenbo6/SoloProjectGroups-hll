import uuid
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from app.database import init_db, get_db
from app.game_logic import GoGame
from app.ai_engine import SimplifiedKataGo
from app.review import MoveReview

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

class GameRecordCreate(BaseModel):
    black_player: str
    white_player: str
    board_size: int
    moves: List[dict]
    winner: str

@app.get("/")
async def root():
    return {"message": "Go Game API Server"}

@app.get("/api/records")
async def get_records():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, created_at, black_player, white_player, winner, board_size, move_count
            FROM game_records
            ORDER BY created_at DESC
            LIMIT 50
        ''')
        rows = cursor.fetchall()
        records = []
        for row in rows:
            records.append({
                'id': row[0],
                'date': row[1],
                'blackPlayer': row[2],
                'whitePlayer': row[3],
                'winner': row[4],
                'boardSize': row[5],
                'moves': row[6]
            })
        return {'records': records}

@app.post("/api/records")
async def save_record(record: GameRecordCreate):
    game_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO game_records (id, black_player, white_player, winner, board_size, move_count)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (game_id, record.black_player, record.white_player, record.winner, record.board_size, len(record.moves)))
        
        for i, move in enumerate(record.moves):
            move_id = str(uuid.uuid4())
            cursor.execute('''
                INSERT INTO moves (id, game_id, move_number, x, y, color, win_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (move_id, game_id, i + 1, move.get('x', -1), move.get('y', -1), 
                  move.get('color', ''), move.get('winRate')))
        
        conn.commit()
    return {'id': game_id}

@app.get("/api/records/{record_id}")
async def get_record(record_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, created_at, black_player, white_player, winner, board_size, move_count
            FROM game_records WHERE id = ?
        ''', (record_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Record not found")
        
        cursor.execute('''
            SELECT move_number, x, y, color, win_rate
            FROM moves WHERE game_id = ? ORDER BY move_number
        ''', (record_id,))
        move_rows = cursor.fetchall()
        moves = []
        for mr in move_rows:
            moves.append({
                'moveNumber': mr[0],
                'x': mr[1],
                'y': mr[2],
                'color': mr[3],
                'winRate': mr[4]
            })
        
        return {
            'id': row[0],
            'date': row[1],
            'blackPlayer': row[2],
            'whitePlayer': row[3],
            'winner': row[4],
            'boardSize': row[5],
            'moves': moves
        }

@app.get("/api/records/{record_id}/heatmap")
async def get_heatmap(record_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT board_size FROM game_records WHERE id = ?', (record_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Record not found")
        
        board_size = row[0]
        cursor.execute('''
            SELECT x, y, color FROM moves WHERE game_id = ? AND x >= 0 AND y >= 0
        ''', (record_id,))
        moves = cursor.fetchall()
        
        heatmap = [[0.0 for _ in range(board_size)] for _ in range(board_size)]
        
        for x, y, color in moves:
            if 0 <= x < board_size and 0 <= y < board_size:
                heatmap[y][x] += 1.0
                
                for dx in [-1, 0, 1]:
                    for dy in [-1, 0, 1]:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < board_size and 0 <= ny < board_size and (dx != 0 or dy != 0):
                            heatmap[ny][nx] += 0.3
        
        max_val = max(max(row) for row in heatmap) if any(any(row) for row in heatmap) else 1
        if max_val > 0:
            for y in range(board_size):
                for x in range(board_size):
                    heatmap[y][x] = heatmap[y][x] / max_val
        
        return {'heatmap': heatmap}

@app.get("/api/records/{record_id}/review")
async def get_review(record_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, board_size, black_player, white_player, winner
            FROM game_records WHERE id = ?
        ''', (record_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Record not found")
        
        cursor.execute('''
            SELECT x, y, color FROM moves WHERE game_id = ? AND x >= 0 AND y >= 0 ORDER BY move_number
        ''', (record_id,))
        move_rows = cursor.fetchall()
        moves = [{'x': mr[0], 'y': mr[1], 'color': mr[2]} for mr in move_rows]
    
    reviewer = MoveReview()
    review_result = reviewer.analyze_game(moves, board_size=row[1])
    
    return {
        'recordId': record_id,
        'boardSize': row[1],
        'blackPlayer': row[2],
        'whitePlayer': row[3],
        'winner': row[4],
        **review_result
    }

@app.get("/api/records/{record_id}/sgf")
async def get_sgf(record_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, created_at, black_player, white_player, winner, board_size
            FROM game_records WHERE id = ?
        ''', (record_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Record not found")
        
        cursor.execute('''
            SELECT x, y, color FROM moves WHERE game_id = ? ORDER BY move_number
        ''', (record_id,))
        move_rows = cursor.fetchall()
    
    letters = 'abcdefghijklmnopqrs'
    board_size = row[5]
    
    sgf_lines = []
    sgf_lines.append('(;')
    sgf_lines.append(f'GM[1]')
    sgf_lines.append(f'FF[4]')
    sgf_lines.append(f'CA[UTF-8]')
    sgf_lines.append(f'SZ[{board_size}]')
    sgf_lines.append(f'PB[{row[2]}]')
    sgf_lines.append(f'PW[{row[3]}]')
    sgf_lines.append(f'DT[{str(row[1])[:10]}]')
    sgf_lines.append(f'RE[{"B+" if row[4] == "black" else "W+"}]')
    sgf_lines.append(f'KM[6.5]')
    sgf_lines.append(f'RU[Chinese]')
    
    for x, y, color in move_rows:
        if x < 0 or y < 0:
            sgf_lines.append(f';{"B" if color == "black" else "W"}[]')
        else:
            sgf_x = letters[x] if x < len(letters) else ''
            sgf_y = letters[y] if y < len(letters) else ''
            sgf_lines.append(f';{"B" if color == "black" else "W"}[{sgf_x}{sgf_y}]')
    
    sgf_lines.append(')')
    
    return {'sgf': '\n'.join(sgf_lines)}

@app.websocket("/ws/game")
async def websocket_game(websocket: WebSocket):
    await websocket.accept()
    
    game = None
    ai_engine = None
    game_mode = 'pvp'
    ai_color = 'white'
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get('type')
            
            if msg_type == 'init':
                board_size = message.get('boardSize', 19)
                game_mode = message.get('mode', 'pvp')
                difficulty = message.get('difficulty', 'medium')
                ai_color = message.get('aiColor', 'white')
                
                game = GoGame(board_size)
                ai_engine = SimplifiedKataGo(board_size, difficulty)
                
                await websocket.send_json({
                    'type': 'game_state',
                    **game.get_state()
                })
                
                if game_mode == 'ai' and ai_color == 'black':
                    x, y, win_rate = ai_engine.get_best_move(game, 'black')
                    if x is not None and y is not None:
                        game.make_move(x, y)
                        top_moves = ai_engine.get_top_moves(game, game.current_player)
                        await websocket.send_json({
                            'type': 'analysis',
                            'winRate': win_rate,
                            'scoreLead': 0,
                            'topMoves': top_moves
                        })
                        await websocket.send_json({
                            'type': 'game_state',
                            **game.get_state()
                        })
            
            elif msg_type == 'move' and game:
                x = message.get('x')
                y = message.get('y')
                color = message.get('color', game.current_player)
                
                if game.current_player != color:
                    await websocket.send_json({
                        'type': 'error',
                        'message': '不是你的回合'
                    })
                    continue
                
                success, msg, captured = game.make_move(x, y)
                
                if success:
                    if ai_engine:
                        top_moves = ai_engine.get_top_moves(game, game.current_player)
                        current_win_rate = 50 + (len(captured) * 2)
                        await websocket.send_json({
                            'type': 'analysis',
                            'winRate': current_win_rate if color == 'black' else 100 - current_win_rate,
                            'scoreLead': len(captured),
                            'topMoves': top_moves,
                            'captured': captured
                        })
                    
                    await websocket.send_json({
                        'type': 'game_state',
                        **game.get_state()
                    })
                    
                    if game_mode == 'ai' and not game.game_over:
                        import asyncio
                        await asyncio.sleep(0.8)
                        
                        ai_x, ai_y, ai_win_rate = ai_engine.get_best_move(game, ai_color)
                        if ai_x is not None and ai_y is not None:
                            game.make_move(ai_x, ai_y)
                            ai_top_moves = ai_engine.get_top_moves(game, game.current_player)
                            await websocket.send_json({
                                'type': 'analysis',
                                'winRate': 100 - ai_win_rate if ai_color == 'black' else ai_win_rate,
                                'scoreLead': 0,
                                'topMoves': ai_top_moves
                            })
                            await websocket.send_json({
                                'type': 'game_state',
                                **game.get_state()
                            })
                else:
                    await websocket.send_json({
                        'type': 'error',
                        'message': msg
                    })
            
            elif msg_type == 'pass' and game:
                success, msg = game.pass_move()
                if success:
                    await websocket.send_json({
                        'type': 'game_state',
                        **game.get_state()
                    })
                    
                    if game_mode == 'ai' and not game.game_over:
                        import asyncio
                        await asyncio.sleep(0.5)
                        game.pass_move()
                        await websocket.send_json({
                            'type': 'game_state',
                            **game.get_state()
                        })
            
            elif msg_type == 'request_analysis' and game and ai_engine:
                top_moves = ai_engine.get_top_moves(game, game.current_player)
                await websocket.send_json({
                    'type': 'analysis',
                    'winRate': 50.0,
                    'scoreLead': 0,
                    'topMoves': top_moves
                })
    
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
