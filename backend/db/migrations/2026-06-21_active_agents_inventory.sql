-- Exclude inactive agents from the inventory view used by inventory and sales flows.
CREATE OR REPLACE VIEW agent_inventory AS
SELECT
    u.id AS user_id,
    u.agent_name,
    pv.variant_id,
    p.product_id,
    p.category,
    p.product_name,
    pv.size,
    COALESCE(t.total_transferred, 0) AS total_transferred,
    COALESCE(s.total_sold, 0) AS total_sold,
    COALESCE(t.total_transferred, 0) - COALESCE(s.total_sold, 0) AS current_stock
FROM users u
CROSS JOIN product_variants pv
JOIN product_names p ON p.product_id = pv.product_id
LEFT JOIN (
    SELECT user_id, variant_id, SUM(quantity) AS total_transferred
    FROM stock_transfers
    WHERE variant_id IS NOT NULL
    GROUP BY user_id, variant_id
) t ON t.user_id = u.id AND t.variant_id = pv.variant_id
LEFT JOIN (
    SELECT user_id, variant_id, SUM(quantity) AS total_sold
    FROM sales
    WHERE variant_id IS NOT NULL
    GROUP BY user_id, variant_id
) s ON s.user_id = u.id AND s.variant_id = pv.variant_id
WHERE u.is_active = TRUE;
