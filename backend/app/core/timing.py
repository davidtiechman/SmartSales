from contextlib import contextmanager
import time


@contextmanager
def timed_action(label: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"[timing] {label} took {elapsed_ms:.2f} ms")
