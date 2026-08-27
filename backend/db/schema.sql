CREATE TABLE product_names (
    product_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    UNIQUE(category, product_name)
);


INSERT INTO product_names (category, product_name)
VALUES
('סרפן קנדי', 'סרפן קנדי'),
('סרפן סיני', 'סרפן סיני'),
('חצאית סיני', 'חצאית סיני'),
('חצאית קנדי', 'חצאית קנדי'),
('סוודר זול', 'סוודר זול'),
('סוודר יקר', 'סוודר יקר'),
('חולצת תלבושת', 'חולצה לבן'),
('חולצת תלבושת', 'חולצה כחול לבן');

CREATE TABLE stock_transfers (
    transfer_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    product_id INT NOT NULL REFERENCES product_names(product_id),
    quantity INT NOT NULL CHECK (quantity > 0),
    transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS user_id INT,
ADD COLUMN IF NOT EXISTS product_id INT;

ALTER TABLE sales
ADD CONSTRAINT fk_sales_user
FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE sales
ADD CONSTRAINT fk_sales_product
FOREIGN KEY (product_id) REFERENCES product_names(product_id);

CREATE INDEX IF NOT EXISTS idx_sales_user_product
ON sales(user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_sales_agent_product_text
ON sales(agent, category, product_name);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_user_product
ON stock_transfers(user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_sales_user_product
ON sales_test(user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_sales_agent_product_text
ON sales_test(agent, category, product_name);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_user_product
ON stock_transfers(user_id, product_id);

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

    COALESCE(t.total_transferred, 0)
    - COALESCE(s.total_sold, 0) AS current_stock

FROM users u
CROSS JOIN product_variants pv
JOIN product_names p
ON p.product_id = pv.product_id

LEFT JOIN (
    SELECT user_id, variant_id, SUM(quantity) AS total_transferred
    FROM stock_transfers
    WHERE variant_id IS NOT NULL
    GROUP BY user_id, variant_id
) t
ON t.user_id = u.id
AND t.variant_id = pv.variant_id

LEFT JOIN (
    SELECT user_id, variant_id, SUM(quantity) AS total_sold
    FROM sales
    WHERE variant_id IS NOT NULL
    GROUP BY user_id, variant_id
) s
ON s.user_id = u.id
AND s.variant_id = pv.variant_id
WHERE u.is_active = TRUE;

CREATE TABLE product_variants (
    variant_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INT NOT NULL REFERENCES product_names(product_id),
    size VARCHAR(20) NOT NULL,
    UNIQUE(product_id, size)
);

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS variant_id INT REFERENCES product_variants(variant_id);

ALTER TABLE stock_transfers
ADD COLUMN IF NOT EXISTS variant_id INT REFERENCES product_variants(variant_id);

CREATE TABLE IF NOT EXISTS supply_orders (
    order_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    agent_name VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'approved', 'received', 'cancelled')),
    notes TEXT,
    email_sent_at TIMESTAMP,
    email_error TEXT,
    approved_at TIMESTAMP,
    approved_by VARCHAR(100),
    agent_received_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supply_order_items (
    item_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INT NOT NULL REFERENCES supply_orders(order_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES product_names(product_id),
    variant_id INT NOT NULL REFERENCES product_variants(variant_id),
    category VARCHAR(100) NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    size VARCHAR(20) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supply_orders_agent_status
ON supply_orders(agent_name, status);

CREATE INDEX IF NOT EXISTS idx_supply_orders_user_status
ON supply_orders(user_id, status);

CREATE INDEX IF NOT EXISTS idx_supply_order_items_order
ON supply_order_items(order_id);
