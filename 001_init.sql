-- MEMBERS
CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  shopify_customer_id BIGINT UNIQUE NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  package_key TEXT NOT NULL CHECK (package_key IN ('pure', 'define', 'beyond')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  started_at TIMESTAMP,
  ends_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- TREATMENTS
CREATE TABLE treatments (
  id SERIAL PRIMARY KEY,
  treatment_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category_key TEXT NOT NULL CHECK (category_key IN ('pure', 'define', 'beyond')),
  salonized_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- BOOKINGS
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE RESTRICT,
  booking_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed', 'cancelled', 'no_show')),
  booking_token TEXT,
  booked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMP
);

-- TOKENS
CREATE TABLE booking_tokens (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);