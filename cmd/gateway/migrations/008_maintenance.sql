-- Migration: 008_maintenance.sql
-- Description: Add tables for maintenance page management

-- ============================================================================
-- MAINTENANCE TEMPLATES TABLE
-- Stores custom maintenance page templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS maintenance_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    html_content TEXT NOT NULL,
    css_content TEXT,
    assets JSONB DEFAULT '{}', -- {filename: base64_content}
    variables JSONB DEFAULT '[]', -- Array of variable definitions
    is_default BOOLEAN DEFAULT false,
    is_built_in BOOLEAN DEFAULT false,
    created_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_templates_project ON maintenance_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_templates_default ON maintenance_templates(is_default) WHERE is_default = true;

-- ============================================================================
-- MAINTENANCE STATE TABLE
-- Tracks current maintenance state at various scopes
-- ============================================================================
CREATE TABLE IF NOT EXISTS maintenance_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope VARCHAR(50) NOT NULL, -- 'agent', 'group', 'environment', 'project', 'site', 'location'
    scope_id TEXT NOT NULL, -- agent_id, group_id (uuid), environment_id (uuid), etc.
    site_filter TEXT, -- For site scope: server_name
    location_filter TEXT, -- For location scope: location path
    template_id UUID REFERENCES maintenance_templates(id) ON DELETE SET NULL,
    template_vars JSONB DEFAULT '{}', -- Variable values for template
    is_enabled BOOLEAN DEFAULT false,
    enabled_at TIMESTAMP WITH TIME ZONE,
    enabled_by VARCHAR(100) REFERENCES users(username) ON DELETE SET NULL,
    schedule_type VARCHAR(50) DEFAULT 'immediate', -- 'immediate', 'scheduled', 'recurring'
    scheduled_start TIMESTAMP WITH TIME ZONE,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    recurrence_rule TEXT, -- Cron expression for recurring
    timezone VARCHAR(50) DEFAULT 'UTC',
    bypass_ips TEXT[] DEFAULT '{}',
    bypass_headers JSONB DEFAULT '{}',
    bypass_cookies JSONB DEFAULT '{}',
    reason TEXT,
    notify_on_start BOOLEAN DEFAULT false,
    notify_on_end BOOLEAN DEFAULT false,
    notify_channels TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_state_unique 
    ON maintenance_state(scope, scope_id, COALESCE(site_filter, ''), COALESCE(location_filter, ''));
CREATE INDEX IF NOT EXISTS idx_maintenance_state_scope ON maintenance_state(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_state_enabled ON maintenance_state(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_maintenance_state_scheduled ON maintenance_state(scheduled_start) WHERE scheduled_start IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_maintenance_templates_updated_at ON maintenance_templates;
CREATE TRIGGER update_maintenance_templates_updated_at
    BEFORE UPDATE ON maintenance_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_state_updated_at ON maintenance_state;
CREATE TRIGGER update_maintenance_state_updated_at
    BEFORE UPDATE ON maintenance_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Insert built-in maintenance templates
-- ============================================================================
INSERT INTO maintenance_templates (id, name, description, html_content, css_content, is_built_in, is_default)
VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    'Minimal',
    'Simple text-only maintenance page',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Under Maintenance</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
        .container { text-align: center; padding: 40px; }
        h1 { color: #333; margin-bottom: 16px; }
        p { color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>We''ll be back soon!</h1>
        <p>We''re performing scheduled maintenance. Please check back shortly.</p>
        {{#if reason}}<p><em>{{reason}}</em></p>{{/if}}
    </div>
</body>
</html>',
    NULL,
    true,
    true
),
(
    '00000000-0000-0000-0000-000000000002',
    'Corporate',
    'Professional maintenance page with logo support',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{company_name}} - Maintenance</title>
</head>
<body>
    <div class="container">
        <div class="logo">{{company_name}}</div>
        <h1>Scheduled Maintenance</h1>
        <p>We''re currently performing scheduled maintenance to improve our services.</p>
        {{#if estimated_end}}<p class="time">Expected completion: {{estimated_end}}</p>{{/if}}
        {{#if support_email}}<p class="contact">Questions? Contact us at <a href="mailto:{{support_email}}">{{support_email}}</a></p>{{/if}}
    </div>
</body>
</html>',
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.container { text-align: center; padding: 60px 40px; background: white; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px; }
.logo { font-size: 24px; font-weight: bold; color: #667eea; margin-bottom: 30px; }
h1 { color: #333; margin-bottom: 16px; font-size: 28px; }
p { color: #666; line-height: 1.6; }
.time { background: #f0f4ff; padding: 12px 20px; border-radius: 8px; color: #667eea; font-weight: 500; }
.contact { font-size: 14px; margin-top: 30px; }
.contact a { color: #667eea; }',
    true,
    false
),
(
    '00000000-0000-0000-0000-000000000003',
    'Countdown',
    'Maintenance page with countdown timer',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maintenance in Progress</title>
</head>
<body>
    <div class="container">
        <div class="icon">🔧</div>
        <h1>Maintenance in Progress</h1>
        <p>We''re working hard to improve your experience.</p>
        {{#if scheduled_end}}
        <div id="countdown" class="countdown" data-end="{{scheduled_end_timestamp}}">
            <div class="time-block"><span id="hours">00</span><label>Hours</label></div>
            <div class="time-block"><span id="minutes">00</span><label>Minutes</label></div>
            <div class="time-block"><span id="seconds">00</span><label>Seconds</label></div>
        </div>
        {{/if}}
    </div>
    <script>
        const countdown = document.getElementById("countdown");
        if (countdown) {
            const endTime = parseInt(countdown.dataset.end) * 1000;
            function update() {
                const now = Date.now();
                const diff = Math.max(0, endTime - now);
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                document.getElementById("hours").textContent = String(hours).padStart(2, "0");
                document.getElementById("minutes").textContent = String(minutes).padStart(2, "0");
                document.getElementById("seconds").textContent = String(seconds).padStart(2, "0");
                if (diff > 0) setTimeout(update, 1000);
                else location.reload();
            }
            update();
        }
    </script>
</body>
</html>',
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
.container { text-align: center; padding: 40px; }
.icon { font-size: 64px; margin-bottom: 20px; }
h1 { margin-bottom: 16px; }
p { color: #aaa; margin-bottom: 40px; }
.countdown { display: flex; gap: 20px; justify-content: center; }
.time-block { background: rgba(255,255,255,0.1); padding: 20px 30px; border-radius: 12px; }
.time-block span { font-size: 48px; font-weight: bold; display: block; }
.time-block label { font-size: 12px; color: #888; text-transform: uppercase; }',
    true,
    false
)
ON CONFLICT (id) DO NOTHING;
