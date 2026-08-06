#!/bin/zsh
set -euo pipefail

template_dir="${0:A:h}"
reference_pdf="${1:-/Users/harryphillips/Downloads/SHEAXJ045060-891936_ABFWBJ0.pdf}"

if python3 -c 'import docx, PIL' >/dev/null 2>&1; then
  python3 "$template_dir/generate-reference-assets.py" "$reference_pdf" "$template_dir/assets"
  python3 "$template_dir/build-docx.py" "$template_dir/MNG_Air_Waybill_Carbone_Template.docx"
else
  uv run --with python-docx --with pillow python "$template_dir/generate-reference-assets.py" "$reference_pdf" "$template_dir/assets"
  uv run --with python-docx --with pillow python "$template_dir/build-docx.py" "$template_dir/MNG_Air_Waybill_Carbone_Template.docx"
fi
