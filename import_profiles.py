#!/usr/bin/env python3
"""Import Client Profiles/*.xlsx into index.html CLIENT_PROFILES."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

FOLDER = Path("/Users/oliver/Downloads/Client Profiles")
HTML = Path(__file__).parent / "index.html"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def excel_date(val):
    if val is None:
        return ""
    s = str(val).strip()
    if not s:
        return ""
    try:
        n = float(s)
        if 1 < n < 100000:
            d = datetime(1899, 12, 30) + timedelta(days=n)
            return d.strftime("%Y-%m-%d")
    except ValueError:
        pass
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    return s


def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                texts = [t.text or "" for t in si.findall(".//m:t", NS)]
                shared.append("".join(texts))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in sheet.findall("m:sheetData/m:row", NS):
            cells = []
            for c in row.findall("m:c", NS):
                t = c.get("t")
                v = c.find("m:v", NS)
                if v is None or v.text is None:
                    val = ""
                elif t == "s":
                    idx = int(v.text)
                    val = shared[idx] if idx < len(shared) else v.text
                else:
                    val = v.text
                cells.append(val)
            if any(str(x).strip() for x in cells):
                rows.append(cells)
        return rows


def parse_profile(rows, fallback_name):
    data = {"nm": fallback_name, "ph": "", "src": "", "sch": "", "pk": [], "at": []}
    in_attendance = False

    i = 0
    while i < len(rows):
        row = rows[i]
        label = str(row[0]).strip() if row else ""
        rest = [str(x).strip() for x in row[1:]] if len(row) > 1 else []

        if label == "Name":
            if rest and rest[0]:
                data["nm"] = rest[0]
            if len(rest) > 1:
                data["sch"] = " ".join(x for x in rest[1:] if x)
        elif label == "Phone Number":
            data["ph"] = rest[0] if rest else ""
        elif label == "CRM":
            data["src"] = rest[0] if rest else ""
        elif label == "Membership Type":
            types = [x for x in rest if x]
            sess_row = rows[i + 1] if i + 1 < len(rows) else []
            start_row = rows[i + 2] if i + 2 < len(rows) else []
            end_row = rows[i + 3] if i + 3 < len(rows) else []
            sess_vals = (
                [str(x).strip() for x in sess_row[1:]]
                if sess_row and "# Sessions" in str(sess_row[0])
                else []
            )
            start_vals = start_row[1:] if start_row and "Start Date" in str(start_row[0]) else []
            end_vals = end_row[1:] if end_row and "Expiry Date" in str(end_row[0]) else []
            n = max(len(types), len(sess_vals), len(start_vals), len(end_vals), 1)
            packages = []
            for j in range(n):
                t = types[j] if j < len(types) else (types[-1] if types else "Group")
                s = sess_vals[j] if j < len(sess_vals) else ""
                sd = excel_date(start_vals[j]) if j < len(start_vals) else ""
                ed = excel_date(end_vals[j]) if j < len(end_vals) else ""
                if t or s or sd or ed:
                    packages.append({"t": t, "s": s, "sd": sd, "ed": ed})
            data["pk"] = packages
            i += 3
        elif label == "Class Attendance Log:":
            in_attendance = True
        elif in_attendance:
            if label == "Date":
                pass
            elif label:
                d = excel_date(label) or label
                note = rest[0] if rest else ""
                if d and d != "Date":
                    data["at"].append({"d": d, "n": note})
        i += 1

    if data["pk"]:
        last = data["pk"][-1]
        data["ct"] = last["t"]
        data["cs"] = last["s"]
        data["csd"] = last["sd"]
        data["ced"] = last["ed"]
    else:
        data["ct"] = data["cs"] = data["csd"] = data["ced"] = ""

    return data


def main():
    profiles = []
    for f in sorted(FOLDER.glob("*.xlsx")):
        if f.name == "Client Profile.xlsx":
            continue
        name = f.stem.strip()
        rows = read_xlsx(f)
        if not rows:
            continue
        profiles.append(parse_profile(rows, name))

    profiles.sort(key=lambda p: p["nm"].lower())
    profile_names = {p["nm"].lower() for p in profiles}

    html = HTML.read_text(encoding="utf-8")
    existing = []
    m = re.search(r"var CLIENTLIST=(\[.*?\]);", html, re.DOTALL)
    if m:
        existing = json.loads(m.group(1))

    merged = [p["nm"] for p in profiles]
    seen = set(profile_names)
    for name in existing:
        key = name.lower()
        if key not in seen:
            merged.append(name)
            seen.add(key)
    merged.sort(key=str.lower)

    profiles_json = json.dumps(profiles, ensure_ascii=False, separators=(",", ":"))
    names_json = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))

    html, n1 = re.subn(
        r"var CLIENT_PROFILES=\[.*?\];",
        f"var CLIENT_PROFILES={profiles_json};",
        html,
        count=1,
        flags=re.DOTALL,
    )
    html, n2 = re.subn(
        r"var CLIENTLIST=\[.*?\];",
        f"var CLIENTLIST={names_json};",
        html,
        count=1,
        flags=re.DOTALL,
    )

    if not n1 or not n2:
        raise SystemExit("Failed to replace CLIENT_PROFILES or CLIENTLIST in index.html")

    HTML.write_text(html, encoding="utf-8")
    extra = len(merged) - len(profiles)
    print(f"Imported {len(profiles)} client profiles into index.html")
    print(f"Updated CLIENTLIST with {len(merged)} names ({extra} without Excel profile)")


if __name__ == "__main__":
    main()
