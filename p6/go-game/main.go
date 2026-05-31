package main

import (
	"encoding/json"
	"go-game/internal/ai"
	"go-game/internal/go"
	"go-game/internal/problem"
	"go-game/internal/sgf"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

type Server struct {
	games     map[string]*go.Board
	gamesMu   sync.Mutex
	problems  map[string]*problem.ProblemSession
	problemsMu sync.Mutex
}

func NewServer() *Server {
	return &Server{
		games:    make(map[string]*go.Board),
		problems: make(map[string]*problem.ProblemSession),
	}
}

type PlayMoveRequest struct {
	GameID string `json:"game_id"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Stone  string `json:"stone"`
}

type ProblemMoveRequest struct {
	SessionID string `json:"session_id"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
}

func main() {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.Static("/static", "./static")
	r.LoadHTMLGlob("templates/*")
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	server := NewServer()

	api := r.Group("/api")
	{
		game := api.Group("/game")
		{
			game.POST("/new", server.NewGame)
			game.POST("/play", server.PlayMove)
			game.POST("/undo", server.UndoMove)
			game.GET("/:id", server.GetGame)
			game.GET("/:id/analyze", server.AnalyzeGame)
			game.GET("/:id/sgf", server.ExportSGF)
			game.POST("/import", server.ImportSGF)
		}

		prob := api.Group("/problem")
		{
			prob.GET("/list", server.ListProblems)
			prob.GET("/:id", server.GetProblem)
			prob.POST("/start", server.StartProblem)
			prob.POST("/move", server.ProblemMove)
			prob.POST("/hint", server.GetHint)
			prob.POST("/reset", server.ResetProblem)
			prob.POST("/solution", server.ShowSolution)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}

func (s *Server) NewGame(c *gin.Context) {
	var req struct {
		Size int `json:"size"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Size = 19
	}
	if req.Size < 9 {
		req.Size = 19
	}

	gameID := generateGameID()
	s.gamesMu.Lock()
	s.games[gameID] = go.NewBoard(req.Size)
	s.gamesMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"game_id": gameID,
		"size":    req.Size,
	})
}

func (s *Server) PlayMove(c *gin.Context) {
	var req PlayMoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.gamesMu.Lock()
	board, exists := s.games[req.GameID]
	s.gamesMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	stone := go.Black
	if strings.ToLower(req.Stone) == "white" || strings.ToLower(req.Stone) == "w" {
		stone = go.White
	}

	captured, err := board.Play(go.Position{X: req.X, Y: req.Y}, stone)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"captured":  captured,
		"move_num":  board.MoveNum,
		"board":     boardToJSON(board),
	})
}

func (s *Server) UndoMove(c *gin.Context) {
	var req struct {
		GameID string `json:"game_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.gamesMu.Lock()
	board, exists := s.games[req.GameID]
	s.gamesMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !board.Undo() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no moves to undo"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"move_num": board.MoveNum,
		"board":    boardToJSON(board),
	})
}

func (s *Server) GetGame(c *gin.Context) {
	gameID := c.Param("id")

	s.gamesMu.Lock()
	board, exists := s.games[gameID]
	s.gamesMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"game_id":  gameID,
		"size":     board.Size,
		"move_num": board.MoveNum,
		"board":    boardToJSON(board),
		"history":  board.History,
	})
}

func (s *Server) AnalyzeGame(c *gin.Context) {
	gameID := c.Param("id")

	s.gamesMu.Lock()
	board, exists := s.games[gameID]
	s.gamesMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	analyzer := ai.NewGameAnalyzer()
	analysis := analyzer.AnalyzeGame(board)

	c.JSON(http.StatusOK, analysis)
}

func (s *Server) ExportSGF(c *gin.Context) {
	gameID := c.Param("id")

	s.gamesMu.Lock()
	board, exists := s.games[gameID]
	s.gamesMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	info := sgf.GameInfo{
		Size:        board.Size,
		BlackPlayer: "Black",
		WhitePlayer: "White",
		Komi:        6.5,
	}

	sgfContent := sgf.BoardToSGF(board, info)

	c.Header("Content-Type", "application/x-go-sgf")
	c.Header("Content-Disposition", "attachment; filename=game.sgf")
	c.String(http.StatusOK, sgfContent)
}

