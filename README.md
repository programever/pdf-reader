# Lumimory illustration test

A test project by Iker and Beta. It is not part of the client's code. It lives outside the client repo
(`lumimory/current`) and uses nothing from it.

## 1. The goal

Lumimory must read values out of insurance illustration PDFs. An illustration is the PDF that an insurer makes for
one product and one client. It shows the premiums and the values for each year. Today an adviser reads these values
out of each PDF by hand. We want an AI model to do that.

For each product, the firm has an instruction for each value: a short text that says where the value is found in
the PDF. The model gets the PDF and the instruction, and answers with the value.

This project tests how well AI models can do this. It needs a set of test cases with known correct answers, and a
way to run a model against them.

## 2. The test data

The test data is in `dataset/` in this folder. One folder is one test case:

```text
dataset/
  S1/
    input.pdf        one illustration
    template.json    the values to read from this PDF: the instruction for each one, and the correct answer
    pages/           the pictures of all pages (see part 4, "1. PDF -> Images")
      pdfium-2.1.13-200dpi/      one folder for each drawing tool, its version and its dots per inch
        1.png                    the number is the place of the page in the file, counted from 1
        2.png
    text-result/     the texts of the pages that an OCR model read (see part 4, 2.1)
      mlx-ovisocr2-bf16-1.json                                <name of the OCR setting>-<run number>.json
    value-result/    the results of the runs (see part 4, "The result file of a run")
      mlx-ovisocr2-bf16_ollama-qwen3.8-27b-thinking-pagefirst-1.json    <OCR setting>_<other setting>-<run number>.json
      mlx-ovisocr2-bf16_ollama-qwen3.8-27b-thinking-pagefirst-2.json
    result.html      the report (see part 4, 3)
  S2/
  ...
```

Requirements for a test case:

- The folders are named `S1`, `S2`, ... with no gap.
- `input.pdf` is an exact copy of the file from the client. It is never edited.
- `input.pdf` and `template.json` belong together: the instructions were written for the product of this PDF.
- Every figure in `template.json` has an instruction. A PDF whose template has a figure without an instruction is
  not used.
- The folder holds nothing else. `pages`, `text-result`, `value-result` and the HTML file appear after the first
  test run.
  No test run ever changes `input.pdf` or `template.json`.
- The file names in the tree above are examples only.

`dataset/` is ignored by git (`.gitignore`), so the test data is never committed. It must never be copied into a git
repo in any other way, and never sent to a cloud service.

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
    "expected": { "type": "number", "value": "US$708,740.00" }
  },
  {
    "name": "Premium Term",
    "pages": [1],
    "instruction": "Premium Payment Term",
    "kind": "ReadFromPdf",
    "expected": { "type": "string", "value": "Single Premium" }
  },
  {
    "name": "Total Premium",
    "instruction": "Yearly Premium * Premium Term. Premium Term \"Single Premium\" means 1, anything else means 0.",
    "kind": "WorkedOut",
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
| `pages` | Only on `ReadFromPdf` figures. The pages of the PDF where the firm says the value is found. Almost always one page: `[5]`. A few instructions of the firm name two pages ("P.13 - P.14"): `[13, 14]`. A page number is the place of the page in the file, counted from 1. It is not the number printed on the paper. |
| `instruction` | The firm's text for this figure and this product, without the page: what to find on that page, or how the figure is worked out. This is what the AI model gets. |
| `kind` | What sort of figure it is. See the table below. |
| `expected` | The correct answer. Only on `ReadFromPdf` and `WorkedOut` figures. `type` says what kind of answer the figure has: `"string"` for a text ("US Dollars", "Single Premium") or `"number"` for a number. `value` is the correct answer as text, the way the PDF writes it, also for a number ("US$708,740.00"). It is `null` when the value cannot be read from this PDF by following the instruction. |

| `kind` | Meaning | Has `expected`? |
|---|---|---|
| `ReadFromPdf` | The value is read from the PDF. `pages` names the page, and the instruction names a label, a table column, a row, or a sentence on it. | yes |
| `WorkedOut` | A formula over other figures, for example "Cover / Total Premium". | yes |
| `NotApplicable` | The figure does not exist for this product. | no |
| `HeldByTheFirm` | A fixed value that the firm keeps itself. It is not in the PDF. | no |

### Rules for `pages` and `instruction`

- The firm writes the page and the place in one text: "Page 5 -> Total Single Premium (Single Pay)". In
  `template.json` the page stands in `pages`, and the rest of the text stands in `instruction`. Why: the page is a
  fact that the firm gives us. A model that must search a whole PDF for a page that we already know is slower and
  makes more mistakes.
- "Page 8" or "P.8" in the firm's text means the 8th page of the file, counted from 1.
- The rest is the firm's own text. It is changed only when it is wrong for this PDF, the way the firm's admin would
  correct it (a wrong label, a wrong page, a wrong year).
- When the firm's text holds several choices (for example one line for single pay and one for multi pay), only the
  line that fits this PDF is kept.

### Rules for `expected`

- Each sample follows its own instruction for its own `input.pdf`. Never compare the instruction of one sample with
  another sample. If the instruction names a column, the value comes from that column, also when another product
  uses a different column for the same figure.
- Go by the words of the instruction, not by what the figure "should" mean. If the instruction names a column and no
  column has exactly that name, take the column whose name holds those words.
- Only the place that the instruction names counts. If that place is missing or broken in the PDF, `expected` is
  `null`, also when the same number can be found somewhere else in the PDF.
- The value is written the way the PDF writes it, with its currency sign, commas and decimals.
- A `WorkedOut` value is worked out from the `expected` values of the figures in its formula. When the formula
  uses a text figure as a number (for example "Premium Term", whose value is the text "Single Premium"), the
  instruction says what the text means as a number. The rule is a rule of the firm, so it stands in the firm's
  text, never in the code.
- **A number figure is compared as a number, not as text.** The program takes the one number out of the text, on
  both sides: `expected` and the answer of the model. "US$708,740.00", "708,740.00" and "708740" all give the number
  708740. Digits, commas, one dot and a minus sign are read; everything else, for example "US$" or "% p.a.", is
  dropped. A text that holds no number, or more than one number ("15/46"), gives no number. So the model answers
  only what the page writes, and never has to change the writing of a number.
- Every `expected` value is read from the real text of the PDF, not from a picture, so that no digit is guessed.
- The answer sheet is checked by a second, independent reading: a separate session gets `input.pdf` and the
  `template.json` without `expected`, builds its own answers, and every difference is looked at by a person.

## 4. The model test

The plan: download AI models that run on this Mac, let each model read the values, and compare its answers with
`expected`.

- No cloud AI. Every model runs on our own machine.
- Do not care now how strong the firm's server is. First find out if it works on Iker's Mac.
- A PDF with pictures inside must be supported fully. A page can be a scan (a photo of the page, with no text
  inside the PDF), or a page with real text where one part, for example a table, is a picture. So we only test
  solutions that read the page from a picture. A solution that copies the text stored in the PDF is not tested.
- We go one test case at a time.

### The flow

A local AI model takes only text or pictures. It cannot open a PDF file. So this is the flow for one test case:

1. **PDF -> Images.** PDFium draws every page of `input.pdf` as a picture. No AI model is used.
2. **The items of `template.json` are handled one by one, in the order of the file.** What happens depends on the
   `kind` of the item:
   - 2.1 `ReadFromPdf`: an OCR model turns the picture of the named page into text (Image -> Text). Then a second
     model gets this text, the instruction and the values that were found before, and answers with the value
     (Text -> Value). If the answer is null, the same is done for the page after and the page before.
   - 2.2 `WorkedOut`: a general model works out the value from the values that were found before.
   - 2.3 `NotApplicable` and `HeldByTheFirm`: no model is asked.
3. **The report in HTML** shows the results of all runs next to each other and compares them with `expected`.

One run of this flow uses two named settings: the setting of the OCR model, and the setting of the model that finds
and works out the values. A setting is explained in part 5.

### Three rules for every tool and every model

A tool or a model is only on the lists below when it passes all three rules. There is no rule about the server: the
project has no requirement yet for the machine that will run the models. So we test the best models that run on
Iker's Mac.

1. **It runs on our own machine.** The files are downloaded one time. After that, it works with no internet. No
   page, picture, text or question goes to any server. In Ollama, a tag that ends in `cloud` breaks this rule: such
   a model runs on Ollama's servers.
2. **It is free, also inside a product that is sold.** The licence (the legal rule for using it) must allow this with
   no payment. Licences that pass: Apache 2.0, MIT, BSD, and NVIDIA's OpenMDW. The GPL licence passes only for a
   tool that we call as a separate program and do not build into our code. The AGPL licence does not pass.
3. **It runs in one of our two runners and nothing else** (Iker, 2026-09-22): the `mlx-vlm` server with a model
   from Hugging Face, or Ollama. A model whose makers' way needs their own program around the model (for example a
   toolkit that first cuts the page into pieces) is not used, even when it scores higher.

