# PDF Reader

A test project on its own: can local AI models read values out of insurance illustration PDFs?

## 1. The goal

PDF Reader reads values out of insurance illustration PDFs. An illustration is the PDF that an insurer makes for
one product and one client. It shows the premiums and the values for each year. Today an adviser reads these values
out of each PDF by hand. We want AI models to do that, on our own machine, with no cloud service.

For each product, the firm has an instruction for each value: a short text that says where the value is found in
the PDF. The models get the PDF and the instruction, and answer with the value.

This project tests how well that works. It has a set of test cases with known correct answers, a flow that runs the
models against them, and a report that compares the answers with the correct ones.

The flow uses two models:

- **OvisOCR2** (Alibaba) turns the picture of a page into text. It runs in the `mlx-vlm` server.
- **qwen3.8:27b** (Alibaba) finds the value in that text, and works out the values that are formulas. It runs in
  Ollama, with thinking on.

## 2. The test data

The test data is in `dataset/` in this folder. One folder is one test case:

```text
dataset/
  DATASET.md         facts about the samples that are in this folder today
  S1/
    input.pdf        one illustration
    template.json    the values to read from this PDF: the instruction for each one, and the correct answer
    pages/           the pictures of all pages (see part 4, step 1)
      pdfium-2.1.13-200dpi/      one folder for each drawing tool, its version and its dots per inch
        1.png                    the number is the place of the page in the file, counted from 1
        2.png
        drawing.json             how many pages were drawn and how many seconds it took
    text-result/     the texts of the pages that the OCR model read (see part 4, step 2)
      mlx-ovisocr2-bf16-1.json                                <OCR setting>-<run number>.json
    value-result/    the results of the runs (see part 4, step 3)
      mlx-ovisocr2-bf16_ollama-qwen3.8-27b-thinking-pagefirst-with-example-1.json    <OCR setting>_<value setting>-<run number>.json
    result.html      the report (see part 4, "The report")
  S2/
  ...
```

Rules for a test case:

- The folders are named `S1`, `S2`, ... with no gap.
- `input.pdf` is an exact copy of the original illustration file. It is never edited.
- `input.pdf` and `template.json` belong together: the instructions were written for the product of this PDF.
- Every figure in `template.json` has an instruction. A PDF whose template has a figure without an instruction is
  not used.
- The folder holds nothing else. `pages`, `text-result`, `value-result` and `result.html` appear after the first
  run. No run ever changes `input.pdf` or `template.json`.

`dataset/` is committed on purpose, so that anyone can open a `result.html` and see the samples, the page texts
and the answers without installing or running anything. It holds the illustration PDFs, so this repo must stay
private. It is about 340 MB, most of it the page pictures.

Facts about the samples that are in `dataset/` today are in `dataset/DATASET.md`, not here. This file must stay
true when the samples change.

## 3. `template.json`

A list with one entry for each value to read. A value is called a figure.

```json
[
  {
    "name": "Yearly Premium",
    "pages": [5],
    "instruction": "Total Single Premium (Single Pay)",
    "kind": "ReadFromPdf",
    "expecting": { "type": "number", "example": "US$123,456.78" },
    "expected": { "type": "number", "value": "US$708,740.00" }
  },
  {
    "name": "Premium Term",
    "pages": [1],
    "instruction": "Premium Payment Term",
    "kind": "ReadFromPdf",
    "expecting": { "type": "string", "example": "Single Premium" },
    "expected": { "type": "string", "value": "Single Premium" }
  },
  {
    "name": "Total Premium",
    "instruction": "Yearly Premium * Premium Term. Premium Term \"Single Premium\" means 1, anything else means 0.",
    "kind": "WorkedOut",
    "expecting": { "type": "number", "example": "123,456.78" },
    "expected": { "type": "number", "value": "708,740.00" }
  },
  {
    "name": "Guaranteed Breakeven (End of Year)",
    "instruction": "NA",
    "kind": "NotApplicable"
  }
]
```

| Field | What it is |
|---|---|
| `name` | The name of the figure. |
| `pages` | Only on `ReadFromPdf` figures. The pages of the PDF where the firm says the value is found. Almost always one page: `[5]`. A few instructions name two pages: `[13, 14]`. A page number is the place of the page in the file, counted from 1. It is not the number printed on the paper. |
| `instruction` | The firm's text for this figure and this product, without the page: what to find on that page, or how the figure is worked out. This is what the model gets. |
| `kind` | What sort of figure it is. See the table below. |
| `expecting` | Only on `ReadFromPdf` and `WorkedOut` figures. What the firm's admin expects the answer to look like. `type` is `"string"` for a text ("US Dollars", "Single Premium") or `"number"` for a number. `example` is a made-up value in the form of the answer: the same currency sign, commas and decimals, but other digits ("US$123,456.78"). The model gets this example. It shows the form of the answer, never the answer. |
| `expected` | Only on `ReadFromPdf` and `WorkedOut` figures. The correct answer, for the report. `type` is the same as in `expecting`. `value` is the correct answer as text, the way the PDF writes it ("US$708,740.00"). It is `null` when the value cannot be read from this PDF by following the instruction. The model never gets it. |