func (s *Server) ImportSGF(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded"})
		return
	}
	defer file.Close()

	content := make([]byte, 1024*1024)
	n, err := file.Read(content)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read file"})
		return
	}

	game, err := sgf.ParseSGF(string(content[:n]))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid SGF file: " + err.Error()})
		return
	}

	gameID := generateGameID()
	board := go.NewBoard(game.Info.Size)
	game.ApplyToBoard(board)

	s.gamesMu.Lock()
	s.games[gameID] = board
	s.gamesMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"game_id": gameID,
		"size":    board.Size,
		"info":    game.Info,
		"board":   boardToJSON(board),
	})
}

func (s *Server) ListProblems(c *gin.Context) {
	diff := c.Query("difficulty")
	pType := c.Query("type")

	var problems []*problem.Problem

	if diff != "" {
		d, _ := strconv.Atoi(diff)
		problems = problem.GetProblemsByDifficulty(problem.Difficulty(d))
	} else if pType != "" {
		t, _ := strconv.Atoi(pType)
		problems = problem.GetProblemsByType(problem.ProblemType(t))
	} else {
		problems = problem.GetAllProblems()
	}

	result := make([]gin.H, len(problems))
	for i, p := range problems {
		result[i] = gin.H{
			"id":         p.ID,
			"name":       p.Name,
			"difficulty": p.Difficulty.String(),
			"type":       p.Type.String(),
			"hint":       p.Hint,
			"tags":       p.Tags,
		}
	}

	c.JSON(http.StatusOK, result)
}

func (s *Server) GetProblem(c *gin.Context) {
	id := c.Param("id")
	p := problem.GetProblemByID(id)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         p.ID,
		"name":       p.Name,
		"difficulty": p.Difficulty.String(),
		"type":       p.Type.String(),
		"board_size": p.BoardSize,
		"to_play":    p.ToPlay,
		"hint":       p.Hint,
		"tags":       p.Tags,
	})
}

func (s *Server) StartProblem(c *gin.Context) {
	var req struct {
		ProblemID string `json:"problem_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	p := problem.GetProblemByID(req.ProblemID)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	sessionID := "prob_" + generateGameID()
	session := problem.NewProblemSession(p)

	s.problemsMu.Lock()
	s.problems[sessionID] = session
	s.problemsMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"session_id": sessionID,
		"problem_id": p.ID,
		"name":       p.Name,
		"to_play":    p.ToPlay,
		"board":      boardToJSON(session.Board),
	})
}

func (s *Server) ProblemMove(c *gin.Context) {
	var req ProblemMoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.problemsMu.Lock()
	session, exists := s.problems[req.SessionID]
	s.problemsMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	success, message := session.MakeMove(go.Position{X: req.X, Y: req.Y})

	c.JSON(http.StatusOK, gin.H{
		"success":    success,
		"message":    message,
		"is_complete": session.IsComplete,
		"is_success":  session.IsSuccess,
		"board":       boardToJSON(session.Board),
	})
}

func (s *Server) GetHint(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.problemsMu.Lock()
	session, exists := s.problems[req.SessionID]
	s.problemsMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	hint := session.GetHint()

	c.JSON(http.StatusOK, gin.H{
		"hint": hint,
	})
}

func (s *Server) ResetProblem(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.problemsMu.Lock()
	session, exists := s.problems[req.SessionID]
	s.problemsMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	session.Reset()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"board":   boardToJSON(session.Board),
	})
}

func (s *Server) ShowSolution(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.problemsMu.Lock()
	session, exists := s.problems[req.SessionID]
	s.problemsMu.Unlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	session.ShowSolution()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"board":   boardToJSON(session.Board),
	})
}

func boardToJSON(board *go.Board) []gin.H {
	result := make([]gin.H, 0)
	for y := 0; y < board.Size; y++ {
		for x := 0; x < board.Size; x++ {
			stone := board.GetStone(go.Position{X: x, Y: y})
			if stone != go.Empty {
				result = append(result, gin.H{
					"x":     x,
					"y":     y,
					"stone": stone,
				})
			}
		}
	}
	return result
}

func generateGameID() string {
	return "game_" + strconv.FormatInt(int64(len(os.Getenv("RANDOM"))), 10) + "_" + strconv.Itoa(len(os.Environ()))
}

func init() {
	_ = json.Marshal
}