### A model must run cleanly before its results count

The base must be strong first. If a model cannot even be run well, nobody can say if a bad result comes from the
model, from the program that runs it, or from our own code. A program that runs a model is called a runner here
(Ollama is one, `mlx-vlm` is another).

**No patches.** If a model does not run cleanly in a runner, our code does not repair it. There are only two ways:
run it with another runner, the way its makers say, or do not use the model. The file of a model holds only what the
makers document about their model (its prompts, its recommended settings, its way of use). It never holds a way
around a mistake of a runner.

A model runs well when it passes these five checks. Before it passes them, no result of it counts.

| # | Check | Why |
|---|---|---|
| 1 | Every answer ends in the normal way. | Otherwise nobody knows if the text is complete. |
| 2 | The runner reports the tokens that went in and the tokens that came out. | Without them we cannot see if the input was cut, and we cannot measure the cost. |
| 3 | The same input with the same setting gives the same answer two times. | Otherwise one run proves nothing. |
| 4 | The model is run the way its makers say: their runner, their prompts, their settings. | Otherwise we test our own invention, not the model. A public score is only true for the makers' way. |
| 5 | The input is never cut silently. | See `num_ctx` in "the settings of a run". |

Checks 1, 2, 3 and 5 are done by the command `npm run model:check` (part 5). Check 4 is done by a person who reads the
makers' guide; the file of the model names that guide.

What the code does so that a bad run can never look like a good one:

- The files that talk to a runner accept only a normal ending. An answer that was cut off, an answer that repeats
  itself, an error, missing token numbers: each one is a failure, never a text.
- An answer that starts to repeat itself is stopped early and reported as a failure. This repairs nothing. It only
  does not wait for garbage.
- A page where a call failed is saved as failed, with the reason and with no text (see "The file of the page texts" in 2.1).
- Every result file says exactly what ran: the runner, its version, and the model file.

### Pictures inside a PDF

This is the reason why every page is read from a picture. A PDF page can hold two things: stored text (real
letters, which a program can copy) and pictures. What a person sees on the page can come from either one. There are
four kinds of PDF:

| Kind | What it is | What a tool gets when it only copies the stored text |
|---|---|---|
| 1. All real text | Every word is stored text. Only the logos are pictures. | The full text. |
| 2. A full scan | Every page is one big picture, a photo of the paper. No stored text at all. | Nothing. An empty text. |
| 3. A mix | Some pages are stored text and some pages are scans, for example a signed form that was scanned and joined to the illustration. Or a page has stored text, but one part of it, for example a table, was pasted in as a picture. | A text with holes. The scanned pages and the picture table are missing. |
| 4. A scan with hidden text | Some scanners read the page themselves and store their reading as invisible text behind the picture. This hidden text can be wrong ("8" stored as "3"). Nobody sees it, because the eye sees only the picture. | The scanner's reading, with its mistakes. |

In kind 2, 3 and 4 the tool gives **no error**. It returns a text that is empty, has holes, or has wrong digits.
The model that finds the values then answers from this text, and nobody can see why a value is wrong or missing. A program also cannot
safely decide for each page which kind it is: a page of kind 3 or 4 looks like a normal text page to a program.

The decision (Iker, 2026-09-21): pictures inside a PDF must be supported fully. So every page is always read from a
picture, the way a person reads it. A solution that copies the stored text is not tested and not used.

What this costs: on a PDF of kind 1, copying the stored text would never read a digit wrong. An OCR model can. We
accept this, and the test must show how often it happens.

