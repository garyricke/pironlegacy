#!/usr/bin/env python3
"""Build the 10-card Piron Legacy donor set as press-ready HTML.

Every card inherits print/card03/card03.html's press geometry (2.5x3.5 trim,
0.125in bleed, 2.75x3.75 page), copied once into card-base.css.

    python3 print/set/build.py          -> print/set/cardNN.html (front + back)
    then render.sh                      -> cardNN-PRESS.pdf / cardNN-PROOF.pdf

RULES baked into this copy (see project memory):
  - Never invent his stats. Only facts that are public or that Dennis/his
    family/Gary confirmed: 1980-83, #89, receiver, ~700 INCubator students,
    10 years, retired from teaching 2026, 8-3 in 2026. "16 straight playoff
    years" is a PROGRAM streak (may predate him as HC) -- keep it off his cards.
  - Joke stat lines must read as jokes (CARRIES 0, BEAR 1), never as records.
  - Coaching retirement is NOT announced: no "last/final season/game".
  - Scholarship is for college, trade school or an apprenticeship; number of
    recipients is undecided, so never say "one senior".
  - Card 08 is the wedding portrait (family scan); the #81 Mentor card was retired Nov 9 2026.
"""
import html, pathlib

HERE = pathlib.Path(__file__).parent
CSS = (HERE / "card-base.css").read_text()
QR = (HERE / "qr-root.svg").read_text()   # https://pironlegacy.org (zbarimg-verified)
CL = "https://res.cloudinary.com/dsbllwpbh/image/upload/"
FILL = "c_fill,w_1200,h_1419,g_auto:faces,q_95,f_jpg/"
CED = "Photo: Ced Jay Photography."
FINE = ("The Dennis Piron Legacy Scholarship, held by the Batavia Foundation for "
        "Educational Excellence, a 501(c)(3). Gifts tax-deductible as allowed by law.")

EXTRA_CSS = """
/* Card 05 relic window: a swatch of lanyard is glued here by hand. */
.relic{position:absolute;left:.09in;bottom:.09in;width:.78in;height:.52in;background:var(--paper);
  border:.02in solid var(--gold);outline:.01in solid var(--maroon);outline-offset:-.045in;
  display:flex;align-items:flex-end;justify-content:center}
.relic span{font:800 3.6pt 'Montserrat',sans-serif;letter-spacing:.012in;color:#8b8578;padding-bottom:.03in}
.relic-tag{position:absolute;left:.09in;bottom:.625in;background:var(--maroon);color:var(--gold);
  font:900 4.2pt 'Montserrat',sans-serif;letter-spacing:.015in;padding:.02in .05in}
.serial{font-family:'Courier Prime',monospace;font-weight:700;color:#14161a;font-size:6pt}
.statline td{font-size:9.6pt}
"""

