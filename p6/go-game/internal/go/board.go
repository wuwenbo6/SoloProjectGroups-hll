package go

import (
	"errors"
	"fmt"
	"strings"
)

type Stone int

const (
	Empty Stone = iota
	Black
	White
)

type Position struct {
	X, Y int
}

type Move struct {
	Position Position
	Stone    Stone
	Number   int
}

type Board struct {
	Size   int
	Grid   [][]Stone
	History []Move
	MoveNum int
	KoPos  *Position
}

func NewBoard(size int) *Board {
	if size < 9 || size > 19 {
		size = 19
	}
	grid := make([][]Stone, size)
	for i := range grid {
		grid[i] = make([]Stone, size)
	}
	return &Board{
		Size:   size,
		Grid:   grid,
		History: make([]Move, 0),
	}
}

func (b *Board) Clone() *Board {
	newBoard := NewBoard(b.Size)
	for i := 0; i < b.Size; i++ {
		copy(newBoard.Grid[i], b.Grid[i])
	}
	newBoard.History = make([]Move, len(b.History))
	copy(newBoard.History, b.History)
	newBoard.MoveNum = b.MoveNum
	if b.KoPos != nil {
		newBoard.KoPos = &Position{b.KoPos.X, b.KoPos.Y}
	}
	return newBoard
}

func (b *Board) isValidPos(pos Position) bool {
	return pos.X >= 0 && pos.X < b.Size && pos.Y >= 0 && pos.Y < b.Size
}

func (b *Board) GetStone(pos Position) Stone {
	if !b.isValidPos(pos) {
		return Empty
	}
	return b.Grid[pos.Y][pos.X]
}

func (b *Board) SetStone(pos Position, stone Stone) {
	if b.isValidPos(pos) {
		b.Grid[pos.Y][pos.X] = stone
	}
}

func (b *Board) getNeighbors(pos Position) []Position {
	neighbors := make([]Position, 0, 4)
	directions := []Position{{-1, 0}, {1, 0}, {0, -1}, {0, 1}}
	for _, dir := range directions {
		neighbor := Position{pos.X + dir.X, pos.Y + dir.Y}
		if b.isValidPos(neighbor) {
			neighbors = append(neighbors, neighbor)
		}
	}
	return neighbors
}

func (b *Board) getGroup(pos Position) []Position {
	stone := b.GetStone(pos)
	if stone == Empty {
		return nil
	}

	visited := make(map[Position]bool)
	group := make([]Position, 0)
	queue := []Position{pos}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if visited[current] {
			continue
		}
		visited[current] = true
		group = append(group, current)

		for _, neighbor := range b.getNeighbors(current) {
			if b.GetStone(neighbor) == stone && !visited[neighbor] {
				queue = append(queue, neighbor)
			}
		}
	}

	return group
}

func (b *Board) countLiberties(group []Position) int {
	liberties := make(map[Position]bool)
	for _, pos := range group {
		for _, neighbor := range b.getNeighbors(pos) {
			if b.GetStone(neighbor) == Empty {
				liberties[neighbor] = true
			}
		}
	}
	return len(liberties)
}

func (b *Board) removeGroup(group []Position) int {
	for _, pos := range group {
		b.SetStone(pos, Empty)
	}
	return len(group)
}