| `kind` | Meaning | Has `expecting` and `expected`? |
|---|---|---|
| `ReadFromPdf` | The value is read from the PDF. `pages` names the page, and the instruction names a label, a table column, a row, or a sentence on it. | yes |
| `WorkedOut` | A formula over other figures, for example "Cover / Total Premium". | yes |
| `NotApplicable` | The figure does not exist for this product. | no |
| `HeldByTheFirm` | A fixed value that the firm keeps itself. It is not in the PDF. | no |

### Rules for `pages` and `instruction`

- The firm writes the page and the place in one text: "Page 5 -> Total Single Premium (Single Pay)". In
  `template.json` the page stands in `pages`, and the rest of the text stands in `instruction`. The page is a fact
  that the firm gives us, so the model does not search the whole PDF for it.
- "Page 8" or "P.8" in the firm's text means the 8th page of the file, counted from 1.
- The rest is the firm's own text. It is changed only when it is wrong for this PDF, the way the firm's admin would
  correct it. When the firm's text holds several choices (one line for single pay and one for multi pay), only the
  line that fits this PDF is kept.
- A `WorkedOut` formula that uses a text figure as a number says what the text means: `Premium Term "Single
  Premium" means 1`. This is a rule of the firm, so it stands in the firm's text, never in the code.

### Rules for `expecting`

- The example has the form of the real value of this PDF: the same currency sign, commas, decimals and about the
  same length, with other digits. A year "12" becomes "10". It is never the real value.
- Currency, and Premium Term when it is a text, use the real value as the example ("US Dollars"). The admin knows
  these values. So these two figures do not test the reading of the model.
- A figure whose `expected.value` is `null` still has an example in the normal form. The model must still answer
  null when the value is not on the page.

### Rules for `expected`

- Each sample follows its own instruction for its own `input.pdf`. Never compare the instruction of one sample with
  another sample. Go by the words of the instruction, not by what the figure "should" mean. If the instruction
  names a column and no column has exactly that name, take the column whose name holds those words.
- Only the place that the instruction names counts. If that place is missing or broken in the PDF, `expected.value`
  is `null`, also when the same number can be found somewhere else in the PDF.
- The value is written the way the PDF writes it, with its currency sign, commas and decimals. A `WorkedOut` value is
  worked out from the `expected` values of the figures in its formula.
- Every `expected` value is read from the real text of the PDF, not from a picture, so that no digit is guessed.

### How a number is compared

A number figure is compared as a number, not as text. The program takes the one number out of the text, on both
sides: `expected.value` and the answer of the model. "US$708,740.00", "708,740.00" and "708740" all give the number
708740. Digits, commas, one dot and a minus sign are read; everything else, for example "US$" or "% p.a.", is
dropped. A text that holds no number, or more than one number ("15/46"), gives no number, and counts as wrong.

## 4. The flow

A model takes only text or pictures. It cannot open a PDF. So the flow for one test case has three steps:

1. **PDF -> pictures.** PDFium draws every page of `input.pdf` as a picture. No AI model is used.
2. **Pictures -> texts.** OvisOCR2 turns the picture of a page into text. Only the pages that the template names
   are read, when they are needed.
3. **Texts -> values.** qwen3.8:27b gets the text of the page and the instruction and answers with the value. For a
   `WorkedOut` figure it gets the values found before and the formula.

Then the report shows the results and compares them with `expected`.

Every page is read from a picture, the way a person reads it, and never from the text stored inside the PDF. The
reason: a PDF can be a scan (a photo of the page, with no text inside), or a page with text where one part, for
example a table, is a picture. Reading the picture works for every PDF the same way. What it costs: an OCR model
can read a digit wrong or invent text, and it does not tell us. The test must show how often that happens.

### Step 1. PDF -> pictures

PDFium is the drawing tool inside the Chrome browser (npm package `@hyzyla/pdfium`). It draws each page the way a
PDF viewer shows it, as a PNG picture at 200 dots per inch. Drawing is fast (65 pages in about 10 seconds) and the
pictures of a PDF never change, so **all** pages are drawn one time by the command `generate:pages`. The pictures
are kept in the `pages` folder of the test case:

