-- Migration: 004_link_workforce_civil_id.sql
-- Description: Links workforce app registration with HCMS master employee Civil ID

ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS civil_id VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_civil_id_active 
  ON employees (TRIM(UPPER(civil_id)))
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS workforce_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    civil_id VARCHAR(50) NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    registered_device_id TEXT NOT NULL,
    device_model TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workforce_auth_employee ON workforce_auth(employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_auth_civil_id ON workforce_auth(civil_id);

CREATE OR REPLACE FUNCTION register_workforce_staff(
    p_civil_id TEXT,
    p_device_id TEXT,
    p_device_model TEXT,
    p_pin_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_civil_id TEXT;
    v_employee RECORD;
    v_existing_auth RECORD;
BEGIN
    v_clean_civil_id := TRIM(UPPER(p_civil_id));

    SELECT id, full_name, employee_code, status, default_project_id
    INTO v_employee
    FROM employees
    WHERE TRIM(UPPER(civil_id)) = v_clean_civil_id AND status = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Civil ID does not match any active employee record in HCMS.');
    END IF;

    SELECT id, registered_device_id INTO v_existing_auth
    FROM workforce_auth WHERE civil_id = v_clean_civil_id;

    IF FOUND THEN
        IF v_existing_auth.registered_device_id <> p_device_id THEN
            RETURN jsonb_build_object('success', false, 'code', 'DEVICE_MISMATCH', 'message', 'Account is already registered on another device.');
        END IF;

        UPDATE workforce_auth
        SET pin_hash = p_pin_hash, device_model = p_device_model, last_login_at = NOW()
        WHERE id = v_existing_auth.id;
    ELSE
        INSERT INTO workforce_auth (employee_id, civil_id, pin_hash, registered_device_id, device_model, is_active, last_login_at)
        VALUES (v_employee.id, v_clean_civil_id, p_pin_hash, p_device_id, p_device_model, TRUE, NOW());
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'OK',
        'employee', jsonb_build_object(
            'id', v_employee.id,
            'full_name', v_employee.full_name,
            'employee_code', v_employee.employee_code,
            'civil_id', v_clean_civil_id,
            'project_id', v_employee.default_project_id
        )
    );
END;
$$;
