package sgf

import (
	"bufio"
	"fmt"
	"go-game/internal/go"
	"strings"
)

type GameInfo struct {
	Size         int
	BlackPlayer  string
	WhitePlayer  string
	BlackRank    string
	WhiteRank    string
	Komi         float64
	Result       string
	Date         string
	Event        string
	GameComment  string
}

type SGFNode struct {
	Properties map[string][]string
	Move       *go.Move
	Comment    string
}

type SGFGame struct {
	Info  GameInfo
	Nodes []SGFNode
	Moves []go.Move
}

func NewSGFGame() *SGFGame {
	return &SGFGame{
		Info: GameInfo{
			Size: 19,
			Komi: 6.5,
		},
		Nodes: make([]SGFNode, 0),
		Moves: make([]go.Move, 0),
	}
}

func ParseSGF(content string) (*SGFGame, error) {
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, "(") || !strings.HasSuffix(content, ")") {
		return nil, fmt.Errorf("invalid SGF format")
	}

	game := NewSGFGame()
	content = content[1 : len(content)-1]

	nodes := splitNodes(content)
	if len(nodes) == 0 {
		return nil, fmt.Errorf("no nodes found")
	}

	for i, nodeStr := range nodes {
		node, err := parseNode(nodeStr)
		if err != nil {
			return nil, err
		}

		if i == 0 {
			parseGameInfo(node, &game.Info)
		}

		if node.Move != nil {
			node.Move.Number = len(game.Moves) + 1
			game.Moves = append(game.Moves, *node.Move)
		}

		game.Nodes = append(game.Nodes, node)
	}

	return game, nil
}

func splitNodes(content string) []string {
	var nodes []string
	var current strings.Builder
	i := 0

	for i < len(content) {
		if content[i] == ';' {
			if current.Len() > 0 {
				nodes = append(nodes, current.String())
				current.Reset()
			}
		} else if content[i] == '(' || content[i] == ')' {
			break
		} else {
			current.WriteByte(content[i])
		}
		i++
	}

	if current.Len() > 0 {
		nodes = append(nodes, current.String())
	}

	return nodes
}

func parseNode(nodeStr string) (SGFNode, error) {
	node := SGFNode{
		Properties: make(map[string][]string),
	}

	nodeStr = strings.TrimSpace(nodeStr)
	if nodeStr == "" {
		return node, nil
	}

	i := 0
	for i < len(nodeStr) {
		for i < len(nodeStr) && !isLetter(nodeStr[i]) {
			i++
		}
		if i >= len(nodeStr) {
			break
		}

		keyStart := i
		for i < len(nodeStr) && isLetter(nodeStr[i]) {
			i++
		}
		key := nodeStr[keyStart:i]

		if i >= len(nodeStr) || nodeStr[i] != '[' {
			continue
		}

		i++
		valueStart := i
		bracketCount := 1

		for i < len(nodeStr) && bracketCount > 0 {
			if nodeStr[i] == '\\' && i+1 < len(nodeStr) {
				i += 2
				continue
			}
			if nodeStr[i] == '[' {
				bracketCount++
			} else if nodeStr[i] == ']' {
				bracketCount--
			}
			if bracketCount > 0 {
				i++
			}
		}

		value := nodeStr[valueStart:i]
		value = strings.ReplaceAll(value, "\\]", "]")
		node.Properties[key] = append(node.Properties[key], value)

		if key == "B" || key == "W" {
			stone := go.Black
			if key == "W" {
				stone = go.White
			}
			pos := parsePosition(value, 19)
			node.Move = &go.Move{
				Position: pos,
				Stone:    stone,
			}
		}

		if key == "C" {
			node.Comment = value
		}

		if i < len(nodeStr) {
			i++
		}
	}

	return node, nil
}

func parsePosition(s string, size int) go.Position {
	if len(s) < 2 {
		return go.Position{X: -1, Y: -1}
	}
	x := int(s[0] - 'a')
	y := int(s[1] - 'a')
	if x >= size || y >= size {
		return go.Position{X: -1, Y: -1}
	}
	return go.Position{X: x, Y: y}
}

