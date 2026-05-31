import random
import hashlib
from typing import List, Tuple, Optional, Dict
from .game_logic import GoGame

class SimplifiedKataGo:
    def __init__(self, board_size: int = 19, difficulty: str = 'medium'):
        self.board_size = board_size
        self.difficulty = difficulty
        self.difficulty_params = {
            'easy': {'randomness': 0.7, 'candidate_limit': 20},
            'medium': {'randomness': 0.4, 'candidate_limit': 40},
            'hard': {'randomness': 0.15, 'candidate_limit': 80}
        }
        self._move_cache: Dict[str, Tuple[int, int, float]] = {}
        self._top_moves_cache: Dict[str, List[dict]] = {}
        self._board_hash_cache: Dict[str, str] = {}

    def _get_board_hash(self, board: List[List[Optional[str]]]) -> str:
        board_tuple = tuple(tuple(row) for row in board)
        board_str = str(board_tuple)
        if board_str in self._board_hash_cache:
            return self._board_hash_cache[board_str]
        hash_val = hashlib.md5(board_str.encode()).hexdigest()
        self._board_hash_cache[board_str] = hash_val
        if len(self._board_hash_cache) > 100:
            self._board_hash_cache.clear()
        return hash_val

    def get_position_value(self, x: int, y: int) -> float:
        if self.board_size == 19:
            if (x in [3, 15] and y in [3, 15]) or (x == 9 and y in [3, 15]) or (x in [3, 15] and y == 9):
                return 8.0
            if (x in [2, 16] and y in [2, 16]):
                return 6.0
        elif self.board_size == 13:
            if (x in [3, 9] and y in [3, 9]) or (x == 6 and y in [3, 9]) or (x in [3, 9] and y == 6):
                return 8.0
        elif self.board_size == 9:
            if (x in [2, 6] and y in [2, 6]):
                return 8.0
        
        mid = self.board_size // 2
        dist_from_center = abs(x - mid) + abs(y - mid)
        max_dist = 2 * mid
        
        return 5.0 * (1 - dist_from_center / max_dist * 0.5)

    def _get_fast_candidates(self, game: GoGame, color: str, limit: int) -> List[Tuple[int, int, float]]:
        candidates: List[Tuple[int, int, float]] = []
        opponent = 'white' if color == 'black' else 'black'
        
        for y in range(self.board_size):
            for x in range(self.board_size):
                if game.board[y][x] is not None:
                    continue
                
                score = self.get_position_value(x, y)
                
                has_neighbor = False
                captures = 0
                for nx, ny in game.get_neighbors(x, y):
                    neighbor = game.board[ny][nx]
                    if neighbor == color:
                        score += 2
                        has_neighbor = True
                    elif neighbor == opponent:
                        group, liberties = game.get_group(nx, ny, game.board)
                        if len(liberties) == 1:
                            captures += len(group)
                            score += len(group) * 15
                        has_neighbor = True
                
                if not has_neighbor and score < 4:
                    continue
                
                if game.ko_point == (x, y):
                    continue
                
                candidates.append((x, y, score))
        
        candidates.sort(key=lambda m: m[2], reverse=True)
        return candidates[:limit]

    def get_best_move(self, game: GoGame, color: str) -> Tuple[Optional[int], Optional[int], float]:
        board_hash = self._get_board_hash(game.board)
        cache_key = f"{board_hash}_{color}_{self.difficulty}"
        
        if cache_key in self._move_cache:
            return self._move_cache[cache_key]
        
        params = self.difficulty_params[self.difficulty]
        candidates = self._get_fast_candidates(game, color, params['candidate_limit'])
        
        if not candidates:
            return None, None, 50.0
        
        if random.random() < params['randomness']:
            top_n = min(10, len(candidates))
            move = candidates[random.randint(0, top_n - 1)]
            win_rate = 45 + random.random() * 20
            result = (move[0], move[1], win_rate)
        else:
            best_move = candidates[0]
            base_win_rate = 50
            if best_move[2] > 15:
                base_win_rate = 65
            elif best_move[2] > 10:
                base_win_rate = 58
            elif best_move[2] > 5:
                base_win_rate = 52
            win_rate = base_win_rate + random.uniform(-3, 3)
            result = (best_move[0], best_move[1], win_rate)
        
        self._move_cache[cache_key] = result
        if len(self._move_cache) > 50:
            self._move_cache.clear()
        
        return result

    def get_top_moves(self, game: GoGame, color: str, count: int = 3) -> List[dict]:
        board_hash = self._get_board_hash(game.board)
        cache_key = f"top_{board_hash}_{color}_{count}"
        
        if cache_key in self._top_moves_cache:
            return self._top_moves_cache[cache_key]
        
        candidates = self._get_fast_candidates(game, color, 30)
        
        if not candidates:
            return []
        
        result = []
        for move in candidates[:count]:
            x, y, score = move
            result.append({
                'x': x,
                'y': y,
                'winRate': 50 + score * 2 + random.uniform(-5, 5),
                'visits': int(score * 100) + random.randint(50, 200)
            })
        
        self._top_moves_cache[cache_key] = result
        if len(self._top_moves_cache) > 30:
            self._top_moves_cache.clear()
        
        return result
