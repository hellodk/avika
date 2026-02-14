package buffer

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"
)

const (
	// DefaultMaxWALSize is the maximum WAL file size before rotation (100MB)
	DefaultMaxWALSize = 100 * 1024 * 1024
	// DefaultRotationCheckInterval is how often to check if rotation is needed
	DefaultRotationCheckInterval = 5 * time.Minute
	// MinCompactionRatio is the minimum ratio of read data to trigger compaction
	MinCompactionRatio = 0.5 // Compact if 50%+ of WAL has been read
)

// FileBuffer implements a simple persistent FIFO queue using a WAL file and a cursor file.
type FileBuffer struct {
	walFile    *os.File
	cursorFile *os.File
	mu         sync.Mutex
	walPath    string
	cursorPath string
	readOffset int64
	maxWALSize int64
	stopCh     chan struct{}
}

// NewFileBuffer creates or opens a file buffer at the given path.
func NewFileBuffer(basePath string) (*FileBuffer, error) {
	return NewFileBufferWithOptions(basePath, DefaultMaxWALSize)
}

// NewFileBufferWithOptions creates a file buffer with custom options.
func NewFileBufferWithOptions(basePath string, maxWALSize int64) (*FileBuffer, error) {
	walPath := basePath + ".wal"
	cursorPath := basePath + ".cursor"

	// Open WAL in append mode
	wal, err := os.OpenFile(walPath, os.O_CREATE|os.O_RDWR, 0666)
	if err != nil {
		return nil, fmt.Errorf("failed to open wal: %w", err)
	}

	// Open Cursor
	cursor, err := os.OpenFile(cursorPath, os.O_CREATE|os.O_RDWR, 0666)
	if err != nil {
		wal.Close()
		return nil, fmt.Errorf("failed to open cursor: %w", err)
	}

	fb := &FileBuffer{
		walFile:    wal,
		cursorFile: cursor,
		walPath:    walPath,
		cursorPath: cursorPath,
		maxWALSize: maxWALSize,
		stopCh:     make(chan struct{}),
	}

	// Read initial read position from cursor
	var offset int64
	err = binary.Read(cursor, binary.LittleEndian, &offset)
	if err != nil && err != io.EOF {
		// If cursor file is corrupt/empty, default to 0 (replay all) or end?
		// For safety, let's start from 0.
		offset = 0
	}
	fb.readOffset = offset

	// Start background rotation checker
	go fb.rotationLoop()

	return fb, nil
}

// Write appends a message to the WAL.
func (b *FileBuffer) Write(data []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Go to end of file
	if _, err := b.walFile.Seek(0, io.SeekEnd); err != nil {
		return err
	}

	// Write Length (4 bytes) + Data
	length := uint32(len(data))
	if err := binary.Write(b.walFile, binary.LittleEndian, length); err != nil {
		return err
	}
	if _, err := b.walFile.Write(data); err != nil {
		return err
	}

	return b.walFile.Sync() // Ensure it's on disk
}

// ReadNext reads the next message starting from the current read offset.
// It returns the message data and the new offset. It does NOT update the persistent cursor.
func (b *FileBuffer) ReadNext() ([]byte, int64, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Seek to current read offset
	sz, _ := b.walFile.Seek(0, io.SeekEnd)
	if _, err := b.walFile.Seek(b.readOffset, io.SeekStart); err != nil {
		return nil, 0, err
	}
	if b.readOffset%1000 == 0 { // Don't spam too much, but log often enough
		log.Printf("ReadNext: offset=%d, wal_size=%d", b.readOffset, sz)
	}

	var length uint32
	if err := binary.Read(b.walFile, binary.LittleEndian, &length); err != nil {
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return nil, b.readOffset, nil // Nothing new or partial data at end
		}
		return nil, 0, err
	}

	if length > 1024*1024 { // Safety check: 1MB
		// If we hit this, the WAL is likely corrupted.
		// We return a special error that the caller can use to decide whether to skip.
		return nil, b.readOffset, fmt.Errorf("suspiciously large message length: %d at offset %d", length, b.readOffset)
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(b.walFile, data); err != nil {
		if err == io.ErrUnexpectedEOF || err == io.EOF {
			return nil, b.readOffset, nil // Partial message at end
		}
		return nil, b.readOffset, err
	}

	newOffset := b.readOffset + 4 + int64(length)
	return data, newOffset, nil
}

