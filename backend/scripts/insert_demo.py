from backend.app.db.supabase import get_supabase, get_supabase_admin


def insert_demo_sale(**payload):
    response = get_supabase_admin().table("sales_test").insert(payload).execute()
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)
    return response.data

def main():
    get_supabase()
    print("✅ חיבור ל-Supabase הצליח")

    insert_demo_sale(
        product_name="חולצה כחול לבן",
        size="4",
        quantity=2,
        category="חולצת תלבושת",
        client_name="לקוח ניסוי",
        payment_method="אשראי",
        agent="סוכן דמו",
    )

    insert_demo_sale(
        product_name="חולצה לבן",
        size="20",
        quantity=1,
        category="חולצת תלבושת",
        client_name="לקוח ניסוי",
        payment_method="מזומן",
        agent="סוכן דמו",
    )

    insert_demo_sale(
        product_name="סרפן קנדי",
        size="6X",
        quantity=2,
        category="סרפן קנדי",
        client_name="לקוח ניסוי",
        payment_method="אשראי",
        agent="סוכן דמו",
    )

    insert_demo_sale(
        product_name="סרפן סיני",
        size="7",
        quantity=1,
        category="סרפן סיני",
        client_name="לקוח ניסוי",
        payment_method="מזומן",
        agent="סוכן דמו",
    )

    insert_demo_sale(
        product_name="חצאית סיני",
        size="14",
        quantity=2,
        category="חצאית סיני",
        client_name="לקוח ניסוי",
        payment_method="העברה בנקאית",
        agent="סוכן דמו",
    )

    print("🎉 כל ה־INSERT-ים הוזנו בהצלחה ל־sales_test")

if __name__ == "__main__":
    main()
