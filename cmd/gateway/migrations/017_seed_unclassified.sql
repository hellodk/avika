-- 017: Create "Unclassified" project and environment for agents without labels.
-- Agents that connect without project/environment labels are auto-assigned here.
-- Once an admin classifies them to a real project, they are removed from Unclassified.
-- The Unclassified project/environment cannot coexist with real assignments.

INSERT INTO projects (id, name, slug, description, created_by, created_at, updated_at)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Unclassified',
    'unclassified',
    'Agents that have not been assigned to a project. Classify them by assigning to a real project and environment.',
    'admin',
    NOW(),
    NOW()
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO environments (id, project_id, name, slug, description, color, is_production, sort_order, created_at, updated_at)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Unclassified',
    'unclassified',
    'Default environment for unclassified agents.',
    '#6b7280',
    false,
    999,
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;
