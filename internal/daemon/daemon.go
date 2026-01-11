package daemon

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/user/gitnotepad/internal/config"

	"gopkg.in/natefinch/lumberjack.v2"
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

// Start starts the daemon in background
func (d *Daemon) Start() error {
	// Check if already running
	if d.IsRunning() {
		pid, _ := d.GetPID()
		return fmt.Errorf("daemon is already running (PID: %d)", pid)
	}

	// Get executable path
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Prepare arguments (remove daemon command, add --daemon-child flag)
	args := []string{"--daemon-child"}
	if d.configPath != "" {
		args = append(args, "-config", d.configPath)
	}

	// Create command
	cmd := exec.Command(executable, args...)

	// Detach from terminal
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start daemon: %w", err)
	}

	// Write PID file
	if err := d.WritePID(cmd.Process.Pid); err != nil {
		return fmt.Errorf("failed to write PID file: %w", err)
	}

	fmt.Printf("Daemon started (PID: %d)\n", cmd.Process.Pid)
	return nil
}

// Stop stops the running daemon
func (d *Daemon) Stop() error {
	if !d.IsRunning() {
		return fmt.Errorf("daemon is not running")
	}

	pid, err := d.GetPID()
	if err != nil {
		return fmt.Errorf("failed to get PID: %w", err)
	}

	// Send SIGTERM
	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("failed to find process: %w", err)
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to send signal: %w", err)
	}

	// Wait for process to exit (with timeout)
	for i := 0; i < 30; i++ {
		time.Sleep(100 * time.Millisecond)
		if !d.processExists(pid) {
			break
		}
	}

	// Force kill if still running
	if d.processExists(pid) {
		if err := process.Signal(syscall.SIGKILL); err != nil {
			return fmt.Errorf("failed to kill process: %w", err)
		}
	}

	// Remove PID file
	if err := d.RemovePID(); err != nil {
		return fmt.Errorf("failed to remove PID file: %w", err)
	}

	fmt.Printf("Daemon stopped (PID: %d)\n", pid)
	return nil
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

// processExists checks if a process exists
func (d *Daemon) processExists(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds, so we need to send signal 0
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// SetupLogging configures logging based on config
func (d *Daemon) SetupLogging() {
	if !d.cfg.Logging.File {
		return
	}

	// Create log directory
	if err := os.MkdirAll(d.cfg.Logging.Dir, 0755); err != nil {
		log.Printf("Failed to create log directory: %v", err)
		return
	}

	// Configure lumberjack for log rotation
	logFile := &lumberjack.Logger{
		Filename:   filepath.Join(d.cfg.Logging.Dir, "gitnotepad.log"),
		MaxSize:    d.cfg.Logging.MaxSize,    // megabytes
		MaxAge:     d.cfg.Logging.MaxAge,     // days
		MaxBackups: d.cfg.Logging.MaxBackups, // number of backups
		LocalTime:  true,
		Compress:   true, // compress rotated files
	}

	// Set log output to both file and stdout
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(multiWriter)
}

// SetupLoggingFileOnly configures logging to file only (for daemon mode)
func (d *Daemon) SetupLoggingFileOnly() *lumberjack.Logger {
	// Create log directory
	if err := os.MkdirAll(d.cfg.Logging.Dir, 0755); err != nil {
		return nil
	}

	// Configure lumberjack for log rotation
	logFile := &lumberjack.Logger{
		Filename:   filepath.Join(d.cfg.Logging.Dir, "gitnotepad.log"),
		MaxSize:    d.cfg.Logging.MaxSize,
		MaxAge:     d.cfg.Logging.MaxAge,
		MaxBackups: d.cfg.Logging.MaxBackups,
		LocalTime:  true,
		Compress:   true,
	}

	// Redirect log output to file
	log.SetOutput(logFile)

	// Also redirect stdout and stderr for fmt.Println etc.
	// Create a pipe to capture stdout/stderr
	multiWriter := io.MultiWriter(logFile)
	log.SetOutput(multiWriter)
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	return logFile
}

// RedirectOutput redirects stdout and stderr to the log file
func RedirectOutput(logFile *lumberjack.Logger) {
	if logFile == nil {
		return
	}
	// Note: In Go, we can't directly redirect os.Stdout/os.Stderr to a Writer
	// but we can set up log package to use the file
	log.SetOutput(logFile)
}
