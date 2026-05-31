from typing import List, Dict, Tuple, Optional
from .game_logic import GoGame
from .ai_engine import SimplifiedKataGo

class MoveReview:
    def __init__(self):
        pass
    
    def analyze_game(self, moves: List[Dict], board_size: int = 19) -> Dict:
        game = GoGame(board_size)
        ai = SimplifiedKataGo(board_size, 'hard')
        
        reviews = []
        win_rates = []
        current_win_rate = 50.0
        
        for i, move in enumerate(moves):
            if move.get('pass'):
                game.pass_move()
                reviews.append({
                    'move_number': i + 1,
                    'is_pass': True,
                    'quality': 'neutral',
                    'comment': '虚着'
                })
                continue
            
            x, y = move.get('x', -1), move.get('y', -1)
            color = move.get('color', 'black')
            
            if x < 0 or y < 0:
                continue
            
            top_moves = ai.get_top_moves(game, color, count=5)
            
            best_move = top_moves[0] if top_moves else None
            is_best = best_move and best_move['x'] == x and best_move['y'] == y
            
            expected_win_rate = best_move['winRate'] if best_move else current_win_rate
            
            game.make_move(x, y)
            
            actual_win_rate = ai.get_best_move(game, 'white' if color == 'black' else 'black')[2]
            if color == 'white':
                actual_win_rate = 100 - actual_win_rate
            
            win_rate_diff = actual_win_rate - expected_win_rate
            
            quality = 'excellent'
            comment = '好棋'
            
            if win_rate_diff < -15:
                quality = 'bad'
                comment = '恶手！胜率下降明显'
            elif win_rate_diff < -8:
                quality = 'doubtful'
                comment = '疑问手，可以考虑其他下法'
            elif is_best or win_rate_diff > 5:
                quality = 'excellent'
                comment = '妙手！'
            elif win_rate_diff > -3:
                quality = 'good'
                comment = '不错的一手'
            
            suggestion = None
            if quality in ['bad', 'doubtful'] and best_move:
                suggestion = {
                    'x': best_move['x'],
                    'y': best_move['y'],
                    'winRate': best_move['winRate']
                }
            
            reviews.append({
                'move_number': i + 1,
                'x': x,
                'y': y,
                'color': color,
                'quality': quality,
                'comment': comment,
                'winRate': actual_win_rate,
                'winRateDiff': win_rate_diff,
                'suggestion': suggestion
            })
            
            current_win_rate = actual_win_rate
            win_rates.append(current_win_rate)
        
        bad_moves = [r for r in reviews if r['quality'] == 'bad']
        doubtful_moves = [r for r in reviews if r['quality'] == 'doubtful']
        excellent_moves = [r for r in reviews if r['quality'] == 'excellent']
        
        return {
            'reviews': reviews,
            'summary': {
                'total_moves': len(moves),
                'bad_moves': len(bad_moves),
                'doubtful_moves': len(doubtful_moves),
                'excellent_moves': len(excellent_moves),
                'black_avg_win_rate': sum(win_rates[::2]) / len(win_rates[::2]) if win_rates[::2] else 50,
                'white_avg_win_rate': sum(win_rates[1::2]) / len(win_rates[1::2]) if win_rates[1::2] else 50
            },
            'bad_moves': bad_moves,
            'doubtful_moves': doubtful_moves,
            'win_rate_history': [{'move': i + 1, 'winRate': wr} for i, wr in enumerate(win_rates)]
        }