CARDS = [
 dict(n="01", team="ROOKIE CARD", nm="DENNIS PIRON", pos="Age 1 &middot; Undrafted",
      img="c_fill,w_1200,h_1419,g_center,q_95,f_jpg/v1787076418/piron-legacy/cards/baby-real.jpg",
      alt="Dennis Piron as a baby with a teddy bear",
      bnm="DENNIS PIRON", bpos="Rookie Card &middot; Age 1",
      stats=[("AGE","1"),("TEAMS","0"),("CARRIES","0"),("BEAR","1")],
      story="No record. No film. No scouting report.<br><br>Before anyone had a reason to, "
            "somebody believed in him. <b>That&rsquo;s what this scholarship does for the next "
            "Batavia kid</b>, for college, trade school or an apprenticeship. Every year, for good.",
      ask=("Thank you for giving.", "You&rsquo;re holding the first of ten. Scan to see the whole set."),
      credit="Piron family photo."),
 dict(n="02", team="SCOUTING REPORT", nm="DENNIS PIRON", pos="The Prospect",
      img="c_crop,x_90,y_45,w_1760,h_2830/c_fill,w_1200,h_1419,g_auto:faces,q_95,f_jpg/v1787076412/piron-legacy/cards/prospect-real.jpg",
      alt="Dennis Piron as a grade-school boy, picture day",
      bnm="THE PROSPECT", bpos="Scouting Report &middot; Grade School",
      stats=[("MOTOR","A+"),("COACHABLE","A"),("CONDUCT","B&minus;"),("HAIR","1970s")],
      story="<b>SCOUT&rsquo;S NOTES:</b> High motor. Coachable. Natural leader. Other kids listen "
            "to him, which is either a gift or a discipline problem depending on the day.<br><br>"
            "<b>PROJECTION:</b> Teacher. Coach. Both, probably. Will spend decades giving other "
            "people&rsquo;s kids the thing he got.",
      ask=("The projection was right.", "Help make it permanent at pironlegacy.org."),
      credit="Piron family photo."),
 dict(n="03", team="BATAVIA &middot; 89", nm="DENNIS PIRON", pos="Batavia &middot; Receiver &middot; 1980&ndash;83",
      img="q_95,f_jpg/v1787077358/piron-legacy/cards/player-89-cardfront.jpg",
      alt="Dennis Piron in a Batavia football uniform, number 89",
      bnm="THE PLAYER", bpos="Batavia Bulldogs &middot; #89",
      stats=[("SCHOOL","BATAVIA"),("POSITION","RECEIVER"),("YEARS","1980&ndash;83"),("NUMBER","89")],
      story="Batavia. 1980 to &rsquo;83. A receiver wearing <b>89</b>.<br><br>"
            "This is the hinge of the set. On this card he&rsquo;s a Batavia kid being coached. "
            "On every card after it, he&rsquo;s the one doing the coaching, and eventually the "
            "teaching, which turned out to be the same job with different equipment.",
      ask=("Cards 4 through 10:", "what he did with it. pironlegacy.org"),
      credit="Piron family photo, never before published."),
 dict(n="04", team="BATAVIA BULLDOGS", nm="DENNIS PIRON", pos="Head Coach &middot; Batavia Bulldogs",
      img="c_crop,x_900,y_0,w_3450,h_4078/c_fill,w_1200,h_1419,q_95,f_jpg/v1787076273/piron-legacy/cards/headcoach-fay.jpg",
      alt="Coach Dennis Piron on the sideline, arms crossed",
      bnm="DENNIS PIRON", bpos="Head Coach &middot; Batavia Bulldogs",
      stats=[("2026","8&ndash;3"),("ALMA MATER","BATAVIA"),("WORE","#89"),("ARMS","CROSSED")],
      story="Friday nights, arms crossed, on the Bulldog sideline.<br><br>"
            "Dennis retired from teaching in 2026. What ended was the classroom, and that is "
            "exactly what this scholarship carries on: <b>the next Batavia senior, funded every "
            "single year, permanently.</b>",
      ask=("Scan it. Give.", "The Dunham Foundation doubles the first $50,000, dollar for dollar."),
      credit=CED),
 dict(n="05", team="CLASS PHOTO", nm="DENNIS PIRON", pos="Picture Day",
      img="c_fill,w_1200,h_1419,g_auto:faces,q_95,f_jpg/v1794263925/piron-legacy/cards/teen-glasses-real.jpg",
      alt="Dennis Piron as a teenager in glasses, school portrait",
      bnm="PICTURE DAY", bpos="Class Portrait",
      stats=[("FRAMES","XL"),("HAIR","MAXIMUM"),("SWEATER","V-NECK"),("COLLAR","OUT")],
      story="Before the headset, the whistle and all those Friday nights, there was picture day.<br><br>"
            "Big frames. Bigger hair. A Batavia kid with no idea he&rsquo;d spend his life on the "
            "other side of the desk, <b>making sure the next kid in that chair had someone in "
            "their corner.</b>",
      ask=("Went to school with him?", "Pass it on. pironlegacy.org"),
      credit="Piron family photo."),
 dict(n="06", team="BATAVIA BULLDOGS", nm="DENNIS PIRON", pos="Still Got It",
      img="c_fill,w_1200,h_1419,g_auto:faces,q_95,f_jpg/v1794263926/piron-legacy/cards/coach-young-real.jpg",
      alt="A young Coach Dennis Piron in sunglasses, winding up to throw a football",
      bnm="STILL GOT IT", bpos="Sideline &middot; Undisputed",
      stats=[("ARM","CLASSIFIED"),("SPIRAL","TIGHT-ISH"),("ASKED TO","NO"),("POINT MADE","YES")],
      story="Nobody asked him to throw it. He threw it anyway, in front of teenagers with "
            "younger arms and better knees, in sunglasses, at full commitment.<br><br>"
            "Every player he ever coached has seen this exact face.",
      ask=("Played for him? Then you know.", "Pass it on at pironlegacy.org"),
      credit="Piron family photo."),
 dict(n="07", team="BATAVIA BULLDOGS", nm="DENNIS PIRON", pos="Three-Piece",
      img="c_fill,w_1200,h_1419,g_auto:faces,q_95,f_jpg/v1794269398/piron-legacy/cards/suit-portrait-real.jpg",
      alt="A young Dennis Piron in a corduroy three-piece suit, studio portrait",
      bnm="THREE-PIECE", bpos="Studio Portrait &middot; Formal",
      stats=[("CORDUROY","100%"),("VEST","YES"),("TIE","KNIT"),("CURLS","UNTAMED")],
      story="Three pieces. All corduroy. Gazing off toward a future nobody in that studio "
            "could have guessed.<br><br>"
            "When he walked out of the classroom in 2026, a group of us decided that "
            "shouldn&rsquo;t be the end of it. <b>So we&rsquo;re making it permanent.</b>",
      ask=("Make it permanent.", "Every dollar doubled by the Dunham Foundation, up to $50,000."),
      credit="Piron family photo."),
 dict(n="08", team="BATAVIA BULLDOGS", nm="DENNIS PIRON", pos="Best Pick",
      img="c_fill,w_1200,h_1419,g_north,q_95,f_jpg/v1794270148/piron-legacy/cards/wedding-couple-real.jpg",
      alt="Dennis Piron in a tuxedo with his bride on their wedding day",
      bnm="BEST PICK", bpos="Off the Field &middot; Wedding Day",
      stats=[("TUX","BLACK"),("BOW TIE","YES"),("ROSES","RED"),("BEST CALL","THIS ONE")],
      story="Every coach will tell you the biggest calls get made off the field. "
            "This was his.<br><br>"
            "Behind every Friday night, every late class and every kid who needed someone "
            "in their corner, <b>there was a family making room for it.</b>",
      ask=("Back the whole team.", "Every dollar doubled by the Dunham Foundation, up to $50,000."),
      credit="Piron family photo."),
 dict(n="09", team="INCUBATOR@BHS", nm="MR. PIRON", pos="INCubator@BHS &middot; Teacher",
      img=FILL + "piron-legacy/cards/teamday-kilburg.jpg",
      alt="Dennis Piron portrait in a Batavia Football shirt",
      bnm="MR. PIRON", bpos="INCubator@BHS &middot; Teacher",
      stats=[("YEARS","10"),("STUDENTS","~700"),("CLASS","INCUBATOR"),("RETIRED","2026")],
      story="In his class, teenagers built real companies. In 2026 a student team built "
            "<b>The Windmill Weekly</b>, a large-type newspaper for care-center residents, "
            "because a grandmother missed her paper.<br><br>"
            "&ldquo;What good people children are. Given the opportunity to serve&hellip; how "
            "willing they are to do it.&rdquo; <b>&mdash;&nbsp;Dennis Piron</b>",
      ask=("Keep his classroom going.", "Give at pironlegacy.org"),
      credit="Photo: Kathleen Kilburg Photography."),
 dict(n="10", team="THE LEGACY", nm="DENNIS PIRON", pos="The Legacy &middot; Endowed Forever",
      img=FILL + "piron-legacy/cedjay/cedjay-piron-06.jpg",
      alt="Coach Dennis Piron walking off the field at night in a 100 hoodie",
      bnm="THE LEGACY", bpos="Endowed Scholarship",
      stats=[("GOAL","$100,000"),("MATCH","$50,000"),("AWARDED","YEARLY"),("LASTS","FOREVER")],
      story="Endowed means the fund is never spent. It&rsquo;s invested, and what it earns pays "
            "Batavia High School scholarships for college, trade school or an apprenticeship: "
            "this year, next year, and in a year when nobody reading this is still on the "
            "committee.<br><br><b>The Dunham Foundation matches the community&rsquo;s first "
            "$50,000</b>, released once that $50,000 is received.",
      ask=("That&rsquo;s the whole set.", "Finish what he started at pironlegacy.org"),
      credit=CED),
]