```text
pages/<drawing tool>-<version>-<dots per inch>dpi/<page number>.png
pages/pdfium-2.1.13-200dpi/8.png
pages/pdfium-2.1.13-200dpi/drawing.json
```

- The page number is the place of the page in the file, counted from 1.
- `drawing.json` says how many pages were drawn and how many seconds it took. The result of a run copies it.
- Pictures at other dots per inch go into their own folder.
- A person can open `8.png` next to the text of page 8 and compare them by eye. The report does this.

### Step 2. Pictures -> texts

OvisOCR2 (Alibaba, 0.9 billion parameters, Apache 2.0) reads a whole page and writes it as Markdown, with tables as
HTML. It runs in the `mlx-vlm` server with the makers' own files. Its makers' guide is named in
`src/models/OvisOcr2.ts`, with its prompt and its settings: temperature 0, at most 16,384 tokens. A token is a piece
of a word.

The rule for this step: it may convert, it may never judge.

- The model gets the picture of one whole page and turns the whole page into text. Nothing is removed, nothing is
  picked. It never sees an instruction, an example or an expected value.
- A page is read when a figure needs it and its text is not saved yet. So a page next to a named page is only read
  when it is really needed.
- The text of a page is saved and used again by every later figure and every later run. Reading a page takes 5 to
  35 seconds, and two runs must get exactly the same text to be compared.

**The file of the page texts.** One OCR setting has one file in the `text-result` folder of the test case:

```text
text-result/<name of the OCR setting>-<run number>.json
text-result/mlx-ovisocr2-bf16-1.json
```

```json
{
  "run": 1,
  "setting": {
    "name": "mlx-ovisocr2-bf16",
    "model": "ATH-MaaS/OvisOCR2",
    "dpi": 200,
    "prompt": "Extract all readable content from the image ...",
    "options": { "temperature": 0, "top_p": 1, "top_k": 0, "repetition_penalty": 1, "seed": 1, "max_tokens": 16384 }
  },
  "runner": { "name": "mlx-vlm", "version": "0.7.1" },
  "pictures": "pdfium-2.1.13-200dpi",
  "pages": [
    {
      "page": 8,
      "text": "PRUDENTIAL ...",
      "calls": [
        { "prompt": "...", "startedAt": "2026-09-22T05:05:00.000Z", "seconds": 25, "inputTokens": 3922, "outputTokens": 3412, "contextLimit": 262144 }
      ]
    },
    { "page": 9, "failed": "the answer repeats itself" }
  ]
}
```

| Field | What it is |
|---|---|
| `run` | The run number, the same as in the file name. A new run number is a new reading of the pages with the same setting. |
| `setting` | A full copy of the setting that was used, with its name (see "Named settings" in part 5). |
| `runner` | The program that ran the model, and its version. |
| `pictures` | The name of the folder in `pages` that the model read. |
| `pages` | One entry for each page that was read, in the order of the page numbers. `text` is the text of the page. A page that could not be read cleanly has no `text`. It has `failed`, with the reason. |
| `calls` | The facts of the call to the model: the prompt that was sent with the picture, when it started, how long it took, how many tokens went in and came out, and the context limit of the model. |

The file is saved after every page, so a run that breaks loses nothing. Before pages are added to a file, it is
checked that the file was made with the same setting, the same runner and the same pictures. If not, the command
refuses.

### Step 3. Texts -> values

qwen3.8:27b (Alibaba, 27 billion parameters, Apache 2.0, 17 GB) runs in Ollama with thinking on. Thinking means
that the model first writes its reasoning for itself, and only then the answer. Ollama gives the thinking back apart
from the answer, and both are saved. Thinking is slower, sometimes by minutes, but it is what makes the "which
year" figures right (the first year where a value reaches the total premium, the last year with a death benefit).

**The items of the template are handled one by one, in the order of the file, and nothing else.** The program never
sorts the items. An item can use every value that was found before it. For example the instruction of a breakeven
says "Surrender Value >= Total Premium", and "Total Premium" is a `WorkedOut` item that stands before it in the
file. If an item needs a value that comes later in the file, the file is wrong, and the firm's admin must change
the order.

**The values that were found before go into every question**, as plain lines, one for each item that was asked:

```text
Currency = US Dollars
Premium Term = Single Premium
Cover = 10000000
Yearly Premium = 708740
Total Premium = 708740
```

