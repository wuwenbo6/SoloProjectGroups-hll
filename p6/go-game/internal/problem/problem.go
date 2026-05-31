package problem

import (
	"go-game/internal/go"
	"go-game/internal/sgf"
)

type Difficulty int

const (
	Easy Difficulty = iota
	Medium
	Hard
	Expert
)

type ProblemType int

const (
	Life ProblemType = iota
	Death
	Ko
	Seki
	Connection
	Capture
)

type Problem struct {
	ID          string
	Name        string
	Difficulty  Difficulty
	Type        ProblemType
	Description string
	BoardSize   int
	InitialBoard [][]go.Stone
	ToPlay      go.Stone
	Solution    []go.Position
	WrongMoves  []go.Position
	Hint        string
	Tags        []string
}

type ProblemSession struct {
	Problem      *Problem
	Board        *go.Board
	MoveHistory  []go.Move
	CurrentStep  int
	IsComplete   bool
	IsSuccess    bool
	UserMoves    []go.Position
	ShowHint     bool
}

var problemLibrary = []*Problem{
	{
		ID:         "1",
		Name:       "直三活棋",
		Difficulty: Easy,
		Type:       Life,
		BoardSize:  9,
		ToPlay:     go.Black,
		Hint:       "在中间下子可以做成两眼活棋",
		Tags:       []string{"基础", "活棋", "直三"},
	},
	{
		ID:         "2",
		Name:       "方四死棋",
		Difficulty: Easy,
		Type:       Death,
		BoardSize:  9,
		ToPlay:     go.White,
		Hint:       "方四是死形，不需要再下子",
		Tags:       []string{"基础", "死棋", "方四"},
	},
	{
		ID:         "3",
		Name:       "弯三活棋",
		Difficulty: Easy,
		Type:       Life,
		BoardSize:  9,
		ToPlay:     go.Black,
		Hint:       "找到要点做成两眼",
		Tags:       []string{"基础", "活棋", "弯三"},
	},
	{
		ID:         "4",
		Name:       "丁四活棋",
		Difficulty: Medium,
		Type:       Life,
		BoardSize:  9,
		ToPlay:     go.Black,
		Hint:       "丁四的要点在中间",
		Tags:       []string{"中级", "活棋", "丁四"},
	},
	{
		ID:         "5",
		Name:       "刀五活棋",
		Difficulty: Medium,
		Type:       Life,
		BoardSize:  9,
		ToPlay:     go.Black,
		Hint:       "刀五的要点在哪里？",
		Tags:       []string{"中级", "活棋", "刀五"},
	},
	{
		ID:         "6",
		Name:       "花五活棋",
		Difficulty: Medium,
		Type:       Life,
		BoardSize:  9,
		ToPlay:     go.Black,
		Hint:       "找到中心点",
		Tags:       []string{"中级", "活棋", "花五"},
	},
	{
		ID:         "7",
		Name:       "板六活棋",
		Difficulty: Medium,
		Type:       Life,
		BoardSize:  9,
		ToPlay:     go.Black,
		Hint:       "板六在中间是活棋",
		Tags:       []string{"中级", "活棋", "板六"},
	},
	{
		ID:         "8",
		Name:       "点杀直三",
		Difficulty: Easy,
		Type:       Death,
		BoardSize:  9,
		ToPlay:     go.White,
		Hint:       "点在中间位置",
		Tags:       []string{"基础", "杀棋", "点眼"},
	},
	{
		ID:         "9",
		Name:       "点杀弯三",
		Difficulty: Easy,
		Type:       Death,
		BoardSize:  9,
		ToPlay:     go.White,
		Hint:       "找到要点",
		Tags:       []string{"基础", "杀棋", "点眼"},
	},
	{
		ID:         "10",
		Name:      "倒脱靴",
		Difficulty: Hard,
		Type:      Capture,
		BoardSize: 9,
		ToPlay:    go.Black,
		Hint:      "先弃后取",
		Tags:      []string{"高级", "手筋", "倒脱靴"},
	},
}

func init() {
	for _, p := range problemLibrary {
		p.InitialBoard = createInitialBoard(p.ID, p.BoardSize, p.Type, p.ToPlay)
		p.Solution = createSolution(p.ID)
	}
}

func createInitialBoard(id string, size int, pType ProblemType, toPlay go.Stone) [][]go.Stone {
	board := make([][]go.Stone, size)
	for i := range board {
		board[i] = make([]go.Stone, size)
	}

	opponent := go.White
	if toPlay == go.White {
		opponent = go.Black
	}

	switch id {
	case "1":
		board[3][3] = opponent
		board[3][4] = opponent
		board[3][5] = opponent
		board[4][3] = toPlay
		board[4][6] = opponent
		board[5][3] = opponent
		board[5][4] = opponent
		board[5][5] = opponent
	case "2":
		board[3][3] = toPlay
		board[3][4] = toPlay
		board[4][2] = toPlay
		board[4][5] = toPlay
		board[5][3] = toPlay
		board[5][4] = toPlay
	case "3":
		board[3][3] = opponent
		board[3][4] = opponent
		board[4][3] = opponent
		board[4][5] = opponent
		board[5][3] = opponent
		board[5][4] = opponent
		board[5][5] = opponent
	case "4":
		board[3][4] = opponent
		board[4][3] = opponent
		board[4][4] = opponent
		board[4][5] = opponent
		board[5][4] = opponent
	case "8":
		board[3][3] = toPlay
		board[3][4] = toPlay
		board[3][5] = toPlay
		board[4][3] = toPlay
		board[4][6] = toPlay
		board[5][3] = toPlay
		board[5][4] = toPlay
		board[5][5] = toPlay
	case "9":
		board[3][3] = toPlay
		board[3][4] = toPlay
		board[4][3] = toPlay
		board[4][5] = toPlay
		board[5][3] = toPlay
		board[5][4] = toPlay
		board[5][5] = toPlay
	}

	return board
}

