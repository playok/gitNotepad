package daemon

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/user/gitnotepad/internal/config"

	rotatelogs "github.com/lestrrat-go/file-rotatelogs"
)

// Daemon manages the daemon lifecycle
type Daemon struct {
	cfg        *config.Config
	configPath string
}

// New creates a new Daemon instance
func New(cfg *config.Config, configPath string) *Daemon {
	return &Daemon{
		cfg:        cfg,
		configPath: configPath,
	}
}

// Restart restarts the daemon
func (d *Daemon) Restart() error {
	if d.IsRunning() {
		if err := d.Stop(); err != nil {
			return err
		}
		time.Sleep(500 * time.Millisecond)
	}
	return d.Start()
}

// Status returns the daemon status
func (d *Daemon) Status() {
	if d.IsRunning() {
		pid, _ := d.GetPID()
		fmt.Printf("Daemon is running (PID: %d)\n", pid)
	} else {
		fmt.Println("Daemon is not running")
	}
}

// IsRunning checks if the daemon is running
func (d *Daemon) IsRunning() bool {
	pid, err := d.GetPID()
	if err != nil {
		return false
	}
	return d.processExists(pid)
}

// GetPID reads the PID from file
func (d *Daemon) GetPID() (int, error) {
	data, err := os.ReadFile(d.cfg.Daemon.PidFile)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(string(data))
}

// WritePID writes the PID to file
func (d *Daemon) WritePID(pid int) error {
	dir := filepath.Dir(d.cfg.Daemon.PidFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(d.cfg.Daemon.PidFile, []byte(strconv.Itoa(pid)), 0644)
}

// RemovePID removes the PID file
func (d *Daemon) RemovePID() error {
	return os.Remove(d.cfg.Daemon.PidFile)
}

// SetupLogging configures logging based on config
func (d *Daemon) SetupLogging() {
	if !d.cfg.Logging.File {
		return
	}

	// Create log directory
	if err := os.MkdirAll(d.cfg.Logging.Dir, 0755); err != nil {
		fmt.Printf("Failed to create log directory: %v\n", err)
		return
	}

	// Configure file-rotatelogs for daily rotation
	logPath := filepath.Join(d.cfg.Logging.Dir, "gitnotepad.log")
	logFile, err := rotatelogs.New(
		logPath+".%Y-%m-%d",                                                     // rotated file pattern
		rotatelogs.WithLinkName(logPath),                                        // symlink to current log
		rotatelogs.WithMaxAge(time.Duration(d.cfg.Logging.MaxAge)*24*time.Hour), // max retention
		rotatelogs.WithRotationTime(24*time.Hour),                               // rotate daily
	)
	if err != nil {
		fmt.Printf("Failed to create log rotator: %v\n", err)
		return
	}

	// Set log output to both file and stdout
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(multiWriter)
}

// SetupLoggingFileOnly configures logging to file only (for daemon mode)
func (d *Daemon) SetupLoggingFileOnly() {
	// Create log directory
	if err := os.MkdirAll(d.cfg.Logging.Dir, 0755); err != nil {
		return
	}

	// Configure file-rotatelogs for daily rotation
	logPath := filepath.Join(d.cfg.Logging.Dir, "gitnotepad.log")
	logFile, err := rotatelogs.New(
		logPath+".%Y-%m-%d",                                                     // rotated file pattern
		rotatelogs.WithLinkName(logPath),                                        // symlink to current log
		rotatelogs.WithMaxAge(time.Duration(d.cfg.Logging.MaxAge)*24*time.Hour), // max retention
		rotatelogs.WithRotationTime(24*time.Hour),                               // rotate daily
	)
	if err != nil {
		return
	}

	// Redirect log output to file only
	log.SetOutput(logFile)
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}