All of them are given, not only the ones that the instruction names, so the program judges nothing. A number figure
stands there as the number that was taken out of the model's answer, so a formula works on real numbers. A text
figure stands there as its text. A value that was not found stands there as `null`. An item where a call failed is
left out. One effect: a wrong early value can make a later value wrong. So the result keeps, for every item, the
exact lines that were given to the model (`valuesGiven`).

**The question for a `ReadFromPdf` figure.** One question for one item. The page comes right after the fixed
context: Ollama keeps its notes on an input it has read and reuses them when the next input starts the same way, so
the questions on one page share the reading of that page (measured: 6 seconds instead of 18 for the second question
on a page).

```text
Below is the text of one page of an insurance illustration, then the values that were found before, an
instruction, and an example of the form of the answer.
Find the value that the instruction names on this page.
Answer with the value only, in the same form as the example. The example shows the form of the answer. It is
not the answer.
Write no explanation.
If the value is not on this page, answer null. Do not guess.

Text of the page:
<the text of the named page; a figure with two named pages gets both texts>

Values found before:
<the lines above>

Instruction:
<the firm's text>

Example of the form of the answer, not the answer:
<expecting.example>
```

The model gets no other help: no hints about the product, no corrected instructions, no `expected` value.

**The question for a `WorkedOut` figure.** No page text. The values found before, the formula and the example:

```text
Below is an instruction with a formula, the values that were found before, and an example of the form of the
answer.
Work out the value of the formula from these values.
Answer with the result only, in the same form as the example. The example shows the form of the answer. It is
not the answer.
Write no explanation.
If a value that the formula needs is missing or null, answer null. Do not guess.

Values found before:
<the lines>

Instruction:
<the formula>

Example of the form of the answer, not the answer:
<expecting.example>
```

`NotApplicable` and `HeldByTheFirm` items are not asked. They are copied into the result as they are, and they are
not in the lines of the values found before.

**When the value is not on the named page.** A page of a PDF is sometimes pushed forward or backward, for example
when the insurer adds a page. So up to three questions are asked for an item, in this order: the named page N; if
the model answers null, the page after it, N+1; if the model answers null again, the page before it, N-1. The first
page where the model gives a value wins. The result says on which page the value was found (`foundOnPages`), so
every shift is seen and the firm can correct its template. For an item with two named pages, the page after the
last one and then the page before the first one are tried. The named page always comes first, because on a wrong
page the model can meet a table that looks the same and give a wrong value.

**The answer.** The trimmed text of the model is the value. The text `null` is null. For a number figure the program
takes the one number out of the text (see part 3). The model's number is what the later items get.

### The settings of qwen3.8

A setting is a number or a switch that we send to Ollama together with the question. The same model with other
settings can give other answers, so the settings are part of every result file. The names are the names that
Ollama uses.

| Setting | What it does | What we use |
|---|---|---|
| `think` | Thinking on or off. | On. |
| `temperature` | A model writes its answer piece by piece. For each piece it has a list of possible next pieces, each with a chance. `temperature` says how freely it picks from this list. At 0 it always takes the piece with the highest chance. At a higher number it sometimes takes a less likely piece, so two runs can differ. | 1.0, the makers' number for thinking mode. The makers say that at 0 the thinking can fall into a loop. |
| `top_p`, `top_k`, `min_p` | They make the list of possible next pieces shorter before the model picks. | 0.95, 20 and 0, the makers' numbers for thinking mode. |
| `seed` | The start number of the random picking. | 1. |
| `num_ctx` | The context window: how much text the model may take in at one time, counted in tokens. The question and the answer with its thinking must all fit. **If the text is longer than `num_ctx`, Ollama cuts the text silently. There is no error.** | 32,768, far above the longest page text seen so far (about 5,000 tokens) plus the thinking. The tokens that went in and came out are in every result, so a question that comes close to the window is seen. |
| `num_predict` | The most tokens the model may write, thinking included. | 8,192. Without a limit, a confused model can write without end. |
| `repeat_penalty` | Makes the model avoid words it has already written. | Not set. Ollama's default stays: our answers repeat numbers on purpose. |

The makers' numbers are read from the page of the exact model version before the first run, never from memory, and
`src/models/Qwen38.ts` names the page. With a `temperature` above 0 two runs can give different answers. Every
setting runs at least one time on a test case. A second run is made only when we want to see if the values stay
the same; the part "Stability" of the report compares them.

**Settings of the Ollama server**, set one time when Ollama starts: `OLLAMA_MODELS` is `models/` in this folder,
so the model files live in the project; `OLLAMA_FLASH_ATTENTION` is on, a faster way to work through a long text
that should not change the answers. The port is 11435, not Ollama's normal port, so our server never mixes with
another Ollama on this Mac.

