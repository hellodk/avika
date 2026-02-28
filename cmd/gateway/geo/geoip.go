package geo

import (
	"encoding/csv"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
)

// GeoLocation represents geographic location data
type GeoLocation struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	Region      string  `json:"region"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Timezone    string  `json:"timezone"`
	ISP         string  `json:"isp"`
}

// GeoIPLookup provides IP to location lookup
type GeoIPLookup struct {
	mu       sync.RWMutex
	networks map[string]*GeoLocation
	// Embedded well-known IP ranges for demo/testing
	wellKnownIPs map[string]*GeoLocation
}

// NewGeoIPLookup creates a new GeoIP lookup instance
func NewGeoIPLookup() *GeoIPLookup {
	g := &GeoIPLookup{
		networks:     make(map[string]*GeoLocation),
		wellKnownIPs: make(map[string]*GeoLocation),
	}
	g.initWellKnownIPs()
	return g
}

// initWellKnownIPs initializes well-known IP ranges for testing/demo
func (g *GeoIPLookup) initWellKnownIPs() {
	g.wellKnownIPs = map[string]*GeoLocation{
		// Google DNS
		"8.8.8.8": {Country: "United States", CountryCode: "US", City: "Mountain View", Region: "California", Latitude: 37.4056, Longitude: -122.0775, Timezone: "America/Los_Angeles", ISP: "Google"},
		"8.8.4.4": {Country: "United States", CountryCode: "US", City: "Mountain View", Region: "California", Latitude: 37.4056, Longitude: -122.0775, Timezone: "America/Los_Angeles", ISP: "Google"},
		// Cloudflare
		"1.1.1.1": {Country: "Australia", CountryCode: "AU", City: "Sydney", Region: "New South Wales", Latitude: -33.8688, Longitude: 151.2093, Timezone: "Australia/Sydney", ISP: "Cloudflare"},
		"1.0.0.1": {Country: "Australia", CountryCode: "AU", City: "Sydney", Region: "New South Wales", Latitude: -33.8688, Longitude: 151.2093, Timezone: "Australia/Sydney", ISP: "Cloudflare"},
		// AWS US East
		"52.95.110.1": {Country: "United States", CountryCode: "US", City: "Ashburn", Region: "Virginia", Latitude: 39.0438, Longitude: -77.4874, Timezone: "America/New_York", ISP: "Amazon AWS"},
		// Microsoft
		"13.107.21.200": {Country: "United States", CountryCode: "US", City: "Redmond", Region: "Washington", Latitude: 47.6740, Longitude: -122.1215, Timezone: "America/Los_Angeles", ISP: "Microsoft"},
		// Wikimedia
		"91.198.174.192": {Country: "Netherlands", CountryCode: "NL", City: "Amsterdam", Region: "North Holland", Latitude: 52.3676, Longitude: 4.9041, Timezone: "Europe/Amsterdam", ISP: "Wikimedia"},
		// Test range
		"203.0.113.10": {Country: "Japan", CountryCode: "JP", City: "Tokyo", Region: "Tokyo", Latitude: 35.6762, Longitude: 139.6503, Timezone: "Asia/Tokyo", ISP: "Test Network"},
		// GitHub
		"185.199.108.153": {Country: "United States", CountryCode: "US", City: "San Francisco", Region: "California", Latitude: 37.7749, Longitude: -122.4194, Timezone: "America/Los_Angeles", ISP: "GitHub"},
		// Google Cloud
		"34.117.59.81": {Country: "United States", CountryCode: "US", City: "The Dalles", Region: "Oregon", Latitude: 45.5946, Longitude: -121.1787, Timezone: "America/Los_Angeles", ISP: "Google Cloud"},
		// Reddit/Fastly
		"151.101.1.69": {Country: "United States", CountryCode: "US", City: "San Francisco", Region: "California", Latitude: 37.7749, Longitude: -122.4194, Timezone: "America/Los_Angeles", ISP: "Fastly"},
		// Cloudflare CDN
		"104.16.132.229": {Country: "United States", CountryCode: "US", City: "San Francisco", Region: "California", Latitude: 37.7749, Longitude: -122.4194, Timezone: "America/Los_Angeles", ISP: "Cloudflare"},
		// Australia
		"139.130.4.5": {Country: "Australia", CountryCode: "AU", City: "Melbourne", Region: "Victoria", Latitude: -37.8136, Longitude: 144.9631, Timezone: "Australia/Melbourne", ISP: "Telstra"},
		// Brazil
		"177.54.144.106": {Country: "Brazil", CountryCode: "BR", City: "São Paulo", Region: "São Paulo", Latitude: -23.5505, Longitude: -46.6333, Timezone: "America/Sao_Paulo", ISP: "Claro"},
		// South Africa
		"41.203.65.114": {Country: "South Africa", CountryCode: "ZA", City: "Johannesburg", Region: "Gauteng", Latitude: -26.2041, Longitude: 28.0473, Timezone: "Africa/Johannesburg", ISP: "MTN"},
		// Cloudflare APAC
		"103.21.244.0": {Country: "Singapore", CountryCode: "SG", City: "Singapore", Region: "Central Singapore", Latitude: 1.3521, Longitude: 103.8198, Timezone: "Asia/Singapore", ISP: "Cloudflare"},
		// Japan APNIC
		"202.12.29.205": {Country: "Japan", CountryCode: "JP", City: "Osaka", Region: "Osaka", Latitude: 34.6937, Longitude: 135.5023, Timezone: "Asia/Tokyo", ISP: "APNIC"},
		// Africa
		"196.216.2.1": {Country: "Nigeria", CountryCode: "NG", City: "Lagos", Region: "Lagos", Latitude: 6.5244, Longitude: 3.3792, Timezone: "Africa/Lagos", ISP: "MainOne"},
		// India
		"103.10.124.1": {Country: "India", CountryCode: "IN", City: "Mumbai", Region: "Maharashtra", Latitude: 19.0760, Longitude: 72.8777, Timezone: "Asia/Kolkata", ISP: "Reliance Jio"},
		"49.36.128.1": {Country: "India", CountryCode: "IN", City: "New Delhi", Region: "Delhi", Latitude: 28.6139, Longitude: 77.2090, Timezone: "Asia/Kolkata", ISP: "Airtel"},
		// UK
		"185.93.0.1": {Country: "United Kingdom", CountryCode: "GB", City: "London", Region: "England", Latitude: 51.5074, Longitude: -0.1278, Timezone: "Europe/London", ISP: "BT"},
		// Germany
		"185.157.0.1": {Country: "Germany", CountryCode: "DE", City: "Frankfurt", Region: "Hesse", Latitude: 50.1109, Longitude: 8.6821, Timezone: "Europe/Berlin", ISP: "Deutsche Telekom"},
		// France
		"80.67.169.12": {Country: "France", CountryCode: "FR", City: "Paris", Region: "Île-de-France", Latitude: 48.8566, Longitude: 2.3522, Timezone: "Europe/Paris", ISP: "FDN"},
		// Canada
		"99.79.0.1": {Country: "Canada", CountryCode: "CA", City: "Toronto", Region: "Ontario", Latitude: 43.6532, Longitude: -79.3832, Timezone: "America/Toronto", ISP: "Rogers"},
		// Mexico
		"189.240.36.1": {Country: "Mexico", CountryCode: "MX", City: "Mexico City", Region: "Mexico City", Latitude: 19.4326, Longitude: -99.1332, Timezone: "America/Mexico_City", ISP: "Telmex"},
		// China (note: often blocked, but good for testing)
		"223.5.5.5": {Country: "China", CountryCode: "CN", City: "Hangzhou", Region: "Zhejiang", Latitude: 30.2741, Longitude: 120.1551, Timezone: "Asia/Shanghai", ISP: "Alibaba"},
		// Russia
		"77.88.8.8": {Country: "Russia", CountryCode: "RU", City: "Moscow", Region: "Moscow", Latitude: 55.7558, Longitude: 37.6173, Timezone: "Europe/Moscow", ISP: "Yandex"},
		// South Korea
		"168.126.63.1": {Country: "South Korea", CountryCode: "KR", City: "Seoul", Region: "Seoul", Latitude: 37.5665, Longitude: 126.9780, Timezone: "Asia/Seoul", ISP: "Korea Telecom"},
		// UAE
		"94.200.0.1": {Country: "United Arab Emirates", CountryCode: "AE", City: "Dubai", Region: "Dubai", Latitude: 25.2048, Longitude: 55.2708, Timezone: "Asia/Dubai", ISP: "Etisalat"},
	}
}

// Lookup returns geographic location for an IP address
func (g *GeoIPLookup) Lookup(ipStr string) *GeoLocation {
	if ipStr == "" {
		return nil
	}

	// Clean up IP (handle X-Forwarded-For with multiple IPs)
	ipStr = strings.TrimSpace(strings.Split(ipStr, ",")[0])

	// Check well-known IPs first
	g.mu.RLock()
	if loc, ok := g.wellKnownIPs[ipStr]; ok {
		g.mu.RUnlock()
		return loc
	}
	g.mu.RUnlock()

	// Parse IP
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil
	}

	// Check for private/local IPs
	if ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() {
		return &GeoLocation{
			Country:     "Local",
			CountryCode: "XX",
			City:        "Private Network",
			Region:      "",
			Latitude:    0,
			Longitude:   0,
		}
	}

	// For IPs not in our database, try to guess based on first octet ranges
	return g.guessLocationByRange(ip)
}

// guessLocationByRange provides rough estimates based on IP ranges
func (g *GeoIPLookup) guessLocationByRange(ip net.IP) *GeoLocation {
	ip4 := ip.To4()
	if ip4 == nil {
		return &GeoLocation{
			Country:     "Unknown",
			CountryCode: "XX",
			City:        "Unknown",
			Latitude:    0,
			Longitude:   0,
		}
	}

	firstOctet := ip4[0]

	// Very rough regional allocation based on IANA assignments
	switch {
	case firstOctet >= 1 && firstOctet <= 126:
		// Class A - mostly US/North America
		return &GeoLocation{Country: "United States", CountryCode: "US", City: "Unknown", Latitude: 39.8283, Longitude: -98.5795}
	case firstOctet >= 128 && firstOctet <= 191:
		// Class B - mixed, often Europe
		return &GeoLocation{Country: "Europe", CountryCode: "EU", City: "Unknown", Latitude: 50.1109, Longitude: 8.6821}
	case firstOctet >= 192 && firstOctet <= 223:
		// Class C - mixed, often Asia Pacific
		return &GeoLocation{Country: "Asia Pacific", CountryCode: "AP", City: "Unknown", Latitude: 35.6762, Longitude: 139.6503}
	default:
		return &GeoLocation{Country: "Unknown", CountryCode: "XX", City: "Unknown", Latitude: 0, Longitude: 0}
	}
}

// LoadFromCSV loads geo data from a CSV file (for custom databases)
func (g *GeoIPLookup) LoadFromCSV(filepath string) error {
	file, err := os.Open(filepath)
	if err != nil {
		return err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return err
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	for i, record := range records {
		if i == 0 {
			continue // Skip header
		}
		if len(record) < 7 {
			continue
		}

		lat, _ := strconv.ParseFloat(record[4], 64)
		lon, _ := strconv.ParseFloat(record[5], 64)

		g.wellKnownIPs[record[0]] = &GeoLocation{
			Country:     record[1],
			CountryCode: record[2],
			City:        record[3],
			Latitude:    lat,
			Longitude:   lon,
			Timezone:    record[6],
		}
	}

	log.Printf("Loaded %d geo records from CSV", len(records)-1)
	return nil
}

// ExtractClientIP extracts the client IP from various headers
func ExtractClientIP(xff, remoteAddr string) string {
	// X-Forwarded-For takes precedence (first IP in the chain)
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Fall back to remote addr (strip port)
	if remoteAddr != "" {
		host, _, err := net.SplitHostPort(remoteAddr)
		if err != nil {
			return remoteAddr
		}
		return host
	}

	return ""
}
