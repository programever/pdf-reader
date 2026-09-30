# Notes on this dataset

These notes belong to the files that are in this folder today (12 samples from the client, made on 2026-09-19). If
the samples change, change or delete this file. The general format and rules are in `../README.md`.

## The samples

| Folder | Product | Insurer | The original file name | Pages |
|---|---|---|---|---|
| S1 | PruApex Legacy Index PI | Prudential | `[Sample] IUL PruApex Legacy Index PI.pdf` | 65 |
| S2 | Diamond Prestige IUL II | HSBC Life | `[Sample] IUL HSBC Life Diamond Prestige IUL II.pdf` | 66 |
| S3 | Platinum Indexed Legacy (II) | AIA | `[Sample] Platinum Indexed Legacy (IUL) .pdf` | 25 |
| S4 | Signature Indexed Universal Life Select (III) | Manulife | `[Sample] Signature IUL Select III (IUL).pdf` | 34 |
| S5 | Jade Legacy Universal Life | HSBC Life | `[Sample] UL HSBC Life Jade Legacy Universal Life.pdf` | 39 |
| S6 | Jade Ultra Legacy Universal Life | HSBC Life | `UL HSBC Life Jade Ultra Legacy Universal Life.pdf` | 39 |
| S7 | Platinum Legacy (IX) | AIA | `[Sample] Platinum Legacy IX (UL).pdf` | 17 |
| S8 | Heirloom (VII) | Manulife | `[Sample] Heirloom (VII) (UL).pdf` | 21 |
| S9 | PRULife Vantage Achiever Prime II (USD) | Prudential | `[Sample] WL PruLife Vantage Achiever Prime II (USD).pdf` | 23 |
| S10 | Emerald Life (in the PDF: Emerald Legacy Life III) | HSBC Life | `[Sample] Emerald Life (WL) .pdf` | 27 |
| S11 | Platinum Heritage Wealth (II) | AIA | `[Sample] PHW (WL).pdf` | 14 |
| S12 | Signature Life | Manulife | `[Sample] Signature Life (WL).pdf` | 19 |

- The original files (15 PDFs and the master Excel file) are kept outside this project. Every `input.pdf` was
  checked: the product name of its Excel column stands inside the PDF.
- All 12 PDFs hold real text. None is a scan. The final product must also read scans (a scan is a photo of the
  page, with no text inside).
- Each PDF is 1 to 3 documents joined together, each with its own printed page numbers. "Page 8" in an instruction
  means the 8th page of the file, not the number printed on the paper.
- S9 has one printed page missing (the numbers jump from "Page 7 of 24" to "Page 9 of 24"). The missing page holds
  the surrender values of years 1 to 41.
- Three PDFs are not used: `[Sample] TLB UL PI.pdf` (one of its figures has no
  instruction in the Excel file), `[Sample] HSBC Life Diamond Prestige (IUL).pdf` (a second sample of the product of
  S2) and `[Sample] WL HSBC LIfe Emerald Legacy Life III.pdf` (a second sample of the product of S10).

## Choices made for `expected` in these samples

- The value is written the way the PDF writes it: "US$647,276.34", "USD 380,853", "Single Premium", "10,000,000".
- A breakeven is the first policy year where the named column reaches the total premium.
- "Guaranteed cover period" is the last policy year that still shows a death benefit. It is the year, not the age.
- "Total Premium" uses 1 as the term for a single premium and 10 for "Multi-pay 10 Pay" or "From yr 1 to yr 10". It
  keeps the cents of the premium. "Multiples of premium paid" is rounded to two decimals.
- Five values of S9 are `null`: both breakevens and the surrender values of year 15, 20 and 25. The instruction
  points to the table that has the missing page. Another table in that PDF shows some of these numbers, but the
  instruction does not name it, so it is not used.
- S2, surrender value in year 15, 20, 25: the instruction says "Surrender Value column" and no column has exactly
  that name. The column "Guaranteed Minimum Surrender Value" is used, because it is the only column name that holds
  the words "Surrender Value" (453,125 / 429,166 / 370,538). Going by meaning, the column "Cash Value" would give
  852,257 / 1,130,621 / 1,476,692. A model may answer that.
- S10, Guaranteed Breakeven: 25. The guaranteed value reaches 489,885 in year 25 and stays there; the premium is
  489,885.56. The table rounds, so year 25 counts as reached.