### The result file of a run

One run writes one JSON file into the `value-result` folder of the test case:

```text
value-result/<name of the OCR setting>_<name of the value setting>-<run number>.json
value-result/mlx-ovisocr2-bf16_ollama-qwen3.8-27b-thinking-pagefirst-with-example-1.json
```

One run holds two settings, so the file name holds both names, with `_` between them. A setting name can never hold
`_` itself. The run number goes up every time the same two settings are run again on this test case. A new run adds
a new file. An old file is never changed.

```json
{
  "run": 1,
  "ocrSetting": { "name": "mlx-ovisocr2-bf16", "model": "ATH-MaaS/OvisOCR2", "dpi": 200, "prompt": "...", "options": { "...": "..." } },
  "ocrRunner": { "name": "mlx-vlm", "version": "0.7.1" },
  "text": "mlx-ovisocr2-bf16-1",
  "valueSetting": {
    "name": "ollama-qwen3.8-27b-thinking-pagefirst-with-example",
    "model": "qwen3.8:27b",
    "think": true,
    "readContext": "Below is the text of one page of an insurance illustration, ...",
    "workOutContext": "Below is an instruction with a formula, ...",
    "options": { "temperature": 1, "top_p": 0.95, "top_k": 20, "min_p": 0, "seed": 1, "num_ctx": 32768, "num_predict": 8192 }
  },
  "valueRunner": { "name": "ollama", "version": "0.34.2" },
  "startedAt": "2026-09-29T09:05:03.000Z",
  "seconds": 403,
  "time": {
    "drawPages": { "pages": 65, "seconds": 10 },
    "readPages": { "pages": [1, 5, 8, 10], "seconds": 64 },
    "readValues": {
      "questions": 12,
      "seconds": 329,
      "perQuestion": [
        { "figure": "Currency", "pages": [1], "seconds": 10 },
        { "figure": "Total Premium", "pages": [], "seconds": 7 }
      ]
    },
    "total": 403
  },
  "results": [
    {
      "name": "Yearly Premium",
      "pages": [5],
      "instruction": "Total Single Premium (Single Pay)",
      "kind": "ReadFromPdf",
      "expecting": { "type": "number", "example": "US$123,456.78" },
      "expected": { "type": "number", "value": "US$708,740.00" },
      "value": "US$708,740.00",
      "number": 708740,
      "foundOnPages": [5],
      "valuesGiven": "Currency = US Dollars\nPremium Term = Single Premium\nCover = 10000000",
      "calls": [
        {
          "pages": [5],
          "startedAt": "2026-09-29T09:06:10.000Z",
          "seconds": 12,
          "inputTokens": 1317,
          "outputTokens": 74,
          "contextLimit": 32768,
          "thinking": "The instruction asks for the total single premium. On the page ...",
          "answer": "US$708,740.00",
          "prompt": "Below is the text of one page of an insurance illustration, ..."
        }
      ]
    },
    {
      "name": "Guaranteed Breakeven (End of Year)",
      "instruction": "NA",
      "kind": "NotApplicable"
    }
  ]
}
```

The values in this example are examples only. The settings are shown shorter than they are.

| Field | What it is |
|---|---|
| `run` | The run number, the same as in the file name. |
| `ocrSetting`, `valueSetting` | A full copy of the two settings that were used, with their names. `valueSetting` holds the exact context texts that were sent to the model, word for word. |
| `ocrRunner`, `valueRunner` | The program that ran each model, and its version. |
| `text` | The name of the file in `text-result` that the page texts came from, without `.json`. |
| `startedAt`, `seconds` | When the run started and how long the command ran, with the reading of pages that were not read before. |
| `time` | The time of the three steps. `drawPages` is copied from `drawing.json`. `readPages` adds up the seconds of the pages this run used, from the page-text file. `readValues` adds up the seconds of every question of this run and lists every question in the order it was asked; a `WorkedOut` question has no page. `total` is the sum of the three. A page is drawn one time and read one time, then reused by later runs; for those runs the first two numbers are the time of that first time. |
| `results` | A copy of `template.json` as it was at the time of the run, in the same order. A `ReadFromPdf` or `WorkedOut` item gets the fields below. Another item is copied as it is. |
| `value` | The answer of the model for this item, exactly as the model wrote it. `null` when the model found the value on none of the pages that were tried, or could not work it out. An item where a call failed has no `value`. It has `failed`, with the reason. |
| `number` | Only on a number figure: the number taken out of `value` (part 3). `null` when `value` is `null`, or when the text gave no number; then `notANumber` says why. |
| `foundOnPages` | The page or pages whose text gave the value. `null` when `value` is `null`, and for a `WorkedOut` item. It differs from `pages` when the page was pushed forward or backward. |
| `valuesGiven` | The exact lines of the values that were found before, as they were given to the model for this item. |
| `calls` | The facts of every question that was asked for this item, in the order they were asked: one for the named page, and one more for each other page that was tried. `pages` is the page or pages whose text was sent (empty for a `WorkedOut` item). Then: when the question started, how long it took, the tokens that went in and came out, the context window that was set, the thinking text, the answer, and `prompt`, the exact question text that was sent, word for word. |

