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

The test data is in `~/Workspace/lumimory/pdf-data/`, next to this folder. One folder is one test case:

```text
pdf-data/
  S1/
    input.pdf        one illustration
    template.json    the values to read from this PDF: the instruction for each one, and the correct answer
    pages/           the pictures of all pages (see part 4, "1. PDF -> Images")
      pdfium-2.1.13-200dpi/      one folder for each drawing tool, its version and its dots per inch
        1.png                    the number is the place of the page in the file, counted from 1
        2.png
    text-result/     the texts of the pages that an OCR model read (see part 4, 2.1)
      mlx-glm-bf16-1.json                          <name of the OCR setting>-<run number>.json
    value-result/    the results of the runs (see part 4, "The result file of a run")
      mlx-glm-bf16_ollama-qwen3.8-27b-1.json       <OCR setting>_<other setting>-<run number>.json
      mlx-glm-bf16_ollama-qwen3.8-27b-2.json
    S1.html          later: the report (see part 4, 3)
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

The `lumimory` folder is not a git repo, so the test data cannot be committed by accident. It must never be copied
into a git repo, and never sent to a cloud service.

Facts about the samples that are in `pdf-data` today are in `pdf-data/DATASET.md`, not here. This file must stay
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
    "expected": "US$708,740.00"
  },
  {
    "name": "Total Premium",
    "instruction": "Yearly Premium * Premium Term",
    "kind": "WorkedOut",
    "expected": "708,740.00"
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
| `expected` | The correct answer, as text. Only on `ReadFromPdf` and `WorkedOut` figures. `null` when the value cannot be read from this PDF by following the instruction. |

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
- A `WorkedOut` value is worked out from the `expected` values of the figures in its formula.
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
3. **The report in HTML** shows the results and compares them with `expected`. To be decided later.

One run of this flow uses two named settings: the setting of the OCR model, and the setting of the model that finds
and works out the values. A setting is explained in part 5.

### Two rules for every tool and every model

A tool or a model is only on the lists below when it passes both rules. There is no rule about the server: the
project has no requirement yet for the machine that will run the models. So we test the best models that run on
Iker's Mac.

1. **It runs on our own machine.** The files are downloaded one time. After that, it works with no internet. No
   page, picture, text or question goes to any server. In Ollama, a tag that ends in `cloud` breaks this rule: such
   a model runs on Ollama's servers.
2. **It is free, also inside a product that is sold.** The licence (the legal rule for using it) must allow this with
   no payment. Licences that pass: Apache 2.0, MIT, BSD, and NVIDIA's OpenMDW. The GPL licence passes only for a
   tool that we call as a separate program and do not build into our code. The AGPL licence does not pass.

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
  Cover = 10,000,000
  Yearly Premium = US$708,740.00
  Total Premium = 708,740.00
  ```

  All of them are given, not only the ones that the instruction names, so the program judges nothing. A value that
  was not found stands there as `null`. An item where a call failed is left out.
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
text-result/mlx-glm-bf16-1.json
```

The name of the setting already holds the model and its version (see "Named settings" in part 5). The run number
starts at 1. A new run number is a new reading of the pages with the same setting, to see if the OCR model writes
the same text again. A page text is made one time and then used by every run.

```json
{
  "run": 1,
  "setting": {
    "name": "mlx-glm-bf16",
    "model": "mlx-community/GLM-OCR-bf16",
    "dpi": 200,
    "options": { "temperature": 0, "seed": 1, "max_tokens": 8192 }
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

OCR models to try, checked online on 2026-09-21 against the two rules. The score is from OmniDocBench v1.6, a public
test of how well a model turns document pages into text (100 is perfect).

| Model | Size | Score | Licence | How to run it on the Mac |
|---|---|---|---|---|
| PaddleOCR-VL-1.6 | 0.9 billion parameters | 96.3, the best | Apache 2.0 | Not in Ollama. Runs with MLX (Apple's tool to run AI models); Paddle has a guide for it. |
| MinerU2.5-Pro | about 1 billion | 95.8 | Its own licence, built on Apache 2.0. Free, but a company with more than 20 million US dollars of revenue each month, or more than 100 million users each month, must buy a licence. | Not in Ollama. Not checked yet how it installs on the Mac. |
| GLM-OCR | 0.9 billion, 2.2 GB | 95.2 | MIT | With `mlx-vlm`, the way its makers say for a Mac: `mlx-community/GLM-OCR-bf16`. It passes the checks of "A model must run cleanly" there. The copy in Ollama (`glm-ocr`) does not: it never ends an answer in the normal way. Its public score was reached with the makers' full toolkit, which first cuts a page into pieces; the bare model has no prompt for a whole page. |
| DeepSeek-OCR | 3 billion, 6.7 GB | not in that test | MIT | In Ollama: `deepseek-ocr`. Its page says small changes in the question text can break the answer. |
| Granite-Docling (IBM) | 0.26 billion, 0.5 GB | not in that test | Apache 2.0 | In Ollama: `ibm/granite-docling`. It is the model inside Docling, IBM's free tool that turns documents into Markdown. It writes its own format, DocTags, that Docling turns into Markdown. |
| dots.mocr | about 3 billion | tested in another test | MIT | Not in Ollama. Not checked yet how it installs. |
| A general model that can see | 27 billion and up | lower than the small OCR models | see below | The models for Text -> Value that accept pictures can also read a page. Public tests say the small OCR models read documents better than these big ones. |

Taken off the list: Chandra OCR 2. Its licence limits the use in a product, so it breaks rule 2.

A parameter is one number inside an AI model. More parameters mean a bigger file, more memory and a slower answer.

**Text -> Value, the second model.** The model finds the value on the page. Our program does no thinking.

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

Models to try, checked online on 2026-09-21 against the two rules. All are in Ollama and run on the Mac (64 GB of
memory). The text of one page is short, so every one of them accepts it easily. The length a model accepts is called
its context window. It is counted in tokens; a token is a piece of a word. Ollama
uses a much smaller window unless we set it, so every Test must set it.

| Model | File size | Context window | Licence | Also takes pictures | Note |
|---|---|---|---|---|---|
| `qwen3.8:27b` (Alibaba) | 18 GB | 256,000 tokens | Apache 2.0 | yes | Already in `models/`. |
| `qwen3.6:35b` (Alibaba) | 23 GB | 256,000 | Apache 2.0, to be checked on the model's own page before the download | yes | |
| `gemma4:31b` (Google) | 20 GB | 256,000 | Apache 2.0 | yes | |
| `gemma4:12b` (Google) | 7.6 GB | 256,000 | Apache 2.0 | yes | A small model, to see how small still works. |
| `granite4.2:30b` (IBM) | 18 GB | 128,000 | Apache 2.0 | no | Built for business documents and JSON answers. |
| `granite4.2:8b` (IBM) | 5.3 GB | 128,000 | Apache 2.0 | no | A small model. |
| `muse-glimmer:30b` (Meta) | 18 GB | 128,000 | Apache 2.0 | yes | |
| `nemotron-3.5-lightning:30b` (NVIDIA) | 25 GB | 1,000,000 | OpenMDW-1.1, NVIDIA's own licence, free for a product | no | Only 3 of its 30 billion parameters work on each word, so it answers fast. |

Not allowed by rule 1: `glm-5.3-flash`, `deepseek-v4-flash`, `kimi-k3` and `minimax-m3`. They exist in Ollama only
with a `cloud` tag. They are also far too big for one machine.


### 2.2 `WorkedOut`

The instruction of a `WorkedOut` item is a formula over other items, for example "Yearly Premium * Premium Term" or
"Cover / Total Premium". A general model gets a fixed context text, the values that were found before, and the
instruction, and answers with the result, or with null when a value that the formula needs is missing. No page text
is given. Today the same model and the same setting are used as for Text -> Value; the setting holds one context
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
| `temperature` | A model writes its answer piece by piece. For each piece it has a list of possible next pieces, each with a chance. `temperature` says how freely it picks from this list. At 0 it always takes the piece with the highest chance, so the same question gives the same answer every time. At a higher number, for example 0.8, it sometimes takes a less likely piece, so two runs can give two different answers. | 0 as the normal case. We read values, we do not want creativity, and we want runs that can be repeated. One exception is known: see "Thinking and temperature" below. |
| `seed` | The start number of the random picking. With the same `seed`, the same question and the same settings, the model picks the same way again. | A fixed number, 1. At `temperature` 0 it changes nothing. At a higher `temperature` it makes a run repeatable. |
| `num_ctx` | The context window: how much text the model may take in at one time, counted in tokens. The context text, the text of the page, the instruction and the answer of the model (with its thinking, when thinking is on) must all fit in it. Ollama uses a small number by itself (about 4,000 tokens). **If the text is longer than `num_ctx`, Ollama cuts the text silently. There is no error. The model then never sees the end of the page and answers from what is left.** | Always set. High enough for the whole input plus the answer. The number of tokens of the input must be counted before the run, and the run must stop with an error when it does not fit. A bigger window needs more memory and makes the run slower. |
| `num_predict` | The most tokens the model may write in its answer. | Always set, high enough for the full answer (and for the thinking, when thinking is on). Without a limit, a confused model can write without end and the run never finishes. |
| `format` | Forces the shape of the answer. We give Ollama a description of the JSON that we want: a list of figures, each with `name` and `value`. The model then cannot write anything else: no sentence around the list, no half list. The values inside are still the model's own. | On. It removes answers that a program cannot read. It gives the model no hint about the values. |
| `think` | Many new models can think first: the model writes its reasoning for itself, and only then the answer. This is turned on or off. Thinking is slower, sometimes by many minutes. It usually helps on tasks with several steps, for example "the first year where the value reaches the total premium". Ollama gives the thinking text back apart from the answer. | A real choice, so it is tested: one Test with thinking on, one with thinking off, for each model that has the switch. The thinking text is saved, because it shows why a value is wrong. |

**Thinking and temperature.** Some makers say that their model must not run at `temperature` 0 when thinking is on.
Alibaba says this for the Qwen models: at 0 the thinking can fall into a loop and repeat the same sentences without
end. The maker then gives its own numbers (for Qwen about `temperature` 0.6 and `top_p` 0.95). So the rule is: 0 is
the normal case. When the maker of a model says otherwise for thinking, we use the maker's numbers for that Test.
The maker's numbers are read from the page of that exact model version before the run, never from memory. With a
`temperature` above 0 one run proves little, because the next run can differ. Such a Test is run several times
(this is what the run number in the file name is for), and we look if the values stay the same.

**Settings that we leave alone**

| Setting | What it does | Why we do not touch it |
|---|---|---|
| `top_k`, `top_p`, `min_p` | They make the list of possible next pieces shorter before the model picks. | At `temperature` 0 they do nothing. They are only set when a maker asks for it (see above). |
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
value-result/mlx-glm-bf16_ollama-qwen3.8-27b-1.json
```

One run holds two settings, so the file name holds both names, with `_` between them. A setting name can never hold
`_` itself. The run number starts at 1 and goes up every time the same two settings are run again on this test case.
A new run adds a new file. An old file is never changed.

```json
{
  "run": 1,
  "ocrSetting": { "name": "mlx-glm-bf16", "model": "mlx-community/GLM-OCR-bf16", "dpi": 200 },
  "ocrRunner": { "name": "mlx-vlm", "version": "0.7.1" },
  "text": "mlx-glm-bf16-1",
  "valueSetting": {
    "name": "ollama-qwen3.8-27b",
    "model": "qwen3.8:27b",
    "think": false,
    "readContext": "Below is the text of one page of an insurance illustration, ...",
    "workOutContext": "Below is an instruction with a formula, ...",
    "options": { "temperature": 0, "seed": 1, "num_ctx": 16384, "num_predict": 1000 }
  },
  "valueRunner": { "name": "ollama", "version": "0.34.2" },
  "startedAt": "2026-09-21T14:05:00+07:00",
  "seconds": 445,
  "results": [
    {
      "name": "Yearly Premium",
      "pages": [5],
      "instruction": "Total Single Premium (Single Pay)",
      "kind": "ReadFromPdf",
      "expected": "US$708,740.00",
      "value": "US$708,740.00",
      "foundOnPages": [5],
      "valuesGiven": "Currency = US Dollars\nPremium Term = Single Premium\nCover = 10,000,000",
      "calls": [
        {
          "pages": [5],
          "startedAt": "2026-09-21T14:05:40+07:00",
          "seconds": 8,
          "inputTokens": 1317,
          "outputTokens": 23,
          "contextLimit": 16384,
          "thinking": null,
          "answer": "US$708,740.00"
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
| `foundOnPages` | The page or pages whose text gave the value. `null` when `value` is `null`, and for a `WorkedOut` item. It differs from `pages` when the page was pushed forward or backward. |
| `valuesGiven` | The exact lines of the values that were found before, as they were given to the model for this item. |
| `calls` | The facts of every question that was asked for this item, in the order they were asked: one for the named page, and one more for each other page that was tried. `pages` is the page or pages whose text was sent (empty for a `WorkedOut` item). Then: when the question started, how long it took, the tokens that went in and came out, and the context window that was set. `thinking` is the thinking text of the model when thinking was on, else `null`. `answer` is what the model answered to this question. |

The file does not hold a score and does not say if a value is right or wrong. The report works that out when it is
built, so the way of comparing can change later without running the models again.

### 3. The report in HTML

To be decided later. What is known: it shows the results of the runs of one test case next to each other and
compares every `value` with `expected`, and it must show the text of a page next to the picture of that page. One
thing to solve: a browser does not let an HTML file read JSON files from the disk by itself, so either a command
builds the HTML with the data inside, or a small local server shows it.

Not decided yet:

- Which other OCR models are tried.
- Which other models for Text -> Value and `WorkedOut` are downloaded, and in which order they are tried. Each one is
  about 20 GB on the disk. And if `WorkedOut` should get a model of its own.
- The final words of the two context texts.
- The report in HTML.
- How to compare an answer with `expected` when only the writing differs ("US$708,740.00" against "708740").
- How a test case with pictures is made (see "Pictures inside a PDF").

## 5. The scripts

All scripts of the flow are written, except the report in HTML. To use them, run `npm install` one time in this
folder. The terminal must use Node 24 (`nvm use` reads `.nvmrc`). This project uses plain npm. It shares nothing with
the Lumimory client repo.

With npm, everything that a command gets must stand after ` -- ` when it holds an option with dashes:
`npm run generate:value -- ../pdf-data/S1 --ocr mlx-glm-bf16 --value ollama-qwen3.8-27b`.

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
| Not written yet: the report | Builds the HTML report of a test case from the files in `value-result/`. |

**The checks.**

| Command | What it is for |
|---|---|
| `npm run model:check <ocr setting> <picture file>` | Says if an OCR model runs cleanly: checks 1, 2, 3 and 5 of "A model must run cleanly" (part 4). It reads the picture two times and prints PASS or FAIL for each check. It writes no file. Run it for every new model and every new setting before any result of it counts. |
| `npm run model:check <value setting>` | The same for a model that finds values. It asks two times for one value on a small made-up page that is written inside the script, so it needs no test case. |
| `npm run tsc` | Checks the TypeScript code for type mistakes. It runs nothing. |
| `npm run lint` | Checks the code with ESLint, with the recommended rules for JavaScript and for TypeScript (`eslint.config.js`). It changes no file. |

`<test case>` is the path of a folder, for example `../pdf-data/S1`.

**One file for each model, and one contract.** A model is not only a name and some numbers. Each model has its own
behaviour: which words it wants with a picture, how many times a page must be sent, how its answers end, how its
answers become the text of a page. So everything that is special about a model lives in the file of that model, and
nowhere else. The general code knows no model.

```text
scripts/               the commands. One file is one command of package.json. They know no model.
  pages.ts             generate:pages
  value.ts             generate:value, the whole run
  text.ts              generate:text
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
    GlmOcr.ts          everything about the OCR model glm-ocr: its runner, its named settings, how it reads one page
    Qwen38.ts          everything about the model qwen3.8: its runner, its named settings, its two context texts, how
                       it is asked and how its answer is read
  TextResult.ts        the file of the page texts: open it, read a page into it, save it
  TestCase.ts          the paths inside the folder of one test case, and the pages that template.json names
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

- **The format of a name:** short, for example `mlx-glm-bf16`, `ollama-qwen3.8-27b-thinking`.
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

Not possible in TypeScript alone: the OCR models that are not in Ollama (PaddleOCR-VL, MinerU) are Python programs.
They can run as a small local server, and the same scripts can then talk to them. This is only needed when the OCR
models in Ollama are not good enough.

## 6. What is on this Mac for this project

**Everything that is installed or downloaded for this project gets a row in this table before it is installed or
downloaded.** Iker reads the row and says yes first. This is true for every program and for every model file.

| What | Where | Why | How to remove |
|---|---|---|---|
| Ollama 0.34.2 (upgraded from 0.33.3 on 2026-09-21 with `brew upgrade ollama`, because 0.33.3 did not close the answers of `glm-ocr` correctly) | installed with Homebrew | Runs AI models on this Mac. Homebrew also installed the `mlx` and `mlx-c` packages, which Ollama needs. It is not set to start by itself. | `brew uninstall ollama`, then `brew autoremove` |
| uv 0.12.11 | installed with Homebrew | Installs Python and Python packages inside a project folder only. | `brew uninstall uv` |
| Model files | `models/` in this folder | The AI models that Ollama runs. Start Ollama with `OLLAMA_MODELS` set to this folder. Each model in it has its own row below. `qwen3.8:27b` (17 GB), a model for step 2, was downloaded on 2026-09-19. | delete the folder |
| `mlx-vlm` 0.7.1, a Python program, with the Python packages it needs (575 MB), installed on 2026-09-21. It runs on Python 3.13, which was already on this Mac. | `runners/mlx-vlm/.venv/` in this folder, installed by `uv sync`. Ignored by git. | A runner for vision models on Apple chips. The makers of `glm-ocr` name it as the way to run their model on a Mac, because Ollama's copy of `glm-ocr` does not end its answers correctly. Licence: MIT. It runs as a local server; our TypeScript code talks to it. | delete `runners/mlx-vlm/.venv/` |
| Model `mlx-community/GLM-OCR-bf16`, 2.1 GB, downloaded on 2026-09-21 | `models-hf/` in this folder. Ignored by git. | The same `glm-ocr` model, in the file format of `mlx-vlm`. Downloaded from huggingface.co. Licence: MIT. | delete `models-hf/` |

The npm packages are not in this table. They are listed in `package.json`, with their versions, and they live only
in `node_modules/` in this folder, which is ignored by git. To remove them, delete `node_modules/`. Node 24 (with npm)
is already on this Mac and is not installed by this project. TypeScript stays on version 6.0, because the ESLint
rules for TypeScript do not support TypeScript 7 yet.

## 7. Rules for this folder

- It is a git repo on this Mac only. Nothing is pushed. Commits are made only when Iker asks.
- Model files, page pictures and results are never committed. `models/` is ignored by git.
- No page, picture or text is sent to any cloud service.