func parseGameInfo(node SGFNode, info *GameInfo) {
	if sz, ok := node.Properties["SZ"]; ok && len(sz) > 0 {
		fmt.Sscanf(sz[0], "%d", &info.Size)
	}
	if pb, ok := node.Properties["PB"]; ok && len(pb) > 0 {
		info.BlackPlayer = pb[0]
	}
	if pw, ok := node.Properties["PW"]; ok && len(pw) > 0 {
		info.WhitePlayer = pw[0]
	}
	if br, ok := node.Properties["BR"]; ok && len(br) > 0 {
		info.BlackRank = br[0]
	}
	if wr, ok := node.Properties["WR"]; ok && len(wr) > 0 {
		info.WhiteRank = wr[0]
	}
	if km, ok := node.Properties["KM"]; ok && len(km) > 0 {
		fmt.Sscanf(km[0], "%f", &info.Komi)
	}
	if re, ok := node.Properties["RE"]; ok && len(re) > 0 {
		info.Result = re[0]
	}
	if dt, ok := node.Properties["DT"]; ok && len(dt) > 0 {
		info.Date = dt[0]
	}
	if ev, ok := node.Properties["EV"]; ok && len(ev) > 0 {
		info.Event = ev[0]
	}
}

func isLetter(c byte) bool {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
}

func (g *SGFGame) GenerateSGF() string {
	var sb strings.Builder
	sb.WriteString("(")

	sb.WriteString(";")
	sb.WriteString(fmt.Sprintf("SZ[%d]", g.Info.Size))
	if g.Info.BlackPlayer != "" {
		sb.WriteString(fmt.Sprintf("PB[%s]", g.Info.BlackPlayer))
	}
	if g.Info.WhitePlayer != "" {
		sb.WriteString(fmt.Sprintf("PW[%s]", g.Info.WhitePlayer))
	}
	if g.Info.Komi > 0 {
		sb.WriteString(fmt.Sprintf("KM[%.1f]", g.Info.Komi))
	}
	if g.Info.Result != "" {
		sb.WriteString(fmt.Sprintf("RE[%s]", g.Info.Result))
	}
	if g.Info.Date != "" {
		sb.WriteString(fmt.Sprintf("DT[%s]", g.Info.Date))
	}
	if g.Info.Event != "" {
		sb.WriteString(fmt.Sprintf("EV[%s]", g.Info.Event))
	}
	sb.WriteString("\n")

	for i, move := range g.Moves {
		stone := "B"
		if move.Stone == go.White {
			stone = "W"
		}
		pos := fmt.Sprintf("%c%c", 'a'+move.Position.X, 'a'+move.Position.Y)
		sb.WriteString(fmt.Sprintf(";%s[%s]", stone, pos))

		if i < len(g.Nodes) && g.Nodes[i].Comment != "" {
			sb.WriteString(fmt.Sprintf("C[%s]", g.Nodes[i].Comment))
		}

		if (i+1)%10 == 0 {
			sb.WriteString("\n")
		}
	}

	sb.WriteString(")")
	return sb.String()
}

func (g *SGFGame) ApplyToBoard(board *go.Board) {
	for _, move := range g.Moves {
		board.Play(move.Position, move.Stone)
	}
}

func BoardToSGF(board *go.Board, info GameInfo) string {
	game := NewSGFGame()
	game.Info = info
	game.Moves = make([]go.Move, len(board.History))
	copy(game.Moves, board.History)
	return game.GenerateSGF()
}

func ReadSGF(filename string) (*SGFGame, error) {
	return nil, nil
}

func WriteSGF(filename string, game *SGFGame) error {
	return nil
}

func parseSGFValue(reader *bufio.Reader) (string, error) {
	var value strings.Builder
	bracketCount := 1

	for bracketCount > 0 {
		b, err := reader.ReadByte()
		if err != nil {
			return value.String(), err
		}

		if b == '\\' {
			next, err := reader.ReadByte()
			if err != nil {
				return value.String(), err
			}
			value.WriteByte(next)
		} else if b == '[' {
			bracketCount++
			value.WriteByte(b)
		} else if b == ']' {
			bracketCount--
			if bracketCount > 0 {
				value.WriteByte(b)
			}
		} else {
			value.WriteByte(b)
		}
	}

	return value.String(), nil
}
