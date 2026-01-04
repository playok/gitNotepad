package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/server"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to config file")
	flag.Parse()

	var cfg *config.Config
	var err error

	if _, err := os.Stat(*configPath); os.IsNotExist(err) {
		fmt.Printf("Config file not found at %s, using defaults\n", *configPath)
		cfg = config.Default()
	} else {
		cfg, err = config.Load(*configPath)
		if err != nil {
			log.Fatalf("Failed to load config: %v", err)
		}
	}

	fmt.Println("Git Notepad")
	fmt.Println("===========")
	fmt.Printf("Storage path: %s\n", cfg.Storage.Path)
	fmt.Printf("Default editor type: %s\n", cfg.Editor.DefaultType)
	fmt.Println()

	srv, err := server.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	if err := srv.Run(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
