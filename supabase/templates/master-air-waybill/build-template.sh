#!/bin/zsh
set -euo pipefail

template_dir="${0:A:h}"

if python3 -c 'import docx' >/dev/null 2>&1; then
  python3 "$template_dir/build-docx.py" \
    "$template_dir/Master_Air_Waybill_Carbone_Template.docx"
else
  uv run --with python-docx python "$template_dir/build-docx.py" \
    "$template_dir/Master_Air_Waybill_Carbone_Template.docx"
fi
