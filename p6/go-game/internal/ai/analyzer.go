package ai

import (
	"go-game/internal/go"
	"math"
)

type MoveQuality int

const (
	Excellent MoveQuality = iota
	Good
	Okay
	Doubtful
	Bad
	VeryBad
	Blunder
)

type MoveAnalysis struct {
	MoveNumber  int
	Position    go.Position
	Stone       go.Stone
	Quality     MoveQuality
	Score       float64
	Comment     string
	Suggestions []go.Position
}

type GameAnalysis struct {
	Moves         []MoveAnalysis
	OverallScore  float64
	BlackScore    float64
	WhiteScore    float64
	Blunders      []int
	BadMoves      []int
	GoodMoves     []int
	Recommendations []string
}

type Pattern struct {
	Name        string
	Pattern     [][]go.Stone
	GoodFor     go.Stone
	Score       float64
	Description string
}

var knownPatterns = []Pattern{
	{
		Name:    "EmptyTriangle",
		GoodFor: go.Empty,
		Score:   -5.0,
		Description: "愚形三角",
	},
	{
		Name:    "EyeShape",
		GoodFor: go.Black,
		Score:   10.0,
		Description: "好形眼位",
	},
}

type BoardEvaluator struct {
	InfluenceWeight float64
	TerritoryWeight float64
	EyeWeight       float64
	ConnectionWeight float64
}

func NewBoardEvaluator() *BoardEvaluator {
	return &BoardEvaluator{
		InfluenceWeight:  0.3,
		TerritoryWeight:  0.4,
		EyeWeight:        0.2,
		ConnectionWeight: 0.1,
	}
}

func (e *BoardEvaluator) Evaluate(board *go.Board, player go.Stone) float64 {
	if board == nil {
		return 0
	}

	score := 0.0

	territoryBlack, territoryWhite := board.GetTerritory()
	if player == go.Black {
		score += float64(territoryBlack-territoryWhite) * e.TerritoryWeight
	} else {
		score += float64(territoryWhite-territoryBlack) * e.TerritoryWeight
	}

	score += e.evaluateInfluence(board, player) * e.InfluenceWeight
	score += e.evaluateEyes(board, player) * e.EyeWeight
	score += e.evaluateConnections(board, player) * e.ConnectionWeight

	return score
}

func (e *BoardEvaluator) evaluateInfluence(board *go.Board, player go.Stone) float64 {
	influence := 0.0
	opponent := go.White
	if player == go.White {
		opponent = go.Black
	}

	for y := 0; y < board.Size; y++ {
		for x := 0; x < board.Size; x++ {
			pos := go.Position{X: x, Y: y}
			stone := board.GetStone(pos)
			if stone == player {
				influence += 1.0
				for _, neighbor := range e.getExtendedNeighbors(pos, 2) {
					if board.GetStone(neighbor) == go.Empty {
						influence += 0.25
					}
				}
			} else if stone == opponent {
				influence -= 1.0
			}
		}
	}

	return influence
}

func (e *BoardEvaluator) getExtendedNeighbors(pos go.Position, dist int) []go.Position {
	neighbors := make([]go.Position, 0)
	for dy := -dist; dy <= dist; dy++ {
		for dx := -dist; dx <= dist; dx++ {
			if dx == 0 && dy == 0 {
				continue
			}
			neighbors = append(neighbors, go.Position{
				X: pos.X + dx,
				Y: pos.Y + dy,
			})
		}
	}
	return neighbors
}

func (e *BoardEvaluator) evaluateEyes(board *go.Board, player go.Stone) float64 {
	eyeScore := 0.0

	for y := 0; y < board.Size; y++ {
		for x := 0; x < board.Size; x++ {
			pos := go.Position{X: x, Y: y}
			if board.IsEye(pos, player) {
				eyeScore += 5.0
			}
		}
	}

	return eyeScore
}