The file does not say if a value is right or wrong. The report works that out when it is built, so the way of
comparing can change later without running the models again.

### What the code does so that a bad run can never look like a good one

- The files that talk to a runner accept only a normal ending. An answer that was cut off, an answer that repeats
  itself, an error, missing token numbers: each one is a failure, never a text.
- An answer that starts to repeat itself is stopped early and reported as a failure.
- A page where a call failed is saved as failed, with the reason and with no text. A figure where a call failed is
  saved with `failed` and no value.
- Every result file says exactly what ran: the runner, its version, and the model file.
- The command `model:check` (part 5) runs the checks on a setting before its results count.

### The report

The command `generate:report` writes one file, `<test case>/result.html`. Everything the page needs is written into
the file: the template, every run in `value-result/`, and the page texts in `text-result/`. The pictures are not
copied; the file points at them in `pages/`. So the file opens with a double click, and it is built again after
every run. The page has these parts:

1. **The comparison table.** One row per figure, in the order of the template. On the left: the name, the kind,
   the page the firm names, and `expected`. Then one column per run file. A cell shows the value the model gave, the
   number taken out of it when that differs, the page where it was found when that is not the named page, and a
   colour: green is right, red is wrong, grey is null, yellow is a failed call. The last row is the score of each
   run. A click on a cell opens its details in the block of that run.
2. **Time and score per run.** One row per run with two bars: the score, and the time of the run split into the
   three steps.
3. **Time per figure.** The grid of the comparison table again, with a bar of the seconds that all questions of that
   figure took in that run, and the tokens that came out.
4. **Stability.** For every pair of settings that ran more than one time: how many figures got the same answer in
   every run, and which ones differ.
5. **The runs.** One block per run: the score and the time; the OCR model and the value model, each with its runner
   and version and every value of its setting, in full; the time of the three steps, with every question of step 3;
   and the run's own table of figures. A click on a row shows its details next to the table: the instruction, the
   values found before, every question that was asked, the full input sent to the model (folded), and the response
   from the model: its thinking and its answer.
6. **The pages.** Every page that any run used: the picture on the left, the text on the right.

**When is a value right?** The report decides this, never the run.

- A number figure: the model's number is rounded to the decimals that `expected.value` has, and then both must be
  equal. 14.1095 against "14.11" is right; 708740 against "708,740.00" is right.
- A text figure: the same text after the spaces at the ends are removed and big and small letters are ignored.
- `expected.value` null: the model must answer null.
- A failed call is neither right nor wrong. It is counted apart.

## 5. The commands

Run `npm install` one time in this folder. The terminal must use Node 24 (`nvm use` reads `.nvmrc`). This project
uses plain npm. With npm, everything that a command gets must stand after ` -- ` when it holds an option with dashes.

Every step is a command that anyone can run again. Each one is a line in `package.json`. No command starts a
server by itself: the servers have their own start and stop commands, so it is always clear what is running.

**The servers.** A model runs inside a server program, a runner.

| Command | What it is for |
|---|---|
| `npm run mlx:start` | Starts the `mlx-vlm` server at `127.0.0.1:11436`. It runs OvisOCR2. It stays in the front of its terminal tab and shows its log; Ctrl+C stops it. It is started with no internet allowed, so it can only use model files that are already in `models-hf/`. It loads a model when the first question for it arrives. |
| `npm run mlx:stop` | Stops the `mlx-vlm` server from another terminal tab. |
| `npm run mlx:pull <model>` | Downloads one model from Hugging Face (a public site for AI models) into `models-hf/`. This is the only `mlx` command that uses the internet. The model gets a row in part 6 first. |
| `npm run ollama:start` | Starts our own Ollama server at `127.0.0.1:11435`, with `OLLAMA_MODELS` set to `models/` in this folder and `OLLAMA_FLASH_ATTENTION` on. It runs qwen3.8:27b. It stays in the front of its terminal tab; Ctrl+C stops it. |
| `npm run ollama:stop` | Stops the Ollama server from another terminal tab. |
| `npm run ollama:pull <model>` | Downloads one Ollama model into `models/`. It refuses every tag that ends in `cloud`, because such a model runs on Ollama's servers. Our Ollama server must run. The model gets a row in part 6 first. |