- S11, Projected Breakeven: 25. The instruction of S11 points to the Guaranteed column, so that column is used.

## The shape of `template.json` today

- All 12 samples have the `expected` shape `{"type": "string" | "number", "value": ...}` (S1 on 2026-09-22, S2
  and S3 on 2026-09-23, S4 and S5 on 2026-09-24, S6 to S12 on 2026-09-29). Currency is `string`. Premium Term is
  `string` when the PDF writes a text ("Single Premium", "Multi-pay 10 Pay", "Single", "From yr 1 to yr 1") and
  `number` when it writes a number ("1" in S3, S7, S9, S10, S11, S12). Every other figure is `number`.
- Since 2026-09-29 every `ReadFromPdf` and `WorkedOut` figure also has `expecting`: the type
  again, and a made-up example in the form of the real value with other digits ("US$708,740.00" -> "US$123,456.78",
  a year -> "10"). Currency, and Premium Term when it is a text, use the real value as the example. The five null
  figures of S9 have an example in the normal form ("10", "123,456").
- "Total Premium": the instruction of each sample says what its Premium Term text means as a number. S1 (2026-09-22): `Premium Term "Single Premium" means 1, anything else means 0`. S2 (2026-09-23, the same way):
  `Premium Term "Multi-pay 10 Pay" means 10`. S4 (2026-09-24): `Premium Term "From yr 1 to yr 10" means 10`. S5 (2026-09-24): `Premium Term
  "Single" means 1`. S6 (2026-09-29): `Premium Term "Single" means 1`. S8 (2026-09-29): `Premium Term
  "From yr 1 to yr 1" means 1`. The samples whose Premium Term is the number "1" need no rule.

## How the answer sheet was checked

All `expected` values were written from the real text of the PDFs. Then three separate AI sessions built the
same answer sheet again, blind: they got only `input.pdf` and the `template.json` without `expected`, and the rules
above. Result on 2026-09-19 for the 144 values: 137 the same (5 of them differ only in cents on "Total Premium"),
and no digit read differently. The 7 others are the S2 and S9 cases above, where the reading was the same but the
choice was different.

## What is hard in these PDFs

This list is for later, when a model gets an answer wrong and we want to know why. Found on 2026-09-19 by looking
at the pages that the templates point to and by counting in the real text of the PDFs. "All" means all 12 samples.

### A. Tables

1. **Column headers of two, three or four levels.** On top "ILLUSTRATION A" and "ILLUSTRATION B", under each one
   "Account Value", "Surrender Value", "Death Benefit". Read line by line, the header becomes
   "End of Surrender Death Surrender Death" and nobody can tell which "Surrender Value" belongs to B. The
   templates ask exactly for this ("ILLUSTRATION B -> Surrender Value column -> Year 15"). All samples. Worst: S5
   and S6 (four levels).
2. **Header cells with long text that wraps over 5 to 8 lines**, for example "Illustrated values at the current
   General Account general crediting rate, current assumed Index Account crediting rate and current charges
   (US$)". S2, S5, S6.
3. **Two columns with the same name.** Two times "Total", two times "Non-Guaranteed", under group headers that
   differ only by a rate ("Illustrated at 3.25% Investment Return", "... at 4.75% ..."). The rate changes from
   client to client. S9, S10, S11, S12.
4. **Tables without drawn lines.** Only white space separates the columns. Seen in S1, S9. Most other samples
   have drawn borders.
5. **White text on a black bar** as a group header ("ILLUSTRATION A", "SURRENDER VALUE", "POLICY VALUE"). Seen in
   S1, S2, S9, S10, S11, S12.
6. **A table goes on over several pages.** The header is repeated on each page, the rows go on (S1: years 1 to 30
   on page 8, 31 to 60 on page 9, and so on). A search like "first year where ..." must cross pages. All samples.
7. **Rows are grouped with an empty line between the groups**, by 5 (S1, S9) or by 10 (S4).
8. **Rows that are not data**: "SUBTOTAL" lines in the middle of a table. S5 (9 times), S6 (7 times).
9. **Years are left out.** The main table goes 1 to 10, then 15, 20, 25, 30 ... A full table with every year is on
   another page. "Year 15" is there, "Year 12" is not. S2, S5, S6.
