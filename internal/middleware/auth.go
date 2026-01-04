package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/model"
	"github.com/user/gitnotepad/internal/repository"
)

const (
	SessionCookieName = "gitnotepad_session"
	UserContextKey    = "user"
)

type AuthMiddleware struct {
	userRepo    *repository.UserRepository
	sessionRepo *repository.SessionRepository
}

func NewAuthMiddleware(userRepo *repository.UserRepository, sessionRepo *repository.SessionRepository) *AuthMiddleware {
	return &AuthMiddleware{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
	}
}

// RequireAuth middleware - redirects to login if not authenticated
func (m *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, err := c.Cookie(SessionCookieName)
		if err != nil {
			// Check if it's an API request
			if isAPIRequest(c) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
				c.Abort()
				return
			}
			c.Redirect(http.StatusFound, "/login")
			c.Abort()
			return
		}

		session, err := m.sessionRepo.GetByToken(cookie)
		if err != nil || session == nil || session.IsExpired() {
			// Clear invalid cookie
			c.SetCookie(SessionCookieName, "", -1, "/", "", false, true)
			if isAPIRequest(c) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired"})
				c.Abort()
				return
			}
			c.Redirect(http.StatusFound, "/login")
			c.Abort()
			return
		}

		user, err := m.userRepo.GetByID(session.UserID)
		if err != nil || user == nil {
			c.SetCookie(SessionCookieName, "", -1, "/", "", false, true)
			if isAPIRequest(c) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
				c.Abort()
				return
			}
			c.Redirect(http.StatusFound, "/login")
			c.Abort()
			return
		}

		c.Set(UserContextKey, user)
		c.Next()
	}
}

// RequireAdmin middleware - requires admin privileges
func (m *AuthMiddleware) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
			c.Abort()
			return
		}

		if !user.IsAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetCurrentUser retrieves the current user from context
func GetCurrentUser(c *gin.Context) *model.User {
	user, exists := c.Get(UserContextKey)
	if !exists {
		return nil
	}
	return user.(*model.User)
}

// isAPIRequest checks if the request is an API request
func isAPIRequest(c *gin.Context) bool {
	// Check Accept header or path prefix
	accept := c.GetHeader("Accept")
	if accept == "application/json" {
		return true
	}
	// Check if path starts with /api
	return len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api"
}
