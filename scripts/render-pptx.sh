#!/bin/bash
# Renders a pptx to jpg images for a look (LibreOffice + poppler, installed with winget).
# Usage: bash scripts/render-pptx.sh <deck.pptx> <empty-or-new folder>
set -e
deck="$1"
out="$2"
mkdir -p "$out"
"/c/Program Files/LibreOffice/program/soffice.exe" --headless --convert-to pdf --outdir "$out" "$deck" >/dev/null 2>&1
pdf="$out/$(basename "${deck%.pptx}").pdf"
pdftoppm=$(find "/c/Users/$USERNAME/AppData/Local/Microsoft/WinGet/Packages" -name pdftoppm.exe 2>/dev/null | head -1)
rm -f "$out"/slide-*.jpg
"$pdftoppm" -jpeg -r 80 "$pdf" "$out/slide"
ls "$out"/slide-*.jpg