func (b *Board) Play(pos Position, stone Stone) (captured int, err error) {
	if !b.isValidPos(pos) {
		return 0, errors.New("invalid position")
	}
	if b.GetStone(pos) != Empty {
		return 0, errors.New("position already occupied")
	}
	if b.KoPos != nil && pos.X == b.KoPos.X && pos.Y == b.KoPos.Y {
		return 0, errors.New("ko rule violation")
	}

	opponent := Black
	if stone == Black {
		opponent = White
	}

	b.SetStone(pos, stone)
	totalCaptured := 0
	var capturedGroup []Position

	for _, neighbor := range b.getNeighbors(pos) {
		if b.GetStone(neighbor) == opponent {
			group := b.getGroup(neighbor)
			if b.countLiberties(group) == 0 {
				totalCaptured += b.removeGroup(group)
				capturedGroup = group
			}
		}
	}

	ownGroup := b.getGroup(pos)
	if b.countLiberties(ownGroup) == 0 {
		b.SetStone(pos, Empty)
		return 0, errors.New("suicide move")
	}

	b.KoPos = nil
	if totalCaptured == 1 && len(ownGroup) == 1 && b.countLiberties(ownGroup) == 1 {
		b.KoPos = &capturedGroup[0]
	}

	b.History = append(b.History, Move{
		Position: pos,
		Stone:    stone,
		Number:   b.MoveNum + 1,
	})
	b.MoveNum++

	return totalCaptured, nil
}

func (b *Board) Undo() bool {
	if len(b.History) == 0 {
		return false
	}

	newBoard := NewBoard(b.Size)
	oldHistory := b.History[:len(b.History)-1]
	
	for _, move := range oldHistory {
		newBoard.Play(move.Position, move.Stone)
	}

	b.Grid = newBoard.Grid
	b.History = oldHistory
	b.MoveNum = newBoard.MoveNum
	b.KoPos = newBoard.KoPos

	return true
}

func (b *Board) IsEye(pos Position, player Stone) bool {
	if b.GetStone(pos) != Empty {
		return false
	}

	for _, neighbor := range b.getNeighbors(pos) {
		if b.GetStone(neighbor) != player {
			return false
		}
	}

	diagonals := []Position{
		{pos.X - 1, pos.Y - 1},
		{pos.X + 1, pos.Y - 1},
		{pos.X - 1, pos.Y + 1},
		{pos.X + 1, pos.Y + 1},
	}

	enemyDiagonals := 0
	for _, diag := range diagonals {
		if b.isValidPos(diag) && b.GetStone(diag) != player && b.GetStone(diag) != Empty {
			enemyDiagonals++
		}
	}

	return enemyDiagonals <= 1
}

func (b *Board) GetTerritory() (blackTerritory, whiteTerritory int) {
	visited := make(map[Position]bool)

	for y := 0; y < b.Size; y++ {
		for x := 0; x < b.Size; x++ {
			pos := Position{x, y}
			if b.GetStone(pos) != Empty || visited[pos] {
				continue
			}

			region := make([]Position, 0)
			queue := []Position{pos}
			borderingBlack := false
			borderingWhite := false

			for len(queue) > 0 {
				current := queue[0]
				queue = queue[1:]

				if visited[current] {
					continue
				}
				visited[current] = true
				region = append(region, current)

				for _, neighbor := range b.getNeighbors(current) {
					stone := b.GetStone(neighbor)
					if stone == Empty && !visited[neighbor] {
						queue = append(queue, neighbor)
					} else if stone == Black {
						borderingBlack = true
					} else if stone == White {
						borderingWhite = true
					}
				}
			}

			if borderingBlack && !borderingWhite {
				blackTerritory += len(region)
			} else if borderingWhite && !borderingBlack {
				whiteTerritory += len(region)
			}
		}
	}

	return
}

func (b *Board) String() string {
	var sb strings.Builder
	sb.WriteString("  ")
	for x := 0; x < b.Size; x++ {
		sb.WriteString(fmt.Sprintf("%c", 'A'+x))
	}
	sb.WriteString("\n")

	for y := 0; y < b.Size; y++ {
		sb.WriteString(fmt.Sprintf("%2d", y+1))
		for x := 0; x < b.Size; x++ {
			switch b.Grid[y][x] {
			case Black:
				sb.WriteString("●")
			case White:
				sb.WriteString("○")
			case Empty:
				sb.WriteString("+")
			}
		}
		sb.WriteString("\n")
	}
	return sb.String()
}