func (e *BoardEvaluator) evaluateConnections(board *go.Board, player go.Stone) float64 {
	connectionScore := 0.0
	visited := make(map[go.Position]bool)

	for y := 0; y < board.Size; y++ {
		for x := 0; x < board.Size; x++ {
			pos := go.Position{X: x, Y: y}
			if board.GetStone(pos) == player && !visited[pos] {
				group := getGroup(board, pos, player)
				for _, p := range group {
					visited[p] = true
				}
				liberties := countLiberties(board, group)
				if liberties >= 2 {
					connectionScore += float64(len(group)) * 0.5
				}
				if liberties >= 4 {
					connectionScore += float64(len(group)) * 0.3
				}
			}
		}
	}

	return connectionScore
}

func getGroup(board *go.Board, pos go.Position, player go.Stone) []go.Position {
	group := make([]go.Position, 0)
	visited := make(map[go.Position]bool)
	queue := []go.Position{pos}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if visited[current] {
			continue
		}
		visited[current] = true
		group = append(group, current)

		for _, neighbor := range getNeighbors(board, current) {
			if board.GetStone(neighbor) == player && !visited[neighbor] {
				queue = append(queue, neighbor)
			}
		}
	}

	return group
}

func countLiberties(board *go.Board, group []go.Position) int {
	liberties := make(map[go.Position]bool)
	for _, pos := range group {
		for _, neighbor := range getNeighbors(board, pos) {
			if board.GetStone(neighbor) == go.Empty {
				liberties[neighbor] = true
			}
		}
	}
	return len(liberties)
}

func getNeighbors(board *go.Board, pos go.Position) []go.Position {
	neighbors := make([]go.Position, 0, 4)
	directions := []go.Position{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}
	for _, dir := range directions {
		neighbor := go.Position{pos.X + dir.X, pos.Y + dir.Y}
		if neighbor.X >= 0 && neighbor.X < board.Size &&
			neighbor.Y >= 0 && neighbor.Y < board.Size {
			neighbors = append(neighbors, neighbor)
		}
	}
	return neighbors
}

type GameAnalyzer struct {
	evaluator *BoardEvaluator
}

func NewGameAnalyzer() *GameAnalyzer {
	return &GameAnalyzer{
		evaluator: NewBoardEvaluator(),
	}
}

func (a *GameAnalyzer) AnalyzeGame(board *go.Board) *GameAnalysis {
	analysis := &GameAnalysis{
		Moves:         make([]MoveAnalysis, len(board.History)),
		Blunders:      make([]int, 0),
		BadMoves:      make([]int, 0),
		GoodMoves:     make([]int, 0),
		Recommendations: make([]string, 0),
	}

	testBoard := go.NewBoard(board.Size)
	prevScore := 0.0

	for i, move := range board.History {
		beforeScore := a.evaluator.Evaluate(testBoard, move.Stone)
		
		testBoard.Play(move.Position, move.Stone)
		
		afterScore := a.evaluator.Evaluate(testBoard, move.Stone)
		scoreDiff := afterScore - beforeScore

		var quality MoveQuality
		var comment string

		switch {
		case scoreDiff > 5:
			quality = Excellent
			comment = "好手！"
			analysis.GoodMoves = append(analysis.GoodMoves, i+1)
		case scoreDiff > 2:
			quality = Good
			comment = "不错的一手"
		case scoreDiff > -1:
			quality = Okay
			comment = "普通"
		case scoreDiff > -3:
			quality = Doubtful
			comment = "有疑问的一手"
		case scoreDiff > -6:
			quality = Bad
			comment = "恶手"
			analysis.BadMoves = append(analysis.BadMoves, i+1)
		default:
			quality = Blunder
			comment = "严重错误！"
			analysis.Blunders = append(analysis.Blunders, i+1)
		}

		suggestions := a.findBetterMoves(testBoard, move.Stone, move.Position)

		analysis.Moves[i] = MoveAnalysis{
			MoveNumber:  i + 1,
			Position:    move.Position,
			Stone:       move.Stone,
			Quality:     quality,
			Score:       scoreDiff,
			Comment:     comment,
			Suggestions: suggestions,
		}

		prevScore = afterScore
	}

	analysis.OverallScore = a.calculateOverallScore(analysis.Moves)
	analysis.BlackScore, analysis.WhiteScore = a.calculatePlayerScores(analysis.Moves)
	analysis.Recommendations = a.generateRecommendations(analysis)

	return analysis
}

