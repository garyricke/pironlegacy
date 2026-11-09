#!/bin/zsh
# Render every print/set/cardNN.html to cardNN-PRESS.pdf (no guides) and
# cardNN-PROOF.pdf (trim/safe guides), plus 300dpi PNG previews in png/.
# Headless Chrome writes the PDF and then hangs on exit, so each run is
# wrapped in a bounded wait-and-kill loop.
set -u
cd "${0:A:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p png

pdf() { # $1 = url, $2 = out.pdf
  rm -f "$2"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 \
    --user-data-dir="$(mktemp -d)" --print-to-pdf="$2" "$1" >/dev/null 2>&1 &
  local pid=$! i=0
  while (( i < 60 )); do
    [[ -s "$2" ]] && sleep 2 && break
    sleep 1; (( i++ ))
  done
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
  [[ -s "$2" ]] || { echo "FAILED $2"; return 1; }
}

for f in card[01][0-9].html; do
  b=${f%.html}
  pdf "file://$PWD/$f" "$b-PRESS.pdf"
  sed 's/<body>/<body class="proof">/' "$f" > ".$b-proof.html"
  pdf "file://$PWD/.$b-proof.html" "$b-PROOF.pdf"
  rm -f ".$b-proof.html"
  pdftoppm -r 300 -png "$b-PRESS.pdf" "png/$b"
  echo "ok $b"
done
