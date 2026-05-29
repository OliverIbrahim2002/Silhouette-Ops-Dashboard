#!/usr/bin/env python3
"""Import May 2026 booking Excel files into index.html as SEED_SCHEDULE_MAY2026."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HTML = Path(__file__).parent / "index.html"
YEAR, MONTH = 2026, 5  # overridden by import_june_bookings.py when needed
SKIP_NAMES = {"client", "hour", "date", "total", "rendre 20 caisse"}
SKIP_SUBSTR = ("int pil", "caisse")


def _sheet_rows(z, sheet_path, shared):
    sheet = ET.fromstring(z.read(sheet_path))
    grid = {}
    for row in sheet.findall("m:sheetData/m:row", NS):
        for c in row.findall("m:c", NS):
            ref = c.get("r", "")
            col = "".join(x for x in ref if x.isalpha())
            row_i = int("".join(x for x in ref if x.isdigit()) or "0") - 1
            t = c.get("t")
            v = c.find("m:v", NS)
            if v is None or v.text is None:
                val = ""
            elif t == "s":
                val = shared[int(v.text)] if int(v.text) < len(shared) else v.text
            else:
                val = v.text
            grid[(row_i, col)] = str(val).strip()
    if not grid:
        return [], []
    max_row = max((r for r, _ in grid), default=0)
    cols = sorted({c for _, c in grid}, key=lambda s: sum((ord(ch) - 64) * (26 ** i) for i, ch in enumerate(reversed(s))))
    rows = [[grid.get((r, c), "") for c in cols] for r in range(max_row + 1)]
    return rows, cols


def read_xlsx(path):
    """Read all worksheets and concatenate rows (each sheet = weekly blocks)."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                texts = [t.text or "" for t in si.findall(".//m:t", NS)]
                shared.append("".join(texts))
        sheets = sorted(
            n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml") and "/_" not in n
        )
        all_rows = []
        cols = []
        for sp in sheets:
            rows, cols = _sheet_rows(z, sp, shared)
            if rows:
                all_rows.extend(rows)
                all_rows.append([])  # separator between sheets
        return all_rows, cols


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def normalize_hour(hr):
    """Excel uses 8–12 for morning and 1–7 for afternoon (1pm–7pm)."""
    if 1 <= hr <= 7:
        return hr + 12
    return hr


def valid_client(name):
    if not name or len(name) < 2:
        return False
    low = name.lower().strip()
    if low in SKIP_NAMES:
        return False
    if any(s in low for s in SKIP_SUBSTR):
        return False
    if re.match(r"^\d+(\.\d+)?$", low):
        return False
    if low.startswith("room"):
        return False
    return True


def parse_bookings(path, tab):
    rows, col_letters = read_xlsx(path)
    sched = {}
    i = 0
    while i < len(rows):
        row = rows[i]
        if not row:
            i += 1
            continue
        blocks = [(ci, cell) for ci, cell in enumerate(row) if cell.upper().startswith("ROOM")]
        if not blocks:
            i += 1
            continue

        dom_by_block = {}
        last_dom = None
        i += 1
        if i < len(rows) and rows[i] and rows[i][0].lower() == "date":
            date_row = rows[i]
            for bi, (ci, room) in enumerate(blocks):
                dom = None
                if ci + 1 < len(date_row) and date_row[ci + 1]:
                    try:
                        dom = int(float(date_row[ci + 1]))
                    except ValueError:
                        pass
                if dom is None:
                    dom = last_dom
                if dom is not None:
                    last_dom = dom
                dom_by_block[bi] = dom
            i += 1

        # Skip blank / notes rows until Hour row
        while i < len(rows) and rows[i] and rows[i][0].lower() != "hour":
            i += 1
        if i < len(rows) and rows[i][0].lower() == "hour":
            i += 1

        # Hour rows until next ROOM or end
        while i < len(rows):
            hr_row = rows[i]
            if not hr_row:
                i += 1
                continue
            if any(c.upper().startswith("ROOM") for c in hr_row if c):
                break

            for bi, (ci, room) in enumerate(blocks):
                if ci >= len(hr_row):
                    continue
                hr = None
                try:
                    hr = normalize_hour(int(float(hr_row[ci])))
                except ValueError:
                    pass
                if hr is None and ci == blocks[0][0]:
                    try:
                        hr = normalize_hour(int(float(hr_row[0])))
                    except ValueError:
                        pass
                if hr is None or hr < 8 or hr > 20:
                    continue
                dom = dom_by_block.get(bi)
                if not dom or dom < 1 or dom > 31:
                    continue
                dk = f"{YEAR}-{MONTH:02d}-{dom:02d}"
                next_ci = blocks[bi + 1][0] if bi + 1 < len(blocks) else len(hr_row)
                clients = []
                for cj in range(ci + 1, min(next_ci, len(hr_row))):
                    name = hr_row[cj].strip()
                    if valid_client(name):
                        clients.append(name)
                if clients:
                    key = f"{tab}|{dk}|{room}|{hr}"
                    bucket = sched.setdefault(key, [])
                    for c in clients:
                        if c not in bucket:
                            bucket.append(c)
            i += 1
    return sched


def main():
    pil_path = Path("/Users/oliver/Downloads/Booking May 2026 Pilates (1).xlsx")
    lag_path = Path("/Users/oliver/Downloads/Booking May 2026 Lagree (1).xlsx")
    merged = {}
    merged.update(parse_bookings(pil_path, "pilates"))
    merged.update(parse_bookings(lag_path, "lagree"))

    seed_json = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
    html = HTML.read_text(encoding="utf-8")

    seed_line = f"var SEED_SCHEDULE_MAY2026={seed_json};"
    if "var SEED_SCHEDULE_MAY2026=" in html:
        html, n = re.subn(
            r"var SEED_SCHEDULE_MAY2026=\{.*?\};",
            seed_line,
            html,
            count=1,
            flags=re.DOTALL,
        )
    else:
        html = html.replace(
            "<script>\nconst HOURS=",
            f"<script>\n{seed_line}\nconst HOURS=",
            1,
        )

    HTML.write_text(html, encoding="utf-8")
    dates = sorted({k.split("|")[1] for k in merged})
    bookings = sum(len(v) for v in merged.values())
    print(f"Imported May 2026: {len(merged)} slots, {bookings} bookings, {len(dates)} days")
    print(f"Date range: {dates[0]} → {dates[-1]}" if dates else "no dates")


if __name__ == "__main__":
    main()
