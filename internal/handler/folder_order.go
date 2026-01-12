package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/database"
	"github.com/user/gitnotepad/internal/middleware"
)

type FolderOrderHandler struct {
	db *database.DB
}

func NewFolderOrderHandler(db *database.DB) *FolderOrderHandler {
	return &FolderOrderHandler{db: db}
}

// FolderOrderMap represents the folder order for all parent paths
// Key: parent_path, Value: array of folder names in order
type FolderOrderMap map[string][]string

// Get returns folder order for the current user
func (h *FolderOrderHandler) Get(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		// Return empty map for unauthenticated users
		c.JSON(http.StatusOK, make(FolderOrderMap))
		return
	}

	rows, err := h.db.Query(
		"SELECT parent_path, order_json FROM folder_order WHERE user_id = ?",
		user.ID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch folder order"})
		return
	}
	defer rows.Close()

	result := make(FolderOrderMap)
	for rows.Next() {
		var parentPath, orderJSON string
		if err := rows.Scan(&parentPath, &orderJSON); err != nil {
			continue
		}
		var order []string
		if err := json.Unmarshal([]byte(orderJSON), &order); err != nil {
			continue
		}
		result[parentPath] = order
	}

	c.JSON(http.StatusOK, result)
}

// SetFolderOrderRequest represents the request to set folder order
type SetFolderOrderRequest struct {
	ParentPath string   `json:"parent_path"`
	Order      []string `json:"order" binding:"required"`
}

// Set creates or updates folder order for a specific parent path
func (h *FolderOrderHandler) Set(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req SetFolderOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	orderJSON, err := json.Marshal(req.Order)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to serialize order"})
		return
	}

	// Upsert folder order
	_, err = h.db.Exec(
		`INSERT INTO folder_order (user_id, parent_path, order_json, updated_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(user_id, parent_path) DO UPDATE SET order_json = excluded.order_json, updated_at = excluded.updated_at`,
		user.ID, req.ParentPath, string(orderJSON), time.Now(),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save folder order"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order saved"})
}

// SaveAllRequest represents the request to save all folder orders at once
type SaveAllRequest struct {
	Order FolderOrderMap `json:"order" binding:"required"`
}

// SaveAll saves all folder orders at once
func (h *FolderOrderHandler) SaveAll(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req SaveAllRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Use transaction for atomic update
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}

	// Delete existing orders for this user
	_, err = tx.Exec("DELETE FROM folder_order WHERE user_id = ?", user.ID)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear existing orders"})
		return
	}

	// Insert new orders
	for parentPath, order := range req.Order {
		orderJSON, err := json.Marshal(order)
		if err != nil {
			continue
		}
		_, err = tx.Exec(
			"INSERT INTO folder_order (user_id, parent_path, order_json, updated_at) VALUES (?, ?, ?, ?)",
			user.ID, parentPath, string(orderJSON), time.Now(),
		)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save order"})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All orders saved"})
}

// Delete removes folder order for a specific parent path
func (h *FolderOrderHandler) Delete(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	parentPath := c.Query("parent_path")

	_, err := h.db.Exec(
		"DELETE FROM folder_order WHERE user_id = ? AND parent_path = ?",
		user.ID, parentPath,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder order"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order deleted"})
}