10. **Cells that are not numbers.** "##" means the policy has lapsed (S4: 16 times, S8: 15 times). "-" means empty
    (S3, S7, S11). Many "0".
11. **Very dense pages.** Up to 712 numbers on one page (S1). Between 370 and 480 on the table pages of the other
    samples.
12. **Several small tables on one page**, next to free text and label lists. All samples.

### B. Numbers

13. **Small raised footnote marks stick to numbers and words.** "Cash Value¹˒²" comes out of the PDF text as
    "Value1,2", and "(US$)¹˒³˒⁴" as "(US$)1,3,4", which looks like a number. "1,402,000#" and "3398971*" carry a
    mark at the end. S2 (25 times), S5 and S6 (23 times each), S3, S7, S10, S11, S12.
14. **Numbers without commas.** "3398971" in a death benefit column, next to columns with commas. S3 (the whole
    column).
15. **Different ways to write money.** "US$708,740.00", "USD 380,853", "$10,000,000", "S$", "(US$)" only in the
    header and bare numbers in the cells. All samples.
16. **Negative numbers and percent signs.** "-4.52% p.a.", "4.10% p.a.*". S2, S4, S5, S9 to S12.
17. **"Year / Age" in one cell**: "15/46". The year is the part before the slash. Most samples. S5 and S6 have two
    columns, one for the year and one for the age.
18. **A value inside a sentence.** "Day 1 Surrender Value based on Illustration B is US$547,716." The templates
    ask for these. All samples.

### C. Page layout

19. **Two label and value pairs on one line.** Left "Policy Term: Lifetime", right "Planned Premium Payment Term:
    0 Year". Read as one line they mix. All samples.
20. **The colon stands in its own column**, far from the label: "Currency            :   USD". S2, S3, S7, S10,
    S11.
21. **A label or a value that wraps to a second line**: "Guaranteed Minimum Crediting Interest Rate: 1.50%" and
    "p.a." on the next line; "Interest Rate for the Guaranteed Interest Rate Lock period (Apply to the First
    Premium Only): 4.70%". All samples.
22. **One line of text turned by 90 degrees along the page edge** ("COVER PAGE FOR NON-PARTICIPATING UNIVERSAL LIFE
    PLAN"). S1, S2, S5, S6, S9, S10.
23. **Text that is only a picture.** The insurer's logo ("PRUDENTIAL", "Manulife", "AIA"). An OCR reader reads it, a PDF package does not. All but the HSBC samples.
24. **Things that are not text**: a barcode (S3, S7, S11), a row of empty boxes for the policy number (S3, S7,
    S11), signature lines, fill-in lines "Prepared by ________".
25. **Small print.** Footnotes and long table headers are set very small. S2, S3, S5, S6, S7, S11.
26. **Two page sizes inside one PDF**, because several documents were joined. S2, S4, S5, S6, S8, S12.
27. **An empty page.** Page 4 of S5 and of S6. A vision model may invent text there.

### D. Text that is in the PDF but not on the paper

28. **Invisible words.** Marks for electronic signing ("AIA_CRPG_SIGAGT", "[@#AP_S_1"), a second hidden copy of a
    page title, form codes. A PDF package returns them, a person and an OCR reader do not see them. 70 words in the
    samples; S3, S7, S11 have the most. This is a point for OCR: it reads what a person sees.
29. **Masked client data**: "cl****". S3 (49 times), S7, S11.

### E. Page numbers

30. **Each PDF is 1 to 3 documents joined together**, each with its own printed numbers ("Page 2 of 22" is the 5th
    page of the file in S2). The Excel file means the place in the file. So pages must be numbered by
    their place in the file, starting at 1, and not by the printed number.
31. **Some pages have no printed page number at all.** S2 (41 of 66 pages), S5 and S6 (23 of 39).
32. **S9 has a page missing.** The printed numbers jump from "Page 7 of 24" to "Page 9 of 24". The missing page
    holds the surrender values of years 1 to 41. So "surrender value in year 15, 20, 25" cannot be read from this
    sample at all. We need the full file from the client.

### F. Scans

33. None of the 12 samples is a scan. All hold real text. Scans must still be supported, so we need a scanned
    test file: a real one from the client, or one that we make from a sample (draw the pages, turn them a little,
    add blur and noise, save them as pictures inside a new PDF with no text).
