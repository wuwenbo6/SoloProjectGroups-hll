package auth

import (
	"net/http"
	"strings"

	"github.com/codeserver-manager/internal/config"
	"github.com/codeserver-manager/internal/user"
	"github.com/gin-gonic/gin"
)

func AdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-Admin-Token")
		if token == "" {
			token = c.Query("admin_token")
		}

		if token == "" || token != config.AppConfig.Auth.AdminToken {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid admin token"})
			c.Abort()
			return
		}

		c.Next()
	}
}

func UserAuth(userStore *user.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-User-Token")
		if token == "" {
			token = c.Query("token")
		}

		if token == "" {
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user token"})
			c.Abort()
			return
		}

		u, err := userStore.GetByToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("user", u)
		c.Set("user_id", u.ID)
		c.Next()
	}
}

func GetCurrentUser(c *gin.Context) *user.User {
	u, exists := c.Get("user")
	if !exists {
		return nil
	}
	return u.(*user.User)
}
