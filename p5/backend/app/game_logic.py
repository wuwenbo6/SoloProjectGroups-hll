import copy
from typing import List, Tuple, Optional, Set

class GoGame:
    def __init__(self, board_size: int = 19):
        self.board_size = board_size
        self.board: List[List[Optional[str]]] = [[None for _ in range(board_size)] for _ in range(board_size)]
        self.current_player: str = 'black'
        self.move_history: List[dict] = []
        self.captures: dict = {'black': 0, 'white': 0}
        self.previous_board: Optional[List[List[Optional[str]]]] = None
        self.ko_point: Optional[Tuple[int, int]] = None
        self.pass_count: int = 0
        self.game_over: bool = False

    def get_neighbors(self, x: int, y: int) -> List[Tuple[int, int]]:
        neighbors = []
        if x > 0:
            neighbors.append((x - 1, y))
        if x < self.board_size - 1:
            neighbors.append((x + 1, y))
        if y > 0:
            neighbors.append((x, y - 1))
        if y < self.board_size - 1:
            neighbors.append((x, y + 1))
        return neighbors

    def get_group(self, x: int, y: int, board: List[List[Optional[str]]]) -> Tuple[Set[Tuple[int, int]], Set[Tuple[int, int]]]:
        color = board[y][x]
        if color is None:
            return set(), set()
        
        group = set()
        liberties = set()
        stack = [(x, y)]
        
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in group:
                continue
            group.add((cx, cy))
            
            for nx, ny in self.get_neighbors(cx, cy):
                neighbor_color = board[ny][nx]
                if neighbor_color is None:
                    liberties.add((nx, ny))
                elif neighbor_color == color:
                    stack.append((nx, ny))
        
        return group, liberties

    def remove_group(self, group: Set[Tuple[int, int]], board: List[List[Optional[str]]]) -> int:
        for x, y in group:
            board[y][x] = None
        return len(group)

    def is_valid_move(self, x: int, y: int, color: str) -> Tuple[bool, str]:
        if self.game_over:
            return False, '游戏已结束'
        
        if self.board[y][x] is not None:
            return False, '该位置已有棋子'
        
        if self.ko_point == (x, y):
            return False, '劫争规则，不能立即提回'
        
        test_board = copy.deepcopy(self.board)
        test_board[y][x] = color
        
        opponent = 'white' if color == 'black' else 'black'
        captured_stones = 0
        
        for nx, ny in self.get_neighbors(x, y):
            if test_board[ny][nx] == opponent:
                group, liberties = self.get_group(nx, ny, test_board)
                if len(liberties) == 0:
                    captured_stones += self.remove_group(group, test_board)
        
        my_group, my_liberties = self.get_group(x, y, test_board)
        if len(my_liberties) == 0:
            return False, '禁止自杀'
        
        if self.previous_board is not None:
            boards_equal = True
            for i in range(self.board_size):
                for j in range(self.board_size):
                    if test_board[i][j] != self.previous_board[i][j]:
                        boards_equal = False
                        break
                if not boards_equal:
                    break
            if boards_equal:
                return False, '全局同形禁止'
        
        return True, ''

    def make_move(self, x: int, y: int) -> Tuple[bool, str, List[Tuple[int, int]]]:
        valid, message = self.is_valid_move(x, y, self.current_player)
        if not valid:
            return False, message, []
        
        self.previous_board = copy.deepcopy(self.board)
        
        self.board[y][x] = self.current_player
        
        opponent = 'white' if self.current_player == 'black' else 'black'
        captured_positions = []
        
        for nx, ny in self.get_neighbors(x, y):
            if self.board[ny][nx] == opponent:
                group, liberties = self.get_group(nx, ny, self.board)
                if len(liberties) == 0:
                    captured_positions.extend(group)
                    self.remove_group(group, self.board)
        
        if len(captured_positions) == 1:
            self.ko_point = captured_positions[0]
        else:
            self.ko_point = None
        
        self.captures[self.current_player] += len(captured_positions)
        
        self.move_history.append({
            'x': x,
            'y': y,
            'color': self.current_player,
            'captured': captured_positions
        })
        
        self.pass_count = 0
        self.current_player = opponent
        
        return True, '', captured_positions

    def pass_move(self) -> Tuple[bool, str]:
        if self.game_over:
            return False, '游戏已结束'
        
        self.pass_count += 1
        self.move_history.append({
            'x': -1,
            'y': -1,
            'color': self.current_player,
            'pass': True
        })
        
        if self.pass_count >= 2:
            self.game_over = True
            return True, '游戏结束（双方连续虚着）'
        
        self.current_player = 'white' if self.current_player == 'black' else 'black'
        return True, ''

    def get_state(self) -> dict:
        return {
            'board': self.board,
            'current_player': self.current_player,
            'move_history': self.move_history,
            'captures': self.captures,
            'game_over': self.game_over,
            'board_size': self.board_size
        }