func createSolution(id string) []go.Position {
	switch id {
	case "1":
		return []go.Position{{X: 4, Y: 4}}
	case "3":
		return []go.Position{{X: 4, Y: 4}}
	case "4":
		return []go.Position{{X: 4, Y: 4}}
	case "5":
		return []go.Position{{X: 4, Y: 4}}
	case "6":
		return []go.Position{{X: 4, Y: 4}}
	case "7":
		return []go.Position{{X: 4, Y: 4}}
	case "8":
		return []go.Position{{X: 4, Y: 4}}
	case "9":
		return []go.Position{{X: 4, Y: 4}}
	case "10":
		return []go.Position{{X: 4, Y: 5}, {X: 5, Y: 5}}
	default:
		return []go.Position{{X: 4, Y: 4}}
	}
}

func GetAllProblems() []*Problem {
	return problemLibrary
}

func GetProblemByID(id string) *Problem {
	for _, p := range problemLibrary {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func GetProblemsByDifficulty(diff Difficulty) []*Problem {
	result := make([]*Problem, 0)
	for _, p := range problemLibrary {
		if p.Difficulty == diff {
			result = append(result, p)
		}
	}
	return result
}

func GetProblemsByType(pType ProblemType) []*Problem {
	result := make([]*Problem, 0)
	for _, p := range problemLibrary {
		if p.Type == pType {
			result = append(result, p)
		}
	}
	return result
}

func NewProblemSession(problem *Problem) *ProblemSession {
	board := go.NewBoard(problem.BoardSize)
	for y := 0; y < problem.BoardSize; y++ {
		for x := 0; x < problem.BoardSize; x++ {
			if problem.InitialBoard[y][x] != go.Empty {
				board.SetStone(go.Position{X: x, Y: y}, problem.InitialBoard[y][x])
			}
		}
	}

	return &ProblemSession{
		Problem:    problem,
		Board:      board,
		MoveHistory: make([]go.Move, 0),
		CurrentStep: 0,
		IsComplete:  false,
		IsSuccess:   false,
		UserMoves:   make([]go.Position, 0),
		ShowHint:    false,
	}
}

func (ps *ProblemSession) MakeMove(pos go.Position) (bool, string) {
	if ps.IsComplete {
		return false, "题目已完成"
	}

	if ps.Board.GetStone(pos) != go.Empty {
		return false, "此处已有棋子"
	}

	ps.UserMoves = append(ps.UserMoves, pos)

	isCorrect := false
	for _, correct := range ps.Problem.Solution {
		if pos.X == correct.X && pos.Y == correct.Y {
			isCorrect = true
			break
		}
	}

	if isCorrect {
		_, err := ps.Board.Play(pos, ps.Problem.ToPlay)
		if err != nil {
			return false, "无效着法"
		}
		ps.CurrentStep++

		if ps.CurrentStep >= len(ps.Problem.Solution) {
			ps.IsComplete = true
			ps.IsSuccess = true
			return true, "恭喜！解题正确！"
		}

		opponent := go.White
		if ps.Problem.ToPlay == go.White {
			opponent = go.Black
		}

		if ps.CurrentStep < len(ps.Problem.Solution) {
			responsePos := ps.Problem.Solution[ps.CurrentStep]
			if ps.Board.GetStone(responsePos) == go.Empty {
				ps.Board.Play(responsePos, opponent)
				ps.CurrentStep++

				if ps.CurrentStep >= len(ps.Problem.Solution) {
					ps.IsComplete = true
					ps.IsSuccess = true
					return true, "恭喜！解题正确！"
				}
			}
		}

		return true, "正确！继续下一步"
	}

	return false, "这不是最佳应手，请重试"
}

func (ps *ProblemSession) Reset() {
	*ps = *NewProblemSession(ps.Problem)
}

func (ps *ProblemSession) GetHint() string {
	ps.ShowHint = true
	return ps.Problem.Hint
}

func (ps *ProblemSession) ShowSolution() {
	ps.IsComplete = true
	ps.Reset()
	for _, pos := range ps.Problem.Solution {
		ps.Board.Play(pos, ps.Problem.ToPlay)
	}
}

func (ps *ProblemSession) ToSGF() string {
	info := sgf.GameInfo{
		Size:        ps.Problem.BoardSize,
		BlackPlayer: "解答者",
		WhitePlayer: "题目",
		Event:       "死活题练习",
		GameComment: ps.Problem.Name + " - " + ps.Problem.Difficulty.String(),
	}
	return sgf.BoardToSGF(ps.Board, info)
}

func (d Difficulty) String() string {
	switch d {
	case Easy:
		return "初级"
	case Medium:
		return "中级"
	case Hard:
		return "高级"
	case Expert:
		return "专家"
	default:
		return "未知"
	}
}

func (p ProblemType) String() string {
	switch p {
	case Life:
		return "活棋"
	case Death:
		return "杀棋"
	case Ko:
		return "劫争"
	case Seki:
		return "双活"
	case Connection:
		return "连接"
	case Capture:
		return "吃子"
	default:
		return "未知"
	}
}
