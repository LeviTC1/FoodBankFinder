INSERT INTO foodbanks (
  name,
  organisation,
  address,
  postcode,
  latitude,
  longitude,
  geom,
  phone,
  email,
  website,
  opening_hours,
  referral_required,
  referral_type,
  notes,
  source,
  created_at,
  updated_at
)
VALUES (
  'Community Kitchen Camden',
  'Independent Food Aid Network',
  '123 Sample Street, London',
  'NW1 1AA',
  51.5382,
  -0.1438,
  ST_SetSRID(ST_MakePoint(-0.1438, 51.5382), 4326)::geography,
  '020 7000 0000',
  'hello@example.org',
  'https://example.org',
  'Mon-Fri 09:00-16:00',
  false,
  'none',
  'Sample seed record for local development.',
  'manual',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
