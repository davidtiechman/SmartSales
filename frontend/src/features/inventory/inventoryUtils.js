import { categorySizes } from "../../constants/catalog.js";

export function getVariantSortValue(category, size) {
  const sizes = categorySizes[category] || [];
  const index = sizes.indexOf(String(size));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function getProductKey(item) {
  return `${item.product_id}-${item.category}-${item.product_name}`;
}

export function groupInventoryByProduct(items) {
  const productsByKey = new Map();
  items.forEach((item) => {
    const key = getProductKey(item);
    if (!productsByKey.has(key)) {
      productsByKey.set(key, {
        key,
        product_id: item.product_id,
        category: item.category,
        product_name: item.product_name,
        sizes: [],
      });
    }
    productsByKey.get(key).sizes.push(item);
  });

  return [...productsByKey.values()].map((product) => ({
    ...product,
    sizes: product.sizes.sort(
      (first, second) =>
        getVariantSortValue(product.category, first.size) -
          getVariantSortValue(product.category, second.size) ||
        String(first.size).localeCompare(String(second.size), "he")
    ),
  }));
}

export function getInventorySummary(items, mode = "stock") {
  const quantityField = mode === "allocations" ? "total_transferred" : "current_stock";

  return {
    productsInStock: new Set(
      items
        .filter((item) => Number(item[quantityField] || 0) > 0)
        .map(getProductKey)
    ).size,
    totalStock: items.reduce((sum, item) => sum + Number(item[quantityField] || 0), 0),
    totalTransferred: items.reduce(
      (sum, item) => sum + Number(item.total_transferred || 0),
      0
    ),
  };
}

export function buildProductsFromInventory(inventoryItems) {
  const productsById = new Map();
  inventoryItems.forEach((item) => {
    if (!item.product_id || !item.variant_id) {
      return;
    }
    if (!productsById.has(item.product_id)) {
      productsById.set(item.product_id, {
        product_id: item.product_id,
        category: item.category,
        product_name: item.product_name,
        variants: [],
      });
    }

    const product = productsById.get(item.product_id);
    const exists = product.variants.some(
      (variant) => String(variant.variant_id) === String(item.variant_id)
    );
    if (!exists) {
      product.variants.push({
        variant_id: item.variant_id,
        product_id: item.product_id,
        size: item.size,
      });
    }
  });
  return [...productsById.values()];
}

