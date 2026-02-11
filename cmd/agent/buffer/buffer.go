package buffer

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
)

// FileBuffer implements a simple persistent FIFO queue using a WAL file and a cursor file.
type FileBuffer struct {
	walFile    *os.File
	cursorFile *os.File
	mu         sync.Mutex
	walPath    string
	cursorPath string
	readOffset int64
}

// NewFileBuffer creates or opens a file buffer at the given path.
func NewFileBuffer(basePath string) (*FileBuffer, error) {
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
		return nil, 0, fmt.Errorf("suspiciously large message length: %d at offset %d", length, b.readOffset)
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(b.walFile, data); err != nil {
		if err == io.ErrUnexpectedEOF || err == io.EOF {
			return nil, b.readOffset, nil // Partial message at end
		}
		return nil, 0, err
	}

	newOffset := b.readOffset + 4 + int64(length)
	return data, newOffset, nil
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

// Close closes the file handles.
func (b *FileBuffer) Close() error {
	b.walFile.Close()
	b.cursorFile.Close()
	return nil
}

// Size currently validation only
func (b *FileBuffer) Cleanup() {
	// Implement log rotation or truncation logic here to prevent infinite growth
	// For MVP, manual deletion is required if it gets too huge.
}