func (a *GameAnalyzer) findBetterMoves(board *go.Board, player go.Stone, actualMove go.Position) []go.Position {
	suggestions := make([]go.Position, 0)
	bestScore := math.Inf(-1)
	bestMoves := make([]go.Position, 0, 3)

	for y := 0; y < board.Size; y++ {
		for x := 0; x < board.Size; x++ {
			pos := go.Position{X: x, Y: y}
			if board.GetStone(pos) != go.Empty {
				continue
			}

			if pos.X == actualMove.X && pos.Y == actualMove.Y {
				continue
			}

			testBoard := board.Clone()
			_, err := testBoard.Play(pos, player)
			if err != nil {
				continue
			}

			score := a.evaluator.Evaluate(testBoard, player)
			if score > bestScore {
				bestScore = score
				bestMoves = []go.Position{pos}
			} else if math.Abs(score-bestScore) < 1.0 {
				bestMoves = append(bestMoves, pos)
			}
		}
	}

	for i := 0; i < len(bestMoves) && i < 3; i++ {
		suggestions = append(suggestions, bestMoves[i])
	}

	return suggestions
}

func (a *GameAnalyzer) calculateOverallScore(moves []MoveAnalysis) float64 {
	if len(moves) == 0 {
		return 0
	}

	total := 0.0
	for _, move := range moves {
		weights := map[MoveQuality]float64{
			Excellent: 100,
			Good:      80,
			Okay:      60,
			Doubtful:  40,
			Bad:       20,
			VeryBad:   10,
			Blunder:   0,
		}
		total += weights[move.Quality]
	}

	return total / float64(len(moves))
}

func (a *GameAnalyzer) calculatePlayerScores(moves []MoveAnalysis) (float64, float64) {
	blackTotal := 0.0
	blackCount := 0
	whiteTotal := 0.0
	whiteCount := 0

	for _, move := range moves {
		score := 10.0 - float64(move.Quality)*2.0
		if move.Stone == go.Black {
			blackTotal += score
			blackCount++
		} else {
			whiteTotal += score
			whiteCount++
		}
	}

	blackScore := 0.0
	whiteScore := 0.0
	if blackCount > 0 {
		blackScore = blackTotal / float64(blackCount)
	}
	if whiteCount > 0 {
		whiteScore = whiteTotal / float64(whiteCount)
	}

	return blackScore, whiteScore
}

func (a *GameAnalyzer) generateRecommendations(analysis *GameAnalysis) []string {
	recommendations := make([]string, 0)

	if len(analysis.Blunders) > 3 {
		recommendations = append(recommendations, 
			"本局出现多次严重错误，建议关注基础死活和连接问题")
	}

	if len(analysis.BadMoves) > 5 {
		recommendations = append(recommendations,
			"恶手较多，建议每步多考虑几个候选点")
	}

	if analysis.OverallScore < 40 {
		recommendations = append(recommendations,
			"建议多做死活题练习，提高计算能力")
	}

	if analysis.BlackScore < analysis.WhiteScore-2 {
		recommendations = append(recommendations,
			"黑方本局发挥不佳，建议复盘时重点关注黑方的问题手")
	} else if analysis.WhiteScore < analysis.BlackScore-2 {
		recommendations = append(recommendations,
			"白方本局发挥不佳，建议复盘时重点关注白方的问题手")
	}

	if len(recommendations) == 0 {
		recommendations = append(recommendations,
			"本局质量不错，继续保持！")
	}

	return recommendations
}

func (q MoveQuality) String() string {
	switch q {
	case Excellent:
		return "特级"
	case Good:
		return "优秀"
	case Okay:
		return "普通"
	case Doubtful:
		return "疑问"
	case Bad:
		return "恶手"
	case VeryBad:
		return "大恶手"
	case Blunder:
		return "严重错误"
	default:
		return "未知"
	}
}

func (q MoveQuality) Color() string {
	switch q {
	case Excellent:
		return "#28a745"
	case Good:
		return "#20c997"
	case Okay:
		return "#6c757d"
	case Doubtful:
		return "#ffc107"
	case Bad:
		return "#fd7e14"
	case VeryBad:
		return "#dc3545"
	case Blunder:
		return "#721c24"
	default:
		return "#6c757d"
	}
}
