//go:build !windows

package daemon

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

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
