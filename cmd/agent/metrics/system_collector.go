package metrics

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
)

// SystemCollector collects system metrics from /proc filesystem
type SystemCollector struct {
	lastCPU     cpuStats
	lastNetwork networkStats
	lastTime    time.Time
}

type cpuStats struct {
	user    uint64
	nice    uint64
	system  uint64
	idle    uint64
	iowait  uint64
	irq     uint64
	softirq uint64
}

type networkStats struct {
	rxBytes uint64
	txBytes uint64
}

func NewSystemCollector() *SystemCollector {
	return &SystemCollector{
		lastTime: time.Now(),
	}
}

// Collect gathers system metrics
func (c *SystemCollector) Collect() (*pb.SystemMetrics, error) {
	metrics := &pb.SystemMetrics{}

	// Collect CPU usage
	usage, user, system, iowait, err := c.getCPUUsage()
	if err == nil {
		metrics.CpuUsagePercent = usage
		metrics.CpuUserPercent = user
		metrics.CpuSystemPercent = system
		metrics.CpuIowaitPercent = iowait
	}

	// Collect memory usage
	memTotal, memUsed, memPercent, err := c.getMemoryUsage()
	if err == nil {
		metrics.MemoryTotalBytes = memTotal
		metrics.MemoryUsedBytes = memUsed
		metrics.MemoryUsagePercent = memPercent
	}

	// Collect network I/O
	rxBytes, txBytes, rxRate, txRate, err := c.getNetworkIO()
	if err == nil {
		metrics.NetworkRxBytes = rxBytes
		metrics.NetworkTxBytes = txBytes
		metrics.NetworkRxRate = rxRate
		metrics.NetworkTxRate = txRate
	}

	return metrics, nil
}

// getCPUUsage reads /proc/stat and calculates CPU usage breakdown percentages
func (c *SystemCollector) getCPUUsage() (usage, user, system, iowait float32, err error) {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return 0, 0, 0, 0, fmt.Errorf("failed to read /proc/stat")
	}

	line := scanner.Text()
	if !strings.HasPrefix(line, "cpu ") {
		return 0, 0, 0, 0, fmt.Errorf("invalid /proc/stat format")
	}

	fields := strings.Fields(line)
	if len(fields) < 8 {
		return 0, 0, 0, 0, fmt.Errorf("insufficient CPU fields")
	}

	current := cpuStats{
		user:    parseUint64(fields[1]),
		nice:    parseUint64(fields[2]),
		system:  parseUint64(fields[3]),
		idle:    parseUint64(fields[4]),
		iowait:  parseUint64(fields[5]),
		irq:     parseUint64(fields[6]),
		softirq: parseUint64(fields[7]),
	}

	// Calculate usage percentage
	if c.lastCPU.user == 0 {
		// First run, store and return 0
		c.lastCPU = current
		return 0, 0, 0, 0, nil
	}

	totalDelta := (current.user + current.nice + current.system + current.idle + current.iowait + current.irq + current.softirq) -
		(c.lastCPU.user + c.lastCPU.nice + c.lastCPU.system + c.lastCPU.idle + c.lastCPU.iowait + c.lastCPU.irq + c.lastCPU.softirq)

	idleDelta := current.idle - c.lastCPU.idle
	userDelta := (current.user + current.nice) - (c.lastCPU.user + c.lastCPU.nice)
	systemDelta := current.system - c.lastCPU.system
	iowaitDelta := current.iowait - c.lastCPU.iowait

	c.lastCPU = current

	if totalDelta == 0 {
		return 0, 0, 0, 0, nil
	}

	usage = float32(100.0 * (1.0 - float64(idleDelta)/float64(totalDelta)))
	user = float32(100.0 * float64(userDelta) / float64(totalDelta))
	system = float32(100.0 * float64(systemDelta) / float64(totalDelta))
	iowait = float32(100.0 * float64(iowaitDelta) / float64(totalDelta))

	return usage, user, system, iowait, nil
}

// getMemoryUsage reads /proc/meminfo
func (c *SystemCollector) getMemoryUsage() (uint64, uint64, float32, error) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, 0, err
	}
	defer file.Close()

	var memTotal, memFree, memAvailable, buffers, cached uint64

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		key := strings.TrimSuffix(fields[0], ":")
		value := parseUint64(fields[1]) * 1024 // Convert KB to bytes

		switch key {
		case "MemTotal":
			memTotal = value
		case "MemFree":
			memFree = value
		case "MemAvailable":
			memAvailable = value
		case "Buffers":
			buffers = value
		case "Cached":
			cached = value
		}
	}

	// Use MemAvailable if available (more accurate), otherwise calculate
	var memUsed uint64
	if memAvailable > 0 {
		memUsed = memTotal - memAvailable
	} else {
		memUsed = memTotal - memFree - buffers - cached
	}

	var memPercent float32
	if memTotal > 0 {
		memPercent = float32(memUsed) / float32(memTotal) * 100.0
	}

	return memTotal, memUsed, memPercent, nil
}

// getNetworkIO reads /proc/net/dev and calculates rates
func (c *SystemCollector) getNetworkIO() (uint64, uint64, float32, float32, error) {
	file, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer file.Close()

	var totalRx, totalTx uint64

	scanner := bufio.NewScanner(file)
	// Skip header lines
	scanner.Scan()
	scanner.Scan()

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}

		// Skip loopback interface
		if strings.HasPrefix(fields[0], "lo:") {
			continue
		}

		// fields[1] = rx bytes, fields[9] = tx bytes
		totalRx += parseUint64(fields[1])
		totalTx += parseUint64(fields[9])
	}

	current := networkStats{
		rxBytes: totalRx,
		txBytes: totalTx,
	}

	now := time.Now()
	elapsed := now.Sub(c.lastTime).Seconds()

	var rxRate, txRate float32
	if c.lastNetwork.rxBytes > 0 && elapsed > 0 {
		rxRate = float32(current.rxBytes-c.lastNetwork.rxBytes) / float32(elapsed)
		txRate = float32(current.txBytes-c.lastNetwork.txBytes) / float32(elapsed)
	}

	c.lastNetwork = current
	c.lastTime = now

	return totalRx, totalTx, rxRate, txRate, nil
}

func parseUint64(s string) uint64 {
	val, _ := strconv.ParseUint(s, 10, 64)
	return val
}