**The flow.** In the order in which they are used for a test case.

| Command | What it is for |
|---|---|
| `npm run generate:pages -- <test case>` | Step 1. Draws all pages of `input.pdf` as pictures into `pages/` of the test case and writes `drawing.json`. It is run one time for a test case. A page that is already drawn is skipped. `--dpi 300` draws at other dots per inch, into its own folder; the normal value is 200. It uses no model and no server. |
| `npm run generate:value -- <test case> --ocr <setting> --value <setting>` | Steps 2 and 3, the whole run. It walks through the items of `template.json` one by one, reads a page with the OCR model when its text is not saved yet, asks for every value, and writes one new result file into `value-result/`. It needs both servers and the pictures of `generate:pages`; if something is missing, it stops and says what to do. It prints one line for each item. |
| `npm run generate:text -- <test case> --setting <ocr setting>` | Only step 2, without asking for any value. It reads the pages that `template.json` names into the file of the page texts; with `--pages 9` or `--pages 1-10` it reads the given pages. It is for reading pages in advance. A page that is already read is skipped; `--retry-failed` reads the failed pages again; `--new-run` starts a new file with the next run number. It needs the `mlx-vlm` server. |
| `npm run generate:report -- <test case>` | Builds `<test case>/result.html` from `template.json`, every file in `value-result/` and the page texts in `text-result/`. It uses no model and no server. It is run again after every run; the old file is replaced. |

`<test case>` is the path of a folder, for example `dataset/S1`. The chosen settings are `mlx-ovisocr2-bf16` and
`ollama-qwen3.8-27b-thinking-pagefirst-with-example`:

```text
npm run generate:pages -- dataset/S1
npm run generate:value -- dataset/S1 --ocr mlx-ovisocr2-bf16 --value ollama-qwen3.8-27b-thinking-pagefirst-with-example
npm run generate:report -- dataset/S1
```

**The checks.**

| Command | What it is for |
|---|---|
| `npm run model:check <ocr setting> <picture file>` | Says if an OCR setting runs cleanly. It reads the picture two times and prints PASS or FAIL for each check in the table below. It writes no file. |
| `npm run model:check <value setting>` | The same for a value setting. It asks two times for one value on a small made-up page that is written inside the script, with a made-up example, so it needs no test case. |
| `npm run tsc` | Checks the TypeScript code for type mistakes. It runs nothing. |
| `npm run lint` | Checks the code with ESLint (`eslint.config.js`). It changes no file. |

The checks of `model:check`. A setting must pass them before its results count.

| # | Check | Why |
|---|---|---|
| 1 | Every answer ends in the normal way. | Otherwise nobody knows if the text is complete. |
| 2 | The runner reports the tokens that went in and the tokens that came out. | Without them we cannot see if the input was cut. |
| 3 | The same input with the same setting gives the same answer two times. | Otherwise one run proves nothing. |
| 4 | The model is run the way its makers say: their runner, their prompts, their settings. | Otherwise we test our own invention, not the model. This check is done by a person who reads the makers' guide; the file of the model names the guide. |
| 5 | The input is never cut silently. | See `num_ctx` in part 4. |

**The files.**

```text
scripts/               the commands. One file is one command of package.json. They know no model.
  pages.ts             generate:pages
  value.ts             generate:value, the whole run
  text.ts              generate:text
  report.ts            generate:report
  check.ts             model:check
  ollamaPullModel.ts   ollama:pull
src/                   the parts that the commands use
  Runner.ts            the rules for every runner: what an answer is, what a failure is, and how to see that an
                       answer repeats itself
  Ollama.ts            how to talk to our Ollama server. It gives a text only when the answer ended in the normal
                       way and the tokens were reported. Everything else is a failure with its reason.
  MlxVlm.ts            the same for the mlx-vlm server
  TextModel.ts         the contract of an OCR model (pictures -> texts)
  ValueModel.ts        the contract of a value model (texts -> values, and worked-out values)
  Settings.ts          reads every file in models/, and checks the names of all settings
  models/
    OvisOcr2.ts        everything about OvisOCR2: its runner, its named settings, its prompt, how it reads one page
    Qwen38.ts          everything about qwen3.8: its runner, its named settings, its two context texts, how it is
                       asked and how its answer is read
  TextResult.ts        the file of the page texts: open it, read a page into it, save it
  ValueResult.ts       the shape of the result file of a run, and how all runs of a test case are read
  Compare.ts           the rules that say if a value is right
  Report.ts            builds the HTML of the report
  Template.ts          the format of template.json: reads it, refuses a wrong shape, and takes the one number out of
                       a text
  TestCase.ts          the paths inside the folder of one test case
  Pages.ts             draws the pages of a PDF as PNG pictures with PDFium, and drawing.json
runners/
  mlx-vlm/             the Python project of the mlx-vlm server: pyproject.toml and uv.lock fix its version and the
                       version of every Python package it needs. uv installs them into .venv/ inside this folder.
models/                the model files of Ollama (ignored by git)
models-hf/             the model files of mlx-vlm, downloaded from Hugging Face (ignored by git)
```