What the test data needs: test cases of kind 2 and 3. They can come from the client, or we make them from a test
case of kind 1: draw the pages as pictures, turn them a little, add blur and noise, and save them as a new PDF with
no stored text. The `template.json` stays the same, so the `expected` values are already known.

### 1. PDF -> Images

Every page is read from a picture. This is the only way that works for every PDF: a PDF with real text, a scan, and
a page where a part is a picture. It has two parts:

1. **Draw.** A tool draws each page of `input.pdf` as a picture, the way a PDF viewer shows it. The tool is PDFium,
   the drawing tool inside the Chrome browser (npm package `@hyzyla/pdfium`). It is free to use in a product. The
   picture is saved as PNG, never JPEG, at 200 dots per inch. Drawing uses no AI model and is fast (65 pages in
   about 10 seconds), and the pictures of a PDF never change. So **all** pages of a PDF are drawn one time, by their
   own command `generate:pages`, and no other command draws. Which pages are used later does not matter here.
2. **Read.** Later, in 2.1, a small AI model that can see reads the picture of a page and writes the page as Markdown, with its tables.
   Markdown is a simple text format that AI models know well. Reading text from a picture is called OCR.

The text that is stored inside a PDF is never used, also when the PDF has it. So a PDF with real text and a scan of
the same pages go the same way.

What is good about it: it reads what a person sees, so it returns no invisible words. The OCR models were trained on
tables with several header levels. What is bad: an OCR model can read a digit wrong or invent text, and it does not
tell us. It is slow, because each page is one call to the model.

**The pictures are kept.** They are in the `pages` folder of the test case:

```text
pages/<drawing tool>-<version>-<dots per inch>dpi/<page number>.png
pages/pdfium-2.1.13-200dpi/8.png
```

- The folder is named after what made the pictures, not after an OCR model. The pictures are drawn one time, and
  every OCR model reads the same pictures. Only then is it fair to compare the texts of two OCR models.
- The page number is the place of the page in the file, counted from 1. It is the same number as `page` in the
  file of the page texts.
- Other pictures, for example at 300 dots per inch because small print is hard to read, go into a new folder.
- A person can open `8.png` next to the text of page 8 and compare them by eye.

### 2. The items of `template.json`, one by one

- **The order is the order of the file, and nothing else.** The program never sorts the items and never tries to
  understand which item needs which. An item can use every value that was found before it. For example the
  instruction of a breakeven says "Surrender Value >= Total Premium", and "Total Premium" is a `WorkedOut` item that
  stands before it in the file. If an item needs a value that comes later in the file, the file is wrong, and the
  firm's admin must change the order. The program does not care about such a mistake.
- **The values that were found before go into every question**, as plain lines, one for each item that was asked:

  ```text
  Currency = US Dollars
  Premium Term = Single Premium
  Cover = 10000000
  Yearly Premium = 708740
  Total Premium = 708740
  ```

  All of them are given, not only the ones that the instruction names, so the program judges nothing. A number
  figure stands there as the number that was taken out of the model's answer (see the rules for `expected` in
  part 3), so a formula works on real numbers. A text figure stands there as its text. A value that was not found,
  or whose text gave no number, stands there as `null`. An item where a call failed is left out.
- One effect of this: a wrong early value can make a later value wrong. So the result file keeps, for every item,
  the exact lines that were given to the model (`valuesGiven`).

### 2.1 `ReadFromPdf`: Image -> Text -> Value

**Image -> Text, the OCR model.** The rule: it may convert, it may never judge.

- The OCR model gets the picture of one whole page and turns the whole page into text. Nothing is removed, nothing
  is picked. It never sees an instruction or an `expected` value.
- A page is read when an item needs it and its text is not saved yet. So a page next to a named page is only read
  when it is really needed.
- The text of a page is saved, in the `text-result` folder of the test case, and used again by every later item and
  every later run. Why it is kept: reading a page takes about 30 seconds; two models that find values must get
  exactly the same text to be compared fairly; and when a value is wrong, a person must be able to open the text of
  that page.

**The file of the page texts.** One OCR setting has one file in the `text-result` folder of the test case. It
holds the text of every page that was read, and the facts of the reading.

```text
text-result/<name of the setting>-<run number>.json
text-result/mlx-ovisocr2-bf16-1.json
```

