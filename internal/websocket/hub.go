package websocket

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// Message types for WebSocket communication
const (
	MsgTypeNoteCreated  = "note_created"
	MsgTypeNoteUpdated  = "note_updated"
	MsgTypeNoteDeleted  = "note_deleted"
	MsgTypeNotesRefresh = "notes_refresh"
)

// Message represents a WebSocket message
type Message struct {
	Type   string      `json:"type"`
	NoteID string      `json:"noteId,omitempty"`
	Data   interface{} `json:"data,omitempty"`
}

// Client represents a connected WebSocket client
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	username string
	send     chan Message
}

// Hub manages all WebSocket connections
type Hub struct {
	// Registered clients grouped by username
	clients map[string]map[*Client]bool

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Broadcast messages to specific user's clients
	broadcast chan userMessage

	mu sync.RWMutex
}

type userMessage struct {
	username string
	message  Message
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for now
	},
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan userMessage),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.clients[client.username] == nil {
				h.clients[client.username] = make(map[*Client]bool)
			}
			h.clients[client.username][client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.username]; ok {
				if _, ok := clients[client]; ok {
					delete(clients, client)
					close(client.send)
					if len(clients) == 0 {
						delete(h.clients, client.username)
					}
				}
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			if clients, ok := h.clients[msg.username]; ok {
				for client := range clients {
					select {
					case client.send <- msg.message:
					default:
						// Client's send buffer is full, skip
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToUser sends a message to all clients of a specific user
func (h *Hub) BroadcastToUser(username string, msg Message) {
	h.broadcast <- userMessage{
		username: username,
		message:  msg,
	}
}

// HandleWebSocket handles WebSocket upgrade and connection
func (h *Hub) HandleWebSocket(c *gin.Context) {
	// Get username from context (set by auth middleware)
	username, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &Client{
		hub:      h,
		conn:     conn,
		username: username.(string),
		send:     make(chan Message, 256),
	}

	h.register <- client

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// writePump sends messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()

	for message := range c.send {
		if err := c.conn.WriteJSON(message); err != nil {
			return
		}
	}
}

// readPump reads messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Currently we don't process incoming messages from clients
		// This is mainly for detecting disconnection
	}
}