// SkipCorrupt skips the current corrupted message by moving the read offset forward.
// This is a dangerous operation and should only be used when ReadNext returns a corruption error.
func (b *FileBuffer) SkipCorrupt(currentOffset int64) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Since we don't know the actual length, we can only try to "skip" by 1 byte
	// or look for the next valid-looking length header.
	// For now, let's just move forward by 1 byte to try and find a new valid header.
	b.readOffset = currentOffset + 1
	return b.Ack(b.readOffset)
}

// Ack updates the read offset and persists it to the cursor file.
// Call this after successfully processing/sending the message returned by ReadNext.
func (b *FileBuffer) Ack(newOffset int64) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.readOffset = newOffset

	if _, err := b.cursorFile.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := binary.Write(b.cursorFile, binary.LittleEndian, newOffset); err != nil {
		return err
	}
	return b.cursorFile.Sync()
}

// Close closes the file handles and stops background goroutines.
func (b *FileBuffer) Close() error {
	close(b.stopCh)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.walFile.Close()
	b.cursorFile.Close()
	return nil
}

// Size returns the current WAL file size.
func (b *FileBuffer) Size() (int64, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.sizeLocked()
}

func (b *FileBuffer) sizeLocked() (int64, error) {
	info, err := b.walFile.Stat()
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

// rotationLoop periodically checks if WAL rotation is needed.
func (b *FileBuffer) rotationLoop() {
	ticker := time.NewTicker(DefaultRotationCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := b.maybeRotate(); err != nil {
				log.Printf("WAL rotation check error: %v", err)
			}
		case <-b.stopCh:
			return
		}
	}
}

// maybeRotate checks if rotation is needed and performs it.
func (b *FileBuffer) maybeRotate() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	size, err := b.sizeLocked()
	if err != nil {
		return err
	}

	// Check if rotation is needed
	if size < b.maxWALSize {
		return nil
	}

	// Also check if enough data has been read to make compaction worthwhile
	if b.readOffset == 0 || float64(b.readOffset)/float64(size) < MinCompactionRatio {
		log.Printf("WAL size %d exceeds max %d but not enough read data to compact (read offset: %d)", size, b.maxWALSize, b.readOffset)
		return nil
	}

	return b.compactLocked()
}

// Compact removes already-read entries from the WAL.
// This is the main rotation mechanism.
func (b *FileBuffer) Compact() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.compactLocked()
}

func (b *FileBuffer) compactLocked() error {
	log.Printf("Starting WAL compaction (read offset: %d)", b.readOffset)

	// Get current WAL size
	size, err := b.sizeLocked()
	if err != nil {
		return err
	}

	// If read offset is 0 or near start, nothing to compact
	if b.readOffset < 1024 {
		log.Println("Nothing to compact, read offset too small")
		return nil
	}

	// Create a temporary file for the compacted WAL
	tmpPath := b.walPath + ".tmp"
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}

	// Seek to the current read offset in the original WAL
	if _, err := b.walFile.Seek(b.readOffset, io.SeekStart); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to seek in WAL: %w", err)
	}

	// Copy unread data to the temp file
	copied, err := io.Copy(tmpFile, b.walFile)
	if err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to copy unread data: %w", err)
	}

	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("failed to sync temp file: %w", err)
	}
	tmpFile.Close()

	// Close the original WAL file
	b.walFile.Close()

	// Rename temp file to WAL file (atomic on most systems)
	if err := os.Rename(tmpPath, b.walPath); err != nil {
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	// Reopen the WAL file
	b.walFile, err = os.OpenFile(b.walPath, os.O_CREATE|os.O_RDWR, 0666)
	if err != nil {
		return fmt.Errorf("failed to reopen WAL: %w", err)
	}

	// Reset read offset to 0 (since we removed the read portion)
	oldOffset := b.readOffset
	b.readOffset = 0

	// Update cursor file
	if _, err := b.cursorFile.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("failed to seek cursor: %w", err)
	}
	if err := binary.Write(b.cursorFile, binary.LittleEndian, int64(0)); err != nil {
		return fmt.Errorf("failed to write cursor: %w", err)
	}
	if err := b.cursorFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync cursor: %w", err)
	}

	log.Printf("WAL compaction complete: removed %d bytes, kept %d bytes (was %d)", oldOffset, copied, size)
	return nil
}

// Stats returns buffer statistics for monitoring.
type BufferStats struct {
	WALSize    int64
	ReadOffset int64
	UnreadSize int64
}

// GetStats returns current buffer statistics.
func (b *FileBuffer) GetStats() (*BufferStats, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	size, err := b.sizeLocked()
	if err != nil {
		return nil, err
	}

	return &BufferStats{
		WALSize:    size,
		ReadOffset: b.readOffset,
		UnreadSize: size - b.readOffset,
	}, nil
}