GUIDES = ('<div class="guides"><div class="g-trim"></div><div class="g-safe"></div>'
          '<div class="g-lbl">TRIM 2.5×3.5 · SAFE 2.25×3.25 · BLEED 2.75×3.75</div></div>')

def card_html(c):
    n = int(c["n"])
    relic = ('<span class="relic-tag">AUTHENTIC RELIC</span><span class="relic"><span>SWATCH</span></span>'
             if c.get("relic") else "")
    th = "".join(f"<th>{k}</th>" for k, _ in c["stats"])
    td = "".join(f"<td>{v}</td>" for _, v in c["stats"])
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Card {c['n']} — {html.unescape(c['bnm']).title()} — press artwork (donor set)</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=Open+Sans:wght@400;600;700&family=Bebas+Neue&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<!-- GENERATED by print/set/build.py — edit the CARDS data there, not this file. -->
<style>{CSS}{EXTRA_CSS}</style></head>
<body>
<div class="page">
  <div class="wood"></div>
  <div class="front-in">
    <div class="frame">
      <img src="{CL}{c['img']}" alt="{c['alt']}">
      <span class="team">{c['team']}</span>
      {relic}
      <span class="pennant"></span><span class="pennant-txt">{c['n']}</span>
    </div>
    <div class="plate"><div class="nm">{c['nm']}</div><div class="pos">{c['pos']}</div></div>
  </div>
  {GUIDES}
</div>
<div class="page">
  <div class="back-bleed"></div>
  <div class="back-in">
    <div class="bh">
      <div><div class="nm">{c['bnm']}</div><div class="pos">{c['bpos']}</div></div>
      <div class="no">{c['n']}<small>OF 10</small></div>
    </div>
    <table class="statline"><tr>{th}</tr><tr>{td}</tr></table>
    <p class="story">{c['story']}</p>
    <div class="ask">
      <span class="qr">{QR}</span>
      <span class="txt"><b>{c['ask'][0]}</b>{c['ask'][1]}</span>
    </div>
    <p class="fine">Card {n} of 10. {c['credit']} {FINE}</p>
  </div>
  {GUIDES}
</div>
</body></html>
"""

if __name__ == "__main__":
    for c in CARDS:
        (HERE / f"card{c['n']}.html").write_text(card_html(c))
    print("wrote", len(CARDS), "cards")
