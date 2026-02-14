package middleware

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// ValidationError represents a validation error.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Validator provides input validation utilities.
type Validator struct {
	errors []ValidationError
}

// NewValidator creates a new validator.
func NewValidator() *Validator {
	return &Validator{errors: make([]ValidationError, 0)}
}

// HasErrors returns true if validation errors exist.
func (v *Validator) HasErrors() bool {
	return len(v.errors) > 0
}

// Errors returns all validation errors.
func (v *Validator) Errors() []ValidationError {
	return v.errors
}

// AddError adds a validation error.
func (v *Validator) AddError(field, message string) {
	v.errors = append(v.errors, ValidationError{Field: field, Message: message})
}

// ValidateRequired checks if a value is not empty.
func (v *Validator) ValidateRequired(field, value string) bool {
	if strings.TrimSpace(value) == "" {
		v.AddError(field, "is required")
		return false
	}
	return true
}

// ValidateMaxLength checks if a value doesn't exceed max length.
func (v *Validator) ValidateMaxLength(field, value string, max int) bool {
	if len(value) > max {
		v.AddError(field, "exceeds maximum length of "+strconv.Itoa(max))
		return false
	}
	return true
}

// ValidateMinLength checks if a value meets minimum length.
func (v *Validator) ValidateMinLength(field, value string, min int) bool {
	if len(value) < min {
		v.AddError(field, "must be at least "+strconv.Itoa(min)+" characters")
		return false
	}
	return true
}

// ValidatePattern checks if a value matches a regex pattern.
func (v *Validator) ValidatePattern(field, value, pattern, message string) bool {
	matched, err := regexp.MatchString(pattern, value)
	if err != nil || !matched {
		v.AddError(field, message)
		return false
	}
	return true
}

// ValidateAgentID validates an agent ID format.
func (v *Validator) ValidateAgentID(field, value string) bool {
	// Agent IDs should be alphanumeric with hyphens and underscores
	if !v.ValidateRequired(field, value) {
		return false
	}
	if !v.ValidateMaxLength(field, value, 128) {
		return false
	}
	return v.ValidatePattern(field, value, `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, "must be alphanumeric with dots, hyphens, or underscores")
}

// ValidateTimeRange validates start and end time parameters.
func (v *Validator) ValidateTimeRange(startUnix, endUnix int64) bool {
	valid := true
	if startUnix < 0 {
		v.AddError("start", "must be a positive timestamp")
		valid = false
	}
	if endUnix < 0 {
		v.AddError("end", "must be a positive timestamp")
		valid = false
	}
	if startUnix > endUnix {
		v.AddError("time_range", "start must be before end")
		valid = false
	}
	// Max range of 90 days
	if endUnix-startUnix > 90*24*60*60 {
		v.AddError("time_range", "range cannot exceed 90 days")
		valid = false
	}
	return valid
}

// ValidateIntRange validates an integer is within a range.
func (v *Validator) ValidateIntRange(field string, value, min, max int) bool {
	if value < min || value > max {
		v.AddError(field, "must be between "+strconv.Itoa(min)+" and "+strconv.Itoa(max))
		return false
	}
	return true
}

// SanitizeString removes potentially dangerous characters.
func SanitizeString(s string) string {
	// Remove null bytes and control characters
	var result strings.Builder
	for _, r := range s {
		if r >= 32 && r != 127 {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// SanitizeIdentifier sanitizes a database identifier (column/table name).
// Only allows alphanumeric and underscores.
func SanitizeIdentifier(s string) string {
	var result strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// ValidQueryParams extracts and validates common query parameters.
func ValidQueryParams(r *http.Request) (start, end int64, agentID string, v *Validator) {
	v = NewValidator()

	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")
	agentID = r.URL.Query().Get("agent_id")

	if startStr != "" {
		var err error
		start, err = strconv.ParseInt(startStr, 10, 64)
		if err != nil {
			v.AddError("start", "must be a valid unix timestamp")
		}
	}

	if endStr != "" {
		var err error
		end, err = strconv.ParseInt(endStr, 10, 64)
		if err != nil {
			v.AddError("end", "must be a valid unix timestamp")
		}
	}

	if agentID != "" {
		v.ValidateAgentID("agent_id", agentID)
	}

	if start != 0 && end != 0 {
		v.ValidateTimeRange(start, end)
	}

	return start, end, SanitizeString(agentID), v
}
