"""Extracts the VBA source text of the Chartres OEE workbooks WITHOUT running anything.
An .xlsm is a zip; xl/vbaProject.bin is an OLE file whose module streams hold
compressed source (MS-OVBA). This reads the bytes and decompresses them, nothing else.
Usage: python -I scripts/helper-chartres-vba-extract.py <downloads/Chartres> <new out folder>
Writes <out>/<module>__<hash>.bas (one file per distinct version) and <out>/index.json.
"""
import hashlib
import json
import math
import os
import site
import struct
import sys
import zipfile

# -I hides the user site; olefile (a library, not data) lives there.
sys.path.append(site.getusersitepackages())
import olefile  # noqa: E402


def decompress(data):
    """MS-OVBA 2.4.1 decompression of a compressed container."""
    if not data or data[0] != 1:
        raise ValueError("not a compressed container")
    out = bytearray()
    pos = 1
    while pos < len(data):
        header = struct.unpack("<H", data[pos:pos + 2])[0]
        size = (header & 0x0FFF) + 3
        compressed = (header & 0x8000) >> 15
        end = min(len(data), pos + size)
        if not compressed:
            out += data[pos + 2:pos + 2 + 4096]
            pos += 4098
            continue
        pos += 2
        chunk_start = len(out)
        while pos < end:
            flags = data[pos]
            pos += 1
            for bit in range(8):
                if pos >= end:
                    break
                if not (flags >> bit) & 1:
                    out.append(data[pos])
                    pos += 1
                else:
                    token = struct.unpack("<H", data[pos:pos + 2])[0]
                    pos += 2
                    diff = len(out) - chunk_start
                    bits = max(math.ceil(math.log2(diff)), 4) if diff > 1 else 4
                    length_mask = 0xFFFF >> bits
                    length = (token & length_mask) + 3
                    offset = ((token & ~length_mask & 0xFFFF) >> (16 - bits)) + 1
                    for _ in range(length):
                        out.append(out[-offset])
    return bytes(out)


def modules_of(ole):
    """Yields (module name, stream name, source offset) from the dir stream."""
    d = decompress(ole.openstream("VBA/dir").read())
    pos = 0
    name = stream = None
    while pos + 6 <= len(d):
        rec_id, size = struct.unpack("<HI", d[pos:pos + 6])
        if rec_id == 0x0009:
            size = 6
        body = d[pos + 6:pos + 6 + size]
        pos += 6 + size
        if rec_id == 0x0019:
            name = body.decode("cp1252", "replace")
        elif rec_id == 0x001A:
            stream = body.decode("cp1252", "replace")
        elif rec_id == 0x0031:
            yield name, stream, struct.unpack("<I", body)[0]


def source_of(ole, stream, offset):
    raw = ole.openstream(f"VBA/{stream}").read()
    return decompress(raw[offset:]).decode("cp1252", "replace").replace("\r\n", "\n")


def main(root, out):
    if os.path.exists(out) and os.listdir(out):
        raise SystemExit(f"{out} is not empty: use a new folder")
    os.makedirs(out, exist_ok=True)
    index = {}
    for dirpath, _, names in os.walk(root):
        for n in names:
            rel = os.path.relpath(os.path.join(dirpath, n), root).replace("\\", "/")
            parts = rel.split("/")
            if not (len(parts) == 4 and parts[2] == "SAISIE OEE" and n.startswith("OEE ") and n.endswith(".xlsm")):
                continue
            with zipfile.ZipFile(os.path.join(dirpath, n)) as z:
                if "xl/vbaProject.bin" not in z.namelist():
                    continue
                blob = z.read("xl/vbaProject.bin")
            tmp = os.path.join(out, "_tmp.bin")
            with open(tmp, "wb") as f:
                f.write(blob)
            ole = olefile.OleFileIO(tmp)
            for name, stream, offset in modules_of(ole):
                text = source_of(ole, stream, offset)
                h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
                safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)
                fn = f"{safe}__{h}.bas"
                if not os.path.exists(os.path.join(out, fn)):
                    with open(os.path.join(out, fn), "w", encoding="utf-8") as f:
                        f.write(text)
                entry = index.setdefault(name, {}).setdefault(h, {"file": fn, "lines": text.count("\n"), "workbooks": []})
                entry["workbooks"].append(rel)
            ole.close()
            os.remove(tmp)
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
    for name, versions in sorted(index.items()):
        print(f"{name}: {len(versions)} version(s): " + ", ".join(f"{h} ({v['lines']} lines, {len(v['workbooks'])} files)" for h, v in versions.items()))


main(sys.argv[1], sys.argv[2])