**One file for each model.** Everything that is special about a model lives in the file of that model, and nowhere
else: which words it wants, how its answers end, how its answers become text. The general code knows no model. The
file of an OCR model gives `settings`, `requireReady` (checks that the model can be used now, or stops with a
message that says what to do), `runner` (the runner and its version) and `readPage`. The file of a value model gives
the same first three and `readValue` and `workOut`. To test another model, one new file is added in `src/models/`;
the scripts read every file in that folder by themselves.

**Named settings.** No setting is typed on the command line. A run only picks the name of a setting; the model is
in the setting.

- A name is short and says the runner, the model and its version, and then a short label for what is special
  about this setting: `mlx-ovisocr2-bf16`, `ollama-qwen3.8-27b-thinking-pagefirst-with-example`. Only small
  letters, digits, dots and dashes are allowed, and a name must not end with a dash and a number, because the file
  name is `<name>-<run number>.json`. No two settings have the same name. The code checks this when a command starts.
- **A setting that was used in a run is never changed afterwards.** A change is a new setting with a new name.
  Otherwise two results with the same setting name would not mean the same thing.
- The full setting, with all its values, is copied into every file that it made. So a result tells the full truth
  by itself.

**No test files.** This project holds no test files. To check a piece of code, write a throw-away check, run it, and
delete it.

## 6. What is on this Mac for this project

**Everything that is installed or downloaded for this project gets a row in this table before it is installed or
downloaded.** The row is agreed first. This is true for every program and for every model file.

| What | Where | Why | How to remove |
|---|---|---|---|
| Ollama 0.34.2 | installed with Homebrew | Runs qwen3.8:27b on this Mac. Homebrew also installed the `mlx` and `mlx-c` packages, which Ollama needs. It is not set to start by itself. | `brew uninstall ollama`, then `brew autoremove` |
| uv 0.12.11 | installed with Homebrew | Installs Python and Python packages inside a project folder only. | `brew uninstall uv` |
| Model `qwen3.8:27b` (Alibaba), 17 GB, downloaded on 2026-09-19 | `models/` in this folder. Ignored by git. Ollama is started with `OLLAMA_MODELS` set to this folder. | The value model (part 4, step 3). Licence: Apache 2.0. Downloaded with `npm run ollama:pull qwen3.8:27b`. | `ollama rm qwen3.8:27b` while our Ollama runs, or delete the folder |
| `mlx-vlm` 0.7.1, a Python program, with the Python packages it needs (575 MB). It runs on Python 3.13, which was already on this Mac. | `runners/mlx-vlm/.venv/` in this folder, installed by `uv sync`. Ignored by git. | A runner for vision models on Apple chips. It runs OvisOCR2 as a local server; our TypeScript code talks to it. Licence: MIT. | delete `runners/mlx-vlm/.venv/` |
| Model `ATH-MaaS/OvisOCR2`, the makers' own files, 1.6 GB, downloaded on 2026-09-22 | `models-hf/` in this folder. Ignored by git. | The OCR model (part 4, step 2). Published by Alibaba's ATH-MaaS team. Licence: Apache 2.0. Downloaded from huggingface.co with `npm run mlx:pull ATH-MaaS/OvisOCR2`; `mlx-vlm` loads the makers' files directly. | delete `models-hf/` |

The npm packages are not in this table. They are listed in `package.json`, with their versions, and they live only
in `node_modules/` in this folder, which is ignored by git. To remove them, delete `node_modules/`. Node 24 (with npm)
is already on this Mac and is not installed by this project. TypeScript stays on version 6.0, because the ESLint
rules for TypeScript do not support TypeScript 7 yet.

## 7. Rules for this folder

- It is a git repo on one machine only. Nothing is pushed.
- Model files are never committed: `models/` and `models-hf/` are ignored by git. The test data, page pictures
  and results in `dataset/` are committed, for a quick view of the reports.
- No page, picture or text is sent to any cloud service.
