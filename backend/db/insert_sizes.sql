INSERT INTO product_variants (product_id, size)
VALUES
-- סרפן קנדי
(1, '6'),
(1, '6X'),
(1, '7'),
(1, '8'),
(1, '10'),
(1, '12'),
(1, '14'),
(1, '16'),

-- סרפן סיני
(2, '6'),
(2, '7'),
(2, '8'),
(2, '9'),
(2, '10'),
(2, '12'),
(2, '14'),
(2, '16')

ON CONFLICT (product_id, size) DO NOTHING;

INSERT INTO product_variants (product_id, size)
SELECT 7, size::text
FROM generate_series(4, 60, 2) AS size

UNION ALL

SELECT 8, size::text
FROM generate_series(4, 60, 2) AS size

ON CONFLICT (product_id, size) DO NOTHING;