#!/usr/bin/env python3
"""Import June 2026 booking Excel files into index.html as SEED_SCHEDULE_JUNE2026."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

# Reuse parser from May import
from import_may_bookings import parse_bookings, HTML

YEAR, MONTH = 2026, 6
VAR_NAME = "SEED_SCHEDULE_JUNE2026"


def parse_bookings_june(path, tab):
    """Parse with June month/year in keys."""
    import import_may_bookings as m

    old_y, old_m = m.YEAR, m.MONTH
    m.YEAR, m.MONTH = YEAR, MONTH
    try:
        return parse_bookings(path, tab)
    finally:
        m.YEAR, m.MONTH = old_y, old_m


def main():
    pil_path = Path("/Users/oliver/Downloads/Booking June 2026 Pilates.xlsx")
    lag_path = Path("/Users/oliver/Downloads/Booking June 2026 Lagree.xlsx")
    merged = {}
    merged.update(parse_bookings_june(pil_path, "pilates"))
    merged.update(parse_bookings_june(lag_path, "lagree"))

    seed_json = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
    html = HTML.read_text(encoding="utf-8")
    seed_line = f"var {VAR_NAME}={seed_json};"

    if f"var {VAR_NAME}=" in html:
        html, _ = re.subn(
            rf"var {VAR_NAME}=\{{.*?\}};",
            seed_line,
            html,
            count=1,
            flags=re.DOTALL,
        )
    else:
        html = re.sub(
            r"(var SEED_SCHEDULE_MAY2026=\{.*?\};)",
            r"\1\n" + seed_line,
            html,
            count=1,
            flags=re.DOTALL,
        )

    HTML.write_text(html, encoding="utf-8")
    dates = sorted({k.split("|")[1] for k in merged})
    bookings = sum(len(v) for v in merged.values())
    print(f"Imported June 2026: {len(merged)} slots, {bookings} bookings, {len(dates)} days")
    if dates:
        print(f"Date range: {dates[0]} → {dates[-1]}")


if __name__ == "__main__":
    main()
