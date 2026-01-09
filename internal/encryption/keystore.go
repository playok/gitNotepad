package encryption

import (
	"sync"
	"time"
)

// KeyStore stores encryption keys in memory, keyed by session token
type KeyStore struct {
	keys  map[string][]byte
	mutex sync.RWMutex
}

// Global key store instance
var globalKeyStore = &KeyStore{
	keys: make(map[string][]byte),
}

// GetKeyStore returns the global key store
func GetKeyStore() *KeyStore {
	return globalKeyStore
}

// Store stores an encryption key for a session
func (ks *KeyStore) Store(sessionToken string, key []byte) {
	ks.mutex.Lock()
	defer ks.mutex.Unlock()
	ks.keys[sessionToken] = key
}

// Get retrieves an encryption key for a session
func (ks *KeyStore) Get(sessionToken string) ([]byte, bool) {
	ks.mutex.RLock()
	defer ks.mutex.RUnlock()
	key, ok := ks.keys[sessionToken]
	return key, ok
}

// Delete removes an encryption key for a session
func (ks *KeyStore) Delete(sessionToken string) {
	ks.mutex.Lock()
	defer ks.mutex.Unlock()
	delete(ks.keys, sessionToken)
}

// Cleanup removes expired keys (should be called periodically)
func (ks *KeyStore) Cleanup(validTokens map[string]bool) {
	ks.mutex.Lock()
	defer ks.mutex.Unlock()
	for token := range ks.keys {
		if !validTokens[token] {
			delete(ks.keys, token)
		}
	}
}

// StartCleanupRoutine starts a goroutine that periodically cleans up expired keys
func (ks *KeyStore) StartCleanupRoutine(interval time.Duration, getValidTokens func() map[string]bool) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			validTokens := getValidTokens()
			ks.Cleanup(validTokens)
		}
	}()
}
