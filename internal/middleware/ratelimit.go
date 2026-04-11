package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimitEntry struct {
	attempts  int
	resetAt   time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	entries  map[string]*rateLimitEntry
	maxAttempts int
	window      time.Duration
}

func NewRateLimiter(maxAttempts int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		entries:     make(map[string]*rateLimitEntry),
		maxAttempts: maxAttempts,
		window:      window,
	}
	go rl.cleanup()
	return rl
}

// Middleware returns a gin middleware that rate limits by client IP
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		rl.mu.Lock()
		entry, exists := rl.entries[ip]
		now := time.Now()

		if !exists || now.After(entry.resetAt) {
			rl.entries[ip] = &rateLimitEntry{
				attempts: 1,
				resetAt:  now.Add(rl.window),
			}
			rl.mu.Unlock()
			c.Next()
			return
		}

		entry.attempts++
		if entry.attempts > rl.maxAttempts {
			remaining := int(time.Until(entry.resetAt).Seconds())
			rl.mu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many login attempts. Please try again later.",
				"retry_after": remaining,
			})
			c.Abort()
			return
		}

		rl.mu.Unlock()
		c.Next()
	}
}

// cleanup removes expired entries every 5 minutes
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for ip, entry := range rl.entries {
			if now.After(entry.resetAt) {
				delete(rl.entries, ip)
			}
		}
		rl.mu.Unlock()
	}
}