The name of the setting already holds the model and its version (see "Named settings" in part 5). The run number
starts at 1. A new run number is a new reading of the pages with the same setting, to see if the OCR model writes
the same text again. A page text is made one time and then used by every run.

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
      "page": 1,
      "text": "PRUDENTIAL ...",
      "calls": [
        {
          "prompt": "...",
          "startedAt": "2026-09-21T14:05:00+07:00",
          "seconds": 14,
          "inputTokens": 2810,
          "outputTokens": 950
        }
      ]
    },
    { "page": 2, "failed": "Text Recognition: the answer repeats itself" }
  ]
}
```

The values in this example are examples only.

| Field | What it is |
|---|---|
| `run` | The run number, the same as in the file name. |
| `setting` | A full copy of the setting that was used, with its name. Every setting has `name`, `model` (the way its runner writes it) and `dpi`. The other values are different from model to model, because each model has its own file and its own needs (see part 5). |
| `runner` | The program that ran the model, and its version. |
| `pictures` | The name of the folder in `pages` that the model read. |
| `pages` | One entry for each page that was read, in the order of the page numbers. `page` is the place of the page in the file, counted from 1. `text` is the text of this page, the way the file of this model gives it. The model that finds the values gets this text. A page that could not be read cleanly has no `text`. It has `failed`, with the reason. The command does not read a failed page again by itself; `--retry-failed` does. |
| `calls` | The facts of every call to the model that was needed for this page. Most models need one call for a page, some need more. `prompt` is the exact words that were sent with the picture. Then: when the call started, how long it took, and how many tokens went in and came out. `inputTokens` and `outputTokens` are always numbers, because an answer without them is a failure. |

Why a list and not one long text: a page is found by its number, so no page mark stands inside the text, and nothing
that the OCR model wrote ("Page 2 of 22" is printed on the paper) can be mixed up with a mark. The run takes
the text of the page it needs out of this list.

One cost: inside a JSON file every line break is written as `\n`, so a table is one very long line and is hard to
read in an editor. To compare the text of page 8 with `8.png` by eye, the report must show them side by side.

A page that was not read is just not in the list. The file is saved after every page, so a run that breaks loses
nothing. Before pages are added to a file, it is checked that the file was made with the same setting values, the
same runner and the same pictures. If not, the command refuses. The command `generate:text` reads pages into this
file by hand, without asking for any value: the pages that `template.json` names, or the pages of `--pages`.

**The OCR model is OvisOCR2** (Alibaba, 0.9 billion parameters, Apache 2.0, in `mlx-vlm` with the makers' own files).
It reads a whole page by design and writes Markdown, with tables as HTML. It has the best public score of the models
that read a whole page: 96.6 on OmniDocBench v1.6, a public test of how well a model turns document pages into text
(100 is perfect). Its makers' settings: temperature 0, up to 16,384 tokens, picture between 448 and 2880 pixels. A
parameter is one number inside an AI model; more parameters mean a bigger file, more memory and a slower answer.

Two other OCR models were tested on S1 and deleted again. Their S1 results stay in the report of S1.

| Model | Why it lost |
|---|---|
| GLM-OCR (`mlx-community/GLM-OCR-bf16`, MIT, score 95.2) | It has no prompt for a whole page, only fixed prompts for text, tables and formulas; its makers' toolkit cuts the page into pieces first. Sent a whole page, it lost the header of one illustration on the table page and wrote the page two times, so the table figures were wrong or null. |
| Granite-Docling (`ibm-granite/granite-docling-258M-mlx`, IBM, Apache 2.0, 0.26 billion) | It writes DocTags, its own format, not Markdown. It wrote the big table as an empty box, so every table figure was null. |

Not tried, by the three rules: PaddleOCR-VL and MinerU2.5-Pro (rule 3: their makers' way needs their own toolkit,
which cuts the page first), Chandra OCR 2 and HunyuanOCR-1.5 (rule 2: their licence limits the use in a product that
is sold), DeepSeek-OCR-2 (it runs in neither runner: it is not in Ollama, and `mlx-vlm` 0.7.1 stops with an error
inside its own code for this model; "no patches" says we do not repair a runner).

**Text -> Value, the second model.** The model finds the value on the page. Our program judges nothing; it only
puts the question together and reads the answer.

One question for one item. The question holds four things:

1. A fixed context text. It is the same for every item and every test case, and says nothing about any sample. It
   belongs to the setting of the model, so it is saved in every result. The words are not final. It says: this is
   the text of one page of an insurance illustration; find the value that the instruction names and write it the
   way the page writes it; if the value is not on this page, answer null, do not guess.
2. The values that were found before.
3. The `instruction` of this item.
4. The text of the named page. An item with two named pages (`[13, 14]`) gets the text of both pages.

The model gets no other help: no hints about the product, no examples, no corrected instructions, no `expected`
value.

**When the value is not on the named page.** A page of a PDF is sometimes pushed forward or backward, for example
when the insurer adds a page. So up to three questions are asked for an item, in this order:

1. The named page, N.
2. If the model answers null: the page after it, N+1.
3. If the model answers null again: the page before it, N-1.

- "Not found" means exactly one thing: the model answers null.
- The first page where the model gives a value wins. The other pages are not asked.
- The result says on which page the value was found (`foundOnPages`), so every shift is seen and the firm can
  correct its template.
- For an item with two named pages, the page after the last one and then the page before the first one are tried.
- Why the named page always comes first: on a wrong page the model can meet a label or a table that looks the same
  and give a wrong value.

**The value model is `qwen3.8:27b`** (Alibaba, Apache 2.0, 17 GB, in Ollama). It is the only model that got every
S1 figure right, the two "which year" figures included. The text of one page is short, so it fits easily. The length
a model accepts is called its context window. It is counted in tokens; a token is a piece of a word. Ollama uses a
much smaller window unless we set it, so every setting must set it (see "The settings of a run").

Other value models were tested on S1 and deleted again. Their S1 results stay in the report of S1.

| Model | Why it lost |
|---|---|
| `gemma4:31b` (Google, 20 GB) | The best public scores of the candidates, but it answered the value instead of the year for the breakeven and the whole year/age cell ("26/57") for the cover period, and its thinking was three times slower than qwen's. |
| `granite4.2:8b` (IBM, 5.3 GB) | A small model. It thought past its makers' limit on three figures, and with three times the room it answered the year/age cell for both "which year" figures. |
| `nemotron-3.5-lightning:30b` (NVIDIA, 25 GB) | Fast per token, but it thought past its limit on two easy figures and answered the value instead of the year for the breakeven. |
| `qwen3.5:9b` (Alibaba, 6.6 GB) | The smallest Qwen with thinking. It thought past its limit on two figures, and on the cover period its reasoning leaked into the answer. |
| `qwen3.8:27b` as `mlx-community/Qwen3.8-27B-4bit` in the `mlx-vlm` server | The same model in the other runner. The server writes faster (22 tokens a second against 16), but that copy thinks two to five times longer on the same questions and answered the year/age cell twice on S1, so the runs were slower and worse. |

The pattern across all of them: the "which year" questions (breakeven, cover period) are the ones that break, and
only `qwen3.8:27b` with thinking gets both.


### 2.2 `WorkedOut`

The instruction of a `WorkedOut` item is a formula over other items, for example "Yearly Premium * Premium Term" or
"Cover / Total Premium". A general model gets a fixed context text, the values that were found before, and the
instruction, and answers with the result, or with null when a value that the formula needs is missing. The values
of number figures are given as numbers. No page text is given. Today the same model and the same setting are used as for Text -> Value; the setting holds one context
text for each of the two jobs.

### 2.3 `NotApplicable` and `HeldByTheFirm`

No model is asked for these items. `NotApplicable` means that the figure does not exist for this product.
`HeldByTheFirm` means that the firm keeps the value itself. The item is copied into the result as it is, with no
value, and it is not in the lines of the values that were found before.

### The settings of a run

A setting is a number or a switch that we send to Ollama together with the question. It is not part of the question
text. It tells Ollama how the model must work for this run. The same model with other settings can give other
answers. So the settings are a part of every Test, they are written into the result file, and two Tests can only be
compared when we can see their settings.

The names below are the names that Ollama uses. They must be checked against the documentation of the installed
Ollama version before the first run.

**Settings that change the answers**

| Setting | What it does | What we use |
|---|---|---|
| `temperature` | A model writes its answer piece by piece. For each piece it has a list of possible next pieces, each with a chance. `temperature` says how freely it picks from this list. At 0 it always takes the piece with the highest chance, so the same question gives the same answer every time. At a higher number, for example 0.8, it sometimes takes a less likely piece, so two runs can give two different answers. | The maker's number for thinking mode, see "Thinking and temperature" below. 0 would be better for repeatable runs, but the makers say it breaks thinking. |
| `seed` | The start number of the random picking. With the same `seed`, the same question and the same settings, the model picks the same way again. | A fixed number, 1. At `temperature` 0 it changes nothing. At a higher `temperature` it makes a run repeatable. |
| `num_ctx` | The context window: how much text the model may take in at one time, counted in tokens. The context text, the text of the page, the instruction and the answer of the model (with its thinking, when thinking is on) must all fit in it. Ollama uses a small number by itself (about 4,000 tokens). **If the text is longer than `num_ctx`, Ollama cuts the text silently. There is no error. The model then never sees the end of the page and answers from what is left.** | Always set. 32,768 for the thinking settings: far above the longest page text seen so far (about 5,000 tokens) plus the thinking. The tokens that went in and came out are in every result file and in the report, so a question that comes close to the window is seen. Counting the input before the run and stopping when it does not fit is not built yet (see "Not decided yet"). A bigger window needs more memory and makes the run slower. |
| `num_predict` | The most tokens the model may write in its answer. | Always set, high enough for the full answer (and for the thinking, when thinking is on). Without a limit, a confused model can write without end and the run never finishes. |
| `format` | Forces the shape of the answer: Ollama can make the model write JSON of a given shape and nothing else. | Not used. It is not free of effect: on a worked-out question the model answered null with a forced shape and the right number without it (S1, 2026-09-22). The program takes the trimmed text as the answer, and the text `null` as null. |
| `top_k`, `top_p`, `min_p` | They make the list of possible next pieces shorter before the model picks. | The maker's numbers for thinking mode (see "Thinking and temperature" below). Nothing else. |
| `think` | Many new models can think first: the model writes its reasoning for itself, and only then the answer. This is turned on or off. Thinking is slower, sometimes by many minutes. It usually helps on tasks with several steps, for example "the first year where the value reaches the total premium". Ollama gives the thinking text back apart from the answer. | Always on. Without thinking the models got the "which year" figures of S1 wrong; with thinking qwen got all of them right. The thinking text is saved, because it shows why a value is wrong. |

**Thinking and temperature.** The makers say that their model must not run at `temperature` 0 when thinking is on:
at 0 the thinking can fall into a loop and repeat the same sentences without end. Each maker gives its own numbers
(Alibaba for Qwen3.8: `temperature` 1.0, `top_p` 0.95, `top_k` 20, `min_p` 0). So the rule is: a setting with thinking uses the maker's numbers. They are read from the page of
that exact model version before the run, never from memory, and the file of the model names the page. With a
`temperature` above 0 two runs can give different answers. Every setting runs at least one time on a test case
(Iker, 2026-09-29). A second run, with the next run number in the file name, is made only when we want to see if
the values stay the same; the part "Stability" of the report compares them.

**Settings that we leave alone**

| Setting | What it does | Why we do not touch it |
|---|---|---|
| `repeat_penalty` | Makes the model avoid words it has already written. | Our answer repeats words on purpose ("name", "value", and the same number can stand in two figures). The default of each model stays. |

**Settings of the Ollama server.** These are set one time when Ollama starts, not for each question.

| Setting | What it does | What we use |
|---|---|---|
| `OLLAMA_MODELS` | The folder where the model files are. | `models/` in this project. |
| `OLLAMA_FLASH_ATTENTION` | A faster way to work through a long text. It needs less memory. It should not change the answers. | On. It costs nothing. |
| `OLLAMA_KV_CACHE_TYPE` | While the model reads, it keeps notes about the text in memory. This setting stores these notes in a smaller form. It saves much memory on a long text, but the answers can get a little worse. | The default (not smaller). Only changed when the Mac runs out of memory, and then it is a new Test. |
| `keep_alive` | How long a model stays in memory after an answer. | Not important. Ollama is stopped at the end of every session of work. |

### The result file of a run

One run of the flow writes one JSON file into the `value-result` folder of the test case:

```text
value-result/<name of the OCR setting>_<name of the other setting>-<run number>.json
value-result/mlx-ovisocr2-bf16_ollama-qwen3.8-27b-thinking-pagefirst-1.json
```

One run holds two settings, so the file name holds both names, with `_` between them. A setting name can never hold
`_` itself. The run number starts at 1 and goes up every time the same two settings are run again on this test case.
A new run adds a new file. An old file is never changed.

```json
{
  "run": 1,
  "ocrSetting": { "name": "mlx-ovisocr2-bf16", "model": "ATH-MaaS/OvisOCR2", "dpi": 200, "prompt": "...", "options": { "temperature": 0, "max_tokens": 16384 } },
  "ocrRunner": { "name": "mlx-vlm", "version": "0.7.1" },
  "text": "mlx-ovisocr2-bf16-1",
  "valueSetting": {
    "name": "ollama-qwen3.8-27b-thinking-pagefirst",
    "model": "qwen3.8:27b",
    "think": true,
    "pageFirst": true,
    "readContext": "Below is the text of one page of an insurance illustration, ...",
    "workOutContext": "Below is an instruction with a formula, ...",
    "options": { "temperature": 1, "top_p": 0.95, "top_k": 20, "min_p": 0, "seed": 1, "num_ctx": 32768, "num_predict": 8192 }
  },
  "valueRunner": { "name": "ollama", "version": "0.34.2" },
  "startedAt": "2026-09-22T05:05:03.000Z",
  "seconds": 480,
  "results": [
    {
      "name": "Yearly Premium",
      "pages": [5],
      "instruction": "Total Single Premium (Single Pay)",
      "kind": "ReadFromPdf",
      "expected": { "type": "number", "value": "US$708,740.00" },
      "value": "US$708,740.00",
      "number": 708740,
      "foundOnPages": [5],
      "valuesGiven": "Currency = US Dollars\nPremium Term = Single Premium\nCover = 10,000,000",
      "calls": [
        {
          "pages": [5],
          "startedAt": "2026-09-22T05:06:10.000Z",
          "seconds": 12,
          "inputTokens": 1317,
          "outputTokens": 74,
          "contextLimit": 32768,
          "thinking": "The instruction asks for the total single premium. On the page ...",
          "answer": "US$708,740.00",
          "prompt": "Below is the text of one page of an insurance illustration, ... Text of the page:\n..."
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
| `ocrSetting`, `valueSetting` | A full copy of the two settings that were used, with their names. `valueSetting` holds the exact context texts that were sent to the model, word for word. The other values are different from model to model (see part 5). |
| `ocrRunner`, `valueRunner` | The program that ran each model, and its version. |
| `text` | The name of the file in `text-result` that the page texts came from, without `.json`. |
| `startedAt`, `seconds` | When the run started and how long it took, with the reading of pages that were not read before. |
| `results` | A copy of `template.json` as it was at the time of the run, in the same order. A `ReadFromPdf` or `WorkedOut` item gets the fields below. Another item is copied as it is. |
| `value` | The answer of the model for this item, exactly as the model wrote it. `null` when the model found the value on none of the pages that were tried, or could not work it out. An item where something failed (see "A model must run cleanly") has no `value`. It has `failed`, with the reason. |
| `number` | Only on a number figure (`expected.type` is `"number"`): the number taken out of `value`, the way part 3 describes. `null` when `value` is `null`, or when the text gave no number; then `notANumber` says why ("the text holds no number", "the text holds 2 numbers: 15, 46"). This number is what later items get in their values found before. |
| `foundOnPages` | The page or pages whose text gave the value. `null` when `value` is `null`, and for a `WorkedOut` item. It differs from `pages` when the page was pushed forward or backward. |
| `valuesGiven` | The exact lines of the values that were found before, as they were given to the model for this item. |
| `calls` | The facts of every question that was asked for this item, in the order they were asked: one for the named page, and one more for each other page that was tried. `pages` is the page or pages whose text was sent (empty for a `WorkedOut` item). Then: when the question started, how long it took, the tokens that went in and came out, and the context window that was set. `thinking` is the thinking text of the model when thinking was on, else `null`. `answer` is what the model answered to this question. `prompt` is the exact question text that was sent, word for word, with the page text inside it. |

The file does not hold a score and does not say if a value is right or wrong. The report works that out when it is
built, so the way of comparing can change later without running the models again.

### 3. The report in HTML

The command `generate:report` (part 5) writes one file, `<test case>/result.html`, for example `dataset/S1/result.html`.
Everything the page needs is written into the file: the template, every run in `value-result/`, and the page texts
in `text-result/`. The pictures are not copied; the file points at them in `pages/`. So the file opens with a
double click, no server is needed, and it can be built again after every run. A browser cannot read JSON files
from the disk by itself; that is why the data is written into the file.

The page has seven parts:

1. **The comparison table.** One row per figure, in the order of the template. On the left: the name, the kind,
   the page the firm names, and `expected`. Then **one column per run file**, with the OCR setting, the value
   setting and the run number in the header. So two models, two settings of one model, or two runs of one setting
   always stand next to each other, and one row is read across to compare them. A cell shows the value the model
   gave, the number taken out of it when that differs, the page where it was found when that is not the named
   page, and a colour: green is right, red is wrong, grey is null (the model found nothing), yellow is a failed
   call, no colour is a figure that is not asked. The last row is the score of each run: how many right, wrong,
   null and failed of the answered figures, and the time of the run.
2. **The details of a cell.** A click on a cell, or on a row of a run's own table, opens the details next to that
   run's table: the instruction, the "values found before" lines, every question that was asked (page, seconds,
   tokens, the full input sent to the model folded up, and the response from the model: its thinking and its
   answer), and the number taken out of the answer.
3. **Time and score per run.** One row per run with two bars: the score (green right, red wrong, grey null,
   yellow failed) and the time of the run. This is accuracy against speed in one picture.
4. **Time per figure.** The grid of the comparison table again, but every cell is a bar of the seconds that all
   questions of that figure took in that run, with the number of questions and the tokens that came out. It shows
   which questions are expensive.
5. **Stability.** For every pair of settings that ran more than one time: how many figures got the same answer in
   every run, and which ones differ. Every setting runs at a temperature above 0, so two runs can differ.
6. **The runs.** One block per run, reached from the column header: the score and the time; the OCR model and the
   value model, each with its runner and version and every value of its setting (the prompts, the context texts
   and the options in full, so nothing about a run is hidden); and that run's own table of figures with the
   expected value, the value, the verdict, the pages asked, the time and the tokens of every question.
7. **The pages.** Every page that any run used: the picture on the left, the text on the right, one block per
   page-text file. The page numbers in the table link to them.

**When is a value right?** The report decides this, never the run, so the rule can change without running the
models again.

- A number figure: the model's number is rounded to the decimals that `expected` has, and then both must be equal.
  14.1095 against "14.11" is right; 708740 against "708,740.00" is right.
- A text figure: the same text after the spaces at the ends are removed and big and small letters are ignored.
  "US Dollars" against "us dollars" is right; anything else is wrong.
- `expected` null: the model must answer null.
- A failed call is neither right nor wrong. It is counted apart.

Not decided yet:

- The final words of the two context texts. One thing seen on S1: "Answer with the value exactly the way the page writes it"
  made Gemma answer the whole cell "26/57" (year and age) where the year 26 was asked. A "which year" instruction
  and a "which value" instruction may need different words.
- Counting the tokens of the input before a run, and stopping with an error when they do not fit in `num_ctx`.
- An overview page across all test cases, when more than one has results.
- How a test case with pictures is made (see "Pictures inside a PDF").

## 5. The scripts

To use the scripts, run `npm install` one time in this folder. The terminal must use Node 24 (`nvm use` reads `.nvmrc`). This project uses plain npm. It shares nothing with
the Lumimory client repo.

With npm, everything that a command gets must stand after ` -- ` when it holds an option with dashes:
`npm run generate:value -- dataset/S1 --ocr mlx-ovisocr2-bf16 --value ollama-qwen3.8-27b-thinking-pagefirst`.

**The tmux session.** `mux start pdf-reader` opens a tmux session named `pdf-reader` in this folder, with Node 24
and four windows: `nvim` (the editor), `cli` (for the commands), `ollama` and `mlx`. The two server windows do not
start their server by themselves: the start command is put into the history of the shell, so the up arrow and Enter
start it. The session is described in `~/Workspace/dotfiles/tmuxinator/pdf-reader.yml`, like Iker's other projects.

- **Everything is a command that Iker can run again himself.** Beta never runs a step in a way of its own. If
  something must be done two times, it is a command in this folder, and this file says how to run it.
- **The language is TypeScript.** Node runs the `.ts` files directly, so there is no build step. PDFium draws the
  pages through the npm package `@hyzyla/pdfium`. Ollama is a local server that is spoken to over HTTP (the way a
  browser talks to a web site), and Node can do that with nothing extra.
- **The scripts are general.** The code holds nothing about one test case, one model or one PDF. The test case, the
  model and the settings come from outside. Every call to a model does the same thing at the bottom: send something
  to a local model with some settings, get an answer, measure the time and the tokens. This is one shared part for
  each runner. An OCR model sends a picture with it, the other models send a text.
- **No command starts a server by itself.** Ollama is started and stopped with its own two commands, so it is always
  clear what is running.

The commands. Each one is a line in `package.json`, and each one can be run again at any time.

**The servers.** A model runs inside a server program, a runner. No other command starts or stops a server.

| Command | What it is for |
|---|---|
| `npm run mlx:start` | Starts the `mlx-vlm` server at `127.0.0.1:11436`. It runs the OCR model. It stays in the front of its terminal tab and shows its log; Ctrl+C stops it. It is started with no internet allowed, so it can only use model files that are already in `models-hf/`. It loads a model when the first question for it arrives. |
| `npm run mlx:stop` | Stops the `mlx-vlm` server from another terminal tab. |
| `npm run mlx:pull <model>` | Downloads one model from Hugging Face (a public site for AI models) into `models-hf/`. This is the only `mlx` command that uses the internet. The model gets a row in part 6 first. |
| `npm run ollama:start` | Starts our own Ollama server at `127.0.0.1:11435`, with `OLLAMA_MODELS` set to `models/` in this folder and `OLLAMA_FLASH_ATTENTION` on. It runs the model that finds and works out the values. It stays in the front of its terminal tab; Ctrl+C stops it. The port is not Ollama's normal port, so it never mixes with another Ollama on this Mac. |
| `npm run ollama:stop` | Stops the Ollama server from another terminal tab. |
| `npm run ollama:pull <model>` | Downloads one Ollama model into `models/`. It refuses every tag that ends in `cloud`, because such a model runs on Ollama's servers. Our Ollama server must run. The model gets a row in part 6 first. |

**The flow.** In the order in which they are used for a test case.

| Command | What it is for |
|---|---|
| `npm run generate:pages -- <test case>` | Flow step 1. Draws all pages of `input.pdf` as pictures into `pages/` of the test case. It is run one time for a test case. A page that is already drawn is skipped. `--dpi 300` draws at other dots per inch, into its own folder; the normal value is 200. It uses no model and no server. |
| `npm run generate:value -- <test case> --ocr <setting> --value <setting>` | Flow step 2, the whole run. It walks through the items of `template.json` one by one, reads a page with the OCR model when its text is not saved yet, asks for every value, and writes one new result file into `value-result/`. It needs both servers and the pictures of `generate:pages`; if something is missing, it stops and says what to do. It prints one line for each item. |
| `npm run generate:text -- <test case> --setting <ocr setting>` | Only Image -> Text, without asking for any value. It reads the pages that `template.json` names into the file of the page texts; with `--pages 9` or `--pages 1-10` it reads the given pages. It is for trying an OCR model alone, and for reading pages in advance. `generate:value` does not need it. A page that is already read is skipped; `--retry-failed` reads the failed pages again; `--new-run` starts a new file with the next run number. It needs the `mlx-vlm` server. |
| `npm run generate:report -- <test case>` | Flow step 3. Builds `<test case>/result.html` from `template.json`, every file in `value-result/` and the page texts in `text-result/` (see part 4, 3). It uses no model and no server. It is run again after every run; the old file is replaced. |

**The checks.**

| Command | What it is for |
|---|---|
| `npm run model:check <ocr setting> <picture file>` | Says if an OCR model runs cleanly: checks 1, 2, 3 and 5 of "A model must run cleanly" (part 4). It reads the picture two times and prints PASS or FAIL for each check. It writes no file. Run it for every new model and every new setting before any result of it counts. |
| `npm run model:check <value setting>` | The same for a model that finds values. It asks two times for one value on a small made-up page that is written inside the script, so it needs no test case. |
| `npm run tsc` | Checks the TypeScript code for type mistakes. It runs nothing. |
| `npm run lint` | Checks the code with ESLint, with the recommended rules for JavaScript and for TypeScript (`eslint.config.js`). It changes no file. |

`<test case>` is the path of a folder, for example `dataset/S1`.

**One file for each model, and one contract.** A model is not only a name and some numbers. Each model has its own
behaviour: which words it wants with a picture, how many times a page must be sent, how its answers end, how its
answers become the text of a page. So everything that is special about a model lives in the file of that model, and
nowhere else. The general code knows no model.

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
  TextModel.ts         the contract of an OCR model (Image -> Text)
  ValueModel.ts        the contract of a model that finds values (Text -> Value) and works them out
  Settings.ts          reads every file in models/, and checks the names of all settings
  models/
    OvisOcr2.ts        everything about the OCR model OvisOCR2: its runner, its named settings, how it reads one page
    Qwen38.ts          everything about the model qwen3.8: its runner, its named settings, its two context texts, how
                       it is asked and how its answer is read
    GlmOcr.ts, GraniteDocling.ts, Gemma4.ts, Granite42.ts, Nemotron35.ts
                       models that were tested on S1 and deleted from the Mac. The files stay so that the settings
                       of the S1 results can be read.
  TextResult.ts        the file of the page texts: open it, read a page into it, save it
  ValueResult.ts       the shape of the result file of a run, and how all runs of a test case are read
  Compare.ts           the rules that say if a value is right (part 4, 3)
  Report.ts            builds the HTML of the report
  Template.ts          the format of template.json: reads it, refuses a wrong shape, and takes the one number out of
                       a text
  TestCase.ts          the paths inside the folder of one test case
  Pages.ts             draws the pages of a PDF as PNG pictures with PDFium
runners/
  mlx-vlm/             the Python project of the mlx-vlm server: pyproject.toml and uv.lock fix its version and the
                       version of every Python package it needs. uv installs them into .venv/ inside this folder.
models/                the model files of Ollama (ignored by git)
models-hf/             the model files of mlx-vlm, downloaded from Hugging Face (ignored by git)
```

**The contract of an OCR model** (`TextModel.ts`). The file of an OCR model gives four things:

| What | What it is |
|---|---|
| `settings` | The list of named settings of this model. Every setting has `name`, `model` and `dpi`. The file may add any other values that this model needs. |
| `requireReady` | Checks that the model can be used now (for a model in Ollama: the server answers and the model is downloaded). If not, it stops with a message that says what to do. |
| `runner` | Says which runner runs this model, and its version. It goes into the result file. |
| `readPage` | Gets the setting and the picture of one page. Gives back the text of this page and the facts of every call it made, or a failure with its reason. How it gets there is the business of this file alone. |

- To test a new model, one new file is added in `src/models/`. Nothing else is touched: the scripts read every
  file in that folder by themselves.
- A few lines can look the same in two model files. That is accepted. A model file that is easy to read is worth
  more than one general part full of special cases.
- **The contract of a model that finds values** (`ValueModel.ts`) has the same first three things (`settings`,
  `requireReady`, `runner`), and two ways to ask. `readValue` gets the text of the page, the instruction and the
  values that were found before. `workOut` gets the instruction and the values that were found before. Both give
  back the value (or null) and the facts of the call, or a failure with its reason. A setting of such a model holds
  at least `name` and `model`; the file of the model adds what it needs, for example the two context texts, `think`
  and the options for its runner.

**Named settings.** No setting is typed on the command line. A run only picks the name of a setting. The model is
not named on the command line, because the name of the setting already says it.

- **The format of a name:** short, for example `mlx-ovisocr2-bf16`, `ollama-qwen3.8-27b-thinking-pagefirst`.
  A good name says the runner, the model and its version, and then, if needed, a short label for what is special
  about this setting. Only small letters, digits, dots and dashes are allowed, and a name must not end with a dash
  and a number, because the file name is `<name>-<run number>.json`. No two settings in the whole project have the
  same name. The code checks this when a command starts, and stops with a clear message when a name is wrong. The
  full name of the model is not in the name of the setting; it is in the `model` value of the setting.
- To test something new, Iker or Beta adds a new setting with a new name to the list of its model.
- **A setting that was used in a run is never changed afterwards.** A change is a new setting with a new name.
  Otherwise two results with the same setting name would not mean the same thing.
- The name of a setting is part of the name of every file that it made (`text-result/<OCR setting>-<run>.json`,
  `value-result/<OCR setting>_<other setting>-<run>.json`). The full setting, with all its values, is also copied
  into the file. So a result tells the full truth by itself. The sign `_` stands only between two setting names, so
  a name must not hold it.

**No test cases.** This project holds no test files (Iker, 2026-09-21). When Beta must check a piece of code, it
writes a throw-away check, runs it, and deletes it.

## 6. What is on this Mac for this project

**Everything that is installed or downloaded for this project gets a row in this table before it is installed or
downloaded.** Iker reads the row and says yes first. This is true for every program and for every model file.

| What | Where | Why | How to remove |
|---|---|---|---|
| Ollama 0.34.2 | installed with Homebrew | Runs the value model on this Mac. Homebrew also installed the `mlx` and `mlx-c` packages, which Ollama needs. It is not set to start by itself. | `brew uninstall ollama`, then `brew autoremove` |
| uv 0.12.11 | installed with Homebrew | Installs Python and Python packages inside a project folder only. | `brew uninstall uv` |
| Model `qwen3.8:27b` (Alibaba), 17 GB, downloaded on 2026-09-19 | `models/` in this folder. Ignored by git. Ollama is started with `OLLAMA_MODELS` set to this folder. | The chosen model for Text -> Value and `WorkedOut` (part 4, 2.1). Licence: Apache 2.0. Downloaded with `npm run ollama:pull qwen3.8:27b`. | delete it from `models/` with `ollama rm qwen3.8:27b` while our Ollama runs, or delete the folder |
| `mlx-vlm` 0.7.1, a Python program, with the Python packages it needs (575 MB). It runs on Python 3.13, which was already on this Mac. | `runners/mlx-vlm/.venv/` in this folder, installed by `uv sync`. Ignored by git. | A runner for vision models on Apple chips. It runs the OCR model as a local server; our TypeScript code talks to it. Licence: MIT. | delete `runners/mlx-vlm/.venv/` |
| Model `ATH-MaaS/OvisOCR2`, the makers' own files, 1.6 GB, downloaded on 2026-09-22 | `models-hf/` in this folder. Ignored by git. | The chosen OCR model (part 4, 2.1). Published by Alibaba's ATH-MaaS team. Licence: Apache 2.0. Downloaded from huggingface.co with `npm run mlx:pull ATH-MaaS/OvisOCR2`; `mlx-vlm` loads the makers' files directly. | delete `models-hf/` |
| The Python packages `torchvision` 0.29.0 and `torch` 2.14.0, with four small packages they need (about 1.4 GB), installed on 2026-09-22 with `uv add torchvision` | `runners/mlx-vlm/.venv/` in this folder. Ignored by git. They are written in `runners/mlx-vlm/pyproject.toml` and `uv.lock`. | The `mlx-vlm` server could not open the picture for Granite-Docling without them. That model is deleted now, so nothing needs them any more; they are still installed. Licence: BSD. | `uv remove torchvision` in `runners/mlx-vlm` |

The npm packages are not in this table. They are listed in `package.json`, with their versions, and they live only
in `node_modules/` in this folder, which is ignored by git. To remove them, delete `node_modules/`. Node 24 (with npm)
is already on this Mac and is not installed by this project. TypeScript stays on version 6.0, because the ESLint
rules for TypeScript do not support TypeScript 7 yet.

## 7. Rules for this folder

- It is a git repo on this Mac only. Nothing is pushed. Commits are made only when Iker asks.
- Model files, the test data, page pictures and results are never committed. `models/`, `models-hf/` and `dataset/` are ignored by git.
- No page, picture or text is sent to any cloud service.
